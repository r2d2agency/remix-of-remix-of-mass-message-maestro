import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

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

// Helper: Check if user can manage CRM (admin/owner/manager)
function canManage(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

// Helper: Get user's group IDs (for supervisor visibility)
async function getUserGroupIds(userId) {
  const result = await query(
    `SELECT group_id, is_supervisor FROM crm_user_group_members WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
}

// ============================================
// USER GROUPS
// ============================================

// List groups
router.get('/groups', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT g.*, 
        (SELECT COUNT(*) FROM crm_user_group_members WHERE group_id = g.id) as member_count
       FROM crm_user_groups g 
       WHERE g.organization_id = $1 
       ORDER BY g.name`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create group
router.post('/groups', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { name, description } = req.body;
    const result = await query(
      `INSERT INTO crm_user_groups (organization_id, name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [org.organization_id, name, description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update group
router.put('/groups/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { name, description } = req.body;
    const result = await query(
      `UPDATE crm_user_groups SET name = $1, description = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [name, description, req.params.id, org.organization_id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete group
router.delete('/groups/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await query(
      `DELETE FROM crm_user_groups WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group members
router.get('/groups/:id/members', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT gm.*, u.name, u.email 
       FROM crm_user_group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add member to group
router.post('/groups/:id/members', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { user_id, is_supervisor } = req.body;
    const result = await query(
      `INSERT INTO crm_user_group_members (group_id, user_id, is_supervisor)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE SET is_supervisor = $3
       RETURNING *`,
      [req.params.id, user_id, is_supervisor || false]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding group member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove member from group
router.delete('/groups/:groupId/members/:userId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await query(
      `DELETE FROM crm_user_group_members WHERE group_id = $1 AND user_id = $2`,
      [req.params.groupId, req.params.userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing group member:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FUNNELS
// ============================================

// List funnels
router.get('/funnels', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT f.*, 
        (SELECT COUNT(*) FROM crm_deals WHERE funnel_id = f.id AND status = 'open') as open_deals,
        (SELECT COALESCE(SUM(value), 0) FROM crm_deals WHERE funnel_id = f.id AND status = 'open') as total_value
       FROM crm_funnels f 
       WHERE f.organization_id = $1 AND f.is_active = true
       ORDER BY f.name`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching funnels:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get funnel with stages
router.get('/funnels/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const funnel = await query(
      `SELECT * FROM crm_funnels WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!funnel.rows[0]) return res.status(404).json({ error: 'Funnel not found' });

    const stages = await query(
      `SELECT * FROM crm_stages WHERE funnel_id = $1 ORDER BY position`,
      [req.params.id]
    );

    res.json({ ...funnel.rows[0], stages: stages.rows });
  } catch (error) {
    console.error('Error fetching funnel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create funnel
router.post('/funnels', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { name, description, color, stages } = req.body;
    
    // Create funnel
    const funnelResult = await query(
      `INSERT INTO crm_funnels (organization_id, name, description, color)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [org.organization_id, name, description, color || '#6366f1']
    );
    const funnel = funnelResult.rows[0];

    // Create stages
    if (stages && stages.length > 0) {
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        await query(
          `INSERT INTO crm_stages (funnel_id, name, color, position, inactivity_hours, inactivity_color, is_final)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [funnel.id, stage.name, stage.color || '#6366f1', i, 
           stage.inactivity_hours || 24, stage.inactivity_color || '#ef4444', stage.is_final || false]
        );
      }
    }

    res.json(funnel);
  } catch (error) {
    console.error('Error creating funnel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update funnel
router.put('/funnels/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { name, description, color, is_active, stages } = req.body;
    
    await query(
      `UPDATE crm_funnels SET name = $1, description = $2, color = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND organization_id = $6`,
      [name, description, color, is_active !== false, req.params.id, org.organization_id]
    );

    // Update stages if provided
    if (stages) {
      // Get existing stages
      const existingStages = await query(
        `SELECT id FROM crm_stages WHERE funnel_id = $1`,
        [req.params.id]
      );
      const existingIds = existingStages.rows.map(s => s.id);
      const newIds = stages.filter(s => s.id).map(s => s.id);
      
      // Delete removed stages
      const toDelete = existingIds.filter(id => !newIds.includes(id));
      if (toDelete.length > 0) {
        await query(`DELETE FROM crm_stages WHERE id = ANY($1)`, [toDelete]);
      }

      // Update or insert stages
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.id) {
          await query(
            `UPDATE crm_stages SET name = $1, color = $2, position = $3, 
             inactivity_hours = $4, inactivity_color = $5, is_final = $6, updated_at = NOW()
             WHERE id = $7`,
            [stage.name, stage.color, i, stage.inactivity_hours || 24, 
             stage.inactivity_color || '#ef4444', stage.is_final || false, stage.id]
          );
        } else {
          await query(
            `INSERT INTO crm_stages (funnel_id, name, color, position, inactivity_hours, inactivity_color, is_final)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.params.id, stage.name, stage.color || '#6366f1', i,
             stage.inactivity_hours || 24, stage.inactivity_color || '#ef4444', stage.is_final || false]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating funnel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete funnel
router.delete('/funnels/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org || !canManage(org.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await query(
      `DELETE FROM crm_funnels WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting funnel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMPANIES
// ============================================

// List companies
router.get('/companies', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { search } = req.query;
    let sql = `SELECT c.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM crm_deals WHERE company_id = c.id) as deals_count
      FROM crm_companies c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.organization_id = $1`;
    const params = [org.organization_id];

    if (search) {
      sql += ` AND (c.name ILIKE $2 OR c.cnpj ILIKE $2 OR c.email ILIKE $2)`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY c.name`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get company
router.get('/companies/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT c.*, u.name as created_by_name
       FROM crm_companies c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.id = $1 AND c.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Company not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create company
router.post('/companies', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { name, cnpj, email, phone, website, address, city, state, zip_code, notes, custom_fields } = req.body;
    
    const result = await query(
      `INSERT INTO crm_companies (organization_id, name, cnpj, email, phone, website, address, city, state, zip_code, notes, custom_fields, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [org.organization_id, name, cnpj, email, phone, website, address, city, state, zip_code, notes, 
       custom_fields ? JSON.stringify(custom_fields) : '{}', req.userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update company
router.put('/companies/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { name, cnpj, email, phone, website, address, city, state, zip_code, notes, custom_fields } = req.body;
    
    const result = await query(
      `UPDATE crm_companies SET 
        name = $1, cnpj = $2, email = $3, phone = $4, website = $5, 
        address = $6, city = $7, state = $8, zip_code = $9, notes = $10, 
        custom_fields = $11, updated_at = NOW()
       WHERE id = $12 AND organization_id = $13 RETURNING *`,
      [name, cnpj, email, phone, website, address, city, state, zip_code, notes,
       custom_fields ? JSON.stringify(custom_fields) : '{}', req.params.id, org.organization_id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete company
router.delete('/companies/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    await query(
      `DELETE FROM crm_companies WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import companies (bulk)
router.post('/companies/import', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { companies } = req.body;
    if (!companies || !Array.isArray(companies)) {
      return res.status(400).json({ error: 'Invalid companies data' });
    }

    let imported = 0;
    for (const company of companies) {
      try {
        await query(
          `INSERT INTO crm_companies (organization_id, name, cnpj, email, phone, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [org.organization_id, company.name, company.cnpj, company.email, company.phone, req.userId]
        );
        imported++;
      } catch (e) {
        console.error('Error importing company:', e);
      }
    }

    res.json({ success: true, imported });
  } catch (error) {
    console.error('Error importing companies:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DEALS
// ============================================

// Get deals for kanban (by funnel)
router.get('/funnels/:funnelId/deals', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const userGroups = await getUserGroupIds(req.userId);
    const supervisorGroupIds = userGroups.filter(g => g.is_supervisor).map(g => g.group_id);
    const memberGroupIds = userGroups.map(g => g.group_id);

    // Build visibility filter based on role
    let visibilityFilter = '';
    const params = [req.params.funnelId, org.organization_id];
    
    if (canManage(org.role)) {
      // Admins see all
      visibilityFilter = '';
    } else if (supervisorGroupIds.length > 0) {
      // Supervisors see their group's deals + their own
      visibilityFilter = ` AND (d.owner_id = $3 OR d.group_id = ANY($4))`;
      params.push(req.userId, supervisorGroupIds);
    } else {
      // Regular users see only their own
      visibilityFilter = ` AND d.owner_id = $3`;
      params.push(req.userId);
    }

    const result = await query(
      `SELECT d.*, 
        c.name as company_name,
        u.name as owner_name,
        s.name as stage_name,
        s.color as stage_color,
        s.inactivity_hours,
        s.inactivity_color,
        g.name as group_name,
        (SELECT COUNT(*) FROM crm_tasks WHERE deal_id = d.id AND status = 'pending') as pending_tasks,
        (SELECT json_agg(json_build_object('id', ct.id, 'name', cnt.name, 'phone', cnt.phone, 'is_primary', dc.is_primary))
         FROM crm_deal_contacts dc
         JOIN contacts cnt ON cnt.id = dc.contact_id
         LEFT JOIN crm_tasks ct ON ct.deal_id = d.id
         WHERE dc.deal_id = d.id) as contacts
       FROM crm_deals d
       JOIN crm_companies c ON c.id = d.company_id
       LEFT JOIN users u ON u.id = d.owner_id
       LEFT JOIN crm_stages s ON s.id = d.stage_id
       LEFT JOIN crm_user_groups g ON g.id = d.group_id
       WHERE d.funnel_id = $1 AND d.organization_id = $2 AND d.status = 'open'${visibilityFilter}
       ORDER BY d.created_at DESC`,
      params
    );

    // Group by stage
    const dealsByStage = {};
    result.rows.forEach(deal => {
      if (!dealsByStage[deal.stage_id]) {
        dealsByStage[deal.stage_id] = [];
      }
      dealsByStage[deal.stage_id].push(deal);
    });

    res.json(dealsByStage);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single deal
router.get('/deals/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const deal = await query(
      `SELECT d.*, 
        c.name as company_name, c.cnpj, c.email as company_email, c.phone as company_phone,
        u.name as owner_name,
        f.name as funnel_name,
        s.name as stage_name,
        g.name as group_name
       FROM crm_deals d
       JOIN crm_companies c ON c.id = d.company_id
       LEFT JOIN users u ON u.id = d.owner_id
       LEFT JOIN crm_funnels f ON f.id = d.funnel_id
       LEFT JOIN crm_stages s ON s.id = d.stage_id
       LEFT JOIN crm_user_groups g ON g.id = d.group_id
       WHERE d.id = $1 AND d.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!deal.rows[0]) return res.status(404).json({ error: 'Deal not found' });

    // Update last_opened_at
    await query(`UPDATE crm_deals SET last_opened_at = NOW() WHERE id = $1`, [req.params.id]);

    // Get contacts
    const contacts = await query(
      `SELECT dc.*, cnt.name, cnt.phone, cnt.jid
       FROM crm_deal_contacts dc
       JOIN contacts cnt ON cnt.id = dc.contact_id
       WHERE dc.deal_id = $1`,
      [req.params.id]
    );

    // Get history
    const history = await query(
      `SELECT h.*, u.name as user_name
       FROM crm_deal_history h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.deal_id = $1
       ORDER BY h.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    // Get tasks
    const tasks = await query(
      `SELECT t.*, u.name as assigned_to_name
       FROM crm_tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.deal_id = $1
       ORDER BY t.due_date ASC NULLS LAST`,
      [req.params.id]
    );

    res.json({
      ...deal.rows[0],
      contacts: contacts.rows,
      history: history.rows,
      tasks: tasks.rows
    });
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create deal
router.post('/deals', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { funnel_id, stage_id, company_id, title, value, probability, expected_close_date, 
            description, tags, owner_id, group_id, contact_ids } = req.body;
    
    const result = await query(
      `INSERT INTO crm_deals (organization_id, funnel_id, stage_id, company_id, title, value, probability, 
       expected_close_date, description, tags, owner_id, group_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [org.organization_id, funnel_id, stage_id, company_id, title, value || 0, probability || 50,
       expected_close_date, description, tags || [], owner_id || req.userId, group_id, req.userId]
    );
    const deal = result.rows[0];

    // Add contacts
    if (contact_ids && contact_ids.length > 0) {
      for (let i = 0; i < contact_ids.length; i++) {
        await query(
          `INSERT INTO crm_deal_contacts (deal_id, contact_id, is_primary) VALUES ($1, $2, $3)`,
          [deal.id, contact_ids[i], i === 0]
        );
      }
    }

    // Log history
    await query(
      `INSERT INTO crm_deal_history (deal_id, user_id, action, to_value) VALUES ($1, $2, 'created', $3)`,
      [deal.id, req.userId, title]
    );

    res.json(deal);
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update deal
router.put('/deals/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { stage_id, title, value, probability, expected_close_date, description, 
            tags, owner_id, group_id, status, lost_reason } = req.body;

    // Get current deal for history
    const current = await query(`SELECT * FROM crm_deals WHERE id = $1`, [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Deal not found' });

    const updates = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic update
    const fieldsToUpdate = { stage_id, title, value, probability, expected_close_date, 
                             description, tags, owner_id, group_id, status, lost_reason };
    
    for (const [key, val] of Object.entries(fieldsToUpdate)) {
      if (val !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(key === 'tags' ? val : val);
        paramIndex++;
      }
    }

    // Always update activity
    updates.push(`last_activity_at = NOW()`);
    updates.push(`updated_at = NOW()`);

    // Handle won/lost status
    if (status === 'won') {
      updates.push(`won_at = NOW()`);
    } else if (status === 'lost') {
      updates.push(`lost_at = NOW()`);
    }

    values.push(req.params.id, org.organization_id);

    const result = await query(
      `UPDATE crm_deals SET ${updates.join(', ')} WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} RETURNING *`,
      values
    );

    // Log history for stage change
    if (stage_id && stage_id !== current.rows[0].stage_id) {
      const oldStage = await query(`SELECT name FROM crm_stages WHERE id = $1`, [current.rows[0].stage_id]);
      const newStage = await query(`SELECT name FROM crm_stages WHERE id = $1`, [stage_id]);
      await query(
        `INSERT INTO crm_deal_history (deal_id, user_id, action, from_value, to_value) VALUES ($1, $2, 'stage_changed', $3, $4)`,
        [req.params.id, req.userId, oldStage.rows[0]?.name, newStage.rows[0]?.name]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Move deal (drag & drop)
router.post('/deals/:id/move', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { stage_id } = req.body;

    // Get current stage
    const current = await query(`SELECT stage_id FROM crm_deals WHERE id = $1`, [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Deal not found' });

    // Update stage
    await query(
      `UPDATE crm_deals SET stage_id = $1, last_activity_at = NOW(), updated_at = NOW() 
       WHERE id = $2 AND organization_id = $3`,
      [stage_id, req.params.id, org.organization_id]
    );

    // Log history
    const oldStage = await query(`SELECT name FROM crm_stages WHERE id = $1`, [current.rows[0].stage_id]);
    const newStage = await query(`SELECT name FROM crm_stages WHERE id = $1`, [stage_id]);
    await query(
      `INSERT INTO crm_deal_history (deal_id, user_id, action, from_value, to_value) VALUES ($1, $2, 'stage_changed', $3, $4)`,
      [req.params.id, req.userId, oldStage.rows[0]?.name, newStage.rows[0]?.name]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error moving deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add contact to deal
router.post('/deals/:id/contacts', async (req, res) => {
  try {
    const { contact_id, role, is_primary } = req.body;
    
    const result = await query(
      `INSERT INTO crm_deal_contacts (deal_id, contact_id, role, is_primary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (deal_id, contact_id) DO UPDATE SET role = $3, is_primary = $4
       RETURNING *`,
      [req.params.id, contact_id, role, is_primary || false]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding contact to deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove contact from deal
router.delete('/deals/:dealId/contacts/:contactId', async (req, res) => {
  try {
    await query(
      `DELETE FROM crm_deal_contacts WHERE deal_id = $1 AND contact_id = $2`,
      [req.params.dealId, req.params.contactId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing contact from deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TASKS
// ============================================

// List tasks (with filters)
router.get('/tasks', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { period, status, assigned_to, deal_id } = req.query;
    
    let sql = `SELECT t.*, 
      d.title as deal_title,
      c.name as company_name,
      u.name as assigned_to_name,
      cu.name as created_by_name
      FROM crm_tasks t
      LEFT JOIN crm_deals d ON d.id = t.deal_id
      LEFT JOIN crm_companies c ON c.id = t.company_id
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users cu ON cu.id = t.created_by
      WHERE t.organization_id = $1`;
    const params = [org.organization_id];
    let paramIndex = 2;

    // Visibility filter
    if (!canManage(org.role)) {
      sql += ` AND t.assigned_to = $${paramIndex}`;
      params.push(req.userId);
      paramIndex++;
    } else if (assigned_to) {
      sql += ` AND t.assigned_to = $${paramIndex}`;
      params.push(assigned_to);
      paramIndex++;
    }

    // Period filter
    if (period === 'today') {
      sql += ` AND DATE(t.due_date) = CURRENT_DATE`;
    } else if (period === 'week') {
      sql += ` AND t.due_date >= CURRENT_DATE AND t.due_date < CURRENT_DATE + INTERVAL '7 days'`;
    } else if (period === 'month') {
      sql += ` AND t.due_date >= CURRENT_DATE AND t.due_date < CURRENT_DATE + INTERVAL '30 days'`;
    } else if (period === 'overdue') {
      sql += ` AND t.due_date < NOW() AND t.status = 'pending'`;
    }

    // Status filter
    if (status) {
      sql += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Deal filter
    if (deal_id) {
      sql += ` AND t.deal_id = $${paramIndex}`;
      params.push(deal_id);
      paramIndex++;
    }

    sql += ` ORDER BY t.due_date ASC NULLS LAST, t.priority DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get task counts
router.get('/tasks/counts', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    let userFilter = '';
    const params = [org.organization_id];
    
    if (!canManage(org.role)) {
      userFilter = ` AND assigned_to = $2`;
      params.push(req.userId);
    }

    const result = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE DATE(due_date) = CURRENT_DATE AND status = 'pending') as today,
        COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE AND due_date < CURRENT_DATE + INTERVAL '7 days' AND status = 'pending') as week,
        COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE AND due_date < CURRENT_DATE + INTERVAL '30 days' AND status = 'pending') as month,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status = 'pending') as overdue,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM crm_tasks
       WHERE organization_id = $1${userFilter}`,
      params
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching task counts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create task
router.post('/tasks', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { deal_id, company_id, assigned_to, title, description, type, priority, due_date, reminder_at } = req.body;
    
    const result = await query(
      `INSERT INTO crm_tasks (organization_id, deal_id, company_id, assigned_to, created_by, title, description, type, priority, due_date, reminder_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [org.organization_id, deal_id, company_id, assigned_to || req.userId, req.userId, 
       title, description, type || 'task', priority || 'medium', due_date, reminder_at]
    );

    // If linked to deal, update last_activity
    if (deal_id) {
      await query(`UPDATE crm_deals SET last_activity_at = NOW() WHERE id = $1`, [deal_id]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update task
router.put('/tasks/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { assigned_to, title, description, type, priority, due_date, reminder_at, status } = req.body;

    let extraFields = '';
    if (status === 'completed') {
      extraFields = `, completed_at = NOW(), completed_by = '${req.userId}'`;
    } else if (status === 'pending') {
      extraFields = `, completed_at = NULL, completed_by = NULL`;
    }
    
    const result = await query(
      `UPDATE crm_tasks SET 
        assigned_to = COALESCE($1, assigned_to),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        type = COALESCE($4, type),
        priority = COALESCE($5, priority),
        due_date = $6,
        reminder_at = $7,
        status = COALESCE($8, status),
        updated_at = NOW()
        ${extraFields}
       WHERE id = $9 AND organization_id = $10 RETURNING *`,
      [assigned_to, title, description, type, priority, due_date, reminder_at, status, req.params.id, org.organization_id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete task
router.post('/tasks/:id/complete', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `UPDATE crm_tasks SET status = 'completed', completed_at = NOW(), completed_by = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [req.userId, req.params.id, org.organization_id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete task
router.delete('/tasks/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    await query(
      `DELETE FROM crm_tasks WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
