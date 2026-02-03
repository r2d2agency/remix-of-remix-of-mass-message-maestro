import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get user's organization
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

// ==========================================
// SEQUENCES CRUD
// ==========================================

// List sequences
router.get('/', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const result = await query(
      `SELECT 
        s.*,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM nurturing_sequence_steps WHERE sequence_id = s.id) as steps_count
       FROM nurturing_sequences s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.organization_id = $1
       ORDER BY s.created_at DESC`,
      [userOrg.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List sequences error:', error);
    res.status(500).json({ error: 'Erro ao listar sequências' });
  }
});

// Get single sequence with steps
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;

    const seqResult = await query(
      `SELECT s.*, u.name as created_by_name
       FROM nurturing_sequences s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.id = $1 AND s.organization_id = $2`,
      [id, userOrg.organization_id]
    );

    if (seqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sequência não encontrada' });
    }

    const sequence = seqResult.rows[0];

    // Get steps
    const stepsResult = await query(
      `SELECT * FROM nurturing_sequence_steps
       WHERE sequence_id = $1
       ORDER BY step_order ASC`,
      [id]
    );

    sequence.steps = stepsResult.rows;

    res.json(sequence);
  } catch (error) {
    console.error('Get sequence error:', error);
    res.status(500).json({ error: 'Erro ao buscar sequência' });
  }
});

// Create sequence
router.post('/', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { 
      name, 
      description, 
      trigger_type = 'manual',
      trigger_config = {},
      pause_on_reply = true,
      pause_on_deal_won = true,
      exit_on_reply = false,
      steps = []
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    // Create sequence
    const seqResult = await query(
      `INSERT INTO nurturing_sequences 
        (organization_id, name, description, trigger_type, trigger_config, 
         pause_on_reply, pause_on_deal_won, exit_on_reply, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userOrg.organization_id,
        name,
        description,
        trigger_type,
        JSON.stringify(trigger_config),
        pause_on_reply,
        pause_on_deal_won,
        exit_on_reply,
        req.userId
      ]
    );

    const sequence = seqResult.rows[0];

    // Create steps if provided
    if (steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await query(
          `INSERT INTO nurturing_sequence_steps 
            (sequence_id, step_order, delay_value, delay_unit, channel,
             whatsapp_content, whatsapp_media_url, whatsapp_media_type,
             email_subject, email_body, email_template_id, conditions, skip_if_replied)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            sequence.id,
            i + 1,
            step.delay_value || 1,
            step.delay_unit || 'days',
            step.channel,
            step.whatsapp_content,
            step.whatsapp_media_url,
            step.whatsapp_media_type,
            step.email_subject,
            step.email_body,
            step.email_template_id,
            JSON.stringify(step.conditions || {}),
            step.skip_if_replied !== false
          ]
        );
      }
    }

    res.status(201).json(sequence);
  } catch (error) {
    console.error('Create sequence error:', error);
    res.status(500).json({ error: 'Erro ao criar sequência' });
  }
});

// Update sequence
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const allowedFields = [
      'name', 'description', 'trigger_type', 'trigger_config',
      'is_active', 'pause_on_reply', 'pause_on_deal_won', 'exit_on_reply'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(field === 'trigger_config' ? JSON.stringify(updates[field]) : updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id, userOrg.organization_id);

    const result = await query(
      `UPDATE nurturing_sequences 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sequência não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update sequence error:', error);
    res.status(500).json({ error: 'Erro ao atualizar sequência' });
  }
});

// Delete sequence
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;

    const result = await query(
      `DELETE FROM nurturing_sequences 
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [id, userOrg.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sequência não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete sequence error:', error);
    res.status(500).json({ error: 'Erro ao excluir sequência' });
  }
});

// ==========================================
// STEPS CRUD
// ==========================================

// Add step to sequence
router.post('/:id/steps', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;
    const step = req.body;

    // Verify sequence ownership
    const seqCheck = await query(
      `SELECT id FROM nurturing_sequences WHERE id = $1 AND organization_id = $2`,
      [id, userOrg.organization_id]
    );

    if (seqCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sequência não encontrada' });
    }

    // Get next step order
    const orderResult = await query(
      `SELECT COALESCE(MAX(step_order), 0) + 1 as next_order 
       FROM nurturing_sequence_steps WHERE sequence_id = $1`,
      [id]
    );

    const nextOrder = orderResult.rows[0].next_order;

    const result = await query(
      `INSERT INTO nurturing_sequence_steps 
        (sequence_id, step_order, delay_value, delay_unit, channel,
         whatsapp_content, whatsapp_media_url, whatsapp_media_type,
         email_subject, email_body, email_template_id, conditions, skip_if_replied)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        nextOrder,
        step.delay_value || 1,
        step.delay_unit || 'days',
        step.channel,
        step.whatsapp_content,
        step.whatsapp_media_url,
        step.whatsapp_media_type,
        step.email_subject,
        step.email_body,
        step.email_template_id,
        JSON.stringify(step.conditions || {}),
        step.skip_if_replied !== false
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add step error:', error);
    res.status(500).json({ error: 'Erro ao adicionar passo' });
  }
});

// Update step
router.patch('/steps/:stepId', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { stepId } = req.params;
    const updates = req.body;

    // Verify step belongs to user's org
    const stepCheck = await query(
      `SELECT ss.id FROM nurturing_sequence_steps ss
       JOIN nurturing_sequences s ON s.id = ss.sequence_id
       WHERE ss.id = $1 AND s.organization_id = $2`,
      [stepId, userOrg.organization_id]
    );

    if (stepCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Passo não encontrado' });
    }

    // Build update query
    const allowedFields = [
      'delay_value', 'delay_unit', 'channel',
      'whatsapp_content', 'whatsapp_media_url', 'whatsapp_media_type',
      'email_subject', 'email_body', 'email_template_id',
      'conditions', 'skip_if_replied'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(field === 'conditions' ? JSON.stringify(updates[field]) : updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(stepId);

    const result = await query(
      `UPDATE nurturing_sequence_steps 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update step error:', error);
    res.status(500).json({ error: 'Erro ao atualizar passo' });
  }
});

// Delete step
router.delete('/steps/:stepId', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { stepId } = req.params;

    // Verify and delete
    const result = await query(
      `DELETE FROM nurturing_sequence_steps ss
       USING nurturing_sequences s
       WHERE ss.id = $1 AND ss.sequence_id = s.id AND s.organization_id = $2
       RETURNING ss.id, ss.sequence_id`,
      [stepId, userOrg.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Passo não encontrado' });
    }

    // Reorder remaining steps
    await query(
      `WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY step_order) as new_order
        FROM nurturing_sequence_steps
        WHERE sequence_id = $1
      )
      UPDATE nurturing_sequence_steps ss
      SET step_order = o.new_order
      FROM ordered o
      WHERE ss.id = o.id`,
      [result.rows[0].sequence_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete step error:', error);
    res.status(500).json({ error: 'Erro ao excluir passo' });
  }
});

// ==========================================
// ENROLLMENTS
// ==========================================

// Get enrollments for a sequence
router.get('/:id/enrollments', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;
    const { status } = req.query;

    let whereClause = 'e.sequence_id = $1 AND e.organization_id = $2';
    const params = [id, userOrg.organization_id];

    if (status) {
      whereClause += ' AND e.status = $3';
      params.push(status);
    }

    const result = await query(
      `SELECT 
        e.*,
        (SELECT COUNT(*) FROM nurturing_step_logs WHERE enrollment_id = e.id) as steps_executed
       FROM nurturing_enrollments e
       WHERE ${whereClause}
       ORDER BY e.enrolled_at DESC
       LIMIT 100`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ error: 'Erro ao buscar inscrições' });
  }
});

// Enroll contact in sequence
router.post('/:id/enroll', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;
    const { 
      contact_phone, 
      contact_email, 
      contact_name,
      conversation_id,
      deal_id,
      variables = {}
    } = req.body;

    if (!contact_phone && !contact_email) {
      return res.status(400).json({ error: 'Telefone ou email é obrigatório' });
    }

    // Verify sequence exists and is active
    const seqCheck = await query(
      `SELECT id, is_active FROM nurturing_sequences 
       WHERE id = $1 AND organization_id = $2`,
      [id, userOrg.organization_id]
    );

    if (seqCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sequência não encontrada' });
    }

    if (!seqCheck.rows[0].is_active) {
      return res.status(400).json({ error: 'Sequência não está ativa' });
    }

    // Get first step delay
    const firstStep = await query(
      `SELECT delay_value, delay_unit FROM nurturing_sequence_steps
       WHERE sequence_id = $1
       ORDER BY step_order ASC
       LIMIT 1`,
      [id]
    );

    // Calculate next_step_at
    let nextStepAt = new Date();
    if (firstStep.rows.length > 0) {
      const { delay_value, delay_unit } = firstStep.rows[0];
      switch (delay_unit) {
        case 'minutes':
          nextStepAt.setMinutes(nextStepAt.getMinutes() + delay_value);
          break;
        case 'hours':
          nextStepAt.setHours(nextStepAt.getHours() + delay_value);
          break;
        case 'days':
        default:
          nextStepAt.setDate(nextStepAt.getDate() + delay_value);
          break;
      }
    }

    // Create enrollment (upsert)
    const result = await query(
      `INSERT INTO nurturing_enrollments 
        (sequence_id, organization_id, contact_phone, contact_email, contact_name,
         conversation_id, deal_id, current_step, status, next_step_at, variables)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'active', $8, $9)
       ON CONFLICT (sequence_id, contact_phone) 
       DO UPDATE SET 
         status = 'active',
         current_step = 0,
         next_step_at = $8,
         paused_at = NULL,
         variables = $9,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        userOrg.organization_id,
        contact_phone,
        contact_email,
        contact_name,
        conversation_id,
        deal_id,
        nextStepAt.toISOString(),
        JSON.stringify(variables)
      ]
    );

    // Update sequence stats
    await query(
      `UPDATE nurturing_sequences 
       SET contacts_enrolled = contacts_enrolled + 1, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Enroll contact error:', error);
    res.status(500).json({ error: 'Erro ao inscrever contato' });
  }
});

// Pause enrollment
router.post('/enrollments/:enrollmentId/pause', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { enrollmentId } = req.params;
    const { reason = 'manual' } = req.body;

    const result = await query(
      `UPDATE nurturing_enrollments 
       SET status = 'paused', pause_reason = $1, paused_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [reason, enrollmentId, userOrg.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inscrição não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Pause enrollment error:', error);
    res.status(500).json({ error: 'Erro ao pausar inscrição' });
  }
});

// Resume enrollment
router.post('/enrollments/:enrollmentId/resume', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { enrollmentId } = req.params;

    // Calculate next step time (resume immediately or with delay)
    const nextStepAt = new Date();
    nextStepAt.setMinutes(nextStepAt.getMinutes() + 5); // Resume in 5 minutes

    const result = await query(
      `UPDATE nurturing_enrollments 
       SET status = 'active', pause_reason = NULL, paused_at = NULL, 
           next_step_at = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 AND status = 'paused'
       RETURNING *`,
      [nextStepAt.toISOString(), enrollmentId, userOrg.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inscrição não encontrada ou não está pausada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Resume enrollment error:', error);
    res.status(500).json({ error: 'Erro ao retomar inscrição' });
  }
});

// Remove enrollment
router.delete('/enrollments/:enrollmentId', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { enrollmentId } = req.params;

    const result = await query(
      `DELETE FROM nurturing_enrollments 
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [enrollmentId, userOrg.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inscrição não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete enrollment error:', error);
    res.status(500).json({ error: 'Erro ao remover inscrição' });
  }
});

// Get enrollment logs
router.get('/enrollments/:enrollmentId/logs', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { enrollmentId } = req.params;

    const result = await query(
      `SELECT l.*, s.step_order, s.channel as step_channel
       FROM nurturing_step_logs l
       JOIN nurturing_sequence_steps s ON s.id = l.step_id
       JOIN nurturing_enrollments e ON e.id = l.enrollment_id
       WHERE l.enrollment_id = $1 AND e.organization_id = $2
       ORDER BY l.created_at DESC`,
      [enrollmentId, userOrg.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get enrollment logs error:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// ==========================================
// SEQUENCE STATS
// ==========================================

router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const userOrg = await getUserOrganization(req.userId);
    if (!userOrg) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }

    const { id } = req.params;

    // Get enrollment stats
    const enrollmentStats = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'paused') as paused,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'exited') as exited,
        COUNT(*) FILTER (WHERE status = 'converted') as converted
       FROM nurturing_enrollments
       WHERE sequence_id = $1 AND organization_id = $2`,
      [id, userOrg.organization_id]
    );

    // Get step stats
    const stepStats = await query(
      `SELECT 
        s.id,
        s.step_order,
        s.channel,
        s.sent_count,
        s.opened_count,
        s.clicked_count,
        s.replied_count
       FROM nurturing_sequence_steps s
       WHERE s.sequence_id = $1
       ORDER BY s.step_order ASC`,
      [id]
    );

    res.json({
      enrollments: enrollmentStats.rows[0],
      steps: stepStats.rows
    });
  } catch (error) {
    console.error('Get sequence stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;
