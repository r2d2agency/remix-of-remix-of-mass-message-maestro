// Unified WhatsApp Provider
// Routes requests to the correct provider (Evolution API or W-API)

import * as wapiProvider from './wapi-provider.js';
import * as uazapiProvider from './uazapi-provider.js';
import { logError, logInfo, logWarn } from '../logger.js';

/**
 * Detect provider from connection data
 */
export function detectProvider(connection) {
  if (connection.provider) {
    return connection.provider;
  }
  
  // If has instance_id and wapi_token, it's W-API
  if (connection.instance_id && connection.wapi_token) {
    return 'wapi';
  }

  // If has uazapi_url, it's UAZAPI
  if (connection.uazapi_server_url || connection.provider === 'uazapi') {
    return 'uazapi';
  }
  
  // Default to Evolution
  return 'evolution';
}

/**
 * Check connection status
 */
export async function checkStatus(connection) {
  const provider = detectProvider(connection);

  if (provider === 'wapi') {
    return wapiProvider.checkStatus(connection.instance_id, connection.wapi_token);
  }

  if (provider === 'uazapi') {
    return uazapiProvider.getStatus({
      serverUrl: connection.uazapi_server_url,
      token: connection.uazapi_token,
    });
  }

  // Evolution API
  try {
    const startedAt = Date.now();
    logInfo('evolution.status_check_started', {
      connection_id: connection.id,
      instance_name: connection.instance_name,
    });

    const response = await fetch(
      `${connection.api_url}/instance/connectionState/${connection.instance_name}`,
      {
        headers: { apikey: connection.api_key },
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logWarn('evolution.status_check_non_ok', {
        connection_id: connection.id,
        instance_name: connection.instance_name,
        status_code: response.status,
        duration_ms: Date.now() - startedAt,
        body_preview: String(text || '').slice(0, 300),
      });
      return { status: 'disconnected', error: `Failed to check status (HTTP ${response.status})` };
    }

    const text = await response.text().catch(() => '');
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      logError('evolution.status_check_parse_failed', e, {
        connection_id: connection.id,
        instance_name: connection.instance_name,
        duration_ms: Date.now() - startedAt,
        body_preview: String(text || '').slice(0, 500),
      });
      return { status: 'disconnected', error: 'Invalid JSON response' };
    }

    if (data.instance?.state === 'open') {
      logInfo('evolution.status_check_connected', {
        connection_id: connection.id,
        instance_name: connection.instance_name,
        duration_ms: Date.now() - startedAt,
        has_phone: Boolean(data.instance?.phoneNumber),
      });
      return {
        status: 'connected',
        phoneNumber: data.instance?.phoneNumber,
      };
    }

    logInfo('evolution.status_check_disconnected', {
      connection_id: connection.id,
      instance_name: connection.instance_name,
      duration_ms: Date.now() - startedAt,
    });
    return { status: 'disconnected' };
  } catch (error) {
    logError('evolution.status_check_exception', error, {
      connection_id: connection.id,
      instance_name: connection.instance_name,
    });
    return { status: 'disconnected', error: error.message };
  }
}

/**
 * Get QR Code
 */
export async function getQRCode(connection) {
  const provider = detectProvider(connection);

  if (provider === 'wapi') {
    return wapiProvider.getQRCode(connection.instance_id, connection.wapi_token);
  }

  if (provider === 'uazapi') {
    const res = await uazapiProvider.connect({
      serverUrl: connection.uazapi_server_url,
      token: connection.uazapi_token,
    });
    return res.qrcode;
  }

  // Evolution API
  try {
    const response = await fetch(
      `${connection.api_url}/instance/connect/${connection.instance_name}`,
      {
        headers: { apikey: connection.api_key },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.base64 || data.qrcode?.base64 || null;
  } catch (error) {
    console.error('Evolution getQRCode error:', error);
    return null;
  }
}

/**
 * Disconnect/Logout
 */
export async function disconnect(connection) {
  const provider = detectProvider(connection);

  if (provider === 'wapi') {
    return wapiProvider.disconnect(connection.instance_id, connection.wapi_token);
  }

  if (provider === 'uazapi') {
    const res = await uazapiProvider.disconnect({
      serverUrl: connection.uazapi_server_url,
      token: connection.uazapi_token,
    });
    return res.success;
  }

  // Evolution API
  try {
    const response = await fetch(
      `${connection.api_url}/instance/logout/${connection.instance_name}`,
      {
        method: 'DELETE',
        headers: { apikey: connection.api_key },
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Evolution disconnect error:', error);
    return false;
  }
}

/**
 * Send message (unified)
 */
export async function sendMessage(connection, phone, content, messageType, mediaUrl) {
  const provider = detectProvider(connection);
  const startedAt = Date.now();

  logInfo('whatsapp.send_message_started', {
    connection_id: connection.id,
    provider,
    message_type: messageType,
    has_media_url: Boolean(mediaUrl),
    has_content: Boolean(content),
    phone_preview: phone ? String(phone).substring(0, 15) : null,
  });

  if (provider === 'wapi') {
    try {
      const result = await wapiProvider.sendMessage(
        connection.instance_id,
        connection.wapi_token,
        phone,
        content,
        messageType,
        mediaUrl
      );

      logInfo('whatsapp.send_message_wapi_result', {
        connection_id: connection.id,
        success: result.success,
        error: result.error || null,
        duration_ms: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      logError('whatsapp.send_message_wapi_exception', error, {
        connection_id: connection.id,
        duration_ms: Date.now() - startedAt,
      });
      return { success: false, error: error.message };
    }
  }

  if (provider === 'uazapi') {
    try {
      let result;
      const params = {
        serverUrl: connection.uazapi_server_url,
        token: connection.uazapi_token,
        phone,
      };

      if (messageType === 'text') {
        result = await uazapiProvider.sendText({ ...params, text: content });
      } else if (messageType === 'audio') {
        result = await uazapiProvider.sendAudio({ ...params, fileUrl: mediaUrl, ptt: true });
      } else if (messageType === 'image') {
        result = await uazapiProvider.sendImage({ ...params, fileUrl: mediaUrl, caption: content });
      } else if (messageType === 'video') {
        result = await uazapiProvider.sendVideo({ ...params, fileUrl: mediaUrl, caption: content });
      } else {
        result = await uazapiProvider.sendDocument({ ...params, fileUrl: mediaUrl, filename: 'Document' });
      }

      logInfo('whatsapp.send_message_uazapi_result', {
        connection_id: connection.id,
        success: result.ok,
        status: result.status,
        duration_ms: Date.now() - startedAt,
      });

      return {
        success: result.ok,
        messageId: result.data?.key?.id || result.data?.id || result.data?.messageId,
        error: result.ok ? null : (result.data?.error || `HTTP ${result.status}`),
      };
    } catch (error) {
      logError('whatsapp.send_message_uazapi_exception', error, {
        connection_id: connection.id,
        duration_ms: Date.now() - startedAt,
      });
      return { success: false, error: error.message };
    }
  }

  // Evolution API
  try {
    let endpoint;
    let body;

    if (messageType === 'text') {
      endpoint = `/message/sendText/${connection.instance_name}`;
      body = {
        number: phone,
        text: content,
      };
    } else if (messageType === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${connection.instance_name}`;
      body = {
        number: phone,
        audio: mediaUrl,
        delay: 1200,
      };
    } else {
      // image, video, document
      endpoint = `/message/sendMedia/${connection.instance_name}`;
      body = {
        number: phone,
        mediatype: messageType,
        media: mediaUrl,
      };
      if (content) {
        body.caption = content;
      }
    }

    const response = await fetch(`${connection.api_url}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: connection.api_key,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || 'Failed to send message',
      };
    }

    const result = await response.json();
    return { success: true, messageId: result.key?.id };
  } catch (error) {
    console.error('Evolution sendMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if number is on WhatsApp
 */
export async function checkNumber(connection, phone) {
  const provider = detectProvider(connection);

  if (provider === 'wapi') {
    return wapiProvider.checkNumber(connection.instance_id, connection.wapi_token, phone);
  }

  if (provider === 'uazapi') {
    const res = await uazapiProvider.checkNumber({
      serverUrl: connection.uazapi_server_url,
      token: connection.uazapi_token,
      phones: [phone],
    });
    return res.results?.[0]?.exists === true;
  }

  // Evolution API
  try {
    const response = await fetch(
      `${connection.api_url}/chat/whatsappNumbers/${connection.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: connection.api_key,
        },
        body: JSON.stringify({
          numbers: [phone],
        }),
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data?.[0]?.exists === true;
  } catch (error) {
    console.error('Evolution checkNumber error:', error);
    return false;
  }
}
