import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Helper to get user's organization and role
async function getUserContext(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role, u.is_superadmin
     FROM organization_members om 
     JOIN users u ON u.id = om.user_id
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// Check if user can manage connection
async function canManageConnection(userId, connectionId) {
  const ctx = await getUserContext(userId);
  if (!ctx) return false;
  
  // Superadmins and admins can manage
  if (ctx.is_superadmin || ['owner', 'admin', 'manager'].includes(ctx.role)) {
    // Verify connection belongs to org
    const connResult = await query(
      'SELECT organization_id FROM connections WHERE id = $1',
      [connectionId]
    );
    return connResult.rows[0]?.organization_id === ctx.organization_id;
  }
  
  return false;
}

// Get lead distribution settings for a connection
router.get('/:connectionId', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Get connection settings
    const connResult = await query(
      `SELECT id, name, lead_distribution_enabled, lead_distribution_last_user_index
       FROM connections WHERE id = $1`,
      [connectionId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    // Get distribution members
    const membersResult = await query(
      `SELECT ld.*, u.name as user_name, u.email as user_email
       FROM connection_lead_distribution ld
       JOIN users u ON u.id = ld.user_id
       WHERE ld.connection_id = $1
       ORDER BY ld.priority DESC, u.name`,
      [connectionId]
    );

    res.json({
      connection: connResult.rows[0],
      members: membersResult.rows
    });
  } catch (error) {
    console.error('Get lead distribution error:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações de distribuição' });
  }
});

// Toggle lead distribution for a connection
router.patch('/:connectionId/toggle', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { enabled } = req.body;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE connections 
       SET lead_distribution_enabled = $1, updated_at = NOW()
       WHERE id = $2 
       RETURNING id, name, lead_distribution_enabled`,
      [enabled, connectionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle lead distribution error:', error);
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

// Get available users for distribution (org members)
router.get('/:connectionId/available-users', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Get connection's org
    const connResult = await query(
      'SELECT organization_id FROM connections WHERE id = $1',
      [connectionId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const orgId = connResult.rows[0].organization_id;

    // Get all org members not already in distribution
    const usersResult = await query(
      `SELECT u.id, u.name, u.email, om.role
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1
         AND u.id NOT IN (
           SELECT user_id FROM connection_lead_distribution WHERE connection_id = $2
         )
       ORDER BY u.name`,
      [orgId, connectionId]
    );

    res.json(usersResult.rows);
  } catch (error) {
    console.error('Get available users error:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários disponíveis' });
  }
});

// Add users to distribution
router.post('/:connectionId/members', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { user_ids } = req.body;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um usuário' });
    }

    // Insert each user
    for (const userId of user_ids) {
      await query(
        `INSERT INTO connection_lead_distribution (connection_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (connection_id, user_id) DO NOTHING`,
        [connectionId, userId]
      );
    }

    res.json({ success: true, added: user_ids.length });
  } catch (error) {
    console.error('Add distribution members error:', error);
    res.status(500).json({ error: 'Erro ao adicionar usuários' });
  }
});

// Update a distribution member settings
router.patch('/:connectionId/members/:userId', async (req, res) => {
  try {
    const { connectionId, userId } = req.params;
    const { is_active, priority, max_leads_per_day } = req.body;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE connection_lead_distribution 
       SET is_active = COALESCE($1, is_active),
           priority = COALESCE($2, priority),
           max_leads_per_day = $3,
           updated_at = NOW()
       WHERE connection_id = $4 AND user_id = $5
       RETURNING *`,
      [is_active, priority, max_leads_per_day, connectionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update distribution member error:', error);
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

// Remove user from distribution
router.delete('/:connectionId/members/:userId', async (req, res) => {
  try {
    const { connectionId, userId } = req.params;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `DELETE FROM connection_lead_distribution 
       WHERE connection_id = $1 AND user_id = $2
       RETURNING id`,
      [connectionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove distribution member error:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// Get next user for lead distribution (called when new lead arrives)
router.get('/:connectionId/next-user', async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Check if distribution is enabled
    const connResult = await query(
      `SELECT lead_distribution_enabled, lead_distribution_last_user_index
       FROM connections WHERE id = $1`,
      [connectionId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    if (!connResult.rows[0].lead_distribution_enabled) {
      return res.json({ user: null, reason: 'distribution_disabled' });
    }

    // Get active members who haven't exceeded daily limit
    const membersResult = await query(
      `SELECT ld.*, u.name as user_name, u.email as user_email
       FROM connection_lead_distribution ld
       JOIN users u ON u.id = ld.user_id
       WHERE ld.connection_id = $1
         AND ld.is_active = true
         AND (ld.max_leads_per_day IS NULL OR ld.leads_today < ld.max_leads_per_day)
       ORDER BY ld.priority DESC, ld.last_lead_at ASC NULLS FIRST`,
      [connectionId]
    );

    if (membersResult.rows.length === 0) {
      return res.json({ user: null, reason: 'no_available_members' });
    }

    // Round-robin: get next user based on last index
    const lastIndex = connResult.rows[0].lead_distribution_last_user_index || 0;
    const nextIndex = (lastIndex + 1) % membersResult.rows.length;
    const selectedUser = membersResult.rows[nextIndex];

    // Update counters
    await query(
      `UPDATE connections SET lead_distribution_last_user_index = $1 WHERE id = $2`,
      [nextIndex, connectionId]
    );

    await query(
      `UPDATE connection_lead_distribution 
       SET leads_today = leads_today + 1, last_lead_at = NOW()
       WHERE connection_id = $1 AND user_id = $2`,
      [connectionId, selectedUser.user_id]
    );

    res.json({
      user: {
        id: selectedUser.user_id,
        name: selectedUser.user_name,
        email: selectedUser.user_email
      }
    });
  } catch (error) {
    console.error('Get next user error:', error);
    res.status(500).json({ error: 'Erro ao obter próximo usuário' });
  }
});

// Log a lead distribution
router.post('/:connectionId/log', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { conversation_id, contact_phone, contact_name, assigned_to_user_id, distribution_method } = req.body;

    await query(
      `INSERT INTO lead_distribution_log 
       (connection_id, conversation_id, contact_phone, contact_name, assigned_to_user_id, distribution_method)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [connectionId, conversation_id, contact_phone, contact_name, assigned_to_user_id, distribution_method || 'round_robin']
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Log lead distribution error:', error);
    res.status(500).json({ error: 'Erro ao registrar distribuição' });
  }
});

// Get distribution statistics
router.get('/:connectionId/stats', async (req, res) => {
  try {
    const { connectionId } = req.params;
    
    if (!await canManageConnection(req.userId, connectionId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Stats by user today
    const todayStats = await query(
      `SELECT 
         u.id, u.name, u.email,
         ld.leads_today,
         ld.max_leads_per_day,
         ld.is_active,
         COUNT(log.id) as total_leads
       FROM connection_lead_distribution ld
       JOIN users u ON u.id = ld.user_id
       LEFT JOIN lead_distribution_log log ON log.assigned_to_user_id = ld.user_id 
         AND log.connection_id = ld.connection_id
       WHERE ld.connection_id = $1
       GROUP BY u.id, u.name, u.email, ld.leads_today, ld.max_leads_per_day, ld.is_active
       ORDER BY ld.leads_today DESC`,
      [connectionId]
    );

    // Total distributed today
    const totalToday = await query(
      `SELECT COUNT(*) as count 
       FROM lead_distribution_log 
       WHERE connection_id = $1 AND created_at::date = CURRENT_DATE`,
      [connectionId]
    );

    res.json({
      users: todayStats.rows,
      total_today: parseInt(totalToday.rows[0]?.count || '0')
    });
  } catch (error) {
    console.error('Get distribution stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;
