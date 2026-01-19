// W-API Provider - Backend implementation
// https://api.w-api.app/v1/

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
  
  console.log(`[W-API] Configuring webhooks for instance ${instanceId} -> ${webhookUrl}`);
  
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
        console.log(`[W-API] Webhook ${wh.name} configured successfully`);
      } else {
        console.log(`[W-API] Webhook ${wh.name} failed:`, response.status, data);
      }
    } catch (error) {
      console.error(`[W-API] Error configuring webhook ${wh.name}:`, error.message);
      results.push({ type: wh.name, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
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

  try {
    // W-API uses /instance/status-instance endpoint
    const response = await fetch(
      `${W_API_BASE_URL}/instance/status-instance?instanceId=${encodedInstanceId}`,
      { headers: getHeaders(token) }
    );

    const responseText = await response.text();
    console.log(
      `[W-API] Status check for ${instanceId}: HTTP ${response.status}, Body:`,
      responseText.slice(0, 800)
    );

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errData = JSON.parse(responseText);
        errMsg = errData?.message || errData?.error || errMsg;
      } catch {
        // ignore
      }
      return { status: 'disconnected', error: errMsg };
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return { status: 'disconnected', error: 'Invalid JSON response' };
    }

    console.log('[W-API] Parsed status data:', JSON.stringify(data));

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
      console.log('[W-API] Instance is CONNECTED, phone:', phoneNumber);
      return { status: 'connected', phoneNumber };
    }

    console.log('[W-API] Instance is DISCONNECTED');
    return { status: 'disconnected', phoneNumber: phoneNumber || undefined };
  } catch (error) {
    console.error('[W-API] checkStatus error:', error);
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
  const cleanPhone = phone.replace(/\D/g, '');
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
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-image?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
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
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-audio?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
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
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-video?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
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
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-document?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
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
