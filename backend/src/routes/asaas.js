import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// Webhook endpoint (public, validated by token)
router.post('/webhook/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const event = req.body;
    
    console.log('Asaas webhook received:', event.event, 'for org:', organizationId);

    // Validate webhook token if configured
    const integrationResult = await query(
      `SELECT * FROM asaas_integrations WHERE organization_id = $1`,
      [organizationId]
    );
    
    if (integrationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Integração não encontrada' });
    }

    const integration = integrationResult.rows[0];
    
    // Log webhook event
    await query(
      `INSERT INTO asaas_webhook_events (organization_id, event_type, payment_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [organizationId, event.event, event.payment?.id, JSON.stringify(event)]
    );

    // Process payment events
    if (event.payment) {
      const payment = event.payment;
      
      // Upsert customer
      if (payment.customer) {
        await query(
          `INSERT INTO asaas_customers (organization_id, asaas_id, name, email, phone, cpf_cnpj)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (organization_id, asaas_id) DO UPDATE SET
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             updated_at = NOW()`,
          [organizationId, payment.customer, payment.customerName || 'Cliente', payment.customerEmail, payment.customerPhone, payment.cpfCnpj]
        );
      }

      // Get customer UUID
      const customerResult = await query(
        `SELECT id FROM asaas_customers WHERE organization_id = $1 AND asaas_id = $2`,
        [organizationId, payment.customer]
      );
      const customerId = customerResult.rows[0]?.id;

      // Upsert payment
      await query(
        `INSERT INTO asaas_payments (
           organization_id, asaas_id, customer_id, asaas_customer_id, value, net_value,
           due_date, billing_type, status, payment_link, invoice_url, bank_slip_url,
           pix_qr_code, pix_copy_paste, description, external_reference, confirmed_date, payment_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (organization_id, asaas_id) DO UPDATE SET
           status = EXCLUDED.status,
           net_value = EXCLUDED.net_value,
           confirmed_date = EXCLUDED.confirmed_date,
           payment_date = EXCLUDED.payment_date,
           updated_at = NOW()`,
        [
          organizationId,
          payment.id,
          customerId,
          payment.customer,
          payment.value,
          payment.netValue,
          payment.dueDate,
          payment.billingType,
          payment.status,
          payment.invoiceUrl,
          payment.invoiceUrl,
          payment.bankSlipUrl,
          payment.pixQrCode,
          payment.pixCopiaECola,
          payment.description,
          payment.externalReference,
          payment.confirmedDate,
          payment.paymentDate
        ]
      );

      // If payment is RECEIVED, CONFIRMED or RECEIVED_IN_CASH, cancel pending notifications
      const paidStatuses = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
      if (paidStatuses.includes(payment.status)) {
        // Get the payment ID in our database
        const paymentResult = await query(
          `SELECT id FROM asaas_payments WHERE organization_id = $1 AND asaas_id = $2`,
          [organizationId, payment.id]
        );
        
        if (paymentResult.rows.length > 0) {
          const paymentDbId = paymentResult.rows[0].id;
          
          // Cancel all pending notifications for this payment
          await query(
            `UPDATE billing_notifications 
             SET status = 'cancelled', error_message = 'Pagamento confirmado via webhook'
             WHERE payment_id = $1 AND status = 'pending'`,
            [paymentDbId]
          );
          
          console.log(`  ✓ Cancelled pending notifications for paid payment: ${payment.id}`);
        }
      }

      // Mark webhook as processed
      await query(
        `UPDATE asaas_webhook_events 
         SET processed = true, processed_at = NOW()
         WHERE organization_id = $1 AND payment_id = $2 AND processed = false`,
        [organizationId, payment.id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
});

// Protected routes
router.use(authenticate);

// Helper to check org access
async function checkOrgAccess(userId, organizationId) {
  const result = await query(
    `SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId]
  );
  return result.rows[0];
}

// Get Asaas integration for organization
router.get('/integration/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    
    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `SELECT id, organization_id, environment, is_active, last_sync_at, created_at
       FROM asaas_integrations WHERE organization_id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get integration error:', error);
    res.status(500).json({ error: 'Erro ao buscar integração' });
  }
});

// Configure Asaas integration
router.post('/integration/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { api_key, environment } = req.body;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return res.status(403).json({ error: 'Apenas admins podem configurar integrações' });
    }

    // Test API key
    const baseUrl = environment === 'production' 
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    const testResponse = await fetch(`${baseUrl}/customers?limit=1`, {
      headers: { 'access_token': api_key }
    });

    if (!testResponse.ok) {
      return res.status(400).json({ error: 'API Key inválida' });
    }

    // Generate webhook token
    const webhookToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `INSERT INTO asaas_integrations (organization_id, api_key, environment, webhook_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id) DO UPDATE SET
         api_key = EXCLUDED.api_key,
         environment = EXCLUDED.environment,
         webhook_token = COALESCE(asaas_integrations.webhook_token, EXCLUDED.webhook_token),
         is_active = true,
         updated_at = NOW()
       RETURNING id, organization_id, environment, webhook_token, is_active, created_at`,
      [organizationId, api_key, environment || 'sandbox', webhookToken]
    );

    res.json({
      ...result.rows[0],
      webhook_url: `${process.env.API_URL || 'https://your-api.com'}/api/asaas/webhook/${organizationId}`
    });
  } catch (error) {
    console.error('Configure integration error:', error);
    res.status(500).json({ error: 'Erro ao configurar integração' });
  }
});

// Sync payments from Asaas
// NOTE: This endpoint can take a long time with many records. 
// We set CORS headers upfront so even if proxy times out, browser gets headers.
// We also limit to a max of 500 items per sync to avoid timeout.
router.post('/sync/:organizationId', async (req, res) => {
  // Set CORS headers IMMEDIATELY before any async work
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    const { organizationId } = req.params;
    const maxItemsPerSync = 500; // Limit to avoid timeout

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const integrationResult = await query(
      `SELECT * FROM asaas_integrations WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    if (integrationResult.rows.length === 0) {
      return res.status(400).json({ error: 'Integração não configurada ou inativa' });
    }

    const integration = integrationResult.rows[0];
    const baseUrl = integration.environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    const fetchAsaasJson = async (url) => {
      const resp = await fetch(url, { headers: { 'access_token': integration.api_key } });
      const contentType = (resp.headers.get('content-type') || '').toLowerCase();

      let body;
      if (contentType.includes('application/json')) {
        try {
          body = await resp.json();
        } catch (e) {
          body = await resp.text().catch(() => null);
        }
      } else {
        body = await resp.text().catch(() => null);
      }

      if (!resp.ok) {
        const snippet = typeof body === 'string'
          ? body.slice(0, 300)
          : JSON.stringify(body ?? {}).slice(0, 300);
        const err = new Error(`Asaas ${resp.status}: ${snippet}`);
        err.httpStatus = resp.status;
        throw err;
      }

      if (!body || typeof body !== 'object') {
        throw new Error('Asaas: resposta inválida (não-JSON)');
      }

      return body;
    };

    let totalItemsSynced = 0;
    
    // PRIORITY: Sync payments FIRST (OVERDUE then PENDING) - these are more critical
    const statuses = ['OVERDUE', 'PENDING']; // OVERDUE first!
    let paymentsCount = 0;
    const statusCounts = { PENDING: 0, OVERDUE: 0 };
    const syncedCustomerIds = new Set(); // Track customers we need to sync

    for (const status of statuses) {
      if (totalItemsSynced >= maxItemsPerSync) break;
      
      let paymentOffset = 0;

      while (totalItemsSynced < maxItemsPerSync) {
        const paymentsData = await fetchAsaasJson(
          `${baseUrl}/payments?status=${status}&limit=100&offset=${paymentOffset}`
        );

        if (!paymentsData.data || paymentsData.data.length === 0) {
          break;
        }

        for (const payment of paymentsData.data) {
          if (totalItemsSynced >= maxItemsPerSync) break;

          // Track customer ID for later sync
          if (payment.customer) {
            syncedCustomerIds.add(payment.customer);
          }

          // Upsert customer inline (minimal data from payment)
          if (payment.customer) {
            await query(
              `INSERT INTO asaas_customers (organization_id, asaas_id, name, email, phone)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (organization_id, asaas_id) DO UPDATE SET
                 name = COALESCE(EXCLUDED.name, asaas_customers.name),
                 email = COALESCE(EXCLUDED.email, asaas_customers.email),
                 phone = COALESCE(EXCLUDED.phone, asaas_customers.phone),
                 updated_at = NOW()`,
              [organizationId, payment.customer, payment.customerName || 'Cliente', payment.customerEmail, payment.customerPhone]
            );
          }

          // Get customer UUID
          const customerResult = await query(
            `SELECT id FROM asaas_customers WHERE organization_id = $1 AND asaas_id = $2`,
            [organizationId, payment.customer]
          );
          const customerId = customerResult.rows[0]?.id;

          await query(
            `INSERT INTO asaas_payments (
               organization_id, asaas_id, customer_id, asaas_customer_id, value, net_value,
               due_date, billing_type, status, payment_link, invoice_url, bank_slip_url,
               pix_qr_code, pix_copy_paste, description, external_reference
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (organization_id, asaas_id) DO UPDATE SET
               status = EXCLUDED.status,
               net_value = EXCLUDED.net_value,
               due_date = EXCLUDED.due_date,
               updated_at = NOW()`,
            [
              organizationId,
              payment.id,
              customerId,
              payment.customer,
              payment.value,
              payment.netValue,
              payment.dueDate,
              payment.billingType,
              payment.status,
              payment.invoiceUrl,
              payment.invoiceUrl,
              payment.bankSlipUrl,
              null,
              null,
              payment.description,
              payment.externalReference
            ]
          );
          paymentsCount++;
          statusCounts[status]++;
          totalItemsSynced++;
        }

        paymentOffset += 100;
        if (paymentsData.data.length < 100) break;
      }
    }
    
    // Sync remaining customers if we have capacity (lower priority)
    let customersCount = syncedCustomerIds.size; // Already synced inline with payments
    let customerOffset = 0;
    
    while (totalItemsSynced < maxItemsPerSync) {
      const customersData = await fetchAsaasJson(
        `${baseUrl}/customers?limit=100&offset=${customerOffset}`
      );

      if (!customersData.data || customersData.data.length === 0) {
        break;
      }

      for (const customer of customersData.data) {
        if (totalItemsSynced >= maxItemsPerSync) break;
        
        // Skip if already synced via payment
        if (syncedCustomerIds.has(customer.id)) continue;
        
        await query(
          `INSERT INTO asaas_customers (organization_id, asaas_id, name, email, phone, cpf_cnpj, external_reference)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (organization_id, asaas_id) DO UPDATE SET
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             cpf_cnpj = EXCLUDED.cpf_cnpj,
             external_reference = EXCLUDED.external_reference,
             updated_at = NOW()`,
          [organizationId, customer.id, customer.name, customer.email, customer.phone, customer.cpfCnpj, customer.externalReference]
        );
        customersCount++;
        totalItemsSynced++;
      }

      customerOffset += 100;
      if (customersData.data.length < 100) break;
    }

    // Update last sync
    await query(
      `UPDATE asaas_integrations SET last_sync_at = NOW() WHERE organization_id = $1`,
      [organizationId]
    );

    const needsMoreSync = totalItemsSynced >= maxItemsPerSync;
    
    res.json({ 
      success: true, 
      customers_synced: customersCount,
      payments_synced: paymentsCount,
      pending_synced: statusCounts.PENDING,
      overdue_synced: statusCounts.OVERDUE,
      partial: needsMoreSync,
      message: needsMoreSync 
        ? `Sincronizados ${totalItemsSynced} itens. Clique novamente para continuar.`
        : `Sincronização completa: ${customersCount} clientes, ${paymentsCount} cobranças.`
    });
  } catch (error) {
    console.error('Sync error:', error);
    // CORS headers already set at start of handler
    const message = error?.message || 'Erro ao sincronizar com Asaas';
    if (String(message).startsWith('Asaas')) {
      return res.status(502).json({ error: message });
    }
    res.status(500).json({ error: 'Erro ao sincronizar com Asaas', details: message });
  }
});

// Check Asaas API directly - compare what's in Asaas vs what's synced
router.get('/check/:organizationId', async (req, res) => {
  // Set CORS headers IMMEDIATELY before any async work
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    const { organizationId } = req.params;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const integrationResult = await query(
      `SELECT * FROM asaas_integrations WHERE organization_id = $1 AND is_active = true`,
      [organizationId]
    );

    if (integrationResult.rows.length === 0) {
      return res.status(400).json({ error: 'Integração não configurada ou inativa' });
    }

    const integration = integrationResult.rows[0];
    const baseUrl = integration.environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    const fetchAsaasJsonSafe = async (url) => {
      const resp = await fetch(url, { headers: { 'access_token': integration.api_key } });
      const contentType = (resp.headers.get('content-type') || '').toLowerCase();

      let body;
      if (contentType.includes('application/json')) {
        try {
          body = await resp.json();
        } catch (e) {
          body = await resp.text().catch(() => null);
        }
      } else {
        body = await resp.text().catch(() => null);
      }

      if (!resp.ok) {
        const snippet = typeof body === 'string'
          ? body.slice(0, 300)
          : JSON.stringify(body ?? {}).slice(0, 300);
        throw new Error(`Asaas ${resp.status}: ${snippet}`);
      }

      if (!body || typeof body !== 'object') {
        throw new Error('Asaas: resposta inválida (não-JSON)');
      }

      return body;
    };

    // Get counts from Asaas API (safe)
    const errors = [];
    const asaasCounts = { PENDING: 0, OVERDUE: 0, total_customers: 0 };
    const today = new Date().toISOString().split('T')[0];
    
    // Count pending
    try {
      const pendingData = await fetchAsaasJsonSafe(`${baseUrl}/payments?status=PENDING&limit=1`);
      asaasCounts.PENDING = pendingData.totalCount || 0;
    } catch (e) {
      errors.push({ type: 'pending', message: e.message });
    }

    // Count overdue
    try {
      const overdueData = await fetchAsaasJsonSafe(`${baseUrl}/payments?status=OVERDUE&limit=1`);
      asaasCounts.OVERDUE = overdueData.totalCount || 0;
    } catch (e) {
      errors.push({ type: 'overdue', message: e.message });
    }

    // Count customers
    try {
      const customersData = await fetchAsaasJsonSafe(`${baseUrl}/customers?limit=1`);
      asaasCounts.total_customers = customersData.totalCount || 0;
    } catch (e) {
      errors.push({ type: 'customers', message: e.message });
    }

    // Get today's due payments
    let todayDueCount = 0;
    try {
      const todayData = await fetchAsaasJsonSafe(`${baseUrl}/payments?dueDate=${today}&limit=1`);
      todayDueCount = todayData.totalCount || 0;
    } catch (e) {
      errors.push({ type: 'today_due', message: e.message });
    }

    // Get counts from our database
    const dbCounts = await query(
      `SELECT 
        (SELECT COUNT(*) FROM asaas_payments WHERE organization_id = $1 AND status = 'PENDING') as pending,
        (SELECT COUNT(*) FROM asaas_payments WHERE organization_id = $1 AND status = 'OVERDUE') as overdue,
        (SELECT COUNT(*) FROM asaas_customers WHERE organization_id = $1) as customers,
        (SELECT COUNT(*) FROM asaas_payments WHERE organization_id = $1 AND due_date = CURRENT_DATE AND status IN ('PENDING', 'OVERDUE')) as today_due`,
      [organizationId]
    );

    const db = dbCounts.rows[0];

    res.json({
      asaas: {
        pending: asaasCounts.PENDING,
        overdue: asaasCounts.OVERDUE,
        customers: asaasCounts.total_customers,
        today_due: todayDueCount
      },
      database: {
        pending: parseInt(db.pending),
        overdue: parseInt(db.overdue),
        customers: parseInt(db.customers),
        today_due: parseInt(db.today_due)
      },
      synced: {
        pending: asaasCounts.PENDING === parseInt(db.pending),
        overdue: asaasCounts.OVERDUE === parseInt(db.overdue),
        customers: asaasCounts.total_customers === parseInt(db.customers)
      },
      errors,
      last_sync: integration.last_sync_at
    });
  } catch (error) {
    console.error('Check Asaas error:', error);
    // Ensure CORS headers are always set, even on errors
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const message = error?.message || 'Erro ao verificar Asaas';
    if (String(message).startsWith('Asaas')) {
      return res.status(502).json({ error: message, details: error?.message });
    }
    res.status(500).json({ error: 'Erro ao verificar Asaas', details: message });
  }
});

// Get payments (with filters)
router.get('/payments/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { status, due_date_start, due_date_end } = req.query;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let queryText = `
      SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
      FROM asaas_payments p
      LEFT JOIN asaas_customers c ON c.id = p.customer_id
      WHERE p.organization_id = $1
    `;
    const params = [organizationId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    if (due_date_start) {
      queryText += ` AND p.due_date >= $${paramIndex++}`;
      params.push(due_date_start);
    }

    if (due_date_end) {
      queryText += ` AND p.due_date <= $${paramIndex++}`;
      params.push(due_date_end);
    }

    queryText += ` ORDER BY p.due_date ASC`;

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Erro ao buscar cobranças' });
  }
});

// Get customers
router.get('/customers/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { show_blacklisted } = req.query;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
      let whereClause = 'WHERE c.organization_id = $1';
      if (show_blacklisted !== 'true') {
        whereClause += ' AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)';
      }

      const result = await query(
        `SELECT c.*, 
          (SELECT COUNT(*) FROM asaas_payments p WHERE p.customer_id = c.id AND p.status = 'PENDING') as pending_count,
          (SELECT COUNT(*) FROM asaas_payments p WHERE p.customer_id = c.id AND p.status = 'OVERDUE') as overdue_count,
          (SELECT SUM(value) FROM asaas_payments p WHERE p.customer_id = c.id AND p.status IN ('PENDING', 'OVERDUE')) as total_due
         FROM asaas_customers c
         ${whereClause}
         ORDER BY c.is_blacklisted ASC NULLS FIRST, c.billing_paused ASC NULLS FIRST, c.name`,
        [organizationId]
      );

      res.json(result.rows);
    } catch (queryError) {
      // Tables might not exist yet - return empty array
      console.log('Customers query error (tables may not exist):', queryError.message);
      res.json([]);
    }
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// Update customer (blacklist, pause, etc)
router.patch('/customers/:organizationId/:customerId', async (req, res) => {
  try {
    const { organizationId, customerId } = req.params;
    const { is_blacklisted, blacklist_reason, billing_paused, billing_paused_until, billing_paused_reason } = req.body;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Sem permissão para editar clientes' });
    }

    // First check if blacklist/pause columns exist, if not add them
    try {
      await query(`
        ALTER TABLE asaas_customers 
        ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS blacklist_reason TEXT,
        ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS billing_paused BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS billing_paused_until DATE,
        ADD COLUMN IF NOT EXISTS billing_paused_reason TEXT
      `);
    } catch (alterError) {
      // Ignore if columns already exist or other non-critical errors
      console.log('Column check/add (may be already present):', alterError.message);
    }

    const result = await query(
      `UPDATE asaas_customers SET
         is_blacklisted = COALESCE($1, is_blacklisted),
         blacklist_reason = CASE WHEN $1 = true THEN COALESCE($2, blacklist_reason) ELSE NULL END,
         blacklisted_at = CASE WHEN $1 = true THEN COALESCE(blacklisted_at, NOW()) ELSE NULL END,
         billing_paused = COALESCE($3, billing_paused),
         -- Accept empty string from UI date inputs ("" -> NULL) to avoid invalid date errors
         billing_paused_until = CASE WHEN $3 = true THEN NULLIF($4, '')::date ELSE NULL END,
         billing_paused_reason = CASE WHEN $3 = true THEN $5 ELSE NULL END,
         updated_at = NOW()
       WHERE id = $6 AND organization_id = $7
       RETURNING *`,
      [is_blacklisted, blacklist_reason, billing_paused, billing_paused_until, billing_paused_reason, customerId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update customer error:', error);
    // Provide more context for schema issues
    if (error.code === '42703') { // undefined_column
      return res.status(503).json({ 
        error: 'Colunas de blacklist/pausa não encontradas. Execute o schema-v3.sql no banco de dados.',
        details: error.message
      });
    }
    res.status(500).json({ error: 'Erro ao atualizar cliente', details: error.message });
  }
});

// Get/Update integration settings (message limits, alerts, global pause)
router.get('/settings/:organizationId', async (req, res) => {
  const buildDefaultSettings = () => ({
    daily_message_limit_per_customer: 3,
    billing_paused: false,
    billing_paused_until: null,
    billing_paused_reason: null,
    critical_alert_threshold: 1000,
    critical_alert_days: 30,
    alert_email: null,
    alert_whatsapp: null,
    alert_connection_id: null
  });

  try {
    const { organizationId } = req.params;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let result;
    try {
      result = await query(
        `SELECT 
          daily_message_limit_per_customer,
          billing_paused,
          billing_paused_until,
          billing_paused_reason,
          critical_alert_threshold,
          critical_alert_days,
          alert_email,
          alert_whatsapp,
          alert_connection_id
         FROM asaas_integrations WHERE organization_id = $1`,
        [organizationId]
      );
    } catch (queryError) {
      // During initial setup, the DB may not have the newest columns yet.
      console.log('Settings query error (schema may not be ready):', queryError.message);
      return res.json(buildDefaultSettings());
    }

    if (!result || result.rows.length === 0) {
      return res.json(buildDefaultSettings());
    }

    // Merge with defaults so missing/null values don't break the UI
    res.json({ ...buildDefaultSettings(), ...result.rows[0] });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

router.patch('/settings/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const {
      daily_message_limit_per_customer,
      billing_paused,
      billing_paused_until,
      billing_paused_reason,
      critical_alert_threshold,
      critical_alert_days,
      alert_email,
      alert_whatsapp,
      alert_connection_id
    } = req.body;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin'].includes(access.role)) {
      return res.status(403).json({ error: 'Apenas admins podem alterar configurações' });
    }

    // If integration doesn't exist yet, the UI shouldn't try to persist settings.
    const integrationExists = await query(
      `SELECT 1 FROM asaas_integrations WHERE organization_id = $1`,
      [organizationId]
    );
    if (integrationExists.rows.length === 0) {
      return res.status(400).json({ error: 'Integração Asaas ainda não configurada' });
    }

    let result;
    try {
      result = await query(
        `UPDATE asaas_integrations SET
           daily_message_limit_per_customer = COALESCE($1, daily_message_limit_per_customer),
           billing_paused = COALESCE($2, billing_paused),
           billing_paused_until = $3,
           billing_paused_reason = $4,
           critical_alert_threshold = COALESCE($5, critical_alert_threshold),
           critical_alert_days = COALESCE($6, critical_alert_days),
           alert_email = COALESCE($7, alert_email),
           alert_whatsapp = COALESCE($8, alert_whatsapp),
           alert_connection_id = $9,
           updated_at = NOW()
         WHERE organization_id = $10
         RETURNING *`,
        [
          daily_message_limit_per_customer,
          billing_paused,
          billing_paused_until,
          billing_paused_reason,
          critical_alert_threshold,
          critical_alert_days,
          alert_email,
          alert_whatsapp,
          alert_connection_id,
          organizationId
        ]
      );
    } catch (queryError) {
      console.log('Update settings query error (schema may not be ready):', queryError.message);
      return res.status(503).json({
        error: 'Banco de dados ainda não está pronto para salvar configurações. Reinicie/reimplante o backend para aplicar o schema.'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

// Get alerts
router.get('/alerts/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { unread_only, limit } = req.query;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Check if billing_alerts table exists (graceful fallback)
    try {
      let whereClause = 'WHERE a.organization_id = $1';
      if (unread_only === 'true') {
        whereClause += ' AND a.is_read = false';
      }

      const result = await query(
        `SELECT a.*, c.name as customer_name, c.phone as customer_phone
         FROM billing_alerts a
         LEFT JOIN asaas_customers c ON c.id = a.customer_id
         ${whereClause}
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [organizationId, parseInt(limit) || 50]
      );

      res.json(result.rows);
    } catch (queryError) {
      // Table might not exist yet - return empty array
      console.log('Alerts query error (table may not exist):', queryError.message);
      res.json([]);
    }
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
});

// Mark alert as read/resolved
router.patch('/alerts/:organizationId/:alertId', async (req, res) => {
  try {
    const { organizationId, alertId } = req.params;
    const { is_read, is_resolved } = req.body;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `UPDATE billing_alerts SET
         is_read = COALESCE($1, is_read),
         is_resolved = COALESCE($2, is_resolved),
         resolved_at = CASE WHEN $2 = true THEN NOW() ELSE resolved_at END,
         resolved_by = CASE WHEN $2 = true THEN $3 ELSE resolved_by END
       WHERE id = $4 AND organization_id = $5
       RETURNING *`,
      [is_read, is_resolved, req.userId, alertId, organizationId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ error: 'Erro ao atualizar alerta' });
  }
});

// Generate critical alerts (called by scheduler or manually)
router.post('/alerts/generate/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Get settings
    const settingsResult = await query(
      `SELECT critical_alert_threshold, critical_alert_days FROM asaas_integrations WHERE organization_id = $1`,
      [organizationId]
    );
    
    if (settingsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Integração não configurada' });
    }

    const settings = settingsResult.rows[0];
    const threshold = settings.critical_alert_threshold || 1000;
    const criticalDays = settings.critical_alert_days || 30;

    // Find customers exceeding threshold
    const criticalCustomers = await query(`
      SELECT 
        c.id as customer_id,
        c.name,
        c.phone,
        SUM(p.value) as total_overdue,
        MAX(CURRENT_DATE - p.due_date) as max_days_overdue
      FROM asaas_customers c
      JOIN asaas_payments p ON p.customer_id = c.id
      WHERE c.organization_id = $1 
        AND p.status = 'OVERDUE'
        AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
      GROUP BY c.id, c.name, c.phone
      HAVING SUM(p.value) >= $2 OR MAX(CURRENT_DATE - p.due_date) >= $3
    `, [organizationId, threshold, criticalDays]);

    let created = 0;
    for (const customer of criticalCustomers.rows) {
      // Check if alert already exists for this customer (not resolved)
      const existingAlert = await query(
        `SELECT id FROM billing_alerts 
         WHERE organization_id = $1 AND customer_id = $2 AND is_resolved = false`,
        [organizationId, customer.customer_id]
      );

      if (existingAlert.rows.length === 0) {
        await query(`
          INSERT INTO billing_alerts (organization_id, customer_id, alert_type, title, description, total_overdue, days_overdue)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          organizationId,
          customer.customer_id,
          'critical_customer',
          `Inadimplência crítica: ${customer.name}`,
          `Cliente com R$ ${Number(customer.total_overdue).toLocaleString('pt-BR')} em atraso há ${customer.max_days_overdue} dias`,
          customer.total_overdue,
          customer.max_days_overdue
        ]);
        created++;
      }
    }

    res.json({ alerts_created: created });
  } catch (error) {
    console.error('Generate alerts error:', error);
    res.status(500).json({ error: 'Erro ao gerar alertas' });
  }
});

// Dashboard metrics
router.get('/dashboard/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Return empty dashboard if tables don't exist yet
    const emptyDashboard = {
      general: { pending_count: 0, overdue_count: 0, paid_count: 0, pending_value: 0, overdue_value: 0, paid_value: 0 },
      paymentsByMonth: [],
      notifications: { total: 0, sent: 0, failed: 0, sent_today: 0, sent_week: 0 },
      recovery: { notified_payments: 0, recovered_payments: 0 },
      topDefaulters: [],
      overdueByDays: []
    };

    try {
      // General stats
      const generalStats = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
          COUNT(*) FILTER (WHERE status = 'OVERDUE') as overdue_count,
          COUNT(*) FILTER (WHERE status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')) as paid_count,
          COALESCE(SUM(value) FILTER (WHERE status = 'PENDING'), 0) as pending_value,
          COALESCE(SUM(value) FILTER (WHERE status = 'OVERDUE'), 0) as overdue_value,
          COALESCE(SUM(value) FILTER (WHERE status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')), 0) as paid_value
        FROM asaas_payments
        WHERE organization_id = $1
      `, [organizationId]);

      // Payments by month (last 6 months)
      const paymentsByMonth = await query(`
        SELECT 
          TO_CHAR(due_date, 'YYYY-MM') as month,
          COUNT(*) FILTER (WHERE status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')) as paid_count,
          COUNT(*) FILTER (WHERE status = 'OVERDUE') as overdue_count,
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
          COALESCE(SUM(value) FILTER (WHERE status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')), 0) as paid_value,
          COALESCE(SUM(value) FILTER (WHERE status = 'OVERDUE'), 0) as overdue_value
        FROM asaas_payments
        WHERE organization_id = $1 
          AND due_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY TO_CHAR(due_date, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 6
      `, [organizationId]);

      // Notification stats
      const notificationStats = await query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE sent_at >= CURRENT_DATE) as sent_today,
          COUNT(*) FILTER (WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days') as sent_week
        FROM billing_notifications
        WHERE organization_id = $1
      `, [organizationId]);

      // Recovery rate (payments that were overdue and got paid after notification)
      const recoveryStats = await query(`
        SELECT 
          COUNT(DISTINCT bn.payment_id) as notified_payments,
          COUNT(DISTINCT bn.payment_id) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM asaas_payments p 
              WHERE p.id = bn.payment_id 
              AND p.status IN ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
            )
          ) as recovered_payments
        FROM billing_notifications bn
        WHERE bn.organization_id = $1 AND bn.status = 'sent'
      `, [organizationId]);

      // Top defaulters
      const topDefaulters = await query(`
        SELECT 
          c.name,
          c.phone,
          c.email,
          COUNT(p.id) as overdue_count,
          COALESCE(SUM(p.value), 0) as total_overdue
        FROM asaas_customers c
        JOIN asaas_payments p ON p.customer_id = c.id
        WHERE c.organization_id = $1 AND p.status = 'OVERDUE'
        GROUP BY c.id, c.name, c.phone, c.email
        ORDER BY total_overdue DESC
        LIMIT 10
      `, [organizationId]);

      // Overdue by days range
      const overdueByDays = await query(`
        SELECT 
          CASE 
            WHEN CURRENT_DATE - due_date <= 7 THEN '1-7 dias'
            WHEN CURRENT_DATE - due_date <= 15 THEN '8-15 dias'
            WHEN CURRENT_DATE - due_date <= 30 THEN '16-30 dias'
            WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 dias'
            ELSE '60+ dias'
          END as range,
          COUNT(*) as count,
          COALESCE(SUM(value), 0) as value
        FROM asaas_payments
        WHERE organization_id = $1 AND status = 'OVERDUE'
        GROUP BY 
          CASE 
            WHEN CURRENT_DATE - due_date <= 7 THEN '1-7 dias'
            WHEN CURRENT_DATE - due_date <= 15 THEN '8-15 dias'
            WHEN CURRENT_DATE - due_date <= 30 THEN '16-30 dias'
            WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 dias'
            ELSE '60+ dias'
          END
        ORDER BY 
          CASE range
            WHEN '1-7 dias' THEN 1
            WHEN '8-15 dias' THEN 2
            WHEN '16-30 dias' THEN 3
            WHEN '31-60 dias' THEN 4
            ELSE 5
          END
      `, [organizationId]);

      res.json({
        general: generalStats.rows[0],
        paymentsByMonth: paymentsByMonth.rows.reverse(),
        notifications: notificationStats.rows[0],
        recovery: recoveryStats.rows[0],
        topDefaulters: topDefaulters.rows,
        overdueByDays: overdueByDays.rows
      });
    } catch (queryError) {
      // Tables might not exist yet - return empty dashboard
      console.log('Dashboard query error (tables may not exist):', queryError.message);
      res.json(emptyDashboard);
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Erro ao buscar métricas' });
  }
});

// Export report (returns JSON, frontend converts to Excel)
router.get('/report/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { status, min_days_overdue, max_days_overdue } = req.query;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let queryText = `
      SELECT 
        c.name as cliente,
        c.phone as telefone,
        c.email,
        c.cpf_cnpj as documento,
        p.value as valor,
        p.due_date as vencimento,
        p.status,
        p.billing_type as tipo_cobranca,
        p.description as descricao,
        CURRENT_DATE - p.due_date as dias_atraso,
        p.invoice_url as link_fatura,
        (SELECT COUNT(*) FROM billing_notifications bn WHERE bn.payment_id = p.id AND bn.status = 'sent') as notificacoes_enviadas
      FROM asaas_payments p
      JOIN asaas_customers c ON c.id = p.customer_id
      WHERE p.organization_id = $1
    `;
    const params = [organizationId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    if (min_days_overdue) {
      queryText += ` AND p.status = 'OVERDUE' AND CURRENT_DATE - p.due_date >= $${paramIndex++}`;
      params.push(parseInt(min_days_overdue));
    }

    if (max_days_overdue) {
      queryText += ` AND CURRENT_DATE - p.due_date <= $${paramIndex++}`;
      params.push(parseInt(max_days_overdue));
    }

    queryText += ` ORDER BY dias_atraso DESC, valor DESC`;

    const result = await query(queryText, params);
    
    // Format data for Excel
    const formattedData = result.rows.map(row => ({
      ...row,
      valor: Number(row.valor),
      dias_atraso: Number(row.dias_atraso) || 0,
      vencimento: new Date(row.vencimento).toLocaleDateString('pt-BR'),
      status: row.status === 'OVERDUE' ? 'Vencido' : 
              row.status === 'PENDING' ? 'Pendente' : 
              row.status === 'RECEIVED' ? 'Pago' : row.status
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// CRUD for notification rules
router.get('/rules/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `SELECT r.*, c.name as connection_name
       FROM billing_notification_rules r
       LEFT JOIN connections c ON c.id = r.connection_id
       WHERE r.organization_id = $1
       ORDER BY r.days_offset`,
      [organizationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({ error: 'Erro ao buscar regras' });
  }
});

router.post('/rules/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { 
      name, trigger_type, days_offset, max_days_overdue, message_template, 
      send_time, connection_id, min_delay, max_delay, pause_after_messages, pause_duration 
    } = req.body;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Sem permissão para criar regras' });
    }

    const result = await query(
      `INSERT INTO billing_notification_rules 
       (organization_id, connection_id, name, trigger_type, days_offset, max_days_overdue, 
        message_template, send_time, min_delay, max_delay, pause_after_messages, pause_duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [organizationId, connection_id, name, trigger_type, days_offset, max_days_overdue, 
       message_template, send_time || '09:00', min_delay || 120, max_delay || 300, 
       pause_after_messages || 20, pause_duration || 600]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({ error: 'Erro ao criar regra' });
  }
});

router.patch('/rules/:organizationId/:ruleId', async (req, res) => {
  try {
    const { organizationId, ruleId } = req.params;
    const { 
      name, trigger_type, days_offset, max_days_overdue, message_template, 
      send_time, connection_id, is_active, min_delay, max_delay, 
      pause_after_messages, pause_duration 
    } = req.body;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Sem permissão para editar regras' });
    }

    const result = await query(
      `UPDATE billing_notification_rules SET
         name = COALESCE($1, name),
         trigger_type = COALESCE($2, trigger_type),
         days_offset = COALESCE($3, days_offset),
         max_days_overdue = COALESCE($4, max_days_overdue),
         message_template = COALESCE($5, message_template),
         send_time = COALESCE($6, send_time),
         connection_id = COALESCE($7, connection_id),
         is_active = COALESCE($8, is_active),
         min_delay = COALESCE($9, min_delay),
         max_delay = COALESCE($10, max_delay),
         pause_after_messages = COALESCE($11, pause_after_messages),
         pause_duration = COALESCE($12, pause_duration),
         updated_at = NOW()
       WHERE id = $13 AND organization_id = $14
       RETURNING *`,
      [name, trigger_type, days_offset, max_days_overdue, message_template, 
       send_time, connection_id, is_active, min_delay, max_delay, 
       pause_after_messages, pause_duration, ruleId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regra não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({ error: 'Erro ao atualizar regra' });
  }
});

router.delete('/rules/:organizationId/:ruleId', async (req, res) => {
  try {
    const { organizationId, ruleId } = req.params;

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access || !['owner', 'admin', 'manager'].includes(access.role)) {
      return res.status(403).json({ error: 'Sem permissão para excluir regras' });
    }

    const result = await query(
      `DELETE FROM billing_notification_rules WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [ruleId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regra não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ error: 'Erro ao excluir regra' });
  }
});

export default router;
