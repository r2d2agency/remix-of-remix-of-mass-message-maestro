import { query } from './db.js';

// Helper to send message via Evolution API
async function sendEvolutionMessage(connection, phone, message) {
  try {
    const response = await fetch(
      `${connection.api_url}/message/sendText/${connection.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: connection.api_key,
        },
        body: JSON.stringify({
          number: phone,
          text: message,
        }),
      }
    );
    
    return response.ok;
  } catch (error) {
    console.error('Evolution API error:', error);
    return false;
  }
}

// Replace message variables
function replaceVariables(template, payment, customer) {
  const dueDate = new Date(payment.due_date);
  const formattedDate = dueDate.toLocaleDateString('pt-BR');
  const formattedValue = Number(payment.value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  return template
    .replace(/\{\{nome\}\}/gi, customer.name || 'Cliente')
    .replace(/\{\{valor\}\}/gi, formattedValue)
    .replace(/\{\{vencimento\}\}/gi, formattedDate)
    .replace(/\{\{link\}\}/gi, payment.invoice_url || payment.payment_link || '')
    .replace(/\{\{boleto\}\}/gi, payment.bank_slip_url || '')
    .replace(/\{\{pix\}\}/gi, payment.pix_copy_paste || '')
    .replace(/\{\{descricao\}\}/gi, payment.description || '');
}

// Check daily message limit for customer
async function checkDailyLimit(organizationId, customerId, limit) {
  const today = new Date().toISOString().split('T')[0];
  
  const result = await query(
    `SELECT message_count FROM billing_daily_message_count 
     WHERE organization_id = $1 AND customer_id = $2 AND date = $3`,
    [organizationId, customerId, today]
  );

  if (result.rows.length === 0) {
    return { allowed: true, count: 0 };
  }

  const count = result.rows[0].message_count;
  return { allowed: count < limit, count };
}

// Increment daily message count
async function incrementDailyCount(organizationId, customerId) {
  const today = new Date().toISOString().split('T')[0];
  
  await query(
    `INSERT INTO billing_daily_message_count (organization_id, customer_id, date, message_count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (organization_id, customer_id, date) DO UPDATE SET
       message_count = billing_daily_message_count.message_count + 1,
       updated_at = NOW()`,
    [organizationId, customerId, today]
  );
}

// Generate critical alerts
async function generateCriticalAlerts(organizationId, threshold, criticalDays) {
  try {
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

    for (const customer of criticalCustomers.rows) {
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
      }
    }
  } catch (error) {
    console.error('Error generating critical alerts:', error);
  }
}

// Main function to execute all notifications
export async function executeNotifications() {
  console.log('🔔 [CRON] Starting billing notifications execution...');
  
  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    skipped_blacklist: 0,
    skipped_paused: 0,
    skipped_limit: 0,
    organizations: 0
  };

  try {
    // Get all active integrations
    const integrationsResult = await query(
      `SELECT ai.*, o.name as org_name 
       FROM asaas_integrations ai
       JOIN organizations o ON o.id = ai.organization_id
       WHERE ai.is_active = true`
    );

    for (const integration of integrationsResult.rows) {
      console.log(`  Processing org: ${integration.org_name}`);
      stats.organizations++;

      // Check if billing is globally paused
      if (integration.billing_paused) {
        const pausedUntil = integration.billing_paused_until ? new Date(integration.billing_paused_until) : null;
        if (!pausedUntil || pausedUntil >= new Date()) {
          console.log(`    ⏸ Billing globally paused for org: ${integration.org_name}`);
          continue;
        }
      }

      // Generate critical alerts
      const threshold = integration.critical_alert_threshold || 1000;
      const criticalDays = integration.critical_alert_days || 30;
      await generateCriticalAlerts(integration.organization_id, threshold, criticalDays);

      const dailyLimit = integration.daily_message_limit_per_customer || 3;

      // Get active rules for this organization
      const rulesResult = await query(
        `SELECT r.*, c.api_url, c.api_key, c.instance_name
         FROM billing_notification_rules r
         LEFT JOIN connections c ON c.id = r.connection_id
         WHERE r.organization_id = $1 AND r.is_active = true`,
        [integration.organization_id]
      );

      for (const rule of rulesResult.rows) {
        // Check if current time matches send_time (with 30min tolerance)
        const now = new Date();
        const [ruleHour, ruleMinute] = (rule.send_time || '09:00').split(':').map(Number);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        const ruleMinutes = ruleHour * 60 + ruleMinute;
        const currentMinutes = currentHour * 60 + currentMinute;
        const diff = Math.abs(currentMinutes - ruleMinutes);
        
        if (diff > 30) {
          console.log(`    ⏰ Rule "${rule.name}" scheduled for ${rule.send_time}, skipping (current: ${currentHour}:${currentMinute})`);
          continue;
        }

        if (!rule.api_url) {
          console.log(`    ⚠ Rule "${rule.name}" has no connection, skipping`);
          continue;
        }

        // Build query based on trigger type - exclude blacklisted and paused customers
        const today = new Date().toISOString().split('T')[0];
        let paymentsQuery;
        let paymentsParams;

        const blacklistFilter = `
          AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
          AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
        `;

        if (rule.trigger_type === 'before_due') {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - rule.days_offset);
          const targetDateStr = targetDate.toISOString().split('T')[0];

          paymentsQuery = `
            SELECT p.*, c.id as customer_uuid, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
                   c.is_blacklisted, c.billing_paused, c.billing_paused_until
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status = 'PENDING'
              AND p.due_date = $2
              AND c.phone IS NOT NULL
              ${blacklistFilter}
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
              )`;
          paymentsParams = [integration.organization_id, targetDateStr, rule.id];
        } 
        else if (rule.trigger_type === 'on_due') {
          paymentsQuery = `
            SELECT p.*, c.id as customer_uuid, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
                   c.is_blacklisted, c.billing_paused, c.billing_paused_until
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status IN ('PENDING', 'OVERDUE')
              AND p.due_date = $2
              AND c.phone IS NOT NULL
              ${blacklistFilter}
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
              )`;
          paymentsParams = [integration.organization_id, today, rule.id];
        }
        else if (rule.trigger_type === 'after_due') {
          const maxDaysClause = rule.max_days_overdue 
            ? `AND p.due_date >= CURRENT_DATE - INTERVAL '${rule.max_days_overdue} days'`
            : '';

          paymentsQuery = `
            SELECT p.*, c.id as customer_uuid, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
                   c.is_blacklisted, c.billing_paused, c.billing_paused_until
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status = 'OVERDUE'
              AND p.due_date <= CURRENT_DATE - INTERVAL '${Math.abs(rule.days_offset)} days'
              ${maxDaysClause}
              AND c.phone IS NOT NULL
              ${blacklistFilter}
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $2 AND bn.status = 'sent'
              )`;
          paymentsParams = [integration.organization_id, rule.id];
        }

        if (!paymentsQuery) continue;

        const paymentsResult = await query(paymentsQuery, paymentsParams);
        console.log(`    Rule "${rule.name}": ${paymentsResult.rows.length} payments to notify`);

        const minDelay = rule.min_delay || 120;
        const maxDelay = rule.max_delay || 300;
        const pauseAfterMessages = rule.pause_after_messages || 20;
        const pauseDuration = rule.pause_duration || 600;
        
        let messageCount = 0;

        for (const payment of paymentsResult.rows) {
          stats.processed++;

          if (!payment.customer_phone) {
            stats.skipped++;
            continue;
          }

          // Double-check blacklist (in case of race condition)
          if (payment.is_blacklisted) {
            console.log(`      ⛔ Customer ${payment.customer_name} is blacklisted, skipping`);
            stats.skipped_blacklist++;
            continue;
          }

          // Check if customer billing is paused
          if (payment.billing_paused) {
            const pausedUntil = payment.billing_paused_until ? new Date(payment.billing_paused_until) : null;
            if (!pausedUntil || pausedUntil >= new Date()) {
              console.log(`      ⏸ Customer ${payment.customer_name} billing paused, skipping`);
              stats.skipped_paused++;
              continue;
            }
          }

          // Check daily message limit
          const limitCheck = await checkDailyLimit(integration.organization_id, payment.customer_uuid, dailyLimit);
          if (!limitCheck.allowed) {
            console.log(`      📊 Customer ${payment.customer_name} reached daily limit (${limitCheck.count}/${dailyLimit}), skipping`);
            stats.skipped_limit++;
            continue;
          }

          // Check if payment is still pending/overdue
          const currentPaymentStatus = await query(
            `SELECT status FROM asaas_payments WHERE id = $1`,
            [payment.id]
          );
          
          if (currentPaymentStatus.rows[0]?.status && 
              ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(currentPaymentStatus.rows[0].status)) {
            console.log(`      ⏭ Payment ${payment.id} already paid, skipping`);
            stats.skipped++;
            continue;
          }

          // Generate message
          const message = replaceVariables(rule.message_template, payment, {
            name: payment.customer_name,
            email: payment.customer_email
          });

          // Create notification record
          const notificationResult = await query(
            `INSERT INTO billing_notifications 
             (organization_id, payment_id, rule_id, phone, message, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             RETURNING id`,
            [integration.organization_id, payment.id, rule.id, payment.customer_phone, message]
          );
          const notificationId = notificationResult.rows[0].id;

          // Send via Evolution API
          const connection = {
            api_url: rule.api_url,
            api_key: rule.api_key,
            instance_name: rule.instance_name
          };

          const sent = await sendEvolutionMessage(connection, payment.customer_phone, message);

          if (sent) {
            await query(
              `UPDATE billing_notifications SET status = 'sent', sent_at = NOW() WHERE id = $1`,
              [notificationId]
            );
            // Increment daily message count
            await incrementDailyCount(integration.organization_id, payment.customer_uuid);
            stats.sent++;
            console.log(`      ✓ Sent to ${payment.customer_phone}`);
          } else {
            await query(
              `UPDATE billing_notifications SET status = 'failed', error_message = 'Failed to send via Evolution API' WHERE id = $1`,
              [notificationId]
            );
            stats.failed++;
            console.log(`      ✗ Failed to send to ${payment.customer_phone}`);
          }

          messageCount++;

          // Pause logic
          if (messageCount > 0 && messageCount % pauseAfterMessages === 0) {
            console.log(`      ⏸ Pausing for ${pauseDuration} seconds after ${messageCount} messages...`);
            await new Promise(resolve => setTimeout(resolve, pauseDuration * 1000));
          } else {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
          }
        }
      }
    }

    console.log(`🔔 [CRON] Notifications execution complete:`, stats);
    return stats;
  } catch (error) {
    console.error('🔔 [CRON] Notification execution error:', error);
    throw error;
  }
}
