// W-API Provider - Backend implementation
// https://api.w-api.app/v1/

import { logError, logInfo, logWarn } from '../logger.js';

const W_API_BASE_URL = 'https://api.w-api.app/v1';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.API_BASE_URL || 'https://whastsale-backend.exf0ty.easypanel.host';

// In-memory send attempts buffer (for diagnostics only; not persisted)
const SEND_ATTEMPTS_MAX = 200;
const sendAttempts = []; // { at, instanceId, phone, messageType, success, status, error, preview }

function recordSendAttempt(attempt) {
  try {
    sendAttempts.unshift(attempt);
    if (sendAttempts.length > SEND_ATTEMPTS_MAX) sendAttempts.length = SEND_ATTEMPTS_MAX;
  } catch {
    // no-op
  }
}

export function getSendAttempts({ instanceId, limit = 200 } = {}) {
  const filtered = instanceId ? sendAttempts.filter((a) => a.instanceId === instanceId) : sendAttempts;
  return filtered.slice(0, Math.max(1, Math.min(200, Number(limit) || 200)));
}

export function clearSendAttempts(instanceId) {
  if (!instanceId) {
    sendAttempts.length = 0;
    return;
  }
  for (let i = sendAttempts.length - 1; i >= 0; i--) {
    if (sendAttempts[i]?.instanceId === instanceId) sendAttempts.splice(i, 1);
  }
}

async function readJsonResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return { data: {}, text: '' };
  try {
    return { data: JSON.parse(text), text };
  } catch {
    throw new Error('Invalid JSON response');
  }
}

/**
 * Get headers for W-API requests
 */
function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Configure all webhooks for a W-API instance
 * Called when creating or updating a connection
 */
export async function configureWebhooks(instanceId, token) {
  const webhookUrl = `${WEBHOOK_BASE_URL}/api/wapi/webhook`;

  logInfo('wapi.webhooks_configure_started', {
    instance_id: instanceId,
    webhook_url: webhookUrl,
  });
  
  const webhookTypes = [
    { endpoint: 'update-webhook-received', name: 'received' },      // Mensagens recebidas
    { endpoint: 'update-webhook-delivery', name: 'delivery' },      // Status de entrega
    { endpoint: 'update-webhook-connected', name: 'connected' },    // Conexão estabelecida
    { endpoint: 'update-webhook-disconnected', name: 'disconnected' }, // Desconexão
  ];

  const results = [];
  
  for (const wh of webhookTypes) {
    try {
      const response = await fetch(
        `${W_API_BASE_URL}/webhook/${wh.endpoint}?instanceId=${instanceId}`,
        {
          method: 'PUT',
          headers: getHeaders(token),
          body: JSON.stringify({ url: webhookUrl }),
        }
      );

      const data = await response.json().catch(() => ({}));
      results.push({ 
        type: wh.name, 
        success: response.ok, 
        status: response.status,
        data 
      });

      if (response.ok) {
        logInfo('wapi.webhook_configured', {
          instance_id: instanceId,
          webhook_type: wh.name,
          status_code: response.status,
        });
      } else {
        logWarn('wapi.webhook_config_failed', {
          instance_id: instanceId,
          webhook_type: wh.name,
          status_code: response.status,
          error: data?.message || data?.error || null,
          body_preview: JSON.stringify(data).slice(0, 400),
        });
      }
    } catch (error) {
      logError('wapi.webhook_config_exception', error, {
        instance_id: instanceId,
        webhook_type: wh.name,
      });
      results.push({ type: wh.name, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  logInfo('wapi.webhooks_configure_finished', {
    instance_id: instanceId,
    configured: successCount,
    total: webhookTypes.length,
  });
  return {
    success: successCount > 0,
    configured: successCount,
    total: webhookTypes.length,
    results,
  };
}

/**
 * Check instance status
 * W-API returns different response structures, handle all possibilities
 */
export async function checkStatus(instanceId, token) {
  const encodedInstanceId = encodeURIComponent(instanceId || '');
  const startedAt = Date.now();

  try {
    // W-API uses /instance/status-instance endpoint
    logInfo('wapi.status_check_started', {
      instance_id: instanceId,
    });

    const response = await fetch(
      `${W_API_BASE_URL}/instance/status-instance?instanceId=${encodedInstanceId}`,
      { headers: getHeaders(token) }
    );

    const responseText = await response.text();

    logInfo('wapi.status_check_http', {
      instance_id: instanceId,
      status_code: response.status,
      duration_ms: Date.now() - startedAt,
      body_preview: String(responseText || '').slice(0, 300),
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errData = JSON.parse(responseText);
        errMsg = errData?.message || errData?.error || errMsg;
      } catch {
        // ignore
      }

      logWarn('wapi.status_check_non_ok', {
        instance_id: instanceId,
        status_code: response.status,
        error: errMsg,
      });
      return { status: 'disconnected', error: errMsg };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      logError('wapi.status_check_parse_failed', new Error('Invalid JSON response'), {
        instance_id: instanceId,
        status_code: response.status,
        body_preview: String(responseText || '').slice(0, 500),
      });
      return { status: 'disconnected', error: 'Invalid JSON response' };
    }

    logInfo('wapi.status_check_parsed', {
      instance_id: instanceId,
      keys: Object.keys(data || {}).slice(0, 50),
    });

    const candidates = [
      data,
      data?.data,
      data?.result,
      data?.instance,
      data?.data?.instance,
      data?.result?.instance,
    ].filter(Boolean);

    const normalize = (v) => (typeof v === 'string' ? v.toLowerCase() : v);

    const looksConnected = (obj) => {
      if (!obj) return false;
      if (obj.connected === true || obj.isConnected === true) return true;
      const status = normalize(obj.status);
      const state = normalize(obj.state);
      return (
        status === 'connected' ||
        status === 'open' ||
        status === 'online' ||
        state === 'open' ||
        state === 'connected' ||
        state === 'online'
      );
    };

    const isConnected = candidates.some(looksConnected);

    const pickPhone = (obj) =>
      obj?.phoneNumber ||
      obj?.phone ||
      obj?.number ||
      obj?.wid?.split?.('@')?.[0] ||
      obj?.me?.id?.split?.('@')?.[0] ||
      obj?.me?.user ||
      null;

    let phoneNumber = null;
    for (const c of candidates) {
      phoneNumber = pickPhone(c) || phoneNumber;
    }

    if (isConnected) {
      logInfo('wapi.status_check_connected', {
        instance_id: instanceId,
        has_phone: Boolean(phoneNumber),
      });
      return { status: 'connected', phoneNumber };
    }

    logInfo('wapi.status_check_disconnected', {
      instance_id: instanceId,
      has_phone: Boolean(phoneNumber),
    });
    return { status: 'disconnected', phoneNumber: phoneNumber || undefined };
  } catch (error) {
    logError('wapi.status_check_exception', error, {
      instance_id: instanceId,
      duration_ms: Date.now() - startedAt,
    });
    return { status: 'disconnected', error: error.message };
  }
}

/**
 * Get QR Code for connection
 */
export async function getQRCode(instanceId, token) {
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/instance/qrcode?instanceId=${instanceId}`,
      { headers: getHeaders(token) }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.qrcode || data.base64 || data.qr || null;
  } catch (error) {
    console.error('W-API getQRCode error:', error);
    return null;
  }
}

/**
 * Disconnect/Logout instance
 */
export async function disconnect(instanceId, token) {
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/instance/logout?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('W-API disconnect error:', error);
    return false;
  }
}

/**
 * Send text message
 */
export async function sendText(instanceId, token, phone, message) {
  // For groups (@g.us), keep the full JID; for individuals, clean the phone
  const isGroup = phone.includes('@g.us');
  const cleanPhone = isGroup ? phone : phone.replace(/\D/g, '');
  const at = new Date().toISOString();

  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-text?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: cleanPhone,
          message: message,
        }),
      }
    );

    const { data, text } = await readJsonResponse(response);

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || 'Failed to send message';
      recordSendAttempt({
        at,
        instanceId,
        phone: cleanPhone,
        messageType: 'text',
        success: false,
        status: response.status,
        error: errorMsg,
        preview: text.slice(0, 800),
      });
      return { success: false, error: errorMsg };
    }

    recordSendAttempt({
      at,
      instanceId,
      phone: cleanPhone,
      messageType: 'text',
      success: true,
      status: response.status,
      preview: text.slice(0, 800),
    });

    return {
      success: true,
      messageId: data.messageId || data.id || data.key?.id,
    };
  } catch (error) {
    recordSendAttempt({
      at,
      instanceId,
      phone: cleanPhone,
      messageType: 'text',
      success: false,
      status: 0,
      error: error.message,
      preview: '',
    });

    console.error('W-API sendText error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send image message
 */
export async function sendImage(instanceId, token, phone, imageUrl, caption = '') {
  const isGroup = phone.includes('@g.us');
  const cleanPhone = isGroup ? phone : phone.replace(/\D/g, '');
  
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-image?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: cleanPhone,
          image: imageUrl,
          caption: caption,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to send image',
      };
    }

    return {
      success: true,
      messageId: data.messageId || data.id || data.key?.id,
    };
  } catch (error) {
    console.error('W-API sendImage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send audio message
 */
export async function sendAudio(instanceId, token, phone, audioUrl) {
  const isGroup = phone.includes('@g.us');
  const cleanPhone = isGroup ? phone : phone.replace(/\D/g, '');
  
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-audio?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: cleanPhone,
          audio: audioUrl,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to send audio',
      };
    }

    return {
      success: true,
      messageId: data.messageId || data.id || data.key?.id,
    };
  } catch (error) {
    console.error('W-API sendAudio error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send video message
 */
export async function sendVideo(instanceId, token, phone, videoUrl, caption = '') {
  const isGroup = phone.includes('@g.us');
  const cleanPhone = isGroup ? phone : phone.replace(/\D/g, '');
  
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-video?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: cleanPhone,
          video: videoUrl,
          caption: caption,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to send video',
      };
    }

    return {
      success: true,
      messageId: data.messageId || data.id || data.key?.id,
    };
  } catch (error) {
    console.error('W-API sendVideo error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send document message
 */
export async function sendDocument(instanceId, token, phone, documentUrl, filename = 'document') {
  const isGroup = phone.includes('@g.us');
  const cleanPhone = isGroup ? phone : phone.replace(/\D/g, '');
  
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-document?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: cleanPhone,
          document: documentUrl,
          filename: filename,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to send document',
      };
    }

    return {
      success: true,
      messageId: data.messageId || data.id || data.key?.id,
    };
  } catch (error) {
    console.error('W-API sendDocument error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if number is on WhatsApp
 */
export async function checkNumber(instanceId, token, phone) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    // W-API uses GET /contacts/phone-exists with phoneNumber as query param
    const response = await fetch(
      `${W_API_BASE_URL}/contacts/phone-exists?instanceId=${encodeURIComponent(instanceId)}&phoneNumber=${cleanPhone}`,
      {
        method: 'GET',
        headers: getHeaders(token),
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.exists === true || data.isWhatsApp === true || data.result === true;
  } catch (error) {
    console.error('W-API checkNumber error:', error);
    return false;
  }
}

/**
 * Get all chats from W-API (includes contacts with chat history)
 * Returns an array of chat objects with phone and name
 */
export async function getChats(instanceId, token) {
  const encodedInstanceId = encodeURIComponent(instanceId || '');

  try {
    // W-API uses /chat/get-chats endpoint
    const response = await fetch(
      `${W_API_BASE_URL}/chat/get-chats?instanceId=${encodedInstanceId}`,
      {
        method: 'GET',
        headers: getHeaders(token),
      }
    );

    const responseText = await response.text();
    console.log(
      `[W-API] getChats for ${instanceId}: HTTP ${response.status}, Body length:`,
      responseText.length
    );

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errData = JSON.parse(responseText);
        errMsg = errData?.message || errData?.error || errMsg;
      } catch {
        // ignore
      }
      return { success: false, error: errMsg, chats: [] };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return { success: false, error: 'Invalid JSON response', chats: [] };
    }

    // W-API response can be in different formats
    // data might be an array directly, or { data: [...] }, or { result: [...] }, or { chats: [...] }
    const chatsArray = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.result)
          ? data.result
          : Array.isArray(data?.chats)
            ? data.chats
            : [];

    console.log(`[W-API] Found ${chatsArray.length} chats`);

    // Parse and normalize the chats
    const contacts = [];
    for (const chat of chatsArray) {
      // Skip groups
      const jid = chat.jid || chat.id || chat.remoteJid || chat.from || chat.phone || '';
      if (jid.includes('@g.us')) continue;

      // Extract phone number from JID
      let phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
      if (!phone) continue;

      // Get name (various possible fields)
      const name =
        chat.name ||
        chat.pushName ||
        chat.notify ||
        chat.verifiedName ||
        chat.formattedName ||
        chat.displayName ||
        chat.contact?.name ||
        chat.contact?.pushName ||
        '';

      // Get profile picture if available
      const profilePicture =
        chat.profilePicture ||
        chat.profilePictureUrl ||
        chat.imgUrl ||
        chat.picture ||
        chat.contact?.profilePictureUrl ||
        null;

      contacts.push({
        phone,
        name: name || phone,
        jid,
        profilePicture,
      });
    }

    console.log(`[W-API] Parsed ${contacts.length} individual contacts from chats`);

    return {
      success: true,
      contacts,
      total: contacts.length,
    };
  } catch (error) {
    console.error('[W-API] getChats error:', error);
    return { success: false, error: error.message, chats: [] };
  }
}

/**
 * Generic message sender that routes to the correct method based on type
 */
export async function sendMessage(instanceId, token, phone, content, messageType, mediaUrl) {
  switch (messageType) {
    case 'text':
      return sendText(instanceId, token, phone, content);
    case 'image':
      return sendImage(instanceId, token, phone, mediaUrl, content);
    case 'audio':
      return sendAudio(instanceId, token, phone, mediaUrl);
    case 'video':
      return sendVideo(instanceId, token, phone, mediaUrl, content);
    case 'document':
      return sendDocument(instanceId, token, phone, mediaUrl, content || 'document');
    default:
      return sendText(instanceId, token, phone, content);
  }
}

/**
 * Download media from W-API using messageId
 * This is needed because WhatsApp CDN URLs (mmg.whatsapp.net) require authentication.
 *
 * NOTE: W-API responses vary by version; this function tries a couple of shapes.
 */
export async function downloadMedia(instanceId, token, messageId) {
  const encodedInstanceId = encodeURIComponent(instanceId || '');
  const encodedMessageId = encodeURIComponent(messageId || '');

  const attempts = [
    {
      label: 'GET messageId',
      url: `${W_API_BASE_URL}/message/download-media?instanceId=${encodedInstanceId}&messageId=${encodedMessageId}`,
      method: 'GET',
    },
    {
      label: 'GET id',
      url: `${W_API_BASE_URL}/message/download-media?instanceId=${encodedInstanceId}&id=${encodedMessageId}`,
      method: 'GET',
    },
    {
      label: 'POST {messageId}',
      url: `${W_API_BASE_URL}/message/download-media?instanceId=${encodedInstanceId}`,
      method: 'POST',
      body: { messageId },
    },
  ];

  const normalizeJson = (data) => {
    if (!data || typeof data !== 'object') return null;

    // Some W-API versions wrap the payload in { data: {...} } or { result: {...} }
    const roots = [data, data?.data, data?.result].filter((v) => v && typeof v === 'object');

    const visit = (obj, depth, cb) => {
      if (!obj || typeof obj !== 'object' || depth > 4) return;
      cb(obj);
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') visit(v, depth + 1, cb);
      }
    };

    const pickFirstStringDeep = (keys) => {
      for (const r of roots) {
        let found = null;
        visit(r, 0, (o) => {
          if (found) return;
          for (const k of keys) {
            const v = o?.[k];
            if (typeof v === 'string' && v.trim()) {
              found = v.trim();
              return;
            }
          }
        });
        if (found) return found;
      }
      return null;
    };

    const mimetype =
      pickFirstStringDeep(['mimetype', 'mimeType', 'type', 'contentType']) ||
      null;

    // base64 can be nested and/or come without data: prefix
    const base64Raw = pickFirstStringDeep([
      'base64',
      'b64',
      'fileBase64',
      'mediaBase64',
      'data',
      'file',
      'buffer',
      'content',
    ]);

    if (base64Raw) {
      const b = base64Raw.trim();
      const b64 = b.startsWith('data:')
        ? b
        : `data:${mimetype || 'application/octet-stream'};base64,${b}`;
      return { success: true, base64: b64, mimetype: mimetype || undefined };
    }

    const url = pickFirstStringDeep(['url', 'mediaUrl', 'fileUrl', 'downloadUrl', 'link']);
    if (url) {
      return { success: true, url: url.trim(), mimetype: mimetype || undefined };
    }

    return null;
  };

  for (const a of attempts) {
    try {
      console.log('[W-API] downloadMedia attempt:', a.label, 'messageId:', messageId);

      const response = await fetch(a.url, {
        method: a.method,
        headers: {
          ...getHeaders(token),
          ...(a.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: a.method === 'POST' ? JSON.stringify(a.body || {}) : undefined,
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[W-API] Download media failed:', a.label, response.status, errorText.slice(0, 300));
        continue;
      }

      // JSON response (may contain base64/url)
      if (contentType.includes('application/json')) {
        const data = await response.json().catch(() => null);
        const normalized = normalizeJson(data);
        if (normalized) return normalized;
        return { success: false, error: 'No media data in JSON response' };
      }

      // Binary response
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimetype = contentType.split(';')[0].trim() || 'application/octet-stream';

      console.log('[W-API] Downloaded media successfully, size:', buffer.byteLength, 'type:', mimetype);

      return {
        success: true,
        base64: `data:${mimetype};base64,${base64}`,
        mimetype,
      };
    } catch (error) {
      console.error('[W-API] downloadMedia attempt error:', a.label, error?.message || error);
      // try next
    }
  }

  return { success: false, error: 'All downloadMedia attempts failed' };
}
