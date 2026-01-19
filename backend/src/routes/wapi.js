import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { getSendAttempts, clearSendAttempts, downloadMedia as wapiDownloadMedia } from '../lib/wapi-provider.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const API_BASE_URL = process.env.API_BASE_URL || 'https://whastsale-backend.exf0ty.easypanel.host';

// In-memory webhook event buffer for diagnostics only (not persisted)
const WEBHOOK_EVENTS_MAX = 200;
const webhookEvents = []; // { at, connectionId, instanceId, eventType, headers, preview }

function safeHeaders(req) {
  const h = req.headers || {};
  const out = {};
  const pick = (k) => {
    const v = h?.[k];
    if (v === undefined || v === null) return;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  };
  // Store only non-sensitive headers
  pick('user-agent');
  pick('content-type');
  pick('x-forwarded-for');
  pick('x-real-ip');
  pick('host');
  return out;
}

function pushWebhookEvent({ connectionId, instanceId, eventType, req, payload }) {
  webhookEvents.unshift({
    at: new Date().toISOString(),
    connectionId: connectionId || null,
    instanceId: instanceId || null,
    eventType: eventType || null,
    headers: safeHeaders(req),
    preview: JSON.stringify(payload).slice(0, 900),
  });
  if (webhookEvents.length > WEBHOOK_EVENTS_MAX) webhookEvents.length = WEBHOOK_EVENTS_MAX;
}

async function getAccessibleConnection(connectionId, userId) {
  const result = await query(
    `SELECT c.*
     FROM connections c
     LEFT JOIN organization_members om
       ON om.organization_id = c.organization_id AND om.user_id = $2
     WHERE c.id = $1 AND (c.user_id = $2 OR om.id IS NOT NULL)
     LIMIT 1`,
    [connectionId, userId]
  );
  return result.rows[0] || null;
}

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function isAbsoluteUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function normalizeUploadsUrl(u) {
  if (!u || typeof u !== 'string') return null;
  const s = u.trim();
  if (!s) return null;
  if (isAbsoluteUrl(s) || /^data:/i.test(s) || /^blob:/i.test(s)) return s;
  if (s.startsWith('/')) return `${API_BASE_URL}${s}`;
  return `${API_BASE_URL}/${s}`;
}

function extFromMime(mime) {
  if (!mime) return null;
  const m = String(mime).split(';')[0].trim().toLowerCase();
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
  };
  return map[m] || null;
}

function extFromUrl(u) {
  try {
    const url = new URL(u);
    const ext = path.extname(url.pathname || '').replace('.', '').toLowerCase();
    return ext || null;
  } catch {
    return null;
  }
}

function defaultExtByType(messageType) {
  if (messageType === 'image') return 'jpg';
  if (messageType === 'video') return 'mp4';
  if (messageType === 'audio') return 'ogg';
  if (messageType === 'sticker') return 'webp';
  if (messageType === 'document') return 'bin';
  return 'bin';
}

function buildUploadsPublicUrl(filename) {
  return `${API_BASE_URL}/uploads/${filename}`;
}

async function writeDataUrlToUploads(dataUrl, messageType, hintedMime) {
  const m = String(dataUrl).match(/^data:([^;,]+)?;base64,(.*)$/i);
  if (!m) throw new Error('Invalid data URL');
  const mime = (m[1] || hintedMime || '').trim() || null;
  const base64 = m[2] || '';
  const buf = Buffer.from(base64, 'base64');

  const ext = extFromMime(mime) || defaultExtByType(messageType);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(filePath, buf);

  return { publicUrl: buildUploadsPublicUrl(filename), mime };
}

function downloadToUploads(url, messageType, hintedMime, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;

    console.log('[W-API Media] Attempting download:', url.slice(0, 200));

    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'Whatsale/1.0',
          'Accept': '*/*',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        console.log('[W-API Media] Download response:', status);

        // Redirect handling
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location &&
          redirectCount < 3
        ) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(downloadToUploads(nextUrl, messageType, hintedMime, redirectCount + 1));
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }

        const headerMime = String(res.headers['content-type'] || '').split(';')[0].trim();
        const mime = headerMime || hintedMime || null;

        // --- sniff first bytes to avoid saving decrypted media as .enc (WhatsApp CDN) ---
        let head = Buffer.alloc(0);
        const onData = (chunk) => {
          try {
            if (head.length >= 64) return;
            const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const need = 64 - head.length;
            head = Buffer.concat([head, b.slice(0, need)]);
          } catch {
            // ignore
          }
        };
        res.on('data', onData);

        const sniffExt = () => {
          const b = head;
          if (!b || b.length < 12) return null;

          // JPEG
          if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
          // PNG
          if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
          // GIF
          if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
          // WEBP (RIFF....WEBP)
          if (
            b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
            b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
          ) return 'webp';
          // PDF
          if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
          // OGG
          if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'ogg';
          // MP4/QuickTime: ....ftyp
          if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'mp4';

          return null;
        };

        const mimeFromExt = (ext) => {
          const map = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            pdf: 'application/pdf',
            ogg: 'audio/ogg',
            mp4: 'video/mp4',
          };
          return map[ext] || null;
        };

        // Write to a temporary file first, then rename with the correct extension
        const tmpName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.tmp`;
        const tmpPath = path.join(UPLOADS_DIR, tmpName);
        const fileStream = fs.createWriteStream(tmpPath);

        res.pipe(fileStream);

        fileStream.on('finish', async () => {
          try {
            fileStream.close(() => {
              const sniffed = sniffExt();
              const ext = extFromMime(mime) || sniffed || defaultExtByType(messageType);
              const finalName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
              const finalPath = path.join(UPLOADS_DIR, finalName);

              try {
                fs.renameSync(tmpPath, finalPath);
              } catch (e) {
                // fallback: keep temp file if rename fails
                console.error('[W-API Media] Rename failed:', e?.message || e);
                return resolve({ publicUrl: buildUploadsPublicUrl(tmpName), mime: mime || hintedMime || null });
              }

              const finalMime = mimeFromExt(ext) || mime || hintedMime || null;
              console.log('[W-API Media] Downloaded successfully:', finalName, 'mime:', finalMime);
              resolve({ publicUrl: buildUploadsPublicUrl(finalName), mime: finalMime });
            });
          } catch (err) {
            console.error('[W-API Media] Finish handler error:', err?.message || err);
            return resolve({ publicUrl: buildUploadsPublicUrl(tmpName), mime: mime || hintedMime || null });
          }
        });

        fileStream.on('error', (err) => {
          res.resume();
          reject(err);
        });
      }
    );

    req.on('error', (err) => {
      console.error('[W-API Media] Download error:', err.message);
      reject(err);
    });
    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout downloading media'));
    });
  });
}

function shouldCacheExternally(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') return false;
  const u = mediaUrl.trim();
  if (!u) return false;
  if (/^data:/i.test(u)) return true;
  // Se já é do nosso /uploads, não precisa cachear
  if (u.startsWith(`${API_BASE_URL}/uploads/`)) return false;
  // URLs externas: cachear para evitar expiração/CORS
  return isAbsoluteUrl(u);
}

function isWhatsAppCdnUrl(url) {
  if (!url) return false;
  return url.includes('mmg.whatsapp.net') || url.includes('media.whatsapp.net');
}

function withTimeout(promise, ms, label = 'timeout') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function cacheMedia({ messageId, mediaUrl, messageType, mediaMimetype, connection }) {
  const raw = mediaUrl;

  try {
    // If it's a WhatsApp CDN URL, we need to use W-API download endpoint
    if (isWhatsAppCdnUrl(raw) && connection?.instance_id && connection?.wapi_token) {
      console.log('[W-API Cache] WhatsApp CDN URL detected, using W-API download endpoint...');

      const downloadResult = await wapiDownloadMedia(connection.instance_id, connection.wapi_token, messageId);

      if (downloadResult.success && downloadResult.base64) {
        console.log('[W-API Cache] Downloaded via W-API, saving to uploads...');
        return await writeDataUrlToUploads(downloadResult.base64, messageType, downloadResult.mimetype || mediaMimetype);
      }

      if (downloadResult.success && downloadResult.url) {
        console.log('[W-API Cache] Got new URL from W-API, downloading...');
        return await downloadToUploads(downloadResult.url, messageType, downloadResult.mimetype || mediaMimetype);
      }

      console.error('[W-API Cache] W-API download failed:', downloadResult.error);
      return null;
    }

    if (/^data:/i.test(raw)) {
      console.log('[W-API Cache] Processing as data URL (base64)');
      return await writeDataUrlToUploads(raw, messageType, mediaMimetype);
    }

    console.log('[W-API Cache] Processing as HTTP URL');
    return await downloadToUploads(raw, messageType, mediaMimetype);
  } catch (err) {
    console.error('[W-API Cache] cacheMedia failed:', err?.message || err, 'Original URL:', String(mediaUrl).slice(0, 200));
    return null;
  }
}

async function cacheMediaAndUpdateMessage({ messageId, mediaUrl, messageType, mediaMimetype, connection }) {
  console.log('[W-API Cache] Starting media cache for:', messageId, 'URL:', String(mediaUrl).slice(0, 200));

  const cached = await cacheMedia({ messageId, mediaUrl, messageType, mediaMimetype, connection });
  if (!cached?.publicUrl) return;

  try {
    await query(
      `UPDATE chat_messages
       SET media_url = $1,
           media_mimetype = COALESCE($2, media_mimetype)
       WHERE message_id = $3`,
      [cached.publicUrl, cached.mime, messageId]
    );

    console.log('[W-API Cache] Successfully cached:', cached.publicUrl);
  } catch (err) {
    console.error('[W-API Cache] Failed to update message media_url:', err?.message || err);
  }
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
      pushWebhookEvent({ connectionId: null, instanceId: null, eventType: 'unknown', req, payload });
      return res.status(200).json({ received: true, skipped: 'no instanceId' });
    }

    // Detect event type from payload
    const eventType = detectEventType(payload);

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
      pushWebhookEvent({ connectionId: null, instanceId, eventType, req, payload });
      return res.status(200).json({ received: true, skipped: 'connection not found' });
    }

    const connection = connResult.rows[0];

    pushWebhookEvent({ connectionId: connection.id, instanceId, eventType, req, payload });

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

// Diagnostics: view/clear last webhook events received by the backend
router.get('/:connectionId/webhook-events', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));

    const connection = await getAccessibleConnection(connectionId, req.userId);
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    const instanceId = connection.instance_id;
    const events = webhookEvents.filter((e) => e.instanceId === instanceId).slice(0, limit);

    res.json({ events });
  } catch (error) {
    console.error('[W-API] webhook-events GET error:', error);
    res.status(500).json({ error: 'Erro ao buscar eventos do webhook' });
  }
});

router.delete('/:connectionId/webhook-events', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connection = await getAccessibleConnection(connectionId, req.userId);
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    const instanceId = connection.instance_id;
    let removed = 0;
    for (let i = webhookEvents.length - 1; i >= 0; i--) {
      if (webhookEvents[i]?.instanceId === instanceId) {
        webhookEvents.splice(i, 1);
        removed++;
      }
    }

    res.json({ success: true, removed });
  } catch (error) {
    console.error('[W-API] webhook-events DELETE error:', error);
    res.status(500).json({ error: 'Erro ao limpar eventos do webhook' });
  }
});

// Diagnostics: view/clear last send attempts from backend -> W-API
router.get('/:connectionId/send-attempts', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));

    const connection = await getAccessibleConnection(connectionId, req.userId);
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    const attempts = getSendAttempts({ instanceId: connection.instance_id, limit });
    res.json({ attempts });
  } catch (error) {
    console.error('[W-API] send-attempts GET error:', error);
    res.status(500).json({ error: 'Erro ao buscar tentativas de envio' });
  }
});

router.delete('/:connectionId/send-attempts', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connection = await getAccessibleConnection(connectionId, req.userId);
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    clearSendAttempts(connection.instance_id);
    res.json({ success: true });
  } catch (error) {
    console.error('[W-API] send-attempts DELETE error:', error);
    res.status(500).json({ error: 'Erro ao limpar tentativas de envio' });
  }
});

/**
 * Detect event type from W-API payload
 * W-API uses specific event names like:
 * - webhookReceived: incoming message
 * - webhookDelivery: outgoing message confirmation (fromApi)
 * - webhookStatus: delivery/read/server updates
 * - webhookConnected / webhookDisconnected: connection status
 */
function detectEventType(payload) {
  const event = payload.event;

  // W-API specific event types
  if (event === 'webhookReceived') return 'message_received';
  if (event === 'webhookDelivery') return 'message_sent';
  if (event === 'webhookStatus') return 'status_update';
  if (event === 'webhookConnected' || event === 'webhookDisconnected') return 'connection_update';

  // Legacy/fallback: Evolution-style events
  if (event === 'message' || event === 'messages.upsert') {
    if (payload.fromMe === false || payload.isFromMe === false) return 'message_received';
    return 'message_sent';
  }

  // Check by presence of message fields (msgContent is W-API specific)
  if (payload.msgContent || payload.message || payload.text || payload.body) {
    if (payload.fromMe === true || payload.isFromMe === true || payload.fromApi === true) return 'message_sent';
    return 'message_received';
  }

  // Status update (legacy ack)
  if (event === 'message.ack' || payload.ack !== undefined) return 'status_update';

  // Connection status (be strict: avoid treating delivery status as connection)
  if (
    event === 'connection.update' ||
    payload.connected !== undefined ||
    payload.status === 'connected' ||
    payload.status === 'disconnected' ||
    payload.state === 'open' ||
    payload.state === 'close'
  ) {
    return 'connection_update';
  }

  return 'unknown';
}

/**
 * Handle incoming message from W-API
 * W-API payload structure:
 * {
 *   event: "webhookReceived",
 *   instanceId, connectedPhone, messageId, fromMe: false,
 *   chat: { id: "5517991308048" },
 *   sender: { id, pushName },
 *   msgContent: { conversation: "..." } | { imageMessage: {...} } | etc.
 * }
 */
async function handleIncomingMessage(connection, payload) {
  try {
    // W-API format: chat.id is the sender phone for incoming
    const phone = payload.chat?.id || payload.phone || payload.from || payload.sender?.id || payload.remoteJid?.split('@')[0];
    const messageId = payload.messageId || payload.id || payload.key?.id || crypto.randomUUID();

    if (!phone) {
      console.log('[W-API] No phone in incoming message, payload:', JSON.stringify(payload).slice(0, 300));
      return;
    }

    // Normalize phone to JID format
    const cleanPhone = String(phone).replace(/\D/g, '');
    const remoteJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    // Get or create conversation
    let conversationResult = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    let conversationId;
    if (conversationResult.rows.length === 0) {
      // Create new conversation
      const contactName = payload.sender?.pushName || payload.pushName || payload.name || payload.senderName || cleanPhone;

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
        [conversationId, payload.sender?.pushName || payload.pushName || payload.name]
      );
    }

    // Extract message content
    const { messageType, content, mediaUrl: rawMediaUrl, mediaMimetype } = extractMessageContent(payload);

    console.log('[W-API] Extracted content:', {
      messageType,
      contentLen: content?.length,
      rawMediaUrl: rawMediaUrl?.slice?.(0, 100),
      mediaMimetype,
    });

    // For WhatsApp CDN URLs, the browser can't load them (CORS/auth). Try to cache eagerly (images only)
    const normalizedMediaUrl = normalizeUploadsUrl(rawMediaUrl);
    let effectiveMediaUrl = normalizedMediaUrl;
    let effectiveMediaMimetype = mediaMimetype || null;

    if (messageType === 'image' && normalizedMediaUrl && isWhatsAppCdnUrl(normalizedMediaUrl)) {
      const eager = await withTimeout(
        cacheMedia({
          messageId,
          mediaUrl: normalizedMediaUrl,
          messageType,
          mediaMimetype: effectiveMediaMimetype,
          connection,
        }),
        8000,
        'eager_media_cache_timeout'
      ).catch((err) => {
        console.error('[W-API] Eager media cache failed:', err?.message || err);
        return null;
      });

      if (eager?.publicUrl) {
        effectiveMediaUrl = eager.publicUrl;
        effectiveMediaMimetype = eager.mime || effectiveMediaMimetype;
        console.log('[W-API] Eager cache ok ->', effectiveMediaUrl);
      }
    }

    if (!content && !effectiveMediaUrl) {
      console.log('[W-API] Empty message content, skipping. Full msgContent:', JSON.stringify(payload.msgContent || {}).slice(0, 500));
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

    // Insert message into chat_messages table
    await query(
      `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, media_url, media_mimetype, from_me, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, false, 'received', NOW())`,
      [conversationId, messageId, content, messageType, effectiveMediaUrl, effectiveMediaMimetype]
    );

    console.log('[W-API] Message saved. Type:', messageType, 'MediaURL:', effectiveMediaUrl?.slice?.(0, 100));

    // Cache media in background for reliability (CORS/expiração de URL)
    if (effectiveMediaUrl && shouldCacheExternally(effectiveMediaUrl)) {
      console.log('[W-API] Starting background media cache...');
      cacheMediaAndUpdateMessage({ messageId, mediaUrl: effectiveMediaUrl, messageType, mediaMimetype: effectiveMediaMimetype, connection });
    } else if (messageType !== 'text' && !effectiveMediaUrl) {
      console.log('[W-API] WARNING: Non-text message without mediaUrl! Type:', messageType);
    }
    console.log('[W-API] Incoming message saved:', messageId, 'Type:', messageType, 'From:', cleanPhone);
  } catch (error) {
    console.error('[W-API] Error handling incoming message:', error);
  }
}

/**
 * Handle outgoing message (sent by us, confirmed by W-API webhook)
 * W-API payload structure for webhookDelivery:
 * {
 *   event: "webhookDelivery",
 *   instanceId, connectedPhone, messageId, fromMe: true, fromApi: true,
 *   chat: { id: "5517991308048" },  // destination phone
 *   msgContent: { conversation: "..." }
 * }
 */
async function handleOutgoingMessage(connection, payload) {
  try {
    // W-API format: chat.id is the destination phone for outgoing
    const phone = payload.chat?.id || payload.phone || payload.to || payload.remoteJid?.split('@')[0];
    const messageId = payload.messageId || payload.id || payload.key?.id;

    if (!phone || !messageId) {
      console.log('[W-API] Missing phone or messageId in outgoing:', { phone, messageId });
      return;
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const remoteJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    // Find conversation
    const convResult = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    if (convResult.rows.length === 0) {
      console.log('[W-API] Conversation not found for outgoing message to:', remoteJid);
      return;
    }

    const conversationId = convResult.rows[0].id;
    const { messageType, content, mediaUrl: rawMediaUrl, mediaMimetype } = extractMessageContent(payload);
    const mediaUrl = normalizeUploadsUrl(rawMediaUrl);

    // Check for duplicate or pending message (optimistic UI pattern)
    const existingMsg = await query(
      `SELECT id, message_id FROM chat_messages WHERE message_id = $1 OR 
       (message_id LIKE 'temp_%' AND conversation_id = $2 AND from_me = true AND status = 'pending' 
         AND timestamp > NOW() - INTERVAL '120 seconds')
       ORDER BY CASE WHEN message_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [messageId, conversationId]
    );

    if (existingMsg.rows.length > 0) {
      const existing = existingMsg.rows[0];
      if (existing.message_id === messageId) {
        console.log('[W-API] Outgoing message already exists:', messageId);
        return;
      }
      // Update the pending message with real message ID
      await query(
        `UPDATE chat_messages SET message_id = $1, status = 'sent' WHERE id = $2`,
        [messageId, existing.id]
      );
      console.log('[W-API] Updated pending message with real ID:', messageId);
      return;
    }

    // Insert sent message if not found (e.g., sent from W-API panel directly)
    await query(
      `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, media_url, media_mimetype, from_me, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'sent', NOW())`,
      [conversationId, messageId, content, messageType, mediaUrl, mediaMimetype || null]
    );

    if (mediaUrl && shouldCacheExternally(mediaUrl)) {
      cacheMediaAndUpdateMessage({ messageId, mediaUrl, messageType, mediaMimetype, connection });
    }

    // Update conversation timestamp
    await query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    console.log('[W-API] Outgoing message saved:', messageId, 'To:', cleanPhone);
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
    if (!messageId) return;

    let status = 'sent';

    // W-API status event
    if (payload.event === 'webhookStatus' && typeof payload.status === 'string') {
      const s = payload.status.toUpperCase();
      if (s === 'SERVER') status = 'sent';
      else if (s === 'DELIVERY' || s === 'DELIVERED') status = 'delivered';
      else if (s === 'READ') status = 'read';
      else if (s === 'FAILED' || s === 'ERROR') status = 'failed';
    } else {
      // Legacy ack mapping
      const ack = payload.ack;
      if (ack === 1) status = 'sent';
      else if (ack === 2) status = 'delivered';
      else if (ack === 3) status = 'read';
      else if (ack === -1 || ack === 0) status = 'failed';
    }

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
 * W-API uses msgContent object:
 * - msgContent.conversation: text message
 * - msgContent.imageMessage: image with caption
 * - msgContent.audioMessage: audio
 * - msgContent.videoMessage: video with caption
 * - msgContent.documentMessage: document with filename
 * - msgContent.stickerMessage: sticker
 * 
 * IMPORTANT: W-API may send media WITHOUT a direct URL.
 * In that case, we need to use the W-API download endpoint.
 */
function extractMessageContent(payload) {
  let messageType = 'text';
  let content = '';
  let mediaUrl = null;
  let mediaMimetype = null;

  const msgContent = payload.msgContent || {};

  const pickFirstString = (obj, keys) => {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  const pickMime = (obj) => {
    const m = pickFirstString(obj, ['mimetype', 'mimeType', 'type', 'contentType']);
    return m || null;
  };
  
  // Check for direct media URL at payload level (some W-API versions)
  const payloadMediaUrl = pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'media', 'base64', 'data']);

  // Text message (W-API uses msgContent.conversation)
  if (typeof msgContent.conversation === 'string' && msgContent.conversation) {
    content = msgContent.conversation;
    messageType = 'text';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Extended text message
  if (msgContent.extendedTextMessage) {
    content = msgContent.extendedTextMessage.text || '';
    messageType = 'text';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Text message (W-API uses msgContent.conversation)
  if (typeof msgContent.conversation === 'string' && msgContent.conversation) {
    content = msgContent.conversation;
    messageType = 'text';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Extended text message
  if (msgContent.extendedTextMessage) {
    content = msgContent.extendedTextMessage.text || '';
    messageType = 'text';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Image message
  if (msgContent.imageMessage) {
    messageType = 'image';
    mediaMimetype = pickMime(msgContent.imageMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.imageMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      payloadMediaUrl;
    content = msgContent.imageMessage.caption || '';
    console.log('[W-API Extract] Image message found. MediaURL:', mediaUrl?.slice?.(0, 100), 'MIME:', mediaMimetype);
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Audio message
  if (msgContent.audioMessage) {
    messageType = 'audio';
    mediaMimetype = pickMime(msgContent.audioMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.audioMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = '[Áudio]';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Video message
  if (msgContent.videoMessage) {
    messageType = 'video';
    mediaMimetype = pickMime(msgContent.videoMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.videoMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = msgContent.videoMessage.caption || '';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Document message
  if (msgContent.documentMessage) {
    messageType = 'document';
    mediaMimetype = pickMime(msgContent.documentMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.documentMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = msgContent.documentMessage.fileName || '[Documento]';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Sticker message
  if (msgContent.stickerMessage) {
    messageType = 'sticker';
    mediaMimetype = pickMime(msgContent.stickerMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.stickerMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = '[Figurinha]';
    return { messageType, content, mediaUrl, mediaMimetype };
  }

  // Fallback: legacy format (payload.text, payload.body, etc.)
  if (payload.text || payload.body || payload.message) {
    content = payload.text || payload.body || payload.message;
    if (typeof content === 'object') {
      content = content.text || content.body || content.conversation || JSON.stringify(content);
    }
    messageType = 'text';
  }

  if (payload.image || payload.imageMessage) {
    messageType = 'image';
    mediaMimetype = mediaMimetype || payload.imageMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.image || payload.imageMessage?.url || payload.mediaUrl || payload.url || null;
    content = payload.caption || payload.imageMessage?.caption || '';
  }

  if (payload.audio || payload.audioMessage) {
    messageType = 'audio';
    mediaMimetype = mediaMimetype || payload.audioMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.audio || payload.audioMessage?.url || payload.mediaUrl || payload.url || null;
    content = '[Áudio]';
  }

  if (payload.video || payload.videoMessage) {
    messageType = 'video';
    mediaMimetype = mediaMimetype || payload.videoMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.video || payload.videoMessage?.url || payload.mediaUrl || payload.url || null;
    content = payload.caption || payload.videoMessage?.caption || '';
  }

  if (payload.document || payload.documentMessage) {
    messageType = 'document';
    mediaMimetype = mediaMimetype || payload.documentMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.document || payload.documentMessage?.url || payload.mediaUrl || payload.url || null;
    content = payload.fileName || payload.documentMessage?.fileName || '[Documento]';
  }

  if (payload.sticker || payload.stickerMessage) {
    messageType = 'sticker';
    mediaMimetype = mediaMimetype || payload.stickerMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.sticker || payload.stickerMessage?.url || payload.mediaUrl || payload.url || null;
    content = '[Figurinha]';
  }

  return { messageType, content, mediaUrl, mediaMimetype };
}

export default router;
