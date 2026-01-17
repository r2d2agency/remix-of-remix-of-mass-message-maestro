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

// List campaigns (user's own + organization's)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);

    let whereClause = 'c.user_id = $1';
    let params = [req.userId];

    if (org) {
      // Get campaigns from connections in user's organization
      whereClause = `(c.user_id = $1 OR c.connection_id IN (
        SELECT id FROM connections WHERE organization_id = $2
      ))`;
      params = [req.userId, org.organization_id];
    }

    const result = await query(
      `SELECT c.*, 
              cl.name as list_name,
              mt.name as message_name,
              conn.name as connection_name,
              u.name as created_by_name
       FROM campaigns c
       LEFT JOIN contact_lists cl ON c.list_id = cl.id
       LEFT JOIN message_templates mt ON c.message_id = mt.id
       LEFT JOIN connections conn ON c.connection_id = conn.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List campaigns error:', error);
    res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
});

// Create campaign
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      connection_id, 
      list_id, 
      message_id,
      message_ids, // Support both single and array
      scheduled_at,
      min_delay,
      max_delay 
    } = req.body;

    // Accept message_id or message_ids (take first if array)
    const finalMessageId = message_id || (Array.isArray(message_ids) ? message_ids[0] : null);

    if (!name || !connection_id || !list_id || !finalMessageId) {
      return res.status(400).json({ 
        error: 'Nome, conexão, lista e mensagem são obrigatórios' 
      });
    }

    const org = await getUserOrganization(req.userId);

    // Verify ownership of related resources (including org-level access)
    let connectionCheck, listCheck, messageCheck;

    if (org) {
      // Allow using organization's connections
      connectionCheck = await query(
        'SELECT id FROM connections WHERE id = $1 AND (user_id = $2 OR organization_id = $3)',
        [connection_id, req.userId, org.organization_id]
      );
      // Allow using organization's lists
      listCheck = await query(
        `SELECT id FROM contact_lists WHERE id = $1 AND (
          user_id = $2 OR 
          connection_id IN (SELECT id FROM connections WHERE organization_id = $3)
        )`,
        [list_id, req.userId, org.organization_id]
      );
      // Allow using organization's messages
      messageCheck = await query(
        `SELECT id FROM message_templates WHERE id = $1 AND (
          user_id = $2 OR 
          user_id IN (SELECT user_id FROM organization_members WHERE organization_id = $3)
        )`,
        [finalMessageId, req.userId, org.organization_id]
      );
    } else {
      connectionCheck = await query(
        'SELECT id FROM connections WHERE id = $1 AND user_id = $2',
        [connection_id, req.userId]
      );
      listCheck = await query(
        'SELECT id FROM contact_lists WHERE id = $1 AND user_id = $2',
        [list_id, req.userId]
      );
      messageCheck = await query(
        'SELECT id FROM message_templates WHERE id = $1 AND user_id = $2',
        [finalMessageId, req.userId]
      );
    }

    if (connectionCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Conexão não encontrada ou sem permissão' });
    }
    if (listCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Lista não encontrada ou sem permissão' });
    }
    if (messageCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Mensagem não encontrada ou sem permissão' });
    }

    const result = await query(
      `INSERT INTO campaigns 
       (user_id, name, connection_id, list_id, message_id, scheduled_at, min_delay, max_delay)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        req.userId, 
        name, 
        connection_id, 
        list_id, 
        finalMessageId, 
        scheduled_at || null,
        min_delay || 5,
        max_delay || 15
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Erro ao criar campanha' });
  }
});

// Update campaign status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'running', 'paused', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $2 AND user_id = $3';
    let params = [status, id, req.userId];

    if (org) {
      whereClause = `id = $2 AND (user_id = $3 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $4
      ))`;
      params = [status, id, req.userId, org.organization_id];
    }

    const result = await query(
      `UPDATE campaigns 
       SET status = $1, updated_at = NOW()
       WHERE ${whereClause}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update campaign status error:', error);
    res.status(500).json({ error: 'Erro ao atualizar campanha' });
  }
});

// Get campaign stats
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org) {
      whereClause = `id = $1 AND (user_id = $2 OR connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      ))`;
      params = [id, req.userId, org.organization_id];
    }

    const campaign = await query(
      `SELECT * FROM campaigns WHERE ${whereClause}`,
      params
    );

    if (campaign.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const stats = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'sent') as sent,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM campaign_messages WHERE campaign_id = $1`,
      [id]
    );

    res.json({
      campaign: campaign.rows[0],
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Get campaign stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Get campaign details with all messages
router.get('/:id/details', async (req, res) => {
  try {
    const { id } = req.params;

    const org = await getUserOrganization(req.userId);

    let whereClause = 'c.id = $1 AND c.user_id = $2';
    let params = [id, req.userId];

    if (org) {
      whereClause = `c.id = $1 AND (c.user_id = $2 OR c.connection_id IN (
        SELECT id FROM connections WHERE organization_id = $3
      ))`;
      params = [id, req.userId, org.organization_id];
    }

    // Get campaign with related info
    const campaignResult = await query(
      `SELECT c.*, 
              cl.name as list_name,
              mt.name as message_name,
              conn.name as connection_name,
              (SELECT COUNT(*) FROM contacts WHERE list_id = c.list_id) as total_contacts
       FROM campaigns c
       LEFT JOIN contact_lists cl ON c.list_id = cl.id
       LEFT JOIN message_templates mt ON c.message_id = mt.id
       LEFT JOIN connections conn ON c.connection_id = conn.id
       WHERE ${whereClause}`,
      params
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const campaign = campaignResult.rows[0];

    // Get all campaign messages with contact info
    const messagesResult = await query(
      `SELECT cm.*, 
              co.name as contact_name
       FROM campaign_messages cm
       LEFT JOIN contacts co ON cm.contact_id = co.id
       WHERE cm.campaign_id = $1
       ORDER BY cm.created_at ASC`,
      [id]
    );

    // Calculate stats
    const messages = messagesResult.rows;
    const stats = {
      total: messages.length,
      sent: messages.filter(m => m.status === 'sent').length,
      failed: messages.filter(m => m.status === 'failed').length,
      pending: messages.filter(m => m.status === 'pending').length,
    };

    // Calculate estimated completion time
    let estimatedCompletion = null;
    if (campaign.status === 'running' && stats.pending > 0) {
      const avgDelay = (campaign.min_delay + campaign.max_delay) / 2;
      const pauseMessages = campaign.pause_after_messages || 20;
      const pauseDuration = (campaign.pause_duration || 10) * 60; // Convert to seconds
      
      // Calculate time including pauses
      const remainingMessages = stats.pending;
      const pausesNeeded = Math.floor(remainingMessages / pauseMessages);
      const totalSeconds = (remainingMessages * avgDelay) + (pausesNeeded * pauseDuration);
      
      estimatedCompletion = new Date(Date.now() + totalSeconds * 1000).toISOString();
    }

    // Calculate scheduled times for pending messages
    let currentTime = new Date();
    const avgDelay = (campaign.min_delay + campaign.max_delay) / 2;
    const pauseMessages = campaign.pause_after_messages || 20;
    const pauseDuration = (campaign.pause_duration || 10) * 60;
    
    let sentCount = stats.sent + stats.failed;
    const messagesWithSchedule = messages.map((msg, index) => {
      if (msg.status === 'pending') {
        const position = index - sentCount;
        const pausesBeforeThis = Math.floor(position / pauseMessages);
        const secondsFromNow = (position * avgDelay) + (pausesBeforeThis * pauseDuration);
        const scheduledTime = new Date(currentTime.getTime() + secondsFromNow * 1000);
        return { ...msg, scheduled_time: scheduledTime.toISOString() };
      }
      return msg;
    });

    res.json({
      campaign,
      messages: messagesWithSchedule,
      stats,
      estimatedCompletion,
    });
  } catch (error) {
    console.error('Get campaign details error:', error);
    res.status(500).json({ error: 'Erro ao buscar detalhes da campanha' });
  }
});

// Delete campaign
router.delete('/:id', async (req, res) => {
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
      `DELETE FROM campaigns WHERE ${whereClause} RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Erro ao deletar campanha' });
  }
});

export default router;
