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
router.post('/sync/:organizationId', async (req, res) => {
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

    // Sync customers
    let customerOffset = 0;
    let hasMoreCustomers = true;
    let customersCount = 0;

    while (hasMoreCustomers) {
      const customersResponse = await fetch(
        `${baseUrl}/customers?limit=100&offset=${customerOffset}`,
        { headers: { 'access_token': integration.api_key } }
      );
      const customersData = await customersResponse.json();

      if (!customersData.data || customersData.data.length === 0) {
        hasMoreCustomers = false;
        break;
      }

      for (const customer of customersData.data) {
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
      }

      customerOffset += 100;
      if (customersData.data.length < 100) hasMoreCustomers = false;
    }

    // Sync payments (pending and overdue)
    const statuses = ['PENDING', 'OVERDUE'];
    let paymentsCount = 0;

    for (const status of statuses) {
      let paymentOffset = 0;
      let hasMorePayments = true;

      while (hasMorePayments) {
        const paymentsResponse = await fetch(
          `${baseUrl}/payments?status=${status}&limit=100&offset=${paymentOffset}`,
          { headers: { 'access_token': integration.api_key } }
        );
        const paymentsData = await paymentsResponse.json();

        if (!paymentsData.data || paymentsData.data.length === 0) {
          hasMorePayments = false;
          break;
        }

        for (const payment of paymentsData.data) {
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
              null, // PIX data requires separate API call
              null,
              payment.description,
              payment.externalReference
            ]
          );
          paymentsCount++;
        }

        paymentOffset += 100;
        if (paymentsData.data.length < 100) hasMorePayments = false;
      }
    }

    // Update last sync
    await query(
      `UPDATE asaas_integrations SET last_sync_at = NOW() WHERE organization_id = $1`,
      [organizationId]
    );

    res.json({ 
      success: true, 
      customers_synced: customersCount,
      payments_synced: paymentsCount
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar com Asaas' });
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

    const access = await checkOrgAccess(req.userId, organizationId);
    if (!access) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM asaas_payments p WHERE p.customer_id = c.id AND p.status = 'PENDING') as pending_count,
        (SELECT COUNT(*) FROM asaas_payments p WHERE p.customer_id = c.id AND p.status = 'OVERDUE') as overdue_count,
        (SELECT SUM(value) FROM asaas_payments p WHERE p.customer_id = c.id AND p.status IN ('PENDING', 'OVERDUE')) as total_due
       FROM asaas_customers c
       WHERE c.organization_id = $1
       ORDER BY c.name`,
      [organizationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
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
