import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Helper to get user's organization
async function getUserOrganization(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// List connections (user's own + organization's)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    
    let result;
    if (org) {
      // Get all connections from user's organization
      result = await query(
        `SELECT c.*, u.name as created_by_name
         FROM connections c
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.organization_id = $1
         ORDER BY c.created_at DESC`,
        [org.organization_id]
      );
    } else {
      // Fallback: user without organization sees only their own
      result = await query(
        'SELECT * FROM connections WHERE user_id = $1 ORDER BY created_at DESC',
        [req.userId]
      );
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('List connections error:', error);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
});

// Create connection
router.post('/', async (req, res) => {
  try {
    const { 
      provider = 'evolution', 
      api_url, 
      api_key, 
      instance_name, 
      instance_id,
      wapi_token,
      name 
    } = req.body;

    // Validate based on provider
    if (provider === 'wapi') {
      if (!instance_id || !wapi_token) {
        return res.status(400).json({ error: 'Instance ID e Token são obrigatórios para W-API' });
      }
    } else {
      if (!api_url || !api_key || !instance_name) {
        return res.status(400).json({ error: 'URL, API Key e nome da instância são obrigatórios' });
      }
    }

    const org = await getUserOrganization(req.userId);

    const result = await query(
      `INSERT INTO connections (user_id, organization_id, provider, api_url, api_key, instance_name, instance_id, wapi_token, name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.userId, 
        org?.organization_id || null, 
        provider,
        api_url || null, 
        api_key || null, 
        instance_name || null,
        instance_id || null,
        wapi_token || null,
        name || instance_name || instance_id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create connection error:', error);
    res.status(500).json({ error: 'Erro ao criar conexão' });
  }
});

// Update connection
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      provider,
      api_url, 
      api_key, 
      instance_name, 
      instance_id,
      wapi_token,
      name, 
      status 
    } = req.body;

    const org = await getUserOrganization(req.userId);

    // Allow update if user owns the connection OR belongs to same organization
    let whereClause = 'id = $9 AND user_id = $10';
    let params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, id, req.userId];

    if (org) {
      whereClause = 'id = $9 AND organization_id = $10';
      params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, id, org.organization_id];
    }

    const result = await query(
      `UPDATE connections 
       SET provider = COALESCE($1, provider),
           api_url = COALESCE($2, api_url),
           api_key = COALESCE($3, api_key),
           instance_name = COALESCE($4, instance_name),
           instance_id = COALESCE($5, instance_id),
           wapi_token = COALESCE($6, wapi_token),
           name = COALESCE($7, name),
           status = COALESCE($8, status),
           updated_at = NOW()
       WHERE ${whereClause}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update connection error:', error);
    res.status(500).json({ error: 'Erro ao atualizar conexão' });
  }
});

// Delete connection
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const org = await getUserOrganization(req.userId);

    // Allow delete if user owns the connection OR belongs to same organization (with permission)
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org && ['owner', 'admin', 'manager'].includes(org.role)) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const result = await query(
      `DELETE FROM connections WHERE ${whereClause} RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({ error: 'Erro ao deletar conexão' });
  }
});

export default router;
