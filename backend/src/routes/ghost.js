import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { callAI } from '../lib/ai-caller.js';
import { log, logInfo, logError } from '../logger.js';

const router = Router();

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
    const org = await getUserOrganization(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (org.role !== 'owner') return res.status(403).json({ error: 'Acesso restrito ao proprietário da organização' });

    const days = parseInt(req.query.days) || 7;
    const connectionId = req.query.connection_id;

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

    const systemPrompt = `Você é um analista de performance comercial. Analise as conversas de WhatsApp de uma empresa e identifique problemas e oportunidades.

Para cada conversa problemática, classifique em uma das categorias:
- off_topic: Conversa que foge do foco comercial da empresa (assuntos pessoais, brincadeiras excessivas)
- deal_risk: Conversa onde o cliente demonstra insatisfação ou pode desistir da compra
- slow_response: Atendente demorou muito para responder (gaps grandes entre mensagens)
- no_followup: Cliente ficou sem resposta ou sem acompanhamento
- sentiment_negative: Cliente com sentimento claramente negativo
- opportunity: Oportunidade de venda ou upsell não aproveitada

Responda SOMENTE com um JSON válido (sem markdown) no formato:
{
  "insights": [
    {
      "conversation_id": "id",
      "category": "off_topic|deal_risk|slow_response|no_followup|sentiment_negative|opportunity",
      "severity": "low|medium|high|critical",
      "title": "Título curto do problema",
      "description": "Descrição do que foi identificado",
      "recommendation": "Ação sugerida para o gestor",
      "snippet": "Trecho relevante da conversa"
    }
  ],
  "team_scores": [
    { "user_name": "nome", "score": 0-100, "conversations": N, "issues": N }
  ]
}

Seja direto e objetivo. Não invente dados. Se uma conversa está normal, não a inclua.`;

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
    };

    // Audit log
    await query(
      `INSERT INTO ghost_audit_logs (user_id, organization_id, days_analyzed, conversations_analyzed, insights_count, categories_summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, org.organization_id, days, summary.total_analyzed, enrichedInsights.length, JSON.stringify(summary)]
    );
    logInfo('ghost_audit', { userId: req.user.id, orgId: org.organization_id, days, conversations: summary.total_analyzed, insights: enrichedInsights.length });

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

export default router;
