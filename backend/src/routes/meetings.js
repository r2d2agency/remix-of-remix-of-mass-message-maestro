import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query, pool } from '../db.js';
import { log, logError } from '../logger.js';
import { callAI } from '../lib/ai-caller.js';

const router = express.Router();

// Helper: get user's org id
async function getOrgId(userId) {
  const r = await query(
    `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.organization_id;
}

// LIST meetings
router.get('/', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.json([]);

    const { contact_id, company_id, lawyer_id, meeting_type, status, process_number, search } = req.query;

    let sql = `SELECT m.*, u.name as lawyer_name, cu.name as created_by_name
               FROM meetings m
               LEFT JOIN users u ON u.id = m.lawyer_user_id
               LEFT JOIN users cu ON cu.id = m.created_by
               WHERE m.organization_id = $1`;
    const params = [orgId];
    let idx = 2;

    if (contact_id) { sql += ` AND m.contact_id = $${idx++}`; params.push(contact_id); }
    if (company_id) { sql += ` AND m.company_id = $${idx++}`; params.push(company_id); }
    if (lawyer_id) { sql += ` AND m.lawyer_user_id = $${idx++}`; params.push(lawyer_id); }
    if (meeting_type) { sql += ` AND m.meeting_type = $${idx++}`; params.push(meeting_type); }
    if (status) { sql += ` AND m.status = $${idx++}`; params.push(status); }
    if (process_number) { sql += ` AND m.process_number ILIKE $${idx++}`; params.push(`%${process_number}%`); }
    if (search) { sql += ` AND (m.title ILIKE $${idx} OR m.transcript ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    sql += ` ORDER BY m.scheduled_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('meetings.list', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single meeting
router.get('/:id', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    const result = await query(
      `SELECT m.*, u.name as lawyer_name, cu.name as created_by_name
       FROM meetings m
       LEFT JOIN users u ON u.id = m.lawyer_user_id
       LEFT JOIN users cu ON cu.id = m.created_by
       WHERE m.id = $1 AND m.organization_id = $2`,
      [req.params.id, orgId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Reunião não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    logError('meetings.get', error);
    res.status(500).json({ error: error.message });
  }
});

// CREATE meeting
router.post('/', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'Organização não encontrada' });

    const {
      title, meeting_type, scheduled_at, duration_minutes, lawyer_user_id,
      team_member_ids, contact_id, company_id, whatsapp_contact_id,
      process_number, deal_id, meeting_link, internal_notes
    } = req.body;

    const result = await query(
      `INSERT INTO meetings (organization_id, title, meeting_type, scheduled_at, duration_minutes,
        lawyer_user_id, team_member_ids, contact_id, company_id, whatsapp_contact_id,
        process_number, deal_id, meeting_link, internal_notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [orgId, title, meeting_type || 'outro', scheduled_at, duration_minutes || null,
       lawyer_user_id || null, team_member_ids || [], contact_id || null, company_id || null,
       whatsapp_contact_id || null, process_number || null, deal_id || null,
       meeting_link || null, internal_notes || null, req.userId]
    );

    log('info', 'meetings.created', { id: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('meetings.create', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE meeting
router.put('/:id', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    const {
      title, meeting_type, scheduled_at, duration_minutes, status, lawyer_user_id,
      team_member_ids, contact_id, company_id, whatsapp_contact_id,
      process_number, deal_id, meeting_link, transcript, summary, key_points,
      client_requests, lawyer_guidance, sensitive_points, risks, cited_documents,
      next_steps, internal_notes
    } = req.body;

    const result = await query(
      `UPDATE meetings SET
        title = COALESCE($3, title),
        meeting_type = COALESCE($4, meeting_type),
        scheduled_at = COALESCE($5, scheduled_at),
        duration_minutes = COALESCE($6, duration_minutes),
        status = COALESCE($7, status),
        lawyer_user_id = COALESCE($8, lawyer_user_id),
        team_member_ids = COALESCE($9, team_member_ids),
        contact_id = COALESCE($10, contact_id),
        company_id = COALESCE($11, company_id),
        whatsapp_contact_id = COALESCE($12, whatsapp_contact_id),
        process_number = COALESCE($13, process_number),
        deal_id = COALESCE($14, deal_id),
        meeting_link = COALESCE($15, meeting_link),
        transcript = COALESCE($16, transcript),
        summary = COALESCE($17, summary),
        key_points = COALESCE($18, key_points),
        client_requests = COALESCE($19, client_requests),
        lawyer_guidance = COALESCE($20, lawyer_guidance),
        sensitive_points = COALESCE($21, sensitive_points),
        risks = COALESCE($22, risks),
        cited_documents = COALESCE($23, cited_documents),
        next_steps = COALESCE($24, next_steps),
        internal_notes = COALESCE($25, internal_notes),
        updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, orgId, title, meeting_type, scheduled_at, duration_minutes,
       status, lawyer_user_id, team_member_ids, contact_id ?? null, company_id ?? null,
       whatsapp_contact_id ?? null, process_number ?? null, deal_id ?? null,
       meeting_link ?? null, transcript, summary, key_points, client_requests,
       lawyer_guidance, sensitive_points, risks, cited_documents, next_steps, internal_notes]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Reunião não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    logError('meetings.update', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE meeting
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    await query(`DELETE FROM meetings WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (error) {
    logError('meetings.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// === MEETING TASKS ===

router.get('/:id/tasks', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT mt.*, u.name as assigned_to_name
       FROM meeting_tasks mt
       LEFT JOIN users u ON u.id = mt.assigned_to
       WHERE mt.meeting_id = $1
       ORDER BY mt.created_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    logError('meetings.tasks.list', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/tasks', authenticate, async (req, res) => {
  try {
    const { description, assigned_to, due_date, priority } = req.body;
    const result = await query(
      `INSERT INTO meeting_tasks (meeting_id, description, assigned_to, due_date, priority)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, description, assigned_to || null, due_date || null, priority || 'medium']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('meetings.tasks.create', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:meetingId/tasks/:taskId', authenticate, async (req, res) => {
  try {
    const { description, assigned_to, due_date, priority, status } = req.body;
    const result = await query(
      `UPDATE meeting_tasks SET
        description = COALESCE($3, description),
        assigned_to = COALESCE($4, assigned_to),
        due_date = COALESCE($5, due_date),
        priority = COALESCE($6, priority),
        status = COALESCE($7, status),
        updated_at = NOW()
       WHERE id = $1 AND meeting_id = $2
       RETURNING *`,
      [req.params.taskId, req.params.meetingId, description, assigned_to, due_date, priority, status]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logError('meetings.tasks.update', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:meetingId/tasks/:taskId', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM meeting_tasks WHERE id = $1 AND meeting_id = $2`,
      [req.params.taskId, req.params.meetingId]);
    res.json({ success: true });
  } catch (error) {
    logError('meetings.tasks.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// === DASHBOARD STATS ===
router.get('/stats/dashboard', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.json({});

    const [recent, byStatus, pendingTasks, byLawyer] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM meetings WHERE organization_id = $1 AND scheduled_at > NOW() - INTERVAL '30 days'`, [orgId]),
      query(`SELECT status, COUNT(*) as count FROM meetings WHERE organization_id = $1 GROUP BY status`, [orgId]),
      query(`SELECT COUNT(*) as total FROM meeting_tasks mt JOIN meetings m ON m.id = mt.meeting_id WHERE m.organization_id = $1 AND mt.status = 'pending'`, [orgId]),
      query(`SELECT u.name, COUNT(*) as count FROM meetings m JOIN users u ON u.id = m.lawyer_user_id WHERE m.organization_id = $1 AND m.scheduled_at > NOW() - INTERVAL '30 days' GROUP BY u.name ORDER BY count DESC LIMIT 10`, [orgId]),
    ]);

    res.json({
      recent_count: parseInt(recent.rows[0]?.total || '0'),
      by_status: byStatus.rows,
      pending_tasks: parseInt(pendingTasks.rows[0]?.total || '0'),
      by_lawyer: byLawyer.rows,
    });
  } catch (error) {
    logError('meetings.stats', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
