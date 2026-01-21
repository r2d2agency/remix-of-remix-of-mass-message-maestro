import { Router } from 'express';
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

// List organization members
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
      `SELECT om.*, u.name, u.email
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

// Add member to organization
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;

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
    const userResult = await query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado', 
        details: `Nenhum usuário com o email "${email}" está cadastrado no sistema. O usuário precisa se cadastrar primeiro.`
      });
    }

    const userId = userResult.rows[0].id;

    const result = await query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [id, userId, role || 'agent']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Erro ao adicionar membro' });
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
