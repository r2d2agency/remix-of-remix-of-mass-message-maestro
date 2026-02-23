import { query } from './db.js';
import { fetchJsonWithRetry } from './lib/retry-fetch.js';
import { logInfo, logWarn, logError } from './logger.js';

/** Persist a sync log entry to the database for UI visibility */
async function dbLog(organizationId, level, event, payload = {}) {
  try {
    await query(
      `INSERT INTO aasp_sync_logs (organization_id, level, event, payload) VALUES ($1, $2, $3, $4)`,
      [organizationId, level, event, JSON.stringify(payload)]
    );
  } catch {
    // don't let log persistence break the sync
  }
}

const AASP_BASE_URL = 'https://intimacaoapi.aasp.org.br';

/**
 * Sync intimações from AASP API for a given config
 */
export async function syncAASP(config) {
  const { organization_id, api_token, notify_phone, connection_id } = config;
  let newCount = 0;

  logInfo('aasp.sync.start', { organization_id, has_notify_phone: !!notify_phone, has_connection_id: !!connection_id });
  await dbLog(organization_id, 'info', 'sync.start', { has_notify_phone: !!notify_phone, has_connection_id: !!connection_id });
  try {
    // 1. Get list of jornais with intimações
    logInfo('aasp.sync.fetch_jornais', { organization_id, url: `${AASP_BASE_URL}/api/Associado/intimacao/GetJornaisComIntimacoes/json` });
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

    logInfo('aasp.sync.jornais_response', { organization_id, status: jornaisResp.status, ok: jornaisResp.ok, dataType: typeof jornaisResp.data, dataPreview: JSON.stringify(jornaisResp.data)?.substring(0, 500) });

    if (!jornaisResp.ok) {
      logError('aasp.sync.jornais_failed', null, { organization_id, status: jornaisResp.status, data: jornaisResp.data });
      await dbLog(organization_id, 'error', 'sync.jornais_failed', { status: jornaisResp.status, data: typeof jornaisResp.data === 'string' ? jornaisResp.data.substring(0, 500) : jornaisResp.data });
      return { success: false, error: `API retornou status ${jornaisResp.status}`, newCount: 0 };

    // 2. Fetch intimações
    logInfo('aasp.sync.fetch_intimacoes', { organization_id, url: `${AASP_BASE_URL}/api/Associado/intimacao/json` });
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

    logInfo('aasp.sync.intimacoes_response', { 
      organization_id, 
      status: intimacoesResp.status, 
      ok: intimacoesResp.ok, 
      dataType: typeof intimacoesResp.data,
      isArray: Array.isArray(intimacoesResp.data),
      keys: intimacoesResp.data ? Object.keys(intimacoesResp.data).slice(0, 20) : null,
      dataPreview: JSON.stringify(intimacoesResp.data)?.substring(0, 1000),
    });

    if (!intimacoesResp.ok) {
      logError('aasp.sync.intimacoes_failed', null, { organization_id, status: intimacoesResp.status, data: intimacoesResp.data });
      await dbLog(organization_id, 'error', 'sync.intimacoes_failed', { status: intimacoesResp.status });
      return { success: false, error: `API retornou status ${intimacoesResp.status}`, newCount: 0 };

    const intimacoes = Array.isArray(intimacoesResp.data) ? intimacoesResp.data : 
                       (intimacoesResp.data?.Intimacoes || intimacoesResp.data?.intimacoes || []);

    await dbLog(organization_id, 'info', 'sync.parsed_intimacoes', { count: intimacoes.length, extractedFrom: Array.isArray(intimacoesResp.data) ? 'root_array' : intimacoesResp.data?.Intimacoes ? 'Intimacoes_key' : 'fallback' });

    logInfo('aasp.sync.parsed_intimacoes', { 
      organization_id, 
      count: intimacoes.length, 
      firstItem: intimacoes.length > 0 ? JSON.stringify(intimacoes[0])?.substring(0, 500) : null,
      extractedFrom: Array.isArray(intimacoesResp.data) ? 'root_array' : 
                     intimacoesResp.data?.Intimacoes ? 'Intimacoes_key' : 
                     intimacoesResp.data?.intimacoes ? 'intimacoes_key' : 'fallback_empty',
    });

    // 3. Upsert each intimação
    let insertErrors = 0;
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
        insertErrors++;
        logError('aasp.sync.insert_error', err, { organization_id, externalId, itemKeys: Object.keys(item) });
      }
    }

    // 4. Update last_sync_at
    await query(
      `UPDATE aasp_config SET last_sync_at = NOW() WHERE organization_id = $1`,
      [organization_id]
    );

    // 5. Send WhatsApp notification if there are new intimações
    if (newCount > 0 && notify_phone && connection_id) {
      logInfo('aasp.sync.sending_notification', { organization_id, newCount, notify_phone: notify_phone.replace(/\d(?=\d{4})/g, '*') });
      await sendWhatsAppNotification(connection_id, notify_phone, newCount, organization_id);
    }

    logInfo('aasp.sync.complete', { organization_id, newCount, total: intimacoes.length, insertErrors });
    await dbLog(organization_id, 'info', 'sync.complete', { newCount, total: intimacoes.length, insertErrors });
    return { success: true, newCount, total: intimacoes.length };
  } catch (error) {
    logError('aasp.sync.error', error, { organization_id });
    await dbLog(organization_id, 'error', 'sync.error', { message: error.message, stack: error.stack?.substring(0, 300) });
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

    logInfo('aasp.notify.sent', { phone: phone.replace(/\d(?=\d{4})/g, '*'), count });
  } catch (error) {
    logError('aasp.notify.error', error, { organizationId });
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

    if (configs.rows.length === 0) {
      logInfo('aasp.cron.no_configs');
      return;
    }

    logInfo('aasp.cron.start', { configCount: configs.rows.length });

    for (const config of configs.rows) {
      try {
        await syncAASP(config);
      } catch (error) {
        logError('aasp.cron.sync_error', error, { organization_id: config.organization_id });
      }
    }

    logInfo('aasp.cron.complete', { configCount: configs.rows.length });
  } catch (error) {
    logError('aasp.cron.error', error);
  }
}
