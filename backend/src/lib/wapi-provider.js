// W-API Provider - Backend implementation
// https://api.w-api.app/v1/

const W_API_BASE_URL = 'https://api.w-api.app/v1';
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.API_BASE_URL || 'https://whastsale-backend.exf0ty.easypanel.host';

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
  try {
    const response = await fetch(
      `${W_API_BASE_URL}/message/send-text?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
          message: message,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to send message',
      };
    }

    return {
      success: true,
      messageId: data.messageId || data.id || data.key?.id,
    };
  } catch (error) {
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
