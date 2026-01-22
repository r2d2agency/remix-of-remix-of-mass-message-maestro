import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { getSendAttempts, clearSendAttempts, downloadMedia as wapiDownloadMedia, getChats as wapiGetChats, getGroupInfo as wapiGetGroupInfo, getGroups as wapiGetGroups } from '../lib/wapi-provider.js';
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

function sniffExtFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  // WEBP (RIFF....WEBP)
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  // PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  // OGG
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return 'ogg';
  // MP4/QuickTime: ....ftyp
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4';

  return null;
}

async function writeBufferToUploads(buf, messageType, hintedMime) {
  const ext = extFromMime(hintedMime) || sniffExtFromBuffer(buf) || defaultExtByType(messageType);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(filePath, buf);
  return { publicUrl: buildUploadsPublicUrl(filename), mime: hintedMime || null };
}

function downloadToBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;

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

        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location &&
          redirectCount < 3
        ) {
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(downloadToBuffer(nextUrl, redirectCount + 1));
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${status}`));
        }

        const contentType = String(res.headers['content-type'] || '').split(';')[0].trim() || null;
        const chunks = [];

        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType }));
        res.on('error', (err) => reject(err));
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => req.destroy(new Error('Timeout downloading media')));
  });
}

function decryptWhatsAppEncMedia(encBuffer, mediaKeyBase64, messageType) {
  if (!encBuffer || encBuffer.length < 32) throw new Error('Encrypted buffer too small');
  if (!mediaKeyBase64) throw new Error('Missing mediaKey');

  const infoByType = {
    image: 'WhatsApp Image Keys',
    video: 'WhatsApp Video Keys',
    audio: 'WhatsApp Audio Keys',
    document: 'WhatsApp Document Keys',
    sticker: 'WhatsApp Image Keys',
  };

  const info = infoByType[messageType] || infoByType.image;

  const mediaKey = Buffer.from(String(mediaKeyBase64).trim(), 'base64');
  if (!mediaKey || mediaKey.length < 32) throw new Error('Invalid mediaKey');

  // HKDF -> 112 bytes: iv(16) + cipherKey(32) + macKey(32) + refKey(32)
  const expanded = crypto.hkdfSync(
    'sha256',
    mediaKey,
    Buffer.alloc(32, 0),
    Buffer.from(info),
    112
  );

  const iv = Buffer.from(expanded.slice(0, 16));
  const cipherKey = Buffer.from(expanded.slice(16, 48));
  const macKey = Buffer.from(expanded.slice(48, 80));

  const mac = encBuffer.slice(encBuffer.length - 10);
  const ciphertext = encBuffer.slice(0, encBuffer.length - 10);

  const computedMac = crypto
    .createHmac('sha256', macKey)
    .update(Buffer.concat([iv, ciphertext]))
    .digest()
    .slice(0, 10);

  if (!crypto.timingSafeEqual(mac, computedMac)) {
    throw new Error('Media MAC mismatch (encrypted data or wrong key)');
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function cacheMedia({ messageId, mediaUrl, messageType, mediaMimetype, connection, waMediaKey }) {
  const raw = mediaUrl;

  try {
    // WhatsApp CDN URLs are encrypted .enc; if we have mediaKey, decrypt ourselves.
    if (isWhatsAppCdnUrl(raw) && waMediaKey) {
      console.log('[W-API Cache] WhatsApp CDN + mediaKey -> downloading encrypted and decrypting...');
      const { buffer: encBuf, contentType } = await downloadToBuffer(raw);
      const decBuf = decryptWhatsAppEncMedia(encBuf, waMediaKey, messageType);
      const ext = sniffExtFromBuffer(decBuf);
      console.log('[W-API Cache] Decrypted media ok. ext:', ext, 'encBytes:', encBuf.length, 'decBytes:', decBuf.length, 'encCT:', contentType);
      return await writeBufferToUploads(decBuf, messageType, mediaMimetype);
    }

    // If it's a WhatsApp CDN URL and we don't have mediaKey, try W-API download endpoint (best effort)
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

async function cacheMediaAndUpdateMessage({ messageId, mediaUrl, messageType, mediaMimetype, connection, waMediaKey }) {
  console.log('[W-API Cache] Starting media cache for:', messageId, 'URL:', String(mediaUrl).slice(0, 200));

  const cached = await cacheMedia({ messageId, mediaUrl, messageType, mediaMimetype, connection, waMediaKey });
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

// When W-API webhook does not include a direct media URL (common for outgoing from phone),
// fetch the media by messageId via W-API and persist in /uploads.
async function cacheMediaFromWapiDownload({ messageId, messageType, mediaMimetype, connection }) {
  try {
    if (!connection?.instance_id || !connection?.wapi_token) return null;
    if (!messageId) return null;

    const downloadResult = await wapiDownloadMedia(connection.instance_id, connection.wapi_token, messageId);

    if (downloadResult?.success && downloadResult.base64) {
      return await writeDataUrlToUploads(
        downloadResult.base64,
        messageType,
        downloadResult.mimetype || mediaMimetype
      );
    }

    if (downloadResult?.success && downloadResult.url) {
      return await downloadToUploads(
        downloadResult.url,
        messageType,
        downloadResult.mimetype || mediaMimetype
      );
    }

    return null;
  } catch (err) {
    console.error('[W-API Cache] cacheMediaFromWapiDownload failed:', err?.message || err);
    return null;
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

    console.log('[W-API Webhook] Event type:', eventType, 'Instance:', instanceId, 'fromMe:', payload.fromMe, 'chat.id:', payload.chat?.id);

    switch (eventType) {
      case 'message_received':
        console.log('[W-API Webhook] Calling handleIncomingMessage...');
        await handleIncomingMessage(connection, payload);
        console.log('[W-API Webhook] handleIncomingMessage completed');
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
 * Sync contacts from W-API getChats endpoint
 * This fetches all conversations and imports contacts into chat_contacts
 */
router.post('/:connectionId/sync-contacts', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.user?.id;

    const connection = await getAccessibleConnection(connectionId, userId);
    if (!connection) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    // Must be a W-API connection
    if (!connection.instance_id || !connection.wapi_token) {
      return res.status(400).json({ error: 'Esta conexão não é W-API' });
    }

    console.log(`[W-API] Starting contact sync for connection ${connectionId}`);

    // Fetch chats from W-API
    const result = await wapiGetChats(connection.instance_id, connection.wapi_token);

    if (!result.success) {
      console.error('[W-API] getChats failed:', result.error);
      return res.status(500).json({ error: result.error || 'Erro ao buscar contatos da W-API' });
    }

    const contacts = result.contacts || [];
    console.log(`[W-API] Fetched ${contacts.length} contacts from W-API`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const contact of contacts) {
      try {
        // Check if contact already exists
        const existing = await query(
          `SELECT id, name, is_deleted FROM chat_contacts WHERE connection_id = $1 AND phone = $2`,
          [connectionId, contact.phone]
        );

        if (existing.rows.length > 0) {
          const existingContact = existing.rows[0];
          // Update if name changed or was deleted
          if (existingContact.name !== contact.name || existingContact.is_deleted) {
            await query(
              `UPDATE chat_contacts SET name = $1, is_deleted = false, updated_at = NOW() WHERE id = $2`,
              [contact.name || contact.phone, existingContact.id]
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new contact
          await query(
            `INSERT INTO chat_contacts (connection_id, phone, name, jid, profile_picture_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [connectionId, contact.phone, contact.name || contact.phone, contact.jid || null, contact.profilePicture || null]
          );
          imported++;
        }
      } catch (err) {
        console.error('[W-API] Error importing contact:', contact.phone, err.message);
        skipped++;
      }
    }

    console.log(`[W-API] Contact sync complete: imported=${imported}, updated=${updated}, skipped=${skipped}`);

    res.json({
      success: true,
      total: contacts.length,
      imported,
      updated,
      skipped,
    });
  } catch (error) {
    console.error('[W-API] Contact sync error:', error);
    res.status(500).json({ error: error.message });
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
 * Sync group name from W-API for a specific conversation
 */
router.post('/:connectionId/sync-group-name/:conversationId', authenticate, async (req, res) => {
  try {
    const { connectionId, conversationId } = req.params;

    const connection = await getAccessibleConnection(connectionId, req.userId);
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    if (connection.provider !== 'wapi') {
      return res.status(400).json({ error: 'Esta função é apenas para conexões W-API' });
    }

    // Get conversation
    const convResult = await query(
      `SELECT remote_jid, is_group, group_name FROM conversations WHERE id = $1 AND connection_id = $2`,
      [conversationId, connectionId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const conversation = convResult.rows[0];
    if (!conversation.is_group) {
      return res.status(400).json({ error: 'Esta conversa não é um grupo' });
    }

    // Try to get group info from W-API
    const groupInfo = await wapiGetGroupInfo(connection.instance_id, connection.wapi_token, conversation.remote_jid);

    if (!groupInfo.success || !groupInfo.name) {
      return res.json({ 
        success: false, 
        message: 'Não foi possível obter o nome do grupo da W-API',
        current_name: conversation.group_name 
      });
    }

    // Update the conversation with the group name
    await query(
      `UPDATE conversations SET group_name = $1 WHERE id = $2`,
      [groupInfo.name, conversationId]
    );

    console.log('[W-API] Synced group name:', conversation.remote_jid, '->', groupInfo.name);

    res.json({
      success: true,
      group_name: groupInfo.name,
      message: 'Nome do grupo atualizado com sucesso'
    });
  } catch (error) {
    console.error('[W-API] sync-group-name error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar nome do grupo' });
  }
});

/**
 * Sync all group names from W-API for a connection
 * Updates all conversations that are groups but have no group_name
 */
router.post('/:connectionId/sync-all-groups', authenticate, async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connection = await getAccessibleConnection(connectionId, req.userId);
    if (!connection) return res.status(404).json({ error: 'Conexão não encontrada' });

    if (connection.provider !== 'wapi') {
      return res.status(400).json({ error: 'Esta função é apenas para conexões W-API' });
    }

    // Get all group conversations without names
    const groupsResult = await query(
      `SELECT id, remote_jid, group_name FROM conversations 
       WHERE connection_id = $1 AND is_group = true AND (group_name IS NULL OR group_name = '' OR group_name = 'Grupo')`,
      [connectionId]
    );

    if (groupsResult.rows.length === 0) {
      return res.json({ success: true, updated: 0, message: 'Todos os grupos já têm nome' });
    }

    console.log(`[W-API] Syncing ${groupsResult.rows.length} groups without names`);

    // Try to get all groups from W-API first
    const groupsData = await wapiGetGroups(connection.instance_id, connection.wapi_token);
    
    let updated = 0;
    const groupsMap = new Map();
    
    if (groupsData.success && groupsData.groups?.length > 0) {
      // Build a map of JID -> name
      for (const g of groupsData.groups) {
        if (g.jid && g.name) {
          groupsMap.set(g.jid, g.name);
        }
      }
      console.log(`[W-API] Got ${groupsMap.size} group names from bulk fetch`);
    }

    // Update each group
    for (const conv of groupsResult.rows) {
      let groupName = groupsMap.get(conv.remote_jid);
      
      // If not found in bulk, try individual fetch
      if (!groupName) {
        const groupInfo = await wapiGetGroupInfo(connection.instance_id, connection.wapi_token, conv.remote_jid);
        if (groupInfo.success && groupInfo.name) {
          groupName = groupInfo.name;
        }
      }

      if (groupName) {
        await query(
          `UPDATE conversations SET group_name = $1 WHERE id = $2`,
          [groupName, conv.id]
        );
        updated++;
        console.log(`[W-API] Updated group name: ${conv.remote_jid} -> ${groupName}`);
      }
    }

    res.json({
      success: true,
      updated,
      total: groupsResult.rows.length,
      message: `${updated} de ${groupsResult.rows.length} grupos atualizados`
    });
  } catch (error) {
    console.error('[W-API] sync-all-groups error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar nomes dos grupos' });
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
  // webhookReceived can be fromMe=true when sent from the phone directly
  if (event === 'webhookReceived') {
    // Check if it's actually a message we sent from the phone
    if (payload.fromMe === true || payload.isFromMe === true) {
      return 'message_sent';
    }
    return 'message_received';
  }
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
    // W-API format: chat.id is the chat identifier (can be phone or group JID)
    const chatId = payload.chat?.id || payload.phone || payload.from || payload.remoteJid;
    const messageId = payload.messageId || payload.id || payload.key?.id || crypto.randomUUID();

    if (!chatId) {
      console.log('[W-API] No chatId in incoming message, payload:', JSON.stringify(payload).slice(0, 300));
      return;
    }

    // Check if this is a group message
      const isGroup = String(chatId).includes('@g.us') || (String(chatId).includes('-') && !String(chatId).match(/^\d+$/));
    
    // Check if connection allows group messages
    if (isGroup && !connection.show_groups) {
      console.log('[W-API] Skipping group message (show_groups disabled):', chatId);
      return;
    }

    // For individual chats, get the sender info
    const senderId = payload.sender?.id || payload.from || chatId;
    
    // Normalize to JID format
    let remoteJid;
    let cleanPhone = null;
    
    if (isGroup) {
      // Keep group JID as-is
      remoteJid = String(chatId).includes('@') ? chatId : `${chatId}@g.us`;
    } else {
      // Individual chat - normalize phone
      cleanPhone = String(chatId).replace(/\D/g, '').replace(/@.*$/, '');
      remoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;
    }
    
    if (!remoteJid) {
      console.log('[W-API] Invalid chat format:', chatId);
      return;
    }

    // IMPORTANT: Extract message content BEFORE creating conversation
    // This prevents creating empty conversations when message is invalid/empty
    const { messageType, content, mediaUrl: rawMediaUrl, mediaMimetype, waMediaKey } = extractMessageContent(payload);

    console.log('[W-API] Pre-check extracted content:', {
      messageType,
      contentLen: content?.length,
      rawMediaUrl: rawMediaUrl?.slice?.(0, 100),
      mediaMimetype,
      hasMediaKey: Boolean(waMediaKey),
    });

    // Skip if message has no content - don't create empty conversations
    if (!content && !rawMediaUrl) {
      console.log('[W-API] Empty message content, skipping before conversation creation. Full msgContent:', JSON.stringify(payload.msgContent || {}).slice(0, 500));
      return;
    }

    // Get or create conversation
    // First try by remote_jid, then fallback to contact_phone for individual chats
    // This handles cases where remote_jid format changes (@lid vs @s.whatsapp.net)
    console.log('[W-API] Looking for conversation with remote_jid:', remoteJid, 'connection_id:', connection.id);
    
    let conversationResult = await query(
      `SELECT id, remote_jid, contact_phone FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    console.log('[W-API] JID search result:', conversationResult.rows.length > 0 ? conversationResult.rows[0] : 'NOT FOUND');

    // For individual chats, also try matching by phone number if no exact JID match
    if (conversationResult.rows.length === 0 && !isGroup && cleanPhone) {
      console.log('[W-API] No exact JID match, trying by phone:', cleanPhone);
      conversationResult = await query(
        `SELECT id, remote_jid, contact_phone FROM conversations 
         WHERE connection_id = $1 
           AND contact_phone = $2 
           AND COALESCE(is_group, false) = false
         ORDER BY last_message_at DESC
         LIMIT 1`,
        [connection.id, cleanPhone]
      );
      
      console.log('[W-API] Phone search result:', conversationResult.rows.length > 0 ? conversationResult.rows[0] : 'NOT FOUND');
      
      if (conversationResult.rows.length > 0) {
        // Update the remote_jid to the new format
        console.log('[W-API] Found conversation by phone, updating remote_jid from:', conversationResult.rows[0].remote_jid, 'to:', remoteJid);
        await query(
          `UPDATE conversations SET remote_jid = $1 WHERE id = $2`,
          [remoteJid, conversationResult.rows[0].id]
        );
      } else {
        // Also check if there's a conversation with a @lid version of this number
        console.log('[W-API] Checking for @lid variant of phone...');
        const lidResult = await query(
          `SELECT id, remote_jid, contact_phone FROM conversations 
           WHERE connection_id = $1 
             AND (remote_jid LIKE $2 OR remote_jid LIKE $3)
             AND COALESCE(is_group, false) = false
           ORDER BY last_message_at DESC
           LIMIT 1`,
          [connection.id, `%${cleanPhone}@%`, `${cleanPhone}@%`]
        );
        
        if (lidResult.rows.length > 0) {
          console.log('[W-API] Found conversation with alternate JID format:', lidResult.rows[0].remote_jid);
          conversationResult = lidResult;
          await query(
            `UPDATE conversations SET remote_jid = $1, contact_phone = COALESCE(contact_phone, $2) WHERE id = $3`,
            [remoteJid, cleanPhone, conversationResult.rows[0].id]
          );
        }
      }
    }

    let conversationId;
    if (conversationResult.rows.length === 0) {
      // Create new conversation
      // Try multiple sources for group name - W-API sends it in various ways
      const groupName = isGroup
        ? (payload.chat?.name || payload.chat?.groupName || payload.chat?.subject || 
           payload.groupName || payload.groupSubject || payload.subject || 
           payload.group?.name || payload.group?.subject || null)
        : null;

      if (isGroup) {
        console.log('[W-API] Group name extraction - chatId:', chatId, 
          'name:', payload.chat?.name, 
          'groupName:', payload.chat?.groupName,
          'subject:', payload.chat?.subject,
          'payload.groupName:', payload.groupName,
          'extracted:', groupName);
      }

      const contactName = isGroup 
        ? (groupName || 'Grupo')
        : (payload.sender?.pushName || payload.pushName || payload.name || payload.senderName || cleanPhone);

      console.log('[W-API] Creating NEW conversation for:', { 
        remoteJid, 
        cleanPhone, 
        contactName, 
        isGroup,
        connectionId: connection.id 
      });

      try {
        const newConv = await query(
          `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, is_group, group_name, last_message_at, unread_count, attendance_status)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), 1, 'waiting')
           RETURNING id`,
          [connection.id, remoteJid, contactName, isGroup ? null : cleanPhone, isGroup, isGroup ? groupName : null]
        );
        conversationId = newConv.rows[0].id;
        console.log('[W-API] Created new', isGroup ? 'group' : 'conversation:', conversationId, isGroup ? `name: ${groupName}` : '', 'phone:', cleanPhone);
      } catch (insertError) {
        console.error('[W-API] ERROR creating conversation:', insertError.message);
        console.error('[W-API] Insert params:', { connectionId: connection.id, remoteJid, contactName, cleanPhone, isGroup, groupName });
        throw insertError;
      }
      } else {
      conversationId = conversationResult.rows[0].id;

      // Update conversation
      if (isGroup) {
        // For groups, update group_name if we have a new name
        const groupName = payload.chat?.name || payload.chat?.groupName || payload.chat?.subject || 
                         payload.groupName || payload.groupSubject || payload.subject ||
                         payload.group?.name || payload.group?.subject || null;
        
        if (groupName) {
          console.log('[W-API] Updating group name for conversation', conversationId, 'to:', groupName);
        }
        
        await query(
          `UPDATE conversations 
           SET last_message_at = NOW(), 
               unread_count = unread_count + 1,
               group_name = COALESCE($2, group_name),
               is_group = true
           WHERE id = $1`,
          [conversationId, groupName]
        );
      } else {
        // For individual chats, update contact_name with sender's pushName
        await query(
          `UPDATE conversations 
           SET last_message_at = NOW(), 
               unread_count = unread_count + 1,
               contact_name = COALESCE($2, contact_name)
           WHERE id = $1`,
          [conversationId, payload.sender?.pushName || payload.pushName || payload.name]
        );
      }
    }

    // Use already extracted content from above (before conversation creation)
    // messageType, content, rawMediaUrl, mediaMimetype, waMediaKey are already defined

    // For WhatsApp CDN URLs, the browser can't load them (encrypted .enc). Try to cache eagerly (images only)
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
          waMediaKey,
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

    // Content was already validated before conversation creation, but check effectiveMediaUrl
    if (!content && !effectiveMediaUrl) {
      console.log('[W-API] Empty message after media processing, skipping. Full msgContent:', JSON.stringify(payload.msgContent || {}).slice(0, 500));
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

    // Get sender info for group messages
    const senderName = isGroup 
      ? (payload.sender?.pushName || payload.pushName || payload.senderName || null)
      : null;
    const senderPhoneRaw = isGroup 
      ? (payload.sender?.id || senderId)
      : null;
    const senderPhone = senderPhoneRaw 
      ? String(senderPhoneRaw).replace(/@.*$/, '').replace(/\D/g, '')
      : null;

    // Insert message into chat_messages table
    await query(
      `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, media_url, media_mimetype, wa_media_key, from_me, sender_name, sender_phone, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, 'received', NOW())`,
      [conversationId, messageId, content, messageType, effectiveMediaUrl, effectiveMediaMimetype, waMediaKey, senderName, senderPhone]
    );

    console.log('[W-API] Message saved. Type:', messageType, 'MediaURL:', effectiveMediaUrl?.slice?.(0, 100));

    // Cache media in background for reliability (CORS/expiração de URL)
    if (effectiveMediaUrl && shouldCacheExternally(effectiveMediaUrl)) {
      console.log('[W-API] Starting background media cache...');
      cacheMediaAndUpdateMessage({
        messageId,
        mediaUrl: effectiveMediaUrl,
        messageType,
        mediaMimetype: effectiveMediaMimetype,
        connection,
        waMediaKey,
      });
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
    // W-API format: chat.id is the destination phone/group for outgoing
    const chatId = payload.chat?.id || payload.phone || payload.to || payload.remoteJid;
    const messageId = payload.messageId || payload.id || payload.key?.id;

    if (!chatId || !messageId) {
      console.log('[W-API] Missing chatId or messageId in outgoing:', { chatId, messageId });
      return;
    }

    // Check if this is a group message
    const isGroup = String(chatId).includes('@g.us') || (String(chatId).includes('-') && !String(chatId).match(/^\d+$/));
    
    let remoteJid;
    let cleanPhone = null;
    
    if (isGroup) {
      // Keep group JID as-is
      remoteJid = String(chatId).includes('@') ? chatId : `${chatId}@g.us`;
    } else {
      // Individual chat - normalize phone
      cleanPhone = String(chatId).replace(/\D/g, '').replace(/@.*$/, '');
      remoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;
    }

    if (!remoteJid) {
      console.log('[W-API] Invalid chat format for outgoing:', chatId);
      return;
    }

    // Find conversation
    const convResult = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2`,
      [connection.id, remoteJid]
    );

    if (convResult.rows.length === 0) {
      // For outgoing messages from phone, we might need to create the conversation
      console.log('[W-API] Conversation not found for outgoing message to:', remoteJid, '- creating...');
      
      const contactName = isGroup 
        ? (payload.chat?.name || payload.groupName || 'Grupo')
        : (payload.chat?.pushName || cleanPhone);
      
      const newConv = await query(
        `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, is_group, group_name, last_message_at, unread_count)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), 0)
         RETURNING id`,
        [connection.id, remoteJid, contactName, isGroup ? null : cleanPhone, isGroup, isGroup ? contactName : null]
      );
      
      var conversationId = newConv.rows[0].id;
      console.log('[W-API] Created new conversation for outgoing:', conversationId);
    } else {
      var conversationId = convResult.rows[0].id;
    }

    const { messageType, content, mediaUrl: rawMediaUrl, mediaMimetype, waMediaKey } = extractMessageContent(payload);
    let effectiveMediaUrl = normalizeUploadsUrl(rawMediaUrl);
    let effectiveMediaMimetype = mediaMimetype || null;

    // Outgoing media sent from the phone often comes WITHOUT a direct URL.
    // In this case, we must download by messageId to make it renderable in the web UI.
    if (messageType !== 'text') {
      // 1) If we already have a URL but it's external/encrypted, try eager cache (best effort)
      if (effectiveMediaUrl && shouldCacheExternally(effectiveMediaUrl)) {
        const eager = await withTimeout(
          cacheMedia({
            messageId,
            mediaUrl: effectiveMediaUrl,
            messageType,
            mediaMimetype: effectiveMediaMimetype,
            connection,
            waMediaKey,
          }),
          8000,
          'eager_outgoing_media_cache_timeout'
        ).catch(() => null);

        if (eager?.publicUrl) {
          effectiveMediaUrl = eager.publicUrl;
          effectiveMediaMimetype = eager.mime || effectiveMediaMimetype;
        }
      }

      // 2) If we still don't have a usable URL, try downloading by messageId (W-API)
      if (!effectiveMediaUrl) {
        const eagerById = await withTimeout(
          cacheMediaFromWapiDownload({
            messageId,
            messageType,
            mediaMimetype: effectiveMediaMimetype,
            connection,
          }),
          8000,
          'eager_outgoing_media_download_timeout'
        ).catch(() => null);

        if (eagerById?.publicUrl) {
          effectiveMediaUrl = eagerById.publicUrl;
          effectiveMediaMimetype = eagerById.mime || effectiveMediaMimetype;
        }
      }
    }

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
      [conversationId, messageId, content, messageType, effectiveMediaUrl, effectiveMediaMimetype]
    );

    // Background cache as a fallback (so even if eager caching times out, the media will appear later)
    if (effectiveMediaUrl && shouldCacheExternally(effectiveMediaUrl)) {
      cacheMediaAndUpdateMessage({
        messageId,
        mediaUrl: effectiveMediaUrl,
        messageType,
        mediaMimetype: effectiveMediaMimetype,
        connection,
        waMediaKey,
      });
    } else if (messageType !== 'text' && !effectiveMediaUrl) {
      // If there's no URL at all, we still try to fill it later using the messageId.
      cacheMediaFromWapiDownload({ messageId, messageType, mediaMimetype: effectiveMediaMimetype, connection })
        .then((cached) => {
          if (!cached?.publicUrl) return;
          return query(
            `UPDATE chat_messages
             SET media_url = $1,
                 media_mimetype = COALESCE($2, media_mimetype)
             WHERE message_id = $3`,
            [cached.publicUrl, cached.mime || effectiveMediaMimetype, messageId]
          );
        })
        .catch((err) => console.error('[W-API Cache] background download by id failed:', err?.message || err));
    }

    // Update conversation timestamp
    await query(
      `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    console.log('[W-API] Outgoing message saved:', messageId, 'To:', remoteJid);
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
  let waMediaKey = null; // For encrypted WhatsApp media

  const msgContent = payload.msgContent || {};

  // Helper to extract mediaKey from various locations
  const extractMediaKey = (obj) => {
    if (!obj) return null;
    return obj.mediaKey || obj.media_key || obj.key || null;
  };

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
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
  }

  // Extended text message
  if (msgContent.extendedTextMessage) {
    content = msgContent.extendedTextMessage.text || '';
    messageType = 'text';
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
  }

  // Image message
  if (msgContent.imageMessage) {
    messageType = 'image';
    mediaMimetype = pickMime(msgContent.imageMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.imageMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      payloadMediaUrl;
    content = msgContent.imageMessage.caption || '';
    waMediaKey = extractMediaKey(msgContent.imageMessage) || extractMediaKey(payload);
    console.log('[W-API Extract] Image message found. MediaURL:', mediaUrl?.slice?.(0, 100), 'MIME:', mediaMimetype, 'hasMediaKey:', Boolean(waMediaKey));
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
  }

  // Audio message
  if (msgContent.audioMessage) {
    messageType = 'audio';
    mediaMimetype = pickMime(msgContent.audioMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.audioMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = '[Áudio]';
    waMediaKey = extractMediaKey(msgContent.audioMessage) || extractMediaKey(payload);
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
  }

  // Video message
  if (msgContent.videoMessage) {
    messageType = 'video';
    mediaMimetype = pickMime(msgContent.videoMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.videoMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = msgContent.videoMessage.caption || '';
    waMediaKey = extractMediaKey(msgContent.videoMessage) || extractMediaKey(payload);
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
  }

  // Document message
  if (msgContent.documentMessage) {
    messageType = 'document';
    mediaMimetype = pickMime(msgContent.documentMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.documentMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = msgContent.documentMessage.fileName || '[Documento]';
    waMediaKey = extractMediaKey(msgContent.documentMessage) || extractMediaKey(payload);
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
  }

  // Sticker message
  if (msgContent.stickerMessage) {
    messageType = 'sticker';
    mediaMimetype = pickMime(msgContent.stickerMessage) || payload.mediaMimetype || payload.mimetype || null;
    mediaUrl =
      pickFirstString(msgContent.stickerMessage, ['url', 'fileUrl', 'mediaUrl', 'link', 'downloadUrl', 'base64', 'data']) ||
      pickFirstString(payload, ['mediaUrl', 'url', 'fileUrl', 'downloadUrl', 'base64', 'data']);
    content = '[Figurinha]';
    waMediaKey = extractMediaKey(msgContent.stickerMessage) || extractMediaKey(payload);
    return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
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
    waMediaKey = extractMediaKey(payload.imageMessage) || extractMediaKey(payload);
  }

  if (payload.audio || payload.audioMessage) {
    messageType = 'audio';
    mediaMimetype = mediaMimetype || payload.audioMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.audio || payload.audioMessage?.url || payload.mediaUrl || payload.url || null;
    content = '[Áudio]';
    waMediaKey = extractMediaKey(payload.audioMessage) || extractMediaKey(payload);
  }

  if (payload.video || payload.videoMessage) {
    messageType = 'video';
    mediaMimetype = mediaMimetype || payload.videoMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.video || payload.videoMessage?.url || payload.mediaUrl || payload.url || null;
    content = payload.caption || payload.videoMessage?.caption || '';
    waMediaKey = extractMediaKey(payload.videoMessage) || extractMediaKey(payload);
  }

  if (payload.document || payload.documentMessage) {
    messageType = 'document';
    mediaMimetype = mediaMimetype || payload.documentMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.document || payload.documentMessage?.url || payload.mediaUrl || payload.url || null;
    content = payload.fileName || payload.documentMessage?.fileName || '[Documento]';
    waMediaKey = extractMediaKey(payload.documentMessage) || extractMediaKey(payload);
  }

  if (payload.sticker || payload.stickerMessage) {
    messageType = 'sticker';
    mediaMimetype = mediaMimetype || payload.stickerMessage?.mimetype || payload.mimetype || null;
    mediaUrl = payload.sticker || payload.stickerMessage?.url || payload.mediaUrl || payload.url || null;
    content = '[Figurinha]';
    waMediaKey = extractMediaKey(payload.stickerMessage) || extractMediaKey(payload);
  }

  return { messageType, content, mediaUrl, mediaMimetype, waMediaKey };
}

export default router;
