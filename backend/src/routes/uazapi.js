// UAZAPI routes — global server config (super-admin) + per-connection actions
import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import * as uaz from '../lib/uazapi-provider.js';

const router = Router();

function buildAuditOutcome(processResult, processError = null, processed = true) {
  return { processed, processResult, processError };
}

async function updateInboundAudit(auditId, outcome) {
  if (!auditId || !outcome) return;
  await query(
    `UPDATE inbound_webhook_audit
     SET processed = $1, process_result = $2, process_error = $3
     WHERE id = $4`,
    [outcome.processed !== false, outcome.processResult || null, outcome.processError || null, auditId]
  ).catch(() => {});
}

function normalizePhone(value) {
  const raw = String(value || '').replace(/@.*$/, '');
  return raw.replace(/\D/g, '');
}

function normalizeJid(value, isGroup = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw;
  const phone = normalizePhone(raw);
  if (!phone) return null;
  return isGroup ? `${phone}@g.us` : `${phone}@s.whatsapp.net`;
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractUazapiMessage(payload) {
  const data = payload?.data || payload?.message || payload || {};
  const content = data.content && typeof data.content === 'object' ? data.content : {};
  const messageTypeRaw = pickFirstString(data.messageType, data.type, data.mediaType, content.type) || 'text';
  let messageType = String(messageTypeRaw).toLowerCase();
  if (messageType.includes('image')) messageType = 'image';
  else if (messageType.includes('audio') || messageType.includes('ptt')) messageType = 'audio';
  else if (messageType.includes('video')) messageType = 'video';
  else if (messageType.includes('document') || messageType.includes('file')) messageType = 'document';
  else if (messageType.includes('sticker')) messageType = 'sticker';
  else messageType = 'text';

  const text = pickFirstString(
    data.text,
    data.body,
    data.caption,
    content.text,
    content.caption,
    content.conversation,
    content.body
  );
  const mediaUrl = pickFirstString(data.fileURL, data.fileUrl, data.mediaUrl, data.url, content.url, content.fileURL, content.fileUrl, content.mediaUrl);
  const mediaMimetype = pickFirstString(data.mimetype, data.mimeType, content.mimetype, content.mimeType);

  return {
    data,
    messageId: pickFirstString(data.messageid, data.messageId, data.id, payload?.id) || crypto.randomUUID(),
    chatId: pickFirstString(data.chatid, data.chatId, data.remoteJid, data.from, data.to, payload?.chatid, payload?.chatId),
    sender: pickFirstString(data.sender, data.sender_pn, data.sender_lid, data.owner),
    senderName: pickFirstString(data.senderName, data.pushName, data.name),
    fromMe: data.fromMe === true || data.wasSentByApi === true,
    isGroup: data.isGroup === true || String(data.chatid || data.chatId || '').includes('@g.us'),
    messageType,
    content: text || (messageType === 'text' ? '' : `[${messageType === 'image' ? 'Imagem' : messageType === 'audio' ? 'Áudio' : messageType === 'video' ? 'Vídeo' : messageType === 'document' ? 'Documento' : 'Mídia'}]`),
    mediaUrl,
    mediaMimetype,
    timestamp: data.messageTimestamp || data.timestamp || payload?.timestamp || null,
  };
}

async function findUazapiConnection(payload, req) {
  const possible = [
    payload?.token,
    payload?.instance?.token,
    payload?.data?.token,
    req.headers['x-token'],
  ].filter(Boolean);

  for (const token of possible) {
    const c = await query(`SELECT * FROM connections WHERE provider = 'uazapi' AND uazapi_token = $1 LIMIT 1`, [token]);
    if (c.rows[0]) return c.rows[0];
  }

  const instanceRef = payload?.instance?.name || payload?.instance?.id || payload?.instance || payload?.data?.instance || payload?.data?.owner || null;
  if (instanceRef) {
    const c = await query(
      `SELECT * FROM connections
       WHERE provider = 'uazapi'
         AND (uazapi_instance_name = $1 OR phone_number = $1 OR uazapi_token = $1)
       LIMIT 1`,
      [String(instanceRef)]
    );
    if (c.rows[0]) return c.rows[0];
  }

  return null;
}

async function saveUazapiMessage(connection, payload) {
  const msg = extractUazapiMessage(payload);
  if (!msg.chatId) return buildAuditOutcome('skipped', 'message without chat id', false);
  if (msg.fromMe && msg.data.wasSentByApi === true) return buildAuditOutcome('ignored', 'message sent by api ignored', true);

  const remoteJid = normalizeJid(msg.chatId, msg.isGroup);
  if (!remoteJid) return buildAuditOutcome('skipped', 'invalid chat id', false);

  const cleanPhone = msg.isGroup ? null : normalizePhone(msg.chatId);
  const contactName = msg.isGroup
    ? (pickFirstString(msg.data.chatName, msg.data.groupName, msg.data.name) || 'Grupo')
    : (msg.senderName || cleanPhone);

  let conv = await query(`SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2 LIMIT 1`, [connection.id, remoteJid]);
  let conversationId = conv.rows[0]?.id;

  if (!conversationId && cleanPhone) {
    conv = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND contact_phone = $2 AND COALESCE(is_group, false) = false ORDER BY last_message_at DESC LIMIT 1`,
      [connection.id, cleanPhone]
    );
    conversationId = conv.rows[0]?.id;
  }

  if (!conversationId) {
    const inserted = await query(
      `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, is_group, group_name, last_message_at, unread_count, attendance_status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
       RETURNING id`,
      [connection.id, remoteJid, contactName, cleanPhone, msg.isGroup, msg.isGroup ? contactName : null, msg.fromMe ? 0 : 1, msg.fromMe ? 'attending' : 'waiting']
    );
    conversationId = inserted.rows[0].id;
  } else {
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           unread_count = CASE WHEN $2 THEN unread_count ELSE unread_count + 1 END,
           contact_name = COALESCE($3, contact_name),
           remote_jid = $4,
           attendance_status = CASE WHEN NOT $2 AND attendance_status = 'finished' THEN 'waiting' ELSE attendance_status END,
           accepted_at = CASE WHEN NOT $2 AND attendance_status = 'finished' THEN NULL ELSE accepted_at END,
           accepted_by = CASE WHEN NOT $2 AND attendance_status = 'finished' THEN NULL ELSE accepted_by END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversationId, msg.fromMe, contactName, remoteJid]
    );
  }

  await query(
    `INSERT INTO chat_messages (conversation_id, message_id, content, raw_text, caption, message_type, media_url, media_mimetype, from_me, sender_name, sender_phone, status, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE(to_timestamp($13::double precision / 1000), NOW()))
     ON CONFLICT (message_id) WHERE message_id IS NOT NULL AND message_id NOT LIKE 'temp_%' DO NOTHING`,
    [conversationId, msg.messageId, msg.content || null, msg.content || null, ['image','video','document'].includes(msg.messageType) ? msg.content || null : null, msg.messageType, msg.mediaUrl, msg.mediaMimetype, msg.fromMe, msg.isGroup ? msg.senderName : null, msg.isGroup ? normalizePhone(msg.sender) : null, msg.fromMe ? 'sent' : 'received', Number(msg.timestamp) || null]
  );

  return buildAuditOutcome('saved', null, true);
}

// ----- helpers -----
async function isSuperadmin(userId) {
  const r = await query(
    `SELECT is_superadmin FROM users WHERE id = $1`,
    [userId]
  );
  return !!r.rows[0]?.is_superadmin;
}

async function requireSuperadmin(req, res, next) {
  if (!(await isSuperadmin(req.userId))) {
    return res.status(403).json({ error: 'Apenas super-admin' });
  }
  next();
}

async function getUserOrganization(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role
       FROM organization_members om
      WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function getConnectionWithAccess(connectionId, userId) {
  const org = await getUserOrganization(userId);
  let result;
  if (org) {
    result = await query(
      `SELECT * FROM connections
        WHERE id = $1 AND provider = 'uazapi'
          AND (organization_id = $2
               OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $3))
        LIMIT 1`,
      [connectionId, org.organization_id, userId]
    );
  } else {
    result = await query(
      `SELECT * FROM connections
        WHERE id = $1 AND provider = 'uazapi'
          AND (user_id = $2
               OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $2))
        LIMIT 1`,
      [connectionId, userId]
    );
  }
  return result.rows[0] || null;
}

// ============================================================
//  PUBLIC: webhook receiver (no auth — UAZAPI hits this)
// ============================================================
router.post('/webhook', async (req, res) => {
  // Always 200 fast so UAZAPI doesn't retry storms
  res.status(200).json({ ok: true });

  try {
    const payload = req.body || {};
    const eventType = payload.event || payload.EventType || payload.type || 'unknown';
    const instanceToken = payload.token || payload.instance?.token || req.headers['x-token'];

    let connectionId = null;
    if (instanceToken) {
      const c = await query(
        `SELECT id FROM connections WHERE uazapi_token = $1 LIMIT 1`,
        [instanceToken]
      );
      connectionId = c.rows[0]?.id || null;
    }

    await query(
      `INSERT INTO uazapi_webhook_events (connection_id, event_type, payload, status)
       VALUES ($1, $2, $3, 'received')`,
      [connectionId, eventType, JSON.stringify(payload)]
    );

    // Update connection status when connection event arrives
    if (connectionId && eventType === 'connection') {
      const state = payload.instance?.status || payload.status;
      if (state === 'connected' || state === 'open') {
        await query(
          `UPDATE connections
              SET status='connected',
                  phone_number=COALESCE($2, phone_number),
                  updated_at=NOW()
            WHERE id=$1`,
          [connectionId, payload.instance?.owner || payload.owner || null]
        );
      } else if (state === 'disconnected' || state === 'close') {
        await query(
          `UPDATE connections SET status='disconnected', updated_at=NOW() WHERE id=$1`,
          [connectionId]
        );
      }
    }
  } catch (err) {
    console.error('[UAZAPI webhook] Error:', err);
  }
});

// All endpoints below require auth
router.use(authenticate);

// ============================================================
//  SUPER-ADMIN: global server config CRUD
// ============================================================
router.get('/servers', requireSuperadmin, async (_req, res) => {
  const r = await query(
    `SELECT id, name, server_url, is_default, is_active, notes, created_at, updated_at
       FROM uazapi_servers ORDER BY created_at DESC`
  );
  res.json(r.rows);
});

router.post('/servers', requireSuperadmin, async (req, res) => {
  try {
    const { name, server_url, admin_token, is_default = true, notes } = req.body || {};
    if (!name || !server_url || !admin_token) {
      return res.status(400).json({ error: 'name, server_url e admin_token são obrigatórios' });
    }
    if (is_default) {
      await query(`UPDATE uazapi_servers SET is_default=FALSE WHERE is_default=TRUE`);
    }
    const r = await query(
      `INSERT INTO uazapi_servers (name, server_url, admin_token, is_default, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, server_url, is_default, is_active, notes`,
      [name, server_url.replace(/\/+$/, ''), admin_token, !!is_default, notes || null, req.userId]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[UAZAPI] create server', err);
    res.status(500).json({ error: 'Erro ao criar servidor UAZAPI' });
  }
});

router.patch('/servers/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, server_url, admin_token, is_default, is_active, notes } = req.body || {};
    if (is_default === true) {
      await query(`UPDATE uazapi_servers SET is_default=FALSE WHERE is_default=TRUE`);
    }
    const r = await query(
      `UPDATE uazapi_servers SET
         name = COALESCE($2, name),
         server_url = COALESCE($3, server_url),
         admin_token = COALESCE($4, admin_token),
         is_default = COALESCE($5, is_default),
         is_active = COALESCE($6, is_active),
         notes = COALESCE($7, notes)
       WHERE id = $1
       RETURNING id, name, server_url, is_default, is_active, notes`,
      [id, name, server_url ? server_url.replace(/\/+$/, '') : null, admin_token, is_default, is_active, notes]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Servidor não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[UAZAPI] update server', err);
    res.status(500).json({ error: 'Erro ao atualizar servidor' });
  }
});

router.delete('/servers/:id', requireSuperadmin, async (req, res) => {
  await query(`DELETE FROM uazapi_servers WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

// Test reachability of a server
router.post('/servers/:id/test', requireSuperadmin, async (req, res) => {
  const r = await query(`SELECT server_url, admin_token FROM uazapi_servers WHERE id=$1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Servidor não encontrado' });
  const result = await uaz.adminListInstances({
    serverUrl: r.rows[0].server_url,
    adminToken: r.rows[0].admin_token,
  });
  res.json({ ok: result.ok, status: result.status, data: result.data });
});

// Public-ish (auth'd) info: does the org have UAZAPI available?
router.get('/server-info', async (_req, res) => {
  const s = await uaz.getDefaultServer();
  if (!s) return res.json({ available: false });
  res.json({ available: true, serverUrl: s.server_url, name: s.name });
});

// ============================================================
//  CLIENT: create UAZAPI instance using global server
// ============================================================
router.post('/instances', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const server = await uaz.getDefaultServer();
    if (!server) {
      return res.status(503).json({ error: 'Nenhum servidor UAZAPI configurado pelo super-admin' });
    }

    // 1) Create instance via admin endpoint
    const created = await uaz.adminCreateInstance({
      serverUrl: server.server_url,
      adminToken: server.admin_token,
      name,
    });
    if (!created.ok) {
      return res.status(502).json({
        error: 'Falha ao criar instância no servidor UAZAPI',
        detail: created.data,
      });
    }
    const instance = created.data?.instance || created.data || {};
    const token = instance.token || created.data?.token;
    const instanceName = instance.name || name;

    if (!token) {
      return res.status(502).json({ error: 'Servidor UAZAPI não retornou token da instância' });
    }

    // 2) Persist as a connection
    const org = await getUserOrganization(req.userId);
    const ins = await query(
      `INSERT INTO connections
         (user_id, organization_id, provider, name,
          uazapi_token, uazapi_instance_name, uazapi_server_url, status)
       VALUES ($1, $2, 'uazapi', $3, $4, $5, $6, 'disconnected')
       RETURNING *`,
      [
        req.userId,
        org?.organization_id || null,
        name,
        token,
        instanceName,
        server.server_url,
      ]
    );
    const connection = ins.rows[0];

    // 3) Configure webhook (always — infer public URL if env is missing)
    const inferredBase =
      process.env.BACKEND_PUBLIC_URL ||
      process.env.WEBHOOK_BASE_URL ||
      `${req.protocol}://${req.get('host')}`;
    const whUrl = `${String(inferredBase).replace(/\/+$/, '')}/api/uazapi/webhook`;

    let webhookResult = { ok: false, status: 0, data: null };
    try {
      webhookResult = await uaz.configureWebhook({
        serverUrl: server.server_url,
        token,
        webhookUrl: whUrl,
      });
      console.log('[UAZAPI] webhook config result:', {
        connectionId: connection.id,
        webhookUrl: whUrl,
        ok: webhookResult.ok,
        status: webhookResult.status,
        data: webhookResult.data,
      });
    } catch (e) {
      console.error('[UAZAPI] webhook config exception:', e?.message);
      webhookResult = { ok: false, status: 0, data: { error: e?.message } };
    }

    // Audit the webhook configuration in the events table for visibility
    await query(
      `INSERT INTO uazapi_webhook_events (connection_id, event_type, payload, status, error)
       VALUES ($1, 'webhook_setup', $2, $3, $4)`,
      [
        connection.id,
        JSON.stringify({ webhookUrl: whUrl, response: webhookResult.data }),
        webhookResult.ok ? 'configured' : 'failed',
        webhookResult.ok ? null : `HTTP ${webhookResult.status}`,
      ]
    ).catch((e) => console.warn('[UAZAPI] could not log webhook setup:', e?.message));

    connection.webhook_configured = webhookResult.ok;
    connection.webhook_url = whUrl;

    res.status(201).json(connection);
  } catch (err) {
    console.error('[UAZAPI] create instance', err);
    res.status(500).json({ error: 'Erro ao criar instância UAZAPI' });
  }
});

// ============================================================
//  CLIENT: per-connection actions
// ============================================================
router.get('/:connectionId/status', async (req, res) => {
  try {
    const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
    if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
    if (!c.uazapi_token || !c.uazapi_server_url) {
      return res.json({ status: c.status || 'disconnected', phoneNumber: c.phone_number, provider: 'uazapi' });
    }
    const r = await uaz.getStatus({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
    await query(
      `UPDATE connections SET status=$2, phone_number=COALESCE($3, phone_number), updated_at=NOW() WHERE id=$1`,
      [c.id, r.status, r.phoneNumber || null]
    );
    res.json({ ...r, provider: 'uazapi' });
  } catch (err) {
    console.error('[UAZAPI] status error', err);
    res.json({ status: 'disconnected', provider: 'uazapi', error: err?.message || 'status_error' });
  }
});

router.post('/:connectionId/connect', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const { phone } = req.body || {};
  const r = await uaz.connect({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    phone,
  });
  res.json(r);
});

router.post('/:connectionId/disconnect', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await uaz.disconnect({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
  await query(`UPDATE connections SET status='disconnected', updated_at=NOW() WHERE id=$1`, [c.id]);
  res.json(r);
});

router.post('/:connectionId/reconfigure-webhook', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const inferredBase =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.WEBHOOK_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  const whUrl = req.body?.url || `${String(inferredBase).replace(/\/+$/, '')}/api/uazapi/webhook`;
  const r = await uaz.configureWebhook({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    webhookUrl: whUrl,
  });
  await query(
    `INSERT INTO uazapi_webhook_events (connection_id, event_type, payload, status, error)
     VALUES ($1, 'webhook_setup', $2, $3, $4)`,
    [
      c.id,
      JSON.stringify({ webhookUrl: whUrl, response: r.data }),
      r.ok ? 'configured' : 'failed',
      r.ok ? null : `HTTP ${r.status}`,
    ]
  ).catch(() => {});
  res.json({ ok: r.ok, status: r.status, webhookUrl: whUrl, data: r.data });
});

// Send actions
router.post('/:connectionId/send/text', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const { phone, text } = req.body || {};
  if (!phone || !text) return res.status(400).json({ error: 'phone e text obrigatórios' });
  const r = await uaz.sendText({ serverUrl: c.uazapi_server_url, token: c.uazapi_token, phone, text });
  res.status(r.ok ? 200 : 502).json(r.data);
});

router.post('/:connectionId/send/media', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const { phone, type, fileUrl, caption, filename } = req.body || {};
  const r = await uaz.sendMedia({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    phone,
    type,
    fileUrl,
    caption,
    filename,
  });
  res.status(r.ok ? 200 : 502).json(r.data);
});

router.post('/:connectionId/check-number', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await uaz.checkNumber({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    phones: req.body?.phones || [],
  });
  res.json(r);
});

// Webhook events listing
router.get('/:connectionId/webhook-events', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await query(
    `SELECT id, event_type, status, error, created_at, payload
       FROM uazapi_webhook_events
      WHERE connection_id = $1
      ORDER BY created_at DESC LIMIT 100`,
    [c.id]
  );
  res.json({ events: r.rows });
});

// Clear webhook events for a connection
router.delete('/:connectionId/webhook-events', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  await query(`DELETE FROM uazapi_webhook_events WHERE connection_id = $1`, [c.id]);
  res.json({ success: true });
});

// Fetch the current webhook configuration registered on the UAZAPI server
router.get('/:connectionId/webhook-status', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const inferredBase =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.WEBHOOK_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  const expectedUrl = `${String(inferredBase).replace(/\/+$/, '')}/api/uazapi/webhook`;
  const r = await uaz.getWebhook({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
  const data = r.data || {};
  // UAZAPI may return { webhook: {...} } or the object directly
  const wh = data.webhook || data;
  res.json({
    ok: r.ok,
    status: r.status,
    expectedUrl,
    registeredUrl: wh?.url || null,
    enabled: wh?.enabled ?? null,
    events: wh?.events || [],
    excludeMessages: wh?.excludeMessages || [],
    matches: !!wh?.url && wh.url === expectedUrl && wh?.enabled !== false,
    raw: data,
  });
});

// Delete (full removal of the connection AND remote instance)
router.delete('/:connectionId', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  // try remote delete via admin token
  const server = await uaz.getDefaultServer();
  if (server && c.uazapi_token) {
    try {
      await uaz.adminDeleteInstance({
        serverUrl: server.server_url,
        adminToken: server.admin_token,
        instanceToken: c.uazapi_token,
      });
    } catch (e) {
      console.warn('[UAZAPI] remote delete failed', e?.message);
    }
  }
  await query(`DELETE FROM connections WHERE id=$1`, [c.id]);
  res.json({ success: true });
});

// Groups / labels / quick-replies / newsletters / campaigns (passthrough)
const passthrough = (path) => async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const fn = uaz[path];
  if (!fn) return res.status(404).json({ error: 'Endpoint não suportado' });
  const r = await fn({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
  res.json(r.data);
};

router.get('/:connectionId/groups', passthrough('listGroups'));
router.get('/:connectionId/labels', passthrough('listLabels'));
router.get('/:connectionId/quick-replies', passthrough('listQuickReplies'));
router.get('/:connectionId/newsletters', passthrough('listNewsletters'));
router.get('/:connectionId/campaigns', passthrough('listCampaigns'));

router.post('/:connectionId/campaigns', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await uaz.createMassMessage({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    payload: req.body,
  });
  res.status(r.ok ? 200 : 502).json(r.data);
});

export default router;
