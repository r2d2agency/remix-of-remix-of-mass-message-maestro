import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const API_BASE_URL = process.env.API_BASE_URL || 'https://whastsale-backend.exf0ty.easypanel.host';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Download media from Evolution API and save locally
async function downloadAndSaveMedia(connection, messageObj, messageType) {
  try {
    const messageId = messageObj?.key?.id || messageObj?.message?.key?.id;
    if (!messageId) {
      console.log('downloadAndSaveMedia: missing messageId');
      return null;
    }

    console.log('Downloading media for message:', messageId, 'type:', messageType);

    // Send the full message object when available (Evolution usually needs remoteJid + other fields)
    const payload = {
      message: messageObj?.message ? messageObj : { key: messageObj?.key, message: messageObj?.message },
      convertToMp4: messageType === 'video',
    };

    const mediaResponse = await fetch(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${connection.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!mediaResponse.ok) {
      const text = await mediaResponse.text().catch(() => '');
      console.error('Failed to get media from Evolution:', mediaResponse.status, text);
      return null;
    }

    const mediaData = await mediaResponse.json().catch(() => null);
    const rawBase64 =
      mediaData?.base64 ||
      mediaData?.data ||
      mediaData?.base64Data ||
      null;

    if (!rawBase64 || typeof rawBase64 !== 'string') {
      console.log('No base64 data in response');
      return null;
    }

    // Some responses come as data URL: "data:audio/ogg;base64,AAAA..."
    let base64 = rawBase64.trim();
    const dataUrlIdx = base64.indexOf('base64,');
    if (base64.startsWith('data:') && dataUrlIdx !== -1) {
      base64 = base64.slice(dataUrlIdx + 'base64,'.length);
    }
    base64 = base64.replace(/\s/g, '');

    const rawMimetype = (mediaData?.mimetype || mediaData?.mimeType || mediaData?.type || 'application/octet-stream');
    const mimetype = String(rawMimetype).toLowerCase();

    // Determine file extension based on mimetype
    let ext = '.bin';
    if (mimetype.includes('image/jpeg') || mimetype.includes('image/jpg')) ext = '.jpg';
    else if (mimetype.includes('image/png')) ext = '.png';
    else if (mimetype.includes('image/gif')) ext = '.gif';
    else if (mimetype.includes('image/webp')) ext = '.webp';
    else if (mimetype.includes('audio/ogg')) ext = '.ogg';
    else if (mimetype.includes('audio/mpeg') || mimetype.includes('audio/mp3')) ext = '.mp3';
    else if (mimetype.includes('audio/mp4') || mimetype.includes('audio/m4a')) ext = '.m4a';
    else if (mimetype.includes('audio/')) ext = '.ogg';
    else if (mimetype.includes('video/mp4')) ext = '.mp4';
    else if (mimetype.includes('video/webm')) ext = '.webm';
    else if (mimetype.includes('video/')) ext = '.mp4';
    else if (mimetype.includes('application/pdf')) ext = '.pdf';

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    console.log('Media saved:', filename, 'size:', buffer.length, 'mimetype:', mimetype);

    return {
      url: `${API_BASE_URL}/uploads/${filename}`,
      mimetype,
    };
  } catch (error) {
    console.error('Error downloading media:', error.message);
    return null;
  }
}

// Helper to make Evolution API requests
async function evolutionRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${EVOLUTION_API_URL}${endpoint}`, options);
  
  if (!response.ok) {
    const text = await response.text();
    console.error('Evolution API error:', response.status, text);
    throw new Error(`Evolution API error: ${response.status}`);
  }

  return response.json();
}

// Generate unique instance name
function generateInstanceName(orgId, oddsStr) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `ws_${(orgId || oddsStr || 'default').substring(0, 8)}_${timestamp}${random}`;
}

// Check plan limits for connections
async function checkConnectionLimit(userId, organizationId) {
  if (organizationId) {
    // Check organization's plan limits
    const result = await query(
      `SELECT 
         p.max_connections,
         p.name as plan_name,
         (SELECT COUNT(*) FROM connections WHERE organization_id = o.id) as current_connections
       FROM organizations o
       LEFT JOIN plans p ON p.id = o.plan_id
       WHERE o.id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Organização não encontrada');
    }

    const { max_connections, current_connections, plan_name } = result.rows[0];
    const limit = max_connections || 1;
    
    if (current_connections >= limit) {
      throw new Error(`Limite de conexões atingido (${current_connections}/${limit}). Plano: ${plan_name || 'Sem plano'}. Faça upgrade.`);
    }

    return { allowed: true, current: current_connections, limit };
  } else {
    // Fallback: check user's own connections (for users without organization)
    const result = await query(
      `SELECT COUNT(*) as current_connections FROM connections WHERE user_id = $1`,
      [userId]
    );

    const currentConnections = parseInt(result.rows[0].current_connections) || 0;
    const defaultLimit = 1; // Default limit for users without organization

    if (currentConnections >= defaultLimit) {
      throw new Error(`Limite de conexões atingido (${currentConnections}/${defaultLimit}). Associe-se a uma organização.`);
    }

    return { allowed: true, current: currentConnections, limit: defaultLimit };
  }
}

// Get plan limits for connections
router.get('/limits', authenticate, async (req, res) => {
  try {
    // Get user's organization
    const orgResult = await query(
      `SELECT om.organization_id 
       FROM organization_members om 
       WHERE om.user_id = $1 
       LIMIT 1`,
      [req.userId]
    );

    if (orgResult.rows.length === 0) {
      return res.json({
        max_connections: 1,
        current_connections: 0,
        plan_name: 'Sem organização'
      });
    }

    const organizationId = orgResult.rows[0].organization_id;

    // Get plan limits
    const limitsResult = await query(
      `SELECT 
         p.max_connections,
         p.name as plan_name,
         (SELECT COUNT(*) FROM connections WHERE organization_id = o.id) as current_connections
       FROM organizations o
       LEFT JOIN plans p ON p.id = o.plan_id
       WHERE o.id = $1`,
      [organizationId]
    );

    if (limitsResult.rows.length === 0) {
      return res.json({
        max_connections: 1,
        current_connections: 0,
        plan_name: 'Organização não encontrada'
      });
    }

    const { max_connections, current_connections, plan_name } = limitsResult.rows[0];

    res.json({
      max_connections: max_connections || 1,
      current_connections: parseInt(current_connections) || 0,
      plan_name: plan_name || 'Sem plano'
    });
  } catch (error) {
    console.error('Get limits error:', error);
    res.status(500).json({ error: 'Erro ao buscar limites' });
  }
});

// Webhook URL base - should be configured via environment variable
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || process.env.BACKEND_URL;

// Configure webhook for an instance
async function configureInstanceWebhook(instanceName, webhookUrl) {
  try {
    const webhookConfig = {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: true,
      events: [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_SET',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONTACTS_SET',
        'CONTACTS_UPSERT',
        'CONTACTS_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_SET',
        'CHATS_UPSERT',
        'CHATS_UPDATE',
        'CHATS_DELETE',
        'GROUPS_UPSERT',
        'GROUPS_UPDATE',
        'GROUP_PARTICIPANTS_UPDATE',
        'CONNECTION_UPDATE',
        'CALL',
        'LABELS_EDIT',
        'LABELS_ASSOCIATION'
      ]
    };

    await evolutionRequest(`/webhook/set/${instanceName}`, 'POST', webhookConfig);
    console.log('Webhook configured for instance:', instanceName);
    return true;
  } catch (error) {
    console.error('Failed to configure webhook for instance:', instanceName, error.message);
    return false;
  }
}

// Configure RabbitMQ for an instance (optional)
async function configureInstanceRabbitMQ(instanceName) {
  try {
    const rabbitConfig = {
      enabled: false // Disable by default, can be enabled later
    };
    await evolutionRequest(`/rabbitmq/set/${instanceName}`, 'POST', rabbitConfig);
    return true;
  } catch (error) {
    console.log('RabbitMQ config skipped:', error.message);
    return false;
  }
}

// Configure instance settings
async function configureInstanceSettings(instanceName) {
  try {
    const settings = {
      reject_call: false,
      msg_call: '',
      groups_ignore: false,
      always_online: false,
      read_messages: false,
      read_status: false,
      sync_full_history: false
    };
    await evolutionRequest(`/settings/set/${instanceName}`, 'POST', settings);
    console.log('Settings configured for instance:', instanceName);
    return true;
  } catch (error) {
    console.log('Settings config skipped:', error.message);
    return false;
  }
}

// Create new Evolution instance
router.post('/create', authenticate, async (req, res) => {
  try {
    const { name, webhookUrl: customWebhookUrl } = req.body;
    let { organization_id } = req.body;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return res.status(500).json({ error: 'Evolution API não configurada' });
    }

    // If no organization_id provided, get user's first organization
    if (!organization_id) {
      const orgResult = await query(
        `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
        [req.userId]
      );
      if (orgResult.rows.length > 0) {
        organization_id = orgResult.rows[0].organization_id;
      }
    }

    // Verify user belongs to organization
    if (organization_id) {
      const memberCheck = await query(
        `SELECT id, role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
        [organization_id, req.userId]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Você não pertence a esta organização' });
      }
      // Only owner, admin, manager can create connections
      if (!['owner', 'admin', 'manager'].includes(memberCheck.rows[0].role)) {
        return res.status(403).json({ error: 'Sem permissão para criar conexões' });
      }
    }

    // Check plan limits
    await checkConnectionLimit(req.userId, organization_id);

    // Generate unique instance name
    const instanceName = generateInstanceName(organization_id, req.userId);

    // Determine webhook URL
    const webhookUrl = customWebhookUrl || (WEBHOOK_BASE_URL ? `${WEBHOOK_BASE_URL}/api/evolution/webhook` : null);

    // Create instance on Evolution API with webhook configuration
    const createPayload = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    };

    // If webhook URL is available, include it in creation
    if (webhookUrl) {
      createPayload.webhook = {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: true,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'SEND_MESSAGE'
        ]
      };
    }

    const createResult = await evolutionRequest('/instance/create', 'POST', createPayload);
    console.log('Evolution create result:', createResult);

    // Save connection to database
    const dbResult = await query(
      `INSERT INTO connections (user_id, organization_id, name, instance_name, api_url, api_key, status, webhook_url)
       VALUES ($1, $2, $3, $4, $5, $6, 'disconnected', $7)
       RETURNING *`,
      [req.userId, organization_id || null, name || 'WhatsApp', instanceName, EVOLUTION_API_URL, EVOLUTION_API_KEY, webhookUrl]
    );

    const connection = dbResult.rows[0];

    // Configure webhook separately (in case it wasn't included in creation)
    let webhookConfigured = false;
    if (webhookUrl) {
      webhookConfigured = await configureInstanceWebhook(instanceName, webhookUrl);
    }

    // Configure instance settings
    await configureInstanceSettings(instanceName);

    // Get QR code
    let qrCode = null;
    try {
      const qrResult = await evolutionRequest(`/instance/connect/${instanceName}`, 'GET');
      qrCode = qrResult.base64 || qrResult.qrcode?.base64 || null;
    } catch (e) {
      console.log('QR code not ready yet');
    }

    res.status(201).json({
      ...connection,
      qrCode,
      webhookConfigured,
      webhookUrl,
    });
  } catch (error) {
    console.error('Create Evolution instance error:', error);
    res.status(400).json({ error: error.message || 'Erro ao criar instância' });
  }
});

// Get QR Code for connection
router.get('/:connectionId/qrcode', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Get QR code from Evolution
    const qrResult = await evolutionRequest(`/instance/connect/${connection.instance_name}`, 'GET');
    
    res.json({
      qrCode: qrResult.base64 || qrResult.qrcode?.base64 || null,
      pairingCode: qrResult.pairingCode || null,
    });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({ error: 'Erro ao buscar QR Code' });
  }
});

// Check connection status
router.get('/:connectionId/status', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Check status on Evolution
    const statusResult = await evolutionRequest(`/instance/connectionState/${connection.instance_name}`, 'GET');
    
    const isConnected = statusResult.instance?.state === 'open';
    const phoneNumber = statusResult.instance?.phoneNumber || null;
    const newStatus = isConnected ? 'connected' : 'disconnected';

    // Update status in database if changed
    if (connection.status !== newStatus || connection.phone_number !== phoneNumber) {
      await query(
        'UPDATE connections SET status = $1, phone_number = $2, updated_at = NOW() WHERE id = $3',
        [newStatus, phoneNumber, connectionId]
      );
    }

    res.json({
      status: newStatus,
      phoneNumber,
      state: statusResult.instance?.state,
    });
  } catch (error) {
    console.error('Check status error:', error);
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

// Disconnect/Logout from WhatsApp
router.post('/:connectionId/logout', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Logout from Evolution
    await evolutionRequest(`/instance/logout/${connection.instance_name}`, 'DELETE');

    // Update status in database
    await query(
      'UPDATE connections SET status = $1, phone_number = NULL, updated_at = NOW() WHERE id = $2',
      ['disconnected', connectionId]
    );

    res.json({ success: true, message: 'Desconectado com sucesso' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Erro ao desconectar' });
  }
});

// Restart instance (reconnect)
router.post('/:connectionId/restart', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Restart instance on Evolution
    try {
      await evolutionRequest(`/instance/restart/${connection.instance_name}`, 'PUT');
    } catch (e) {
      // If restart fails, try to create the instance again
      await evolutionRequest('/instance/create', 'POST', {
        instanceName: connection.instance_name,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      });
    }

    // Update status in database
    await query(
      'UPDATE connections SET status = $1, updated_at = NOW() WHERE id = $2',
      ['disconnected', connectionId]
    );

    // Get new QR code
    const qrResult = await evolutionRequest(`/instance/connect/${connection.instance_name}`, 'GET');

    res.json({
      success: true,
      qrCode: qrResult.base64 || qrResult.qrcode?.base64 || null,
    });
  } catch (error) {
    console.error('Restart error:', error);
    res.status(500).json({ error: 'Erro ao reiniciar instância' });
  }
});

// Delete instance completely
router.delete('/:connectionId', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Delete instance from Evolution
    try {
      await evolutionRequest(`/instance/delete/${connection.instance_name}`, 'DELETE');
    } catch (e) {
      console.log('Instance may not exist on Evolution:', e.message);
    }

    // Delete from database
    await query('DELETE FROM connections WHERE id = $1', [connectionId]);

    res.json({ success: true, message: 'Conexão excluída com sucesso' });
  } catch (error) {
    console.error('Delete instance error:', error);
    res.status(500).json({ error: 'Erro ao excluir conexão' });
  }
});

// Send test message
router.post('/:connectionId/test', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { phone, message, mediaUrl, mediaType, fileName } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Número de telefone é obrigatório' });
    }

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Check if connection is active
    if (connection.status !== 'connected') {
      return res.status(400).json({ error: 'Conexão não está ativa. Conecte primeiro.' });
    }

    // Format phone number
    const formattedPhone = phone.replace(/\D/g, '');
    const remoteJid = formattedPhone.includes('@') ? formattedPhone : `${formattedPhone}@s.whatsapp.net`;

    let result;

    // Send media if provided
    if (mediaUrl) {
      const endpoint = mediaType === 'audio' 
        ? `/message/sendWhatsAppAudio/${connection.instance_name}`
        : `/message/sendMedia/${connection.instance_name}`;
      
      const body = {
        number: remoteJid,
        mediatype: mediaType || 'document',
        media: mediaUrl,
        caption: message || undefined,
        fileName: fileName || undefined,
      };

      // For audio, use PTT format
      if (mediaType === 'audio') {
        body.audio = mediaUrl;
        body.delay = 1200;
        delete body.media;
        delete body.mediatype;
        delete body.caption;
      }

      result = await evolutionRequest(endpoint, 'POST', body);
    } else if (message) {
      // Send text message
      result = await evolutionRequest(`/message/sendText/${connection.instance_name}`, 'POST', {
        number: remoteJid,
        text: message,
      });
    } else {
      return res.status(400).json({ error: 'Mensagem ou mídia é obrigatório' });
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('Send test message error:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem de teste' });
  }
});

// Get instance info
router.get('/:connectionId/info', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Get instance info from Evolution
    const infoResult = await evolutionRequest(`/instance/fetchInstances?instanceName=${connection.instance_name}`, 'GET');

    res.json({
      connection,
      instanceInfo: infoResult[0] || null,
    });
  } catch (error) {
    console.error('Get instance info error:', error);
    res.status(500).json({ error: 'Erro ao buscar informações' });
  }
});

// ==========================================
// WEBHOOK - Receive messages from Evolution API
// ==========================================

// Evolution API Webhook - receives real-time messages
// This endpoint should be public (no authentication)
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(payload, null, 2));

    // Evolution API can send events in different formats
    // Format 1: { event: "messages.upsert", instance: "name", data: {...} }
    // Format 2: { instance: "name", data: {...}, event: "messages.upsert" }
    // Format 3: { apikey: "...", event: "MESSAGES_UPSERT", instance: "name", data: {...} }
    
    const event = payload.event?.toLowerCase?.() || payload.event;
    const instanceName = payload.instance || payload.instanceName;
    const data = payload.data || payload;

    console.log('Parsed - Event:', event, 'Instance:', instanceName);

    if (!instanceName) {
      console.log('Webhook: Missing instance name');
      return res.status(200).json({ received: true });
    }

    // Find the connection by instance name
    const connResult = await query(
      'SELECT * FROM connections WHERE instance_name = $1',
      [instanceName]
    );

    if (connResult.rows.length === 0) {
      console.log('Webhook: Connection not found for instance:', instanceName);
      return res.status(200).json({ received: true });
    }

    const connection = connResult.rows[0];
    console.log('Webhook: Found connection:', connection.id, connection.name);

    // Normalize event names (Evolution API uses different formats)
    const normalizedEvent = event?.replace(/_/g, '.').toLowerCase();
    console.log('Webhook: Normalized event:', normalizedEvent);

    // Handle different event types
    switch (normalizedEvent) {
      case 'messages.upsert':
      case 'send.message':
        await handleMessageUpsert(connection, data);
        break;
      
      case 'messages.update':
        await handleMessageUpdate(connection, data);
        break;
      
      case 'connection.update':
        await handleConnectionUpdate(connection, data);
        break;
      
      case 'qrcode.updated':
        console.log('QR Code updated for instance:', instanceName);
        break;
      
      default:
        console.log('Webhook: Event type:', normalizedEvent, '- not handled');
    }

    res.status(200).json({ received: true, event: normalizedEvent });
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true, error: error.message });
  }
});

// Test webhook endpoint (GET for easy testing)
router.get('/webhook', async (req, res) => {
  console.log('Webhook test GET received');
  res.json({ status: 'ok', message: 'Webhook endpoint is working' });
});

// Handle incoming/outgoing messages
async function handleMessageUpsert(connection, data) {
  try {
    const message = data.message || data;
    const key = data.key || message.key;
    
    if (!key) {
      console.log('Webhook: No message key found');
      return;
    }

    const remoteJid = key.remoteJid;
    const messageId = key.id;
    const fromMe = key.fromMe || false;
    const pushName = message.pushName || data.pushName;

    // Skip status messages and group messages for now
    if (remoteJid === 'status@broadcast' || remoteJid.includes('@g.us')) {
      console.log('Webhook: Skipping broadcast/group message');
      return;
    }

    // Extract phone number from remoteJid
    const contactPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

    // Find or create conversation
    let convResult = await query(
      `SELECT * FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    let conversationId;

    if (convResult.rows.length === 0) {
      // Create new conversation
      const newConv = await query(
        `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, last_message_at, unread_count)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         RETURNING id`,
        [connection.id, remoteJid, pushName || contactPhone, contactPhone, fromMe ? 0 : 1]
      );
      conversationId = newConv.rows[0].id;
      console.log('Webhook: Created new conversation:', conversationId);
    } else {
      conversationId = convResult.rows[0].id;
      
      // Update conversation
      if (!fromMe) {
        await query(
          `UPDATE conversations 
           SET last_message_at = NOW(), 
               unread_count = unread_count + 1,
               contact_name = COALESCE(NULLIF($2, ''), contact_name),
               updated_at = NOW()
           WHERE id = $1`,
          [conversationId, pushName]
        );
      } else {
        await query(
          `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [conversationId]
        );
      }
    }

    // Check if message already exists
    const existingMsg = await query(
      `SELECT id FROM chat_messages WHERE message_id = $1`,
      [messageId]
    );

    if (existingMsg.rows.length > 0) {
      console.log('Webhook: Message already exists:', messageId);
      return;
    }

    // Extract message content and type
    let content = '';
    let messageType = 'text';
    let mediaUrl = null;
    let mediaMimetype = null;
    let quotedMessageId = null;

    const msgContent = message.message || message;

    if (msgContent.conversation) {
      content = msgContent.conversation;
      messageType = 'text';
    } else if (msgContent.extendedTextMessage) {
      content = msgContent.extendedTextMessage.text;
      messageType = 'text';
      if (msgContent.extendedTextMessage.contextInfo?.quotedMessage) {
        quotedMessageId = msgContent.extendedTextMessage.contextInfo.stanzaId;
      }
    } else if (msgContent.imageMessage) {
      messageType = 'image';
      content = msgContent.imageMessage.caption || '';
      mediaUrl = msgContent.imageMessage.url || data.media?.url;
      mediaMimetype = msgContent.imageMessage.mimetype;
    } else if (msgContent.videoMessage) {
      messageType = 'video';
      content = msgContent.videoMessage.caption || '';
      mediaUrl = msgContent.videoMessage.url || data.media?.url;
      mediaMimetype = msgContent.videoMessage.mimetype;
    } else if (msgContent.audioMessage) {
      messageType = 'audio';
      mediaUrl = msgContent.audioMessage.url || data.media?.url;
      mediaMimetype = msgContent.audioMessage.mimetype;
    } else if (msgContent.documentMessage) {
      messageType = 'document';
      content = msgContent.documentMessage.fileName || '';
      mediaUrl = msgContent.documentMessage.url || data.media?.url;
      mediaMimetype = msgContent.documentMessage.mimetype;
    } else if (msgContent.stickerMessage) {
      messageType = 'sticker';
      mediaUrl = msgContent.stickerMessage.url || data.media?.url;
      mediaMimetype = msgContent.stickerMessage.mimetype;
    } else if (msgContent.contactMessage) {
      messageType = 'contact';
      content = msgContent.contactMessage.displayName || 'Contato';
    } else if (msgContent.locationMessage) {
      messageType = 'location';
      content = `${msgContent.locationMessage.degreesLatitude},${msgContent.locationMessage.degreesLongitude}`;
    } else {
      // Try to get text from other message types
      content = message.body || message.text || JSON.stringify(msgContent).substring(0, 500);
    }

    // If Evolution provides media URL directly
    if (data.media?.url && !mediaUrl) {
      mediaUrl = data.media.url;
    }

    // Download and save media locally for media types
    const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker'];
    if (mediaTypes.includes(messageType) && !mediaUrl) {
      console.log('Webhook: Downloading media for message:', messageId);

      const localMedia = await downloadAndSaveMedia(connection, message, messageType);

      if (localMedia) {
        mediaUrl = localMedia.url;
        mediaMimetype = localMedia.mimetype || mediaMimetype;
        console.log('Webhook: Media downloaded and saved:', mediaUrl);
      } else {
        console.log('Webhook: Could not download media');
      }
    }

    // Get message timestamp
    const timestamp = message.messageTimestamp 
      ? new Date(parseInt(message.messageTimestamp) * 1000) 
      : new Date();

    // Insert message
    await query(
      `INSERT INTO chat_messages 
        (conversation_id, message_id, from_me, content, message_type, media_url, media_mimetype, quoted_message_id, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        conversationId,
        messageId,
        fromMe,
        content,
        messageType,
        mediaUrl,
        mediaMimetype,
        quotedMessageId,
        fromMe ? 'sent' : 'received',
        timestamp
      ]
    );

    console.log('Webhook: Message saved:', messageId, 'Type:', messageType, 'FromMe:', fromMe, 'MediaUrl:', mediaUrl);
  } catch (error) {
    console.error('Handle message upsert error:', error);
  }
}

// Handle message status updates (delivered, read, etc)
async function handleMessageUpdate(connection, data) {
  try {
    const updates = Array.isArray(data) ? data : [data];

    for (const update of updates) {
      const messageId = update.key?.id || update.id;
      const status = update.status;

      if (!messageId) continue;

      // Map Evolution status to our status
      let newStatus = null;
      switch (status) {
        case 1: // PENDING
          newStatus = 'pending';
          break;
        case 2: // SENT (server received)
          newStatus = 'sent';
          break;
        case 3: // DELIVERED
          newStatus = 'delivered';
          break;
        case 4: // READ
          newStatus = 'read';
          break;
        case 5: // PLAYED (for audio)
          newStatus = 'played';
          break;
      }

      if (newStatus) {
        await query(
          `UPDATE chat_messages SET status = $1 WHERE message_id = $2`,
          [newStatus, messageId]
        );
        console.log('Webhook: Message status updated:', messageId, '->', newStatus);
      }
    }
  } catch (error) {
    console.error('Handle message update error:', error);
  }
}

// Handle connection status changes
async function handleConnectionUpdate(connection, data) {
  try {
    const state = data.state || data.status;
    let newStatus = 'disconnected';

    if (state === 'open' || state === 'connected') {
      newStatus = 'connected';
    } else if (state === 'connecting') {
      newStatus = 'connecting';
    }

    await query(
      `UPDATE connections SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, connection.id]
    );

    console.log('Webhook: Connection status updated:', connection.instance_name, '->', newStatus);
  } catch (error) {
    console.error('Handle connection update error:', error);
  }
}

// Configure webhook on Evolution API
router.post('/:connectionId/configure-webhook', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { webhookUrl } = req.body;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Configure webhook on Evolution API
    const webhookConfig = {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: true, // Receive media as base64
      events: [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_SET',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONTACTS_SET',
        'CONTACTS_UPSERT',
        'CONTACTS_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_SET',
        'CHATS_UPSERT',
        'CHATS_UPDATE',
        'CHATS_DELETE',
        'GROUPS_UPSERT',
        'GROUPS_UPDATE',
        'GROUP_PARTICIPANTS_UPDATE',
        'CONNECTION_UPDATE',
        'CALL',
        'LABELS_EDIT',
        'LABELS_ASSOCIATION'
      ]
    };

    await evolutionRequest(`/webhook/set/${connection.instance_name}`, 'POST', webhookConfig);

    // Save webhook URL to database
    await query(
      `UPDATE connections SET webhook_url = $1, updated_at = NOW() WHERE id = $2`,
      [webhookUrl, connectionId]
    );

    res.json({ success: true, message: 'Webhook configurado com sucesso' });
  } catch (error) {
    console.error('Configure webhook error:', error);
    res.status(500).json({ error: 'Erro ao configurar webhook' });
  }
});

// Get current webhook config
router.get('/:connectionId/webhook', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    // Get connection
    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Get webhook config from Evolution
    try {
      const webhookResult = await evolutionRequest(`/webhook/find/${connection.instance_name}`, 'GET');
      res.json({
        configured: true,
        url: webhookResult.url || connection.webhook_url,
        events: webhookResult.events || [],
      });
    } catch (e) {
      res.json({
        configured: false,
        url: connection.webhook_url || null,
        events: [],
      });
    }
  } catch (error) {
    console.error('Get webhook error:', error);
    res.status(500).json({ error: 'Erro ao buscar webhook' });
  }
});

// ==========================================
// SYNC HISTORY - Import messages from phone
// ==========================================

// Get all chats from phone
router.get('/:connectionId/chats', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    if (connection.status !== 'connected') {
      return res.status(400).json({ error: 'Conexão não está ativa' });
    }

    // Fetch all chats from Evolution API
    const chats = await evolutionRequest(`/chat/findChats/${connection.instance_name}`, 'POST', {});

    res.json(chats || []);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
});

// Sync messages from a specific chat
router.post('/:connectionId/sync-chat', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { remoteJid, days = 7 } = req.body;

    if (!remoteJid) {
      return res.status(400).json({ error: 'remoteJid é obrigatório' });
    }

    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    if (connection.status !== 'connected') {
      return res.status(400).json({ error: 'Conexão não está ativa' });
    }

    // Fetch messages from Evolution API
    const messages = await evolutionRequest(`/chat/findMessages/${connection.instance_name}`, 'POST', {
      where: {
        key: {
          remoteJid: remoteJid
        }
      },
      limit: 500 // Limit to prevent overload
    });

    if (!messages || messages.length === 0) {
      return res.json({ imported: 0, message: 'Nenhuma mensagem encontrada' });
    }

    // Filter messages by date
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    const daysAgoTimestamp = Math.floor(daysAgo.getTime() / 1000);

    const filteredMessages = messages.filter(msg => {
      const msgTimestamp = msg.messageTimestamp || msg.message?.messageTimestamp;
      return msgTimestamp >= daysAgoTimestamp;
    });

    console.log(`Sync: Found ${messages.length} messages, ${filteredMessages.length} in last ${days} days`);

    // Find or create conversation
    const contactPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    
    let convResult = await query(
      `SELECT * FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    let conversationId;

    if (convResult.rows.length === 0) {
      // Create new conversation
      const newConv = await query(
        `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, last_message_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id`,
        [connection.id, remoteJid, contactPhone, contactPhone]
      );
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = convResult.rows[0].id;
    }

    // Import messages
    let imported = 0;
    let skipped = 0;

    for (const msg of filteredMessages) {
      try {
        const key = msg.key;
        const messageId = key?.id;
        
        if (!messageId) continue;

        // Check if message already exists
        const existing = await query(
          `SELECT id FROM chat_messages WHERE message_id = $1`,
          [messageId]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Extract message content
        const msgContent = msg.message || {};
        let content = '';
        let messageType = 'text';
        let mediaUrl = null;
        let mediaMimetype = null;

        if (msgContent.conversation) {
          content = msgContent.conversation;
        } else if (msgContent.extendedTextMessage) {
          content = msgContent.extendedTextMessage.text;
        } else if (msgContent.imageMessage) {
          messageType = 'image';
          content = msgContent.imageMessage.caption || '[Imagem]';
          mediaMimetype = msgContent.imageMessage.mimetype || null;
          mediaUrl = msgContent.imageMessage.url;
        } else if (msgContent.videoMessage) {
          messageType = 'video';
          content = msgContent.videoMessage.caption || '[Vídeo]';
          mediaMimetype = msgContent.videoMessage.mimetype || null;
          mediaUrl = msgContent.videoMessage.url;
        } else if (msgContent.audioMessage) {
          messageType = 'audio';
          content = '[Áudio]';
          mediaMimetype = msgContent.audioMessage.mimetype || null;
          mediaUrl = msgContent.audioMessage.url;
        } else if (msgContent.documentMessage) {
          messageType = 'document';
          content = msgContent.documentMessage.fileName || '[Documento]';
          mediaMimetype = msgContent.documentMessage.mimetype || null;
          mediaUrl = msgContent.documentMessage.url;
        } else if (msgContent.stickerMessage) {
          messageType = 'sticker';
          content = '[Figurinha]';
          mediaMimetype = msgContent.stickerMessage.mimetype || null;
          mediaUrl = msgContent.stickerMessage.url;
        } else {
          content = '[Mensagem não suportada]';
        }

        const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker'];
        if (mediaTypes.includes(messageType) && !mediaUrl) {
          const localMedia = await downloadAndSaveMedia(connection, msg, messageType);
          if (localMedia) {
            mediaUrl = localMedia.url;
            mediaMimetype = localMedia.mimetype || mediaMimetype;
          }
        }

        const timestamp = msg.messageTimestamp 
          ? new Date(parseInt(msg.messageTimestamp) * 1000) 
          : new Date();

        await query(
          `INSERT INTO chat_messages 
            (conversation_id, message_id, from_me, content, message_type, media_url, media_mimetype, status, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            conversationId,
            messageId,
            key.fromMe || false,
            content,
            messageType,
            mediaUrl,
            mediaMimetype,
            'received',
            timestamp
          ]
        );

        imported++;
      } catch (e) {
        console.error('Error importing message:', e.message);
      }
    }

    // Update conversation last_message_at
    await query(
      `UPDATE conversations SET last_message_at = (
        SELECT MAX(timestamp) FROM chat_messages WHERE conversation_id = $1
      ), updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    res.json({ 
      imported, 
      skipped, 
      total: filteredMessages.length,
      message: `Importadas ${imported} mensagens dos últimos ${days} dias`
    });
  } catch (error) {
    console.error('Sync chat error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar mensagens' });
  }
});

// Sync all chats (bulk import)
router.post('/:connectionId/sync-all', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { days = 7 } = req.body;

    const connResult = await query(
      'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
      [connectionId, req.userId]
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    if (connection.status !== 'connected') {
      return res.status(400).json({ error: 'Conexão não está ativa' });
    }

    // Fetch all chats
    const chats = await evolutionRequest(`/chat/findChats/${connection.instance_name}`, 'POST', {});

    if (!chats || chats.length === 0) {
      return res.json({ message: 'Nenhuma conversa encontrada', total: 0 });
    }

    // Filter only individual chats (not groups)
    const individualChats = chats.filter(chat => 
      chat.id?.includes('@s.whatsapp.net') || chat.id?.includes('@c.us')
    );

    console.log(`Sync all: Found ${chats.length} chats, ${individualChats.length} individual`);

    let totalImported = 0;
    let totalChats = 0;

    // Process each chat (limit to 20 to prevent timeout)
    const chatsToProcess = individualChats.slice(0, 20);

    for (const chat of chatsToProcess) {
      try {
        const remoteJid = chat.id;
        
        // Fetch messages for this chat
        const messages = await evolutionRequest(`/chat/findMessages/${connection.instance_name}`, 'POST', {
          where: {
            key: {
              remoteJid: remoteJid
            }
          },
          limit: 100
        });

        if (!messages || messages.length === 0) continue;

        // Filter by date
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        const daysAgoTimestamp = Math.floor(daysAgo.getTime() / 1000);

        const filteredMessages = messages.filter(msg => {
          const msgTimestamp = msg.messageTimestamp || msg.message?.messageTimestamp;
          return msgTimestamp >= daysAgoTimestamp;
        });

        if (filteredMessages.length === 0) continue;

        // Find or create conversation
        const contactPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const contactName = chat.name || chat.pushName || contactPhone;
        
        let convResult = await query(
          `SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
          [connection.id, remoteJid]
        );

        let conversationId;

        if (convResult.rows.length === 0) {
          const newConv = await query(
            `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, last_message_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id`,
            [connection.id, remoteJid, contactName, contactPhone]
          );
          conversationId = newConv.rows[0].id;
        } else {
          conversationId = convResult.rows[0].id;
        }

        // Import messages
        for (const msg of filteredMessages) {
          try {
            const key = msg.key;
            const messageId = key?.id;
            
            if (!messageId) continue;

            // Check if exists
            const existing = await query(
              `SELECT id FROM chat_messages WHERE message_id = $1`,
              [messageId]
            );

            if (existing.rows.length > 0) continue;

            // Extract content
            const msgContent = msg.message || {};
            let content = msgContent.conversation || 
                          msgContent.extendedTextMessage?.text || 
                          msgContent.imageMessage?.caption ||
                          msgContent.videoMessage?.caption ||
                          '[Mídia]';

            let messageType = 'text';
            if (msgContent.imageMessage) messageType = 'image';
            else if (msgContent.videoMessage) messageType = 'video';
            else if (msgContent.audioMessage) messageType = 'audio';
            else if (msgContent.documentMessage) messageType = 'document';

            const timestamp = msg.messageTimestamp 
              ? new Date(parseInt(msg.messageTimestamp) * 1000) 
              : new Date();

            await query(
              `INSERT INTO chat_messages 
                (conversation_id, message_id, from_me, content, message_type, status, timestamp)
               VALUES ($1, $2, $3, $4, $5, 'received', $6)`,
              [conversationId, messageId, key.fromMe || false, content, messageType, timestamp]
            );

            totalImported++;
          } catch (e) {
            // Skip errors
          }
        }

        totalChats++;
      } catch (e) {
        console.error('Error syncing chat:', e.message);
      }
    }

    res.json({ 
      message: `Sincronização concluída`,
      chats_processed: totalChats,
      messages_imported: totalImported,
      days: days
    });
  } catch (error) {
    console.error('Sync all error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar conversas' });
  }
});

export default router;
