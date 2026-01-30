// Asaas Auto-Sync - Automated synchronization jobs
// 
// Runs at:
// - 02:00 AM: Sync boletos that are due TODAY from Asaas API → local DB
// - 08:00 AM: Check payment status for all PENDING/OVERDUE in local DB → update if paid
//
import { query } from './db.js';

/**
 * Fetch JSON from Asaas API with proper error handling
 */
async function fetchAsaasJson(baseUrl, apiKey, endpoint) {
  const url = `${baseUrl}${endpoint}`;
  console.log(`  [Asaas API] GET ${endpoint}`);
  
  const resp = await fetch(url, { 
    headers: { 'access_token': apiKey },
    timeout: 30000,
  });
  
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
}

/**
 * Sync a batch of payments from Asaas to local DB
 */
async function syncPaymentBatch(organizationId, baseUrl, apiKey, endpoint, maxItems = 500) {
  let count = 0;
  let offset = 0;
  const syncedCustomerIds = new Set();
  
  while (count < maxItems) {
    const data = await fetchAsaasJson(baseUrl, apiKey, `${endpoint}&limit=100&offset=${offset}`);
    
    if (!data.data || data.data.length === 0) break;
    
    for (const payment of data.data) {
      if (count >= maxItems) break;
      
      // Upsert customer inline
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
        syncedCustomerIds.add(payment.customer);
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
           pix_qr_code, pix_copy_paste, description, external_reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (organization_id, asaas_id) DO UPDATE SET
           status = EXCLUDED.status,
           net_value = EXCLUDED.net_value,
           due_date = EXCLUDED.due_date,
           invoice_url = COALESCE(EXCLUDED.invoice_url, asaas_payments.invoice_url),
           bank_slip_url = COALESCE(EXCLUDED.bank_slip_url, asaas_payments.bank_slip_url),
           pix_copy_paste = COALESCE(EXCLUDED.pix_copy_paste, asaas_payments.pix_copy_paste),
           updated_at = NOW()`,
        [
          organizationId, payment.id, customerId, payment.customer,
          payment.value, payment.netValue, payment.dueDate, payment.billingType,
          payment.status, payment.invoiceUrl, payment.invoiceUrl, payment.bankSlipUrl,
          payment.pixQrCode, payment.pixCopiaECola, payment.description, payment.externalReference
        ]
      );
      count++;
    }
    
    offset += 100;
    if (data.data.length < 100) break;
    
    // Small delay between pages to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  return { count, syncedCustomerIds };
}

/**
 * CRON JOB: 02:00 AM - Sync today's due boletos
 * 
 * This runs automatically at 2AM to fetch all boletos that are due TODAY
 * so they are ready in the database for notification rules.
 */
export async function syncTodaysDueBoletos() {
  console.log('🌙 [ASAAS-SYNC-2AM] Starting automatic sync of today\'s due boletos...');
  
  const stats = {
    organizations: 0,
    total_synced: 0,
    errors: [],
  };
  
  try {
    // Get all active Asaas integrations with auto_sync enabled
    const integrationsResult = await query(`
      SELECT ai.*, o.name as org_name 
      FROM asaas_integrations ai
      JOIN organizations o ON o.id = ai.organization_id
      WHERE ai.is_active = true
        AND (ai.auto_sync_enabled = true OR ai.auto_sync_enabled IS NULL)
    `);
    
    if (integrationsResult.rows.length === 0) {
      console.log('🌙 [ASAAS-SYNC-2AM] No active integrations with auto-sync enabled');
      return stats;
    }
    
    // Get tomorrow's date (since we're running at 2AM, "today" means the coming day)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Also get next few days for "antes do vencimento" rules
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().split('T')[0];
    
    console.log(`🌙 [ASAAS-SYNC-2AM] Syncing for dates: ${todayStr}, ${tomorrowStr}, ${dayAfterStr}`);
    
    for (const integration of integrationsResult.rows) {
      stats.organizations++;
      console.log(`  📦 Processing org: ${integration.org_name}`);
      
      try {
        const baseUrl = integration.environment === 'production'
          ? 'https://api.asaas.com/v3'
          : 'https://sandbox.asaas.com/api/v3';
        
        // Sync boletos due TODAY
        const todayResult = await syncPaymentBatch(
          integration.organization_id,
          baseUrl,
          integration.api_key,
          `/payments?status=PENDING&dueDate[ge]=${todayStr}&dueDate[le]=${todayStr}`,
          500
        );
        console.log(`    ✓ Today (${todayStr}): ${todayResult.count} boletos synced`);
        stats.total_synced += todayResult.count;
        
        // Sync boletos due TOMORROW (for "1 dia antes" rules)
        const tomorrowResult = await syncPaymentBatch(
          integration.organization_id,
          baseUrl,
          integration.api_key,
          `/payments?status=PENDING&dueDate[ge]=${tomorrowStr}&dueDate[le]=${tomorrowStr}`,
          300
        );
        console.log(`    ✓ Tomorrow (${tomorrowStr}): ${tomorrowResult.count} boletos synced`);
        stats.total_synced += tomorrowResult.count;
        
        // Sync boletos due in 2 days (for "2 dias antes" rules)
        const dayAfterResult = await syncPaymentBatch(
          integration.organization_id,
          baseUrl,
          integration.api_key,
          `/payments?status=PENDING&dueDate[ge]=${dayAfterStr}&dueDate[le]=${dayAfterStr}`,
          200
        );
        console.log(`    ✓ Day after (${dayAfterStr}): ${dayAfterResult.count} boletos synced`);
        stats.total_synced += dayAfterResult.count;
        
        // Also sync OVERDUE (for "após vencimento" rules) - only last 5 days
        const fiveDaysAgo = new Date(today);
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];
        
        const overdueResult = await syncPaymentBatch(
          integration.organization_id,
          baseUrl,
          integration.api_key,
          `/payments?status=OVERDUE&dueDate[ge]=${fiveDaysAgoStr}`,
          500
        );
        console.log(`    ✓ Overdue (last 5 days): ${overdueResult.count} boletos synced`);
        stats.total_synced += overdueResult.count;
        
        // Clean up old overdue payments (older than 5 days)
        const cleanupResult = await query(
          `DELETE FROM asaas_payments 
           WHERE organization_id = $1 
             AND status = 'OVERDUE' 
             AND due_date < CURRENT_DATE - INTERVAL '5 days'`,
          [integration.organization_id]
        );
        if (cleanupResult.rowCount > 0) {
          console.log(`    🧹 Cleaned up ${cleanupResult.rowCount} old overdue payments`);
        }
        
        // Update last sync timestamp
        await query(
          `UPDATE asaas_integrations SET last_sync_at = NOW() WHERE organization_id = $1`,
          [integration.organization_id]
        );
        
      } catch (orgError) {
        console.error(`    ✗ Error syncing org ${integration.org_name}:`, orgError.message);
        stats.errors.push({ org: integration.org_name, error: orgError.message });
      }
      
      // Delay between organizations to avoid Asaas rate limits
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`🌙 [ASAAS-SYNC-2AM] Complete:`, stats);
    return stats;
    
  } catch (error) {
    console.error('🌙 [ASAAS-SYNC-2AM] Fatal error:', error);
    throw error;
  }
}

/**
 * CRON JOB: 08:00 AM - Check payment status updates
 * 
 * This runs at 8AM to check if any PENDING/OVERDUE payments in our local DB
 * have been paid (via Asaas API) and updates their status.
 * This catches payments that were paid but webhook didn't fire.
 */
export async function checkPaymentStatusUpdates() {
  console.log('☀️ [ASAAS-CHECK-8AM] Starting payment status verification...');
  
  const stats = {
    organizations: 0,
    checked: 0,
    updated: 0,
    newly_paid: 0,
    errors: [],
  };
  
  try {
    // Get all active Asaas integrations
    const integrationsResult = await query(`
      SELECT ai.*, o.name as org_name 
      FROM asaas_integrations ai
      JOIN organizations o ON o.id = ai.organization_id
      WHERE ai.is_active = true
        AND (ai.auto_sync_enabled = true OR ai.auto_sync_enabled IS NULL)
    `);
    
    if (integrationsResult.rows.length === 0) {
      console.log('☀️ [ASAAS-CHECK-8AM] No active integrations');
      return stats;
    }
    
    for (const integration of integrationsResult.rows) {
      stats.organizations++;
      console.log(`  📦 Processing org: ${integration.org_name}`);
      
      try {
        const baseUrl = integration.environment === 'production'
          ? 'https://api.asaas.com/v3'
          : 'https://sandbox.asaas.com/api/v3';
        
        // Get all PENDING and OVERDUE payments in our local DB for this org
        // Focus on PENDING from last 30 days, OVERDUE only from last 5 days
        const localPayments = await query(`
          SELECT id, asaas_id, status, customer_id
          FROM asaas_payments
          WHERE organization_id = $1
            AND (
              (status = 'PENDING' AND due_date >= CURRENT_DATE - INTERVAL '30 days')
              OR (status = 'OVERDUE' AND due_date >= CURRENT_DATE - INTERVAL '5 days')
            )
          ORDER BY due_date DESC
          LIMIT 500
        `, [integration.organization_id]);
        
        console.log(`    Checking ${localPayments.rows.length} local payments...`);
        
        for (const localPayment of localPayments.rows) {
          stats.checked++;
          
          try {
            // Fetch current status from Asaas
            const asaasPayment = await fetchAsaasJson(
              baseUrl,
              integration.api_key,
              `/payments/${localPayment.asaas_id}`
            );
            
            // Check if status changed
            if (asaasPayment.status !== localPayment.status) {
              stats.updated++;
              
              const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(asaasPayment.status);
              if (isPaid) {
                stats.newly_paid++;
                console.log(`      💰 Payment ${localPayment.asaas_id} is now PAID`);
                
                // Cancel any pending notifications for this payment
                await query(
                  `UPDATE billing_notifications 
                   SET status = 'cancelled', error_message = 'Pagamento confirmado via sync'
                   WHERE payment_id = $1 AND status = 'pending'`,
                  [localPayment.id]
                );
              }
              
              // Update local status
              await query(
                `UPDATE asaas_payments 
                 SET status = $1, 
                     confirmed_date = $2,
                     payment_date = $3,
                     updated_at = NOW()
                 WHERE id = $4`,
                [
                  asaasPayment.status,
                  asaasPayment.confirmedDate,
                  asaasPayment.paymentDate,
                  localPayment.id
                ]
              );
            }
            
          } catch (paymentError) {
            // Log but don't fail the whole batch
            if (!paymentError.message?.includes('404')) {
              console.error(`      ✗ Error checking payment ${localPayment.asaas_id}:`, paymentError.message);
            }
          }
          
          // Small delay between API calls
          await new Promise(r => setTimeout(r, 100));
        }
        
      } catch (orgError) {
        console.error(`    ✗ Error processing org ${integration.org_name}:`, orgError.message);
        stats.errors.push({ org: integration.org_name, error: orgError.message });
      }
      
      // Delay between organizations
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`☀️ [ASAAS-CHECK-8AM] Complete:`, stats);
    return stats;
    
  } catch (error) {
    console.error('☀️ [ASAAS-CHECK-8AM] Fatal error:', error);
    throw error;
  }
}

/**
 * Manual trigger for testing - syncs a specific organization
 */
export async function manualSyncOrganization(organizationId) {
  console.log(`🔄 [ASAAS-MANUAL] Manual sync triggered for org ${organizationId}`);
  
  const integrationResult = await query(
    `SELECT ai.*, o.name as org_name 
     FROM asaas_integrations ai
     JOIN organizations o ON o.id = ai.organization_id
     WHERE ai.organization_id = $1 AND ai.is_active = true`,
    [organizationId]
  );
  
  if (integrationResult.rows.length === 0) {
    throw new Error('Integração não encontrada ou inativa');
  }
  
  const integration = integrationResult.rows[0];
  const baseUrl = integration.environment === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';
  
  const today = new Date().toISOString().split('T')[0];
  
  // Sync today's pending
  const todayResult = await syncPaymentBatch(
    organizationId,
    baseUrl,
    integration.api_key,
    `/payments?status=PENDING&dueDate[ge]=${today}&dueDate[le]=${today}`,
    500
  );
  
  // Sync overdue (only last 5 days)
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];
  
  const overdueResult = await syncPaymentBatch(
    organizationId,
    baseUrl,
    integration.api_key,
    `/payments?status=OVERDUE&dueDate[ge]=${fiveDaysAgoStr}`,
    500
  );
  
  // Clean up old overdue payments
  await query(
    `DELETE FROM asaas_payments 
     WHERE organization_id = $1 
       AND status = 'OVERDUE' 
       AND due_date < CURRENT_DATE - INTERVAL '5 days'`,
    [organizationId]
  );
  
  await query(
    `UPDATE asaas_integrations SET last_sync_at = NOW() WHERE organization_id = $1`,
    [organizationId]
  );
  
  return {
    today_synced: todayResult.count,
    overdue_synced: overdueResult.count,
    total: todayResult.count + overdueResult.count,
  };
}
