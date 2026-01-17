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
    const { api_url, api_key, instance_name, name } = req.body;

    if (!api_url || !api_key || !instance_name) {
      return res.status(400).json({ error: 'URL, API Key e nome da instância são obrigatórios' });
    }

    const org = await getUserOrganization(req.userId);

    const result = await query(
      `INSERT INTO connections (user_id, organization_id, api_url, api_key, instance_name, name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, org?.organization_id || null, api_url, api_key, instance_name, name || instance_name]
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
    const { api_url, api_key, instance_name, name, status } = req.body;

    const org = await getUserOrganization(req.userId);

    // Allow update if user owns the connection OR belongs to same organization
    let whereClause = 'id = $6 AND user_id = $7';
    let params = [api_url, api_key, instance_name, name, status, id, req.userId];

    if (org) {
      whereClause = 'id = $6 AND organization_id = $7';
      params = [api_url, api_key, instance_name, name, status, id, org.organization_id];
    }

    const result = await query(
      `UPDATE connections 
       SET api_url = COALESCE($1, api_url),
           api_key = COALESCE($2, api_key),
           instance_name = COALESCE($3, instance_name),
           name = COALESCE($4, name),
           status = COALESCE($5, status),
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
