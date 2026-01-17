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

// List message templates (user's own + organization's)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);

    let whereClause = 'mt.user_id = $1';
    let params = [req.userId];

    if (org) {
      // Get messages from user OR from members of same organization
      whereClause = `(mt.user_id = $1 OR mt.user_id IN (
        SELECT user_id FROM organization_members WHERE organization_id = $2
      ))`;
      params = [req.userId, org.organization_id];
    }

    const result = await query(
      `SELECT mt.*, u.name as created_by_name
       FROM message_templates mt
       LEFT JOIN users u ON mt.user_id = u.id
       WHERE ${whereClause}
       ORDER BY mt.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List messages error:', error);
    res.status(500).json({ error: 'Erro ao listar mensagens' });
  }
});

// Get single message template
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org) {
      whereClause = `id = $1 AND (user_id = $2 OR user_id IN (
        SELECT user_id FROM organization_members WHERE organization_id = $3
      ))`;
      params = [id, req.userId, org.organization_id];
    }

    const result = await query(
      `SELECT * FROM message_templates WHERE ${whereClause}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagem' });
  }
});

// Create message template
router.post('/', async (req, res) => {
  try {
    const { name, items } = req.body;

    if (!name || !items) {
      return res.status(400).json({ error: 'Nome e itens são obrigatórios' });
    }

    const result = await query(
      `INSERT INTO message_templates (user_id, name, items)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.userId, name, JSON.stringify(items)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Erro ao criar mensagem' });
  }
});

// Update message template
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, items } = req.body;

    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $3 AND user_id = $4';
    let params = [name, items ? JSON.stringify(items) : null, id, req.userId];

    if (org) {
      // Allow editing own messages or org messages if has permission
      if (['owner', 'admin', 'manager'].includes(org.role)) {
        whereClause = `id = $3 AND (user_id = $4 OR user_id IN (
          SELECT user_id FROM organization_members WHERE organization_id = $5
        ))`;
        params = [name, items ? JSON.stringify(items) : null, id, req.userId, org.organization_id];
      }
    }

    const result = await query(
      `UPDATE message_templates 
       SET name = COALESCE($1, name),
           items = COALESCE($2, items),
           updated_at = NOW()
       WHERE ${whereClause}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({ error: 'Erro ao atualizar mensagem' });
  }
});

// Delete message template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org && ['owner', 'admin', 'manager'].includes(org.role)) {
      whereClause = `id = $1 AND (user_id = $2 OR user_id IN (
        SELECT user_id FROM organization_members WHERE organization_id = $3
      ))`;
      params = [id, req.userId, org.organization_id];
    }

    const result = await query(
      `DELETE FROM message_templates WHERE ${whereClause} RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
});

export default router;
