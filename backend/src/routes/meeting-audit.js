import express from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { authenticate } from '../middleware/auth.js';
import { query, pool } from '../db.js';
import { log, logError } from '../logger.js';

const router = express.Router();
const execFileAsync = promisify(execFile);
const MAX_TRANSCRIPTION_CHUNK_BYTES = 12 * 1024 * 1024;
const DEFAULT_CHUNK_DURATION_SECONDS = 8 * 60;

const AUDIO_DIR = path.join(process.cwd(), 'uploads', 'meeting-audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: AUDIO_DIR,
    filename: (req, file, cb) => {
      const ext = file.originalname?.split('.').pop() || 'webm';
      cb(null, `${req.params.id}_${Date.now()}.${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Helper: get user's org id
async function getOrgId(userId) {
  const r = await query(`SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0]?.organization_id;
}

// Helper: get org AI config
async function getOrgAIConfig(userId) {
  const result = await pool.query(
    `SELECT o.ai_provider, o.ai_model, o.ai_api_key
     FROM organizations o
     JOIN organization_members om ON om.organization_id = o.id
     WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row || !row.ai_provider || row.ai_provider === 'none' || !row.ai_api_key) return null;
  return { provider: row.ai_provider, model: row.ai_model, apiKey: row.ai_api_key };
}

// Helper: add audit log
async function addAuditLog(meetingId, action, description, metadata = {}, userId = null) {
  try {
    await query(
      `INSERT INTO meeting_audit_logs (meeting_id, action, description, metadata, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [meetingId, action, description, JSON.stringify(metadata), userId]
    );
  } catch (e) {
    logError('meeting-audit.log_error', e);
  }
}

function inferMimeType(fileName = '') {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.ogg' || ext === '.oga') return 'audio/ogg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  return 'audio/webm';
}

async function getAudioDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    const duration = Math.ceil(Number.parseFloat(stdout.trim()) || 0);
    return duration > 0 ? duration : 0;
  } catch (error) {
    logError('meeting-audit.ffprobe', error);
    return 0;
  }
}

async function splitAudioForTranscription(meetingId, audioFile, userId) {
  const originalSize = audioFile.size ?? fs.statSync(audioFile.path).size;
  if (originalSize <= MAX_TRANSCRIPTION_CHUNK_BYTES) {
    return {
      chunks: [{ ...audioFile, size: originalSize, mimetype: audioFile.mimetype || inferMimeType(audioFile.filename || audioFile.path) }],
      tempDir: null,
    };
  }

  const durationSeconds = await getAudioDurationSeconds(audioFile.path);
  const estimatedParts = Math.max(2, Math.ceil(originalSize / MAX_TRANSCRIPTION_CHUNK_BYTES));
  const chunkDuration = durationSeconds
    ? Math.max(60, Math.ceil(durationSeconds / estimatedParts))
    : DEFAULT_CHUNK_DURATION_SECONDS;
  const ext = path.extname(audioFile.filename || audioFile.path) || '.webm';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-audio-'));
  const outputPattern = path.join(tempDir, `part-%03d${ext}`);

  await addAuditLog(
    meetingId,
    'audio_chunking_started',
    `Áudio grande detectado (${(originalSize / 1024 / 1024).toFixed(1)}MB). Dividindo em partes para transcrição.`,
    { original_size: originalSize, estimated_parts: estimatedParts, chunk_duration_seconds: chunkDuration },
    userId,
  );

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', audioFile.path,
      '-f', 'segment',
      '-segment_time', String(chunkDuration),
      '-reset_timestamps', '1',
      '-c', 'copy',
      outputPattern,
    ]);

    const chunkNames = fs.readdirSync(tempDir)
      .filter((name) => name.startsWith('part-'))
      .sort();

    if (chunkNames.length === 0) {
      throw new Error('Nenhuma parte de áudio foi gerada para a transcrição');
    }

    const chunks = chunkNames.map((name, index) => {
      const chunkPath = path.join(tempDir, name);
      return {
        ...audioFile,
        path: chunkPath,
        filename: name,
        size: fs.statSync(chunkPath).size,
        mimetype: inferMimeType(name),
        chunkIndex: index + 1,
        totalChunks: chunkNames.length,
      };
    });

    await addAuditLog(
      meetingId,
      'audio_chunking_completed',
      `${chunks.length} parte(s) preparadas para transcrição`,
      { parts: chunks.length },
      userId,
    );

    return { chunks, tempDir };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function transcribeChunkWithProvider(audioBuffer, audioFile, aiConfig) {
  const mimeType = audioFile.mimetype || inferMimeType(audioFile.filename || audioFile.path);

  if (aiConfig.provider === 'openai') {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, audioFile.filename || 'meeting.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiConfig.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.text || '';
  }

  if (aiConfig.provider === 'gemini') {
    const model = aiConfig.model || 'gemini-2.0-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: 'Transcreva o seguinte áudio em português com precisão. Identifique diferentes falantes quando possível, rotulando-os como "Falante 1:", "Falante 2:", etc. Retorne APENAS o texto transcrito, sem explicações.' },
              { inlineData: { mimeType, data: audioBuffer.toString('base64') } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.filter((part) => part.text).map((part) => part.text).join('') || '';
  }

  throw new Error(`Provedor de IA não suportado: ${aiConfig.provider}`);
}

// GET audit logs for a meeting
router.get('/:id/audit', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT mal.*, u.name as user_name
       FROM meeting_audit_logs mal
       LEFT JOIN users u ON u.id = mal.created_by
       WHERE mal.meeting_id = $1
       ORDER BY mal.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    logError('meeting-audit.list', error);
    res.status(500).json({ error: error.message });
  }
});

// POST upload audio & start auto-processing
router.post('/:id/audio', authenticate, upload.single('audio'), async (req, res) => {
  try {
    const meetingId = req.params.id;
    const orgId = await getOrgId(req.userId);
    if (!orgId) return res.status(400).json({ error: 'Organização não encontrada' });

    const audioFile = req.file;
    if (!audioFile) return res.status(400).json({ error: 'Nenhum arquivo de áudio enviado' });

    const durationSeconds = parseInt(req.body.duration_seconds) || 0;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
    const audioUrl = `/api/meetings/${meetingId}/audio/stream`;

    // Save audio info to meeting
    await query(
      `UPDATE meetings SET audio_url = $1, audio_expires_at = $2, recording_duration_seconds = $3, 
       status = 'transcrevendo', updated_at = NOW()
       WHERE id = $4 AND organization_id = $5`,
      [audioFile.filename, expiresAt, durationSeconds, meetingId, orgId]
    );

    await addAuditLog(meetingId, 'recording_started', 'Gravação iniciada', { duration_seconds: durationSeconds }, req.userId);
    await addAuditLog(meetingId, 'recording_completed', `Gravação concluída — ${Math.floor(durationSeconds / 60)}min ${durationSeconds % 60}s`, {
      file_size: audioFile.size,
      mime_type: audioFile.mimetype,
      duration_seconds: durationSeconds,
      expires_at: expiresAt.toISOString(),
    }, req.userId);
    await addAuditLog(meetingId, 'audio_uploaded', `Áudio salvo para auditoria (expira em 24h)`, { file: audioFile.filename }, req.userId);

    // Start async transcription
    processAudioTranscription(meetingId, audioFile, req.userId).catch(e => {
      logError('meeting-audit.transcription_bg', e);
    });

    res.json({
      success: true,
      audio_url: audioUrl,
      expires_at: expiresAt.toISOString(),
      duration_seconds: durationSeconds,
    });
  } catch (error) {
    logError('meeting-audit.upload', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual reprocess when transcript is missing or processing got stuck
router.post('/:id/audio/reprocess', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    const result = await query(
      `SELECT id, audio_url, audio_expires_at FROM meetings WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId],
    );

    const meeting = result.rows[0];
    if (!meeting?.audio_url) return res.status(404).json({ error: 'Nenhum áudio disponível para reprocessar' });
    if (meeting.audio_expires_at && new Date(meeting.audio_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Áudio expirado. Removido por segurança após 24h.' });
    }

    const filePath = path.join(AUDIO_DIR, meeting.audio_url);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo de áudio não encontrado' });

    await query(`UPDATE meetings SET status = 'transcrevendo', updated_at = NOW() WHERE id = $1`, [req.params.id]);
    await addAuditLog(req.params.id, 'reprocess_requested', 'Reprocessamento manual solicitado', {}, req.userId);

    processAudioTranscription(
      req.params.id,
      {
        path: filePath,
        filename: meeting.audio_url,
        size: fs.statSync(filePath).size,
        mimetype: inferMimeType(meeting.audio_url),
      },
      req.userId,
    ).catch((error) => {
      logError('meeting-audit.reprocess_bg', error);
    });

    res.status(202).json({ success: true });
  } catch (error) {
    logError('meeting-audit.reprocess', error);
    res.status(500).json({ error: error.message });
  }
});

// Stream audio file (for playback within 24h)
router.get('/:id/audio/stream', authenticate, async (req, res) => {
  try {
    const orgId = await getOrgId(req.userId);
    const result = await query(
      `SELECT audio_url, audio_expires_at FROM meetings WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );
    const meeting = result.rows[0];
    if (!meeting?.audio_url) return res.status(404).json({ error: 'Áudio não encontrado' });
    if (meeting.audio_expires_at && new Date(meeting.audio_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Áudio expirado. Removido por segurança após 24h.' });
    }

    const filePath = path.join(AUDIO_DIR, meeting.audio_url);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo de áudio não encontrado' });

    res.setHeader('Content-Type', 'audio/webm');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logError('meeting-audit.stream', error);
    res.status(500).json({ error: error.message });
  }
});

// Background: transcribe + identify speakers + generate summary
async function processAudioTranscription(meetingId, audioFile, userId) {
  let tempDir = null;
  try {
    await addAuditLog(meetingId, 'transcription_started', 'Iniciando transcrição automática do áudio...', {}, userId);

    const aiConfig = await getOrgAIConfig(userId);
    if (!aiConfig) {
      await addAuditLog(meetingId, 'transcription_error', 'IA não configurada. Configure em Configurações > Inteligência Artificial.', {}, userId);
      await query(`UPDATE meetings SET status = 'aguardando_transcricao', updated_at = NOW() WHERE id = $1`, [meetingId]);
      return;
    }

    const splitResult = await splitAudioForTranscription(meetingId, audioFile, userId);
    tempDir = splitResult.tempDir;

    const transcriptParts = [];
    for (const chunk of splitResult.chunks) {
      if (chunk.totalChunks > 1) {
        await addAuditLog(
          meetingId,
          'transcription_chunk_started',
          `Transcrevendo parte ${chunk.chunkIndex}/${chunk.totalChunks}...`,
          { chunk_index: chunk.chunkIndex, total_chunks: chunk.totalChunks, size: chunk.size },
          userId,
        );
      }

      const audioBuffer = fs.readFileSync(chunk.path);
      const chunkTranscript = (await transcribeChunkWithProvider(audioBuffer, chunk, aiConfig)).trim();

      if (chunk.totalChunks > 1) {
        await addAuditLog(
          meetingId,
          'transcription_chunk_completed',
          `Parte ${chunk.chunkIndex}/${chunk.totalChunks} transcrita (${chunkTranscript.length} caracteres)`,
          { chunk_index: chunk.chunkIndex, total_chunks: chunk.totalChunks, length: chunkTranscript.length },
          userId,
        );
      }

      if (chunkTranscript) transcriptParts.push(chunkTranscript);
    }

    const transcript = transcriptParts.join('\n\n').trim();
    if (!transcript) {
      await addAuditLog(meetingId, 'transcription_error', 'A transcrição retornou vazia. Tente reprocessar o áudio.', {}, userId);
      await query(`UPDATE meetings SET status = 'aguardando_transcricao', updated_at = NOW() WHERE id = $1`, [meetingId]);
      return;
    }

    await addAuditLog(meetingId, 'transcription_completed', `Transcrição concluída (${transcript.length} caracteres)`, { length: transcript.length }, userId);

    // Identify speakers from transcript
    await addAuditLog(meetingId, 'speaker_identification_started', 'Identificando participantes da reunião...', {}, userId);

    const speakers = [];
    const speakerMatches = transcript.match(/Falante \d+/gi);
    if (speakerMatches) {
      const unique = [...new Set(speakerMatches)];
      unique.forEach(s => speakers.push({ label: s, identified: false }));
    }

    await addAuditLog(meetingId, 'speaker_identification_completed', `${speakers.length} participante(s) identificado(s)`, { speakers }, userId);

    // Save transcript and speakers
    await query(
      `UPDATE meetings SET transcript = $1, speakers = $2, status = 'resumo_gerado', updated_at = NOW() WHERE id = $3`,
      [transcript, JSON.stringify(speakers), meetingId]
    );

    await addAuditLog(meetingId, 'transcript_saved', 'Transcrição salva no prontuário da reunião', {}, userId);
    await addAuditLog(meetingId, 'processing_completed', 'Processamento completo — reunião pronta para revisão', {}, userId);

    log('info', 'meeting-audit.transcription_complete', { meetingId, transcriptLength: transcript.length, speakers: speakers.length });
  } catch (error) {
    logError('meeting-audit.transcription', error);
    await addAuditLog(meetingId, 'transcription_error', `Erro: ${error.message}`, { stack: error.stack }, userId);
    await query(`UPDATE meetings SET status = 'aguardando_transcricao', updated_at = NOW() WHERE id = $1`, [meetingId]);
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Cleanup expired audio files (called by scheduler)
export async function cleanupExpiredAudio() {
  try {
    const result = await query(
      `SELECT id, audio_url FROM meetings WHERE audio_expires_at IS NOT NULL AND audio_expires_at < NOW() AND audio_url IS NOT NULL`
    );

    for (const row of result.rows) {
      const filePath = path.join(AUDIO_DIR, row.audio_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log('info', 'meeting-audit.cleanup', { meetingId: row.id, file: row.audio_url });
      }
      await query(`UPDATE meetings SET audio_url = NULL, audio_expires_at = NULL, updated_at = NOW() WHERE id = $1`, [row.id]);
      await addAuditLog(row.id, 'audio_expired', 'Áudio removido automaticamente após 24h (política de segurança)', {});
    }

    if (result.rows.length > 0) {
      log('info', 'meeting-audit.cleanup_done', { removed: result.rows.length });
    }
  } catch (error) {
    logError('meeting-audit.cleanup', error);
  }
}

export { addAuditLog };
export default router;
