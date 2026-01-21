// Unified WhatsApp Provider
// Routes requests to the correct provider (Evolution API or W-API)

import * as wapiProvider from './wapi-provider.js';
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

  if (provider === 'wapi') {
    return wapiProvider.sendMessage(
      connection.instance_id,
      connection.wapi_token,
      phone,
      content,
      messageType,
      mediaUrl
    );
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
