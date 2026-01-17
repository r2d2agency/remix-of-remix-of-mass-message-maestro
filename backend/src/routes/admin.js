import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();
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
    const result = await query(
      `SELECT is_superadmin FROM users WHERE id = $1`,
      [req.userId]
    );
    
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
      has_asaas_integration, 
      has_chat, 
      price, 
      billing_period 
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome do plano é obrigatório' });
    }

    const result = await query(
      `INSERT INTO plans (name, description, max_connections, max_monthly_messages, has_asaas_integration, has_chat, price, billing_period)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, description, max_connections || 1, max_monthly_messages || 1000, has_asaas_integration || false, has_chat !== false, price || 0, billing_period || 'monthly']
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
    const { name, description, max_connections, max_monthly_messages, has_asaas_integration, has_chat, price, billing_period, is_active } = req.body;

    const result = await query(
      `UPDATE plans 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           max_connections = COALESCE($3, max_connections),
           max_monthly_messages = COALESCE($4, max_monthly_messages),
           has_asaas_integration = COALESCE($5, has_asaas_integration),
           has_chat = COALESCE($6, has_chat),
           price = COALESCE($7, price),
           billing_period = COALESCE($8, billing_period),
           is_active = COALESCE($9, is_active),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [name, description, max_connections, max_monthly_messages, has_asaas_integration, has_chat, price, billing_period, is_active, id]
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
    const { name, slug, logo_url, owner_email, plan_id, expires_at } = req.body;

    if (!name || !slug || !owner_email) {
      return res.status(400).json({ error: 'Nome, slug e email do proprietário são obrigatórios' });
    }

    // Find owner user
    const userResult = await query(
      `SELECT id FROM users WHERE email = $1`,
      [owner_email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário proprietário não encontrado' });
    }

    const ownerId = userResult.rows[0].id;

    // Create organization
    const orgResult = await query(
      `INSERT INTO organizations (name, slug, logo_url, plan_id, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, slug, logo_url || null, plan_id || null, expires_at || null]
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
    const { name, logo_url, plan_id, expires_at } = req.body;

    const result = await query(
      `UPDATE organizations 
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           plan_id = COALESCE($3, plan_id),
           expires_at = COALESCE($4, expires_at),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, logo_url, plan_id, expires_at, id]
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

// Get organization members
router.get('/organizations/:id/members', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
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
    
    res.json(result.rows);
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

    const result = await query(
      `UPDATE organization_members SET role = $1 WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [role, memberId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

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

export default router;