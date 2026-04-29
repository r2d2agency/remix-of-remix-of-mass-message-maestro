// UAZAPI routes — global server config (super-admin) + per-connection actions
import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import * as uaz from '../lib/uazapi-provider.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { assignConnectionMember } from '../lib/connection-members.js';
import { executeFlow, continueFlowWithInput } from '../lib/flow-executor.js';
import { processIncomingWithAgent } from '../lib/ai-agent-processor.js';
import { analyzeGroupMessage } from '../lib/group-secretary.js';
import { parseComparableTimestamp, pickBestPendingMessage, summarizeHandlerOutcomes } from '../lib/message-sync.js';


const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

function guessMimeFromBuffer(buffer, fallback = null) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return fallback;
  const hex = buffer.subarray(0, 12).toString('hex');
  const ascii = buffer.subarray(0, 12).toString('ascii');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (ascii.startsWith('GIF8')) return 'image/gif';
  if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (ascii.slice(4, 8) === 'ftyp') return fallback?.startsWith('audio/') ? fallback : 'video/mp4';
  if (ascii.startsWith('OggS')) return fallback?.startsWith('video/') ? fallback : 'audio/ogg';
  if (hex.startsWith('25504446')) return 'application/pdf';
  return fallback;
}

function uploadsUrl(filename) {
  const baseUrl = process.env.API_BASE_URL || '';
  return `${baseUrl}/uploads/${filename}`;
}

function saveBufferToUploads(buffer, mimetype, originalName = null) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
    const mime = guessMimeFromBuffer(buffer, mimetype);
    const ext = extFromMime(mime);
    
    let filename;
    if (originalName) {
      const cleanOriginal = String(originalName).replace(/[^a-zA-Z0-9.-]/g, '_');
      const nameParts = path.parse(cleanOriginal);
      filename = `uaz_${Date.now()}_${nameParts.name}.${ext}`;
    } else {
      filename = `uaz_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    }

    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`[UAZAPI] Saved buffer to ${filename} (${buffer.length} bytes, mime: ${mime})`);
    return uploadsUrl(filename);
  } catch (err) {
    console.warn('[UAZAPI] saveBufferToUploads failed:', err?.message);
    return null;
  }
}

function extFromMime(mime) {
  if (!mime) return 'bin';
  const m = String(mime).toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('quicktime')) return 'mov';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') && m.includes('audio')) return 'mp3';
  if (m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('aac')) return 'aac';
  if (m.includes('m4a')) return 'm4a';
  if (m.includes('pdf')) return 'pdf';
  return 'bin';
}

function saveBase64ToUploads(base64, mimetype, originalName = null) {
  try {
    let raw = String(base64 || '').trim();
    if (!raw) return null;
    if (raw.startsWith('data:') && raw.includes(',')) raw = raw.split(',')[1];
    raw = raw.replace(/\s/g, '');
    const buf = Buffer.from(raw, 'base64');
    if (!buf || buf.length === 0) return null;
    return saveBufferToUploads(buf, mimetype, originalName);
  } catch (err) {
    console.warn('[UAZAPI] saveBase64ToUploads failed:', err?.message);
    return null;
  }
}

async function cacheRemoteMediaUrl(url, mimetypeHint, originalName = null) {
  try {
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || mimetypeHint;
    const buffer = Buffer.from(await response.arrayBuffer());
    
    let fileName = originalName;
    if (!fileName) {
      try {
        const urlObj = new URL(url);
        const pathName = path.basename(urlObj.pathname);
        if (pathName && pathName.includes('.')) fileName = pathName;
      } catch {}
    }

    return saveBufferToUploads(buffer, contentType, fileName);
  } catch (err) {
    console.warn('[UAZAPI] cacheRemoteMediaUrl failed:', err?.message);
    return null;
  }
}

async function downloadAndPersistMedia(connection, messageId, mimetypeHint, originalName = null) {
  try {
    if (!connection?.uazapi_server_url || !connection?.uazapi_token || !messageId) return null;
    const r = await uaz.downloadMedia({
      serverUrl: connection.uazapi_server_url,
      token: connection.uazapi_token,
      messageId,
    });
    if (!r?.ok || !r?.data) return null;
    const d = r.data;
    const base64 = d.fileBase64 || d.base64 || d.file || d.data || (typeof d === 'string' ? d : null);
    const mime = d.mimetype || d.mimeType || mimetypeHint;
    const fileName = d.fileName || d.filename || d.originalName || originalName;
    if (base64) return saveBase64ToUploads(base64, mime, fileName);
    const downloadedItems = collectMediaItems(d);
    for (const item of downloadedItems) {
      if (item.mediaBase64) return saveBase64ToUploads(item.mediaBase64, item.mediaMimetype || mime, item.fileName || fileName);
      if (item.mediaUrl) {
        const cached = await cacheRemoteMediaUrl(item.mediaUrl, item.mediaMimetype || mime, item.fileName || fileName);
        if (cached) return cached;
      }
    }
    return null;
  } catch (err) {
    console.warn('[UAZAPI] downloadAndPersistMedia failed:', err?.message);
    return null;
  }
}

const router = Router();

function buildAuditOutcome(processResult, processError = null, processed = true) {
  return { processed, processResult, processError };
}

async function updateInboundAudit(auditId, outcome) {
  if (!auditId || !outcome) return;
  await query(
    `UPDATE inbound_webhook_audit
     SET processed = $1, process_result = $2, process_error = $3
     WHERE id = $4`,
    [outcome.processed !== false, outcome.processResult || null, outcome.processError || null, auditId]
  ).catch(() => {});
}

function normalizePhone(value) {
  const raw = String(value || '').replace(/@.*$/, '');
  return raw.replace(/\D/g, '');
}

function normalizeJid(value, isGroup = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw;
  const phone = normalizePhone(raw);
  if (!phone) return null;
  return isGroup ? `${phone}@g.us` : `${phone}@s.whatsapp.net`;
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function typeFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('pdf') || m.includes('msword') || m.includes('vnd.') || m.includes('octet-stream')) return 'document';
  return null;
}

function normalizeMediaType(value) {
  const type = String(value || '').toLowerCase();
  if (type.includes('image')) return 'image';
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('ptt')) return 'audio';
  if (type.includes('document') || type.includes('file')) return 'document';
  if (type.includes('sticker')) return 'sticker';
  return null;
}

function isAlbumPlaceholder(value) {
  return /^album:\s*\d+\s+/i.test(String(value || '').trim());
}

function mediaItemFromObject(obj, forcedType = null) {
  if (!isObject(obj)) return null;
  const mimetype = pickFirstString(obj.mimetype, obj.mimeType, obj.mediaMimetype, obj.contentType);
  const type = forcedType || normalizeMediaType(pickFirstString(obj.messageType, obj.type, obj.mediaType)) || typeFromMime(mimetype);
  const url = pickFirstString(obj.fileURL, obj.fileUrl, obj.mediaUrl, obj.url, obj.downloadUrl, obj.directUrl);
  const base64 = pickFirstString(obj.fileBase64, obj.mediaBase64, obj.base64, obj.file, obj.data);
  const messageId = pickFirstString(obj.messageid, obj.messageId, obj.id, obj.key?.id);
  const caption = pickFirstString(obj.caption, obj.text, obj.body);
  const fileName = pickFirstString(obj.fileName, obj.filename, obj.originalName);
  if (!type || (!url && !base64 && !messageId)) return null;
  return { messageType: type, mediaUrl: url, mediaMimetype: mimetype, mediaBase64: base64, messageId, content: caption, fileName };
}

function collectMediaItems(root, maxDepth = 6) {
  const items = [];
  const seenObjects = new WeakSet();
  const seenItems = new Set();
  const mediaKeys = {
    imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio',
    documentMessage: 'document', stickerMessage: 'sticker', pttMessage: 'audio',
  };
  const skipKeys = new Set(['contextInfo', 'messageContextInfo', 'quotedMessage', 'quoted', 'quotedMsg']);

  const add = (item) => {
    if (!item) return;
    const key = [item.messageType, item.messageId || '', item.mediaUrl || '', item.mediaBase64 ? item.mediaBase64.slice(0, 48) : ''].join('|');
    if (seenItems.has(key)) return;
    seenItems.add(key);
    items.push(item);
  };

  const walk = (node, depth = 0, forcedType = null) => {
    if (!node || depth > maxDepth) return;
    if (Array.isArray(node)) {
      node.forEach((entry) => walk(entry, depth + 1, forcedType));
      return;
    }
    if (!isObject(node) || seenObjects.has(node)) return;
    seenObjects.add(node);

    add(mediaItemFromObject(node, forcedType));
    Object.entries(mediaKeys).forEach(([key, type]) => {
      if (node[key]) {
        const nested = isObject(node[key]) ? { ...node[key], messageId: node[key].messageId || node.messageId || node.id } : node[key];
        add(mediaItemFromObject(nested, type));
        walk(nested, depth + 1, type);
      }
    });

    Object.entries(node).forEach(([key, value]) => {
      if (skipKeys.has(key)) return;
      walk(value, depth + 1, forcedType);
    });
  };

  walk(root);
  return items;
}

function extractUazapiMessage(payload) {
  const data = payload?.data || payload?.message || payload || {};
  const nestedMessage = isObject(data.message) ? data.message : {};
  const content = isObject(data.content) ? data.content : nestedMessage;
  
  // UAZAPI often puts media info in 'data' directly or in 'data.message'
  const msgTypeRaw = pickFirstString(data.messageType, data.type, data.mediaType, content.type) || 'text';
  let messageType = String(msgTypeRaw).toLowerCase();
  
  if (messageType.includes('image')) messageType = 'image';
  else if (messageType.includes('audio') || messageType.includes('ptt')) messageType = 'audio';
  else if (messageType.includes('video')) messageType = 'video';
  else if (messageType.includes('document') || messageType.includes('file')) messageType = 'document';
  else if (messageType.includes('sticker')) messageType = 'sticker';
  else if (data.imageMessage || data.videoMessage || data.audioMessage || data.documentMessage || data.stickerMessage || nestedMessage.imageMessage || nestedMessage.videoMessage || nestedMessage.audioMessage || nestedMessage.documentMessage || nestedMessage.stickerMessage) {
    if (data.imageMessage || nestedMessage.imageMessage) messageType = 'image';
    else if (data.videoMessage || nestedMessage.videoMessage) messageType = 'video';
    else if (data.audioMessage || nestedMessage.audioMessage) messageType = 'audio';
    else if (data.documentMessage || nestedMessage.documentMessage) messageType = 'document';
    else if (data.stickerMessage || nestedMessage.stickerMessage) messageType = 'sticker';
  } else {
    messageType = 'text';
  }

  const text = pickFirstString(
    data.text,
    data.body,
    data.caption,
    data.imageMessage?.caption,
    data.videoMessage?.caption,
    data.documentMessage?.caption,
    content.text,
    content.caption,
    content.conversation,
    content.body
  );

  const mediaUrl = pickFirstString(
    data.fileURL,
    data.fileUrl,
    data.mediaUrl,
    data.url,
    data.imageMessage?.url,
    data.videoMessage?.url,
    data.audioMessage?.url,
    data.documentMessage?.url,
    data.stickerMessage?.url,
    content.url,
    content.fileURL,
    content.fileUrl,
    content.mediaUrl
  );

  const mediaMimetype = pickFirstString(
    data.mimetype,
    data.mimeType,
    data.imageMessage?.mimetype,
    data.videoMessage?.mimetype,
    data.audioMessage?.mimetype,
    data.documentMessage?.mimetype,
    data.stickerMessage?.mimetype,
    content.mimetype,
    content.mimeType
  );

  const mediaBase64 = pickFirstString(
    data.fileBase64,
    data.base64,
    data.imageMessage?.base64,
    data.videoMessage?.base64,
    data.audioMessage?.base64,
    data.documentMessage?.base64,
    data.stickerMessage?.base64,
    content.base64,
    content.fileBase64
  );

  let mediaItems = collectMediaItems(data);
  if (mediaUrl || mediaBase64) {
    const existing = mediaItems.find(item => item.mediaUrl === mediaUrl || (mediaBase64 && item.mediaBase64 === mediaBase64));
    if (!existing) {
      mediaItems = [{
        messageType: (['image', 'video', 'audio', 'document', 'sticker'].includes(messageType) ? messageType : null) || typeFromMime(mediaMimetype) || 'image',
        mediaUrl,
        mediaMimetype,
        mediaBase64,
        messageId: pickFirstString(data.messageid, data.messageId, data.id, payload?.id),
        content: text,
        fileName: pickFirstString(data.fileName, data.filename, data.originalName, content.fileName, content.filename),
      }, ...mediaItems];
    }
  }
  mediaItems = mediaItems.filter((item) => ['image', 'video', 'audio', 'document', 'sticker'].includes(item.messageType));
  if (messageType === 'text' && mediaItems.length > 0) messageType = mediaItems[0].messageType;

  // Fallback for caption in text messages if content is actually a caption
  const finalContent = text || (['image', 'video', 'audio', 'document', 'sticker'].includes(messageType) ? null : '');

  return {
    data,
    messageId: pickFirstString(data.messageid, data.messageId, data.id, payload?.id) || crypto.randomUUID(),
    chatId: pickFirstString(data.chatid, data.chatId, data.remoteJid, data.from, data.to, payload?.chatid, payload?.chatId),
    sender: pickFirstString(data.sender, data.sender_pn, data.sender_lid, data.owner),
    senderName: pickFirstString(data.senderName, data.pushName, data.name),
    fromMe: data.fromMe === true || data.wasSentByApi === true,
    isGroup: data.isGroup === true || String(data.chatid || data.chatId || '').includes('@g.us'),
    messageType,
    content: finalContent,
    mediaUrl,
    mediaMimetype,
    mediaBase64,
    mediaItems,
    timestamp: data.messageTimestamp || data.timestamp || payload?.timestamp || null,
  };
}

async function findUazapiConnection(payload, req) {
  const possible = [
    payload?.token,
    payload?.instance?.token,
    payload?.data?.token,
    req.headers['x-token'],
  ].filter(Boolean);

  for (const token of possible) {
    const c = await query(`SELECT * FROM connections WHERE provider = 'uazapi' AND uazapi_token = $1 LIMIT 1`, [token]);
    if (c.rows[0]) return c.rows[0];
  }

  const instanceName = payload?.instanceName || payload?.instance?.name || payload?.instance || payload?.data?.instance || null;
  const owner = payload?.owner || payload?.instance?.owner || payload?.data?.owner || null;
  const instanceRef = instanceName || owner || payload?.instance?.id || null;

  if (instanceRef) {
    const c = await query(
      `SELECT * FROM connections
       WHERE provider = 'uazapi'
         AND (uazapi_instance_name = $1 OR phone_number = $1 OR uazapi_token = $1)
       LIMIT 1`,
      [String(instanceRef)]
    );
    if (c.rows[0]) return c.rows[0];
  }

  return null;
}

async function loadPendingMessagesForConversation(conversationId) {
  if (!conversationId) return [];
  const result = await query(
    `SELECT id, message_id, content, message_type, media_mimetype, quoted_message_id, timestamp
     FROM chat_messages
     WHERE conversation_id = $1
       AND from_me = true
       AND status = 'pending'
       AND message_id LIKE 'temp_%'
       AND timestamp > NOW() - INTERVAL '10 minutes'
     ORDER BY timestamp DESC
     LIMIT 20`,
    [conversationId]
  );
  return result.rows;
}

async function saveUazapiMessage(connection, payload, req = null) {
  const msg = extractUazapiMessage(payload);
  if (!msg.chatId) return buildAuditOutcome('skipped', 'message without chat id', false);
  if (msg.fromMe && msg.data.wasSentByApi === true) return buildAuditOutcome('ignored', 'message sent by api ignored', true);

  const remoteJid = normalizeJid(msg.chatId, msg.isGroup);
  if (!remoteJid) return buildAuditOutcome('skipped', 'invalid chat id', false);

  const cleanPhone = msg.isGroup ? null : normalizePhone(msg.chatId);
  const contactName = msg.isGroup
    ? (pickFirstString(msg.data.chatName, msg.data.groupName, msg.data.name) || 'Grupo')
    : (msg.senderName || cleanPhone);

  // Find existing conversation using LID fallback for UAZAPI
  const senderLid = msg.data?.sender_lid || msg.data?.chatlid;
  let conversationId = null;

  // 1. Try exact remoteJid
  let conv = await query(`SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2 LIMIT 1`, [connection.id, remoteJid]);
  conversationId = conv.rows[0]?.id;

  // 2. Try LID fallback
  if (!conversationId && senderLid) {
    const lidJid = `${senderLid}@lid`;
    conv = await query(`SELECT id FROM conversations WHERE connection_id = $1 AND remote_jid = $2 LIMIT 1`, [connection.id, lidJid]);
    conversationId = conv.rows[0]?.id;
  }

  // 3. Try Phone fallback
  if (!conversationId && cleanPhone) {
    conv = await query(
      `SELECT id FROM conversations WHERE connection_id = $1 AND contact_phone = $2 AND COALESCE(is_group, false) = false ORDER BY last_message_at DESC LIMIT 1`,
      [connection.id, cleanPhone]
    );
    conversationId = conv.rows[0]?.id;
  }

  // 4. Try legacy/migrated conversation search (without connection_id filter)
  if (!conversationId) {
    const migrated = await query(
      `SELECT id FROM conversations 
       WHERE (remote_jid = $1 OR (contact_phone = $2 AND contact_phone IS NOT NULL)) 
       AND is_group = $3 
       ORDER BY last_message_at DESC LIMIT 1`,
      [remoteJid, cleanPhone, msg.isGroup]
    );
    
    if (migrated.rows[0]) {
      conversationId = migrated.rows[0].id;
      console.log(`[UAZAPI] Linked message to migrated conversation ${conversationId}`);
    }
  }

  if (!conversationId) {
    const inserted = await query(
      `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, is_group, group_name, last_message_at, unread_count, attendance_status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
       RETURNING id`,
      [connection.id, remoteJid, contactName, cleanPhone, msg.isGroup, msg.isGroup ? contactName : null, msg.fromMe ? 0 : 1, msg.fromMe ? 'attending' : 'waiting']
    );
    conversationId = inserted.rows[0].id;
  } else {
    // Re-check and update to ensure correctly pointed to current connection if it was migrated
    // Use a transaction or careful update to prevent losing the conversation if connection_id changes
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           unread_count = CASE WHEN $2 THEN unread_count ELSE unread_count + 1 END,
           contact_name = CASE 
             WHEN $3 IS NOT NULL AND $3 != '' AND (contact_name IS NULL OR contact_name = contact_phone OR contact_name = 'Grupo' OR contact_name = 'Conta Dr Luis Sbroggio') 
             THEN $3 
             ELSE contact_name 
           END,
           remote_jid = $4,
           connection_id = $5,
           attendance_status = CASE WHEN NOT $2 AND attendance_status = 'finished' THEN 'waiting' ELSE attendance_status END,
           accepted_at = CASE WHEN NOT $2 AND attendance_status = 'finished' THEN NULL ELSE accepted_at END,
           accepted_by = CASE WHEN NOT $2 AND attendance_status = 'finished' THEN NULL ELSE accepted_by END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversationId, msg.fromMe, contactName, remoteJid, connection.id]
    );
  }

  // Ensure any existing messages for this conversation are also correctly associated with the connection 
  // if they aren't already, so the chat history loads correctly in the frontend filters.
  const hasCMConnId = await query(
    `SELECT 1 FROM information_schema.columns 
     WHERE table_name = 'chat_messages' AND column_name = 'connection_id' LIMIT 1`
  ).then(r => r.rowCount > 0).catch(() => false);

  if (hasCMConnId) {
    await query(
      `UPDATE chat_messages SET connection_id = $1 
       WHERE conversation_id = $2 AND (connection_id IS NULL OR connection_id != $1)`,
      [connection.id, conversationId]
    ).catch(e => console.warn('[UAZAPI] chat_messages connection_id update failed:', e.message));
  }

  let mediaEntries = msg.mediaItems?.length
    ? msg.mediaItems
    : (['image', 'video', 'audio', 'document', 'sticker'].includes(msg.messageType) 
        ? [{ messageType: msg.messageType, mediaUrl: msg.mediaUrl, mediaMimetype: msg.mediaMimetype, mediaBase64: msg.mediaBase64, messageId: msg.messageId, content: msg.content }]
        : []);

  if ((mediaEntries.length === 0 || isAlbumPlaceholder(msg.content)) && msg.messageId && connection?.uazapi_server_url && connection?.uazapi_token) {
    console.log(`[UAZAPI] Attempting to download media for message ${msg.messageId} (entries: ${mediaEntries.length})`);
    const downloaded = await uaz.downloadMedia({
      serverUrl: connection.uazapi_server_url,
      token: connection.uazapi_token,
      messageId: msg.messageId,
    }).catch((e) => {
      console.warn(`[UAZAPI] Download attempt failed for ${msg.messageId}:`, e.message);
      return null;
    });
    const downloadedItems = downloaded?.ok ? collectMediaItems(downloaded.data).filter((item) => ['image', 'video', 'audio', 'document', 'sticker'].includes(item.messageType)) : [];
    if (downloadedItems.length > 0) {
      console.log(`[UAZAPI] Downloaded ${downloadedItems.length} media items for ${msg.messageId}`);
      mediaEntries = downloadedItems.map((item) => ({ ...item, content: isAlbumPlaceholder(msg.content) ? null : (item.content || msg.content) }));
    } else if (downloaded?.ok) {
       console.log(`[UAZAPI] Download for ${msg.messageId} returned OK but no media items found in payload`);
    }
  }

  for (let i = 0; i < mediaEntries.length; i++) {
    const entry = mediaEntries[i];
    const isMediaType = ['image', 'video', 'audio', 'document', 'sticker'].includes(entry.messageType);
    let resolvedMediaUrl = null;
    
    if (entry.mediaBase64) {
      resolvedMediaUrl = saveBase64ToUploads(entry.mediaBase64, entry.mediaMimetype, entry.fileName);
    }
    
    if (!resolvedMediaUrl && entry.mediaUrl) {
      resolvedMediaUrl = await cacheRemoteMediaUrl(entry.mediaUrl, entry.mediaMimetype, entry.fileName);
      if (!resolvedMediaUrl) resolvedMediaUrl = entry.mediaUrl;
    }
    
    if (!resolvedMediaUrl && isMediaType && (entry.messageId || msg.messageId)) {
      resolvedMediaUrl = await downloadAndPersistMedia(connection, entry.messageId || msg.messageId, entry.mediaMimetype, entry.fileName);
    }

    console.log(`[UAZAPI] Message ${msg.messageId} entry ${i}: type=${entry.messageType}, resolvedUrl=${resolvedMediaUrl ? 'YES' : 'NO'}`);

    const content = isAlbumPlaceholder(entry.content || msg.content) ? null : (entry.content || msg.content || null);
    const storedMessageId = mediaEntries.length > 1 ? `${msg.messageId}_${i + 1}` : msg.messageId;
    const hasCMConnIdCurrent = await query(
      `SELECT 1 FROM information_schema.columns 
       WHERE table_name = 'chat_messages' AND column_name = 'connection_id' LIMIT 1`
    ).then(r => r.rowCount > 0).catch(() => false);

    const insertCols = [
      'conversation_id', 'message_id', 'content', 'raw_text', 'caption', 'message_type', 
      'media_url', 'media_mimetype', 'from_me', 'sender_name', 'sender_phone', 'status', 'timestamp'
    ];
    const insertVals = [
      conversationId, storedMessageId, content, content, (['image','video','document'].includes(entry.messageType) || content) ? content : null, 
      entry.messageType, resolvedMediaUrl, entry.mediaMimetype, msg.fromMe, msg.isGroup ? msg.senderName : null, 
      msg.isGroup ? normalizePhone(msg.sender) : null, msg.fromMe ? 'sent' : 'received', Number(msg.timestamp) || null
    ];

    if (hasCMConnIdCurrent) {
      insertCols.push('connection_id');
      insertVals.push(connection.id);
    }

    const placeholders = insertVals.map((_, idx) => {
      if (idx === 12) return `COALESCE(to_timestamp($13::double precision / 1000), NOW())`;
      return `$${idx + 1}`;
    });

    await query(
      `INSERT INTO chat_messages (${insertCols.join(', ')})
       VALUES (${placeholders.join(', ')})
       ON CONFLICT (message_id) WHERE message_id IS NOT NULL AND message_id NOT LIKE 'temp_%' DO UPDATE 
       SET connection_id = EXCLUDED.connection_id 
       WHERE chat_messages.connection_id IS NULL OR chat_messages.connection_id != EXCLUDED.connection_id`,
      insertVals
    ).catch(async (err) => {
      // If insertion fails due to duplicate message_id (race condition), it's already "saved"
      if (err.code === '23505') return;
      
      // Fallback: try to link to a pending message if it was sent by us
      if (msg.fromMe) {
        const pending = await loadPendingMessagesForConversation(conversationId);
        const best = pickBestPendingMessage(pending, {
          content: msg.content,
          timestamp: msg.timestamp,
          messageType: msg.messageType,
          mediaMimetype: msg.mediaMimetype
        });
        
        if (best) {
          await query(
            `UPDATE chat_messages SET message_id = $1, status = 'sent', timestamp = COALESCE($2, timestamp) WHERE id = $3`,
            [msg.messageId, msg.timestamp ? new Date(Number(msg.timestamp)) : null, best.id]
          );
        }
      }
      throw err;
    });
  }

  // -------------------------------------------------------------------
  // POST-PROCESSING: Flows, AI Agents, Group Secretary, Notifications
  // -------------------------------------------------------------------
  if (conversationId && !msg.fromMe) {
    const convoResult = await query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    const convo = convoResult.rows[0];

    if (convo) {
      // 1. Group Secretary (if group)
      if (convo.is_group) {
        await analyzeGroupMessage(connection, convo, {
          id: msg.messageId,
          content: msg.content,
          sender_name: msg.senderName,
          sender_phone: msg.sender,
        }).catch(err => console.warn('[UAZAPI] Group secretary error:', err.message));
      }

      // 2. Flow Executor / AI Agent (only if individual or specifically enabled)
      const shouldProcessAuto = !convo.is_group || connection.process_groups_auto === true;
      
      if (shouldProcessAuto && convo.attendance_status !== 'attending') {
        // Try to continue flow
        const flowProcessed = await continueFlowWithInput(connection, convo, msg.content)
          .catch(err => {
            console.warn('[UAZAPI] Flow continue error:', err.message);
            return false;
          });

        // If no flow was continued, try AI Agent
        if (!flowProcessed) {
          await processIncomingWithAgent(connection, convo, {
            id: msg.messageId,
            content: msg.content,
            messageType: msg.messageType,
          }).catch(err => console.warn('[UAZAPI] AI Agent error:', err.message));
        }
      }
    }
  }

  // 4. Update the real-time UI via Socket.IO if possible (frontend expects this for instant updates)
  try {
    const io = req?.app?.get('socketio');
    if (io && conversationId) {
      const msgData = {
        conversationId,
        message: {
          id: msg.messageId,
          content: msg.content,
          messageType: msg.messageType,
          mediaUrl: msg.mediaUrl,
          fromMe: msg.fromMe,
          timestamp: msg.timestamp || Date.now(),
          status: msg.fromMe ? 'sent' : 'received'
        }
      };
      io.to(`org_${connection.organization_id}`).emit('new_message', msgData);
      io.to(`conv_${conversationId}`).emit('new_message', msgData);
    }
  } catch (err) {
    console.warn('[UAZAPI] Socket emit failed:', err.message);
  }

  return buildAuditOutcome('saved', null, true);
}

// ----- helpers -----
async function isSuperadmin(userId) {
  const r = await query(
    `SELECT is_superadmin FROM users WHERE id = $1`,
    [userId]
  );
  return !!r.rows[0]?.is_superadmin;
}

async function requireSuperadmin(req, res, next) {
  if (!(await isSuperadmin(req.userId))) {
    return res.status(403).json({ error: 'Apenas super-admin' });
  }
  next();
}

async function getUserOrganization(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role
       FROM organization_members om
      WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function getConnectionWithAccess(connectionId, userId) {
  const org = await getUserOrganization(userId);
  let result;
  if (org) {
    result = await query(
      `SELECT * FROM connections
        WHERE id = $1 AND provider = 'uazapi'
          AND (organization_id = $2
               OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $3))
        LIMIT 1`,
      [connectionId, org.organization_id, userId]
    );
  } else {
    result = await query(
      `SELECT * FROM connections
        WHERE id = $1 AND provider = 'uazapi'
          AND (user_id = $2
               OR id IN (SELECT connection_id FROM connection_members WHERE user_id = $2))
        LIMIT 1`,
      [connectionId, userId]
    );
  }
  return result.rows[0] || null;
}

// ============================================================
//  PUBLIC: webhook receiver (no auth — UAZAPI hits this)
// ============================================================
router.post('/webhook', async (req, res) => {
  // Always 200 fast so UAZAPI doesn't retry storms
  res.status(200).json({ ok: true });

  try {
    const payload = req.body || {};
    const eventType = (payload.event || payload.EventType || payload.type || 'unknown').toLowerCase();
    
    const connection = await findUazapiConnection(payload, req);
    const connectionId = connection?.id || null;
    const data = payload.data || payload.message || payload;
    
    // Log the event for diagnostics
    await query(
      `INSERT INTO uazapi_webhook_events (connection_id, event_type, payload, status)
       VALUES ($1, $2, $3, 'received')`,
      [connectionId, eventType, JSON.stringify(payload)]
    ).catch(() => {});

    if (!connection) {
      console.warn('[UAZAPI Webhook] Connection not found for payload:', JSON.stringify(payload).slice(0, 200));
      return;
    }

    const eventMsgId = data?.messageid || data?.messageId || data?.id || payload.id || null;
    const remoteJid = data?.chatid || data?.chatId || data?.remoteJid || data?.from || data?.to || null;
    const fromMe = data?.fromMe === true || data?.wasSentByApi === true;
    let auditId = null;

    try {
      const auditResult = await query(
        `INSERT INTO inbound_webhook_audit (provider, connection_id, event_id, event_type, remote_jid, instance_id, from_me, payload, received_at)
         VALUES ('uazapi', $1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
         ON CONFLICT (provider, event_id) WHERE event_id IS NOT NULL DO UPDATE SET received_at = NOW()
         RETURNING id`,
        [connectionId, eventMsgId, eventType, remoteJid, connection?.uazapi_instance_name || null, fromMe, JSON.stringify(payload).slice(0, 8000)]
      );
      auditId = auditResult.rows[0]?.id || null;
    } catch (auditErr) {
      console.warn('[UAZAPI webhook] Audit insert skipped:', auditErr?.message);
    }

    // Process messages
    if (eventType === 'messages' || eventType === 'message' || eventType === 'messages.upsert' || data?.messageid || data?.messageId) {
      const outcome = await saveUazapiMessage(connection, payload, req);
      await updateInboundAudit(auditId, outcome);
    } 
    // Process connection status
    else if (eventType === 'connection' || eventType === 'connection.update') {
      const state = (payload.instance?.status || payload.status || data?.status || '').toLowerCase();
      if (['connected', 'open', 'ready'].includes(state)) {
        await query(
          `UPDATE connections
              SET status='connected',
                  phone_number=COALESCE($2, phone_number),
                  updated_at=NOW()
            WHERE id=$1`,
          [connectionId, payload.instance?.owner || payload.owner || data?.owner || null]
        );
      } else if (['disconnected', 'close', 'deleted', 'removed'].includes(state)) {
        await query(
          `UPDATE connections SET status='disconnected', updated_at=NOW() WHERE id=$1`,
          [connectionId]
        );
      }
      await updateInboundAudit(auditId, buildAuditOutcome('saved', null, true));
    } else {
      await updateInboundAudit(auditId, buildAuditOutcome('ignored', `unhandled event type: ${eventType}`, true));
    }
  } catch (err) {
    console.error('[UAZAPI webhook] Critical Error:', err);
  }
});

// All endpoints below require auth
router.use(authenticate);

// ============================================================
//  SUPER-ADMIN: global server config CRUD
// ============================================================
router.get('/servers', requireSuperadmin, async (_req, res) => {
  const r = await query(
    `SELECT id, name, server_url, is_default, is_active, notes, created_at, updated_at
       FROM uazapi_servers ORDER BY created_at DESC`
  );
  res.json(r.rows);
});

router.post('/servers', requireSuperadmin, async (req, res) => {
  try {
    const { name, server_url, admin_token, is_default = true, notes } = req.body || {};
    if (!name || !server_url || !admin_token) {
      return res.status(400).json({ error: 'name, server_url e admin_token são obrigatórios' });
    }
    if (is_default) {
      await query(`UPDATE uazapi_servers SET is_default=FALSE WHERE is_default=TRUE`);
    }
    const r = await query(
      `INSERT INTO uazapi_servers (name, server_url, admin_token, is_default, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, server_url, is_default, is_active, notes`,
      [name, server_url.replace(/\/+$/, ''), admin_token, !!is_default, notes || null, req.userId]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[UAZAPI] create server', err);
    res.status(500).json({ error: 'Erro ao criar servidor UAZAPI' });
  }
});

router.patch('/servers/:id', requireSuperadmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, server_url, admin_token, is_default, is_active, notes } = req.body || {};
    if (is_default === true) {
      await query(`UPDATE uazapi_servers SET is_default=FALSE WHERE is_default=TRUE`);
    }
    const r = await query(
      `UPDATE uazapi_servers SET
         name = COALESCE($2, name),
         server_url = COALESCE($3, server_url),
         admin_token = COALESCE($4, admin_token),
         is_default = COALESCE($5, is_default),
         is_active = COALESCE($6, is_active),
         notes = COALESCE($7, notes)
       WHERE id = $1
       RETURNING id, name, server_url, is_default, is_active, notes`,
      [id, name, server_url ? server_url.replace(/\/+$/, '') : null, admin_token, is_default, is_active, notes]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Servidor não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[UAZAPI] update server', err);
    res.status(500).json({ error: 'Erro ao atualizar servidor' });
  }
});

router.delete('/servers/:id', requireSuperadmin, async (req, res) => {
  await query(`DELETE FROM uazapi_servers WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

// Test reachability of a server
router.post('/servers/:id/test', requireSuperadmin, async (req, res) => {
  const r = await query(`SELECT server_url, admin_token FROM uazapi_servers WHERE id=$1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Servidor não encontrado' });
  const result = await uaz.adminListInstances({
    serverUrl: r.rows[0].server_url,
    adminToken: r.rows[0].admin_token,
  });
  res.json({ ok: result.ok, status: result.status, data: result.data });
});

// Public-ish (auth'd) info: does the org have UAZAPI available?
router.get('/server-info', async (_req, res) => {
  const s = await uaz.getDefaultServer();
  if (!s) return res.json({ available: false });
  res.json({ available: true, serverUrl: s.server_url, name: s.name });
});

// ============================================================
//  CLIENT: create UAZAPI instance using global server
// ============================================================
router.post('/instances', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const server = await uaz.getDefaultServer();
    if (!server) {
      return res.status(503).json({ error: 'Nenhum servidor UAZAPI configurado pelo super-admin' });
    }

    // 1) Create instance via admin endpoint
    const created = await uaz.adminCreateInstance({
      serverUrl: server.server_url,
      adminToken: server.admin_token,
      name,
    });
    if (!created.ok) {
      return res.status(502).json({
        error: 'Falha ao criar instância no servidor UAZAPI',
        detail: created.data,
      });
    }
    const instance = created.data?.instance || created.data || {};
    const token = instance.token || created.data?.token;
    const instanceName = instance.name || name;

    if (!token) {
      return res.status(502).json({ error: 'Servidor UAZAPI não retornou token da instância' });
    }

    // 2) Persist as a connection
    const org = await getUserOrganization(req.userId);
    const ins = await query(
      `INSERT INTO connections
         (user_id, organization_id, provider, name,
          uazapi_token, uazapi_instance_name, uazapi_server_url, status)
       VALUES ($1, $2, 'uazapi', $3, $4, $5, $6, 'disconnected')
       RETURNING *`,
      [
        req.userId,
        org?.organization_id || null,
        name,
        token,
        instanceName,
        server.server_url,
      ]
    );
    const connection = ins.rows[0];

    await assignConnectionMember(connection.id, req.userId, { canManage: true })
      .catch((e) => console.warn('[UAZAPI] could not assign creator to connection:', e?.message));

    // 3) Configure webhook (always — infer public URL if env is missing)
    const inferredBase =
      process.env.BACKEND_PUBLIC_URL ||
      process.env.WEBHOOK_BASE_URL ||
      `${req.protocol}://${req.get('host')}`;
    const whUrl = `${String(inferredBase).replace(/\/+$/, '')}/api/uazapi/webhook`;

    let webhookResult = { ok: false, status: 0, data: null };
    try {
      webhookResult = await uaz.configureWebhook({
        serverUrl: server.server_url,
        token,
        webhookUrl: whUrl,
      });
      console.log('[UAZAPI] webhook config result:', {
        connectionId: connection.id,
        webhookUrl: whUrl,
        ok: webhookResult.ok,
        status: webhookResult.status,
        data: webhookResult.data,
      });
    } catch (e) {
      console.error('[UAZAPI] webhook config exception:', e?.message);
      webhookResult = { ok: false, status: 0, data: { error: e?.message } };
    }

    // Audit the webhook configuration in the events table for visibility
    await query(
      `INSERT INTO uazapi_webhook_events (connection_id, event_type, payload, status, error)
       VALUES ($1, 'webhook_setup', $2, $3, $4)`,
      [
        connection.id,
        JSON.stringify({ webhookUrl: whUrl, response: webhookResult.data }),
        webhookResult.ok ? 'configured' : 'failed',
        webhookResult.ok ? null : `HTTP ${webhookResult.status}`,
      ]
    ).catch((e) => console.warn('[UAZAPI] could not log webhook setup:', e?.message));

    connection.webhook_configured = webhookResult.ok;
    connection.webhook_url = whUrl;

    res.status(201).json(connection);
  } catch (err) {
    console.error('[UAZAPI] create instance', err);
    res.status(500).json({ error: 'Erro ao criar instância UAZAPI' });
  }
});

// ============================================================
//  CLIENT: per-connection actions
// ============================================================
router.get('/:connectionId/status', async (req, res) => {
  try {
    const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
    if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
    if (!c.uazapi_token || !c.uazapi_server_url) {
      return res.json({ status: c.status || 'disconnected', phoneNumber: c.phone_number, provider: 'uazapi' });
    }
    const r = await uaz.getStatus({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
    await query(
      `UPDATE connections SET status=$2, phone_number=COALESCE($3, phone_number), updated_at=NOW() WHERE id=$1`,
      [c.id, r.status, r.phoneNumber || null]
    );
    res.json({ ...r, provider: 'uazapi' });
  } catch (err) {
    console.error('[UAZAPI] status error', err);
    res.json({ status: 'disconnected', provider: 'uazapi', error: err?.message || 'status_error' });
  }
});

router.post('/:connectionId/connect', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const { phone } = req.body || {};
  const r = await uaz.connect({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    phone,
  });
  res.json(r);
});

router.post('/:connectionId/disconnect', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await uaz.disconnect({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
  await query(`UPDATE connections SET status='disconnected', updated_at=NOW() WHERE id=$1`, [c.id]);
  res.json(r);
});

router.post('/:connectionId/reconfigure-webhook', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const inferredBase =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.WEBHOOK_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  const whUrl = req.body?.url || `${String(inferredBase).replace(/\/+$/, '')}/api/uazapi/webhook`;
  const r = await uaz.configureWebhook({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    webhookUrl: whUrl,
  });
  await query(
    `INSERT INTO uazapi_webhook_events (connection_id, event_type, payload, status, error)
     VALUES ($1, 'webhook_setup', $2, $3, $4)`,
    [
      c.id,
      JSON.stringify({ webhookUrl: whUrl, response: r.data }),
      r.ok ? 'configured' : 'failed',
      r.ok ? null : `HTTP ${r.status}`,
    ]
  ).catch(() => {});
  res.json({ ok: r.ok, status: r.status, webhookUrl: whUrl, data: r.data });
});

// Send actions
router.post('/:connectionId/send/text', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const { phone, text } = req.body || {};
  if (!phone || !text) return res.status(400).json({ error: 'phone e text obrigatórios' });
  const r = await uaz.sendText({ serverUrl: c.uazapi_server_url, token: c.uazapi_token, phone, text });
  res.status(r.ok ? 200 : 502).json(r.data);
});

router.post('/:connectionId/send/media', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const { phone, type, fileUrl, caption, filename } = req.body || {};
  const r = await uaz.sendMedia({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    phone,
    type,
    fileUrl,
    caption,
    filename,
  });
  res.status(r.ok ? 200 : 502).json(r.data);
});

router.post('/:connectionId/check-number', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await uaz.checkNumber({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    phones: req.body?.phones || [],
  });
  res.json(r);
});

// Webhook events listing
router.get('/:connectionId/webhook-events', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await query(
    `SELECT id, event_type, status, error, created_at, payload
       FROM uazapi_webhook_events
      WHERE connection_id = $1
      ORDER BY created_at DESC LIMIT 100`,
    [c.id]
  );
  res.json({ events: r.rows });
});

// Clear webhook events for a connection
router.delete('/:connectionId/webhook-events', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  await query(`DELETE FROM uazapi_webhook_events WHERE connection_id = $1`, [c.id]);
  res.json({ success: true });
});

// Fetch the current webhook configuration registered on the UAZAPI server
router.get('/:connectionId/webhook-status', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const inferredBase =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.WEBHOOK_BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
  const expectedUrl = `${String(inferredBase).replace(/\/+$/, '')}/api/uazapi/webhook`;
  const r = await uaz.getWebhook({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
  const data = r.data || {};

  // UAZAPI may return:
  //   1) { webhook: { url, enabled, events, ... } }   (Modo Simples antigo)
  //   2) { url, enabled, events, ... }                 (objeto direto)
  //   3) { webhooks: [ {url, enabled, events, ...}, ... ] }  (Modo Avançado)
  //   4) [ {url, enabled, events, ...}, ... ]          (array direto)
  let candidates = [];
  if (Array.isArray(data)) {
    candidates = data;
  } else if (Array.isArray(data.webhooks)) {
    candidates = data.webhooks;
  } else if (data.webhook && typeof data.webhook === 'object') {
    candidates = [data.webhook];
  } else if (data.url || data.enabled !== undefined) {
    candidates = [data];
  }

  // Pick the webhook that matches our expected URL, or the first enabled one
  const normalize = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
  const expectedNorm = normalize(expectedUrl);
  const matched = candidates.find((w) => normalize(w?.url) === expectedNorm);
  const enabledOne = candidates.find((w) => w?.enabled !== false && w?.url);
  const wh = matched || enabledOne || candidates[0] || {};

  const registeredUrl = wh?.url || null;
  const enabled = wh?.enabled ?? null;

  res.json({
    ok: r.ok,
    status: r.status,
    expectedUrl,
    registeredUrl,
    enabled,
    events: wh?.events || [],
    excludeMessages: wh?.excludeMessages || wh?.excludedEvents || [],
    matches: !!registeredUrl && normalize(registeredUrl) === expectedNorm && enabled !== false,
    raw: data,
  });
});

// Delete (full removal of the connection AND remote instance)
router.delete('/:connectionId', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  // try remote delete via admin token
  const server = await uaz.getDefaultServer();
  if (server && c.uazapi_token) {
    try {
      await uaz.adminDeleteInstance({
        serverUrl: server.server_url,
        adminToken: server.admin_token,
        instanceToken: c.uazapi_token,
      });
    } catch (e) {
      console.warn('[UAZAPI] remote delete failed', e?.message);
    }
  }
  await query(`DELETE FROM connections WHERE id=$1`, [c.id]);
  res.json({ success: true });
});

// Groups / labels / quick-replies / newsletters / campaigns (passthrough)
const passthrough = (path) => async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const fn = uaz[path];
  if (!fn) return res.status(404).json({ error: 'Endpoint não suportado' });
  const r = await fn({ serverUrl: c.uazapi_server_url, token: c.uazapi_token });
  res.json(r.data);
};

router.get('/:connectionId/groups', passthrough('listGroups'));
router.get('/:connectionId/labels', passthrough('listLabels'));
router.get('/:connectionId/quick-replies', passthrough('listQuickReplies'));
router.get('/:connectionId/newsletters', passthrough('listNewsletters'));
router.get('/:connectionId/campaigns', passthrough('listCampaigns'));

router.post('/:connectionId/campaigns', async (req, res) => {
  const c = await getConnectionWithAccess(req.params.connectionId, req.userId);
  if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
  const r = await uaz.createMassMessage({
    serverUrl: c.uazapi_server_url,
    token: c.uazapi_token,
    payload: req.body,
  });
  res.status(r.ok ? 200 : 502).json(r.data);
});

export default router;
