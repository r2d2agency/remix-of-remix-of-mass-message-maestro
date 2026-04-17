// UAZAPI Provider - https://docs.uazapi.com/
// Auth: header "token" for instance endpoints, "admintoken" for admin endpoints.
// All endpoints relative to a server URL configured globally by super-admin.

import { query } from '../db.js';

// ---------- helpers ----------

function buildUrl(serverUrl, path) {
  const base = String(serverUrl || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    try {
      return { raw: await res.text() };
    } catch {
      return null;
    }
  }
}

async function uazRequest({
  serverUrl,
  path,
  method = 'GET',
  token = null,
  adminToken = null,
  body = null,
  query: qs = null,
  timeoutMs = 20000,
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.token = token;
  if (adminToken) headers.admintoken = adminToken;

  let url = buildUrl(serverUrl, path);
  if (qs && Object.keys(qs).length > 0) {
    const sp = new URLSearchParams();
    Object.entries(qs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) sp.set(k, String(v));
    });
    url += (url.includes('?') ? '&' : '?') + sp.toString();
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.message || String(err) };
  } finally {
    clearTimeout(t);
  }
}

// Get the active global server config
export async function getDefaultServer() {
  const r = await query(
    `SELECT id, name, server_url, admin_token
       FROM uazapi_servers
      WHERE is_active = TRUE AND is_default = TRUE
      LIMIT 1`
  );
  if (r.rows[0]) return r.rows[0];
  // fallback: any active server
  const r2 = await query(
    `SELECT id, name, server_url, admin_token
       FROM uazapi_servers
      WHERE is_active = TRUE
      ORDER BY created_at ASC
      LIMIT 1`
  );
  return r2.rows[0] || null;
}

// ============================================================
//  ADMIN ENDPOINTS  (require admintoken)
// ============================================================

// POST /instance/init  — create a new instance
export async function adminCreateInstance({ serverUrl, adminToken, name, systemName }) {
  return uazRequest({
    serverUrl,
    adminToken,
    path: '/instance/init',
    method: 'POST',
    body: { name, systemName: systemName || 'lovable-blaster' },
  });
}

// GET /instance/all — list all instances on the server
export async function adminListInstances({ serverUrl, adminToken }) {
  return uazRequest({ serverUrl, adminToken, path: '/instance/all' });
}

// DELETE /instance/{token} — remove an instance
export async function adminDeleteInstance({ serverUrl, adminToken, instanceToken }) {
  return uazRequest({
    serverUrl,
    adminToken,
    path: `/instance/${encodeURIComponent(instanceToken)}`,
    method: 'DELETE',
  });
}

// ============================================================
//  INSTANCE ENDPOINTS  (require instance token)
// ============================================================

export async function getStatus({ serverUrl, token }) {
  const r = await uazRequest({ serverUrl, token, path: '/instance/status' });
  if (!r.ok) return { status: 'disconnected', raw: r.data };
  const d = r.data || {};
  const state = d.instance?.status || d.status;
  let status = 'disconnected';
  if (state === 'connected' || state === 'open') status = 'connected';
  else if (state === 'connecting' || state === 'qrcode') status = 'connecting';
  return {
    status,
    phoneNumber: d.instance?.owner || d.owner || d.phone || undefined,
    raw: d,
  };
}

export async function connect({ serverUrl, token, phone }) {
  // /instance/connect — returns QR code (and pairing code if phone provided)
  const r = await uazRequest({
    serverUrl,
    token,
    path: '/instance/connect',
    method: 'POST',
    body: phone ? { phone } : {},
  });
  if (!r.ok) return { success: false, error: r.data?.error || `HTTP ${r.status}` };
  const d = r.data || {};
  return {
    success: true,
    qrcode: d.instance?.qrcode || d.qrcode || d.base64 || null,
    pairingCode: d.instance?.paircode || d.paircode || d.pairingCode || null,
    raw: d,
  };
}

export async function disconnect({ serverUrl, token }) {
  const r = await uazRequest({
    serverUrl,
    token,
    path: '/instance/disconnect',
    method: 'POST',
  });
  return { success: r.ok, raw: r.data };
}

// Configure webhook: /instance/updateWebhook
export async function configureWebhook({ serverUrl, token, webhookUrl, events }) {
  // UAZAPI accepts an array of event names, or omit for "all"
  const body = {
    url: webhookUrl,
    enabled: true,
    events: events || [
      'messages',
      'messages_update',
      'connection',
      'presence',
      'chats',
      'contacts',
      'groups',
      'send_message',
    ],
    excludeMessages: { wasSentByApi: false, fromMe: false, isGroup: false },
  };
  return uazRequest({
    serverUrl,
    token,
    path: '/instance/updateWebhook',
    method: 'POST',
    body,
  });
}

// ============================================================
//  SEND MESSAGE
// ============================================================

export async function sendText({ serverUrl, token, phone, text, replyId, mentions }) {
  const body = { number: phone, text };
  if (replyId) body.replyid = replyId;
  if (mentions?.length) body.mentions = mentions;
  return uazRequest({
    serverUrl,
    token,
    path: '/send/text',
    method: 'POST',
    body,
  });
}

export async function sendMedia({
  serverUrl,
  token,
  phone,
  type, // 'image' | 'video' | 'document' | 'audio' | 'ptt' | 'sticker'
  fileUrl,
  base64,
  caption,
  filename,
  mimetype,
}) {
  const body = { number: phone, type };
  if (fileUrl) body.file = fileUrl;
  if (base64) body.file = base64;
  if (caption) body.text = caption;
  if (filename) body.docName = filename;
  if (mimetype) body.mimetype = mimetype;
  return uazRequest({
    serverUrl,
    token,
    path: '/send/media',
    method: 'POST',
    body,
  });
}

export async function sendImage(params) {
  return sendMedia({ ...params, type: 'image' });
}
export async function sendVideo(params) {
  return sendMedia({ ...params, type: 'video' });
}
export async function sendDocument(params) {
  return sendMedia({ ...params, type: 'document' });
}
export async function sendAudio({ serverUrl, token, phone, fileUrl, base64, ptt = true }) {
  return sendMedia({
    serverUrl,
    token,
    phone,
    type: ptt ? 'ptt' : 'audio',
    fileUrl,
    base64,
  });
}

export async function sendLocation({ serverUrl, token, phone, latitude, longitude, name, address }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/send/location',
    method: 'POST',
    body: { number: phone, latitude, longitude, name, address },
  });
}

export async function sendContact({ serverUrl, token, phone, contacts }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/send/contact',
    method: 'POST',
    body: { number: phone, contacts },
  });
}

export async function sendReaction({ serverUrl, token, messageId, reaction }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/message/react',
    method: 'POST',
    body: { id: messageId, text: reaction },
  });
}

// ============================================================
//  CHAT / CONTACT actions
// ============================================================

export async function checkNumber({ serverUrl, token, phones }) {
  const list = Array.isArray(phones) ? phones : [phones];
  const r = await uazRequest({
    serverUrl,
    token,
    path: '/chat/check',
    method: 'POST',
    body: { numbers: list },
  });
  if (!r.ok) return { success: false, results: [] };
  const arr = Array.isArray(r.data) ? r.data : r.data?.results || [];
  return {
    success: true,
    results: arr.map((x) => ({ phone: x.query || x.phone, exists: !!(x.exists || x.isInWhatsapp) })),
  };
}

export async function getChats({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/chat/list' });
}

export async function getContacts({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/contact/list' });
}

export async function getProfilePicture({ serverUrl, token, phone }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/chat/profilePicture',
    method: 'POST',
    body: { number: phone },
  });
}

export async function markAsRead({ serverUrl, token, messageId }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/message/markread',
    method: 'POST',
    body: { id: messageId },
  });
}

export async function deleteMessage({ serverUrl, token, messageId, forEveryone = true }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/message/delete',
    method: 'POST',
    body: { id: messageId, forEveryone },
  });
}

export async function downloadMedia({ serverUrl, token, messageId }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/message/download',
    method: 'POST',
    body: { id: messageId },
  });
}

// ============================================================
//  GROUPS
// ============================================================
export async function listGroups({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/group/list' });
}

export async function getGroupInfo({ serverUrl, token, groupJid }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/group/info',
    method: 'POST',
    body: { groupjid: groupJid },
  });
}

// ============================================================
//  LABELS / QUICK REPLIES / CRM (UAZAPI native)
// ============================================================
export async function listLabels({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/label/list' });
}

export async function listQuickReplies({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/quickReply/list' });
}

export async function listNewsletters({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/newsletter/list' });
}

// ============================================================
//  MASS MESSAGE / CAMPAIGNS (UAZAPI native)
// ============================================================
export async function createMassMessage({ serverUrl, token, payload }) {
  return uazRequest({
    serverUrl,
    token,
    path: '/sender/simple',
    method: 'POST',
    body: payload,
  });
}

export async function listCampaigns({ serverUrl, token }) {
  return uazRequest({ serverUrl, token, path: '/sender/listfolder' });
}
