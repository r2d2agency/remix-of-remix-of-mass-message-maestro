import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import * as wapiProvider from '../lib/wapi-provider.js';

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

// List connections (respects connection_members restrictions)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    const isOwner = org && org.role === 'owner';

    // Owner always sees ALL org connections
    if (isOwner) {
      const result = await query(
        `SELECT c.*, u.name as created_by_name,
         CASE 
           WHEN c.provider IS NOT NULL THEN c.provider 
           WHEN c.instance_id IS NOT NULL AND c.wapi_token IS NOT NULL THEN 'wapi'
           ELSE 'evolution'
         END as provider
         FROM connections c
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.organization_id = $1
         ORDER BY c.created_at DESC`,
        [org.organization_id]
      );
      return res.json(result.rows);
    }

    // All other roles: only see connections explicitly assigned via connection_members
    const specificResult = await query(
      `SELECT DISTINCT cm.connection_id FROM connection_members cm WHERE cm.user_id = $1`,
      [req.userId]
    );
    
    if (specificResult.rows.length > 0) {
      const connIds = specificResult.rows.map(r => r.connection_id);
      const result = await query(
        `SELECT c.*, u.name as created_by_name,
         CASE 
           WHEN c.provider IS NOT NULL THEN c.provider 
           WHEN c.instance_id IS NOT NULL AND c.wapi_token IS NOT NULL THEN 'wapi'
           ELSE 'evolution'
         END as provider
         FROM connections c
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.id = ANY($1)
         ORDER BY c.created_at DESC`,
        [connIds]
      );
      return res.json(result.rows);
    }

    // No assignments and not owner = no connections
    if (org) {
      return res.json([]);
    }

    // Fallback: user without organization sees only their own
    const result = await query(
      `SELECT *,
       CASE 
         WHEN provider IS NOT NULL THEN provider 
         WHEN instance_id IS NOT NULL AND wapi_token IS NOT NULL THEN 'wapi'
         ELSE 'evolution'
       END as provider
       FROM connections WHERE user_id = $1 ORDER BY created_at DESC`,
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

    // Auto-configure webhooks for W-API connections
    if (provider === 'wapi') {
      try {
        const webhookResult = await wapiProvider.configureWebhooks(instance_id, wapi_token);
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

    // Allow update if user owns the connection OR belongs to same organization
    let whereClause = 'id = $10 AND user_id = $11';
    let params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, show_groups, id, req.userId];

    if (org) {
      whereClause = 'id = $10 AND organization_id = $11';
      params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, show_groups, id, org.organization_id];
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

    const org = await getUserOrganization(req.userId);

    // Allow delete if user owns the connection OR belongs to same organization (with permission)
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org && ['owner', 'admin', 'manager'].includes(org.role)) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const result = await query(
      `DELETE FROM connections WHERE ${whereClause} RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

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

    // Get connection
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const connResult = await query(
      `SELECT * FROM connections WHERE ${whereClause}`,
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

    // Configure webhooks
    const result = await wapiProvider.configureWebhooks(connection.instance_id, connection.wapi_token);

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

    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const connResult = await query(
      `SELECT * FROM connections WHERE ${whereClause}`,
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

    // Auto-configure webhooks
    try {
      const webhookResult = await wapiProvider.configureWebhooks(instanceId, instanceToken);
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

export default router;

