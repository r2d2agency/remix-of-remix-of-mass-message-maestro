import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Helper to get user's organization
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

function isAdmin(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

// ============================================
// FLOWS CRUD
// ============================================

// List all flows
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Usuário não pertence a uma organização' });
    }

    const result = await query(
      `SELECT 
        f.*,
        u.name as last_edited_by_name,
        (SELECT COUNT(*) FROM flow_nodes WHERE flow_id = f.id) as node_count
       FROM flows f
       LEFT JOIN users u ON u.id = f.last_edited_by
       WHERE f.organization_id = $1
       ORDER BY f.updated_at DESC`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List flows error:', error);
    res.status(500).json({ error: 'Erro ao listar fluxos' });
  }
});

// Get flow by ID
router.get('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `SELECT * FROM flows WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get flow error:', error);
    res.status(500).json({ error: 'Erro ao buscar fluxo' });
  }
});

// Create flow
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão para criar fluxos' });
    }

    const { name, description, trigger_enabled, trigger_keywords, trigger_match_mode, connection_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      `INSERT INTO flows (
        organization_id, name, description, 
        trigger_enabled, trigger_keywords, trigger_match_mode,
        connection_ids, last_edited_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        org.organization_id,
        name,
        description || null,
        trigger_enabled || false,
        trigger_keywords || [],
        trigger_match_mode || 'exact',
        connection_ids || [],
        req.userId
      ]
    );

    // Create default start node
    await query(
      `INSERT INTO flow_nodes (flow_id, node_id, node_type, name, position_x, position_y, content)
       VALUES ($1, 'start', 'start', 'Início', 250, 50, '{}')`,
      [result.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create flow error:', error);
    res.status(500).json({ error: 'Erro ao criar fluxo' });
  }
});

// Update flow
router.patch('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const existing = await query(
      'SELECT id FROM flows WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    const allowedFields = [
      'name', 'description', 'trigger_enabled', 'trigger_keywords', 
      'trigger_match_mode', 'is_active', 'is_draft', 'connection_ids'
    ];

    const updates = [];
    const values = [];
    let paramCount = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'trigger_keywords' || field === 'connection_ids') {
          updates.push(`${field} = $${paramCount}`);
          values.push(req.body[field]);
        } else {
          updates.push(`${field} = $${paramCount}`);
          values.push(req.body[field]);
        }
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updates.push(`last_edited_by = $${paramCount++}`);
    values.push(req.userId);
    updates.push('updated_at = NOW()');

    values.push(req.params.id);
    values.push(org.organization_id);

    const result = await query(
      `UPDATE flows SET ${updates.join(', ')} 
       WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update flow error:', error);
    res.status(500).json({ error: 'Erro ao atualizar fluxo' });
  }
});

// Delete flow
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      'DELETE FROM flows WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete flow error:', error);
    res.status(500).json({ error: 'Erro ao deletar fluxo' });
  }
});

// Toggle flow active state
router.post('/:id/toggle', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const result = await query(
      `UPDATE flows SET 
        is_active = NOT is_active,
        updated_at = NOW(),
        last_edited_by = $1
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [req.userId, req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Toggle flow error:', error);
    res.status(500).json({ error: 'Erro ao alternar fluxo' });
  }
});

// ============================================
// FLOW NODES & EDGES
// ============================================

// Get nodes and edges for a flow
router.get('/:id/canvas', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const flow = await query(
      'SELECT id FROM flows WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (flow.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    const [nodes, edges] = await Promise.all([
      query(
        `SELECT * FROM flow_nodes WHERE flow_id = $1 ORDER BY created_at`,
        [req.params.id]
      ),
      query(
        `SELECT * FROM flow_edges WHERE flow_id = $1 ORDER BY created_at`,
        [req.params.id]
      )
    ]);

    res.json({
      nodes: nodes.rows,
      edges: edges.rows
    });
  } catch (error) {
    console.error('Get canvas error:', error);
    res.status(500).json({ error: 'Erro ao buscar canvas' });
  }
});

// Save nodes and edges (full replacement)
router.put('/:id/canvas', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { nodes, edges } = req.body;

    const flow = await query(
      'SELECT id, version FROM flows WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (flow.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    const flowId = flow.rows[0].id;
    const currentVersion = flow.rows[0].version || 1;

    // Save current version to history
    const existingNodes = await query('SELECT * FROM flow_nodes WHERE flow_id = $1', [flowId]);
    const existingEdges = await query('SELECT * FROM flow_edges WHERE flow_id = $1', [flowId]);

    await query(
      `INSERT INTO flow_versions (flow_id, version, nodes_data, edges_data, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (flow_id, version) DO NOTHING`,
      [flowId, currentVersion, JSON.stringify(existingNodes.rows), JSON.stringify(existingEdges.rows), req.userId]
    );

    // Delete existing nodes and edges
    await query('DELETE FROM flow_nodes WHERE flow_id = $1', [flowId]);
    await query('DELETE FROM flow_edges WHERE flow_id = $1', [flowId]);

    // Insert new nodes
    if (nodes && nodes.length > 0) {
      for (const node of nodes) {
        await query(
          `INSERT INTO flow_nodes (flow_id, node_id, node_type, name, position_x, position_y, content)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            flowId,
            node.node_id || node.id,
            node.node_type || node.type,
            node.name || node.data?.label,
            node.position_x ?? node.position?.x ?? 0,
            node.position_y ?? node.position?.y ?? 0,
            JSON.stringify(node.content || node.data?.content || {})
          ]
        );
      }
    }

    // Insert new edges
    if (edges && edges.length > 0) {
      for (const edge of edges) {
        await query(
          `INSERT INTO flow_edges (flow_id, edge_id, source_node_id, target_node_id, source_handle, target_handle, label, edge_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            flowId,
            edge.edge_id || edge.id,
            edge.source_node_id || edge.source,
            edge.target_node_id || edge.target,
            edge.source_handle || edge.sourceHandle,
            edge.target_handle || edge.targetHandle,
            edge.label || null,
            edge.edge_type || edge.type || 'default'
          ]
        );
      }
    }

    // Increment version
    await query(
      `UPDATE flows SET version = $1, updated_at = NOW(), last_edited_by = $2, is_draft = false WHERE id = $3`,
      [currentVersion + 1, req.userId, flowId]
    );

    res.json({ success: true, version: currentVersion + 1 });
  } catch (error) {
    console.error('Save canvas error:', error);
    res.status(500).json({ error: 'Erro ao salvar canvas' });
  }
});

// Duplicate flow
router.post('/:id/duplicate', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !isAdmin(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const original = await query(
      'SELECT * FROM flows WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );

    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'Fluxo não encontrado' });
    }

    const flow = original.rows[0];

    // Create copy
    const copy = await query(
      `INSERT INTO flows (
        organization_id, name, description, 
        trigger_enabled, trigger_keywords, trigger_match_mode,
        connection_ids, is_draft, last_edited_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
      RETURNING *`,
      [
        org.organization_id,
        `${flow.name} (cópia)`,
        flow.description,
        false, // disabled by default
        flow.trigger_keywords || [],
        flow.trigger_match_mode,
        flow.connection_ids || [],
        req.userId
      ]
    );

    const newFlowId = copy.rows[0].id;

    // Copy nodes
    const nodes = await query('SELECT * FROM flow_nodes WHERE flow_id = $1', [req.params.id]);
    for (const node of nodes.rows) {
      await query(
        `INSERT INTO flow_nodes (flow_id, node_id, node_type, name, position_x, position_y, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newFlowId, node.node_id, node.node_type, node.name, node.position_x, node.position_y, node.content]
      );
    }

    // Copy edges
    const edges = await query('SELECT * FROM flow_edges WHERE flow_id = $1', [req.params.id]);
    for (const edge of edges.rows) {
      await query(
        `INSERT INTO flow_edges (flow_id, edge_id, source_node_id, target_node_id, source_handle, target_handle, label, edge_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newFlowId, edge.edge_id, edge.source_node_id, edge.target_node_id, edge.source_handle, edge.target_handle, edge.label, edge.edge_type]
      );
    }

    res.status(201).json(copy.rows[0]);
  } catch (error) {
    console.error('Duplicate flow error:', error);
    res.status(500).json({ error: 'Erro ao duplicar fluxo' });
  }
});

export default router;
