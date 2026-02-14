/**
 * AI Agent Processor for Real WhatsApp Chat
 * 
 * Handles incoming messages through AI agents:
 * 1. Checks if conversation has an active agent session
 * 2. If not, checks if connection has a linked agent (via ai_agent_connections)
 * 3. Validates mode (always, business_hours, keywords)
 * 4. Creates/continues session, processes with tools, sends response
 * 5. Handles handoff keywords and failure counting
 */

import { query } from '../db.js';
import { callAI, callAIWithTools } from './ai-caller.js';
import { logInfo, logError } from '../logger.js';
import * as whatsappProvider from './whatsapp-provider.js';

// ==================== MAIN ENTRY POINT ====================

/**
 * Process an incoming message through AI agent if applicable
 * @param {Object} params
 * @param {Object} params.connection - The WhatsApp connection object
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.contactPhone - Contact phone number
 * @param {string} params.contactName - Contact display name
 * @param {string} params.messageContent - Text content of the message
 * @param {string} params.messageType - 'text', 'image', 'audio', etc.
 * @returns {Object} { handled: boolean, agentId?: string, response?: string }
 */
export async function processIncomingWithAgent({
  connection,
  conversationId,
  contactPhone,
  contactName,
  messageContent,
  messageType,
  mediaUrl,
  mediaMimetype,
  mediaFilename,
}) {
  try {
    // Supported message types
    const supportedTypes = ['text', 'image', 'audio', 'video', 'document', 'sticker'];
    if (!supportedTypes.includes(messageType)) {
      return { handled: false };
    }
    // Need at least content or media
    if (!messageContent && !mediaUrl && messageType === 'text') {
      return { handled: false };
    }

    const organizationId = connection.organization_id;
    if (!organizationId) return { handled: false };

    // 1. Check for active session first
    let session = await getActiveSession(conversationId);

    // 1.1 If session exists but is paused or human-taken-over, skip AI processing
    if (session) {
      if (session.human_takeover) {
        logInfo('ai_agent_processor.human_takeover_active', { conversationId });
        return { handled: false, reason: 'human_takeover' };
      }
      if (session.paused_until && new Date(session.paused_until) > new Date()) {
        logInfo('ai_agent_processor.session_paused', { conversationId, paused_until: session.paused_until });
        return { handled: false, reason: 'paused' };
      }
      // If paused_until has expired, clear it
      if (session.paused_until && new Date(session.paused_until) <= new Date()) {
        await query(`UPDATE ai_agent_sessions SET paused_until = NULL WHERE id = $1`, [session.id]);
      }
    }

    // 2. If no active session, check if an agent is linked to this connection
    if (!session) {
      const agent = await findAgentForConnection(connection.id, messageContent);
      if (!agent) return { handled: false };

      // Create a new session
      session = await createSession(agent.id, conversationId, contactPhone, contactName);
      logInfo('ai_agent_processor.session_created', {
        sessionId: session.id,
        agentId: agent.id,
        conversationId,
        contactPhone,
      });

      // Send greeting message if configured and it's a brand new session
      if (agent.greeting_message) {
        await sendAgentMessage(connection, contactPhone, agent.greeting_message, session.id);
        // Save greeting as agent message
        await saveAgentMessage(session.id, 'assistant', agent.greeting_message, 0);
      }
    }

    // 3. Load the agent
    const agentResult = await query(
      `SELECT * FROM ai_agents WHERE id = $1 AND is_active = true`,
      [session.agent_id]
    );

    if (agentResult.rows.length === 0) {
      // Agent was deactivated, end session
      await endSession(session.id, 'agent_deactivated');
      return { handled: false };
    }

    const agent = agentResult.rows[0];

    // 4. Check handoff keywords (only for text messages)
    const handoffKeywords = parseArray(agent.handoff_keywords, ['humano', 'atendente', 'pessoa']);
    if (messageContent && messageType === 'text') {
      const lowerContent = messageContent.toLowerCase();
      const handoffTriggered = handoffKeywords.some(kw => lowerContent.includes(kw.toLowerCase()));

      if (handoffTriggered) {
        await handleHandoff(session, agent, connection, contactPhone);
        return { handled: true, agentId: agent.id, response: agent.handoff_message };
      }
    }

    // 5. Process media content - build a user message with context
    let userMessageForHistory = messageContent || '';
    let userMessageForAI = null; // Will be a string or multimodal content array

    if (messageType === 'audio' && mediaUrl) {
      // Transcribe audio using Lovable AI
      const transcript = await transcribeAudio(mediaUrl, mediaMimetype);
      if (transcript) {
        userMessageForHistory = `[Áudio transcrito]: ${transcript}`;
        userMessageForAI = transcript;
      } else {
        userMessageForHistory = messageContent || '[Mensagem de áudio recebida - não foi possível transcrever]';
        userMessageForAI = userMessageForHistory;
      }
    } else if (messageType === 'image' && mediaUrl) {
      const caption = messageContent || '';
      userMessageForHistory = caption ? `[Imagem com legenda]: ${caption}` : '[Imagem recebida]';
      // Build multimodal message for AI
      userMessageForAI = buildImageMessage(mediaUrl, caption);
    } else if (messageType === 'video' && mediaUrl) {
      const caption = messageContent || '';
      userMessageForHistory = caption ? `[Vídeo com legenda]: ${caption}` : '[Vídeo recebido]';
      userMessageForAI = caption || '[O cliente enviou um vídeo. Responda reconhecendo o recebimento do vídeo.]';
    } else if (messageType === 'document' && mediaUrl) {
      const filename = mediaFilename || 'documento';
      userMessageForHistory = messageContent 
        ? `[Documento: ${filename}]: ${messageContent}` 
        : `[Documento recebido: ${filename}]`;
      userMessageForAI = userMessageForHistory;
    } else if (messageType === 'sticker') {
      userMessageForHistory = '[Sticker recebido]';
      userMessageForAI = '[O cliente enviou um sticker/figurinha. Responda de forma leve e amigável.]';
    } else {
      userMessageForAI = messageContent;
    }

    // 5b. Save user message to history
    await saveAgentMessage(session.id, 'user', userMessageForHistory, 0);

    // 6. Build conversation history from session
    const history = await getSessionHistory(session.id, agent.context_window || 10);

    // 7. Build system prompt with knowledge base
    const systemPrompt = await buildSystemPrompt(agent, organizationId, contactName);

    // 8. Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    // Add current user message (might be multimodal for images)
    if (Array.isArray(userMessageForAI)) {
      messages.push({ role: 'user', content: userMessageForAI });
    } else {
      messages.push({ role: 'user', content: userMessageForAI || userMessageForHistory });
    }

    // 9. Build tools based on capabilities
    const capabilities = parseArray(agent.capabilities, ['respond_messages']);
    const tools = await buildToolsForAgent(agent, capabilities, organizationId);

    // 10. Get AI config
    const aiConfig = await getAgentAIConfig(agent, organizationId);

    // 11. Call AI
    let result;
    let toolCallsExecuted = [];
    const startTime = Date.now();

    const userId = agent.default_user_id || agent.created_by;

    if (tools.length > 0) {
      const toolExecutor = createToolExecutor(organizationId, userId);
      result = await callAIWithTools(aiConfig, messages, {
        temperature: agent.temperature || 0.7,
        maxTokens: agent.max_tokens || 1000,
        tools,
      }, toolExecutor);
      toolCallsExecuted = result.toolCallsExecuted || [];
    } else {
      result = await callAI(aiConfig, messages, {
        temperature: agent.temperature || 0.7,
        maxTokens: agent.max_tokens || 1000,
      });
    }

    const responseTime = Date.now() - startTime;
    const responseText = result.content || agent.fallback_message || 'Desculpe, não consegui processar sua mensagem.';

    // 12. Save assistant message
    await saveAgentMessage(session.id, 'assistant', responseText, result.tokensUsed || 0, toolCallsExecuted);

    // 13. Send response via WhatsApp
    await sendAgentMessage(connection, contactPhone, responseText, session.id);

    // 14. Update session stats
    await updateSessionStats(session.id, result.tokensUsed || 0, responseTime);

    // 15. Update agent stats
    await updateAgentStats(agent.id, result.tokensUsed || 0, responseTime, toolCallsExecuted);

    // 16. Check failure count (if response was fallback)
    if (!result.content && agent.auto_handoff_after_failures > 0) {
      const failCount = await incrementFailureCount(session.id);
      if (failCount >= agent.auto_handoff_after_failures) {
        await handleHandoff(session, agent, connection, contactPhone, 'auto_failure_limit');
      }
    }

    logInfo('ai_agent_processor.message_processed', {
      sessionId: session.id,
      agentId: agent.id,
      tokensUsed: result.tokensUsed,
      toolCalls: toolCallsExecuted.length,
      responseTimeMs: responseTime,
    });

    return {
      handled: true,
      agentId: agent.id,
      response: responseText,
    };
  } catch (error) {
    logError('ai_agent_processor.process_error', error);
    return { handled: false, error: error.message };
  }
}

// ==================== SESSION MANAGEMENT ====================

async function getActiveSession(conversationId) {
  const result = await query(
    `SELECT * FROM ai_agent_sessions 
     WHERE conversation_id = $1 AND is_active = true 
     ORDER BY started_at DESC LIMIT 1`,
    [conversationId]
  );
  return result.rows[0] || null;
}

async function createSession(agentId, conversationId, contactPhone, contactName) {
  const result = await query(
    `INSERT INTO ai_agent_sessions (agent_id, conversation_id, contact_phone, contact_name)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [agentId, conversationId, contactPhone, contactName]
  );
  return result.rows[0];
}

async function endSession(sessionId, reason) {
  await query(
    `UPDATE ai_agent_sessions 
     SET is_active = false, ended_at = NOW(), handoff_reason = COALESCE(handoff_reason, $2)
     WHERE id = $1`,
    [sessionId, reason]
  );
}

async function updateSessionStats(sessionId, tokensUsed, responseTimeMs) {
  await query(
    `UPDATE ai_agent_sessions 
     SET message_count = message_count + 2, 
         last_interaction_at = NOW()
     WHERE id = $1`,
    [sessionId]
  );
}

async function incrementFailureCount(sessionId) {
  const result = await query(
    `UPDATE ai_agent_sessions 
     SET failure_count = failure_count + 1 
     WHERE id = $1 RETURNING failure_count`,
    [sessionId]
  );
  return result.rows[0]?.failure_count || 0;
}

// ==================== AGENT MESSAGE HISTORY ====================

async function saveAgentMessage(sessionId, role, content, totalTokens, toolCalls) {
  await query(
    `INSERT INTO ai_agent_messages (session_id, role, content, total_tokens, tool_calls)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, role, content, totalTokens || 0, toolCalls ? JSON.stringify(toolCalls) : null]
  );
}

async function getSessionHistory(sessionId, contextWindow) {
  const result = await query(
    `SELECT role, content FROM ai_agent_messages 
     WHERE session_id = $1 AND role IN ('user', 'assistant')
     ORDER BY created_at DESC 
     LIMIT $2`,
    [sessionId, contextWindow]
  );
  // Reverse to get chronological order
  return result.rows.reverse();
}

// ==================== AGENT RESOLUTION ====================

/**
 * Find the appropriate agent for a connection, checking mode and schedule
 */
async function findAgentForConnection(connectionId, messageContent) {
  const result = await query(
    `SELECT a.*, ac.mode, ac.trigger_keywords, 
            ac.business_hours_start, ac.business_hours_end, ac.business_days
     FROM ai_agent_connections ac
     JOIN ai_agents a ON a.id = ac.agent_id
     WHERE ac.connection_id = $1 AND ac.is_active = true AND a.is_active = true
     ORDER BY ac.priority DESC
     LIMIT 5`,
    [connectionId]
  );

  for (const agent of result.rows) {
    if (shouldActivateAgent(agent, messageContent)) {
      return agent;
    }
  }

  return null;
}

function shouldActivateAgent(agentConn, messageContent) {
  const { mode, trigger_keywords, business_hours_start, business_hours_end, business_days } = agentConn;

  if (mode === 'always') return true;

  if (mode === 'business_hours') {
    return isWithinBusinessHours(business_hours_start, business_hours_end, business_days);
  }

  if (mode === 'keywords') {
    const keywords = parseArray(trigger_keywords, []);
    if (keywords.length === 0) return false;
    const lower = (messageContent || '').toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  return false;
}

function isWithinBusinessHours(startTime, endTime, businessDays) {
  const now = new Date();
  const dayOfWeek = now.getDay();

  const days = parseArray(businessDays, [1, 2, 3, 4, 5]);
  if (!days.includes(dayOfWeek)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (startTime || '08:00').split(':').map(Number);
  const [endH, endM] = (endTime || '18:00').split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  return currentMinutes >= start && currentMinutes < end;
}

// ==================== HANDOFF ====================

async function handleHandoff(session, agent, connection, contactPhone, reason) {
  // End the session
  await query(
    `UPDATE ai_agent_sessions 
     SET is_active = false, handoff_requested = true, handoff_at = NOW(), 
         handoff_reason = $2, ended_at = NOW()
     WHERE id = $1`,
    [session.id, reason || 'keyword_trigger']
  );

  // Send handoff message
  const handoffMsg = agent.handoff_message || 'Vou transferir você para um atendente humano. Aguarde um momento.';
  await sendAgentMessage(connection, contactPhone, handoffMsg, session.id);

  // Transfer to department/user if configured
  if (agent.default_department_id || agent.default_user_id) {
    const updates = [];
    const params = [];
    let idx = 1;

    if (agent.default_department_id) {
      updates.push(`department_id = $${idx++}`);
      params.push(agent.default_department_id);
    }
    if (agent.default_user_id) {
      updates.push(`assigned_to = $${idx++}`);
      params.push(agent.default_user_id);
    }
    updates.push(`attendance_status = 'waiting'`);

    params.push(session.conversation_id);
    await query(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${idx}`,
      params
    ).catch(err => logError('ai_agent_processor.handoff_assign_error', err));
  }

  logInfo('ai_agent_processor.handoff', {
    sessionId: session.id,
    agentId: agent.id,
    reason,
  });
}

// ==================== SEND MESSAGE ====================

async function sendAgentMessage(connection, contactPhone, text, sessionId) {
  try {
    const result = await whatsappProvider.sendMessage(connection, contactPhone, text, 'text', null);

    if (result.success) {
      // Save outgoing message to chat_messages so it appears in the chat
      const conversationResult = await query(
        `SELECT id FROM conversations WHERE connection_id = $1 AND contact_phone = $2 LIMIT 1`,
        [connection.id, contactPhone]
      );
      
      if (conversationResult.rows[0]) {
        await query(
          `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, from_me, status, timestamp)
           VALUES ($1, $2, $3, 'text', true, 'sent', NOW())`,
          [conversationResult.rows[0].id, result.messageId || `ai-agent-${Date.now()}`, text]
        );
      }
    } else {
      logError('ai_agent_processor.send_failed', new Error(result.error || 'Send failed'));
    }

    return result;
  } catch (error) {
    logError('ai_agent_processor.send_error', error);
    return { success: false, error: error.message };
  }
}

// ==================== SYSTEM PROMPT ====================

async function buildSystemPrompt(agent, organizationId, contactName) {
  let prompt = agent.system_prompt || 'Você é um assistente virtual profissional e prestativo.';

  // Add personality traits
  const traits = parseArray(agent.personality_traits, []);
  if (traits.length > 0) {
    prompt += `\n\nTraços de personalidade: ${traits.join(', ')}`;
  }

  // Add knowledge base
  const knowledgeResult = await query(
    `SELECT source_content FROM ai_knowledge_sources WHERE agent_id = $1 AND is_active = true ORDER BY priority DESC`,
    [agent.id]
  );

  if (knowledgeResult.rows.length > 0) {
    const knowledgeContext = knowledgeResult.rows.map(k => k.source_content).join('\n\n');
    prompt += `\n\nBase de Conhecimento (use estas informações para responder):\n${knowledgeContext}`;
  }

  // Add context about the contact
  if (contactName) {
    prompt += `\n\nVocê está conversando com: ${contactName}`;
  }

  // Add language instruction
  prompt += `\n\nResponda sempre em ${agent.language || 'pt-BR'}.`;

  // Add handoff instruction
  const handoffKeywords = parseArray(agent.handoff_keywords, []);
  if (handoffKeywords.length > 0) {
    prompt += `\n\nSe o cliente pedir para falar com um humano ou atendente, responda educadamente que irá transferir.`;
  }

  return prompt;
}

// ==================== TOOLS ====================

// Import tool builders from ai-agents route - we re-export them here
// Since the tool builders are defined in ai-agents.js, we recreate them here
// to avoid circular dependencies

async function buildToolsForAgent(agent, capabilities, organizationId) {
  const tools = [];

  if (capabilities.includes('create_deals')) {
    const funnelsResult = await query(
      `SELECT f.id, f.name, json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.position) as stages
       FROM crm_funnels f
       JOIN crm_stages s ON s.funnel_id = f.id
       WHERE f.organization_id = $1
       GROUP BY f.id, f.name`,
      [organizationId]
    );
    if (funnelsResult.rows.length > 0) {
      tools.push(buildCreateDealTool(funnelsResult.rows));
    }
  }

  if (capabilities.includes('manage_tasks')) {
    tools.push(buildManageTasksTool());
  }

  if (capabilities.includes('qualify_leads')) {
    tools.push(buildQualifyLeadsTool());
  }

  if (capabilities.includes('summarize_history')) {
    tools.push(buildSummarizeHistoryTool());
  }

  if (capabilities.includes('schedule_meetings')) {
    tools.push(buildScheduleMeetingsTool());
  }

  if (capabilities.includes('google_calendar')) {
    tools.push(buildGoogleCalendarTool());
  }

  if (capabilities.includes('suggest_actions')) {
    tools.push(buildSuggestActionsTool());
  }

  if (capabilities.includes('generate_content')) {
    tools.push(buildGenerateContentTool());
  }

  if (capabilities.includes('call_agent')) {
    const callConfig = typeof agent.call_agent_config === 'string'
      ? JSON.parse(agent.call_agent_config || '{}')
      : (agent.call_agent_config || {});

    let agentFilter = `organization_id = $1 AND id != $2 AND is_active = true`;
    const params = [organizationId, agent.id];
    if (!callConfig.allow_all && callConfig.allowed_agent_ids?.length > 0) {
      agentFilter += ` AND id = ANY($3)`;
      params.push(callConfig.allowed_agent_ids);
    }

    const otherAgentsResult = await query(
      `SELECT id, name, description, system_prompt FROM ai_agents WHERE ${agentFilter}`,
      params
    );

    if (otherAgentsResult.rows.length > 0) {
      tools.push(buildCallAgentTool(otherAgentsResult.rows));
    }
  }

  return tools;
}

// ==================== TOOL DEFINITIONS (mirrored from ai-agents.js) ====================

function buildCreateDealTool(funnels) {
  const funnelDesc = funnels.map(f => `- Funil "${f.name}" (id: ${f.id}), etapas: ${f.stages.map(s => `"${s.name}" (id: ${s.id})`).join(', ')}`).join('\n');
  return {
    type: 'function',
    function: {
      name: 'create_deal',
      description: `Cria um novo negócio/deal no CRM. Funis disponíveis:\n${funnelDesc}`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título do negócio' },
          value: { type: 'number', description: 'Valor do negócio em reais' },
          funnel_id: { type: 'string', description: 'ID do funil' },
          stage_id: { type: 'string', description: 'ID da etapa no funil' },
          description: { type: 'string', description: 'Descrição do negócio' },
        },
        required: ['title', 'funnel_id', 'stage_id'],
      },
    },
  };
}

function buildManageTasksTool() {
  return {
    type: 'function',
    function: {
      name: 'manage_tasks',
      description: 'Cria ou lista tarefas no CRM.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list'] },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          type: { type: 'string', enum: ['task', 'call', 'meeting', 'email', 'follow_up'] },
          due_date: { type: 'string' },
        },
        required: ['action'],
      },
    },
  };
}

function buildQualifyLeadsTool() {
  return {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'Qualifica um lead com pontuação de 0 a 100.',
      parameters: {
        type: 'object',
        properties: {
          score: { type: 'number' },
          qualification: { type: 'string', enum: ['cold', 'warm', 'hot', 'very_hot'] },
          reasoning: { type: 'string' },
          recommended_action: { type: 'string' },
        },
        required: ['score', 'qualification', 'reasoning'],
      },
    },
  };
}

function buildSummarizeHistoryTool() {
  return {
    type: 'function',
    function: {
      name: 'summarize_conversation',
      description: 'Gera um resumo da conversa.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          key_points: { type: 'string' },
          customer_sentiment: { type: 'string', enum: ['very_negative', 'negative', 'neutral', 'positive', 'very_positive'] },
          next_steps: { type: 'string' },
        },
        required: ['summary', 'key_points', 'customer_sentiment'],
      },
    },
  };
}

function buildScheduleMeetingsTool() {
  return {
    type: 'function',
    function: {
      name: 'schedule_meeting',
      description: 'Agenda uma reunião criando tarefa no CRM.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string' },
          duration_minutes: { type: 'number' },
          attendees: { type: 'string' },
          location: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['title', 'date'],
      },
    },
  };
}

function buildGoogleCalendarTool() {
  return {
    type: 'function',
    function: {
      name: 'google_calendar_event',
      description: `Gerencia agenda inteligente. Ações:
- "find_available_slots": Busca horários livres respeitando horário comercial.
- "create": Cria evento verificando conflitos.
- "list": Lista próximos eventos.`,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'find_available_slots'] },
          title: { type: 'string' },
          start_time: { type: 'string' },
          end_time: { type: 'string' },
          description: { type: 'string' },
          duration_minutes: { type: 'number' },
          days_ahead: { type: 'number' },
          preferred_period: { type: 'string', enum: ['morning', 'afternoon', 'any'] },
        },
        required: ['action'],
      },
    },
  };
}

function buildSuggestActionsTool() {
  return {
    type: 'function',
    function: {
      name: 'suggest_actions',
      description: 'Sugere próximas ações com base no contexto da conversa.',
      parameters: {
        type: 'object',
        properties: {
          suggestions: { type: 'string' },
          urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
          context_summary: { type: 'string' },
          category: { type: 'string', enum: ['sales', 'support', 'follow_up', 'upsell', 'retention', 'general'] },
        },
        required: ['suggestions', 'urgency', 'context_summary'],
      },
    },
  };
}

function buildGenerateContentTool() {
  return {
    type: 'function',
    function: {
      name: 'generate_content',
      description: 'Gera conteúdo de texto como follow-ups, propostas, emails.',
      parameters: {
        type: 'object',
        properties: {
          content_type: { type: 'string', enum: ['follow_up_message', 'proposal', 'email', 'call_script', 'whatsapp_template', 'other'] },
          title: { type: 'string' },
          content: { type: 'string' },
          tone: { type: 'string', enum: ['formal', 'informal', 'professional', 'friendly', 'persuasive'] },
        },
        required: ['content_type', 'title', 'content'],
      },
    },
  };
}

function buildCallAgentTool(availableAgents) {
  const agentDescriptions = availableAgents.map(a => `- ${a.name}: ${a.description || 'Agente especialista'}`).join('\n');
  return {
    type: 'function',
    function: {
      name: 'consult_specialist_agent',
      description: `Consulta outro agente especialista.\n${agentDescriptions}`,
      parameters: {
        type: 'object',
        properties: {
          agent_name: { type: 'string' },
          question: { type: 'string' },
        },
        required: ['agent_name', 'question'],
      },
    },
  };
}

// ==================== TOOL EXECUTOR ====================

function createToolExecutor(organizationId, userId) {
  return async (toolName, args) => {
    switch (toolName) {
      case 'create_deal':
        return executeCreateDeal(organizationId, userId, args);
      case 'manage_tasks':
        return executeManageTasks(organizationId, userId, args);
      case 'qualify_lead':
        return executeQualifyLead(organizationId, args);
      case 'summarize_conversation':
        return executeSummarizeHistory(args);
      case 'schedule_meeting':
        return executeScheduleMeeting(organizationId, userId, args);
      case 'google_calendar_event':
        return executeGoogleCalendar(organizationId, userId, args);
      case 'suggest_actions':
        return executeSuggestActions(args);
      case 'generate_content':
        return executeGenerateContent(args);
      case 'consult_specialist_agent':
        return executeCallAgent(organizationId, args.agent_name, args.question);
      default:
        return 'Ferramenta desconhecida';
    }
  };
}

// ==================== TOOL EXECUTORS ====================

async function executeCreateDeal(organizationId, userId, args) {
  try {
    const result = await query(`
      INSERT INTO crm_deals (organization_id, funnel_id, stage_id, title, value, description, created_by, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      RETURNING id, title, value
    `, [organizationId, args.funnel_id, args.stage_id, args.title, args.value || 0, args.description || null, userId]);
    const deal = result.rows[0];
    return `Negócio "${deal.title}" criado (ID: ${deal.id}, R$ ${deal.value})`;
  } catch (error) {
    return `Erro ao criar negócio: ${error.message}`;
  }
}

async function executeManageTasks(organizationId, userId, args) {
  try {
    if (args.action === 'create') {
      if (!args.title) return 'Título da tarefa é obrigatório';
      const result = await query(`
        INSERT INTO crm_tasks (organization_id, assigned_to, created_by, title, description, type, priority, due_date)
        VALUES ($1, $2, $2, $3, $4, $5, $6, $7)
        RETURNING id, title, priority, due_date
      `, [organizationId, userId, args.title, args.description || null, args.type || 'task', args.priority || 'medium', args.due_date || null]);
      const task = result.rows[0];
      return `Tarefa "${task.title}" criada (prioridade: ${task.priority})`;
    } else {
      const result = await query(`
        SELECT id, title, priority, type, due_date, status FROM crm_tasks
        WHERE organization_id = $1 AND status IN ('pending', 'in_progress')
        ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
        LIMIT 10
      `, [organizationId]);
      if (result.rows.length === 0) return 'Nenhuma tarefa pendente.';
      return result.rows.map(t => `- [${t.priority}] ${t.title} (${t.type})`).join('\n');
    }
  } catch (error) {
    return `Erro: ${error.message}`;
  }
}

async function executeQualifyLead(organizationId, args) {
  logInfo('ai_agent_processor.qualify_lead', { score: args.score, qualification: args.qualification });
  return JSON.stringify({ score: args.score, qualification: args.qualification, reasoning: args.reasoning });
}

async function executeSummarizeHistory(args) {
  return JSON.stringify({
    summary: args.summary,
    key_points: (args.key_points || '').split('|').map(s => s.trim()).filter(Boolean),
    customer_sentiment: args.customer_sentiment,
  });
}

async function executeScheduleMeeting(organizationId, userId, args) {
  try {
    const result = await query(`
      INSERT INTO crm_tasks (organization_id, assigned_to, created_by, title, description, type, priority, due_date)
      VALUES ($1, $2, $2, $3, $4, 'meeting', 'high', $5)
      RETURNING id, title, due_date
    `, [organizationId, userId, args.title,
      `Participantes: ${args.attendees || 'A definir'}\nLocal: ${args.location || 'A definir'}\nDuração: ${args.duration_minutes || 60}min\n${args.notes || ''}`.trim(),
      args.date
    ]);
    return `Reunião "${result.rows[0].title}" agendada para ${result.rows[0].due_date}`;
  } catch (error) {
    return `Erro: ${error.message}`;
  }
}

async function executeGoogleCalendar(organizationId, userId, args) {
  try {
    if (args.action === 'find_available_slots') {
      const daysAhead = args.days_ahead || 7;
      const schedule = await getWorkSchedule(organizationId);
      const slotDuration = args.duration_minutes || schedule.slot_duration_minutes;
      const slots = await findAvailableSlots(organizationId, daysAhead, slotDuration, args.preferred_period, schedule);
      
      if (slots.length === 0) return `Nenhum horário disponível nos próximos ${daysAhead} dias.`;
      
      const slotList = slots.map((s, i) => `${i + 1}. ${s.day_of_week} ${s.date} das ${s.start} às ${s.end}`).join('\n');
      return `Horários disponíveis:\n${slotList}`;
    }
    
    if (args.action === 'create') {
      if (!args.title || !args.start_time) return 'Título e horário são obrigatórios.';
      
      // Check conflicts
      const conflictResult = await query(`
        SELECT id, title, due_date FROM crm_tasks
        WHERE organization_id = $1 AND type = 'meeting' AND status = 'pending'
          AND due_date >= $2::timestamp - interval '1 hour'
          AND due_date <= $2::timestamp + interval '1 hour'
      `, [organizationId, args.start_time]);
      
      if (conflictResult.rows.length > 0) {
        return `⚠️ Conflito com: ${conflictResult.rows.map(c => `"${c.title}"`).join(', ')}. Use find_available_slots.`;
      }
      
      const result = await query(`
        INSERT INTO crm_tasks (organization_id, assigned_to, created_by, title, description, type, priority, due_date)
        VALUES ($1, $2, $2, $3, $4, 'meeting', 'medium', $5)
        RETURNING id, title, due_date
      `, [organizationId, userId, args.title, args.description || '', args.start_time]);
      
      return `✅ Evento "${result.rows[0].title}" agendado para ${args.start_time}`;
    }
    
    // List
    const daysAhead = args.days_ahead || 7;
    const result = await query(`
      SELECT title, due_date FROM crm_tasks
      WHERE organization_id = $1 AND type = 'meeting' AND status = 'pending'
        AND due_date >= NOW() AND due_date <= NOW() + interval '1 day' * $2
      ORDER BY due_date ASC LIMIT 15
    `, [organizationId, daysAhead]);
    if (result.rows.length === 0) return 'Nenhum evento nos próximos dias.';
    return result.rows.map(e => `- ${e.title} (${e.due_date})`).join('\n');
  } catch (error) {
    return `Erro: ${error.message}`;
  }
}

async function executeSuggestActions(args) {
  return JSON.stringify({
    suggestions: (args.suggestions || '').split('|').map(s => s.trim()).filter(Boolean),
    urgency: args.urgency,
    context_summary: args.context_summary,
  });
}

async function executeGenerateContent(args) {
  return JSON.stringify({
    content_type: args.content_type,
    title: args.title,
    content: args.content,
    tone: args.tone || 'professional',
  });
}

async function executeCallAgent(organizationId, agentName, question) {
  try {
    const agentResult = await query(
      `SELECT * FROM ai_agents WHERE organization_id = $1 AND name ILIKE $2 AND is_active = true LIMIT 1`,
      [organizationId, `%${agentName}%`]
    );
    if (agentResult.rows.length === 0) return `Agente "${agentName}" não encontrado.`;

    const specialist = agentResult.rows[0];
    const aiConfig = await getAgentAIConfig(specialist, organizationId);

    const knowledgeResult = await query(
      `SELECT source_content FROM ai_knowledge_sources WHERE agent_id = $1 AND is_active = true ORDER BY priority DESC`,
      [specialist.id]
    );
    const knowledgeContext = knowledgeResult.rows.map(k => k.source_content).join('\n\n');
    const systemPrompt = `${specialist.system_prompt || 'Você é um assistente.'}\n\n${knowledgeContext ? `Base de conhecimento:\n${knowledgeContext}` : ''}`;

    const result = await callAI(aiConfig, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ], { temperature: specialist.temperature || 0.7, maxTokens: specialist.max_tokens || 1000 });

    return result.content || 'Sem resposta do especialista.';
  } catch (error) {
    return `Erro ao consultar agente: ${error.message}`;
  }
}

// ==================== WORK SCHEDULE HELPERS ====================

async function getWorkSchedule(organizationId) {
  const result = await query(`SELECT work_schedule FROM organizations WHERE id = $1`, [organizationId]);
  const raw = result.rows[0]?.work_schedule;
  const schedule = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  return {
    timezone: schedule.timezone || 'America/Sao_Paulo',
    work_days: schedule.work_days || [1, 2, 3, 4, 5],
    work_start: schedule.work_start || '08:00',
    work_end: schedule.work_end || '18:00',
    lunch_start: schedule.lunch_start || '12:00',
    lunch_end: schedule.lunch_end || '13:00',
    slot_duration_minutes: schedule.slot_duration_minutes || 60,
    buffer_minutes: schedule.buffer_minutes || 15,
  };
}

function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  return h * 60 + m;
}

async function findAvailableSlots(organizationId, daysAhead, slotDuration, preferredPeriod, schedule) {
  const existingResult = await query(`
    SELECT due_date, due_date + interval '1 hour' as estimated_end
    FROM crm_tasks WHERE organization_id = $1 AND type = 'meeting' AND status = 'pending'
      AND due_date >= NOW() AND due_date <= NOW() + interval '1 day' * $2
    ORDER BY due_date ASC
  `, [organizationId, daysAhead]);

  const existingEvents = existingResult.rows.map(e => ({
    start: new Date(e.due_date).getTime(),
    end: new Date(e.estimated_end).getTime(),
  }));

  const workStartMin = timeToMinutes(schedule.work_start);
  const workEndMin = timeToMinutes(schedule.work_end);
  const lunchStartMin = timeToMinutes(schedule.lunch_start);
  const lunchEndMin = timeToMinutes(schedule.lunch_end);
  const buffer = schedule.buffer_minutes;
  const slots = [];
  const now = new Date();

  for (let d = 0; d < daysAhead && slots.length < 10; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    if (!schedule.work_days.includes(date.getDay())) continue;

    for (let min = workStartMin; min + slotDuration <= workEndMin && slots.length < 10; min += slotDuration + buffer) {
      if (min < lunchEndMin && min + slotDuration > lunchStartMin) {
        min = lunchEndMin - slotDuration - buffer;
        continue;
      }
      if (preferredPeriod === 'morning' && min >= lunchStartMin) continue;
      if (preferredPeriod === 'afternoon' && min < lunchEndMin) continue;

      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(min / 60), min % 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

      if (slotStart.getTime() < now.getTime() + 30 * 60000) continue;

      const hasConflict = existingEvents.some(e => slotStart.getTime() < e.end && slotEnd.getTime() > e.start);
      if (hasConflict) continue;

      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      slots.push({
        date: slotStart.toISOString().split('T')[0],
        day_of_week: dayNames[slotStart.getDay()],
        start: `${String(slotStart.getHours()).padStart(2, '0')}:${String(slotStart.getMinutes()).padStart(2, '0')}`,
        end: `${String(slotEnd.getHours()).padStart(2, '0')}:${String(slotEnd.getMinutes()).padStart(2, '0')}`,
      });
    }
  }

  return slots;
}

// ==================== AGENT STATS ====================

async function updateAgentStats(agentId, tokensUsed, responseTimeMs, toolCalls) {
  try {
    const today = new Date().toISOString().split('T')[0];
    await query(`
      INSERT INTO ai_agent_stats (agent_id, date, total_messages, total_tokens_used, avg_response_time_ms,
        deals_created, meetings_scheduled, leads_qualified)
      VALUES ($1, $2, 1, $3, $4, $5, $6, $7)
      ON CONFLICT (agent_id, date) DO UPDATE SET
        total_messages = ai_agent_stats.total_messages + 1,
        total_tokens_used = ai_agent_stats.total_tokens_used + EXCLUDED.total_tokens_used,
        avg_response_time_ms = (ai_agent_stats.avg_response_time_ms + EXCLUDED.avg_response_time_ms) / 2,
        deals_created = ai_agent_stats.deals_created + EXCLUDED.deals_created,
        meetings_scheduled = ai_agent_stats.meetings_scheduled + EXCLUDED.meetings_scheduled,
        leads_qualified = ai_agent_stats.leads_qualified + EXCLUDED.leads_qualified
    `, [
      agentId, today, tokensUsed, responseTimeMs,
      toolCalls.some(tc => tc.name === 'create_deal') ? 1 : 0,
      toolCalls.some(tc => tc.name === 'schedule_meeting' || tc.name === 'google_calendar_event') ? 1 : 0,
      toolCalls.some(tc => tc.name === 'qualify_lead') ? 1 : 0,
    ]);
  } catch (error) {
    // Stats update is non-critical
    logError('ai_agent_processor.stats_update_error', error);
  }
}

// ==================== AI CONFIG ====================

async function getAgentAIConfig(agent, organizationId) {
  if (agent.ai_api_key) {
    return { provider: agent.ai_provider, model: agent.ai_model, apiKey: agent.ai_api_key };
  }

  const orgResult = await query(
    `SELECT ai_provider, ai_model, ai_api_key FROM organizations WHERE id = $1`,
    [organizationId]
  );
  const org = orgResult.rows[0];
  if (!org?.ai_api_key || org.ai_provider === 'none') {
    throw new Error('Nenhuma chave de API configurada para o agente.');
  }

  return {
    provider: org.ai_provider || agent.ai_provider,
    model: agent.ai_model || org.ai_model || 'gpt-4o-mini',
    apiKey: org.ai_api_key,
  };
}

// ==================== MANUAL SESSION CONTROL ====================

/**
 * Start an agent session for a conversation (manual activation from chat UI)
 */
export async function startAgentSession(agentId, conversationId, contactPhone, contactName) {
  // End any existing active session first
  await query(
    `UPDATE ai_agent_sessions SET is_active = false, ended_at = NOW() 
     WHERE conversation_id = $1 AND is_active = true`,
    [conversationId]
  );

  return createSession(agentId, conversationId, contactPhone, contactName);
}

/**
 * Stop the active agent session for a conversation
 */
export async function stopAgentSession(conversationId) {
  const result = await query(
    `UPDATE ai_agent_sessions SET is_active = false, ended_at = NOW()
     WHERE conversation_id = $1 AND is_active = true RETURNING id, agent_id`,
    [conversationId]
  );
  return result.rows[0] || null;
}

/**
 * Get active session info for a conversation (used by chat UI)
 */
export async function getActiveAgentSession(conversationId) {
  const result = await query(
    `SELECT s.*, a.name as agent_name, a.avatar_url as agent_avatar
     FROM ai_agent_sessions s
     JOIN ai_agents a ON a.id = s.agent_id
     WHERE s.conversation_id = $1 AND s.is_active = true
     ORDER BY s.started_at DESC LIMIT 1`,
    [conversationId]
  );
  return result.rows[0] || null;
}

/**
 * Pause the AI agent session when a human agent sends a message.
 * The AI will wait `cooldownMinutes` before resuming automatic responses.
 */
export async function pauseSessionForHumanReply(conversationId, cooldownMinutes = 5) {
  const pauseUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000);
  const result = await query(
    `UPDATE ai_agent_sessions SET paused_until = $2
     WHERE conversation_id = $1 AND is_active = true RETURNING id`,
    [conversationId, pauseUntil.toISOString()]
  );
  if (result.rows[0]) {
    logInfo('ai_agent_processor.paused_for_human', { conversationId, paused_until: pauseUntil });
  }
  return result.rows[0] || null;
}

/**
 * Enable/disable human takeover for a conversation's AI agent session.
 * When enabled, the AI completely stops responding until re-enabled.
 */
export async function setHumanTakeover(conversationId, enabled, userId) {
  if (enabled) {
    const result = await query(
      `UPDATE ai_agent_sessions 
       SET human_takeover = true, human_takeover_by = $2, human_takeover_at = NOW(), paused_until = NULL
       WHERE conversation_id = $1 AND is_active = true RETURNING id, agent_id`,
      [conversationId, userId]
    );
    logInfo('ai_agent_processor.human_takeover_enabled', { conversationId, userId });
    return result.rows[0] || null;
  } else {
    const result = await query(
      `UPDATE ai_agent_sessions 
       SET human_takeover = false, human_takeover_by = NULL, human_takeover_at = NULL
       WHERE conversation_id = $1 AND is_active = true RETURNING id, agent_id`,
      [conversationId]
    );
    logInfo('ai_agent_processor.human_takeover_disabled', { conversationId });
    return result.rows[0] || null;
  }
}

// ==================== HELPERS ====================

function parseArray(value, defaultValue) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    }
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
  }
  return defaultValue;
}

// ==================== MEDIA HELPERS ====================

/**
 * Transcribe audio using Lovable AI (Gemini)
 */
async function transcribeAudio(audioUrl, mimetype) {
  try {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      logInfo('ai_agent_processor.transcribe_no_api_key', {});
      return null;
    }

    // Download audio to base64
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      logError('ai_agent_processor.transcribe_download_failed', new Error(`HTTP ${audioResponse.status}`));
      return null;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const mimeType = mimetype || 'audio/ogg';

    logInfo('ai_agent_processor.transcribe_start', { size: audioBuffer.byteLength, mimetype: mimeType });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um transcritor de áudio. Transcreva o áudio com precisão. Retorne APENAS o texto transcrito, sem explicações. Se inaudível, retorne "[Áudio inaudível]".'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva este áudio:' },
              {
                type: 'input_audio',
                input_audio: {
                  data: base64Audio,
                  format: mimeType.includes('mp3') ? 'mp3' :
                          mimeType.includes('wav') ? 'wav' :
                          mimeType.includes('ogg') ? 'ogg' :
                          mimeType.includes('webm') ? 'webm' : 'mp3'
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      logError('ai_agent_processor.transcribe_ai_error', new Error(`AI error ${response.status}`));
      return null;
    }

    const data = await response.json();
    const transcript = data.choices?.[0]?.message?.content?.trim() || null;

    logInfo('ai_agent_processor.transcribe_success', { length: transcript?.length });
    return transcript;
  } catch (error) {
    logError('ai_agent_processor.transcribe_error', error);
    return null;
  }
}

/**
 * Build a multimodal message content array for image messages
 * Compatible with OpenAI vision API format
 */
function buildImageMessage(imageUrl, caption) {
  const content = [];

  if (caption) {
    content.push({ type: 'text', text: caption });
  } else {
    content.push({ type: 'text', text: 'O cliente enviou esta imagem. Descreva o que você vê e responda adequadamente.' });
  }

  content.push({
    type: 'image_url',
    image_url: { url: imageUrl },
  });

  return content;
}
