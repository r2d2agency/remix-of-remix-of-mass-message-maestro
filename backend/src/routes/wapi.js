import { Router } from 'express';
import { query } from '../db.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const API_BASE_URL = process.env.API_BASE_URL || 'https://whastsale-backend.exf0ty.easypanel.host';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * W-API Webhook handler
 * Receives messages from W-API instances
 * 
 * Configure in W-API panel:
 * - "Ao receber uma mensagem": https://your-backend/api/wapi/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[W-API Webhook] Received:', JSON.stringify(payload).slice(0, 500));

    // W-API sends different payload structures depending on event type
    // Common fields: instanceId, phone, message, messageId, etc.
    
    const instanceId = payload.instanceId || payload.instance_id || payload.instance;
    
    if (!instanceId) {
      console.log('[W-API Webhook] No instanceId in payload');
      return res.status(200).json({ received: true, skipped: 'no instanceId' });
    }

    // Find connection by instance_id
    const connResult = await query(
      `SELECT c.*, om.organization_id 
       FROM connections c
       LEFT JOIN organization_members om ON om.user_id = c.user_id
       WHERE c.instance_id = $1 AND c.wapi_token IS NOT NULL
       LIMIT 1`,
      [instanceId]
    );

    if (connResult.rows.length === 0) {
      console.log('[W-API Webhook] Connection not found for instance:', instanceId);
      return res.status(200).json({ received: true, skipped: 'connection not found' });
    }

    const connection = connResult.rows[0];

    // Detect event type from payload
    const eventType = detectEventType(payload);
    console.log('[W-API Webhook] Event type:', eventType, 'Instance:', instanceId);

    switch (eventType) {
      case 'message_received':
        await handleIncomingMessage(connection, payload);
        break;
      case 'message_sent':
        await handleOutgoingMessage(connection, payload);
        break;
      case 'status_update':
        await handleStatusUpdate(connection, payload);
        break;
      case 'connection_update':
        await handleConnectionUpdate(connection, payload);
        break;
      default:
        console.log('[W-API Webhook] Unknown event type, payload:', JSON.stringify(payload).slice(0, 300));
    }

    res.status(200).json({ received: true, processed: eventType });
  } catch (error) {
    console.error('[W-API Webhook] Error:', error);
    // Always return 200 to prevent W-API from retrying
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Detect event type from W-API payload
 */
function detectEventType(payload) {
  // W-API typically sends different structures for different events
  
  // Message received (incoming)
  if (payload.event === 'message' || payload.event === 'messages.upsert') {
    if (payload.fromMe === false || payload.isFromMe === false) {
      return 'message_received';
    }
    return 'message_sent';
  }

  // Check by presence of message fields
  if (payload.message || payload.text || payload.body) {
    if (payload.fromMe === true || payload.isFromMe === true) {
      return 'message_sent';
    }
    return 'message_received';
  }

  // Status update
  if (payload.event === 'message.ack' || payload.ack !== undefined) {
    return 'status_update';
  }

  // Connection status
  if (payload.event === 'connection.update' || payload.status || payload.connected !== undefined) {
    return 'connection_update';
  }

  return 'unknown';
}

/**
 * Handle incoming message from W-API
 */
async function handleIncomingMessage(connection, payload) {
  try {
    // Extract message data from W-API payload
    const phone = payload.phone || payload.from || payload.sender || payload.remoteJid?.split('@')[0];
    const messageId = payload.messageId || payload.id || payload.key?.id || crypto.randomUUID();
    
    if (!phone) {
      console.log('[W-API] No phone in incoming message');
      return;
    }

    // Normalize phone to JID format
    const cleanPhone = phone.replace(/\D/g, '');
    const remoteJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    // Get or create conversation
    let conversationResult = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    let conversationId;
    if (conversationResult.rows.length === 0) {
      // Create new conversation
      const contactName = payload.pushName || payload.name || payload.senderName || cleanPhone;
      
      const newConv = await query(
        `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, last_message_at, unread_count)
         VALUES ($1, $2, $3, $4, NOW(), 1)
         RETURNING id`,
        [connection.id, remoteJid, contactName, cleanPhone]
      );
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = conversationResult.rows[0].id;
      
      // Update conversation
      await query(
        `UPDATE conversations 
         SET last_message_at = NOW(), 
             unread_count = unread_count + 1,
             contact_name = COALESCE($2, contact_name)
         WHERE id = $1`,
        [conversationId, payload.pushName || payload.name]
      );
    }

    // Extract message content
    const { messageType, content, mediaUrl } = extractMessageContent(payload);

    if (!content && !mediaUrl) {
      console.log('[W-API] Empty message content, skipping');
      return;
    }

    // Check for duplicate message in chat_messages table
    const existingMsg = await query(
      `SELECT id FROM chat_messages WHERE message_id = $1`,
      [messageId]
    );

    if (existingMsg.rows.length > 0) {
      console.log('[W-API] Duplicate message, skipping:', messageId);
      return;
    }

    // Insert message into chat_messages table (correct table)
    await query(
      `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, media_url, from_me, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, false, 'received', NOW())`,
      [conversationId, messageId, content, messageType, mediaUrl]
    );

    console.log('[W-API] Message saved:', messageId, 'Type:', messageType);
  } catch (error) {
    console.error('[W-API] Error handling incoming message:', error);
  }
}

/**
 * Handle outgoing message (sent by us)
 */
async function handleOutgoingMessage(connection, payload) {
  try {
    const phone = payload.phone || payload.to || payload.remoteJid?.split('@')[0];
    const messageId = payload.messageId || payload.id || payload.key?.id;
    
    if (!phone || !messageId) return;

    const cleanPhone = phone.replace(/\D/g, '');
    const remoteJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    // Find conversation
    const convResult = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    if (convResult.rows.length === 0) return;

    const conversationId = convResult.rows[0].id;
    const { messageType, content, mediaUrl } = extractMessageContent(payload);

    // Check for duplicate or pending message (optimistic UI pattern)
    const existingMsg = await query(
      `SELECT id FROM chat_messages WHERE message_id = $1 OR 
       (message_id LIKE 'temp_%' AND conversation_id = $2 AND from_me = true AND status = 'pending' 
        AND timestamp > NOW() - INTERVAL '60 seconds')`,
      [messageId, conversationId]
    );

    if (existingMsg.rows.length > 0) {
      // Update the pending message with real message ID
      await query(
        `UPDATE chat_messages SET message_id = $1, status = 'sent' WHERE id = $2`,
        [messageId, existingMsg.rows[0].id]
      );
      console.log('[W-API] Updated pending message with real ID:', messageId);
      return;
    }

    // Insert sent message into chat_messages table (correct table)
    await query(
      `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, media_url, from_me, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, true, 'sent', NOW())`,
      [conversationId, messageId, content, messageType, mediaUrl]
    );

    // Update conversation timestamp
    await query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    console.log('[W-API] Outgoing message saved:', messageId);
  } catch (error) {
    console.error('[W-API] Error handling outgoing message:', error);
  }
}

/**
 * Handle message status update
 */
async function handleStatusUpdate(connection, payload) {
  try {
    const messageId = payload.messageId || payload.id || payload.key?.id;
    const ack = payload.ack;

    if (!messageId) return;

    // Map ack values to status
    let status = 'sent';
    if (ack === 1) status = 'sent';
    else if (ack === 2) status = 'delivered';
    else if (ack === 3) status = 'read';
    else if (ack === -1 || ack === 0) status = 'failed';

    await query(
      `UPDATE chat_messages SET status = $1 WHERE message_id = $2`,
      [status, messageId]
    );

    console.log('[W-API] Status updated:', messageId, status);
  } catch (error) {
    console.error('[W-API] Error handling status update:', error);
  }
}

/**
 * Handle connection status update
 */
async function handleConnectionUpdate(connection, payload) {
  try {
    const connected = payload.connected === true || payload.status === 'connected' || payload.state === 'open';
    const phoneNumber = payload.phoneNumber || payload.phone || payload.wid?.split('@')[0];

    await query(
      `UPDATE connections SET status = $1, phone_number = COALESCE($2, phone_number), updated_at = NOW() WHERE id = $3`,
      [connected ? 'connected' : 'disconnected', phoneNumber, connection.id]
    );

    console.log('[W-API] Connection status updated:', connected ? 'connected' : 'disconnected');
  } catch (error) {
    console.error('[W-API] Error handling connection update:', error);
  }
}

/**
 * Extract message content from W-API payload
 */
function extractMessageContent(payload) {
  let messageType = 'text';
  let content = '';
  let mediaUrl = null;

  // Text message
  if (payload.text || payload.body || payload.message) {
    content = payload.text || payload.body || payload.message;
    if (typeof content === 'object') {
      content = content.text || content.body || content.conversation || JSON.stringify(content);
    }
    messageType = 'text';
  }

  // Image
  if (payload.image || payload.imageMessage) {
    messageType = 'image';
    mediaUrl = payload.image || payload.imageMessage?.url || payload.mediaUrl;
    content = payload.caption || payload.imageMessage?.caption || '';
  }

  // Audio
  if (payload.audio || payload.audioMessage) {
    messageType = 'audio';
    mediaUrl = payload.audio || payload.audioMessage?.url || payload.mediaUrl;
    content = '[Áudio]';
  }

  // Video
  if (payload.video || payload.videoMessage) {
    messageType = 'video';
    mediaUrl = payload.video || payload.videoMessage?.url || payload.mediaUrl;
    content = payload.caption || payload.videoMessage?.caption || '';
  }

  // Document
  if (payload.document || payload.documentMessage) {
    messageType = 'document';
    mediaUrl = payload.document || payload.documentMessage?.url || payload.mediaUrl;
    content = payload.fileName || payload.documentMessage?.fileName || '[Documento]';
  }

  // Sticker
  if (payload.sticker || payload.stickerMessage) {
    messageType = 'sticker';
    mediaUrl = payload.sticker || payload.stickerMessage?.url || payload.mediaUrl;
    content = '[Figurinha]';
  }

  return { messageType, content, mediaUrl };
}

export default router;
