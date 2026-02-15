/**
 * Group Secretary - AI-powered group message analyzer
 * 
 * Monitors WhatsApp group messages, detects requests/mentions,
 * identifies the responsible team member, and creates CRM tasks + popup alerts.
 * Supports external WhatsApp notifications.
 */

import { query } from '../db.js';
import { logInfo, logError } from '../logger.js';
import * as whatsappProvider from './whatsapp-provider.js';

/**
 * Analyze a group message with AI to detect requests and identify mentioned members
 */
export async function analyzeGroupMessage({
  organizationId,
  conversationId,
  messageContent,
  senderName,
  groupName,
}) {
  const startTime = Date.now();

  try {
    // 1. Get secretary config
    const configResult = await query(
      `SELECT * FROM group_secretary_config WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    if (configResult.rows.length === 0) return null;
    const config = configResult.rows[0];

    // 2. Check if this group should be monitored
    if (config.group_jids && config.group_jids.length > 0) {
      const convResult = await query(
        `SELECT remote_jid FROM conversations WHERE id = $1`,
        [conversationId]
      );
      const remoteJid = convResult.rows[0]?.remote_jid;
      if (remoteJid && !config.group_jids.includes(remoteJid)) {
        return null; // Group not monitored
      }
    }

    // 3. Get team members with aliases
    const membersResult = await query(
      `SELECT gsm.*, u.name as user_name, u.email
       FROM group_secretary_members gsm
       JOIN users u ON u.id = gsm.user_id
       WHERE gsm.organization_id = $1 AND gsm.is_active = true`,
      [organizationId]
    );

    if (membersResult.rows.length === 0) return null;

    const members = membersResult.rows;

    // 4. Get AI config (secretary override or org default)
    const aiConfig = await getAIConfig(organizationId, config);
    if (!aiConfig || !aiConfig.apiKey) {
      logInfo('group_secretary', 'No AI config available, skipping analysis');
      return null;
    }

    // 5. Build prompt with member context
    const membersList = members.map(m => {
      const aliases = m.aliases?.length ? m.aliases.join(', ') : 'nenhum';
      const depts = m.departments?.length ? m.departments.join(', ') : 'não definido';
      return `- ${m.user_name} (ID: ${m.user_id}) | Apelidos: ${aliases} | Áreas: ${depts} | Descrição: ${m.role_description || 'sem descrição'}`;
    }).join('\n');

    const systemPrompt = `Você é uma secretária virtual inteligente que monitora grupos de WhatsApp.
Sua função é analisar mensagens e detectar quando alguém está fazendo um pedido, solicitação, pergunta direcionada ou mencionando um responsável.

MEMBROS DA EQUIPE:
${membersList}

REGRAS:
1. Analise se a mensagem contém um pedido, solicitação, tarefa ou menção a algum membro
2. Identifique o membro responsável por:
   - Nome direto ou apelido
   - @menção do WhatsApp (ex: @João)
   - Contexto + cargo/área (ex: "preciso do financeiro" → membro da área financeira)
3. Se nenhum membro for identificado, retorne null para matched_user_id
4. Avalie a confiança da detecção de 0.0 a 1.0

Retorne SOMENTE um JSON válido:
{
  "is_request": true/false,
  "detected_request": "descrição do pedido/solicitação detectada",
  "matched_user_id": "UUID do membro ou null",
  "matched_user_name": "nome do membro ou null",
  "confidence": 0.0-1.0,
  "reason": "breve explicação da detecção"
}`;

    const userPrompt = `Grupo: ${groupName || 'Desconhecido'}
Remetente: ${senderName || 'Desconhecido'}
Mensagem: "${messageContent}"`;

    // 6. Call AI
    const aiResult = await callAI(aiConfig, systemPrompt, userPrompt);
    if (!aiResult) return null;

    const processingTime = Date.now() - startTime;

    // 7. Check confidence threshold
    if (!aiResult.is_request || aiResult.confidence < (config.min_confidence || 0.6)) {
      logInfo('group_secretary', `Message below threshold: confidence=${aiResult.confidence}, is_request=${aiResult.is_request}`);
      return null;
    }

    // 8. Validate matched user exists in our members list
    let matchedMember = null;
    if (aiResult.matched_user_id) {
      matchedMember = members.find(m => m.user_id === aiResult.matched_user_id);
      if (!matchedMember) {
        // AI might have made up an ID, try to match by name
        matchedMember = members.find(m =>
          m.user_name.toLowerCase().includes((aiResult.matched_user_name || '').toLowerCase())
        );
      }
    }

    // 9. Create CRM task if enabled
    let taskId = null;
    if (config.create_crm_task && matchedMember) {
      taskId = await createCRMTask({
        organizationId,
        assignedTo: matchedMember.user_id,
        title: `[Grupo] ${aiResult.detected_request || 'Nova solicitação'}`.slice(0, 255),
        description: `📱 Grupo: ${groupName || 'Desconhecido'}\n👤 Solicitante: ${senderName || 'Desconhecido'}\n💬 Mensagem: ${messageContent}\n\n🤖 Análise: ${aiResult.reason || ''}`,
      });
    }

    // 10. Create popup alert if enabled
    let alertId = null;
    if (config.show_popup_alert && matchedMember) {
      alertId = await createPopupAlert({
        userId: matchedMember.user_id,
        senderName: senderName || 'Alguém',
        groupName: groupName || 'Grupo',
        request: aiResult.detected_request || messageContent,
        conversationId,
      });
    }

    // 10b. Notify matched member via WhatsApp if enabled
    if (config.notify_members_whatsapp && matchedMember) {
      await notifyMatchedMember({
        organizationId,
        matchedUserId: matchedMember.user_id,
        matchedUserName: matchedMember.user_name,
        senderName: senderName || 'Alguém',
        groupName: groupName || 'Grupo',
        request: aiResult.detected_request || messageContent,
        confidence: aiResult.confidence,
        defaultConnectionId: config.default_connection_id,
      });
    }

    // 10c. Notify external WhatsApp number if enabled
    if (config.notify_external_enabled && config.notify_external_phone) {
      await notifyExternalNumber({
        organizationId,
        phone: config.notify_external_phone,
        senderName: senderName || 'Alguém',
        groupName: groupName || 'Grupo',
        request: aiResult.detected_request || messageContent,
        matchedUser: matchedMember?.user_name || 'Não identificado',
        confidence: aiResult.confidence,
        defaultConnectionId: config.default_connection_id,
      });
    }

    // 11. Log the detection
    await query(
      `INSERT INTO group_secretary_logs 
       (organization_id, conversation_id, message_content, sender_name, detected_request, 
        matched_user_id, matched_user_name, confidence, crm_task_id, alert_id, 
        ai_provider, ai_model, processing_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        organizationId, conversationId, messageContent?.slice(0, 1000), senderName,
        aiResult.detected_request?.slice(0, 500),
        matchedMember?.user_id || null, matchedMember?.user_name || aiResult.matched_user_name || null,
        aiResult.confidence, taskId, alertId,
        aiConfig.provider, aiConfig.model, processingTime,
      ]
    );

    logInfo('group_secretary', `Detection: request="${aiResult.detected_request}", user=${matchedMember?.user_name || 'none'}, confidence=${aiResult.confidence}, time=${processingTime}ms`);

    return {
      isRequest: true,
      detectedRequest: aiResult.detected_request,
      matchedUser: matchedMember ? { id: matchedMember.user_id, name: matchedMember.user_name } : null,
      confidence: aiResult.confidence,
      taskId,
      alertId,
    };
  } catch (error) {
    logError('group_secretary.analyze_error', error);
    return null;
  }
}

/**
 * Get AI configuration (secretary override → org default)
 */
async function getAIConfig(organizationId, config) {
  // Use secretary-specific config if available
  if (config.ai_api_key && config.ai_provider) {
    return {
      provider: config.ai_provider,
      model: config.ai_model || (config.ai_provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'),
      apiKey: config.ai_api_key,
    };
  }

  // Fallback to organization AI config
  const orgResult = await query(
    `SELECT ai_provider, ai_model, ai_api_key FROM organizations WHERE id = $1`,
    [organizationId]
  );

  const org = orgResult.rows[0];
  if (!org || !org.ai_api_key || org.ai_provider === 'none') return null;

  return {
    provider: org.ai_provider,
    model: org.ai_model || (org.ai_provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'),
    apiKey: org.ai_api_key,
  };
}

/**
 * Call AI provider (OpenAI or Gemini)
 */
async function callAI(config, systemPrompt, userPrompt) {
  try {
    let response;

    if (config.provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
      });
    } else if (config.provider === 'gemini') {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model || 'gemini-1.5-flash'}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 500,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
    } else {
      logError('group_secretary', new Error(`Unsupported AI provider: ${config.provider}`));
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      logError('group_secretary.ai_call', new Error(`AI API error ${response.status}: ${errorText}`));
      return null;
    }

    const data = await response.json();
    let content;

    if (config.provider === 'openai') {
      content = data.choices?.[0]?.message?.content;
    } else {
      content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!content) return null;

    return JSON.parse(content);
  } catch (error) {
    logError('group_secretary.ai_parse_error', error);
    return null;
  }
}

/**
 * Create a CRM task for the identified member
 */
async function createCRMTask({ organizationId, assignedTo, title, description }) {
  try {
    const result = await query(
      `INSERT INTO crm_tasks (organization_id, assigned_to, title, description, type, priority, status, due_date)
       VALUES ($1, $2, $3, $4, 'task', 'medium', 'pending', NOW() + INTERVAL '1 day')
       RETURNING id`,
      [organizationId, assignedTo, title, description]
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    logError('group_secretary.create_task_error', error);
    return null;
  }
}

/**
 * Create a popup alert for the identified member
 */
async function createPopupAlert({ userId, senderName, groupName, request, conversationId }) {
  try {
    const result = await query(
      `INSERT INTO user_alerts (user_id, type, title, message, metadata)
       VALUES ($1, 'group_secretary', $2, $3, $4)
       RETURNING id`,
      [
        userId,
        `📋 ${senderName} pediu algo no grupo "${groupName}"`,
        request?.slice(0, 500),
        JSON.stringify({ conversation_id: conversationId, source: 'group_secretary' }),
      ]
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    logError('group_secretary.create_alert_error', error);
    return null;
  }
}

/**
 * Notify the matched member via their personal WhatsApp
 */
async function notifyMatchedMember({ organizationId, matchedUserId, matchedUserName, senderName, groupName, request, confidence, defaultConnectionId }) {
  try {
    // Get user's phone
    const userResult = await query(
      `SELECT phone, whatsapp_phone FROM users WHERE id = $1`,
      [matchedUserId]
    );
    let phone = userResult.rows[0]?.whatsapp_phone || userResult.rows[0]?.phone;
    if (!phone) {
      logInfo('group_secretary', `No phone for user ${matchedUserName}, skipping WhatsApp notification`);
      return;
    }
    phone = phone.replace(/\D/g, '');
    if (!phone) return;

    const connection = await getNotificationConnection(organizationId, defaultConnectionId);
    if (!connection) return;

    const confPercent = Math.round((confidence || 0) * 100);
    const message = `📋 *Secretária IA - Solicitação para você*\n\n` +
      `📱 *Grupo:* ${groupName}\n` +
      `👤 *Solicitante:* ${senderName}\n` +
      `📊 *Confiança:* ${confPercent}%\n\n` +
      `💬 *Solicitação:*\n${(request || '').substring(0, 500)}`;

    await whatsappProvider.sendMessage(connection, phone, message, 'text', null);
    logInfo('group_secretary.member_notified', { phone, matchedUserName, groupName });
  } catch (error) {
    logError('group_secretary.notify_member_error', error);
  }
}

/**
 * Notify an external WhatsApp number about a detected request
 */
async function notifyExternalNumber({ organizationId, phone, senderName, groupName, request, matchedUser, confidence, defaultConnectionId }) {
  try {
    const connection = await getNotificationConnection(organizationId, defaultConnectionId);
    if (!connection) {
      logError('group_secretary.notify_external', new Error('No active connection found'));
      return;
    }

    const confPercent = Math.round((confidence || 0) * 100);

    const message = `📋 *Secretária IA - Detecção*\n\n` +
      `📱 *Grupo:* ${groupName}\n` +
      `👤 *Solicitante:* ${senderName}\n` +
      `🎯 *Responsável:* ${matchedUser}\n` +
      `📊 *Confiança:* ${confPercent}%\n\n` +
      `💬 *Solicitação:*\n${(request || '').substring(0, 500)}`;

    await whatsappProvider.sendMessage(connection, phone, message, 'text', null);
    logInfo('group_secretary.external_notified', { phone, groupName });
  } catch (error) {
    logError('group_secretary.notify_external_error', error);
  }
}

/**
 * Get the connection to use for sending notifications (default or first available)
 */
async function getNotificationConnection(organizationId, defaultConnectionId) {
  try {
    if (defaultConnectionId) {
      const result = await query(
        `SELECT * FROM connections WHERE id = $1 AND organization_id = $2 AND status = 'connected'`,
        [defaultConnectionId, organizationId]
      );
      if (result.rows.length > 0) return result.rows[0];
    }
    // Fallback: first active connection
    const result = await query(
      `SELECT * FROM connections WHERE organization_id = $1 AND status = 'connected' ORDER BY created_at ASC LIMIT 1`,
      [organizationId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logError('group_secretary.get_connection_error', error);
    return null;
  }
}
