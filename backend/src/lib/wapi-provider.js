// W-API Provider - Backend implementation
// https://api.w-api.app/v1/

import { logError, logInfo, logWarn } from '../logger.js';
import http from 'http';
import https from 'https';

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
 * Verify that a media URL is accessible (HEAD request with timeout)
 * Returns { accessible: true, contentType, contentLength } or { accessible: false, error }
 */
async function verifyMediaUrl(url, timeoutMs = 8000) {
  if (!url || typeof url !== 'string') {
    return { accessible: false, error: 'URL vazia ou inválida' };
  }

  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https://') ? https : http;
      const req = client.request(
        url,
        { method: 'HEAD', timeout: timeoutMs },
        (res) => {
          const status = res.statusCode || 0;
          const contentType = res.headers['content-type'] || '';
          const contentLength = parseInt(res.headers['content-length'] || '0', 10);

          if (status >= 200 && status < 400) {
            // Check if it's HTML (error page) instead of actual file
            if (contentType.includes('text/html')) {
              resolve({
                accessible: false,
                error: `URL retorna HTML ao invés do arquivo (status ${status}). Verifique se a URL é pública.`,
                status,
                contentType,
              });
            } else {
              resolve({ accessible: true, contentType, contentLength, status });
            }
          } else {
            resolve({
              accessible: false,
              error: `URL não acessível (HTTP ${status})`,
              status,
              contentType,
            });
          }
        }
      );

      req.on('error', (err) => {
        resolve({ accessible: false, error: `Erro de conexão: ${err.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ accessible: false, error: `Timeout ao acessar URL (${timeoutMs}ms)` });
      });

      req.end();
    } catch (err) {
      resolve({ accessible: false, error: `Exceção: ${err.message}` });
    }
  });
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

  // Quick validation
  if (!instanceId || !token) {
    return { status: 'disconnected', error: 'Instance ID ou Token não configurado' };
  }

  try {
    const response = await fetch(
      `${W_API_BASE_URL}/instance/status-instance?instanceId=${encodedInstanceId}`,
      { 
        headers: getHeaders(token),
        signal: AbortSignal.timeout(10000), // 10s timeout
      }
    );

    const responseText = await response.text();
    const durationMs = Date.now() - startedAt;

    // Only log if slow or error
    if (durationMs > 3000 || !response.ok) {
      logInfo('wapi.status_check', {
        instance_id: instanceId,
        status_code: response.status,
        duration_ms: durationMs,
        ok: response.ok,
      });
    }

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

    // Remove verbose logging for successful parses

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
      return { status: 'connected', phoneNumber };
    }

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
  const at = new Date().toISOString();

  const sanitizeFilenameBase = (name) => {
    const raw = String(name || 'document');
    // Remove any path fragments just in case
    const base = raw.split('/').pop().split('\\').pop();
    // Replace problematic chars; keep letters, numbers, dot, dash, underscore
    const cleaned = base
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_\.]+|[_\.]+$/g, '');
    // Prevent empty / very long names
    return (cleaned || 'document').slice(0, 80);
  };

  // Ensure filename has an extension (W-API requires it)
  const ensureExtension = (fname, url) => {
    const safeBase = sanitizeFilenameBase(fname);

    // If filename already has extension, keep it (but sanitize base)
    const hasExt = /\.[a-z0-9]{2,10}$/i.test(String(fname || ''));
    if (hasExt) {
      const ext = String(fname).match(/\.([a-z0-9]{2,10})$/i)?.[1] || 'pdf';
      return `${safeBase.replace(/\.[a-z0-9]{2,10}$/i, '')}.${ext}`;
    }

    // Try to extract extension from URL
    try {
      const urlPath = new URL(url).pathname;
      const match = urlPath.match(/\.([a-z0-9]{2,10})$/i);
      if (match) {
        const ext = match[1];
        return `${safeBase}.${ext}`;
      }
    } catch (e) {
      // URL parsing failed, fallback below
    }

    // Last resort: use mimetype from URL check or default to .pdf
    return `${safeBase}.pdf`;
  };

  const filenameWithExt = ensureExtension(filename, documentUrl);

  // Some W-API installations validate the *URL* extension (not just the filename).
  // If we have a URL without an extension (common when original uploads had no ext),
  // serve it through our public download route that includes the desired filename.
  let effectiveDocumentUrl = documentUrl;
  try {
    const u = new URL(documentUrl);
    const pathHasExt = /\.[a-z0-9]{2,10}$/i.test(u.pathname);
    if (!pathHasExt && u.pathname.startsWith('/uploads/')) {
      const stored = u.pathname.split('/').pop();
      if (stored) {
        effectiveDocumentUrl = `${u.origin}/api/uploads/public/${encodeURIComponent(stored)}/${encodeURIComponent(filenameWithExt)}`;
      }
    }
  } catch {
    // keep original
  }

  logInfo('wapi.send_document_started', {
    instance_id: instanceId,
    phone_preview: cleanPhone.substring(0, 15),
    document_url_preview: documentUrl ? documentUrl.substring(0, 100) : null,
    effective_document_url_preview: effectiveDocumentUrl ? effectiveDocumentUrl.substring(0, 100) : null,
    filename: filenameWithExt,
  });

  // Pre-check: verify URL is accessible before sending to W-API
  const urlCheck = await verifyMediaUrl(effectiveDocumentUrl, 10000);
  if (!urlCheck.accessible) {
    const errorMsg = `URL do arquivo não acessível: ${urlCheck.error}`;
    logError('wapi.send_document_url_check_failed', new Error(errorMsg), {
      instance_id: instanceId,
      document_url_preview: effectiveDocumentUrl ? effectiveDocumentUrl.substring(0, 200) : null,
      url_check_result: urlCheck,
    });

    recordSendAttempt({
      at,
      instanceId,
      phone: cleanPhone,
      messageType: 'document',
      success: false,
      status: 0,
      error: errorMsg,
      preview: JSON.stringify(urlCheck).slice(0, 800),
    });

    return { success: false, error: errorMsg };
  }

  logInfo('wapi.send_document_url_verified', {
    instance_id: instanceId,
    content_type: urlCheck.contentType,
    content_length: urlCheck.contentLength,
  });
  
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-document?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: cleanPhone,
          document: effectiveDocumentUrl,
          filename: filenameWithExt,
          // Some W-API installations/docs use camelCase
          fileName: filenameWithExt,
        }),
      }
    );

    const { data, text } = await readJsonResponse(response);

    logInfo('wapi.send_document_response', {
      instance_id: instanceId,
      status_code: response.status,
      ok: response.ok,
      response_preview: text.substring(0, 800),
    });

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || 'Failed to send document';
      recordSendAttempt({
        at,
        instanceId,
        phone: cleanPhone,
        messageType: 'document',
        success: false,
        status: response.status,
        error: errorMsg,
        preview: text.slice(0, 800),
      });

      logError('wapi.send_document_failed', new Error(errorMsg), {
        instance_id: instanceId,
        status_code: response.status,
      });

      return { success: false, error: errorMsg };
    }

    recordSendAttempt({
      at,
      instanceId,
      phone: cleanPhone,
      messageType: 'document',
      success: true,
      status: response.status,
      preview: text.slice(0, 800),
    });

    logInfo('wapi.send_document_success', {
      instance_id: instanceId,
      message_id: data.messageId || data.id || data.key?.id || null,
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
      messageType: 'document',
      success: false,
      status: 0,
      error: error.message,
      preview: '',
    });

    logError('wapi.send_document_exception', error, {
      instance_id: instanceId,
    });

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
 * Get group info/metadata from W-API
 * Returns group name, participants, etc.
 */
export async function getGroupInfo(instanceId, token, groupJid) {
  const encodedInstanceId = encodeURIComponent(instanceId || '');
  const groupIdWithoutSuffix = groupJid?.replace('@g.us', '') || '';
  const fullGroupJid = groupJid?.includes('@g.us') ? groupJid : `${groupJid}@g.us`;

  try {
    // Try the correct W-API endpoint first: /group/group-metadata
    const endpoints = [
      // Primary endpoint (from W-API docs)
      { method: 'GET', url: `${W_API_BASE_URL}/group/group-metadata?instanceId=${encodedInstanceId}&groupId=${encodeURIComponent(fullGroupJid)}` },
      { method: 'GET', url: `${W_API_BASE_URL}/group/group-metadata?instanceId=${encodedInstanceId}&groupId=${encodeURIComponent(groupIdWithoutSuffix)}` },
      // Fallback endpoints
      { method: 'GET', url: `${W_API_BASE_URL}/group/metadata?instanceId=${encodedInstanceId}&groupId=${encodeURIComponent(fullGroupJid)}` },
      { method: 'GET', url: `${W_API_BASE_URL}/group/metadata?instanceId=${encodedInstanceId}&groupId=${encodeURIComponent(groupIdWithoutSuffix)}` },
      { method: 'GET', url: `${W_API_BASE_URL}/group/get-group?instanceId=${encodedInstanceId}&groupId=${encodeURIComponent(fullGroupJid)}` },
      { method: 'GET', url: `${W_API_BASE_URL}/group/info?instanceId=${encodedInstanceId}&groupId=${encodeURIComponent(groupIdWithoutSuffix)}` },
    ];

    for (const endpoint of endpoints) {
      try {
        console.log('[W-API] Trying group info:', endpoint.url);
        
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: getHeaders(token),
        });

        console.log('[W-API] Response status:', response.status);
        if (!response.ok) continue;

        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          console.log('[W-API] Non-JSON response:', responseText.substring(0, 100));
          continue;
        }
        
        console.log('[W-API] Group metadata response:', JSON.stringify(data).substring(0, 500));
        
        // Extract group name from various possible response formats
        const groupName = data?.subject || data?.name || data?.groupName || data?.title ||
                         data?.pushName || data?.displayName ||
                         data?.data?.subject || data?.data?.name || data?.data?.groupName ||
                         data?.result?.subject || data?.result?.name || data?.result?.groupName ||
                         data?.response?.subject || data?.response?.name ||
                         data?.group?.subject || data?.group?.name || null;

        if (groupName) {
          console.log('[W-API] Got group name for', groupJid, ':', groupName);
          return {
            success: true,
            name: groupName,
            subject: groupName,
            participants: data?.participants || data?.data?.participants || data?.result?.participants || [],
          };
        }
      } catch (e) {
        console.log('[W-API] Endpoint error:', e.message);
      }
    }

    console.log('[W-API] Could not fetch group info for:', groupJid);
    return { success: false, error: 'Could not fetch group info' };
  } catch (error) {
    console.error('W-API getGroupInfo error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all groups from W-API
 * Returns an array of group objects with jid and name
 */
export async function getGroups(instanceId, token) {
  const encodedInstanceId = encodeURIComponent(instanceId || '');

  try {
    // Try different endpoints to get groups (primary endpoint from W-API docs)
    const endpoints = [
      `${W_API_BASE_URL}/group/fetch-all-groups?instanceId=${encodedInstanceId}`,
      `${W_API_BASE_URL}/group/list-groups?instanceId=${encodedInstanceId}`,
      `${W_API_BASE_URL}/group/get-groups?instanceId=${encodedInstanceId}`,
      `${W_API_BASE_URL}/group/list?instanceId=${encodedInstanceId}`,
      `${W_API_BASE_URL}/group/all?instanceId=${encodedInstanceId}`,
    ];

    for (const url of endpoints) {
      try {
        console.log('[W-API] Trying getGroups endpoint:', url);
        const response = await fetch(url, {
          method: 'GET',
          headers: getHeaders(token),
        });

        console.log('[W-API] getGroups response status:', response.status);
        if (!response.ok) continue;

        const responseText = await response.text();
        console.log('[W-API] getGroups raw response:', responseText.substring(0, 500));
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          continue;
        }

        // Parse response - could be array or wrapped
        const groupsArray = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.result)
              ? data.result
              : Array.isArray(data?.groups)
                ? data.groups
                : Array.isArray(data?.response)
                  ? data.response
                  : [];

        console.log('[W-API] Parsed groups array length:', groupsArray.length);
        if (groupsArray.length > 0) {
          console.log('[W-API] Sample group:', JSON.stringify(groupsArray[0]).substring(0, 300));
        }

        if (groupsArray.length > 0) {
          console.log(`[W-API] Found ${groupsArray.length} groups via ${url}`);
          
          // Normalize group data - try all possible name fields
          const groups = groupsArray.map(g => ({
            jid: g.jid || g.id || g.groupId || g.remoteJid || '',
            name: g.subject || g.name || g.groupName || g.title || g.pushName || g.displayName || '',
            participants: g.participants?.length || g.size || 0,
          })).filter(g => g.jid && g.jid.includes('@g.us'));

          console.log(`[W-API] Normalized ${groups.length} groups with JIDs`);
          if (groups.length > 0) {
            console.log('[W-API] Sample normalized group:', JSON.stringify(groups[0]));
          }

          return { success: true, groups };
        }
      } catch (e) {
        console.log('[W-API] getGroups endpoint error:', e.message);
        // Continue to next endpoint
      }
    }

    // Fallback: try to get groups from chat list
    const chatsResponse = await fetch(
      `${W_API_BASE_URL}/chat/get-chats?instanceId=${encodedInstanceId}`,
      {
        method: 'GET',
        headers: getHeaders(token),
      }
    );

    if (chatsResponse.ok) {
      const chatsData = await chatsResponse.json();
      const chatsArray = Array.isArray(chatsData)
        ? chatsData
        : Array.isArray(chatsData?.data)
          ? chatsData.data
          : Array.isArray(chatsData?.result)
            ? chatsData.result
            : [];

      const groups = chatsArray
        .filter(c => {
          const jid = c.jid || c.id || c.remoteJid || '';
          return jid.includes('@g.us');
        })
        .map(g => ({
          jid: g.jid || g.id || g.remoteJid || '',
          name: g.name || g.subject || g.groupName || g.title || '',
          participants: g.participants?.length || 0,
        }));

      if (groups.length > 0) {
        console.log(`[W-API] Found ${groups.length} groups from chat list`);
        return { success: true, groups };
      }
    }

    return { success: false, error: 'Could not fetch groups', groups: [] };
  } catch (error) {
    console.error('W-API getGroups error:', error);
    return { success: false, error: error.message, groups: [] };
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
