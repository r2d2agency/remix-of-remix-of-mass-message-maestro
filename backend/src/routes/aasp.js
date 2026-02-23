import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

async function getUserOrganization(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// Get AASP config
router.get('/config', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(400).json({ error: 'Usuário sem organização' });

    const result = await query(
      `SELECT id, organization_id, notify_phone, connection_id, is_active, last_sync_at, created_at,
              CASE WHEN api_token IS NOT NULL THEN '••••••••' || RIGHT(api_token, 4) ELSE NULL END as api_token_masked
       FROM aasp_config WHERE organization_id = $1`,
      [org.organization_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('AASP get config error:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração AASP' });
  }
});

// Save/update AASP config
router.post('/config', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(400).json({ error: 'Usuário sem organização' });

    const { api_token, notify_phone, connection_id, is_active } = req.body;

    // Check if config already exists
    const existing = await query(
      `SELECT id FROM aasp_config WHERE organization_id = $1`,
      [org.organization_id]
    );

    if (existing.rows.length > 0) {
      // Update existing - only update token if provided
      const setClauses = [
        'notify_phone = $2',
        'connection_id = $3',
        'is_active = $4',
        'updated_at = NOW()',
      ];
      const params = [org.organization_id, notify_phone || null, connection_id || null, is_active !== false];

      if (api_token) {
        setClauses.push(`api_token = $${params.length + 1}`);
        params.push(api_token);
      }

      const result = await query(
        `UPDATE aasp_config SET ${setClauses.join(', ')} WHERE organization_id = $1
         RETURNING id, organization_id, notify_phone, connection_id, is_active, last_sync_at,
         CASE WHEN api_token IS NOT NULL THEN '••••••••' || RIGHT(api_token, 4) ELSE NULL END as api_token_masked`,
        params
      );
      res.json(result.rows[0]);
    } else {
      // Insert new - token required
      if (!api_token) return res.status(400).json({ error: 'Token da API é obrigatório' });

      const result = await query(
        `INSERT INTO aasp_config (organization_id, api_token, notify_phone, connection_id, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, organization_id, notify_phone, connection_id, is_active, last_sync_at,
         CASE WHEN api_token IS NOT NULL THEN '••••••••' || RIGHT(api_token, 4) ELSE NULL END as api_token_masked`,
        [org.organization_id, api_token, notify_phone || null, connection_id || null, is_active !== false]
      );
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('AASP save config error:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração AASP' });
  }
});

// List intimações
router.get('/intimacoes', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(400).json({ error: 'Usuário sem organização' });

    const { page = 1, limit = 50, unread_only } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = 'WHERE organization_id = $1';
    const params = [org.organization_id];

    if (unread_only === 'true') {
      whereClause += ' AND read = false';
    }

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT * FROM aasp_intimacoes ${whereClause} ORDER BY data_publicacao DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, Number(limit), offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM aasp_intimacoes ${whereClause}`,
        params
      ),
    ]);

    res.json({
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error('AASP list intimacoes error:', error);
    res.status(500).json({ error: 'Erro ao listar intimações' });
  }
});

// Get unread count (for dashboard badge)
router.get('/intimacoes/unread-count', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.json({ count: 0 });

    const result = await query(
      `SELECT COUNT(*) as count FROM aasp_intimacoes WHERE organization_id = $1 AND read = false`,
      [org.organization_id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.json({ count: 0 });
  }
});

// Mark intimações as read
router.post('/intimacoes/mark-read', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(400).json({ error: 'Usuário sem organização' });

    const { ids } = req.body; // array of IDs, or empty to mark all

    if (ids && ids.length > 0) {
      await query(
        `UPDATE aasp_intimacoes SET read = true WHERE organization_id = $1 AND id = ANY($2)`,
        [org.organization_id, ids]
      );
    } else {
      await query(
        `UPDATE aasp_intimacoes SET read = true WHERE organization_id = $1 AND read = false`,
        [org.organization_id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('AASP mark read error:', error);
    res.status(500).json({ error: 'Erro ao marcar como lidas' });
  }
});

// Manual sync trigger
router.post('/sync', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(400).json({ error: 'Usuário sem organização' });

    // Get config
    const configResult = await query(
      `SELECT * FROM aasp_config WHERE organization_id = $1 AND is_active = true`,
      [org.organization_id]
    );

    if (configResult.rows.length === 0) {
      return res.status(400).json({ error: 'Configuração AASP não encontrada ou inativa' });
    }

    const config = configResult.rows[0];

    // Call AASP API
    const { syncAASP } = await import('../aasp-scheduler.js');
    const result = await syncAASP(config);

    res.json(result);
  } catch (error) {
    console.error('AASP manual sync error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar com AASP' });
  }
});

// Get sync logs
router.get('/sync-logs', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.json([]);

    const result = await query(
      `SELECT id, level, event, payload, created_at FROM aasp_sync_logs 
       WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('AASP get sync logs error:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// Clear sync logs
router.delete('/sync-logs', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.json({ success: true });

    await query(
      `DELETE FROM aasp_sync_logs WHERE organization_id = $1`,
      [org.organization_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('AASP clear sync logs error:', error);
    res.status(500).json({ error: 'Erro ao limpar logs' });
  }
});

export default router;
