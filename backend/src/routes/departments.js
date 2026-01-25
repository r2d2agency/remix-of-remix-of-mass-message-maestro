import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Resiliência: se o schema de departamentos ainda não foi criado/propagado,
// não derrubar o app com 500 em endpoints de listagem usados no UI.
function isDepartmentsSchemaMissing(error) {
  const code = error?.code;
  if (!code) return false;
  // 42P01 = undefined_table, 42703 = undefined_column
  if (!['42P01', '42703'].includes(code)) return false;
  const msg = String(error?.message || '');
  return /\bdepartments\b|\bdepartment_members\b|\bdepartment_id\b/i.test(msg);
}

// Helper para obter organização do usuário
async function getUserOrganization(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// Helper para verificar se é admin/manager
function isAdmin(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

// ============================================
// CRUD DE DEPARTAMENTOS
// ============================================

// Listar departamentos da organização
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      `SELECT 
        d.*,
        COUNT(DISTINCT dm.user_id) as member_count,
        COUNT(DISTINCT dm.user_id) FILTER (WHERE dm.is_available = true) as available_count,
        COALESCE(SUM(dm.current_chats), 0) as active_chats
       FROM departments d
       LEFT JOIN department_members dm ON d.id = dm.department_id
       WHERE d.organization_id = $1
       GROUP BY d.id
       ORDER BY d.name`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente; retornando lista vazia:', error.message);
      return res.json([]);
    }
    console.error('Erro ao listar departamentos:', error);
    res.status(500).json({ error: 'Erro ao listar departamentos' });
  }
});

// Buscar departamento por ID
router.get('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      `SELECT d.*, 
        COUNT(DISTINCT dm.user_id) as member_count
       FROM departments d
       LEFT JOIN department_members dm ON d.id = dm.department_id
       WHERE d.id = $1 AND d.organization_id = $2
       GROUP BY d.id`,
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (get by id):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    console.error('Erro ao buscar departamento:', error);
    res.status(500).json({ error: 'Erro ao buscar departamento' });
  }
});

// Criar departamento
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para criar departamentos' });
    }

    const {
      name,
      description,
      color,
      icon,
      max_concurrent_chats,
      auto_assign,
      business_hours_enabled,
      business_hours_start,
      business_hours_end,
      business_days,
      welcome_message,
      offline_message,
      queue_message
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      `INSERT INTO departments (
        organization_id, name, description, color, icon,
        max_concurrent_chats, auto_assign,
        business_hours_enabled, business_hours_start, business_hours_end, business_days,
        welcome_message, offline_message, queue_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        org.organization_id,
        name,
        description || null,
        color || '#6366f1',
        icon || 'users',
        max_concurrent_chats || 5,
        auto_assign || false,
        business_hours_enabled || false,
        business_hours_start || '08:00',
        business_hours_end || '18:00',
        business_days || [1, 2, 3, 4, 5],
        welcome_message || null,
        offline_message || null,
        queue_message || 'Você está na fila de espera. Em breve um atendente irá te atender.'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (create):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Já existe um departamento com este nome' });
    }
    console.error('Erro ao criar departamento:', error);
    res.status(500).json({ error: 'Erro ao criar departamento' });
  }
});

// Atualizar departamento
router.patch('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para editar departamentos' });
    }

    const existing = await query(
      'SELECT id FROM departments WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'name', 'description', 'color', 'icon', 'is_active',
      'max_concurrent_chats', 'auto_assign',
      'business_hours_enabled', 'business_hours_start', 'business_hours_end', 'business_days',
      'welcome_message', 'offline_message', 'queue_message'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(req.body[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(req.params.id);
    values.push(org.organization_id);

    const result = await query(
      `UPDATE departments SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (update):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Já existe um departamento com este nome' });
    }
    console.error('Erro ao atualizar departamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar departamento' });
  }
});

// Deletar departamento
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para deletar departamentos' });
    }

    const result = await query(
      'DELETE FROM departments WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (delete):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    console.error('Erro ao deletar departamento:', error);
    res.status(500).json({ error: 'Erro ao deletar departamento' });
  }
});

// ============================================
// MEMBROS DO DEPARTAMENTO
// ============================================

// Listar membros de um departamento
router.get('/:id/members', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    // Verificar se departamento pertence à organização
    const dept = await query(
      'SELECT id FROM departments WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (dept.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    const result = await query(
      `SELECT 
        dm.*,
        u.name as user_name,
        u.email as user_email,
         NULL::text as avatar_url
       FROM department_members dm
       JOIN users u ON dm.user_id = u.id
       WHERE dm.department_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (members list); retornando vazio:', error.message);
      return res.json([]);
    }
    console.error('Erro ao listar membros:', error);
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
});

// Adicionar membro ao departamento
router.post('/:id/members', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { user_id, role } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id é obrigatório' });
    }

    // Verificar se departamento pertence à organização
    const dept = await query(
      'SELECT id FROM departments WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (dept.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    // Verificar se usuário pertence à mesma organização
    const userOrg = await query(
      'SELECT organization_id FROM organization_members WHERE user_id = $1 AND organization_id = $2',
      [user_id, org.organization_id]
    );

    if (userOrg.rows.length === 0) {
      return res.status(400).json({ error: 'Usuário não pertence à organização' });
    }

    const result = await query(
      `INSERT INTO department_members (department_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (department_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [req.params.id, user_id, role || 'agent']
    );

    // Buscar dados completos do membro
    const member = await query(
      `SELECT 
        dm.*,
        u.name as user_name,
        u.email as user_email,
        NULL::text as avatar_url
       FROM department_members dm
       JOIN users u ON dm.user_id = u.id
       WHERE dm.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(member.rows[0]);
  } catch (error) {
    console.error('Erro ao adicionar membro - detalhes:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      constraint: error.constraint
    });
    
    if (isDepartmentsSchemaMissing(error)) {
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível. Execute o deploy para criar as tabelas.' });
    }
    
    // Constraint violation (duplicate)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Usuário já é membro deste departamento' });
    }
    
    // Foreign key violation
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Usuário ou departamento inválido' });
    }
    
    res.status(500).json({ error: error.message || 'Erro ao adicionar membro' });
  }
});

// Remover membro do departamento
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Verificar se departamento pertence à organização
    const dept = await query(
      'SELECT id FROM departments WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (dept.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    await query(
      'DELETE FROM department_members WHERE department_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );

    res.json({ success: true });
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (remove member):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    console.error('Erro ao remover membro:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
});

// Atualizar disponibilidade do membro
router.patch('/:id/members/:userId/availability', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const { is_available } = req.body;

    // Verificar se o usuário está atualizando sua própria disponibilidade ou é admin
    if (req.params.userId !== req.userId && !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `UPDATE department_members 
       SET is_available = $1
       WHERE department_id = $2 AND user_id = $3
       RETURNING *`,
      [is_available, req.params.id, req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (availability):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    console.error('Erro ao atualizar disponibilidade:', error);
    res.status(500).json({ error: 'Erro ao atualizar disponibilidade' });
  }
});

// ============================================
// DEPARTAMENTOS DO USUÁRIO
// ============================================

// Listar departamentos do usuário logado
router.get('/user/my-departments', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        d.*,
        dm.role as my_role,
        dm.is_available,
        dm.current_chats,
        COUNT(DISTINCT dm2.user_id) as member_count,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'pending') as pending_chats
       FROM department_members dm
       JOIN departments d ON dm.department_id = d.id
       LEFT JOIN department_members dm2 ON d.id = dm2.department_id
       LEFT JOIN conversations c ON d.id = c.department_id AND c.status = 'pending'
       WHERE dm.user_id = $1 AND d.is_active = true
       GROUP BY d.id, dm.role, dm.is_available, dm.current_chats
       ORDER BY d.name`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (my-departments); retornando lista vazia:', error.message);
      return res.json([]);
    }
    console.error('Erro ao listar meus departamentos:', error);
    res.status(500).json({ error: 'Erro ao listar departamentos' });
  }
});

// Atualizar minha disponibilidade em todos os departamentos
router.patch('/user/availability', async (req, res) => {
  try {
    const { is_available } = req.body;

    await query(
      'UPDATE department_members SET is_available = $1 WHERE user_id = $2',
      [is_available, req.userId]
    );

    res.json({ success: true, is_available });
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (user availability):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    console.error('Erro ao atualizar disponibilidade:', error);
    res.status(500).json({ error: 'Erro ao atualizar disponibilidade' });
  }
});

// ============================================
// TRANSFERÊNCIA PARA DEPARTAMENTO
// ============================================

// Transferir conversa para departamento
router.post('/transfer/:conversationId', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const { department_id } = req.body;

    if (!department_id) {
      return res.status(400).json({ error: 'department_id é obrigatório' });
    }

    // Verificar se departamento existe e pertence à organização
    const dept = await query(
      'SELECT * FROM departments WHERE id = $1 AND organization_id = $2 AND is_active = true',
      [department_id, org.organization_id]
    );

    if (dept.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado ou inativo' });
    }

    // Atualizar conversa
    const result = await query(
      `UPDATE conversations 
       SET department_id = $1, 
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [department_id, req.params.conversationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    res.json({ 
      success: true, 
      conversation: result.rows[0],
      department: dept.rows[0]
    });
  } catch (error) {
    if (isDepartmentsSchemaMissing(error)) {
      console.warn('Schema de departamentos ausente (transfer):', error.message);
      return res.status(503).json({ error: 'Módulo de Departamentos não está disponível (schema não instalado)' });
    }
    console.error('Erro ao transferir conversa:', error);
    res.status(500).json({ error: 'Erro ao transferir conversa' });
  }
});

export default router;
