import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

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

// Execute notifications for all organizations (can be called via cron)
router.post('/execute', async (req, res) => {
  try {
    console.log('🔔 Starting billing notifications execution...');
    
    const stats = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      organizations: 0
    };

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
          // Days before due date (days_offset is negative)
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
          // On due date
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
          // Days after due date (overdue)
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

        // Get delay settings from rule (with defaults)
        const minDelay = rule.min_delay || 120; // seconds
        const maxDelay = rule.max_delay || 300; // seconds
        const pauseAfterMessages = rule.pause_after_messages || 20;
        const pauseDuration = rule.pause_duration || 600; // seconds
        
        let messageCount = 0;

        for (const payment of paymentsResult.rows) {
          stats.processed++;

          if (!payment.customer_phone) {
            stats.skipped++;
            continue;
          }

          // Check if payment is still pending/overdue before sending
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

          // Generate message from template
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

          // Update notification status
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

          // Check if we need to pause
          if (messageCount > 0 && messageCount % pauseAfterMessages === 0) {
            console.log(`      ⏸ Pausing for ${pauseDuration} seconds after ${messageCount} messages...`);
            await new Promise(resolve => setTimeout(resolve, pauseDuration * 1000));
          } else {
            // Random delay between min and max
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            console.log(`      ⏳ Waiting ${delay} seconds before next message...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
          }
        }
      }
    }

    console.log(`🔔 Notifications execution complete:`, stats);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Notification execution error:', error);
    res.status(500).json({ error: 'Erro ao executar notificações' });
  }
});

// Get notification history (protected)
router.get('/history/:organizationId', authenticate, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { status, from_date, to_date, limit = 100 } = req.query;

    let queryText = `
      SELECT bn.*, 
             r.name as rule_name,
             p.value as payment_value,
             p.due_date,
             c.name as customer_name
      FROM billing_notifications bn
      LEFT JOIN billing_notification_rules r ON r.id = bn.rule_id
      LEFT JOIN asaas_payments p ON p.id = bn.payment_id
      LEFT JOIN asaas_customers c ON c.id = p.customer_id
      WHERE bn.organization_id = $1
    `;
    const params = [organizationId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND bn.status = $${paramIndex++}`;
      params.push(status);
    }

    if (from_date) {
      queryText += ` AND bn.created_at >= $${paramIndex++}`;
      params.push(from_date);
    }

    if (to_date) {
      queryText += ` AND bn.created_at <= $${paramIndex++}`;
      params.push(to_date);
    }

    queryText += ` ORDER BY bn.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// Get notification stats (protected)
router.get('/stats/:organizationId', authenticate, async (req, res) => {
  try {
    const { organizationId } = req.params;

    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE sent_at >= CURRENT_DATE) as sent_today,
        COUNT(*) FILTER (WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days') as sent_week,
        COUNT(*) FILTER (WHERE sent_at >= CURRENT_DATE - INTERVAL '30 days') as sent_month
      FROM billing_notifications
      WHERE organization_id = $1
    `, [organizationId]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// Manual trigger for a specific rule (protected)
router.post('/trigger/:organizationId/:ruleId', authenticate, async (req, res) => {
  try {
    const { organizationId, ruleId } = req.params;
    
    console.log(`🔔 Manual trigger requested for rule ${ruleId} in org ${organizationId}`);
    
    // Verify access
    const accessResult = await query(
      `SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
      [req.userId, organizationId]
    );
    
    if (accessResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Get rule with connection
    const ruleResult = await query(
      `SELECT r.*, c.api_url, c.api_key, c.instance_name, c.name as connection_name, c.status as connection_status
       FROM billing_notification_rules r
       LEFT JOIN connections c ON c.id = r.connection_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [ruleId, organizationId]
    );

    if (ruleResult.rows.length === 0) {
      console.log(`  ⚠ Rule ${ruleId} not found`);
      return res.status(404).json({ success: false, error: 'Regra não encontrada' });
    }

    const rule = ruleResult.rows[0];
    
    if (!rule.connection_id) {
      console.log(`  ⚠ Rule "${rule.name}" has no connection_id`);
      return res.status(400).json({ 
        success: false, 
        error: `A regra "${rule.name}" não tem conexão WhatsApp configurada. Acesse a aba "Regras" e configure uma conexão.` 
      });
    }
    
    if (!rule.api_url) {
      console.log(`  ⚠ Rule "${rule.name}" connection has no api_url`);
      return res.status(400).json({ 
        success: false, 
        error: `A conexão "${rule.connection_name || 'sem nome'}" não está configurada corretamente (sem URL da API).` 
      });
    }
    
    if (rule.connection_status !== 'connected') {
      console.log(`  ⚠ Connection "${rule.connection_name}" is not connected (status: ${rule.connection_status})`);
      return res.status(400).json({ 
        success: false, 
        error: `A conexão "${rule.connection_name}" está desconectada. Reconecte antes de disparar.` 
      });
    }

    // Build proper query based on trigger type (same logic as queue)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let paymentsQuery;
    let paymentsParams;

    if (rule.trigger_type === 'before_due') {
      // For "X days before due", we look for payments with due_date = today + X days
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + Math.abs(rule.days_offset));
      const dueDateStr = dueDate.toISOString().split('T')[0];

      paymentsQuery = `
        SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM asaas_payments p
        JOIN asaas_customers c ON c.id = p.customer_id
        WHERE p.organization_id = $1 
          AND p.status = 'PENDING'
          AND p.due_date = $2
          AND c.phone IS NOT NULL
          AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
          AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
          AND NOT EXISTS (
            SELECT 1 FROM billing_notifications bn 
            WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
          )
        ORDER BY c.name
        LIMIT 100`;
      paymentsParams = [organizationId, dueDateStr, ruleId];
      console.log(`  📅 Before due: looking for due_date = ${dueDateStr}`);
    } 
    else if (rule.trigger_type === 'on_due') {
      // On the due date = payments due today
      paymentsQuery = `
        SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM asaas_payments p
        JOIN asaas_customers c ON c.id = p.customer_id
        WHERE p.organization_id = $1 
          AND p.status IN ('PENDING', 'OVERDUE')
          AND p.due_date = $2
          AND c.phone IS NOT NULL
          AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
          AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
          AND NOT EXISTS (
            SELECT 1 FROM billing_notifications bn 
            WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
          )
        ORDER BY c.name
        LIMIT 100`;
      paymentsParams = [organizationId, todayStr, ruleId];
      console.log(`  📅 On due: looking for due_date = ${todayStr}`);
    }
    else if (rule.trigger_type === 'after_due') {
      // For "X days after due", we look for payments due X days ago
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() - Math.abs(rule.days_offset));
      const dueDateStr = dueDate.toISOString().split('T')[0];
      
      const maxDaysClause = rule.max_days_overdue 
        ? `AND p.due_date >= $4`
        : '';
      const maxDaysDate = rule.max_days_overdue
        ? new Date(today.getTime() - (rule.max_days_overdue * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
        : null;

      paymentsQuery = `
        SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM asaas_payments p
        JOIN asaas_customers c ON c.id = p.customer_id
        WHERE p.organization_id = $1 
          AND p.status = 'OVERDUE'
          AND p.due_date = $2
          AND c.phone IS NOT NULL
          AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
          AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
          ${maxDaysClause}
          AND NOT EXISTS (
            SELECT 1 FROM billing_notifications bn 
            WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
          )
        ORDER BY c.name
        LIMIT 100`;
      paymentsParams = maxDaysDate 
        ? [organizationId, dueDateStr, ruleId, maxDaysDate]
        : [organizationId, dueDateStr, ruleId];
      console.log(`  📅 After due: looking for due_date = ${dueDateStr}`);
    }
    else {
      // Fallback: all pending/overdue
      paymentsQuery = `
        SELECT p.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM asaas_payments p
        JOIN asaas_customers c ON c.id = p.customer_id
        WHERE p.organization_id = $1 
          AND p.status IN ('PENDING', 'OVERDUE')
          AND c.phone IS NOT NULL
          AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM billing_notifications bn 
            WHERE bn.payment_id = p.id AND bn.rule_id = $2 AND bn.status = 'sent'
          )
        ORDER BY c.name
        LIMIT 100`;
      paymentsParams = [organizationId, ruleId];
      console.log(`  📅 Fallback query for unknown trigger type: ${rule.trigger_type}`);
    }

    const paymentsResult = await query(paymentsQuery, paymentsParams);
    console.log(`  📊 Found ${paymentsResult.rows.length} payments to notify`);
    
    let sent = 0;
    let failed = 0;

    for (const payment of paymentsResult.rows) {
      const message = replaceVariables(rule.message_template, payment, {
        name: payment.customer_name,
        email: payment.customer_email
      });

      const notificationResult = await query(
        `INSERT INTO billing_notifications 
         (organization_id, payment_id, rule_id, phone, message, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id`,
        [organizationId, payment.id, rule.id, payment.customer_phone, message]
      );

      const connection = {
        api_url: rule.api_url,
        api_key: rule.api_key,
        instance_name: rule.instance_name
      };

      const success = await sendEvolutionMessage(connection, payment.customer_phone, message);

      if (success) {
        await query(
          `UPDATE billing_notifications SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [notificationResult.rows[0].id]
        );
        sent++;
      } else {
        await query(
          `UPDATE billing_notifications SET status = 'failed', error_message = 'Falha no envio' WHERE id = $1`,
          [notificationResult.rows[0].id]
        );
        failed++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`🔔 Manual trigger complete: sent=${sent}, failed=${failed}, total=${paymentsResult.rows.length}`);
    res.json({ success: true, sent, failed, total: paymentsResult.rows.length });
  } catch (error) {
    console.error('Manual trigger error:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao disparar notificações' });
  }
});

// Retry failed notifications (protected)
router.post('/retry/:organizationId', authenticate, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { notification_ids } = req.body;

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return res.status(400).json({ error: 'IDs de notificações obrigatórios' });
    }

    let retried = 0;
    let failed = 0;

    for (const notifId of notification_ids) {
      const notifResult = await query(
        `SELECT bn.*, r.connection_id, c.api_url, c.api_key, c.instance_name
         FROM billing_notifications bn
         LEFT JOIN billing_notification_rules r ON r.id = bn.rule_id
         LEFT JOIN connections c ON c.id = r.connection_id
         WHERE bn.id = $1 AND bn.organization_id = $2`,
        [notifId, organizationId]
      );

      if (notifResult.rows.length === 0) continue;

      const notif = notifResult.rows[0];

      if (!notif.api_url) {
        failed++;
        continue;
      }

      const connection = {
        api_url: notif.api_url,
        api_key: notif.api_key,
        instance_name: notif.instance_name
      };

      const success = await sendEvolutionMessage(connection, notif.phone, notif.message);

      if (success) {
        await query(
          `UPDATE billing_notifications SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE id = $1`,
          [notifId]
        );
        retried++;
      } else {
        failed++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    res.json({ success: true, retried, failed });
  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({ error: 'Erro ao reenviar notificações' });
  }
});

// Get billing queue - shows scheduled notifications by date
router.get('/queue/:organizationId', authenticate, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { days = 7 } = req.query;

    // Get organization's active rules
    const rulesResult = await query(
      `SELECT r.*, c.name as connection_name, c.status as connection_status
       FROM billing_notification_rules r
       LEFT JOIN connections c ON c.id = r.connection_id
       WHERE r.organization_id = $1 AND r.is_active = true
       ORDER BY r.send_time`,
      [organizationId]
    );

    const rules = rulesResult.rows;
    const queue = [];

    // For each day in the range, calculate what will be sent
    for (let dayOffset = 0; dayOffset < parseInt(days); dayOffset++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + dayOffset);
      const dateStr = targetDate.toISOString().split('T')[0];
      const dayName = targetDate.toLocaleDateString('pt-BR', { weekday: 'long' });

      const dayQueue = {
        date: dateStr,
        day_name: dayName,
        items: []
      };

      for (const rule of rules) {
        let paymentsQuery;
        let paymentsParams;

        // Calculate which payments will match this rule on this date
        if (rule.trigger_type === 'before_due') {
          // X days before due date means due_date = target_date + days_offset
          const dueDate = new Date(targetDate);
          dueDate.setDate(dueDate.getDate() + Math.abs(rule.days_offset));
          const dueDateStr = dueDate.toISOString().split('T')[0];

          paymentsQuery = `
            SELECT p.id, p.value, p.due_date, p.status, p.description,
                   c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                   c.is_blacklisted, c.billing_paused, c.billing_paused_until
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status = 'PENDING'
              AND p.due_date = $2
              AND c.phone IS NOT NULL
              AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
              AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
              )
            ORDER BY c.name`;
          paymentsParams = [organizationId, dueDateStr, rule.id];
        } 
        else if (rule.trigger_type === 'on_due') {
          // On the due date
          paymentsQuery = `
            SELECT p.id, p.value, p.due_date, p.status, p.description,
                   c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                   c.is_blacklisted, c.billing_paused, c.billing_paused_until
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status IN ('PENDING', 'OVERDUE')
              AND p.due_date = $2
              AND c.phone IS NOT NULL
              AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
              AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
              )
            ORDER BY c.name`;
          paymentsParams = [organizationId, dateStr, rule.id];
        }
        else if (rule.trigger_type === 'after_due') {
          // X days after due date
          const dueDate = new Date(targetDate);
          dueDate.setDate(dueDate.getDate() - Math.abs(rule.days_offset));
          const dueDateStr = dueDate.toISOString().split('T')[0];
          
          const maxDaysClause = rule.max_days_overdue 
            ? `AND p.due_date >= $4`
            : '';
          const maxDaysDate = rule.max_days_overdue
            ? new Date(targetDate.getTime() - (rule.max_days_overdue * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
            : null;

          paymentsQuery = `
            SELECT p.id, p.value, p.due_date, p.status, p.description,
                   c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
                   c.is_blacklisted, c.billing_paused, c.billing_paused_until
            FROM asaas_payments p
            JOIN asaas_customers c ON c.id = p.customer_id
            WHERE p.organization_id = $1 
              AND p.status = 'OVERDUE'
              AND p.due_date = $2
              AND c.phone IS NOT NULL
              AND (c.is_blacklisted = false OR c.is_blacklisted IS NULL)
              AND (c.billing_paused = false OR c.billing_paused IS NULL OR c.billing_paused_until < CURRENT_DATE)
              ${maxDaysClause}
              AND NOT EXISTS (
                SELECT 1 FROM billing_notifications bn 
                WHERE bn.payment_id = p.id AND bn.rule_id = $3 AND bn.status = 'sent'
              )
            ORDER BY c.name`;
          paymentsParams = maxDaysDate 
            ? [organizationId, dueDateStr, rule.id, maxDaysDate]
            : [organizationId, dueDateStr, rule.id];
        }

        if (paymentsQuery) {
          try {
            const paymentsResult = await query(paymentsQuery, paymentsParams);
            
            if (paymentsResult.rows.length > 0) {
              dayQueue.items.push({
                rule_id: rule.id,
                rule_name: rule.name,
                trigger_type: rule.trigger_type,
                days_offset: rule.days_offset,
                send_time: rule.send_time || '09:00',
                connection_name: rule.connection_name,
                connection_status: rule.connection_status,
                payments_count: paymentsResult.rows.length,
                total_value: paymentsResult.rows.reduce((sum, p) => sum + Number(p.value), 0),
                payments: paymentsResult.rows.map(p => ({
                  id: p.id,
                  customer_name: p.customer_name,
                  customer_phone: p.customer_phone,
                  value: Number(p.value),
                  due_date: p.due_date,
                  status: p.status,
                  description: p.description
                }))
              });
            }
          } catch (queryError) {
            console.error('Queue query error:', queryError);
          }
        }
      }

      if (dayQueue.items.length > 0) {
        queue.push(dayQueue);
      }
    }

    // Get integration status
    const integrationResult = await query(
      `SELECT is_active, billing_paused, billing_paused_until, billing_paused_reason,
              daily_message_limit_per_customer
       FROM asaas_integrations
       WHERE organization_id = $1`,
      [organizationId]
    );

    const integration = integrationResult.rows[0] || {};

    res.json({
      queue,
      integration_status: {
        is_active: integration.is_active || false,
        billing_paused: integration.billing_paused || false,
        billing_paused_until: integration.billing_paused_until,
        billing_paused_reason: integration.billing_paused_reason,
        daily_limit: integration.daily_message_limit_per_customer || 3
      },
      rules_count: rules.length,
      total_scheduled: queue.reduce((sum, day) => 
        sum + day.items.reduce((s, item) => s + item.payments_count, 0), 0)
    });
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Erro ao buscar fila de cobranças' });
  }
});

// Get detailed execution logs
router.get('/logs/:organizationId', authenticate, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { from_date, to_date, status, limit = 200 } = req.query;

    let queryText = `
      SELECT 
        bn.id,
        bn.phone,
        bn.message,
        bn.status,
        bn.error_message,
        bn.sent_at,
        bn.created_at,
        r.name as rule_name,
        r.trigger_type,
        r.send_time,
        p.value as payment_value,
        p.due_date,
        p.status as payment_status,
        c.name as customer_name,
        c.is_blacklisted,
        c.billing_paused
      FROM billing_notifications bn
      LEFT JOIN billing_notification_rules r ON r.id = bn.rule_id
      LEFT JOIN asaas_payments p ON p.id = bn.payment_id
      LEFT JOIN asaas_customers c ON c.id = p.customer_id
      WHERE bn.organization_id = $1
    `;
    const params = [organizationId];
    let paramIndex = 2;

    if (from_date) {
      queryText += ` AND bn.created_at >= $${paramIndex++}`;
      params.push(from_date);
    }

    if (to_date) {
      queryText += ` AND bn.created_at <= $${paramIndex++}::date + INTERVAL '1 day'`;
      params.push(to_date);
    }

    if (status && status !== 'all') {
      queryText += ` AND bn.status = $${paramIndex++}`;
      params.push(status);
    }

    queryText += ` ORDER BY bn.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await query(queryText, params);

    // Group by date for easier visualization
    const grouped = {};
    for (const row of result.rows) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = {
          date,
          total: 0,
          sent: 0,
          failed: 0,
          pending: 0,
          cancelled: 0,
          items: []
        };
      }
      grouped[date].total++;
      grouped[date][row.status]++;
      grouped[date].items.push({
        id: row.id,
        time: new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        customer_name: row.customer_name,
        phone: row.phone,
        value: Number(row.payment_value),
        due_date: row.due_date,
        rule_name: row.rule_name,
        status: row.status,
        error_message: row.error_message,
        sent_at: row.sent_at,
        message_preview: row.message?.substring(0, 100) + (row.message?.length > 100 ? '...' : ''),
        customer_blocked: row.is_blacklisted,
        customer_paused: row.billing_paused
      });
    }

    res.json({
      logs: Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)),
      summary: {
        total: result.rows.length,
        sent: result.rows.filter(r => r.status === 'sent').length,
        failed: result.rows.filter(r => r.status === 'failed').length,
        pending: result.rows.filter(r => r.status === 'pending').length,
        cancelled: result.rows.filter(r => r.status === 'cancelled').length
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

export default router;
