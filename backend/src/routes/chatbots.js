import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Middleware de autenticação
router.use(authenticate);

// Helper para obter organização do usuário
async function getUserOrganization(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// Helper para verificar se é admin/manager
function isAdmin(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

// ============================================
// CRUD DE CHATBOTS
// ============================================

// Listar chatbots da organização
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      `SELECT 
        c.*,
        conn.name as connection_name,
        conn.phone as connection_phone,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM chatbot_sessions cs WHERE cs.chatbot_id = c.id AND cs.is_active = true) as active_sessions
       FROM chatbots c
       LEFT JOIN connections conn ON c.connection_id = conn.id
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.organization_id = $1
       ORDER BY c.created_at DESC`,
      [org.organization_id]
    );

    // Remover API keys do retorno
    const chatbots = result.rows.map(bot => ({
      ...bot,
      ai_api_key: bot.ai_api_key ? '••••••••' : null
    }));

    res.json(chatbots);
  } catch (error) {
    console.error('Erro ao listar chatbots:', error);
    res.status(500).json({ error: 'Erro ao listar chatbots' });
  }
});

// Buscar chatbot por ID
router.get('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      `SELECT c.*, conn.name as connection_name
       FROM chatbots c
       LEFT JOIN connections conn ON c.connection_id = conn.id
       WHERE c.id = $1 AND c.organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    const chatbot = result.rows[0];
    // Mascarar API key
    chatbot.ai_api_key = chatbot.ai_api_key ? '••••••••' : null;

    res.json(chatbot);
  } catch (error) {
    console.error('Erro ao buscar chatbot:', error);
    res.status(500).json({ error: 'Erro ao buscar chatbot' });
  }
});

// Criar chatbot
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para criar chatbots' });
    }

    const {
      name,
      description,
      connection_id,
      mode,
      business_hours_start,
      business_hours_end,
      business_days,
      timezone,
      ai_provider,
      ai_model,
      ai_api_key,
      ai_system_prompt,
      ai_temperature,
      ai_max_tokens,
      welcome_message,
      fallback_message,
      transfer_after_failures,
      typing_delay_ms
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      `INSERT INTO chatbots (
        organization_id, connection_id, name, description, mode,
        business_hours_start, business_hours_end, business_days, timezone,
        ai_provider, ai_model, ai_api_key, ai_system_prompt, ai_temperature, ai_max_tokens,
        welcome_message, fallback_message, transfer_after_failures, typing_delay_ms,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        org.organization_id,
        connection_id || null,
        name,
        description || null,
        mode || 'always',
        business_hours_start || '08:00',
        business_hours_end || '18:00',
        business_days || [1, 2, 3, 4, 5],
        timezone || 'America/Sao_Paulo',
        ai_provider || 'none',
        ai_model || null,
        ai_api_key || null,
        ai_system_prompt || null,
        ai_temperature || 0.7,
        ai_max_tokens || 500,
        welcome_message || null,
        fallback_message || 'Desculpe, não entendi. Vou transferir você para um atendente.',
        transfer_after_failures || 3,
        typing_delay_ms || 1500,
        req.userId
      ]
    );

    // Criar nó inicial do fluxo
    await query(
      `INSERT INTO chatbot_flows (chatbot_id, node_id, node_type, name, content, position_x, position_y, order_index)
       VALUES ($1, 'start', 'start', 'Início', '{}', 100, 100, 0)`,
      [result.rows[0].id]
    );

    const chatbot = result.rows[0];
    chatbot.ai_api_key = chatbot.ai_api_key ? '••••••••' : null;

    res.status(201).json(chatbot);
  } catch (error) {
    console.error('Erro ao criar chatbot:', error);
    res.status(500).json({ error: 'Erro ao criar chatbot' });
  }
});

// Atualizar chatbot
router.patch('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para editar chatbots' });
    }

    // Verificar se chatbot pertence à organização
    const existing = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'name', 'description', 'connection_id', 'is_active', 'mode',
      'business_hours_start', 'business_hours_end', 'business_days', 'timezone',
      'ai_provider', 'ai_model', 'ai_api_key', 'ai_system_prompt', 'ai_temperature', 'ai_max_tokens',
      'welcome_message', 'fallback_message', 'transfer_after_failures', 'typing_delay_ms'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Não atualizar api_key se for placeholder
        if (field === 'ai_api_key' && req.body[field] === '••••••••') {
          continue;
        }
        updates.push(`${field} = $${paramCount}`);
        values.push(req.body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(req.params.id);
    values.push(org.organization_id);

    const result = await query(
      `UPDATE chatbots SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    const chatbot = result.rows[0];
    chatbot.ai_api_key = chatbot.ai_api_key ? '••••••••' : null;

    res.json(chatbot);
  } catch (error) {
    console.error('Erro ao atualizar chatbot:', error);
    res.status(500).json({ error: 'Erro ao atualizar chatbot' });
  }
});

// Deletar chatbot
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para deletar chatbots' });
    }

    const result = await query(
      'DELETE FROM chatbots WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar chatbot:', error);
    res.status(500).json({ error: 'Erro ao deletar chatbot' });
  }
});

// Ativar/Desativar chatbot
router.post('/:id/toggle', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `UPDATE chatbots SET is_active = NOT is_active 
       WHERE id = $1 AND organization_id = $2
       RETURNING id, is_active`,
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao alternar chatbot:', error);
    res.status(500).json({ error: 'Erro ao alternar chatbot' });
  }
});

// ============================================
// FLUXOS DO CHATBOT
// ============================================

// Listar fluxos de um chatbot
router.get('/:id/flows', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Verificar se chatbot pertence à organização
    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    const result = await query(
      `SELECT * FROM chatbot_flows 
       WHERE chatbot_id = $1 
       ORDER BY order_index ASC`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar fluxos:', error);
    res.status(500).json({ error: 'Erro ao listar fluxos' });
  }
});

// Salvar fluxos (substituir todos)
router.put('/:id/flows', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { flows } = req.body;
    if (!Array.isArray(flows)) {
      return res.status(400).json({ error: 'Flows deve ser um array' });
    }

    // Verificar se chatbot pertence à organização
    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    // Deletar fluxos existentes
    await query('DELETE FROM chatbot_flows WHERE chatbot_id = $1', [req.params.id]);

    // Inserir novos fluxos
    for (let i = 0; i < flows.length; i++) {
      const flow = flows[i];
      await query(
        `INSERT INTO chatbot_flows (
          chatbot_id, node_id, node_type, name, position_x, position_y, content, next_node_id, order_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          req.params.id,
          flow.node_id,
          flow.node_type,
          flow.name || null,
          flow.position_x || 0,
          flow.position_y || 0,
          JSON.stringify(flow.content || {}),
          flow.next_node_id || null,
          i
        ]
      );
    }

    // Retornar fluxos atualizados
    const result = await query(
      'SELECT * FROM chatbot_flows WHERE chatbot_id = $1 ORDER BY order_index',
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao salvar fluxos:', error);
    res.status(500).json({ error: 'Erro ao salvar fluxos' });
  }
});

// ============================================
// ESTATÍSTICAS
// ============================================

// Estatísticas de um chatbot
router.get('/:id/stats', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { start_date, end_date } = req.query;
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // Verificar se chatbot pertence à organização
    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    // Stats agregados
    const stats = await query(
      `SELECT 
        COALESCE(SUM(total_sessions), 0) as total_sessions,
        COALESCE(SUM(completed_sessions), 0) as completed_sessions,
        COALESCE(SUM(transferred_sessions), 0) as transferred_sessions,
        COALESCE(SUM(total_messages_in), 0) as total_messages_in,
        COALESCE(SUM(total_messages_out), 0) as total_messages_out,
        COALESCE(SUM(ai_requests), 0) as ai_requests,
        COALESCE(SUM(ai_tokens_used), 0) as ai_tokens_used,
        COALESCE(AVG(avg_session_duration_seconds), 0) as avg_duration
       FROM chatbot_stats 
       WHERE chatbot_id = $1 AND date BETWEEN $2 AND $3`,
      [req.params.id, startDate, endDate]
    );

    // Stats por dia
    const daily = await query(
      `SELECT date, total_sessions, completed_sessions, transferred_sessions, ai_requests
       FROM chatbot_stats 
       WHERE chatbot_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date ASC`,
      [req.params.id, startDate, endDate]
    );

    // Sessões ativas
    const activeSessions = await query(
      `SELECT COUNT(*) as count FROM chatbot_sessions 
       WHERE chatbot_id = $1 AND is_active = true`,
      [req.params.id]
    );

    res.json({
      summary: stats.rows[0],
      daily: daily.rows,
      active_sessions: parseInt(activeSessions.rows[0].count)
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Stats gerais de todos chatbots da organização
router.get('/stats/overview', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `SELECT 
        c.id,
        c.name,
        c.is_active,
        COALESCE(SUM(s.total_sessions), 0) as total_sessions,
        COALESCE(SUM(s.transferred_sessions), 0) as transferred_sessions,
        (SELECT COUNT(*) FROM chatbot_sessions cs WHERE cs.chatbot_id = c.id AND cs.is_active = true) as active_sessions
       FROM chatbots c
       LEFT JOIN chatbot_stats s ON s.chatbot_id = c.id AND s.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE c.organization_id = $1
       GROUP BY c.id, c.name, c.is_active
       ORDER BY c.name`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar overview:', error);
    res.status(500).json({ error: 'Erro ao buscar overview' });
  }
});

// ============================================
// MODELOS DE IA DISPONÍVEIS
// ============================================

router.get('/ai/models', async (req, res) => {
  const models = {
    gemini: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Rápido e econômico' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Mais capaz e preciso' },
      { id: 'gemini-pro', name: 'Gemini Pro', description: 'Versão estável' },
    ],
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Rápido e econômico' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Mais capaz e versátil' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Alta performance' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Econômico' },
    ]
  };

  res.json(models);
});

export default router;
