import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../db.js';
import { logInfo, logError } from '../logger.js';

const router = Router();

// Helper to get user's organization and info
async function getUserContext(userId) {
  const result = await query(
    `SELECT u.id, u.name, u.email, om.organization_id, om.role 
     FROM users u 
     LEFT JOIN organization_members om ON om.user_id = u.id 
     WHERE u.id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// ==================== AGENTES ====================

// Listar agentes da organização
router.get('/', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(`
      SELECT 
        a.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM ai_knowledge_sources WHERE agent_id = a.id AND is_active = true) as knowledge_sources_count,
        (SELECT COUNT(*) FROM ai_agent_connections WHERE agent_id = a.id AND is_active = true) as connections_count,
        (SELECT COUNT(*) FROM ai_agent_sessions WHERE agent_id = a.id AND is_active = true) as active_sessions
      FROM ai_agents a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.organization_id = $1
      ORDER BY a.created_at DESC
    `, [userCtx.organization_id]);

    res.json(result.rows);
  } catch (error) {
    logError('ai_agents.list_error', error);
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

// Buscar agente por ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(`
      SELECT 
        a.*,
        u.name as created_by_name
      FROM ai_agents a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.id = $1 AND a.organization_id = $2
    `, [req.params.id, userCtx.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.get_error', error);
    res.status(500).json({ error: 'Erro ao buscar agente' });
  }
});

// Criar agente
router.post('/', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const {
      name,
      description,
      avatar_url,
      ai_provider = 'openai',
      ai_model = 'gpt-4o-mini',
      ai_api_key,
      system_prompt,
      personality_traits = [],
      language = 'pt-BR',
      temperature = 0.7,
      max_tokens = 1000,
      context_window = 10,
      capabilities = ['respond_messages'],
      greeting_message,
      fallback_message,
      handoff_message,
      handoff_keywords = ['humano', 'atendente', 'pessoa'],
      auto_handoff_after_failures = 3,
      default_department_id,
      default_user_id,
      lead_scoring_criteria = {},
      auto_create_deal_funnel_id,
      auto_create_deal_stage_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

     const result = await query(`
      INSERT INTO ai_agents (
        organization_id, name, description, avatar_url,
        ai_provider, ai_model, ai_api_key,
        system_prompt, personality_traits, language,
        temperature, max_tokens, context_window,
        capabilities, greeting_message, fallback_message, handoff_message,
        handoff_keywords, auto_handoff_after_failures,
        default_department_id, default_user_id,
        lead_scoring_criteria, auto_create_deal_funnel_id, auto_create_deal_stage_id,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14::agent_capability[], $15, $16, $17, $18::text[], $19,
        $20, $21, $22, $23, $24, $25
      ) RETURNING *
    `, [
      userCtx.organization_id, name, description, avatar_url,
      ai_provider, ai_model, ai_api_key,
      system_prompt || 'Você é um assistente virtual prestativo e profissional.',
      JSON.stringify(personality_traits), language,
      temperature, max_tokens, context_window,
      capabilities, greeting_message, fallback_message, handoff_message,
      handoff_keywords, auto_handoff_after_failures,
      default_department_id, default_user_id,
      JSON.stringify(lead_scoring_criteria), auto_create_deal_funnel_id, auto_create_deal_stage_id,
      userCtx.id
    ]);

    logInfo('ai_agents.created', { agentId: result.rows[0].id, userId: userCtx.id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.create_error', error);
    res.status(500).json({ error: 'Erro ao criar agente' });
  }
});

// Atualizar agente
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    // Verificar propriedade
    const check = await query(
      'SELECT id FROM ai_agents WHERE id = $1 AND organization_id = $2',
      [req.params.id, userCtx.organization_id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    const allowedFields = [
      'name', 'description', 'avatar_url', 'is_active',
      'ai_provider', 'ai_model', 'ai_api_key',
      'system_prompt', 'personality_traits', 'language',
      'temperature', 'max_tokens', 'context_window',
      'capabilities', 'greeting_message', 'fallback_message', 'handoff_message',
      'handoff_keywords', 'auto_handoff_after_failures',
      'default_department_id', 'default_user_id',
      'lead_scoring_criteria', 'auto_create_deal_funnel_id', 'auto_create_deal_stage_id'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

     for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
         // Ensure correct Postgres types for array columns
         let assignment = `${field} = $${paramIndex}`;
         if (field === 'capabilities') assignment = `${field} = $${paramIndex}::agent_capability[]`;
         if (field === 'handoff_keywords') assignment = `${field} = $${paramIndex}::text[]`;

         updates.push(assignment);
        let value = req.body[field];
        if (['personality_traits', 'lead_scoring_criteria'].includes(field) && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(req.params.id);
    const result = await query(`
      UPDATE ai_agents 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    res.json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.update_error', error);
    res.status(500).json({ error: 'Erro ao atualizar agente' });
  }
});

// Deletar agente
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      'DELETE FROM ai_agents WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, userCtx.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    logError('ai_agents.delete_error', error);
    res.status(500).json({ error: 'Erro ao deletar agente' });
  }
});

// Toggle ativo/inativo
router.post('/:id/toggle', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(`
      UPDATE ai_agents 
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, is_active
    `, [req.params.id, userCtx.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.toggle_error', error);
    res.status(500).json({ error: 'Erro ao alternar agente' });
  }
});

// ==================== KNOWLEDGE BASE ====================

// Listar fontes de conhecimento de um agente
router.get('/:id/knowledge', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        ks.*,
        u.name as created_by_name
      FROM ai_knowledge_sources ks
      LEFT JOIN users u ON ks.created_by = u.id
      WHERE ks.agent_id = $1
      ORDER BY ks.priority DESC, ks.created_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    logError('ai_agents.knowledge_list_error', error);
    res.status(500).json({ error: 'Erro ao buscar fontes de conhecimento' });
  }
});

// Adicionar fonte de conhecimento
router.post('/:id/knowledge', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const {
      source_type,
      name,
      description,
      source_content,
      file_type,
      file_size,
      original_filename,
      priority = 0
    } = req.body;

    if (!source_type || !name || !source_content) {
      return res.status(400).json({ error: 'Tipo, nome e conteúdo são obrigatórios' });
    }

    // Verificar propriedade do agente
    const agentCheck = await query(
      'SELECT id FROM ai_agents WHERE id = $1 AND organization_id = $2',
      [req.params.id, userCtx.organization_id]
    );

    if (agentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Agente não encontrado' });
    }

    const result = await query(`
      INSERT INTO ai_knowledge_sources (
        agent_id, source_type, name, description, source_content,
        file_type, file_size, original_filename, priority,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
      RETURNING *
    `, [
      req.params.id, source_type, name, description, source_content,
      file_type, file_size, original_filename, priority,
      userCtx.id
    ]);

    // TODO: Disparar processamento assíncrono para chunking
    // processKnowledgeSource(result.rows[0].id);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.knowledge_add_error', error);
    res.status(500).json({ error: 'Erro ao adicionar fonte de conhecimento' });
  }
});

// Atualizar fonte de conhecimento
router.patch('/:id/knowledge/:sourceId', authenticate, async (req, res) => {
  try {
    const { name, description, priority, is_active } = req.body;

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
    if (priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(priority); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(req.params.sourceId, req.params.id);

    const result = await query(`
      UPDATE ai_knowledge_sources 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx++} AND agent_id = $${idx}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fonte não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.knowledge_update_error', error);
    res.status(500).json({ error: 'Erro ao atualizar fonte' });
  }
});

// Deletar fonte de conhecimento
router.delete('/:id/knowledge/:sourceId', authenticate, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM ai_knowledge_sources WHERE id = $1 AND agent_id = $2 RETURNING id',
      [req.params.sourceId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fonte não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    logError('ai_agents.knowledge_delete_error', error);
    res.status(500).json({ error: 'Erro ao deletar fonte' });
  }
});

// Reprocessar fonte de conhecimento
router.post('/:id/knowledge/:sourceId/reprocess', authenticate, async (req, res) => {
  try {
    const result = await query(`
      UPDATE ai_knowledge_sources 
      SET status = 'pending', error_message = NULL, updated_at = NOW()
      WHERE id = $1 AND agent_id = $2
      RETURNING *
    `, [req.params.sourceId, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fonte não encontrada' });
    }

    // TODO: Disparar reprocessamento
    // processKnowledgeSource(req.params.sourceId);

    res.json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.knowledge_reprocess_error', error);
    res.status(500).json({ error: 'Erro ao reprocessar fonte' });
  }
});

// ==================== CONEXÕES WHATSAPP ====================

// Listar conexões vinculadas ao agente
router.get('/:id/connections', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        ac.*,
        c.name as connection_name,
        c.phone_number as connection_phone,
        c.status as connection_status
      FROM ai_agent_connections ac
      JOIN connections c ON ac.connection_id = c.id
      WHERE ac.agent_id = $1
      ORDER BY ac.priority DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    logError('ai_agents.connections_list_error', error);
    res.status(500).json({ error: 'Erro ao buscar conexões' });
  }
});

// Vincular agente a uma conexão
router.post('/:id/connections', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const {
      connection_id,
      mode = 'always',
      trigger_keywords = [],
      business_hours_start = '08:00',
      business_hours_end = '18:00',
      business_days = [1, 2, 3, 4, 5],
      priority = 0
    } = req.body;

    if (!connection_id) {
      return res.status(400).json({ error: 'connection_id é obrigatório' });
    }

    // Verificar se a conexão pertence à organização
    const connCheck = await query(
      'SELECT id FROM connections WHERE id = $1 AND organization_id = $2',
      [connection_id, userCtx.organization_id]
    );

    if (connCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const result = await query(`
      INSERT INTO ai_agent_connections (
        agent_id, connection_id, mode, trigger_keywords,
        business_hours_start, business_hours_end, business_days, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (agent_id, connection_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        trigger_keywords = EXCLUDED.trigger_keywords,
        business_hours_start = EXCLUDED.business_hours_start,
        business_hours_end = EXCLUDED.business_hours_end,
        business_days = EXCLUDED.business_days,
        priority = EXCLUDED.priority,
        is_active = true
      RETURNING *
    `, [
      req.params.id, connection_id, mode, trigger_keywords,
      business_hours_start, business_hours_end, business_days, priority
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.connection_link_error', error);
    res.status(500).json({ error: 'Erro ao vincular agente' });
  }
});

// Desvincular agente de uma conexão
router.delete('/:id/connections/:connectionId', authenticate, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM ai_agent_connections WHERE agent_id = $1 AND connection_id = $2 RETURNING id',
      [req.params.id, req.params.connectionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vínculo não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    logError('ai_agents.connection_unlink_error', error);
    res.status(500).json({ error: 'Erro ao desvincular agente' });
  }
});

// ==================== ESTATÍSTICAS ====================

// Estatísticas do agente
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params = [req.params.id];

    if (start_date && end_date) {
      dateFilter = 'AND date >= $2 AND date <= $3';
      params.push(start_date, end_date);
    }

    // Estatísticas agregadas
    const statsResult = await query(`
      SELECT
        COALESCE(SUM(total_sessions), 0) as total_sessions,
        COALESCE(SUM(total_messages), 0) as total_messages,
        COALESCE(SUM(total_tokens_used), 0) as total_tokens_used,
        COALESCE(SUM(handoff_count), 0) as handoff_count,
        COALESCE(AVG(avg_response_time_ms), 0) as avg_response_time_ms,
        COALESCE(SUM(positive_feedback_count), 0) as positive_feedback,
        COALESCE(SUM(negative_feedback_count), 0) as negative_feedback,
        COALESCE(SUM(deals_created), 0) as deals_created,
        COALESCE(SUM(meetings_scheduled), 0) as meetings_scheduled,
        COALESCE(SUM(leads_qualified), 0) as leads_qualified
      FROM ai_agent_stats
      WHERE agent_id = $1 ${dateFilter}
    `, params);

    // Dados diários
    const dailyResult = await query(`
      SELECT 
        date,
        total_sessions,
        total_messages,
        handoff_count,
        deals_created
      FROM ai_agent_stats
      WHERE agent_id = $1 ${dateFilter}
      ORDER BY date DESC
      LIMIT 30
    `, params);

    // Sessões ativas
    const activeResult = await query(
      'SELECT COUNT(*) as count FROM ai_agent_sessions WHERE agent_id = $1 AND is_active = true',
      [req.params.id]
    );

    res.json({
      summary: statsResult.rows[0],
      daily: dailyResult.rows,
      active_sessions: parseInt(activeResult.rows[0].count)
    });
  } catch (error) {
    logError('ai_agents.stats_error', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// ==================== MODELOS DISPONÍVEIS ====================

router.get('/config/models', authenticate, async (req, res) => {
  res.json({
    openai: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Mais capaz, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Rápido e econômico' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Alto desempenho' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Econômico' }
    ],
    gemini: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Mais capaz, contexto longo' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Rápido e eficiente' },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', description: 'Versão estável' }
    ]
  });
});

// ==================== TEMPLATES DE PROMPT ====================

// Listar templates
router.get('/templates', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const { category } = req.query;

    let sql = `
      SELECT * FROM ai_prompt_templates
      WHERE organization_id = $1 OR is_system = true
    `;
    const params = [userCtx.organization_id];

    if (category) {
      sql += ' AND category = $2';
      params.push(category);
    }

    sql += ' ORDER BY is_system DESC, usage_count DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('ai_agents.templates_list_error', error);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

// Criar template
router.post('/templates', authenticate, async (req, res) => {
  try {
    const userCtx = await getUserContext(req.userId);
    if (!userCtx?.organization_id) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const { name, description, category, template, variables = [] } = req.body;

    if (!name || !template) {
      return res.status(400).json({ error: 'Nome e template são obrigatórios' });
    }

    const result = await query(`
      INSERT INTO ai_prompt_templates (
        organization_id, name, description, category, template, variables, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      userCtx.organization_id, name, description, category, template,
      JSON.stringify(variables), userCtx.id
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('ai_agents.template_create_error', error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

export default router;
