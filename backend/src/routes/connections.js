import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import * as wapiProvider from '../lib/wapi-provider.js';
import { assignConnectionMember, ensureOwnConnectionMemberships } from '../lib/connection-members.js';

const W_API_INTEGRATOR_URL = 'https://api.w-api.app/v1/integrator';

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
  return result.rows[0] || null;
}

// Helper to build a WHERE clause that includes connection_members access
function buildConnectionAccessClause(id, userId, org) {
  if (org) {
    return {
      where: `id = $1 AND (organization_id = $2 OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $3))`,
      params: [id, org.organization_id, userId]
    };
  }
  return {
    where: `id = $1 AND (user_id = $2 OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $2))`,
    params: [id, userId]
  };
}

// List connections (ALL users only see assigned connections via connection_members)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    await ensureOwnConnectionMemberships(req.userId).catch((e) => {
      console.warn('[connections] could not backfill own connection membership:', e?.message);
    });

    // All other roles: only see connections explicitly assigned via connection_members
    const specificResult = await query(
      `SELECT DISTINCT cm.connection_id FROM connection_members cm WHERE cm.user_id = $1`,
      [req.userId]
    );
    
    // Build provider-derivation expression that preserves 'uazapi'
    const providerExpr = `CASE
       WHEN c.provider IS NOT NULL AND c.provider <> '' THEN c.provider
       WHEN c.uazapi_token IS NOT NULL THEN 'uazapi'
       WHEN c.instance_id IS NOT NULL AND c.wapi_token IS NOT NULL THEN 'wapi'
       ELSE 'evolution'
     END`;

    if (specificResult.rows.length > 0) {
      const connIds = specificResult.rows.map(r => r.connection_id);
      const result = await query(
        `SELECT c.*, u.name as created_by_name,
         ${providerExpr} as provider
         FROM connections c
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.id = ANY($1)
         ORDER BY c.created_at DESC`,
        [connIds]
      );
      return res.json(result.rows);
    }

    // No assignments: owners/admins see all org connections; everyone else nothing
    if (org) {
      if (['owner', 'admin'].includes(org.role)) {
        const result = await query(
          `SELECT c.*, u.name as created_by_name,
           ${providerExpr.replace(/c\.provider/g, 'c.provider').replace(/c\.uazapi_token/g, 'c.uazapi_token').replace(/c\.instance_id/g, 'c.instance_id').replace(/c\.wapi_token/g, 'c.wapi_token')} as provider
           FROM connections c
           LEFT JOIN users u ON c.user_id = u.id
           WHERE c.organization_id = $1
           ORDER BY c.created_at DESC`,
          [org.organization_id]
        );
        return res.json(result.rows);
      }
      return res.json([]);
    }

    // Fallback: user without organization sees only their own
    const result = await query(
      `SELECT c.*,
       ${providerExpr} as provider
       FROM connections c WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
      [req.userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('List connections error:', error);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
});

// Create connection
router.post('/', async (req, res) => {
  try {
    const { 
      provider = 'evolution', 
      api_url, 
      api_key, 
      instance_name, 
      instance_id,
      wapi_token,
      name 
    } = req.body;

    // Validate based on provider
    if (provider === 'wapi') {
      if (!instance_id || !wapi_token) {
        return res.status(400).json({ error: 'Instance ID e Token são obrigatórios para W-API' });
      }
    } else {
      if (!api_url || !api_key || !instance_name) {
        return res.status(400).json({ error: 'URL, API Key e nome da instância são obrigatórios' });
      }
    }

    const org = await getUserOrganization(req.userId);

    const result = await query(
      `INSERT INTO connections (user_id, organization_id, provider, api_url, api_key, instance_name, instance_id, wapi_token, name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.userId, 
        org?.organization_id || null, 
        provider,
        api_url || null, 
        api_key || null, 
        instance_name || null,
        instance_id || null,
        wapi_token || null,
        name || instance_name || instance_id
      ]
    );

    const connection = result.rows[0];

    await assignConnectionMember(connection.id, req.userId, { canManage: true }).catch((e) => {
      console.warn('[connections] could not assign creator to connection:', e?.message);
    });

    // Auto-configure webhooks for W-API connections
    if (provider === 'wapi') {
      try {
        const whUrlResult = await query(`SELECT value FROM system_settings WHERE key = 'wapi_default_webhook' LIMIT 1`);
        const defaultWh = whUrlResult.rows[0]?.value || null;
        const webhookResult = await wapiProvider.configureWebhooks(instance_id, wapi_token, defaultWh);
        console.log('[W-API] Webhook configuration result:', webhookResult);
        connection.webhooks_configured = webhookResult.success;
        connection.webhooks_count = webhookResult.configured;
      } catch (webhookError) {
        console.error('[W-API] Failed to configure webhooks:', webhookError);
        connection.webhooks_configured = false;
      }
    }

    res.status(201).json(connection);
  } catch (error) {
    console.error('Create connection error:', error);
    res.status(500).json({ error: 'Erro ao criar conexão' });
  }
});

// Update connection
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      provider,
      api_url, 
      api_key, 
      instance_name, 
      instance_id,
      wapi_token,
      name, 
      status,
      show_groups
    } = req.body;

    const org = await getUserOrganization(req.userId);

    // Allow update if user owns the connection, belongs to same organization, OR is assigned via connection_members
    let whereClause = 'id = $10 AND (user_id = $11 OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $11))';
    let params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, show_groups, id, req.userId];

    if (org) {
      whereClause = 'id = $10 AND (organization_id = $11 OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $12))';
      params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, show_groups, id, org.organization_id, req.userId];
    }

    const result = await query(
      `UPDATE connections 
       SET provider = COALESCE($1, provider),
           api_url = COALESCE($2, api_url),
           api_key = COALESCE($3, api_key),
           instance_name = COALESCE($4, instance_name),
           instance_id = COALESCE($5, instance_id),
           wapi_token = COALESCE($6, wapi_token),
           name = COALESCE($7, name),
           status = COALESCE($8, status),
           show_groups = COALESCE($9, show_groups),
           updated_at = NOW()
       WHERE ${whereClause}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update connection error:', error);
    res.status(500).json({ error: 'Erro ao atualizar conexão' });
  }
});

// Delete connection
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query; // ?force=true to skip external API calls

    const org = await getUserOrganization(req.userId);

    // Allow delete if user owns the connection, belongs to same organization (with permission),
    // OR is assigned via connection_members
    let whereClause = 'id = $1 AND (user_id = $2 OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $2))';
    let params = [id, req.userId];

    if (org && ['owner', 'admin', 'manager'].includes(org.role)) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    // First check if connection exists with access
    const checkResult = await query(
      `SELECT id, provider, instance_id, wapi_token FROM connections WHERE ${whereClause}`,
      params
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    // Clean up connection_members first
    await query(`DELETE FROM connection_members WHERE connection_id = $1`, [id]).catch(() => {});

    // Delete the connection from DB (even if external API call fails)
    const result = await query(
      `DELETE FROM connections WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    // Log the deletion
    await query(
      `INSERT INTO connection_error_logs (connection_id, organization_id, event_type, details, created_at)
       VALUES ($1, $2, 'connection_deleted', $3, NOW())`,
      [id, org?.organization_id || null, JSON.stringify({ deleted_by: req.userId, force: !!force })]
    ).catch(() => {}); // Don't fail if log table doesn't exist yet

    res.json({ success: true });
  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({ error: 'Erro ao deletar conexão' });
  }
});

// Reconfigure webhooks for W-API connection
router.post('/:id/configure-webhooks', async (req, res) => {
  try {
    const { id } = req.params;
    const org = await getUserOrganization(req.userId);

    const { where, params } = buildConnectionAccessClause(id, req.userId, org);

    const connResult = await query(
      `SELECT * FROM connections WHERE ${where}`,
      params
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    const provider =
      connection.provider ||
      (connection.instance_id && connection.wapi_token ? 'wapi' : 'evolution');

    if (provider !== 'wapi') {
      return res.status(400).json({ error: 'Esta funcionalidade é apenas para conexões W-API' });
    }

    if (!connection.instance_id || !connection.wapi_token) {
      return res.status(400).json({ error: 'Instance ID e Token não configurados' });
    }

    // Configure webhooks with default URL
    const whUrlResult = await query(`SELECT value FROM system_settings WHERE key = 'wapi_default_webhook' LIMIT 1`);
    const defaultWh = whUrlResult.rows[0]?.value || null;
    const result = await wapiProvider.configureWebhooks(connection.instance_id, connection.wapi_token, defaultWh);

    // Backfill provider for older rows
    if (connection.provider !== 'wapi') {
      await query('UPDATE connections SET provider = $1, updated_at = NOW() WHERE id = $2', ['wapi', id]);
    }

    res.json({
      success: result.success,
      message: result.success 
        ? `${result.configured}/${result.total} webhooks configurados com sucesso` 
        : 'Falha ao configurar webhooks',
      details: result.results,
    });
  } catch (error) {
    console.error('Configure webhooks error:', error);
    res.status(500).json({ error: 'Erro ao configurar webhooks' });
  }
});

// Get pairing code for W-API connection (connect by phone)
router.post('/:id/pairing-code', async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Número de telefone é obrigatório' });
    }

    const org = await getUserOrganization(req.userId);

    const { where, params } = buildConnectionAccessClause(id, req.userId, org);

    const connResult = await query(
      `SELECT * FROM connections WHERE ${where}`,
      params
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];
    const provider = connection.provider || (connection.instance_id && connection.wapi_token ? 'wapi' : 'evolution');

    if (provider !== 'wapi') {
      return res.status(400).json({ error: 'Código de pareamento disponível apenas para conexões W-API' });
    }

    if (!connection.instance_id || !connection.wapi_token) {
      return res.status(400).json({ error: 'Instance ID e Token não configurados' });
    }

    // Call W-API pairing code endpoint
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const response = await fetch(
      `https://api.w-api.app/v1/instance/pairing-code?instanceId=${connection.instance_id}&phoneNumber=${cleanPhone}`,
      {
        headers: {
          'Authorization': `Bearer ${connection.wapi_token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(400).json({ error: errorData.message || errorData.error || 'Falha ao gerar código de pareamento' });
    }

    const data = await response.json();
    const code = data.code || data.pairingCode || data.pairing_code || null;

    if (code) {
      res.json({ success: true, code });
    } else {
      res.status(400).json({ error: 'Código não retornado pela API' });
    }
  } catch (error) {
    console.error('Pairing code error:', error);
    res.status(500).json({ error: 'Erro ao gerar código de pareamento' });
  }
});

// Get W-API integrator token (global from system_settings)
router.get('/wapi-integrator/token', async (req, res) => {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'wapi_integrator_token' LIMIT 1`
    );
    const token = result.rows[0]?.value || null;
    res.json({ token: token ? '***configured***' : null });
  } catch (error) {
    console.error('Get integrator token error:', error);
    res.status(500).json({ error: 'Erro ao buscar token' });
  }
});

// Get W-API default webhook URL (global from system_settings)
router.get('/wapi-integrator/webhook-url', async (req, res) => {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'wapi_default_webhook' LIMIT 1`
    );
    res.json({ value: result.rows[0]?.value || null });
  } catch (error) {
    console.error('Get webhook URL error:', error);
    res.status(500).json({ error: 'Erro ao buscar webhook URL' });
  }
});

// Create W-API instance via Integrator API
router.post('/wapi-integrator/create-instance', async (req, res) => {
  try {
    const { instanceName } = req.body;
    if (!instanceName) return res.status(400).json({ error: 'Nome da instância é obrigatório' });

    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

    // Get global integrator token from system_settings
    const tokenResult = await query(
      `SELECT value FROM system_settings WHERE key = 'wapi_integrator_token' LIMIT 1`
    );
    const integratorToken = tokenResult.rows[0]?.value;
    if (!integratorToken) {
      return res.status(400).json({ error: 'Token do integrador W-API não configurado. Solicite ao administrador.' });
    }

    // Create instance via W-API Integrator API
    const response = await fetch(`${W_API_INTEGRATOR_URL}/create-instance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${integratorToken}`,
      },
      body: JSON.stringify({
        instanceName,
        rejectCalls: false,
        callMessage: 'No momento não posso atender. Por favor, envie uma mensagem de texto.',
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.message || data.error || 'Falha ao criar instância na W-API' 
      });
    }

    const instanceId = data.instanceId || data.instance_id;
    const instanceToken = data.token;

    if (!instanceId || !instanceToken) {
      return res.status(500).json({ error: 'Resposta inválida da W-API: instanceId ou token ausente' });
    }

    // Save connection in database
    const connResult = await query(
      `INSERT INTO connections (user_id, organization_id, provider, instance_id, wapi_token, name)
       VALUES ($1, $2, 'wapi', $3, $4, $5) RETURNING *`,
      [req.userId, org.organization_id, instanceId, instanceToken, instanceName]
    );

    const connection = connResult.rows[0];

    // Auto-configure webhooks with default URL from system_settings
    try {
      const webhookUrlResult = await query(
        `SELECT value FROM system_settings WHERE key = 'wapi_default_webhook' LIMIT 1`
      );
      const defaultWebhookUrl = webhookUrlResult.rows[0]?.value || null;
      const webhookResult = await wapiProvider.configureWebhooks(instanceId, instanceToken, defaultWebhookUrl);
      console.log('[W-API Integrator] Webhook configuration:', webhookResult);
      connection.webhooks_configured = webhookResult.success;
    } catch (webhookError) {
      console.error('[W-API Integrator] Webhook config failed:', webhookError);
    }

    res.status(201).json(connection);
  } catch (error) {
    console.error('Create W-API instance error:', error);
    res.status(500).json({ error: 'Erro ao criar instância W-API' });
  }
});

// List W-API instances via Integrator API
router.get('/wapi-integrator/instances', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org) return res.status(404).json({ error: 'Organização não encontrada' });

    const tokenResult = await query(
      `SELECT value FROM system_settings WHERE key = 'wapi_integrator_token' LIMIT 1`
    );
    const integratorToken = tokenResult.rows[0]?.value;
    if (!integratorToken) {
      return res.status(400).json({ error: 'Token do integrador não configurado' });
    }

    const response = await fetch(`${W_API_INTEGRATOR_URL}/instances?pageSize=100&page=1`, {
      headers: { 'Authorization': `Bearer ${integratorToken}` },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Falha ao listar instâncias' });
    }

    res.json(data);
  } catch (error) {
    console.error('List W-API instances error:', error);
    res.status(500).json({ error: 'Erro ao listar instâncias' });
  }
});

// Connection error logs (diagnostics)
router.get('/error-logs', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { connection_id, limit = '50' } = req.query;
    let filter = 'organization_id = $1';
    const params = [org.organization_id];

    if (connection_id) {
      filter += ' AND connection_id = $2';
      params.push(connection_id);
    }

    const result = await query(
      `SELECT * FROM connection_error_logs WHERE ${filter} ORDER BY created_at DESC LIMIT ${Math.min(parseInt(limit) || 50, 200)}`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error logs error:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// Clear old connection error logs
router.delete('/error-logs', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    if (!org || !['owner', 'admin'].includes(org.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    await query(
      `DELETE FROM connection_error_logs WHERE organization_id = $1 AND created_at < NOW() - INTERVAL '7 days'`,
      [org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao limpar logs' });
  }
});

export default router;

