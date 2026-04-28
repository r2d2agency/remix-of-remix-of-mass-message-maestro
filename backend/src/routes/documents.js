import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Helper: Get user's organization
async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// List documents
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização vinculada' });

    const { client_phone, client_name, deal_id, search } = req.query;
    
    let sql = `
      SELECT d.*, u.name as responsible_name
      FROM documents d
      LEFT JOIN users u ON u.id = d.responsible_user_id
      WHERE d.organization_id = $1 AND d.deleted_at IS NULL
    `;
    const params = [org.organization_id];
    let paramIndex = 2;

    if (client_phone) {
      // Remove non-digits for comparison if stored as digits only, or use a fuzzy match
      const phoneDigits = client_phone.replace(/\D/g, '');
      sql += ` AND (
        d.client_phone = $${paramIndex} 
        OR REPLACE(REPLACE(REPLACE(REPLACE(d.client_phone, ' ', ''), '-', ''), '(', ''), ')', '') = $${paramIndex}
        OR d.client_id IN (SELECT id FROM contacts WHERE phone = $${paramIndex} OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = $${paramIndex})
      )`;
      params.push(phoneDigits);
      paramIndex++;
    } else if (client_name) {
      sql += ` AND (d.client_name ILIKE $${paramIndex} OR d.name ILIKE $${paramIndex})`;
      params.push(`%${client_name}%`);
      paramIndex++;
    }

    if (deal_id) {
      sql += ` AND d.deal_id = $${paramIndex}`;
      params.push(deal_id);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (d.name ILIKE $${paramIndex} OR d.document_type ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY d.created_at DESC`;

    const result = await query(sql, params);
    
    // Map backend fields to frontend interface expected by useDocuments
    const mapped = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      client_name: row.client_name || '—', 
      client_phone: row.client_phone,
      type: row.document_type,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      responsible_name: row.responsible_name || 'Sistema',
      file_name: row.name, // Fallback
      file_data_url: row.file_url, // Use file_url as data_url
      file_size: row.file_size,
      file_type: row.file_type
    }));

    res.json(mapped);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create document
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização vinculada' });

    const { name, client_name, type, status, file_name, file_size, file_type, file_data_url, deal_id, client_phone } = req.body;

    const result = await query(
      `INSERT INTO documents (
        organization_id, name, document_type, status, file_url, 
        file_type, file_size, responsible_user_id, deal_id, client_name, client_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        org.organization_id, 
        name, 
        type, 
        status || 'draft', 
        file_data_url, // Expecting URL from uploads route or dataURL for now
        file_type, 
        file_size, 
        req.userId,
        deal_id || null,
        client_name || null,
        client_phone || null
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update document
router.patch('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização vinculada' });

    const { name, status, document_type } = req.body;
    
    const result = await query(
      `UPDATE documents 
       SET name = COALESCE($1, name), 
           status = COALESCE($2, status),
           document_type = COALESCE($3, document_type),
           updated_at = NOW()
       WHERE id = $4 AND organization_id = $5 RETURNING *`,
      [name, status, document_type, req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete document (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização vinculada' });

    await query(
      `UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
