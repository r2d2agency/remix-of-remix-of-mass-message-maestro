import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import * as whatsappProvider from '../lib/whatsapp-provider.js';

const router = Router();

// Get user's organization with role
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

// Check if user role is view-only (manager = supervisor)
function isViewOnlyRole(role) {
  return role === 'manager';
}

// Get user's connections based on their access rights:
// 1. If user has specific connection_members entries -> only those connections
// 2. If user is in an organization but no connection_members -> all org connections
// 3. Fallback: connections created by the user
async function getUserConnections(userId) {
  // First check if user has specific connection assignments
  const specificResult = await query(
    `SELECT DISTINCT cm.connection_id as id
     FROM connection_members cm
     WHERE cm.user_id = $1`,
    [userId]
  );
  
  if (specificResult.rows.length > 0) {
    // User has specific connections assigned - return only those
    return specificResult.rows.map(r => r.id);
  }
  
  // Check if user is in an organization
  const org = await getUserOrganization(userId);
  
  if (org) {
    // No specific assignments, but in org - return all org connections
    const orgResult = await query(
      `SELECT c.id FROM connections c WHERE c.organization_id = $1`,
      [org.organization_id]
    );
    return orgResult.rows.map(r => r.id);
  }
  
  // Fallback: user's own connections (legacy behavior)
  const ownResult = await query(
    `SELECT c.id FROM connections c WHERE c.user_id = $1`,
    [userId]
  );
  return ownResult.rows.map(r => r.id);
}

// ==========================================
// CONVERSATIONS
// ==========================================

// Get attendance status counts (for tab badges)
router.get('/conversations/attendance-counts', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);
    
    if (connectionIds.length === 0) {
      return res.json({ waiting: 0, attending: 0, finished: 0 });
    }

    const { is_group } = req.query;

    let groupFilter = '';
    if (is_group === 'true') {
      groupFilter = ` AND COALESCE(conv.is_group, false) = true`;
    } else if (is_group === 'false') {
      groupFilter = ` AND COALESCE(conv.is_group, false) = false`;
    }

    // Try to get counts with attendance_status column
    // NULL = legacy (counts as attending for backward compat)
    // 'waiting' = new queue system
    // 'attending' = accepted/in progress
    // 'finished' = completed/finalized
    try {
      const result = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE conv.attendance_status = 'waiting') as waiting,
          COUNT(*) FILTER (WHERE conv.attendance_status = 'attending' OR conv.attendance_status IS NULL) as attending,
          COUNT(*) FILTER (WHERE conv.attendance_status = 'finished') as finished
        FROM conversations conv
        WHERE conv.connection_id = ANY($1)
          AND conv.is_archived = false
          AND EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.conversation_id = conv.id)
          ${groupFilter}
      `, [connectionIds]);

      res.json({
        waiting: parseInt(result.rows[0]?.waiting || 0),
        attending: parseInt(result.rows[0]?.attending || 0),
        finished: parseInt(result.rows[0]?.finished || 0)
      });
    } catch (dbError) {
      // Fallback if attendance_status column doesn't exist
      const message = String(dbError?.message || '');
      if (/attendance_status/i.test(message)) {
        const result = await query(`
          SELECT COUNT(*) as total
          FROM conversations conv
          WHERE conv.connection_id = ANY($1)
            AND conv.is_archived = false
            AND EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.conversation_id = conv.id)
            ${groupFilter}
        `, [connectionIds]);

        const total = parseInt(result.rows[0]?.total || 0);
        res.json({ waiting: 0, attending: total, finished: 0 });
      } else {
        throw dbError;
      }
    }
  } catch (error) {
    console.error('Get attendance counts error:', error);
    res.status(500).json({ error: 'Erro ao buscar contagem' });
  }
});

// Get conversations with unread messages only
router.get('/conversations/unread', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);
    
    if (connectionIds.length === 0) {
      return res.json([]);
    }

    const result = await query(`
      SELECT 
        conv.id,
        conv.contact_name,
        conv.contact_phone,
        conv.unread_count,
        conv.last_message_at,
        conn.name as connection_name,
        (SELECT content FROM chat_messages WHERE conversation_id = conv.id ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT message_type FROM chat_messages WHERE conversation_id = conv.id ORDER BY timestamp DESC LIMIT 1) as last_message_type
      FROM conversations conv
      JOIN connections conn ON conn.id = conv.connection_id
      WHERE conv.connection_id = ANY($1)
        AND conv.unread_count > 0
        AND conv.is_archived = false
      ORDER BY conv.last_message_at DESC NULLS LAST
      LIMIT 20
    `, [connectionIds]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get unread conversations error:', error);
    res.status(500).json({ error: 'Erro ao buscar conversas não lidas' });
  }
});

// Get all conversations for user's connections
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);
    
    if (connectionIds.length === 0) {
      return res.json([]);
    }

    const { search, tag, assigned, archived, connection, includeEmpty, is_group, attendance_status } = req.query;

    const buildQuery = (supportsAttendance = true) => {
      let sql = `
        SELECT 
          conv.*,
          conn.name as connection_name,
          conn.phone_number as connection_phone,
          u.name as assigned_name,
          ${supportsAttendance ? 'ua.name as accepted_by_name,' : ''}
          COALESCE(
            (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
             FROM conversation_tag_links ctl
             JOIN conversation_tags t ON t.id = ctl.tag_id
             WHERE ctl.conversation_id = conv.id
            ), '[]'::json
          ) as tags,
          (SELECT content FROM chat_messages WHERE conversation_id = conv.id ORDER BY timestamp DESC LIMIT 1) as last_message,
          (SELECT message_type FROM chat_messages WHERE conversation_id = conv.id ORDER BY timestamp DESC LIMIT 1) as last_message_type
        FROM conversations conv
        JOIN connections conn ON conn.id = conv.connection_id
        LEFT JOIN users u ON u.id = conv.assigned_to
        ${supportsAttendance ? 'LEFT JOIN users ua ON ua.id = conv.accepted_by' : ''}
        WHERE conv.connection_id = ANY($1)
      `;

      const params = [connectionIds];
      let paramIndex = 2;

      // IMPORTANT: Only show conversations with messages (unless explicitly requested)
      if (includeEmpty !== 'true') {
        sql += ` AND EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.conversation_id = conv.id)`;
      }

      // Filter by group status
      if (is_group === 'true') {
        sql += ` AND COALESCE(conv.is_group, false) = true`;
      } else if (is_group === 'false') {
        sql += ` AND COALESCE(conv.is_group, false) = false`;
      }
      // If is_group is not specified, show all (for backward compatibility)

      // Filter by archived status
      if (archived === 'true') {
        sql += ` AND conv.is_archived = true`;
      } else {
        sql += ` AND conv.is_archived = false`;
      }

      // Filter by connection
      if (connection && connection !== 'all') {
        sql += ` AND conv.connection_id = $${paramIndex}`;
        params.push(connection);
        paramIndex++;
      }

      // Filter by search
      if (search) {
        sql += ` AND (conv.contact_name ILIKE $${paramIndex} OR conv.contact_phone ILIKE $${paramIndex} OR conv.group_name ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Filter by tag
      if (tag) {
        sql += ` AND EXISTS (
          SELECT 1 FROM conversation_tag_links ctl 
          WHERE ctl.conversation_id = conv.id AND ctl.tag_id = $${paramIndex}
        )`;
        params.push(tag);
        paramIndex++;
      }

      // Filter by assigned user
      if (assigned === 'me') {
        sql += ` AND conv.assigned_to = $${paramIndex}`;
        params.push(req.userId);
        paramIndex++;
      } else if (assigned === 'unassigned') {
        sql += ` AND conv.assigned_to IS NULL`;
      } else if (assigned && assigned !== 'all') {
        sql += ` AND conv.assigned_to = $${paramIndex}`;
        params.push(assigned);
        paramIndex++;
      }

      // Filter by attendance status (waiting/attending/finished)
      // Note: NULL = legacy (show in attending for backward compat), 'waiting' = in queue, 'attending' = accepted, 'finished' = completed
      if (supportsAttendance) {
        if (attendance_status === 'waiting') {
          // Only show explicit 'waiting' status (new queue system)
          sql += ` AND conv.attendance_status = 'waiting'`;
        } else if (attendance_status === 'attending') {
          // Show 'attending' + NULL (legacy conversations before queue system)
          sql += ` AND (conv.attendance_status = 'attending' OR conv.attendance_status IS NULL)`;
        } else if (attendance_status === 'finished') {
          // Only show explicit 'finished' status (completed conversations)
          sql += ` AND conv.attendance_status = 'finished'`;
        }
        // If no filter, show all
      }

      // Order by pinned first, then by last_message_at
      sql += ` ORDER BY COALESCE(conv.is_pinned, false) DESC, conv.last_message_at DESC NULLS LAST, conv.created_at DESC`;

      return { sql, params };
    };

    let result;
    try {
      const { sql, params } = buildQuery(true);
      result = await query(sql, params);
    } catch (error) {
      // Backward compatible fallback when DB migration wasn't applied yet.
      // Common failures: missing columns attendance_status / accepted_by / accepted_at.
      const message = String(error?.message || '');
      const missingAttendanceColumns = /attendance_status|accepted_by|accepted_at/i.test(message);
      if (!missingAttendanceColumns) throw error;

      const { sql, params } = buildQuery(false);
      result = await query(sql, params);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
});

// Get chat statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);
    
    if (connectionIds.length === 0) {
      return res.json({
        total_conversations: 0,
        unread_conversations: 0,
        messages_today: 0,
        messages_week: 0,
        avg_response_time_minutes: null,
        conversations_by_connection: [],
        conversations_by_status: []
      });
    }

    // Total conversations
    const totalResult = await query(
      `SELECT COUNT(*) as count FROM conversations WHERE connection_id = ANY($1) AND is_archived = false`,
      [connectionIds]
    );

    // Unread conversations
    const unreadResult = await query(
      `SELECT COUNT(*) as count FROM conversations WHERE connection_id = ANY($1) AND unread_count > 0 AND is_archived = false`,
      [connectionIds]
    );

    // Messages today
    const todayResult = await query(
      `SELECT COUNT(*) as count FROM chat_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.connection_id = ANY($1) AND m.timestamp >= CURRENT_DATE`,
      [connectionIds]
    );

    // Messages this week
    const weekResult = await query(
      `SELECT COUNT(*) as count FROM chat_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.connection_id = ANY($1) AND m.timestamp >= CURRENT_DATE - INTERVAL '7 days'`,
      [connectionIds]
    );

    // Conversations by connection
    const byConnectionResult = await query(
      `SELECT conn.name as connection_name, COUNT(*) as count
       FROM conversations conv
       JOIN connections conn ON conn.id = conv.connection_id
       WHERE conv.connection_id = ANY($1) AND conv.is_archived = false
       GROUP BY conn.name
       ORDER BY count DESC`,
      [connectionIds]
    );

    // Conversations by status (assigned vs unassigned)
    const byStatusResult = await query(
      `SELECT 
         CASE WHEN assigned_to IS NOT NULL THEN 'assigned' ELSE 'unassigned' END as status,
         COUNT(*) as count
       FROM conversations
       WHERE connection_id = ANY($1) AND is_archived = false
       GROUP BY CASE WHEN assigned_to IS NOT NULL THEN 'assigned' ELSE 'unassigned' END`,
      [connectionIds]
    );

    res.json({
      total_conversations: parseInt(totalResult.rows[0]?.count || 0),
      unread_conversations: parseInt(unreadResult.rows[0]?.count || 0),
      messages_today: parseInt(todayResult.rows[0]?.count || 0),
      messages_week: parseInt(weekResult.rows[0]?.count || 0),
      avg_response_time_minutes: null, // TODO: Calculate this
      conversations_by_connection: byConnectionResult.rows.map(r => ({
        connection_name: r.connection_name,
        count: parseInt(r.count)
      })),
      conversations_by_status: byStatusResult.rows.map(r => ({
        status: r.status,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Get single conversation
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    const result = await query(
      `SELECT 
        conv.*,
        conn.name as connection_name,
        conn.phone_number as connection_phone,
        conn.instance_name,
        conn.api_url,
        conn.api_key,
        u.name as assigned_name,
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
           FROM conversation_tag_links ctl
           JOIN conversation_tags t ON t.id = ctl.tag_id
           WHERE ctl.conversation_id = conv.id
          ), '[]'::json
        ) as tags
      FROM conversations conv
      JOIN connections conn ON conn.id = conv.connection_id
      LEFT JOIN users u ON u.id = conv.assigned_to
      WHERE conv.id = $1 AND conv.connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Erro ao buscar conversa' });
  }
});

// Update conversation (assign, archive, etc)
router.patch('/conversations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, is_archived } = req.body;

    // Check if user is manager (view-only) - cannot assign or modify conversations
    const userOrg = await getUserOrganization(req.userId);
    if (userOrg && isViewOnlyRole(userOrg.role)) {
      return res.status(403).json({ error: 'Supervisores não podem assumir ou modificar conversas, apenas visualizar' });
    }

    const connectionIds = await getUserConnections(req.userId);

    // Check if conversation belongs to user
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramIndex}`);
      values.push(assigned_to || null);
      paramIndex++;
    }

    if (is_archived !== undefined) {
      updates.push(`is_archived = $${paramIndex}`);
      values.push(is_archived);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhuma atualização fornecida' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Erro ao atualizar conversa' });
  }
});

// Mark conversation as read
router.post('/conversations/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(
      `UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Erro ao marcar como lida' });
  }
});

// Pin/Unpin conversation
router.post('/conversations/:id/pin', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { pinned } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    // Check if conversation belongs to user
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    await query(
      `UPDATE conversations SET is_pinned = $1, updated_at = NOW() WHERE id = $2`,
      [pinned, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Pin conversation error:', error);
    res.status(500).json({ error: 'Erro ao fixar conversa' });
  }
});

// Accept conversation (move from waiting to attending)
router.post('/conversations/:id/accept', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Check if conversation belongs to user's connections
    const check = await query(
      `SELECT id, attendance_status FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Update to attending status
    const result = await query(
      `UPDATE conversations 
       SET attendance_status = 'attending', 
           accepted_at = NOW(), 
           accepted_by = $1,
           assigned_to = COALESCE(assigned_to, $1),
           updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [req.userId, id]
    );

    res.json({ success: true, conversation: result.rows[0] });
  } catch (error) {
    console.error('Accept conversation error:', error);
    res.status(500).json({ error: 'Erro ao aceitar conversa' });
  }
});

// Release conversation (move back to waiting)
router.post('/conversations/:id/release', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Check if conversation belongs to user's connections
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Update to waiting status and unarchive if archived
    const result = await query(
      `UPDATE conversations 
       SET attendance_status = 'waiting', 
           accepted_at = NULL, 
           accepted_by = NULL,
           assigned_to = NULL,
           is_archived = false,
           updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    res.json({ success: true, conversation: result.rows[0] });
  } catch (error) {
    console.error('Release conversation error:', error);
    res.status(500).json({ error: 'Erro ao liberar conversa' });
  }
});

// Finish conversation (move to finished status)
router.post('/conversations/:id/finish', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Check if conversation belongs to user's connections
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Update to finished status (don't use finished_at/finished_by columns - may not exist)
    const result = await query(
      `UPDATE conversations 
       SET attendance_status = 'finished', 
           updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    res.json({ success: true, conversation: result.rows[0] });
  } catch (error) {
    console.error('Finish conversation error:', error);
    res.status(500).json({ error: 'Erro ao finalizar conversa' });
  }
});

// Reopen finished conversation (move back to waiting for new flow)
router.post('/conversations/:id/reopen', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Check if conversation belongs to user's connections
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Update to waiting status (back to queue for chatbot flow)
    // Don't use finished_at/finished_by columns - may not exist yet
    const result = await query(
      `UPDATE conversations 
       SET attendance_status = 'waiting', 
           accepted_at = NULL, 
           accepted_by = NULL,
           assigned_to = NULL,
           is_archived = false,
           updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    res.json({ success: true, conversation: result.rows[0] });
  } catch (error) {
    console.error('Reopen conversation error:', error);
    res.status(500).json({ error: 'Erro ao reabrir conversa' });
  }
});

// Delete conversation (Admin only)
router.delete('/conversations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { keep_contact } = req.query;
    const connectionIds = await getUserConnections(req.userId);

    // Check if user is admin/owner in their organization
    const roleCheck = await query(
      `SELECT om.role FROM organization_members om WHERE om.user_id = $1`,
      [req.userId]
    );

    const userRole = roleCheck.rows[0]?.role;
    if (!userRole || !['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Apenas administradores podem excluir conversas' });
    }

    // Get conversation details before deleting
    const convResult = await query(
      `SELECT id, connection_id, contact_name, contact_phone, remote_jid 
       FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const conv = convResult.rows[0];

    // If keep_contact is true, save contact before deleting
    if (keep_contact === 'true' && conv.contact_phone) {
      // Find or create a contact list for this connection
      let listResult = await query(
        `SELECT id FROM contact_lists WHERE connection_id = $1 AND name = 'Contatos Salvos' LIMIT 1`,
        [conv.connection_id]
      );

      let listId;
      if (listResult.rows.length === 0) {
        // Create a default list for saved contacts
        const newList = await query(
          `INSERT INTO contact_lists (user_id, name, connection_id) VALUES ($1, 'Contatos Salvos', $2) RETURNING id`,
          [req.userId, conv.connection_id]
        );
        listId = newList.rows[0].id;
      } else {
        listId = listResult.rows[0].id;
      }

      // Check if contact already exists
      const existingContact = await query(
        `SELECT id FROM contacts WHERE list_id = $1 AND phone = $2`,
        [listId, conv.contact_phone.replace(/\D/g, '')]
      );

      if (existingContact.rows.length === 0) {
        // Add contact to list
        await query(
          `INSERT INTO contacts (list_id, name, phone) VALUES ($1, $2, $3)`,
          [listId, conv.contact_name || conv.contact_phone, conv.contact_phone.replace(/\D/g, '')]
        );
      }
    }

    // Delete related records first
    await query(`DELETE FROM conversation_notes WHERE conversation_id = $1`, [id]);
    await query(`DELETE FROM conversation_tag_links WHERE conversation_id = $1`, [id]);
    await query(`DELETE FROM chat_messages WHERE conversation_id = $1`, [id]);
    await query(`DELETE FROM conversations WHERE id = $1`, [id]);

    res.json({ success: true, contact_saved: keep_contact === 'true' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Erro ao excluir conversa' });
  }
});

// Clean up duplicate @lid conversations (Admin only)
router.post('/conversations/cleanup-duplicates', authenticate, async (req, res) => {
  try {
    // Check if user is admin/owner
    const roleCheck = await query(
      `SELECT om.role FROM organization_members om WHERE om.user_id = $1`,
      [req.userId]
    );

    const userRole = roleCheck.rows[0]?.role;
    if (!userRole || !['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Apenas administradores podem executar esta ação' });
    }

    const connectionIds = await getUserConnections(req.userId);
    
    if (connectionIds.length === 0) {
      return res.json({ deleted: 0, message: 'Nenhuma conexão encontrada' });
    }

    // Find and delete conversations with @lid that have duplicates with @s.whatsapp.net
    const duplicates = await query(`
      WITH lid_conversations AS (
        SELECT id, contact_phone, connection_id, remote_jid,
               (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = conversations.id) as msg_count
        FROM conversations 
        WHERE connection_id = ANY($1)
          AND remote_jid LIKE '%@lid'
      ),
      normal_conversations AS (
        SELECT contact_phone, connection_id
        FROM conversations 
        WHERE connection_id = ANY($1)
          AND remote_jid LIKE '%@s.whatsapp.net'
      )
      SELECT lc.id, lc.contact_phone, lc.remote_jid, lc.msg_count
      FROM lid_conversations lc
      INNER JOIN normal_conversations nc 
        ON lc.contact_phone = nc.contact_phone 
        AND lc.connection_id = nc.connection_id
    `, [connectionIds]);

    const toDelete = duplicates.rows.filter(r => r.msg_count === 0);
    
    for (const conv of toDelete) {
      await query(`DELETE FROM conversation_notes WHERE conversation_id = $1`, [conv.id]);
      await query(`DELETE FROM conversation_tag_links WHERE conversation_id = $1`, [conv.id]);
      await query(`DELETE FROM chat_messages WHERE conversation_id = $1`, [conv.id]);
      await query(`DELETE FROM conversations WHERE id = $1`, [conv.id]);
    }

    // For @lid conversations that have messages but a normal duplicate exists, merge them
    const toMerge = duplicates.rows.filter(r => r.msg_count > 0);
    let merged = 0;

    for (const lidConv of toMerge) {
      // Find the normal conversation
      const normalConv = await query(`
        SELECT id FROM conversations 
        WHERE connection_id = (SELECT connection_id FROM conversations WHERE id = $1)
          AND contact_phone = $2
          AND remote_jid LIKE '%@s.whatsapp.net'
        LIMIT 1
      `, [lidConv.id, lidConv.contact_phone]);

      if (normalConv.rows.length > 0) {
        const normalId = normalConv.rows[0].id;
        
        // Move messages to normal conversation
        await query(`
          UPDATE chat_messages SET conversation_id = $1 
          WHERE conversation_id = $2
        `, [normalId, lidConv.id]);
        
        // Move notes
        await query(`
          UPDATE conversation_notes SET conversation_id = $1 
          WHERE conversation_id = $2
        `, [normalId, lidConv.id]);
        
        // Delete the @lid conversation
        await query(`DELETE FROM conversation_tag_links WHERE conversation_id = $1`, [lidConv.id]);
        await query(`DELETE FROM conversations WHERE id = $1`, [lidConv.id]);
        
        merged++;
      }
    }

    res.json({ 
      deleted: toDelete.length, 
      merged,
      message: `${toDelete.length} conversas vazias removidas, ${merged} conversas mescladas` 
    });
  } catch (error) {
    console.error('Cleanup duplicates error:', error);
    res.status(500).json({ error: 'Erro ao limpar duplicatas' });
  }
});

// Clean up empty conversations (no messages) - Admin only
router.post('/conversations/cleanup-empty', authenticate, async (req, res) => {
  try {
    // Check if user is admin/owner
    const memberResult = await query(
      `SELECT om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
      [req.userId]
    );
    
    const userRole = memberResult.rows[0]?.role;
    if (!userRole || !['owner', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const connectionIds = await getUserConnections(req.userId);
    
    if (connectionIds.length === 0) {
      return res.json({ deleted: 0, message: 'Nenhuma conexão encontrada' });
    }

    // Find and delete conversations with no messages
    const result = await query(`
      DELETE FROM conversations
      WHERE connection_id = ANY($1)
        AND id NOT IN (
          SELECT DISTINCT conversation_id FROM chat_messages WHERE conversation_id IS NOT NULL
        )
      RETURNING id, contact_name, contact_phone
    `, [connectionIds]);

    console.log(`Cleaned up ${result.rows.length} empty conversations`);

    res.json({
      deleted: result.rows.length,
      conversations: result.rows,
      message: `${result.rows.length} conversa(s) vazia(s) removida(s)`
    });
  } catch (error) {
    console.error('Cleanup empty conversations error:', error);
    res.status(500).json({ error: 'Erro ao limpar conversas vazias' });
  }
});

// ==========================================
// MESSAGES
// ==========================================

// Get messages for a conversation
router.get('/conversations/:id/messages', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, before } = req.query;
    const connectionIds = await getUserConnections(req.userId);

    // Check access
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    let sql = `
      SELECT 
        m.*,
        COALESCE(m.sender_name, u.name) as sender_name,
        m.sender_phone,
        qm.content as quoted_content,
        qm.message_type as quoted_message_type,
        qm.from_me as quoted_from_me,
        COALESCE(qm.sender_name, qu.name) as quoted_sender_name
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN chat_messages qm ON qm.id = m.quoted_message_id
      LEFT JOIN users qu ON qu.id = qm.sender_id
      WHERE m.conversation_id = $1
    `;
    const params = [id];
    let paramIndex = 2;

    if (before) {
      sql += ` AND m.timestamp < $${paramIndex}`;
      params.push(before);
      paramIndex++;
    }

    sql += ` ORDER BY m.timestamp DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);
    
    // Return in chronological order
    res.json(result.rows.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Send message (optimistic: save DB first, send to WhatsApp async)
router.post('/conversations/:id/messages', authenticate, async (req, res) => {
  try {
    // Check if user is manager (view-only) - cannot send messages
    const userOrg = await getUserOrganization(req.userId);
    if (userOrg && isViewOnlyRole(userOrg.role)) {
      return res.status(403).json({ error: 'Supervisores não podem enviar mensagens, apenas visualizar' });
    }

    const { id } = req.params;
    const { content, message_type = 'text', media_url, media_mimetype, quoted_message_id } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    // Get conversation with connection details (including W-API fields)
    const convResult = await query(
      `SELECT 
        conv.*,
        conn.api_url,
        conn.api_key,
        conn.instance_name,
        conn.provider,
        conn.instance_id,
        conn.wapi_token,
        conn.status as connection_status
      FROM conversations conv
      JOIN connections conn ON conn.id = conv.connection_id
      WHERE conv.id = $1 AND conv.connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const conversation = convResult.rows[0];

    // For W-API, consider connected if has instance_id and token (status may not be updated yet)
    const provider = whatsappProvider.detectProvider(conversation);
    const isConnected = conversation.connection_status === 'connected' || 
      (provider === 'wapi' && conversation.instance_id && conversation.wapi_token);

    if (!isConnected) {
      return res.status(400).json({ error: 'Conexão não está ativa' });
    }

    // ============================================================
    // OPTIMISTIC: Save message to DB first with status='pending'
    // Generate a temporary UUID to help webhook de-duplicate
    // ============================================================
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const messageResult = await query(
      `INSERT INTO chat_messages 
        (conversation_id, message_id, from_me, sender_id, content, message_type, media_url, media_mimetype, quoted_message_id, status, timestamp)
       VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, 'pending', NOW())
       RETURNING *`,
      [
        id,
        tempMessageId,
        req.userId,
        content,
        message_type,
        media_url || null,
        media_mimetype || null,
        quoted_message_id || null,
      ]
    );

    const savedMessage = messageResult.rows[0];

    // Update conversation last_message_at immediately
    await query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // ============================================================
    // Return response immediately (optimistic)
    // ============================================================
    res.status(201).json(savedMessage);

    // ============================================================
    // ASYNC: Send to WhatsApp via unified provider (Evolution or W-API)
    // ============================================================
    (async () => {
      try {
        // IMPORTANT: groups must keep the full JID (@g.us). If we strip it,
        // providers will send to an invalid destination.
        const isGroup = String(conversation.remote_jid || '').includes('@g.us') || conversation.is_group === true;
        const to = isGroup
          ? conversation.remote_jid
          : String(conversation.remote_jid || '').replace('@s.whatsapp.net', '');

        // Use unified provider to send message
        const result = await whatsappProvider.sendMessage(
          conversation,
          to,
          content,
          message_type,
          media_url
        );

        if (result.success) {
          // Update message with provider message_id and status='sent'
          await query(
            `UPDATE chat_messages SET message_id = $1, status = 'sent' WHERE id = $2`,
            [result.messageId || null, savedMessage.id]
          );
        } else {
          throw new Error(result.error || 'Falha ao enviar mensagem');
        }
      } catch (bgError) {
        console.error('Background send error:', bgError.message);
        // Mark as failed so UI can show error state
        await query(
          `UPDATE chat_messages SET status = 'failed' WHERE id = $1`,
          [savedMessage.id]
        ).catch(() => {});
      }
    })();
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message || 'Erro ao enviar mensagem' });
  }
});

// ==========================================
// TAGS
// ==========================================

// Get all tags
router.get('/tags', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    const organizationId = userOrg?.organization_id;
    
    if (!organizationId) {
      return res.json([]);
    }

    const result = await query(
      `SELECT * FROM conversation_tags WHERE organization_id = $1 ORDER BY name`,
      [organizationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Erro ao buscar tags' });
  }
});

// Get all tags with conversation count
router.get('/tags/with-count', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    const organizationId = userOrg?.organization_id;
    
    if (!organizationId) {
      return res.json([]);
    }

    const result = await query(
      `SELECT t.*, 
        COALESCE(
          (SELECT COUNT(*) FROM conversation_tag_links ctl WHERE ctl.tag_id = t.id),
          0
        )::int as conversation_count
       FROM conversation_tags t
       WHERE t.organization_id = $1 
       ORDER BY t.name`,
      [organizationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get tags with count error:', error);
    res.status(500).json({ error: 'Erro ao buscar tags' });
  }
});

// Update tag
router.patch('/tags/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const userOrg = await getUserOrganization(req.userId);
    const organizationId = userOrg?.organization_id;

    if (!organizationId) {
      return res.status(400).json({ error: 'Usuário não pertence a uma organização' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }
    if (color) {
      updates.push(`color = $${paramIndex}`);
      values.push(color);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhuma atualização fornecida' });
    }

    values.push(id, organizationId);

    const result = await query(
      `UPDATE conversation_tags SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: 'Erro ao atualizar tag' });
  }
});

// Create tag
router.post('/tags', authenticate, async (req, res) => {
  try {
    const { name, color = '#6366f1' } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da tag é obrigatório' });
    }
    
    const userOrg = await getUserOrganization(req.userId);
    const organizationId = userOrg?.organization_id;
    console.log('Create tag - userId:', req.userId, 'orgId:', organizationId, 'name:', name);

    if (!organizationId) {
      return res.status(400).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      `INSERT INTO conversation_tags (organization_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, name) DO UPDATE SET color = $3
       RETURNING *`,
      [organizationId, name.trim(), color]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Erro ao criar tag', details: error.message });
  }
});

// Delete tag
router.delete('/tags/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userOrg = await getUserOrganization(req.userId);
    const organizationId = userOrg?.organization_id;

    if (!organizationId) {
      return res.status(400).json({ error: 'Usuário não pertence a uma organização' });
    }

    await query(
      `DELETE FROM conversation_tags WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Erro ao deletar tag' });
  }
});

// Add tag to conversation
router.post('/conversations/:id/tags', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;

    await query(
      `INSERT INTO conversation_tag_links (conversation_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, tag_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Add tag error:', error);
    res.status(500).json({ error: 'Erro ao adicionar tag' });
  }
});

// Remove tag from conversation
router.delete('/conversations/:id/tags/:tagId', authenticate, async (req, res) => {
  try {
    const { id, tagId } = req.params;

    await query(
      `DELETE FROM conversation_tag_links WHERE conversation_id = $1 AND tag_id = $2`,
      [id, tagId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Remove tag error:', error);
    res.status(500).json({ error: 'Erro ao remover tag' });
  }
});

// ==========================================
// TEAM MEMBERS (for assignment)
// ==========================================

// Get team members
router.get('/team', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    const organizationId = userOrg?.organization_id;
    
    if (!organizationId) {
      return res.json([]);
    }

    const result = await query(
      `SELECT u.id, u.name, u.email, om.role
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY u.name`,
      [organizationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Erro ao buscar equipe' });
  }
});

// Transfer conversation
router.post('/conversations/:id/transfer', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { to_user_id, note } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    // Check access
    const check = await query(
      `SELECT id, assigned_to FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const previousAssigned = check.rows[0].assigned_to;

    // Update assignment
    await query(
      `UPDATE conversations SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
      [to_user_id, id]
    );

    // Add system message about transfer
    const fromUser = await query(`SELECT name FROM users WHERE id = $1`, [req.userId]);
    const toUser = to_user_id ? await query(`SELECT name FROM users WHERE id = $1`, [to_user_id]) : null;

    const transferMessage = to_user_id
      ? `📋 Conversa transferida por ${fromUser.rows[0]?.name || 'Sistema'} para ${toUser?.rows[0]?.name || 'Outro atendente'}${note ? `: "${note}"` : ''}`
      : `📋 Conversa liberada por ${fromUser.rows[0]?.name || 'Sistema'}${note ? `: "${note}"` : ''}`;

    await query(
      `INSERT INTO chat_messages 
        (conversation_id, from_me, content, message_type, status, timestamp)
       VALUES ($1, true, $2, 'system', 'sent', NOW())`,
      [id, transferMessage]
    );

    res.json({ success: true, message: 'Conversa transferida com sucesso' });
  } catch (error) {
    console.error('Transfer conversation error:', error);
    res.status(500).json({ error: 'Erro ao transferir conversa' });
  }
});

// ==========================================
// INTERNAL NOTES
// ==========================================

// Get notes for a conversation
router.get('/conversations/:id/notes', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Verify user has access to this conversation
    const conv = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const result = await query(
      `SELECT cn.*, u.name as user_name
       FROM conversation_notes cn
       LEFT JOIN users u ON u.id = cn.user_id
       WHERE cn.conversation_id = $1
       ORDER BY cn.created_at DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Erro ao buscar anotações' });
  }
});

// Create note
router.post('/conversations/:id/notes', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Conteúdo é obrigatório' });
    }

    // Verify user has access to this conversation
    const conv = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const result = await query(
      `INSERT INTO conversation_notes (conversation_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, req.userId, content.trim()]
    );

    // Get user name
    const user = await query(`SELECT name FROM users WHERE id = $1`, [req.userId]);
    const note = {
      ...result.rows[0],
      user_name: user.rows[0]?.name || null,
    };

    res.status(201).json(note);
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Erro ao criar anotação' });
  }
});

// Update note
router.patch('/conversations/:id/notes/:noteId', authenticate, async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const { content } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Conteúdo é obrigatório' });
    }

    // Verify user has access to this conversation
    const conv = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Only allow editing own notes
    const result = await query(
      `UPDATE conversation_notes 
       SET content = $1, updated_at = NOW()
       WHERE id = $2 AND conversation_id = $3 AND user_id = $4
       RETURNING *`,
      [content.trim(), noteId, id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anotação não encontrada ou sem permissão' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Erro ao atualizar anotação' });
  }
});

// Delete note
router.delete('/conversations/:id/notes/:noteId', authenticate, async (req, res) => {
  try {
    const { id, noteId } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Verify user has access to this conversation
    const conv = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Only allow deleting own notes
    const result = await query(
      `DELETE FROM conversation_notes 
       WHERE id = $1 AND conversation_id = $2 AND user_id = $3
       RETURNING id`,
      [noteId, id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anotação não encontrada ou sem permissão' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Erro ao excluir anotação' });
  }
});

// ==========================================
// SCHEDULED MESSAGES
// ==========================================

// Get scheduled messages for a conversation
router.get('/conversations/:id/scheduled', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    // Check access
    const check = await query(
      `SELECT id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const result = await query(
      `SELECT sm.*, u.name as sender_name
       FROM scheduled_messages sm
       LEFT JOIN users u ON u.id = sm.sender_id
       WHERE sm.conversation_id = $1 AND sm.status = 'pending'
       ORDER BY sm.scheduled_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get scheduled messages error:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens agendadas' });
  }
});

// Schedule a message
router.post('/conversations/:id/schedule', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, message_type = 'text', media_url, media_mimetype, scheduled_at, timezone = 'America/Sao_Paulo' } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    if (!scheduled_at) {
      return res.status(400).json({ error: 'Data/hora de agendamento é obrigatória' });
    }

    // Check access and get connection_id
    const convResult = await query(
      `SELECT id, connection_id FROM conversations WHERE id = $1 AND connection_id = ANY($2)`,
      [id, connectionIds]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const scheduledDate = new Date(scheduled_at);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'Data de agendamento deve ser no futuro' });
    }

    const result = await query(
      `INSERT INTO scheduled_messages 
        (conversation_id, connection_id, sender_id, content, message_type, media_url, media_mimetype, scheduled_at, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        convResult.rows[0].connection_id,
        req.userId,
        content,
        message_type,
        media_url || null,
        media_mimetype || null,
        scheduledDate,
        timezone
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Schedule message error:', error);
    res.status(500).json({ error: 'Erro ao agendar mensagem' });
  }
});

// Cancel a scheduled message
router.delete('/scheduled/:messageId', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    const result = await query(
      `UPDATE scheduled_messages 
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 
         AND connection_id = ANY($2)
         AND status = 'pending'
       RETURNING id`,
      [messageId, connectionIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mensagem agendada não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel scheduled message error:', error);
    res.status(500).json({ error: 'Erro ao cancelar mensagem agendada' });
  }
});

// Get all pending scheduled messages count for user
router.get('/scheduled/count', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);

    const result = await query(
      `SELECT COUNT(*) as count
       FROM scheduled_messages
       WHERE connection_id = ANY($1) AND status = 'pending'`,
      [connectionIds]
    );

    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    console.error('Get scheduled count error:', error);
    res.status(500).json({ error: 'Erro ao buscar contagem' });
  }
});

// Get all scheduled messages (for Agendamentos page)
router.get('/scheduled/all', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);
    const { status } = req.query;

    if (connectionIds.length === 0) {
      return res.json([]);
    }

    let sql = `
      SELECT sm.*, 
        u.name as sender_name,
        c.contact_name,
        c.contact_phone,
        conn.name as connection_name
      FROM scheduled_messages sm
      LEFT JOIN users u ON u.id = sm.sender_id
      LEFT JOIN conversations c ON c.id = sm.conversation_id
      LEFT JOIN connections conn ON conn.id = sm.connection_id
      WHERE sm.connection_id = ANY($1)
    `;
    
    const params = [connectionIds];
    
    if (status && status !== 'all') {
      sql += ` AND sm.status = $2`;
      params.push(status);
    }
    
    sql += ` ORDER BY sm.scheduled_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get all scheduled messages error:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Update scheduled message
router.patch('/scheduled/:messageId', authenticate, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content, scheduled_at } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      values.push(content);
      paramIndex++;
    }

    if (scheduled_at) {
      const newDate = new Date(scheduled_at);
      if (newDate <= new Date()) {
        return res.status(400).json({ error: 'Data de agendamento deve ser no futuro' });
      }
      updates.push(`scheduled_at = $${paramIndex}`);
      values.push(newDate);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhuma atualização fornecida' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(messageId, connectionIds);

    const result = await query(
      `UPDATE scheduled_messages 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} 
         AND connection_id = ANY($${paramIndex + 1})
         AND status = 'pending'
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update scheduled message error:', error);
    res.status(500).json({ error: 'Erro ao atualizar agendamento' });
  }
});

// ==========================================
// CHAT CONTACTS
// ==========================================

// Get all contacts from conversations (legacy/debug)
// NOTE: The main agenda endpoint is GET /contacts further below (chat_contacts + auto-populate).
router.get('/contacts/conversations', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);

    if (connectionIds.length === 0) {
      return res.json([]);
    }

    const result = await query(
      `
      SELECT 
        conv.id,
        conv.id as conversation_id,
        conv.contact_name,
        conv.contact_phone,
        conv.connection_id,
        conn.name as connection_name,
        conv.last_message_at,
        conv.unread_count
      FROM conversations conv
      JOIN connections conn ON conn.id = conv.connection_id
      WHERE conv.connection_id = ANY($1) AND conv.is_archived = false
      ORDER BY conv.contact_name NULLS LAST, conv.contact_phone
      `,
      [connectionIds]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get conversation contacts error:', error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

// Update conversation contact name
router.patch('/conversations/:id/contact', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { contact_name } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    const result = await query(
      `UPDATE conversations 
       SET contact_name = $1, updated_at = NOW()
       WHERE id = $2 AND connection_id = ANY($3)
       RETURNING *`,
      [contact_name, id, connectionIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// ==========================================
// ALERTS / NOTIFICATIONS
// ==========================================

// Get unread alerts for user
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM user_alerts 
       WHERE user_id = $1 AND is_read = false 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
});

// Mark alerts as read
router.post('/alerts/read', authenticate, async (req, res) => {
  try {
    const { alert_ids } = req.body;

    if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
      return res.status(400).json({ error: 'IDs de alertas são obrigatórios' });
    }

    await query(
      `UPDATE user_alerts 
       SET is_read = true 
       WHERE id = ANY($1) AND user_id = $2`,
      [alert_ids, req.userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark alerts read error:', error);
    res.status(500).json({ error: 'Erro ao marcar alertas como lidos' });
  }
});

// Mark all alerts as read
router.post('/alerts/read-all', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE user_alerts SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({ error: 'Erro ao marcar alertas como lidos' });
  }
});

// ==========================================
// IMPORT CONTACTS TO AGENDA (chat_contacts - not conversations)
// ==========================================

router.post('/contacts/import', authenticate, async (req, res) => {
  try {
    const { contacts, connection_id } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Lista de contatos é obrigatória' });
    }

    if (!connection_id) {
      return res.status(400).json({ error: 'Conexão é obrigatória' });
    }

    const connectionIds = await getUserConnections(req.userId);

    // Verify user has access to this connection
    if (!connectionIds.includes(connection_id)) {
      return res.status(403).json({ error: 'Sem acesso a esta conexão' });
    }

    // Check if connection exists
    const connResult = await query(
      `SELECT id, status, instance_name FROM connections WHERE id = $1`,
      [connection_id]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    let imported = 0;
    let duplicates = 0;
    const errors = [];

    for (const contact of contacts) {
      const { name, phone } = contact;

      if (!phone) {
        errors.push(`Contato sem telefone: ${name || 'sem nome'}`);
        continue;
      }

      // Normalize phone number
      let normalizedPhone = phone.replace(/\D/g, '');
      
      // Ensure country code
      if (!normalizedPhone.startsWith('55') && normalizedPhone.length <= 11) {
        normalizedPhone = '55' + normalizedPhone;
      }

      // Generate JID
      const jid = `${normalizedPhone}@s.whatsapp.net`;

      try {
        // Insert or update contact in agenda (restore if was deleted)
        const result = await query(
          `INSERT INTO chat_contacts 
            (connection_id, name, phone, jid, created_by, created_at, updated_at, is_deleted)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), false)
           ON CONFLICT (connection_id, phone) 
           DO UPDATE SET 
             name = EXCLUDED.name, 
             updated_at = NOW(),
             is_deleted = false,
             deleted_at = NULL
           RETURNING id, (xmax = 0) as is_new, (is_deleted = false AND xmax <> 0) as was_restored`,
          [connection_id, name || normalizedPhone, normalizedPhone, jid, req.userId]
        );

        // Count as imported if new OR was restored from deleted state
        if (result.rows[0].is_new || result.rows[0].was_restored) {
          imported++;
        } else {
          duplicates++;
        }
      } catch (err) {
        errors.push(`Erro ao importar ${name || phone}: ${err.message}`);
      }
    }

    res.json({ imported, duplicates, errors: errors.slice(0, 10) });
  } catch (error) {
    console.error('Import contacts error:', error);
    res.status(500).json({ error: 'Erro ao importar contatos' });
  }
});

// Get contacts from agenda (chat_contacts). Also auto-populate from existing conversations.
router.get('/contacts', authenticate, async (req, res) => {
  try {
    const connectionIds = await getUserConnections(req.userId);

    if (connectionIds.length === 0) {
      return res.json([]);
    }

    const { search, connection } = req.query;

    // Auto-populate agenda with contacts from existing conversations
    // IMPORTANT: do not resurrect contacts that the user deleted (is_deleted=true)
    // IMPORTANT: exclude group chats (JIDs ending with @g.us)
    try {
      await query(
        `INSERT INTO chat_contacts (connection_id, name, phone, jid, created_by, created_at, updated_at, is_deleted)
         SELECT 
           conv.connection_id,
           COALESCE(NULLIF(conv.contact_name, ''), conv.contact_phone) as name,
           conv.contact_phone as phone,
           conv.remote_jid as jid,
           conv.assigned_to as created_by,
           conv.created_at,
           NOW(),
           false
         FROM conversations conv
         WHERE conv.connection_id = ANY($1)
           AND conv.contact_phone IS NOT NULL
           AND conv.contact_phone <> ''
           AND (conv.remote_jid IS NULL OR conv.remote_jid NOT LIKE '%@g.us')
         ON CONFLICT (connection_id, phone)
         DO UPDATE SET
           name = COALESCE(NULLIF(EXCLUDED.name, ''), chat_contacts.name),
           jid = COALESCE(EXCLUDED.jid, chat_contacts.jid),
           updated_at = NOW()
         WHERE COALESCE(chat_contacts.is_deleted, false) = false`,
        [connectionIds]
      );
    } catch (autoPopulateError) {
      // Log but don't fail if auto-populate has issues
      console.warn('Auto-populate chat contacts failed (non-critical):', autoPopulateError.message);
    }

    let sql = `
      SELECT 
        cc.id,
        cc.name,
        cc.phone,
        cc.jid,
        cc.connection_id,
        c.name as connection_name,
        EXISTS (
          SELECT 1 FROM conversations conv 
          WHERE conv.connection_id = cc.connection_id
            AND (conv.contact_phone = cc.phone OR conv.remote_jid = cc.jid)
        ) as has_conversation,
        cc.created_at
      FROM chat_contacts cc
      JOIN connections c ON c.id = cc.connection_id
      WHERE cc.connection_id = ANY($1)
        AND COALESCE(cc.is_deleted, false) = false
        AND (cc.jid IS NULL OR cc.jid NOT LIKE '%@g.us')
    `;

    const params = [connectionIds];
    let paramIndex = 2;

    if (connection && connection !== 'all') {
      sql += ` AND cc.connection_id = $${paramIndex}`;
      params.push(connection);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (cc.name ILIKE $${paramIndex} OR cc.phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY cc.name ASC NULLS LAST LIMIT 200`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get chat contacts error:', error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

// Update contact in agenda
router.patch('/contacts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      `UPDATE chat_contacts 
       SET name = $1, updated_at = NOW()
       WHERE id = $2 AND connection_id = ANY($3)
       RETURNING *`,
      [name.trim(), id, connectionIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update chat contact error:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Update or create contact by phone and connection_id (for inline editing from chat)
router.post('/contacts/by-phone', authenticate, async (req, res) => {
  try {
    const { phone, connection_id, name } = req.body;
    const connectionIds = await getUserConnections(req.userId);

    if (!phone || !connection_id || !name) {
      return res.status(400).json({ error: 'phone, connection_id e name são obrigatórios' });
    }

    // Verify connection belongs to user
    if (!connectionIds.includes(connection_id)) {
      return res.status(403).json({ error: 'Conexão não autorizada' });
    }

    // Upsert contact
    const contactResult = await query(
      `INSERT INTO chat_contacts (connection_id, phone, name, created_by, created_at, updated_at, is_deleted)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), false)
       ON CONFLICT (connection_id, phone)
       DO UPDATE SET name = $3, updated_at = NOW(), is_deleted = false
       RETURNING *`,
      [connection_id, phone, name.trim(), req.userId]
    );

    // Also update contact_name in all conversations with this phone
    await query(
      `UPDATE conversations
       SET contact_name = $1, updated_at = NOW()
       WHERE connection_id = $2
         AND (contact_phone = $3 OR remote_jid LIKE $4 OR remote_jid LIKE $5)`,
      [name.trim(), connection_id, phone, `${phone}@s.whatsapp.net`, `${phone}@%`]
    );

    res.json(contactResult.rows[0]);
  } catch (error) {
    console.error('Upsert chat contact error:', error);
    res.status(500).json({ error: 'Erro ao salvar contato' });
  }
});

// Delete contact from agenda (soft delete to prevent reappearing from conversation sync)
router.delete('/contacts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const connectionIds = await getUserConnections(req.userId);

    const result = await query(
      `UPDATE chat_contacts
       SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND connection_id = ANY($2)
       RETURNING id`,
      [id, connectionIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat contact error:', error);
    res.status(500).json({ error: 'Erro ao excluir contato' });
  }
});

// Bulk delete contacts from agenda (soft delete)
router.post('/contacts/bulk-delete', authenticate, async (req, res) => {
  try {
    const { contact_ids } = req.body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'Nenhum contato selecionado' });
    }

    const connectionIds = await getUserConnections(req.userId);

    const result = await query(
      `UPDATE chat_contacts
       SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1) AND connection_id = ANY($2)
       RETURNING id`,
      [contact_ids, connectionIds]
    );

    res.json({ 
      success: true, 
      deleted: result.rows.length 
    });
  } catch (error) {
    console.error('Bulk delete chat contacts error:', error);
    res.status(500).json({ error: 'Erro ao excluir contatos' });
  }
});

// ==========================================
// CREATE NEW CONVERSATION
// ==========================================

// Create a new conversation (start chat with a contact)
router.post('/conversations', authenticate, async (req, res) => {
  try {
    const { contact_phone, contact_name, connection_id } = req.body;

    if (!contact_phone || !connection_id) {
      return res.status(400).json({ error: 'Telefone e conexão são obrigatórios' });
    }

    const connectionIds = await getUserConnections(req.userId);

    // Verify user has access to this connection
    if (!connectionIds.includes(connection_id)) {
      return res.status(403).json({ error: 'Sem acesso a esta conexão' });
    }

    // Check if connection exists and is active
    const connResult = await query(
      `SELECT id, status, instance_name FROM connections WHERE id = $1`,
      [connection_id]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    if (connResult.rows[0].status !== 'connected') {
      return res.status(400).json({ error: 'Conexão não está ativa' });
    }

    // Normalize phone number - remove all non-digits
    let phone = contact_phone.replace(/\D/g, '');
    
    // Remove country code 55 if present for comparison, then add it back
    let phoneWithoutCountry = phone;
    if (phone.startsWith('55') && phone.length > 11) {
      phoneWithoutCountry = phone.substring(2);
    }
    
    // Ensure country code
    if (!phone.startsWith('55')) {
      phone = '55' + phone;
    }

    // Generate remote JID variants
    const remoteJid = `${phone}@s.whatsapp.net`;
    const remoteJidLid = `${phone}@lid`;

    // Check if conversation already exists - comprehensive search
    // Search by: exact remote_jid, @lid variant, contact_phone with/without country code
    const existingConv = await query(
      `SELECT id FROM conversations 
       WHERE connection_id = $1 AND (
         remote_jid = $2 OR 
         remote_jid = $3 OR 
         remote_jid LIKE $4 OR
         contact_phone = $5 OR 
         contact_phone = $6 OR
         contact_phone = $7
       )
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 1`,
      [
        connection_id, 
        remoteJid, 
        remoteJidLid,
        `%${phoneWithoutCountry}@%`,
        phone, 
        phoneWithoutCountry,
        contact_phone.replace(/\D/g, '') // original input cleaned
      ]
    );

    if (existingConv.rows.length > 0) {
      // Update contact name if provided and different
      if (contact_name) {
        await query(
          `UPDATE conversations SET contact_name = $1, updated_at = NOW() 
           WHERE id = $2 AND (contact_name IS NULL OR contact_name = contact_phone OR contact_name = '')`,
          [contact_name, existingConv.rows[0].id]
        );
      }
      
      // Return existing conversation
      const fullConv = await query(
        `SELECT 
          conv.*,
          conn.name as connection_name,
          u.name as assigned_name,
          COALESCE(
            (SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color))
             FROM conversation_tag_links ctl
             JOIN conversation_tags t ON t.id = ctl.tag_id
             WHERE ctl.conversation_id = conv.id
            ), '[]'::json
          ) as tags
        FROM conversations conv
        JOIN connections conn ON conn.id = conv.connection_id
        LEFT JOIN users u ON u.id = conv.assigned_to
        WHERE conv.id = $1`,
        [existingConv.rows[0].id]
      );
      return res.json({ ...fullConv.rows[0], existed: true });
    }

    // Create new conversation - when user creates manually, they are attending it
    const result = await query(
      `INSERT INTO conversations 
        (connection_id, remote_jid, contact_phone, contact_name, assigned_to, is_archived, unread_count, attendance_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, 0, 'attending', NOW(), NOW())
       RETURNING *`,
      [connection_id, remoteJid, phone, contact_name || phone, req.userId]
    );

    const conversation = result.rows[0];

    // Return full conversation with connection info
    const fullConv = await query(
      `SELECT 
        conv.*,
        conn.name as connection_name,
        u.name as assigned_name,
        '[]'::json as tags
      FROM conversations conv
      JOIN connections conn ON conn.id = conv.connection_id
      LEFT JOIN users u ON u.id = conv.assigned_to
      WHERE conv.id = $1`,
      [conversation.id]
    );

    res.status(201).json(fullConv.rows[0]);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Erro ao criar conversa' });
  }
});

export default router;
