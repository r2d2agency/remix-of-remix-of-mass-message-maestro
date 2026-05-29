import { query } from './db.js';
import { logInfo, logError } from './logger.js';
import * as uaz from './lib/uazapi-provider.js';

function normalizePhone(value) {
  const raw = String(value || '').replace(/@.*$/, '');
  return raw.replace(/\D/g, '');
}

async function getWebhookStatus({ serverUrl, token }) {
  try {
    const r = await uaz.getWebhook({ serverUrl, token });
    const data = r.data || {};
    
    let candidates = [];
    if (Array.isArray(data)) {
      candidates = data;
    } else if (Array.isArray(data.webhooks)) {
      candidates = data.webhooks;
    } else if (data.webhook && typeof data.webhook === 'object') {
      candidates = [data.webhook];
    } else if (data.url || data.enabled !== undefined) {
      candidates = [data];
    }

    const baseUrl = process.env.API_BASE_URL;
    const normalize = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
    const expectedNorm = baseUrl ? normalize(`${baseUrl}/api/uazapi/webhook`) : '';
    
    const wh = candidates.find((w) => normalize(w?.url) === expectedNorm) || candidates[0] || {};
    
    return {
      ok: r.ok,
      enabled: wh.enabled !== false,
      matches: expectedNorm ? normalize(wh.url) === expectedNorm : true,
      url: wh.url
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function reconfigureWebhook({ serverUrl, token, url }) {
  return uaz.configureWebhook({ serverUrl, token, webhookUrl: url });
}

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
        const status = await getWebhookStatus({
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
            await reconfigureWebhook({
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
