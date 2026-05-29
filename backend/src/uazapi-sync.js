import { query } from './db.js';
import { logInfo, logError } from './logger.js';
import * as uaz from './lib/uazapi-provider.js';
import { normalizePhone } from './routes/uazapi.js';

export async function checkUazapiWebhooks() {
  try {
    const connections = await query(
      `SELECT * FROM connections 
       WHERE (provider = 'uazapi' OR uazapi_token IS NOT NULL) 
       AND status = 'connected'`
    );

    for (const conn of connections.rows) {
      logInfo('uazapi.webhook_check', { connection_id: conn.id, name: conn.name });
      
      try {
        const status = await uaz.getWebhookStatus({
          serverUrl: conn.uazapi_server_url,
          token: conn.uazapi_token
        });

        if (!status.ok || !status.enabled || !status.matches) {
          logInfo('uazapi.webhook_reconfiguring', { 
            connection_id: conn.id, 
            reason: !status.ok ? 'not_ok' : (!status.enabled ? 'disabled' : 'url_mismatch')
          });
          
          const baseUrl = process.env.API_BASE_URL;
          if (baseUrl) {
            const webhookUrl = `${baseUrl}/api/uazapi/webhook`;
            await uaz.reconfigureWebhook({
              serverUrl: conn.uazapi_server_url,
              token: conn.uazapi_token,
              url: webhookUrl
            });
            logInfo('uazapi.webhook_reconfigured', { connection_id: conn.id, url: webhookUrl });
          }
        }
      } catch (err) {
        logError('uazapi.webhook_check_failed', err, { connection_id: conn.id });
      }
    }
  } catch (err) {
    logError('uazapi.webhook_sync_failed', err);
  }
}
