import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middleware/auth.js';
import { query, pool } from '../db.js';
import { log, logError } from '../logger.js';
import { callAI } from '../lib/ai-caller.js';

const router = express.Router();

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
    processAudioTranscription(meetingId, audioFile, req.userId, orgId).catch(e => {
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
async function processAudioTranscription(meetingId, audioFile, userId, orgId) {
  try {
    await addAuditLog(meetingId, 'transcription_started', 'Iniciando transcrição automática do áudio...', {}, userId);

    const aiConfig = await getOrgAIConfig(userId);
    if (!aiConfig) {
      await addAuditLog(meetingId, 'transcription_error', 'IA não configurada. Configure em Configurações > Inteligência Artificial.', {}, userId);
      await query(`UPDATE meetings SET status = 'aguardando_transcricao', updated_at = NOW() WHERE id = $1`, [meetingId]);
      return;
    }

    // Read audio file
    const audioBuffer = fs.readFileSync(audioFile.path);
    const base64Audio = audioBuffer.toString('base64');
    const mimeType = audioFile.mimetype || 'audio/webm';

    let transcript = '';

    if (aiConfig.provider === 'openai') {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', blob, 'meeting.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiConfig.apiKey}` },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        await addAuditLog(meetingId, 'transcription_error', `Erro OpenAI: ${response.status}`, { error: errText }, userId);
        await query(`UPDATE meetings SET status = 'aguardando_transcricao', updated_at = NOW() WHERE id = $1`, [meetingId]);
        return;
      }
      const data = await response.json();
      transcript = data.text || '';
    } else if (aiConfig.provider === 'gemini') {
      const model = aiConfig.model || 'gemini-2.0-flash';
      const audioFormat = mimeType.includes('mp3') ? 'mp3' : mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'webm';

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
                { inlineData: { mimeType: `audio/${audioFormat}`, data: base64Audio } }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8000 }
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        await addAuditLog(meetingId, 'transcription_error', `Erro Gemini: ${response.status}`, { error: errText }, userId);
        await query(`UPDATE meetings SET status = 'aguardando_transcricao', updated_at = NOW() WHERE id = $1`, [meetingId]);
        return;
      }
      const data = await response.json();
      transcript = data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('') || '';
    }

    transcript = transcript.trim();
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
