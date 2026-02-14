import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = Router();

// Get visible plans for signup (public endpoint)
router.get('/plans', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, max_connections, max_monthly_messages, max_users, max_supervisors, 
              has_asaas_integration, has_chat, has_whatsapp_groups, has_campaigns, 
              price, billing_period, trial_days
       FROM plans 
       WHERE is_active = true AND visible_on_signup = true 
       ORDER BY price ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Erro ao buscar planos' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    let { email, password, name, plan_id } = req.body;

    // Normalize inputs (prevents trailing spaces and case issues that block login)
    email = typeof email === 'string' ? email.trim() : email;
    name = typeof name === 'string' ? name.trim() : name;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    // Check if user exists (case-insensitive + trim)
    const existing = await query(
      'SELECT id FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Validate plan if provided
    let selectedPlan = null;
    if (plan_id) {
      const planResult = await query(
        'SELECT id, name, trial_days FROM plans WHERE id = $1 AND is_active = true AND visible_on_signup = true',
        [plan_id]
      );
      if (planResult.rows.length === 0) {
        return res.status(400).json({ error: 'Plano inválido ou não disponível' });
      }
      selectedPlan = planResult.rows[0];
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name]
    );

    const user = result.rows[0];

    // Create organization (always, even without a plan)
    const slug = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      + '-' + Date.now().toString(36);

    let modulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
      chat: true,
      crm: true
    };

    let expiresAt = null;

    if (selectedPlan) {
      const trialDays = selectedPlan.trial_days || 3;
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + trialDays);

      // Get plan modules for organization
      const planModulesResult = await query(
         `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots, has_chat, has_crm, has_group_secretary FROM plans WHERE id = $1`,
        [selectedPlan.id]
      );
      
      if (planModulesResult.rows.length > 0) {
        const plan = planModulesResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true,
          chat: plan.has_chat ?? true,
          crm: plan.has_crm ?? true,
          group_secretary: plan.has_group_secretary ?? false
        };
      }
    }

    // Create organization with modules
    const orgResult = await query(
      `INSERT INTO organizations (name, slug, plan_id, expires_at, modules_enabled) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, slug, selectedPlan?.id || null, expiresAt?.toISOString() || null, JSON.stringify(modulesEnabled)]
    );

    const orgId = orgResult.rows[0].id;

    // Add user as owner
    await query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [orgId, user.id]
    );

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Fetch role and modules like login does, so the frontend has full context
    const orgRoleResult = await query(
      `SELECT om.role, o.id as organization_id, o.modules_enabled
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'agent' THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [user.id]
    );

    const role = orgRoleResult.rows[0]?.role || null;
    const organizationId = orgRoleResult.rows[0]?.organization_id || null;
    const finalModules = orgRoleResult.rows[0]?.modules_enabled || {
      campaigns: true, billing: true, groups: true,
      scheduled_messages: true, chatbots: true, chat: true, crm: true
    };

    res.status(201).json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        organization_id: organizationId,
        modules_enabled: finalModules,
      }, 
      token 
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    // Normalize inputs
    email = typeof email === 'string' ? email.trim() : email;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Find user
    const result = await query(
      'SELECT id, email, name, password_hash, is_superadmin FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const isSuperadmin = user.is_superadmin === true;

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Get role and organization info
    const orgResult = await query(
      `SELECT om.role, o.id as organization_id, o.modules_enabled
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'agent' THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [user.id]
    );

    const role = orgResult.rows[0]?.role || null;
    const organizationId = orgResult.rows[0]?.organization_id || null;
    
    // Superadmin always has all modules enabled
    const allModulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
      chat: true,
      crm: true
    };
    
    // Only superadmin bypasses module restrictions - owners/admins follow plan settings
    let modulesEnabled = allModulesEnabled;
    if (!isSuperadmin) {
      modulesEnabled = orgResult.rows[0]?.modules_enabled || allModulesEnabled;
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        is_superadmin: isSuperadmin,
        role,
        organization_id: organizationId,
        modules_enabled: modulesEnabled,
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await query(
      'SELECT id, email, name, is_superadmin, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    const isSuperadmin = user.is_superadmin === true;

    // Role and organization info (multi-tenant)
    const orgResult = await query(
      `SELECT om.role, o.id as organization_id, o.modules_enabled
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'agent' THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [decoded.userId]
    );

    const role = orgResult.rows[0]?.role || null;
    const organizationId = orgResult.rows[0]?.organization_id || null;
    
    // Superadmin always has all modules enabled
    const allModulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
      chat: true,
      crm: true
    };
    
    // Only superadmin bypasses module restrictions - owners/admins follow plan settings
    let modulesEnabled = allModulesEnabled;
    if (!isSuperadmin) {
      modulesEnabled = orgResult.rows[0]?.modules_enabled || allModulesEnabled;
    }

    res.json({ 
      user: { 
        id: user.id,
        email: user.email,
        name: user.name,
        is_superadmin: isSuperadmin,
        role,
        organization_id: organizationId,
        modules_enabled: modulesEnabled,
      } 
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Update current user profile (name)
router.put('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let { name } = req.body;
    
    // Validate name
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Nome deve ter no máximo 100 caracteres' });
    }
    
    // Update user name
    const result = await query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
      [name, decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ user: result.rows[0], message: 'Perfil atualizado com sucesso' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Change password
router.put('/password', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }
    
    // Get current user
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, decoded.userId]
    );

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

export default router;
