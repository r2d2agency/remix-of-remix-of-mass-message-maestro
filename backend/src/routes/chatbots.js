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
      chatbot_type,
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
      typing_delay_ms,
      menu_message,
      menu_options,
      invalid_option_message,
      linked_flow_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      `INSERT INTO chatbots (
        organization_id, connection_id, name, description, chatbot_type, mode,
        business_hours_start, business_hours_end, business_days, timezone,
        ai_provider, ai_model, ai_api_key, ai_system_prompt, ai_temperature, ai_max_tokens,
        welcome_message, fallback_message, transfer_after_failures, typing_delay_ms,
        menu_message, menu_options, invalid_option_message, linked_flow_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        org.organization_id,
        connection_id || null,
        name,
        description || null,
        chatbot_type || 'flow',
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
        menu_message || null,
        menu_options ? JSON.stringify(menu_options) : '[]',
        invalid_option_message || 'Opção inválida. Por favor, digite um número válido.',
        linked_flow_id || null,
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
      'name', 'description', 'connection_id', 'is_active', 'chatbot_type', 'mode',
      'business_hours_start', 'business_hours_end', 'business_days', 'timezone',
      'ai_provider', 'ai_model', 'ai_api_key', 'ai_system_prompt', 'ai_temperature', 'ai_max_tokens',
      'welcome_message', 'fallback_message', 'transfer_after_failures', 'typing_delay_ms',
      'menu_message', 'menu_options', 'invalid_option_message', 'linked_flow_id'
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

// ============================================
// CONEXÕES DO CHATBOT
// ============================================

// Listar conexões de um chatbot
router.get('/:id/connections', async (req, res) => {
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
      `SELECT cc.*, c.name as connection_name, c.phone as connection_phone, c.status as connection_status
       FROM chatbot_connections cc
       JOIN connections c ON cc.connection_id = c.id
       WHERE cc.chatbot_id = $1
       ORDER BY c.name`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar conexões do chatbot:', error);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
});

// Atualizar conexões de um chatbot
router.put('/:id/connections', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { connection_ids } = req.body;
    if (!Array.isArray(connection_ids)) {
      return res.status(400).json({ error: 'connection_ids deve ser um array' });
    }

    // Verificar se chatbot pertence à organização
    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    // Remover conexões antigas
    await query('DELETE FROM chatbot_connections WHERE chatbot_id = $1', [req.params.id]);

    // Adicionar novas conexões
    for (const connectionId of connection_ids) {
      await query(
        'INSERT INTO chatbot_connections (chatbot_id, connection_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, connectionId]
      );
    }

    // Retornar conexões atualizadas
    const result = await query(
      `SELECT cc.*, c.name as connection_name, c.phone as connection_phone
       FROM chatbot_connections cc
       JOIN connections c ON cc.connection_id = c.id
       WHERE cc.chatbot_id = $1`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao atualizar conexões:', error);
    res.status(500).json({ error: 'Erro ao atualizar conexões' });
  }
});

// ============================================
// PERMISSÕES DE USUÁRIO
// ============================================

// Listar permissões de um chatbot
router.get('/:id/permissions', async (req, res) => {
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
      `SELECT cp.*, u.name as user_name, u.email as user_email, om.role as org_role
       FROM chatbot_permissions cp
       JOIN users u ON cp.user_id = u.id
       LEFT JOIN organization_members om ON om.user_id = u.id AND om.organization_id = $2
       WHERE cp.chatbot_id = $1
       ORDER BY u.name`,
      [req.params.id, org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar permissões:', error);
    res.status(500).json({ error: 'Erro ao listar permissões' });
  }
});

// Adicionar/atualizar permissão de usuário
router.post('/:id/permissions', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para gerenciar permissões' });
    }

    const { user_id, permission_level } = req.body;
    if (!user_id || !permission_level) {
      return res.status(400).json({ error: 'user_id e permission_level são obrigatórios' });
    }

    const validLevels = ['view', 'edit', 'manage', 'owner'];
    if (!validLevels.includes(permission_level)) {
      return res.status(400).json({ error: 'permission_level inválido' });
    }

    // Verificar se chatbot pertence à organização
    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    // Verificar se usuário pertence à organização
    const member = await query(
      'SELECT user_id FROM organization_members WHERE user_id = $1 AND organization_id = $2',
      [user_id, org.organization_id]
    );

    if (member.rows.length === 0) {
      return res.status(400).json({ error: 'Usuário não pertence à organização' });
    }

    // Inserir ou atualizar
    const result = await query(
      `INSERT INTO chatbot_permissions (chatbot_id, user_id, permission_level, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chatbot_id, user_id) 
       DO UPDATE SET permission_level = $3, updated_at = NOW()
       RETURNING *`,
      [req.params.id, user_id, permission_level, req.userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao adicionar permissão:', error);
    res.status(500).json({ error: 'Erro ao adicionar permissão' });
  }
});

// Remover permissão de usuário
router.delete('/:id/permissions/:userId', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `DELETE FROM chatbot_permissions 
       WHERE chatbot_id = $1 AND user_id = $2
       AND chatbot_id IN (SELECT id FROM chatbots WHERE organization_id = $3)
       RETURNING id`,
      [req.params.id, req.params.userId, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Permissão não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover permissão:', error);
    res.status(500).json({ error: 'Erro ao remover permissão' });
  }
});

// ============================================
// CONFIGURAÇÕES DE PAPEL (ROLE-BASED)
// ============================================

// Buscar configurações de papel
router.get('/:id/role-settings', async (req, res) => {
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

    let result = await query(
      'SELECT * FROM chatbot_role_settings WHERE chatbot_id = $1',
      [req.params.id]
    );

    // Se não existir, criar com valores padrão
    if (result.rows.length === 0) {
      result = await query(
        `INSERT INTO chatbot_role_settings (chatbot_id) VALUES ($1) RETURNING *`,
        [req.params.id]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar config de papéis:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Atualizar configurações de papel
router.patch('/:id/role-settings', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Apenas Owner/Admin podem alterar permissões de papel' });
    }

    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    const allowedFields = [
      'owner_can_manage', 'admin_can_manage', 'admin_can_edit',
      'manager_can_view', 'manager_can_edit', 'agent_can_view'
    ];

    const updates = [];
    const values = [];
    let paramCount = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(req.body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    // Upsert
    await query(
      `INSERT INTO chatbot_role_settings (chatbot_id) VALUES ($1) ON CONFLICT (chatbot_id) DO NOTHING`,
      [req.params.id]
    );

    values.push(req.params.id);
    const result = await query(
      `UPDATE chatbot_role_settings SET ${updates.join(', ')}, updated_at = NOW() 
       WHERE chatbot_id = $${paramCount} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar config de papéis:', error);
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

// ============================================
// LISTAR USUÁRIOS DA ORGANIZAÇÃO (para seleção)
// ============================================

router.get('/org/users', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `SELECT u.id, u.name, u.email, om.role
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1
       ORDER BY u.name`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Listar conexões da organização (para seleção)
router.get('/org/connections', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `SELECT c.id, c.name, c.phone, c.status
       FROM connections c
       WHERE c.organization_id = $1
       ORDER BY c.name`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar conexões:', error);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
});

// ============================================
// EQUIPE DE ATENDENTES
// ============================================

// Listar atendentes de um chatbot
router.get('/:id/agents', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    const result = await query(
      `SELECT ca.*, u.name as user_name, u.email as user_email
       FROM chatbot_agents ca
       JOIN users u ON ca.user_id = u.id
       WHERE ca.chatbot_id = $1
       ORDER BY ca.is_default DESC, u.name`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar atendentes:', error);
    res.status(500).json({ error: 'Erro ao listar atendentes' });
  }
});

// Atualizar equipe de atendentes
router.put('/:id/agents', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { agents, default_agent_id } = req.body;
    // agents: [{ user_id: string, is_default?: boolean }]

    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    // Atualizar default_agent_id no chatbot
    if (default_agent_id !== undefined) {
      await query(
        'UPDATE chatbots SET default_agent_id = $1 WHERE id = $2',
        [default_agent_id || null, req.params.id]
      );
    }

    // Atualizar equipe
    if (Array.isArray(agents)) {
      await query('DELETE FROM chatbot_agents WHERE chatbot_id = $1', [req.params.id]);

      for (const agent of agents) {
        await query(
          `INSERT INTO chatbot_agents (chatbot_id, user_id, is_default)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [req.params.id, agent.user_id, agent.is_default || false]
        );
      }
    }

    // Retornar atendentes atualizados
    const result = await query(
      `SELECT ca.*, u.name as user_name, u.email as user_email
       FROM chatbot_agents ca
       JOIN users u ON ca.user_id = u.id
       WHERE ca.chatbot_id = $1`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao atualizar atendentes:', error);
    res.status(500).json({ error: 'Erro ao atualizar atendentes' });
  }
});

// ============================================
// PALAVRAS-CHAVE DE ATIVAÇÃO
// ============================================

// Atualizar keywords do chatbot
router.patch('/:id/keywords', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { trigger_keywords, trigger_enabled } = req.body;

    const chatbot = await query(
      'SELECT id FROM chatbots WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (trigger_keywords !== undefined) {
      updates.push(`trigger_keywords = $${paramCount}`);
      values.push(trigger_keywords);
      paramCount++;
    }

    if (trigger_enabled !== undefined) {
      updates.push(`trigger_enabled = $${paramCount}`);
      values.push(trigger_enabled);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(req.params.id);
    const result = await query(
      `UPDATE chatbots SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount} RETURNING id, trigger_keywords, trigger_enabled`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar keywords:', error);
    res.status(500).json({ error: 'Erro ao atualizar keywords' });
  }
});

// Verificar se mensagem dispara algum chatbot (para o backend de mensagens)
router.post('/check-trigger', async (req, res) => {
  try {
    const { message, connection_id } = req.body;

    if (!message || !connection_id) {
      return res.status(400).json({ error: 'message e connection_id são obrigatórios' });
    }

    const messageLower = message.trim().toLowerCase();

    // Buscar chatbots ativos com trigger_enabled para esta conexão
    const result = await query(
      `SELECT c.id, c.name, c.trigger_keywords
       FROM chatbots c
       JOIN chatbot_connections cc ON cc.chatbot_id = c.id
       WHERE cc.connection_id = $1
         AND c.is_active = true
         AND c.trigger_enabled = true
         AND c.trigger_keywords IS NOT NULL
         AND array_length(c.trigger_keywords, 1) > 0`,
      [connection_id]
    );

    // Verificar correspondência exata
    for (const chatbot of result.rows) {
      const keywords = chatbot.trigger_keywords.map(k => k.toLowerCase());
      if (keywords.includes(messageLower)) {
        return res.json({ 
          triggered: true, 
          chatbot_id: chatbot.id,
          chatbot_name: chatbot.name
        });
      }
    }

    res.json({ triggered: false });
  } catch (error) {
    console.error('Erro ao verificar trigger:', error);
    res.status(500).json({ error: 'Erro ao verificar trigger' });
  }
});

// ============================================
// FLUXOS EM CONVERSAS (ENCAMINHAMENTO MANUAL)
// ============================================

// Iniciar fluxo em uma conversa
router.post('/conversation/:conversationId/start-flow', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { chatbot_id } = req.body;
    const { conversationId } = req.params;

    if (!chatbot_id) {
      return res.status(400).json({ error: 'chatbot_id é obrigatório' });
    }

    // Verificar se chatbot está disponível para o usuário
    const chatbot = await query(
      `SELECT c.* FROM chatbots c
       WHERE c.id = $1 AND c.organization_id = $2 AND c.is_active = true`,
      [chatbot_id, org.organization_id]
    );

    if (chatbot.rows.length === 0) {
      return res.status(404).json({ error: 'Chatbot não encontrado ou inativo' });
    }

    // Verificar se conversa existe e pertence à org
    const conversation = await query(
      `SELECT cv.id FROM conversations cv
       JOIN connections cn ON cv.connection_id = cn.id
       WHERE cv.id = $1 AND cn.organization_id = $2`,
      [conversationId, org.organization_id]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Buscar nó inicial do fluxo
    const startNode = await query(
      `SELECT node_id FROM chatbot_flows 
       WHERE chatbot_id = $1 AND node_type = 'start' 
       ORDER BY order_index LIMIT 1`,
      [chatbot_id]
    );

    const startNodeId = startNode.rows[0]?.node_id || 'start';

    // Criar ou atualizar sessão de fluxo
    const result = await query(
      `INSERT INTO conversation_flows (conversation_id, chatbot_id, current_node_id, started_by, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (conversation_id) 
       DO UPDATE SET 
         chatbot_id = $2,
         current_node_id = $3,
         started_by = $4,
         started_at = NOW(),
         completed_at = NULL,
         status = 'active',
         variables = '{}'
       RETURNING *`,
      [conversationId, chatbot_id, startNodeId, req.userId]
    );

    res.json({
      success: true,
      flow: result.rows[0],
      chatbot: chatbot.rows[0]
    });
  } catch (error) {
    console.error('Erro ao iniciar fluxo:', error);
    res.status(500).json({ error: 'Erro ao iniciar fluxo na conversa' });
  }
});

// Cancelar fluxo ativo em conversa
router.post('/conversation/:conversationId/cancel-flow', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `UPDATE conversation_flows cf SET 
         status = 'cancelled',
         completed_at = NOW()
       FROM conversations cv
       JOIN connections cn ON cv.connection_id = cn.id
       WHERE cf.conversation_id = $1 
         AND cf.conversation_id = cv.id
         AND cn.organization_id = $2
         AND cf.status = 'active'
       RETURNING cf.*`,
      [req.params.conversationId, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum fluxo ativo nesta conversa' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao cancelar fluxo:', error);
    res.status(500).json({ error: 'Erro ao cancelar fluxo' });
  }
});

// Buscar fluxo ativo de uma conversa
router.get('/conversation/:conversationId/active-flow', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `SELECT cf.*, c.name as chatbot_name
       FROM conversation_flows cf
       JOIN chatbots c ON cf.chatbot_id = c.id
       JOIN conversations cv ON cf.conversation_id = cv.id
       JOIN connections cn ON cv.connection_id = cn.id
       WHERE cf.conversation_id = $1 
         AND cn.organization_id = $2
         AND cf.status = 'active'`,
      [req.params.conversationId, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.json({ active: false });
    }

    res.json({ active: true, flow: result.rows[0] });
  } catch (error) {
    console.error('Erro ao buscar fluxo ativo:', error);
    res.status(500).json({ error: 'Erro ao buscar fluxo' });
  }
});

// Listar chatbots disponíveis para iniciar em conversa
router.get('/available-for-conversation/:connectionId', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Chatbots ativos vinculados a esta conexão
    const result = await query(
      `SELECT c.id, c.name, c.description, c.trigger_keywords, c.trigger_enabled
       FROM chatbots c
       JOIN chatbot_connections cc ON cc.chatbot_id = c.id
       WHERE cc.connection_id = $1
         AND c.organization_id = $2
         AND c.is_active = true
       ORDER BY c.name`,
      [req.params.connectionId, org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar chatbots disponíveis:', error);
    res.status(500).json({ error: 'Erro ao listar chatbots' });
  }
});

export default router;
