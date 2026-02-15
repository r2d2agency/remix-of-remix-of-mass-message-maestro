import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Helper: Get user's organization
async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// ==========================================
// CONFIGURATION
// ==========================================

// Get secretary config
router.get('/config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT * FROM group_secretary_config WHERE organization_id = $1`,
      [org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        is_active: false,
        connection_ids: null,
        group_jids: null,
        create_crm_task: true,
        show_popup_alert: true,
        min_confidence: 0.6,
        ai_provider: null,
        ai_model: null,
      });
    }

    const config = result.rows[0];
    // Mask API key
    if (config.ai_api_key) {
      config.ai_api_key = '••••••••' + config.ai_api_key.slice(-4);
    }
    res.json(config);
  } catch (error) {
    console.error('Get secretary config error:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração' });
  }
});

// Save/update secretary config
router.put('/config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const {
      is_active, connection_ids, group_jids,
      create_crm_task, show_popup_alert, min_confidence,
      ai_provider, ai_model, ai_api_key,
      notify_external_enabled, notify_external_phone,
      notify_members_whatsapp, default_connection_id,
    } = req.body;

    // Handle masked API key
    let actualApiKey = ai_api_key;
    if (ai_api_key && ai_api_key.startsWith('••')) {
      const existing = await query(
        `SELECT ai_api_key FROM group_secretary_config WHERE organization_id = $1`,
        [org.organization_id]
      );
      actualApiKey = existing.rows[0]?.ai_api_key || null;
    }

    const result = await query(
      `INSERT INTO group_secretary_config 
       (organization_id, is_active, connection_ids, group_jids, create_crm_task, show_popup_alert, min_confidence, ai_provider, ai_model, ai_api_key, notify_external_enabled, notify_external_phone, notify_members_whatsapp, default_connection_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (organization_id) DO UPDATE SET
         is_active = EXCLUDED.is_active,
         connection_ids = EXCLUDED.connection_ids,
         group_jids = EXCLUDED.group_jids,
         create_crm_task = EXCLUDED.create_crm_task,
         show_popup_alert = EXCLUDED.show_popup_alert,
         min_confidence = EXCLUDED.min_confidence,
         ai_provider = EXCLUDED.ai_provider,
         ai_model = EXCLUDED.ai_model,
         ai_api_key = EXCLUDED.ai_api_key,
         notify_external_enabled = EXCLUDED.notify_external_enabled,
         notify_external_phone = EXCLUDED.notify_external_phone,
         notify_members_whatsapp = EXCLUDED.notify_members_whatsapp,
         default_connection_id = EXCLUDED.default_connection_id,
         updated_at = NOW()
       RETURNING *`,
      [
        org.organization_id, is_active ?? true,
        connection_ids || null, group_jids || null,
        create_crm_task ?? true, show_popup_alert ?? true,
        min_confidence ?? 0.6,
        ai_provider || null, ai_model || null, actualApiKey || null,
        notify_external_enabled ?? false, notify_external_phone || null,
        notify_members_whatsapp ?? false, default_connection_id || null,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Save secretary config error:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// ==========================================
// MEMBERS (aliases/roles mapping)
// ==========================================

// List members with aliases
router.get('/members', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT gsm.*, u.name as user_name, u.email, u.whatsapp_phone, u.phone
       FROM group_secretary_members gsm
       JOIN users u ON u.id = gsm.user_id
       WHERE gsm.organization_id = $1
       ORDER BY u.name`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List secretary members error:', error);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

// Add/update member
router.post('/members', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { user_id, aliases, role_description, departments } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });

    const result = await query(
      `INSERT INTO group_secretary_members (organization_id, user_id, aliases, role_description, departments)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET
         aliases = EXCLUDED.aliases,
         role_description = EXCLUDED.role_description,
         departments = EXCLUDED.departments,
         updated_at = NOW()
       RETURNING *`,
      [org.organization_id, user_id, aliases || '{}', role_description || null, departments || '{}']
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Add secretary member error:', error);
    res.status(500).json({ error: 'Erro ao adicionar membro' });
  }
});

// Remove member
router.delete('/members/:memberId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await query(
      `DELETE FROM group_secretary_members WHERE id = $1 AND organization_id = $2`,
      [req.params.memberId, org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Remove secretary member error:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// ==========================================
// LOGS
// ==========================================

// Get detection logs
router.get('/logs', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const result = await query(
      `SELECT gsl.*, conv.group_name, conv.remote_jid
       FROM group_secretary_logs gsl
       LEFT JOIN conversations conv ON conv.id = gsl.conversation_id
       WHERE gsl.organization_id = $1
       ORDER BY gsl.created_at DESC
       LIMIT $2`,
      [org.organization_id, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get secretary logs error:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// Get available team members (for adding to secretary)
router.get('/available-users', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

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
    console.error('Get available users error:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Get monitored groups (conversations that are groups)
router.get('/groups', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT conv.id, conv.remote_jid, conv.group_name, conv.connection_id, conn.name as connection_name
       FROM conversations conv
       JOIN connections conn ON conn.id = conv.connection_id
       WHERE conn.organization_id = $1 AND conv.is_group = true
       ORDER BY conv.group_name`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// Update a user's WhatsApp phone (for notification purposes)
router.put('/members/:userId/phone', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { whatsapp_phone } = req.body;
    const targetUserId = req.params.userId;

    // Verify user belongs to org
    const memberCheck = await query(
      `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [org.organization_id, targetUserId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado na organização' });
    }

    await query(
      `UPDATE users SET whatsapp_phone = $1, updated_at = NOW() WHERE id = $2`,
      [whatsapp_phone || null, targetUserId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update member phone error:', error);
    res.status(500).json({ error: 'Erro ao atualizar telefone' });
  }
});

export default router;
