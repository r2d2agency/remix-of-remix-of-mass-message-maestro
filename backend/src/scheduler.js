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

// Main function to execute all notifications
export async function executeNotifications() {
  console.log('🔔 [CRON] Starting billing notifications execution...');
  
  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
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
        
        // Check if within 30 minutes of scheduled time
        const ruleMinutes = ruleHour * 60 + ruleMinute;
        const currentMinutes = currentHour * 60 + currentMinute;
        const diff = Math.abs(currentMinutes - ruleMinutes);
        
        if (diff > 30) {
          console.log(`    ⏰ Rule "${rule.name}" scheduled for ${rule.send_time}, skipping (current: ${currentHour}:${currentMinute})`);
          continue;
        }

        // Skip if no connection configured
        if (!rule.api_url) {
          console.log(`    ⚠ Rule "${rule.name}" has no connection, skipping`);
          continue;
        }

        // Build query based on trigger type
        const today = new Date().toISOString().split('T')[0];
        let paymentsQuery;
        let paymentsParams;

        if (rule.trigger_type === 'before_due') {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() - rule.days_offset);
          const targetDateStr = targetDate.toISOString().split('T')[0];

          paymentsQuery = `
            SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status = 'PENDING'
              AND p.due_date = $2
              AND c.phone IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
              )`;
          paymentsParams = [integration.organization_id, targetDateStr, rule.id];
        } 
        else if (rule.trigger_type === 'on_due') {
          paymentsQuery = `
            SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status IN ('PENDING', 'OVERDUE')
              AND p.due_date = $2
              AND c.phone IS NOT NULL
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
            SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status = 'OVERDUE'
              AND p.due_date <= CURRENT_DATE - INTERVAL '${Math.abs(rule.days_offset)} days'
              ${maxDaysClause}
              AND c.phone IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $2 AND bn.status = 'sent'
              )`;
          paymentsParams = [integration.organization_id, rule.id];
        }

        if (!paymentsQuery) continue;

        const paymentsResult = await query(paymentsQuery, paymentsParams);
        console.log(`    Rule "${rule.name}": ${paymentsResult.rows.length} payments to notify`);

        // Get delay settings
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
