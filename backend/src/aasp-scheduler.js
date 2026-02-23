import { query } from './db.js';
import { fetchJsonWithRetry } from './lib/retry-fetch.js';

const AASP_BASE_URL = 'https://intimacaoapi.aasp.org.br';

/**
 * Sync intimações from AASP API for a given config
 */
export async function syncAASP(config) {
  const { organization_id, api_token, notify_phone, connection_id } = config;
  let newCount = 0;

  try {
    // 1. Get list of jornais with intimações
    const jornaisResp = await fetchJsonWithRetry(
      `${AASP_BASE_URL}/api/Associado/intimacao/GetJornaisComIntimacoes/json`,
      {
        headers: {
          'Authorization': `Bearer ${api_token}`,
          'Accept': 'application/json',
        },
      },
      { retries: 2, label: 'aasp-jornais' }
    );

    if (!jornaisResp.ok) {
      console.error('[AASP] Failed to fetch jornais:', jornaisResp.status, jornaisResp.data);
      return { success: false, error: `API retornou status ${jornaisResp.status}`, newCount: 0 };
    }

    // 2. Fetch intimações
    const intimacoesResp = await fetchJsonWithRetry(
      `${AASP_BASE_URL}/api/Associado/intimacao/json`,
      {
        headers: {
          'Authorization': `Bearer ${api_token}`,
          'Accept': 'application/json',
        },
      },
      { retries: 2, label: 'aasp-intimacoes' }
    );

    if (!intimacoesResp.ok) {
      console.error('[AASP] Failed to fetch intimacoes:', intimacoesResp.status, intimacoesResp.data);
      return { success: false, error: `API retornou status ${intimacoesResp.status}`, newCount: 0 };
    }

    const intimacoes = Array.isArray(intimacoesResp.data) ? intimacoesResp.data : 
                       (intimacoesResp.data?.Intimacoes || intimacoesResp.data?.intimacoes || []);

    console.log(`[AASP] Fetched ${intimacoes.length} intimações for org ${organization_id}`);

    // 3. Upsert each intimação
    for (const item of intimacoes) {
      const externalId = item.Id || item.id || item.CodigoIntimacao || `${item.Processo || ''}_${item.DataPublicacao || ''}`;
      
      try {
        const result = await query(
          `INSERT INTO aasp_intimacoes (
            organization_id, external_id, jornal, data_publicacao, data_disponibilizacao,
            caderno, pagina, comarca, vara, processo, tipo, conteudo, partes, advogados, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (organization_id, external_id) DO NOTHING
          RETURNING id`,
          [
            organization_id,
            String(externalId),
            item.Jornal || item.jornal || null,
            item.DataPublicacao || item.dataPublicacao || null,
            item.DataDisponibilizacao || item.dataDisponibilizacao || null,
            item.Caderno || item.caderno || null,
            item.Pagina || item.pagina || null,
            item.Comarca || item.comarca || null,
            item.Vara || item.vara || null,
            item.Processo || item.processo || item.NumeroProcesso || null,
            item.Tipo || item.tipo || null,
            item.Conteudo || item.conteudo || item.Texto || item.texto || null,
            item.Partes || item.partes || null,
            item.Advogados || item.advogados || null,
            JSON.stringify(item),
          ]
        );

        if (result.rows.length > 0) {
          newCount++;
        }
      } catch (err) {
        console.error('[AASP] Error inserting intimacao:', err.message);
      }
    }

    // 4. Update last_sync_at
    await query(
      `UPDATE aasp_config SET last_sync_at = NOW() WHERE organization_id = $1`,
      [organization_id]
    );

    // 5. Send WhatsApp notification if there are new intimações
    if (newCount > 0 && notify_phone && connection_id) {
      await sendWhatsAppNotification(connection_id, notify_phone, newCount, organization_id);
    }

    console.log(`[AASP] Sync complete for org ${organization_id}: ${newCount} new intimações`);
    return { success: true, newCount, total: intimacoes.length };
  } catch (error) {
    console.error('[AASP] Sync error:', error);
    return { success: false, error: error.message, newCount: 0 };
  }
}

/**
 * Send WhatsApp notification about new intimações
 */
async function sendWhatsAppNotification(connectionId, phone, count, organizationId) {
  try {
    // Get connection details
    const connResult = await query(
      `SELECT * FROM connections WHERE id = $1`,
      [connectionId]
    );

    if (connResult.rows.length === 0) return;

    const conn = connResult.rows[0];
    const provider = conn.provider || (conn.instance_id && conn.wapi_token ? 'wapi' : 'evolution');

    const message = `📋 *Novas Intimações AASP*\n\n` +
      `Foram encontradas *${count}* nova(s) intimação(ões).\n\n` +
      `Acesse o sistema para visualizar os detalhes.`;

    const cleanPhone = phone.replace(/\D/g, '');

    if (provider === 'wapi') {
      const { fetchWithRetry } = await import('./lib/retry-fetch.js');
      await fetchWithRetry(
        `https://api.w-api.app/v1/message/send-text?instanceId=${conn.instance_id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${conn.wapi_token}`,
          },
          body: JSON.stringify({ phone: cleanPhone, message }),
        },
        { retries: 2, label: 'aasp-wapi-notify' }
      );
    } else {
      const { fetchWithRetry } = await import('./lib/retry-fetch.js');
      const apiUrl = conn.api_url.replace(/\/$/, '');
      await fetchWithRetry(
        `${apiUrl}/message/sendText/${conn.instance_name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': conn.api_key,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: message,
          }),
        },
        { retries: 2, label: 'aasp-evolution-notify' }
      );
    }

    console.log(`[AASP] WhatsApp notification sent to ${cleanPhone}: ${count} new intimações`);
  } catch (error) {
    console.error('[AASP] Error sending WhatsApp notification:', error);
  }
}

/**
 * Execute AASP sync for all active configs (called by cron)
 */
export async function executeAASPSync() {
  try {
    const configs = await query(
      `SELECT * FROM aasp_config WHERE is_active = true`
    );

    if (configs.rows.length === 0) return;

    console.log(`[AASP] Starting sync for ${configs.rows.length} active configs`);

    for (const config of configs.rows) {
      try {
        await syncAASP(config);
      } catch (error) {
        console.error(`[AASP] Error syncing org ${config.organization_id}:`, error);
      }
    }
  } catch (error) {
    console.error('[AASP] Execute sync error:', error);
  }
}
