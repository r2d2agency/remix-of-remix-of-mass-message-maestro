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

// List user contact lists (includes organization's lists via connections)
router.get('/lists', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);

    let whereClause = 'cl.user_id = $1';
    let params = [req.userId];

    if (org) {
      // Get lists owned by user OR linked to organization's connections
      whereClause = `(cl.user_id = $1 OR cl.connection_id IN (
        SELECT id FROM connections WHERE organization_id = $2
      ))`;
      params = [req.userId, org.organization_id];
    }

    const result = await query(
      `SELECT cl.*, 
              COUNT(c.id) as contact_count,
              conn.name as connection_name,
              u.name as created_by_name
       FROM contact_lists cl
       LEFT JOIN contacts c ON c.list_id = cl.id
       LEFT JOIN connections conn ON cl.connection_id = conn.id
       LEFT JOIN users u ON cl.user_id = u.id
       WHERE ${whereClause}
       GROUP BY cl.id, conn.name, u.name
       ORDER BY cl.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List contact lists error:', error);
    res.status(500).json({ error: 'Erro ao listar listas de contatos' });
  }
});

// Create contact list
router.post('/lists', async (req, res) => {
  try {
    const { name, connection_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    // If connection_id provided, verify access
    if (connection_id) {
      const org = await getUserOrganization(req.userId);
      
      let connCheck;
      if (org) {
        connCheck = await query(
          'SELECT id FROM connections WHERE id = $1 AND (user_id = $2 OR organization_id = $3)',
          [connection_id, req.userId, org.organization_id]
        );
      } else {
        connCheck = await query(
          'SELECT id FROM connections WHERE id = $1 AND user_id = $2',
          [connection_id, req.userId]
        );
      }

      if (connCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Conexão não encontrada ou sem permissão' });
      }
    }

    const result = await query(
      'INSERT INTO contact_lists (user_id, name, connection_id) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, name, connection_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create contact list error:', error);
    res.status(500).json({ error: 'Erro ao criar lista de contatos' });
  }
});

// Helper to check list access
async function checkListAccess(listId, userId) {
  const org = await getUserOrganization(userId);

  let whereClause = 'id = $1 AND user_id = $2';
  let params = [listId, userId];

  if (org) {
    whereClause = `id = $1 AND (user_id = $2 OR connection_id IN (
      SELECT id FROM connections WHERE organization_id = $3
    ))`;
    params = [listId, userId, org.organization_id];
  }

  const result = await query(
    `SELECT id FROM contact_lists WHERE ${whereClause}`,
    params
  );

  return result.rows.length > 0 ? org : null;
}

// Delete contact list
router.delete('/lists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org && ['owner', 'admin', 'manager'].includes(org.role)) {
      whereClause = `id = $1 AND (user_id = $2 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      ))`;
      params = [id, req.userId, org.organization_id];
    }

    const result = await query(
      `DELETE FROM contact_lists WHERE ${whereClause} RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact list error:', error);
    res.status(500).json({ error: 'Erro ao deletar lista' });
  }
});

// List contacts from a list
router.get('/lists/:listId/contacts', async (req, res) => {
  try {
    const { listId } = req.params;
    const org = await getUserOrganization(req.userId);

    // Verify list access
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [listId, req.userId];

    if (org) {
      whereClause = `id = $1 AND (user_id = $2 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      ))`;
      params = [listId, req.userId, org.organization_id];
    }

    const listCheck = await query(
      `SELECT id FROM contact_lists WHERE ${whereClause}`,
      params
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const result = await query(
      'SELECT * FROM contacts WHERE list_id = $1 ORDER BY name ASC',
      [listId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'Erro ao listar contatos' });
  }
});

// Add contact to list
router.post('/lists/:listId/contacts', async (req, res) => {
  try {
    const { listId } = req.params;
    const { name, phone, is_whatsapp } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }

    const org = await getUserOrganization(req.userId);

    // Verify list access
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [listId, req.userId];

    if (org) {
      whereClause = `id = $1 AND (user_id = $2 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      ))`;
      params = [listId, req.userId, org.organization_id];
    }

    const listCheck = await query(
      `SELECT id FROM contact_lists WHERE ${whereClause}`,
      params
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const result = await query(
      'INSERT INTO contacts (list_id, name, phone, is_whatsapp) VALUES ($1, $2, $3, $4) RETURNING *',
      [listId, name, phone, typeof is_whatsapp === 'boolean' ? is_whatsapp : null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ error: 'Erro ao adicionar contato' });
  }
});

// Bulk import contacts
router.post('/lists/:listId/import', async (req, res) => {
  try {
    const { listId } = req.params;
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Lista de contatos inválida' });
    }

    const org = await getUserOrganization(req.userId);

    // Verify list access
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [listId, req.userId];

    if (org) {
      whereClause = `id = $1 AND (user_id = $2 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      ))`;
      params = [listId, req.userId, org.organization_id];
    }

    const listCheck = await query(
      `SELECT id FROM contact_lists WHERE ${whereClause}`,
      params
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    // Normalize contacts
    const normalized = contacts.map((c) => ({
      name: String(c?.name || '').trim(),
      phone: String(c?.phone || '').trim(),
      is_whatsapp: typeof c?.is_whatsapp === 'boolean' ? c.is_whatsapp : null,
    })).filter((c) => c.name && c.phone);

    if (normalized.length === 0) {
      return res.status(400).json({ error: 'Lista de contatos inválida' });
    }

    // Get existing phones in this list to detect duplicates
    const existingResult = await query(
      'SELECT phone FROM contacts WHERE list_id = $1',
      [listId]
    );
    const existingPhones = new Set(existingResult.rows.map(r => r.phone));

    // Also check for duplicates within the import batch
    const seenPhones = new Set();
    const uniqueContacts = [];
    let duplicateCount = 0;

    for (const contact of normalized) {
      if (existingPhones.has(contact.phone) || seenPhones.has(contact.phone)) {
        duplicateCount++;
      } else {
        seenPhones.add(contact.phone);
        uniqueContacts.push(contact);
      }
    }

    // Insert only unique contacts
    if (uniqueContacts.length > 0) {
      const values = uniqueContacts.map((c, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(', ');
      const insertParams = [listId, ...uniqueContacts.flatMap((c) => [c.name, c.phone, c.is_whatsapp])];

      await query(
        `INSERT INTO contacts (list_id, name, phone, is_whatsapp) VALUES ${values}`,
        insertParams
      );
    }

    res.json({ 
      success: true, 
      imported: uniqueContacts.length,
      duplicates: duplicateCount
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    res.status(500).json({ error: 'Erro ao importar contatos' });
  }
});

// Update contact (name/phone/whatsapp status)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, is_whatsapp } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (typeof name === 'string') {
      sets.push(`name = $${idx++}`);
      params.push(name);
    }

    if (typeof phone === 'string') {
      sets.push(`phone = $${idx++}`);
      params.push(phone);
    }

    if (typeof is_whatsapp === 'boolean') {
      sets.push(`is_whatsapp = $${idx++}`);
      params.push(is_whatsapp);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const org = await getUserOrganization(req.userId);

    params.push(id);
    params.push(req.userId);

    let subquery = 'SELECT id FROM contact_lists WHERE user_id = $' + (idx + 1);
    
    if (org) {
      params.push(org.organization_id);
      subquery = `SELECT id FROM contact_lists WHERE user_id = $${idx + 1} OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $${idx + 2}
      )`;
    }

    const result = await query(
      `UPDATE contacts
       SET ${sets.join(', ')}
       WHERE id = $${idx} AND list_id IN (${subquery})
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const org = await getUserOrganization(req.userId);

    let subquery = 'SELECT id FROM contact_lists WHERE user_id = $2';
    let params = [id, req.userId];

    if (org) {
      params.push(org.organization_id);
      subquery = `SELECT id FROM contact_lists WHERE user_id = $2 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      )`;
    }

    const result = await query(
      `DELETE FROM contacts 
       WHERE id = $1 AND list_id IN (${subquery})
       RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Erro ao deletar contato' });
  }
});

export default router;
