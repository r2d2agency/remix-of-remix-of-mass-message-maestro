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
      has_crm,
      price, 
      billing_period,
      visible_on_signup,
      trial_days
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome do plano é obrigatório' });
    }

    const result = await query(
      `INSERT INTO plans (name, description, max_connections, max_monthly_messages, max_users, max_supervisors, has_asaas_integration, has_chat, has_whatsapp_groups, has_campaigns, has_chatbots, has_scheduled_messages, has_crm, price, billing_period, visible_on_signup, trial_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
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
        has_crm !== false,
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
      has_crm,
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
           has_crm = COALESCE($13, has_crm),
           price = COALESCE($14, price),
           billing_period = COALESCE($15, billing_period),
           is_active = COALESCE($16, is_active),
           visible_on_signup = COALESCE($17, visible_on_signup),
           trial_days = COALESCE($18, trial_days),
           updated_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [
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
        has_crm,
        price,
        billing_period,
        is_active,
        visible_on_signup,
        trial_days,
        id,
      ]
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

// Sync all organizations' modules with their plans
router.post('/plans/sync-all', requireSuperadmin, async (req, res) => {
  try {
    // Get all plans with their modules
    const plansResult = await query(
      `SELECT id, name, has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots, has_chat, has_crm FROM plans`
    );

    let syncedCount = 0;
    const syncDetails = [];

    for (const plan of plansResult.rows) {
      const modulesEnabled = {
        campaigns: plan.has_campaigns ?? true,
        billing: plan.has_asaas_integration ?? true,
        groups: plan.has_whatsapp_groups ?? true,
        scheduled_messages: plan.has_scheduled_messages ?? true,
        chatbots: plan.has_chatbots ?? true,
        chat: plan.has_chat ?? true,
        crm: plan.has_crm ?? true,
      };

      console.log(`[sync-all] Plan "${plan.name}" (${plan.id}) modules:`, modulesEnabled);

      // Update all organizations using this plan
      const updateResult = await query(
        `UPDATE organizations SET modules_enabled = $1, updated_at = NOW() WHERE plan_id = $2 RETURNING id, name`,
        [JSON.stringify(modulesEnabled), plan.id]
      );

      if (updateResult.rowCount > 0) {
        syncDetails.push({
          plan: plan.name,
          organizations: updateResult.rows.map(o => o.name),
          modules: modulesEnabled
        });
      }

      syncedCount += updateResult.rowCount || 0;
    }

    console.log(`[sync-all] Synced modules for ${syncedCount} organizations:`, JSON.stringify(syncDetails, null, 2));
    res.json({ success: true, synced_organizations: syncedCount, details: syncDetails });
  } catch (error) {
    console.error('Sync all plans error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar planos' });
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

// List all users with orphan status (superadmin only)
router.get('/users', requireSuperadmin, async (req, res) => {
  try {
    const { search, orphans_only } = req.query;
    
    let baseQuery = `
      SELECT u.id, u.email, u.name, u.is_superadmin, u.created_at,
             COALESCE(
               (SELECT json_agg(json_build_object('org_id', o.id, 'org_name', o.name, 'role', om.role))
                FROM organization_members om
                JOIN organizations o ON o.id = om.organization_id
                WHERE om.user_id = u.id),
               '[]'::json
             ) as organizations,
             NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id) as is_orphan
      FROM users u
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      baseQuery += ` AND (u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (orphans_only === 'true') {
      baseQuery += ` AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id)`;
    }
    
    baseQuery += ` ORDER BY u.created_at DESC`;
    
    const result = await query(baseQuery, params);
    res.json(result.rows);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Search user by exact email (superadmin only)
router.get('/users/search-email', requireSuperadmin, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }
    
    const result = await query(
      `SELECT u.id, u.email, u.name, u.is_superadmin, u.created_at,
              COALESCE(
                (SELECT json_agg(json_build_object('org_id', o.id, 'org_name', o.name, 'role', om.role))
                 FROM organization_members om
                 JOIN organizations o ON o.id = om.organization_id
                 WHERE om.user_id = u.id),
                '[]'::json
              ) as organizations
       FROM users u
       WHERE u.email = $1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado', exists: false });
    }
    
    res.json({ ...result.rows[0], exists: true });
  } catch (error) {
    console.error('Search user by email error:', error);
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

// Delete user by email (superadmin only - for orphan cleanup)
router.delete('/users/by-email/:email', requireSuperadmin, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Find user by email
    const userCheck = await query(`SELECT id, email FROM users WHERE email = $1`, [email]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const userId = userCheck.rows[0].id;
    
    // Can't delete yourself
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Não é possível excluir sua própria conta' });
    }
    
    // Delete all related data in order (respecting foreign keys)
    await query(`DELETE FROM organization_members WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM department_members WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await query(`UPDATE conversations SET assigned_user_id = NULL WHERE assigned_user_id = $1`, [userId]);
    
    const result = await query(`DELETE FROM users WHERE id = $1 RETURNING id, email`, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Erro ao excluir usuário' });
    }
    
    console.log(`User ${email} deleted by superadmin ${req.userId}`);
    res.json({ success: true, deleted_email: email });
  } catch (error) {
    console.error('Delete user by email error:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário', details: error.message });
  }
});

// Delete user completely (with all related data)
router.delete('/users/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Can't delete yourself
    if (id === req.userId) {
      return res.status(400).json({ error: 'Não é possível excluir sua própria conta' });
    }

    // Check if user exists
    const userCheck = await query(`SELECT id, email FROM users WHERE id = $1`, [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const userEmail = userCheck.rows[0].email;

    // Delete all related data in order (respecting foreign keys)
    // Use try-catch for each to handle missing tables gracefully
    const cleanupQueries = [
      // Memberships
      `DELETE FROM organization_members WHERE user_id = $1`,
      `DELETE FROM department_members WHERE user_id = $1`,
      `DELETE FROM user_roles WHERE user_id = $1`,
      // CRM relations
      `DELETE FROM crm_user_group_members WHERE user_id = $1`,
      `UPDATE crm_deals SET responsible_user_id = NULL WHERE responsible_user_id = $1`,
      `UPDATE crm_tasks SET assigned_user_id = NULL WHERE assigned_user_id = $1`,
      `UPDATE crm_prospects SET responsible_user_id = NULL WHERE responsible_user_id = $1`,
      // Chat relations
      `UPDATE conversations SET assigned_user_id = NULL WHERE assigned_user_id = $1`,
      `UPDATE conversation_notes SET user_id = NULL WHERE user_id = $1`,
      // Chatbot relations
      `UPDATE chatbots SET created_by = NULL WHERE created_by = $1`,
      // Session tokens
      `DELETE FROM sessions WHERE user_id = $1`,
    ];

    for (const sql of cleanupQueries) {
      try {
        await query(sql, [id]);
      } catch (err) {
        // Ignore errors for missing tables/columns (42P01, 42703)
        if (err.code !== '42P01' && err.code !== '42703') {
          console.warn(`Cleanup query warning: ${err.message}`);
        }
      }
    }
    
    // Finally delete the user
    const result = await query(`DELETE FROM users WHERE id = $1 RETURNING id, email`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Erro ao excluir usuário' });
    }

    console.log(`User ${userEmail} deleted by superadmin ${req.userId}`);
    res.json({ success: true, deleted_email: userEmail });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário', details: error.message });
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
      chatbots: true,
      chat: true,
      crm: true,
    };

    if (plan_id) {
      const planResult = await query(
        `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots, has_chat, has_crm FROM plans WHERE id = $1`,
        [plan_id]
      );
      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true,
          chat: plan.has_chat ?? true,
          crm: plan.has_crm ?? true,
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
        `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots, has_chat, has_crm FROM plans WHERE id = $1`,
        [plan_id]
      );
      if (planResult.rows.length > 0) {
        const plan = planResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true,
          chat: plan.has_chat ?? true,
          crm: plan.has_crm ?? true,
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