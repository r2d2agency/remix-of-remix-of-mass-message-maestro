import { query } from './db.js';
import * as whatsappProvider from './lib/whatsapp-provider.js';

/**
 * Secretary Follow-up Scheduler
 * Checks for uncompleted CRM tasks created by the group secretary
 * and sends follow-up WhatsApp reminders after configured hours
 */
export async function executeSecretaryFollowups() {
  try {
    // Get all orgs with active secretary and follow-up enabled
    const configResult = await query(`
      SELECT * FROM group_secretary_config 
      WHERE is_active = true 
        AND followup_enabled = true 
        AND followup_hours > 0
    `);

    if (configResult.rows.length === 0) return;

    for (const config of configResult.rows) {
      try {
        const hoursAgo = config.followup_hours || 4;

        // Find pending tasks created by group_secretary older than X hours
        const tasksResult = await query(`
          SELECT t.*, u.name as assigned_name, u.whatsapp_phone, u.phone
          FROM crm_tasks t
          LEFT JOIN users u ON u.id = t.assigned_to
          WHERE t.organization_id = $1
            AND t.source = 'group_secretary'
            AND t.status = 'pending'
            AND t.created_at < NOW() - INTERVAL '1 hour' * $2
            AND (t.followup_sent_at IS NULL OR t.followup_sent_at < NOW() - INTERVAL '1 hour' * $2)
        `, [config.organization_id, hoursAgo]);

        if (tasksResult.rows.length === 0) continue;

        console.log(`📌 [FOLLOWUP] Processing ${tasksResult.rows.length} overdue secretary tasks for org ${config.organization_id}`);

        for (const task of tasksResult.rows) {
          try {
            // Send popup alert
            await query(
              `INSERT INTO user_alerts (user_id, type, title, message, metadata)
               VALUES ($1, 'task_reminder', $2, $3, $4)`,
              [
                task.assigned_to,
                `⏰ Follow-up: ${task.title}`,
                `Esta solicitação do grupo ainda está pendente há ${hoursAgo}h`,
                JSON.stringify({ task_id: task.id, source: 'secretary_followup' }),
              ]
            );

            // Send WhatsApp if phone available
            const phone = (task.whatsapp_phone || task.phone || '').replace(/\D/g, '');
            if (phone && config.notify_members_whatsapp) {
              const connection = await getFollowupConnection(config);
              if (connection) {
                const message = `⏰ *Follow-up - Secretária IA*\n\n` +
                  `📋 *Tarefa:* ${task.title}\n` +
                  `⏳ *Pendente há:* ${hoursAgo}h\n\n` +
                  `${task.description ? `📝 ${task.description.substring(0, 300)}` : ''}\n\n` +
                  `_Responda esta mensagem ou acesse o sistema para atualizar o status._`;

                await whatsappProvider.sendMessage(connection, phone, message, 'text', null);
              }
            }

            // Mark follow-up as sent
            await query(
              `UPDATE crm_tasks SET followup_sent_at = NOW() WHERE id = $1`,
              [task.id]
            );

            console.log(`  ✓ Follow-up sent for task "${task.title}" to ${task.assigned_name}`);
          } catch (err) {
            console.error(`  ✗ Follow-up error for task ${task.id}:`, err.message);
          }
        }
      } catch (orgErr) {
        console.error(`  ✗ Follow-up error for org ${config.organization_id}:`, orgErr.message);
      }
    }
  } catch (error) {
    console.error('📌 [FOLLOWUP] Error:', error);
  }
}

async function getFollowupConnection(config) {
  try {
    if (config.default_connection_id) {
      const result = await query(
        `SELECT * FROM connections WHERE id = $1 AND status = 'connected'`,
        [config.default_connection_id]
      );
      if (result.rows.length > 0) return result.rows[0];
    }
    const result = await query(
      `SELECT * FROM connections WHERE organization_id = $1 AND status = 'connected' ORDER BY created_at ASC LIMIT 1`,
      [config.organization_id]
    );
    return result.rows[0] || null;
  } catch { return null; }
}
