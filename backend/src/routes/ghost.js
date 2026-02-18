import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { callAI } from '../lib/ai-caller.js';
import { log, logInfo, logError } from '../logger.js';

const router = Router();

const JSON_FORMAT = `Responda SOMENTE com um JSON válido (sem markdown) no formato:
{
  "insights": [
    {
      "conversation_id": "id",
      "category": "CATEGORIAS_AQUI",
      "severity": "low|medium|high|critical",
      "title": "Título curto",
      "description": "Descrição do que foi identificado",
      "recommendation": "Ação sugerida",
      "snippet": "Trecho relevante da conversa"
    }
  ],
  "team_scores": [
    { "user_name": "nome", "score": 0-100, "conversations": N, "issues": N }
  ]
}
Seja direto e objetivo. Não invente dados. Se uma conversa está normal, não a inclua.`;

const ANALYSIS_PROMPTS = {
  full: {
    intro: 'Você é um analista de performance comercial. Analise as conversas de WhatsApp e identifique TODOS os tipos de problemas e oportunidades.',
    categories: `- off_topic: Conversa fora do foco comercial (assuntos pessoais, brincadeiras excessivas)
- deal_risk: Cliente demonstra insatisfação ou pode desistir da compra
- slow_response: Atendente demorou muito para responder
- no_followup: Cliente ficou sem resposta ou acompanhamento
- sentiment_negative: Cliente com sentimento claramente negativo
- opportunity: Oportunidade de venda ou upsell não aproveitada`,
    categoryValues: 'off_topic|deal_risk|slow_response|no_followup|sentiment_negative|opportunity',
  },
  quality: {
    intro: 'Você é um auditor de qualidade de atendimento ao cliente. Foque APENAS na qualidade do atendimento prestado pelos atendentes: educação, clareza, tempo de resposta, resolução efetiva e profissionalismo.',
    categories: `- slow_response: Atendente demorou muito para responder (gaps grandes)
- off_topic: Atendente desviou do foco profissional
- sentiment_negative: Atendente foi rude, impaciente ou pouco profissional
- no_followup: Atendente não fez acompanhamento adequado`,
    categoryValues: 'slow_response|off_topic|sentiment_negative|no_followup',
  },
  opportunities: {
    intro: 'Você é um especialista em vendas e growth. Analise as conversas focando EXCLUSIVAMENTE em oportunidades de negócio perdidas, upsell, cross-sell e sinais de compra não aproveitados.',
    categories: `- opportunity: Oportunidade de venda, upsell ou cross-sell não aproveitada
- deal_risk: Cliente mostrou interesse mas não foi bem conduzido ao fechamento`,
    categoryValues: 'opportunity|deal_risk',
  },
  risks: {
    intro: 'Você é um analista de retenção e churn. Foque EXCLUSIVAMENTE em identificar clientes em risco de desistência, insatisfação e sinais de churn.',
    categories: `- deal_risk: Risco real de perda do negócio ou cliente
- sentiment_negative: Cliente irritado, frustrado ou insatisfeito
- no_followup: Cliente em risco que ficou sem acompanhamento`,
    categoryValues: 'deal_risk|sentiment_negative|no_followup',
  },
  conduct: {
    intro: 'Você é um supervisor de conduta profissional. Analise as conversas focando EXCLUSIVAMENTE em desvios de conduta: conversas pessoais no horário de trabalho, linguagem inadequada, brincadeiras excessivas e falta de profissionalismo.',
    categories: `- off_topic: Conversa fora do foco profissional (assuntos pessoais, brincadeiras)
- sentiment_negative: Linguagem inadequada ou falta de profissionalismo por parte do atendente`,
    categoryValues: 'off_topic|sentiment_negative',
  },
};

function buildSystemPrompt(analysisType) {
  const config = ANALYSIS_PROMPTS[analysisType] || ANALYSIS_PROMPTS.full;
  return `${config.intro}

Para cada conversa problemática, classifique em uma das categorias:
${config.categories}

${JSON_FORMAT.replace('CATEGORIAS_AQUI', config.categoryValues)}`;
}

async function getUserOrganization(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getAIConfig(organizationId) {
  const agentResult = await query(
    `SELECT ai_provider, ai_model, ai_api_key FROM ai_agents WHERE organization_id = $1 AND is_active = true AND ai_api_key IS NOT NULL LIMIT 1`,
    [organizationId]
  );
  if (agentResult.rows[0]) return agentResult.rows[0];
  const orgResult = await query(`SELECT ai_api_key, ai_provider, ai_model FROM organizations WHERE id = $1`, [organizationId]);
  return orgResult.rows[0] || null;
}

// GET /api/ghost/analyze
router.get('/analyze', authenticate, async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (org.role !== 'owner') return res.status(403).json({ error: 'Acesso restrito ao proprietário da organização' });

    // Check if ghost module is enabled for this organization
    const orgModules = await query(`SELECT modules_enabled FROM organizations WHERE id = $1`, [org.organization_id]);
    const modules = orgModules.rows[0]?.modules_enabled || {};
    if (modules.ghost === false) {
      return res.status(403).json({ error: 'Módulo Fantasma não está ativado para esta organização. Ative nas configurações.' });
    }

    const days = parseInt(req.query.days) || 7;
    const connectionId = req.query.connection_id;
    const analysisType = req.query.analysis_type || 'full';

    // Fetch recent conversations with messages
    let convQuery = `
      SELECT 
        c.id, c.remote_jid, c.contact_name, c.contact_phone, c.assigned_to,
        c.attendance_status, c.last_message_at, c.is_group,
        conn.name as connection_name,
        u.name as assigned_to_name,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id 
         AND m.created_at >= NOW() - INTERVAL '${days} days') as msg_count
      FROM conversations c
      JOIN connections conn ON c.connection_id = conn.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE conn.organization_id = $1
        AND c.is_group = false
        AND c.last_message_at >= NOW() - INTERVAL '${days} days'
    `;
    const params = [org.organization_id];

    if (connectionId) {
      convQuery += ` AND c.connection_id = $2`;
      params.push(connectionId);
    }

    convQuery += ` ORDER BY c.last_message_at DESC LIMIT 200`;

    const convResult = await query(convQuery, params);
    const conversations = convResult.rows;

    if (conversations.length === 0) {
      return res.json({
        summary: { total_analyzed: 0, off_topic: 0, deal_risk: 0, slow_response: 0, no_followup: 0, sentiment_negative: 0, opportunities: 0, team_scores: [] },
        insights: [],
        analyzed_at: new Date().toISOString(),
      });
    }

    // Fetch last 15 messages per conversation (batch)
    const convIds = conversations.map(c => c.id);
    const msgsResult = await query(`
      SELECT m.conversation_id, m.content, m.from_me, m.created_at, m.message_type
      FROM chat_messages m
      WHERE m.conversation_id = ANY($1)
        AND m.created_at >= NOW() - INTERVAL '${days} days'
        AND m.content IS NOT NULL AND m.content != ''
      ORDER BY m.conversation_id, m.created_at DESC
    `, [convIds]);

    // Group messages by conversation
    const msgsByConv = {};
    for (const msg of msgsResult.rows) {
      if (!msgsByConv[msg.conversation_id]) msgsByConv[msg.conversation_id] = [];
      if (msgsByConv[msg.conversation_id].length < 15) {
        msgsByConv[msg.conversation_id].push(msg);
      }
    }

    // Build analysis payload for AI
    const conversationSummaries = conversations
      .filter(c => msgsByConv[c.id]?.length > 0)
      .slice(0, 50) // Limit to 50 for token limits
      .map(c => {
        const msgs = (msgsByConv[c.id] || []).reverse();
        const transcript = msgs.map(m => `${m.from_me ? 'ATENDENTE' : 'CLIENTE'}: ${m.content}`).join('\n');
        return {
          id: c.id,
          contact: c.contact_name || c.contact_phone || c.remote_jid,
          attendant: c.assigned_to_name || 'Não atribuído',
          connection: c.connection_name,
          status: c.attendance_status,
          msg_count: parseInt(c.msg_count),
          transcript,
        };
      });

    const rawAIConfig = await getAIConfig(org.organization_id);
    if (!rawAIConfig?.ai_api_key) {
      return res.status(400).json({ error: 'Nenhum agente de IA configurado com API key. Configure um agente ou a chave na organização.' });
    }
    const aiConfig = { provider: rawAIConfig.ai_provider, model: rawAIConfig.ai_model, apiKey: rawAIConfig.ai_api_key };

    const systemPrompt = buildSystemPrompt(analysisType);

    const userPrompt = `Analise estas ${conversationSummaries.length} conversas dos últimos ${days} dias:\n\n${JSON.stringify(conversationSummaries, null, 0)}`;

    let aiResult;
    try {
      const aiResponse = await callAI(aiConfig, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { maxTokens: 4000, temperature: 0.3 });
      const response = aiResponse.content;
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (aiErr) {
      logError('ghost_ai_analysis', aiErr);
      return res.status(500).json({ error: 'Erro na análise de IA: ' + aiErr.message });
    }

    // Enrich insights with conversation data
    const convMap = {};
    conversations.forEach(c => { convMap[c.id] = c; });

    const enrichedInsights = (aiResult.insights || []).map((ins, idx) => {
      const conv = convMap[ins.conversation_id] || {};
      return {
        id: `ghost-${idx}`,
        conversation_id: ins.conversation_id,
        contact_name: conv.contact_name || '',
        contact_phone: conv.contact_phone || conv.remote_jid || '',
        connection_name: conv.connection_name || '',
        assigned_to_name: conv.assigned_to_name || null,
        category: ins.category,
        severity: ins.severity,
        title: ins.title,
        description: ins.description,
        recommendation: ins.recommendation,
        snippet: ins.snippet || '',
        last_message_at: conv.last_message_at,
        message_count: parseInt(conv.msg_count) || 0,
      };
    });

    // === Compute extra metrics from raw message data ===

    // 1. Avg response time per attendant (minutes between client msg and attendant reply)
    const responseTimesByUser = {};
    for (const convId of Object.keys(msgsByConv)) {
      const msgs = (msgsByConv[convId] || []).reverse(); // chronological
      const conv = convMap[convId];
      if (!conv?.assigned_to_name) continue;
      const userName = conv.assigned_to_name;
      if (!responseTimesByUser[userName]) responseTimesByUser[userName] = [];
      
      for (let i = 1; i < msgs.length; i++) {
        if (!msgs[i].from_me && msgs[i-1]?.from_me) continue; // skip
        if (msgs[i].from_me && !msgs[i-1]?.from_me) {
          const diff = (new Date(msgs[i].created_at) - new Date(msgs[i-1].created_at)) / 60000;
          if (diff > 0 && diff < 1440) { // ignore > 24h gaps
            responseTimesByUser[userName].push(diff);
          }
        }
      }
    }

    const avg_response_times = Object.entries(responseTimesByUser).map(([user_name, times]) => ({
      user_name,
      avg_minutes: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      total_replies: times.length,
    })).sort((a, b) => a.avg_minutes - b.avg_minutes);

    // 2. Peak problem hours (from insights)
    const hourCounts = {};
    for (const ins of enrichedInsights) {
      if (ins.last_message_at) {
        const h = new Date(ins.last_message_at).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      }
    }
    const peak_hours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 3. Critical clients ranking (most issues)
    const clientIssues = {};
    for (const ins of enrichedInsights) {
      const key = ins.contact_name || ins.contact_phone;
      if (!key) continue;
      if (!clientIssues[key]) clientIssues[key] = { name: key, phone: ins.contact_phone, issues: 0, categories: [] };
      clientIssues[key].issues++;
      if (!clientIssues[key].categories.includes(ins.category)) clientIssues[key].categories.push(ins.category);
    }
    const critical_clients = Object.values(clientIssues)
      .sort((a, b) => b.issues - a.issues)
      .slice(0, 10);

    // 4. Resolution rate (conversations with status 'resolved' or 'closed' vs total)
    const resolved = conversations.filter(c => ['resolved', 'closed', 'finalizado'].includes(c.attendance_status)).length;
    const resolution_rate = conversations.length > 0 ? Math.round((resolved / conversations.length) * 100) : 0;

    // Build summary
    const summary = {
      total_analyzed: conversationSummaries.length,
      off_topic: enrichedInsights.filter(i => i.category === 'off_topic').length,
      deal_risk: enrichedInsights.filter(i => i.category === 'deal_risk').length,
      slow_response: enrichedInsights.filter(i => i.category === 'slow_response').length,
      no_followup: enrichedInsights.filter(i => i.category === 'no_followup').length,
      sentiment_negative: enrichedInsights.filter(i => i.category === 'sentiment_negative').length,
      opportunities: enrichedInsights.filter(i => i.category === 'opportunity').length,
      team_scores: aiResult.team_scores || [],
      // Extra metrics
      avg_response_times,
      peak_hours,
      critical_clients,
      resolution_rate,
    };

    // Audit log
    await query(
      `INSERT INTO ghost_audit_logs (user_id, organization_id, days_analyzed, conversations_analyzed, insights_count, categories_summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.userId, org.organization_id, days, summary.total_analyzed, enrichedInsights.length, JSON.stringify(summary)]
    );
    logInfo('ghost_audit', { userId: req.userId, orgId: org.organization_id, days, conversations: summary.total_analyzed, insights: enrichedInsights.length });

    res.json({
      summary,
      insights: enrichedInsights,
      analyzed_at: new Date().toISOString(),
    });

  } catch (err) {
    logError('ghost_analyze', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ghost/analyses - List saved analyses
router.get('/analyses', authenticate, async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT id, label, data, days, connection_id, connection_name, created_at
       FROM ghost_saved_analyses
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [org.organization_id]
    );

    res.json(result.rows.map(r => ({
      id: r.id,
      label: r.label,
      data: r.data,
      days: r.days,
      connectionId: r.connection_id,
      connectionName: r.connection_name,
      timestamp: r.created_at,
    })));
  } catch (err) {
    logError('ghost_list_analyses', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ghost/analyses - Save an analysis
router.post('/analyses', authenticate, async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { label, data, days, connectionId, connectionName } = req.body;

    const result = await query(
      `INSERT INTO ghost_saved_analyses (organization_id, user_id, label, data, days, connection_id, connection_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [org.organization_id, req.userId, label, JSON.stringify(data), days || 7, connectionId || null, connectionName || null]
    );

    res.json({ id: result.rows[0].id, timestamp: result.rows[0].created_at });
  } catch (err) {
    logError('ghost_save_analysis', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ghost/analyses/:id - Delete a saved analysis
router.delete('/analyses/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    await query(
      `DELETE FROM ghost_saved_analyses WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    res.json({ success: true });
  } catch (err) {
    logError('ghost_delete_analysis', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
