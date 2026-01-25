import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Public endpoint to get branding settings (no auth required)
// NOTE: Must be defined before router.use(authenticate)
router.get('/branding', async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM system_settings 
       WHERE key IN ('logo_login', 'logo_sidebar', 'favicon')`
    );

    const branding = {};
    for (const row of result.rows) {
      branding[row.key] = row.value;
    }

    res.json(branding);
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Erro ao buscar branding' });
  }
});

router.use(authenticate);

// Middleware to check superadmin
const requireSuperadmin = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT is_superadmin FROM users WHERE id = $1`,
      [req.userId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_superadmin) {
      return res.status(403).json({ error: 'Acesso negado. Requer superadmin.' });
    }
    
    next();
  } catch (error) {
    console.error('Superadmin check error:', error);
    res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};

// Check if current user is superadmin
router.get('/check', async (req, res) => {
  try {
    console.log('Checking superadmin for userId:', req.userId);
    const result = await query(
      `SELECT id, email, is_superadmin FROM users WHERE id = $1`,
      [req.userId]
    );
    
    console.log('User found:', result.rows[0]);
    res.json({ isSuperadmin: result.rows[0]?.is_superadmin || false });
  } catch (error) {
    console.error('Check superadmin error:', error);
    res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
});

// ============================================
// PLANS
// ============================================

// List all plans
router.get('/plans', requireSuperadmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, 
              (SELECT COUNT(*) FROM organizations WHERE plan_id = p.id) as org_count
       FROM plans p
       ORDER BY p.price ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List plans error:', error);
    res.status(500).json({ error: 'Erro ao listar planos' });
  }
});

// Create plan
router.post('/plans', requireSuperadmin, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      max_connections, 
      max_monthly_messages,
      max_users,
      max_supervisors,
      has_asaas_integration, 
      has_chat,
      has_whatsapp_groups,
      has_campaigns,
      has_chatbots,
      has_scheduled_messages,
      price, 
      billing_period,
      visible_on_signup,
      trial_days
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome do plano é obrigatório' });
    }

    const result = await query(
      `INSERT INTO plans (name, description, max_connections, max_monthly_messages, max_users, max_supervisors, has_asaas_integration, has_chat, has_whatsapp_groups, has_campaigns, has_chatbots, has_scheduled_messages, price, billing_period, visible_on_signup, trial_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [
        name, 
        description, 
        max_connections || 1, 
        max_monthly_messages || 1000, 
        max_users || 5,
        max_supervisors || 1,
        has_asaas_integration || false, 
        has_chat !== false,
        has_whatsapp_groups || false,
        has_campaigns !== false,
        has_chatbots !== false,
        has_scheduled_messages !== false,
        price || 0, 
        billing_period || 'monthly',
        visible_on_signup || false,
        trial_days || 3
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: 'Erro ao criar plano' });
  }
});

// Update plan
router.patch('/plans/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      max_connections, 
      max_monthly_messages, 
      max_users,
      max_supervisors,
      has_asaas_integration, 
      has_chat, 
      has_whatsapp_groups,
      has_campaigns,
      has_chatbots,
      has_scheduled_messages,
      price, 
      billing_period, 
      is_active,
      visible_on_signup,
      trial_days
    } = req.body;

    const result = await query(
      `UPDATE plans 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           max_connections = COALESCE($3, max_connections),
           max_monthly_messages = COALESCE($4, max_monthly_messages),
           max_users = COALESCE($5, max_users),
           max_supervisors = COALESCE($6, max_supervisors),
           has_asaas_integration = COALESCE($7, has_asaas_integration),
           has_chat = COALESCE($8, has_chat),
           has_whatsapp_groups = COALESCE($9, has_whatsapp_groups),
           has_campaigns = COALESCE($10, has_campaigns),
           has_chatbots = COALESCE($11, has_chatbots),
           has_scheduled_messages = COALESCE($12, has_scheduled_messages),
           price = COALESCE($13, price),
           billing_period = COALESCE($14, billing_period),
           is_active = COALESCE($15, is_active),
           visible_on_signup = COALESCE($16, visible_on_signup),
           trial_days = COALESCE($17, trial_days),
           updated_at = NOW()
       WHERE id = $18
       RETURNING *`,
      [name, description, max_connections, max_monthly_messages, max_users, max_supervisors, has_asaas_integration, has_chat, has_whatsapp_groups, has_campaigns, has_chatbots, has_scheduled_messages, price, billing_period, is_active, visible_on_signup, trial_days, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
});

// Delete plan
router.delete('/plans/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if plan is in use
    const orgCheck = await query(`SELECT id FROM organizations WHERE plan_id = $1 LIMIT 1`, [id]);
    if (orgCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Este plano está em uso por organizações' });
    }

    const result = await query(`DELETE FROM plans WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Erro ao deletar plano' });
  }
});

// ============================================
// USERS
// ============================================

// List all users (superadmin only)
router.get('/users', requireSuperadmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, name, is_superadmin, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Set user superadmin status
router.patch('/users/:id/superadmin', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_superadmin } = req.body;

    // Can't remove own superadmin
    if (id === req.userId && !is_superadmin) {
      return res.status(400).json({ error: 'Não é possível remover seu próprio acesso superadmin' });
    }

    const result = await query(
      `UPDATE users SET is_superadmin = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, is_superadmin`,
      [is_superadmin, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Set superadmin error:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// ============================================
// ORGANIZATIONS
// ============================================

// List all organizations (superadmin only)
router.get('/organizations', requireSuperadmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*, 
              p.name as plan_name,
              p.price as plan_price,
              (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
       FROM organizations o
       LEFT JOIN plans p ON p.id = o.plan_id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ error: 'Erro ao listar organizações' });
  }
});

// Create organization (superadmin only)
router.post('/organizations', requireSuperadmin, async (req, res) => {
  try {
    const { name, slug, logo_url, owner_email, owner_name, owner_password, plan_id, expires_at } = req.body;

    if (!name || !slug || !owner_email) {
      return res.status(400).json({ error: 'Nome, slug e email do proprietário são obrigatórios' });
    }

    // Find or create owner user
    let ownerId;
    const userResult = await query(
      `SELECT id FROM users WHERE email = $1`,
      [owner_email]
    );

    if (userResult.rows.length === 0) {
      // User doesn't exist, create one if password provided
      if (!owner_password) {
        return res.status(400).json({ error: 'Usuário não encontrado. Forneça nome e senha para criar novo usuário.' });
      }

      const hashedPassword = await bcrypt.hash(owner_password, 10);
      const newUser = await query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [owner_email, hashedPassword, owner_name || owner_email.split('@')[0]]
      );
      ownerId = newUser.rows[0].id;
    } else {
      ownerId = userResult.rows[0].id;
    }

    // Get plan modules if plan_id provided
    let modulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true
    };

    if (plan_id) {
      const planResult = await query(
        `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots FROM plans WHERE id = $1`,
        [plan_id]
      );
      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true
        };
      }
    }

    // Create organization with modules from plan
    const orgResult = await query(
      `INSERT INTO organizations (name, slug, logo_url, plan_id, expires_at, modules_enabled)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug, logo_url || null, plan_id || null, expires_at || null, JSON.stringify(modulesEnabled)]
    );

    const org = orgResult.rows[0];

    // Add owner
    await query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [org.id, ownerId]
    );

    res.status(201).json({ ...org, member_count: 1 });
  } catch (error) {
    console.error('Create organization error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Slug já está em uso' });
    }
    res.status(500).json({ error: 'Erro ao criar organização' });
  }
});

// Update organization (superadmin only)
router.patch('/organizations/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, logo_url, plan_id, expires_at, sync_modules } = req.body;

    // If plan_id changed and sync_modules is true, update modules_enabled from plan
    let modulesEnabled = null;
    if (plan_id && sync_modules !== false) {
      const planResult = await query(
        `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots FROM plans WHERE id = $1`,
        [plan_id]
      );
      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true
        };
      }
    }

    const result = await query(
      `UPDATE organizations 
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           plan_id = COALESCE($3, plan_id),
           expires_at = COALESCE($4, expires_at),
           modules_enabled = COALESCE($5, modules_enabled),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, logo_url, plan_id, expires_at, modulesEnabled ? JSON.stringify(modulesEnabled) : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organização não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ error: 'Erro ao atualizar organização' });
  }
});

// Delete organization (superadmin only)
router.delete('/organizations/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `DELETE FROM organizations WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organização não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ error: 'Erro ao deletar organização' });
  }
});

// ============================================
// ORGANIZATION USERS MANAGEMENT
// ============================================

// Get organization members with limits info
router.get('/organizations/:id/members', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get members
    const membersResult = await query(
      `SELECT om.id, om.role, om.created_at,
              u.id as user_id, u.email, u.name
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY 
         CASE om.role 
           WHEN 'owner' THEN 1 
           WHEN 'admin' THEN 2 
           WHEN 'agent' THEN 3 
           ELSE 4 
         END`,
      [id]
    );

    // Get plan limits
    const limitsResult = await query(
      `SELECT p.max_users, p.max_supervisors, p.name as plan_name
       FROM organizations o
       LEFT JOIN plans p ON p.id = o.plan_id
       WHERE o.id = $1`,
      [id]
    );

    const limits = limitsResult.rows[0] || { max_users: 999, max_supervisors: 999 };
    const members = membersResult.rows;
    const supervisorCount = members.filter(m => ['owner', 'admin'].includes(m.role)).length;
    
    res.json({
      members,
      limits: {
        max_users: limits.max_users || 999,
        max_supervisors: limits.max_supervisors || 999,
        current_users: members.length,
        current_supervisors: supervisorCount,
        plan_name: limits.plan_name || 'Sem plano'
      }
    });
  } catch (error) {
    console.error('Get org members error:', error);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
});

// Create user for organization
router.post('/organizations/:id/users', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, password, role } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, nome e senha são obrigatórios' });
    }

    // Get organization plan limits
    const orgPlan = await query(
      `SELECT o.id, p.max_users, p.max_supervisors, p.name as plan_name
       FROM organizations o
       LEFT JOIN plans p ON p.id = o.plan_id
       WHERE o.id = $1`,
      [id]
    );

    if (orgPlan.rows.length === 0) {
      return res.status(404).json({ error: 'Organização não encontrada' });
    }

    const plan = orgPlan.rows[0];
    const maxUsers = plan.max_users || 999;
    const maxSupervisors = plan.max_supervisors || 999;

    // Count current members
    const memberCounts = await query(
      `SELECT 
         COUNT(*) as total_members,
         COUNT(*) FILTER (WHERE role IN ('owner', 'admin')) as supervisor_count
       FROM organization_members
       WHERE organization_id = $1`,
      [id]
    );

    const currentTotal = parseInt(memberCounts.rows[0].total_members) || 0;
    const currentSupervisors = parseInt(memberCounts.rows[0].supervisor_count) || 0;

    // Check total users limit
    if (currentTotal >= maxUsers) {
      return res.status(400).json({ 
        error: `Limite de usuários atingido (${currentTotal}/${maxUsers}). Faça upgrade do plano.`,
        code: 'USER_LIMIT_REACHED'
      });
    }

    // Check supervisors limit (owner + admin roles)
    const isSupervisorRole = ['owner', 'admin'].includes(role);
    if (isSupervisorRole && currentSupervisors >= maxSupervisors) {
      return res.status(400).json({ 
        error: `Limite de supervisores atingido (${currentSupervisors}/${maxSupervisors}). Faça upgrade do plano.`,
        code: 'SUPERVISOR_LIMIT_REACHED'
      });
    }

    // Check if user exists
    const existingUser = await query(`SELECT id FROM users WHERE email = $1`, [email]);
    
    let userId;
    
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      
      // Check if already member
      const existingMember = await query(
        `SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
        [id, userId]
      );
      
      if (existingMember.rows.length > 0) {
        return res.status(400).json({ error: 'Usuário já é membro desta organização' });
      }
    } else {
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await query(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [email, name, hashedPassword]
      );
      userId = newUser.rows[0].id;
    }

    // Add to organization
    await query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [id, userId, role || 'agent']
    );

    res.status(201).json({ 
      user_id: userId, 
      email, 
      name, 
      role: role || 'agent' 
    });
  } catch (error) {
    console.error('Create org user error:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Update member role
router.patch('/organizations/:orgId/members/:memberId', requireSuperadmin, async (req, res) => {
  try {
    const { orgId, memberId } = req.params;
    const { role } = req.body;

    if (!['owner', 'admin', 'agent'].includes(role)) {
      return res.status(400).json({ error: 'Role inválido' });
    }

    // Get current member role
    const currentMember = await query(
      `SELECT role FROM organization_members WHERE id = $1 AND organization_id = $2`,
      [memberId, orgId]
    );

    if (currentMember.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const currentRole = currentMember.rows[0].role;
    const isPromotingToSupervisor = !['owner', 'admin'].includes(currentRole) && ['owner', 'admin'].includes(role);

    // Check supervisor limit if promoting to supervisor role
    if (isPromotingToSupervisor) {
      const orgPlan = await query(
        `SELECT p.max_supervisors
         FROM organizations o
         LEFT JOIN plans p ON p.id = o.plan_id
         WHERE o.id = $1`,
        [orgId]
      );

      const maxSupervisors = orgPlan.rows[0]?.max_supervisors || 999;

      const supervisorCount = await query(
        `SELECT COUNT(*) as count
         FROM organization_members
         WHERE organization_id = $1 AND role IN ('owner', 'admin')`,
        [orgId]
      );

      const currentSupervisors = parseInt(supervisorCount.rows[0].count) || 0;

      if (currentSupervisors >= maxSupervisors) {
        return res.status(400).json({ 
          error: `Limite de supervisores atingido (${currentSupervisors}/${maxSupervisors}). Faça upgrade do plano.`,
          code: 'SUPERVISOR_LIMIT_REACHED'
        });
      }
    }

    const result = await query(
      `UPDATE organization_members SET role = $1 WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [role, memberId, orgId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

// Remove member from organization
router.delete('/organizations/:orgId/members/:memberId', requireSuperadmin, async (req, res) => {
  try {
    const { orgId, memberId } = req.params;

    const result = await query(
      `DELETE FROM organization_members WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [memberId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// ============================================
// SYSTEM SETTINGS (Branding)
// ============================================

// Get all settings
router.get('/settings', requireSuperadmin, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM system_settings ORDER BY key`);
    res.json(result.rows);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Update a setting
router.patch('/settings/:key', requireSuperadmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const result = await query(
      `UPDATE system_settings 
       SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = $3
       RETURNING *`,
      [value, req.userId, key]
    );

    if (result.rows.length === 0) {
      // Insert if not exists
      const insertResult = await query(
        `INSERT INTO system_settings (key, value, updated_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [key, value, req.userId]
      );
      return res.json(insertResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Erro ao atualizar configuração' });
  }
});


export default router;