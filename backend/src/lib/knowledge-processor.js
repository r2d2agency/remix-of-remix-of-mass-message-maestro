/**
 * Knowledge Processor - RAG Pipeline
 * 
 * Handles:
 * 1. Text extraction from PDF, DOCX, TXT, MD, CSV
 * 2. Text chunking with overlap
 * 3. Embedding generation via OpenAI or Gemini
 * 4. Storage and retrieval of chunks with embeddings
 */

import { query } from '../db.js';
import { logInfo, logError } from '../logger.js';
import { createHash } from 'crypto';
import { fetchWithRetry } from './retry-fetch.js';

// ==================== CONSTANTS ====================

const CHUNK_SIZE = 800;        // ~800 chars per chunk
const CHUNK_OVERLAP = 200;     // 200 chars overlap between chunks
const MAX_CHUNKS = 500;        // Max chunks per source
const EMBEDDING_BATCH_SIZE = 20; // Embeddings per API call

// ==================== MAIN ENTRY ====================

/**
 * Process a knowledge source: extract text, chunk, embed, store
 * @param {string} sourceId - Knowledge source UUID
 */
export async function processKnowledgeSource(sourceId) {
  const startTime = Date.now();
  
  try {
    // Mark as processing
    await query(
      `UPDATE ai_knowledge_sources SET status = 'processing', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [sourceId]
    );

    // Load source
    const sourceResult = await query(
      `SELECT ks.*, a.organization_id, a.ai_provider, a.ai_api_key, a.ai_model,
              org.ai_provider as org_ai_provider, org.ai_api_key as org_ai_api_key, org.ai_model as org_ai_model
       FROM ai_knowledge_sources ks
       JOIN ai_agents a ON a.id = ks.agent_id
       JOIN organizations org ON org.id = a.organization_id
       WHERE ks.id = $1`,
      [sourceId]
    );

    if (sourceResult.rows.length === 0) {
      throw new Error('Knowledge source not found');
    }

    const source = sourceResult.rows[0];

    // 1. Extract text
    logInfo('knowledge_processor.extracting', { sourceId, type: source.source_type });
    const extractedText = await extractText(source);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('Nenhum texto extraído do documento');
    }

    // Save extracted text
    await query(
      `UPDATE ai_knowledge_sources SET extracted_text = $1 WHERE id = $2`,
      [extractedText.substring(0, 500000), sourceId] // Limit to 500k chars
    );

    // 2. Chunk text
    logInfo('knowledge_processor.chunking', { sourceId, textLength: extractedText.length });
    const chunks = chunkText(extractedText, CHUNK_SIZE, CHUNK_OVERLAP);

    if (chunks.length === 0) {
      throw new Error('Nenhum chunk gerado a partir do texto');
    }

    const limitedChunks = chunks.slice(0, MAX_CHUNKS);

    // 3. Get AI config for embeddings
    const aiConfig = getEmbeddingConfig(source);

    // 4. Generate embeddings
    logInfo('knowledge_processor.embedding', { sourceId, chunkCount: limitedChunks.length });
    const embeddings = await generateEmbeddings(limitedChunks.map(c => c.content), aiConfig);

    // 5. Delete old chunks
    await query('DELETE FROM ai_knowledge_chunks WHERE source_id = $1', [sourceId]);

    // 6. Store chunks with embeddings
    for (let i = 0; i < limitedChunks.length; i++) {
      const chunk = limitedChunks[i];
      const embedding = embeddings[i] || null;
      const contentHash = createHash('sha256').update(chunk.content).digest('hex').substring(0, 64);

      await query(
        `INSERT INTO ai_knowledge_chunks (source_id, content, chunk_index, metadata, token_count, char_count, embedding, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sourceId,
          chunk.content,
          chunk.index,
          JSON.stringify(chunk.metadata),
          Math.ceil(chunk.content.length / 4), // Rough token estimate
          chunk.content.length,
          embedding ? JSON.stringify(embedding) : null,
          contentHash,
        ]
      );
    }

    // 7. Update source status
    const embeddingModel = aiConfig.provider === 'openai' ? 'text-embedding-3-small' : 'text-embedding-004';
    const embeddingDimensions = aiConfig.provider === 'openai' ? 1536 : 768;

    await query(
      `UPDATE ai_knowledge_sources 
       SET status = 'completed', 
           chunk_count = $2, 
           total_tokens = $3,
           embedding_model = $4,
           embedding_dimensions = $5,
           processed_at = NOW(), 
           error_message = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [sourceId, limitedChunks.length, limitedChunks.reduce((sum, c) => sum + Math.ceil(c.content.length / 4), 0), embeddingModel, embeddingDimensions]
    );

    const elapsed = Date.now() - startTime;
    logInfo('knowledge_processor.completed', { sourceId, chunks: limitedChunks.length, timeMs: elapsed });
    return { success: true, chunks: limitedChunks.length };

  } catch (error) {
    logError('knowledge_processor.failed', error);
    await query(
      `UPDATE ai_knowledge_sources SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [sourceId, error.message?.substring(0, 500) || 'Erro desconhecido']
    );
    return { success: false, error: error.message };
  }
}

// ==================== TEXT EXTRACTION ====================

async function extractText(source) {
  const { source_type, source_content, file_type, original_filename } = source;

  if (source_type === 'text') {
    return source_content;
  }

  if (source_type === 'url') {
    return extractFromURL(source_content);
  }

  if (source_type === 'file') {
    return extractFromFile(source_content, file_type, original_filename);
  }

  throw new Error(`Tipo de fonte não suportado: ${source_type}`);
}

async function extractFromURL(url) {
  try {
    const response = await fetchWithRetry(url, {}, { label: 'knowledge-url', retries: 2 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    // Simple HTML to text extraction
    return htmlToText(html);
  } catch (error) {
    throw new Error(`Erro ao acessar URL: ${error.message}`);
  }
}

async function extractFromFile(fileUrl, fileType, filename) {
  try {
    // Download file
    const response = await fetchWithRetry(fileUrl, {}, { label: 'knowledge-file', retries: 2 });
    if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar arquivo`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
    const mime = (fileType || '').toLowerCase();

    // PDF
    if (mime.includes('pdf') || ext === 'pdf') {
      return extractFromPDF(buffer);
    }

    // DOCX
    if (mime.includes('wordprocessingml') || ext === 'docx') {
      return extractFromDOCX(buffer);
    }

    // TXT, MD, CSV - plain text
    if (['txt', 'md', 'csv', 'text'].includes(ext) || 
        mime.includes('text/') || mime.includes('csv')) {
      return buffer.toString('utf-8');
    }

    throw new Error(`Formato de arquivo não suportado: ${ext || mime}`);
  } catch (error) {
    throw new Error(`Erro ao processar arquivo: ${error.message}`);
  }
}

async function extractFromPDF(buffer) {
  try {
    // Dynamic import for pdf-parse
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const result = await pdfParse(buffer);
    return result.text || '';
  } catch (error) {
    // Fallback: try basic text extraction
    logError('knowledge_processor.pdf_parse_error', error);
    throw new Error(`Erro ao extrair texto do PDF: ${error.message}. Certifique-se de que pdf-parse está instalado (npm install pdf-parse).`);
  }
}

async function extractFromDOCX(buffer) {
  try {
    // Dynamic import for mammoth
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error) {
    logError('knowledge_processor.docx_parse_error', error);
    throw new Error(`Erro ao extrair texto do DOCX: ${error.message}. Certifique-se de que mammoth está instalado (npm install mammoth).`);
  }
}

function htmlToText(html) {
  // Remove scripts, styles, and tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '\"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return text;
}

// ==================== CHUNKING ====================

/**
 * Split text into overlapping chunks
 * Tries to split on paragraph/sentence boundaries
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  
  // Normalize whitespace
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split into paragraphs first
  const paragraphs = text.split(/\n{2,}/);
  
  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // If adding this paragraph exceeds chunk size and we have content
    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        metadata: { start_char: chunkIndex * (chunkSize - overlap) },
      });
      chunkIndex++;

      // Keep overlap from the end of current chunk
      if (overlap > 0 && currentChunk.length > overlap) {
        currentChunk = currentChunk.slice(-overlap) + '\n\n' + trimmed;
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed;
    }

    // If a single paragraph is too long, split by sentences
    if (currentChunk.length > chunkSize * 2) {
      const sentences = currentChunk.match(/[^.!?]+[.!?]+/g) || [currentChunk];
      currentChunk = '';
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            index: chunkIndex,
            metadata: { start_char: chunkIndex * (chunkSize - overlap) },
          });
          chunkIndex++;
          currentChunk = overlap > 0 ? currentChunk.slice(-overlap) + sentence : sentence;
        } else {
          currentChunk += sentence;
        }
      }
    }
  }

  // Add remaining text
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      metadata: { start_char: chunkIndex * (chunkSize - overlap) },
    });
  }

  return chunks;
}

// ==================== EMBEDDINGS ====================

function getEmbeddingConfig(source) {
  // Prefer agent-level API key, then org-level
  const provider = source.ai_provider !== 'openai' && source.ai_provider !== 'gemini'
    ? (source.org_ai_provider || 'openai')
    : source.ai_provider;
    
  const apiKey = source.ai_api_key || source.org_ai_api_key;

  if (!apiKey) {
    throw new Error('Nenhuma API key de IA configurada. Configure no agente ou nas configurações da organização.');
  }

  return { provider, apiKey };
}

/**
 * Generate embeddings for an array of texts
 */
async function generateEmbeddings(texts, config) {
  const { provider, apiKey } = config;
  const embeddings = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    
    let batchEmbeddings;
    if (provider === 'openai') {
      batchEmbeddings = await generateOpenAIEmbeddings(batch, apiKey);
    } else if (provider === 'gemini') {
      batchEmbeddings = await generateGeminiEmbeddings(batch, apiKey);
    } else {
      throw new Error(`Provedor de embeddings não suportado: ${provider}`);
    }

    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

async function generateOpenAIEmbeddings(texts, apiKey) {
  const response = await fetchWithRetry(
    'https://api.openai.com/v1/embeddings',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    },
    { label: 'openai-embeddings', retries: 2 }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Embeddings error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.data.map(d => d.embedding);
}

async function generateGeminiEmbeddings(texts, apiKey) {
  // Gemini supports batch embedding
  const requests = texts.map(text => ({
    model: 'models/text-embedding-004',
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  }));

  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    },
    { label: 'gemini-embeddings', retries: 2 }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Embeddings error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.embeddings.map(e => e.values);
}

// ==================== RAG SEARCH ====================

/**
 * Search knowledge base by semantic similarity
 * @param {string} agentId - Agent UUID
 * @param {string} queryText - User's question/message
 * @param {Object} aiConfig - { provider, apiKey }
 * @param {number} topK - Number of results to return
 * @returns {Array} Relevant chunks with similarity scores
 */
export async function searchKnowledge(agentId, queryText, aiConfig, topK = 5) {
  try {
    // Check if agent has any processed chunks
    const chunkCheck = await query(
      `SELECT COUNT(*) as cnt FROM ai_knowledge_chunks c
       JOIN ai_knowledge_sources s ON s.id = c.source_id
       WHERE s.agent_id = $1 AND s.is_active = true AND s.status = 'completed' AND c.embedding IS NOT NULL`,
      [agentId]
    );

    if (parseInt(chunkCheck.rows[0]?.cnt || '0') === 0) {
      // No processed chunks - fall back to raw content
      return fallbackSearch(agentId);
    }

    // Generate embedding for the query
    let queryEmbedding;
    if (aiConfig.provider === 'openai') {
      const embeddings = await generateOpenAIEmbeddings([queryText], aiConfig.apiKey);
      queryEmbedding = embeddings[0];
    } else {
      // For Gemini query embedding, use RETRIEVAL_QUERY task type
      const response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${aiConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: queryText }] },
            taskType: 'RETRIEVAL_QUERY',
          }),
        },
        { label: 'gemini-query-embed', retries: 2 }
      );

      if (!response.ok) throw new Error(`Gemini embed error ${response.status}`);
      const data = await response.json();
      queryEmbedding = data.embedding.values;
    }

    // Search using SQL function
    const results = await query(
      `SELECT * FROM search_knowledge_chunks($1, $2, $3, $4)`,
      [agentId, JSON.stringify(queryEmbedding), topK, 0.25]
    );

    if (results.rows.length === 0) {
      // No good matches found - fallback
      return fallbackSearch(agentId);
    }

    return results.rows.map(r => ({
      content: r.content,
      similarity: r.similarity,
      sourceId: r.source_id,
      metadata: r.metadata,
    }));

  } catch (error) {
    logError('knowledge_processor.search_error', error);
    // Fallback to raw content on error
    return fallbackSearch(agentId);
  }
}

/**
 * Fallback: return raw source content (original behavior)
 */
async function fallbackSearch(agentId) {
  const result = await query(
    `SELECT source_content, extracted_text, name FROM ai_knowledge_sources 
     WHERE agent_id = $1 AND is_active = true 
     ORDER BY priority DESC LIMIT 5`,
    [agentId]
  );

  return result.rows.map(r => ({
    content: (r.extracted_text || r.source_content || '').substring(0, 2000),
    similarity: 1.0,
    sourceId: null,
    metadata: { name: r.name, fallback: true },
  }));
}

// ==================== EXPORTS ====================

export default {
  processKnowledgeSource,
  searchKnowledge,
  chunkText,
};
