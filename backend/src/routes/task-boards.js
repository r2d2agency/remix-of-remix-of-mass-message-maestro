import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

// Compat: auth middleware sets req.userId, normalise to req.user for convenience
router.use((req, _res, next) => {
  if (!req.user) req.user = { id: req.userId, email: req.userEmail };
  next();
});

// Helper: Get user's organization
async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// Helper: check admin
function isAdmin(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

// ============ BOARDS ============

// GET /boards - list all boards for user
router.get('/boards', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(`
      SELECT tb.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM task_cards tc WHERE tc.board_id = tb.id) as card_count
      FROM task_boards tb
      LEFT JOIN users u ON u.id = tb.created_by
      WHERE tb.organization_id = $1 
        AND (tb.type = 'global' OR tb.created_by = $2)
      ORDER BY tb.is_default DESC, tb.type ASC, tb.name ASC
    `, [org.organization_id, req.user.id]);

    res.json(result.rows);
  } catch (error) {
    logError('task-boards.list', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /boards - create board
router.post('/boards', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { name, type = 'personal', color = '#6366f1', columns } = req.body;

    // Only admins can create global boards
    if (type === 'global' && !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Apenas admins podem criar quadros globais' });
    }

    const boardResult = await query(`
      INSERT INTO task_boards (organization_id, name, type, created_by, color)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [org.organization_id, name, type, req.user.id, color]);

    const board = boardResult.rows[0];

    // Create default columns
    const defaultCols = columns || [
      { name: 'A Fazer', color: '#94a3b8', position: 0 },
      { name: 'Em Andamento', color: '#3b82f6', position: 1 },
      { name: 'Em Revisão', color: '#f59e0b', position: 2 },
      { name: 'Concluído', color: '#22c55e', position: 3, is_final: true },
    ];

    for (const col of defaultCols) {
      await query(`
        INSERT INTO task_board_columns (board_id, name, color, position, is_final)
        VALUES ($1, $2, $3, $4, $5)
      `, [board.id, col.name, col.color, col.position, col.is_final || false]);
    }

    res.json(board);
  } catch (error) {
    logError('task-boards.create', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /boards/:id
router.put('/boards/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const result = await query(`
      UPDATE task_boards SET name = COALESCE($1, name), color = COALESCE($2, color), updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [name, color, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.update', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /boards/:id
router.delete('/boards/:id', async (req, res) => {
  try {
    await query('DELETE FROM task_boards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError('task-boards.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ COLUMNS ============

// GET /boards/:boardId/columns
router.get('/boards/:boardId/columns', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM task_board_columns WHERE board_id = $1 ORDER BY position ASC
    `, [req.params.boardId]);
    res.json(result.rows);
  } catch (error) {
    logError('task-boards.columns.list', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /boards/:boardId/columns
router.post('/boards/:boardId/columns', async (req, res) => {
  try {
    const { name, color = '#94a3b8', position, is_final = false } = req.body;
    const posResult = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_board_columns WHERE board_id = $1',
      [req.params.boardId]
    );
    const pos = position ?? posResult.rows[0].next_pos;
    
    const result = await query(`
      INSERT INTO task_board_columns (board_id, name, color, position, is_final)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [req.params.boardId, name, color, pos, is_final]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.columns.create', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /columns/:id
router.put('/columns/:id', async (req, res) => {
  try {
    const { name, color, position, is_final } = req.body;
    const result = await query(`
      UPDATE task_board_columns 
      SET name = COALESCE($1, name), color = COALESCE($2, color), 
          position = COALESCE($3, position), is_final = COALESCE($4, is_final)
      WHERE id = $5 RETURNING *
    `, [name, color, position, is_final, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.columns.update', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /columns/:id
router.delete('/columns/:id', async (req, res) => {
  try {
    await query('DELETE FROM task_board_columns WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError('task-boards.columns.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /columns/reorder - reorder columns
router.put('/columns/reorder', async (req, res) => {
  try {
    const { columns } = req.body; // [{id, position}]
    for (const col of columns) {
      await query('UPDATE task_board_columns SET position = $1 WHERE id = $2', [col.position, col.id]);
    }
    res.json({ success: true });
  } catch (error) {
    logError('task-boards.columns.reorder', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CARDS ============

// GET /boards/:boardId/cards
router.get('/boards/:boardId/cards', async (req, res) => {
  try {
    const result = await query(`
      SELECT tc.*, 
        u_assign.name as assigned_to_name,
        u_create.name as created_by_name,
        c.name as contact_name,
        d.title as deal_title
      FROM task_cards tc
      LEFT JOIN users u_assign ON u_assign.id = tc.assigned_to
      LEFT JOIN users u_create ON u_create.id = tc.created_by
      LEFT JOIN contacts c ON c.id = tc.contact_id
      LEFT JOIN crm_deals d ON d.id = tc.deal_id
      WHERE tc.board_id = $1
      ORDER BY tc.position ASC, tc.created_at ASC
    `, [req.params.boardId]);
    res.json(result.rows);
  } catch (error) {
    logError('task-boards.cards.list', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /cards - create card
router.post('/cards', async (req, res) => {
  try {
    const { board_id, column_id, title, description, priority, due_date, assigned_to, contact_id, deal_id, tags, cover_color } = req.body;
    
    const posResult = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_cards WHERE column_id = $1',
      [column_id]
    );
    
    const result = await query(`
      INSERT INTO task_cards (board_id, column_id, title, description, priority, due_date, assigned_to, created_by, contact_id, deal_id, tags, cover_color, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *
    `, [board_id, column_id, title, description, priority || 'medium', due_date, assigned_to, req.user.id, contact_id, deal_id, JSON.stringify(tags || []), cover_color, posResult.rows[0].next_pos]);

    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.cards.create', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /cards/:id
router.put('/cards/:id', async (req, res) => {
  try {
    const { title, description, priority, due_date, assigned_to, contact_id, deal_id, tags, cover_color, status, column_id, position, attachments } = req.body;
    
    let completedAt = null;
    if (status === 'completed') {
      const current = await query('SELECT status FROM task_cards WHERE id = $1', [req.params.id]);
      if (current.rows[0]?.status !== 'completed') completedAt = new Date().toISOString();
    }

    const result = await query(`
      UPDATE task_cards SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        priority = COALESCE($3, priority),
        due_date = COALESCE($4, due_date),
        assigned_to = $5,
        contact_id = $6,
        deal_id = $7,
        tags = COALESCE($8, tags),
        cover_color = $9,
        status = COALESCE($10, status),
        column_id = COALESCE($11, column_id),
        position = COALESCE($12, position),
        attachments = COALESCE($13, attachments),
        completed_at = COALESCE($14, completed_at),
        updated_at = NOW()
      WHERE id = $15 RETURNING *
    `, [title, description, priority, due_date, assigned_to, contact_id, deal_id, tags ? JSON.stringify(tags) : null, cover_color, status, column_id, position, attachments ? JSON.stringify(attachments) : null, completedAt, req.params.id]);
    
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.cards.update', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /cards/:id/move - move card between columns/boards
router.put('/cards/:id/move', async (req, res) => {
  try {
    const { column_id, board_id, position, over_card_id } = req.body;

    if (over_card_id) {
      // Get target card position
      const target = await query('SELECT position, column_id FROM task_cards WHERE id = $1', [over_card_id]);
      if (target.rows[0]) {
        const targetPos = target.rows[0].position;
        const targetCol = column_id || target.rows[0].column_id;
        
        // Shift cards down
        await query(
          'UPDATE task_cards SET position = position + 1 WHERE column_id = $1 AND position >= $2 AND id != $3',
          [targetCol, targetPos, req.params.id]
        );
        
        const updates = { column_id: targetCol, position: targetPos };
        if (board_id) updates.board_id = board_id;
        
        await query(`
          UPDATE task_cards SET column_id = $1, position = $2, board_id = COALESCE($3, board_id), updated_at = NOW()
          WHERE id = $4
        `, [targetCol, targetPos, board_id, req.params.id]);
      }
    } else {
      // Move to end of column
      const posResult = await query(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_cards WHERE column_id = $1',
        [column_id]
      );
      
      await query(`
        UPDATE task_cards SET column_id = $1, position = $2, board_id = COALESCE($3, board_id), updated_at = NOW()
        WHERE id = $4
      `, [column_id, posResult.rows[0].next_pos, board_id, req.params.id]);
    }

    res.json({ success: true });
  } catch (error) {
    logError('task-boards.cards.move', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /cards/:id
router.delete('/cards/:id', async (req, res) => {
  try {
    await query('DELETE FROM task_cards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError('task-boards.cards.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CHECKLISTS ============

// GET /cards/:cardId/checklists
router.get('/cards/:cardId/checklists', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM task_card_checklists WHERE card_id = $1 ORDER BY position ASC',
      [req.params.cardId]
    );
    res.json(result.rows);
  } catch (error) {
    logError('task-boards.checklists.list', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /cards/:cardId/checklists
router.post('/cards/:cardId/checklists', async (req, res) => {
  try {
    const { title = 'Checklist', items = [], template_id } = req.body;
    
    let finalItems = items;
    if (template_id) {
      const tpl = await query('SELECT items FROM task_checklist_templates WHERE id = $1', [template_id]);
      if (tpl.rows[0]) finalItems = tpl.rows[0].items;
    }

    const result = await query(`
      INSERT INTO task_card_checklists (card_id, title, items, template_id)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.params.cardId, title, JSON.stringify(finalItems), template_id]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.checklists.create', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /checklists/:id
router.put('/checklists/:id', async (req, res) => {
  try {
    const { title, items } = req.body;
    const result = await query(`
      UPDATE task_card_checklists SET title = COALESCE($1, title), items = COALESCE($2, items)
      WHERE id = $3 RETURNING *
    `, [title, items ? JSON.stringify(items) : null, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.checklists.update', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /checklists/:id
router.delete('/checklists/:id', async (req, res) => {
  try {
    await query('DELETE FROM task_card_checklists WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError('task-boards.checklists.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CHECKLIST TEMPLATES ============

// GET /checklist-templates
router.get('/checklist-templates', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      'SELECT * FROM task_checklist_templates WHERE organization_id = $1 ORDER BY name ASC',
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (error) {
    logError('task-boards.templates.list', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /checklist-templates
router.post('/checklist-templates', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { name, items = [] } = req.body;
    const result = await query(`
      INSERT INTO task_checklist_templates (organization_id, name, items, created_by)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [org.organization_id, name, JSON.stringify(items), req.user.id]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.templates.create', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /checklist-templates/:id
router.put('/checklist-templates/:id', async (req, res) => {
  try {
    const { name, items } = req.body;
    const result = await query(`
      UPDATE task_checklist_templates SET name = COALESCE($1, name), items = COALESCE($2, items)
      WHERE id = $3 RETURNING *
    `, [name, items ? JSON.stringify(items) : null, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    logError('task-boards.templates.update', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /checklist-templates/:id
router.delete('/checklist-templates/:id', async (req, res) => {
  try {
    await query('DELETE FROM task_checklist_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logError('task-boards.templates.delete', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ ENSURE DEFAULT BOARD ============

// POST /ensure-default - creates the default global board if missing
router.post('/ensure-default', async (req, res) => {
  try {
    const org = await getUserOrg(req.user.id);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    // Check if default global board exists
    const existing = await query(
      'SELECT id FROM task_boards WHERE organization_id = $1 AND is_default = true AND type = $2',
      [org.organization_id, 'global']
    );

    if (existing.rows.length > 0) {
      return res.json({ board_id: existing.rows[0].id, created: false });
    }

    // Create default global board
    const boardResult = await query(`
      INSERT INTO task_boards (organization_id, name, type, created_by, is_default, color)
      VALUES ($1, 'Tarefas Gerais', 'global', $2, true, '#6366f1') RETURNING *
    `, [org.organization_id, req.user.id]);

    const board = boardResult.rows[0];

    const defaultCols = [
      { name: 'A Fazer', color: '#94a3b8', position: 0 },
      { name: 'Em Andamento', color: '#3b82f6', position: 1 },
      { name: 'Em Revisão', color: '#f59e0b', position: 2 },
      { name: 'Concluído', color: '#22c55e', position: 3, is_final: true },
    ];

    for (const col of defaultCols) {
      await query(`
        INSERT INTO task_board_columns (board_id, name, color, position, is_final)
        VALUES ($1, $2, $3, $4, $5)
      `, [board.id, col.name, col.color, col.position, col.is_final || false]);
    }

    res.json({ board_id: board.id, created: true });
  } catch (error) {
    logError('task-boards.ensure-default', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
