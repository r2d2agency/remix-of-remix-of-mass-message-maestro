import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// List user's organizations
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*, om.role 
       FROM organizations o
       JOIN organization_members om ON om.organization_id = o.id
       WHERE om.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ error: 'Erro ao listar organizações' });
  }
});

// Get organization by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is member
    const memberCheck = await query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const result = await query(
      `SELECT * FROM organizations WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organização não encontrada' });
    }
    
    res.json({ ...result.rows[0], role: memberCheck.rows[0].role });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Erro ao buscar organização' });
  }
});

// Get connections for organization (for member assignment)
router.get('/:id/connections', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is member
    const memberCheck = await query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    
    const result = await query(
      `SELECT id, name, phone_number, status, provider 
       FROM connections 
       WHERE organization_id = $1 
       ORDER BY name`,
      [id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get org connections error:', error);
    res.status(500).json({ error: 'Erro ao buscar conexões' });
  }
});

// Create organization - ONLY SUPERADMIN
router.post('/', async (req, res) => {
  try {
    // Check if user is superadmin
    const superadminCheck = await query(
      `SELECT is_superadmin FROM users WHERE id = $1`,
      [req.userId]
    );

    if (!superadminCheck.rows[0]?.is_superadmin) {
      return res.status(403).json({ error: 'Apenas superadmin pode criar organizações' });
    }

    const { name, slug, owner_user_id } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Nome e slug são obrigatórios' });
    }

    // Create organization
    const orgResult = await query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2) RETURNING *`,
      [name, slug]
    );
    
    const org = orgResult.rows[0];

    // Add specified user or creator as owner
    const ownerId = owner_user_id || req.userId;
    await query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [org.id, ownerId]
    );

    res.status(201).json({ ...org, role: 'owner' });
  } catch (error) {
    console.error('Create organization error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Slug já está em uso' });
    }
    res.status(500).json({ error: 'Erro ao criar organização' });
  }
});

// Update organization
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, logo_url } = req.body;

    // Check if user is admin/owner
    const memberCheck = await query(
      `SELECT role FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Apenas admins podem editar a organização' });
    }

    const result = await query(
      `UPDATE organizations 
       SET name = COALESCE($1, name),
           logo_url = COALESCE($2, logo_url),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name, logo_url, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ error: 'Erro ao atualizar organização' });
  }
});

// List organization members with their connection assignments
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is member
    const memberCheck = await query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `SELECT 
        om.*, 
        u.name, 
        u.email,
        COALESCE(
          (SELECT json_agg(json_build_object('id', c.id, 'name', c.name))
           FROM connection_members cm
           JOIN connections c ON c.id = cm.connection_id
           WHERE cm.user_id = om.user_id AND c.organization_id = $1
          ), '[]'::json
        ) as assigned_connections
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY om.created_at`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
});

// Add member to organization (creates user if not exists)
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, password, role, connection_ids } = req.body;

    // Check if user is admin/owner
    const memberCheck = await query(
      `SELECT role FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Apenas admins podem adicionar membros' });
    }

    // Find user by email
    let userResult = await query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    
    let userId;
    let userCreated = false;
    
    if (userResult.rows.length === 0) {
      // Create new user if name and password provided
      if (!name || !password) {
        return res.status(400).json({ 
          error: 'Usuário não encontrado', 
          details: `Nenhum usuário com o email "${email}" está cadastrado. Forneça nome e senha para criar um novo usuário.`,
          requires_registration: true
        });
      }
      
      // Validate password
      if (password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
      }
      
      // Create the user
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [name, email, hashedPassword]
      );
      userId = newUser.rows[0].id;
      userCreated = true;
    } else {
      userId = userResult.rows[0].id;
    }

    // Add to organization
    const result = await query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [id, userId, role || 'agent']
    );

    // Assign to connections if provided
    if (connection_ids && Array.isArray(connection_ids) && connection_ids.length > 0) {
      // First remove existing connection assignments
      await query(
        `DELETE FROM connection_members 
         WHERE user_id = $1 AND connection_id IN (
           SELECT id FROM connections WHERE organization_id = $2
         )`,
        [userId, id]
      );
      
      // Add new connection assignments
      for (const connId of connection_ids) {
        await query(
          `INSERT INTO connection_members (connection_id, user_id, can_view, can_send, can_manage)
           VALUES ($1, $2, true, true, false)
           ON CONFLICT (connection_id, user_id) DO NOTHING`,
          [connId, userId]
        );
      }
    }

    res.status(201).json({ 
      ...result.rows[0], 
      user_created: userCreated,
      message: userCreated ? `Usuário "${name}" criado e adicionado à organização` : 'Membro adicionado'
    });
  } catch (error) {
    console.error('Add member error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Este email já está em uso' });
    }
    res.status(500).json({ error: 'Erro ao adicionar membro' });
  }
});

// Update member's connection assignments
router.patch('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role, connection_ids } = req.body;

    // Check if user is admin/owner
    const memberCheck = await query(
      `SELECT role FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Apenas admins podem editar membros' });
    }

    // Update role if provided
    if (role) {
      await query(
        `UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3`,
        [role, id, userId]
      );
    }

    // Update connection assignments if provided
    if (connection_ids !== undefined && Array.isArray(connection_ids)) {
      // Remove existing assignments for this org's connections
      await query(
        `DELETE FROM connection_members 
         WHERE user_id = $1 AND connection_id IN (
           SELECT id FROM connections WHERE organization_id = $2
         )`,
        [userId, id]
      );
      
      // Add new assignments
      for (const connId of connection_ids) {
        await query(
          `INSERT INTO connection_members (connection_id, user_id, can_view, can_send, can_manage)
           VALUES ($1, $2, true, true, false)
           ON CONFLICT (connection_id, user_id) DO NOTHING`,
          [connId, userId]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

// Update user password (admin only)
router.patch('/:id/members/:userId/password', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { password } = req.body;

    // Check if user is admin/owner
    const memberCheck = await query(
      `SELECT role FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Apenas admins podem alterar senhas' });
    }

    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [hashedPassword, userId]
    );

    res.json({ success: true, message: 'Senha atualizada com sucesso' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Erro ao atualizar senha' });
  }
});

// Remove member from organization
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    // Check if user is admin/owner
    const memberCheck = await query(
      `SELECT role FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')`,
      [id, req.userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Apenas admins podem remover membros' });
    }

    // Can't remove owner
    const targetCheck = await query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (targetCheck.rows[0]?.role === 'owner') {
      return res.status(400).json({ error: 'Não é possível remover o proprietário' });
    }

    // Remove connection assignments first
    await query(
      `DELETE FROM connection_members 
       WHERE user_id = $1 AND connection_id IN (
         SELECT id FROM connections WHERE organization_id = $2
       )`,
      [userId, id]
    );

    // Remove from organization
    await query(
      `DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

export default router;
