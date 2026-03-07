import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { log, logError } from '../logger.js';
import { pool, query } from '../db.js';
import { callAI } from '../lib/ai-caller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Helper: get org AI config for the authenticated user
async function getOrgAIConfig(userId) {
  const result = await pool.query(
    `SELECT o.ai_provider, o.ai_model, o.ai_api_key
     FROM organizations o
     JOIN users u ON u.organization_id = o.id
     WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row || !row.ai_provider || row.ai_provider === 'none' || !row.ai_api_key) {
    return null;
  }
  return {
    provider: row.ai_provider,
    model: row.ai_model,
    apiKey: row.ai_api_key,
  };
}

// POST /api/transcribe-audio
router.post('/', authenticate, upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Get optional message_id to save transcript
    const { message_id } = req.body;

    // Get AI config from org
    const aiConfig = await getOrgAIConfig(req.userId);
    if (!aiConfig) {
      return res.status(400).json({
        error: 'IA não configurada. Vá em Configurações > Inteligência Artificial e configure seu provedor (OpenAI ou Gemini).'
      });
    }

    const base64Audio = audioFile.buffer.toString('base64');
    const mimeType = audioFile.mimetype || 'audio/ogg';

    log('info', 'transcribe.start', {
      size: audioFile.size,
      mimetype: mimeType,
      provider: aiConfig.provider,
    });

    let transcript = '';

    if (aiConfig.provider === 'openai') {
      // OpenAI Whisper API for transcription
      const formData = new FormData();
      const blob = new Blob([audioFile.buffer], { type: mimeType });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logError('transcribe.openai_error', new Error(`OpenAI Whisper error: ${response.status}`), { body: errorText });
        return res.status(500).json({ error: `Erro na transcrição OpenAI: ${response.status}` });
      }

      const data = await response.json();
      transcript = data.text || '';

    } else if (aiConfig.provider === 'gemini') {
      // Use Gemini with inline audio data
      const model = aiConfig.model || 'gemini-2.0-flash';
      const audioFormat = mimeType.includes('mp3') ? 'mp3' :
                          mimeType.includes('wav') ? 'wav' :
                          mimeType.includes('ogg') ? 'ogg' :
                          mimeType.includes('webm') ? 'webm' : 'mp3';

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcreva o seguinte áudio em português com precisão. Retorne APENAS o texto transcrito, sem explicações. Se inaudível, retorne "[Áudio inaudível]".' },
            {
              inlineData: {
                mimeType: `audio/${audioFormat}`,
                data: base64Audio,
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        }
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logError('transcribe.gemini_error', new Error(`Gemini error: ${response.status}`), { body: errorText });
        return res.status(500).json({ error: `Erro na transcrição Gemini: ${response.status}` });
      }

      const data = await response.json();
      transcript = data.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        .map(p => p.text)
        .join('') || '';
    } else {
      return res.status(400).json({ error: `Provedor de IA não suportado para transcrição: ${aiConfig.provider}` });
    }

    const trimmedTranscript = transcript.trim();

    // Save transcript to chat_messages if message_id provided
    if (message_id && trimmedTranscript) {
      try {
        await query(
          `UPDATE chat_messages SET transcript = $1 WHERE id = $2`,
          [trimmedTranscript, message_id]
        );
        log('info', 'transcribe.saved_to_db', { message_id });
      } catch (dbError) {
        // If column doesn't exist, try to add it
        if (dbError.message?.includes('column "transcript"')) {
          await query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS transcript TEXT`);
          await query(`UPDATE chat_messages SET transcript = $1 WHERE id = $2`, [trimmedTranscript, message_id]);
          log('info', 'transcribe.created_column_and_saved', { message_id });
        } else {
          logError('transcribe.save_db_error', dbError);
        }
      }
    }

    log('info', 'transcribe.success', {
      transcriptLength: trimmedTranscript.length,
      preview: trimmedTranscript.substring(0, 50),
      provider: aiConfig.provider,
    });

    res.json({ transcript: trimmedTranscript });
  } catch (error) {
    logError('transcribe.error', error);
    res.status(500).json({
      error: error.message || 'Erro ao transcrever áudio'
    });
  }
});

export default router;
