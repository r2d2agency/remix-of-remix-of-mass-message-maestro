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
    const { email, password, name, plan_id } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
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

    // If plan selected, create organization with trial period
    if (selectedPlan) {
      const slug = name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        + '-' + Date.now().toString(36);

      const trialDays = selectedPlan.trial_days || 3;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + trialDays);

      // Get plan modules for organization
      const planModulesResult = await query(
        `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots FROM plans WHERE id = $1`,
        [selectedPlan.id]
      );
      
      let modulesEnabled = {
        campaigns: true,
        billing: true,
        groups: true,
        scheduled_messages: true,
        chatbots: true
      };
      
      if (planModulesResult.rows.length > 0) {
        const plan = planModulesResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true
        };
      }

      // Create organization with modules from plan
      const orgResult = await query(
        `INSERT INTO organizations (name, slug, plan_id, expires_at, modules_enabled) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, slug, selectedPlan.id, expiresAt.toISOString(), JSON.stringify(modulesEnabled)]
      );

      const orgId = orgResult.rows[0].id;

      // Add user as owner
      await query(
        `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [orgId, user.id]
      );
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Find user
    const result = await query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
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
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

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
    
    // Default modules if null
    const defaultModules = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
    };
    const modulesEnabled = orgResult.rows[0]?.modules_enabled || defaultModules;

    res.json({ 
      user: { 
        ...result.rows[0], 
        role,
        organization_id: organizationId,
        modules_enabled: modulesEnabled,
      } 
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;
