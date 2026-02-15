import { query } from './db.js';
import * as whatsappProvider from './lib/whatsapp-provider.js';

/**
 * Secretary Daily Digest Scheduler
 * Sends a daily summary of detections to the configured external number
 */
export async function executeSecretaryDigest() {
  try {
    const now = new Date();
    const currentHour = now.getHours();

    // Get configs with daily digest enabled and matching digest hour
    const configResult = await query(`
      SELECT * FROM group_secretary_config 
      WHERE is_active = true 
        AND daily_digest_enabled = true
        AND daily_digest_hour = $1
        AND (notify_external_phone IS NOT NULL OR notify_members_whatsapp = true)
    `, [currentHour]);

    if (configResult.rows.length === 0) return;

    for (const config of configResult.rows) {
      try {
        // Get yesterday's detections
        const logsResult = await query(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN matched_user_id IS NOT NULL THEN 1 END) as matched,
            COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent,
            COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
            COUNT(CASE WHEN sentiment IN ('negative', 'urgent_negative') THEN 1 END) as negative_sentiment
          FROM group_secretary_logs 
          WHERE organization_id = $1 
            AND created_at >= NOW() - INTERVAL '24 hours'
        `, [config.organization_id]);

        const stats = logsResult.rows[0];
        if (parseInt(stats.total) === 0) continue;

        // Get pending tasks from secretary
        const pendingResult = await query(`
          SELECT COUNT(*) as pending
          FROM crm_tasks 
          WHERE organization_id = $1 
            AND source = 'group_secretary' 
            AND status = 'pending'
        `, [config.organization_id]);

        const pending = parseInt(pendingResult.rows[0]?.pending || 0);

        // Get top members by requests
        const topMembersResult = await query(`
          SELECT matched_user_name, COUNT(*) as count
          FROM group_secretary_logs 
          WHERE organization_id = $1 
            AND created_at >= NOW() - INTERVAL '24 hours'
            AND matched_user_name IS NOT NULL
          GROUP BY matched_user_name
          ORDER BY count DESC
          LIMIT 5
        `, [config.organization_id]);

        const topMembers = topMembersResult.rows
          .map(r => `  • ${r.matched_user_name}: ${r.count} solicitações`)
          .join('\n');

        const message = `📊 *Resumo Diário - Secretária IA*\n` +
          `📅 ${now.toLocaleDateString('pt-BR')}\n\n` +
          `📌 *Detecções (24h):* ${stats.total}\n` +
          `✅ *Com responsável:* ${stats.matched}\n` +
          `🔴 *Urgentes:* ${stats.urgent}\n` +
          `🟠 *Alta prioridade:* ${stats.high_priority}\n` +
          `😠 *Sentimento negativo:* ${stats.negative_sentiment}\n` +
          `⏳ *Tarefas pendentes:* ${pending}\n` +
          (topMembers ? `\n👥 *Mais demandados:*\n${topMembers}` : '') +
          `\n\n_Acesse o sistema para mais detalhes._`;

        // Send to external phone
        if (config.notify_external_phone) {
          const connection = await getDigestConnection(config);
          if (connection) {
            const phone = config.notify_external_phone.replace(/\D/g, '');
            if (phone) {
              await whatsappProvider.sendMessage(connection, phone, message, 'text', null);
              console.log(`📊 [DIGEST] Sent daily digest to ${phone} for org ${config.organization_id}`);
            }
          }
        }
      } catch (orgErr) {
        console.error(`📊 [DIGEST] Error for org ${config.organization_id}:`, orgErr.message);
      }
    }
  } catch (error) {
    console.error('📊 [DIGEST] Error:', error);
  }
}

async function getDigestConnection(config) {
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
