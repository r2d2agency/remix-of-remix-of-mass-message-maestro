-- ============================================
-- Schema para RAG (Retrieval-Augmented Generation)
-- Adiciona suporte a embeddings na tabela de chunks
-- Execute após schema-ai-agents.sql
-- ============================================

-- Adicionar coluna de embedding como JSONB (array de floats)
-- Usamos JSONB ao invés de VECTOR para compatibilidade sem pgvector
ALTER TABLE ai_knowledge_chunks ADD COLUMN IF NOT EXISTS embedding JSONB;

-- Adicionar coluna de hash para evitar reprocessamento
ALTER TABLE ai_knowledge_chunks ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Adicionar colunas de controle no knowledge_sources
ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);
ALTER TABLE ai_knowledge_sources ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

-- Índice para busca por hash (evitar duplicatas)
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_hash ON ai_knowledge_chunks(content_hash);

-- Índice para busca por source + ativo
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_source_active ON ai_knowledge_chunks(source_id);

-- Função para buscar chunks por similaridade usando cosseno em JSONB
-- Recebe o embedding da query e retorna os chunks mais similares
CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  p_agent_id UUID,
  p_query_embedding JSONB,
  p_limit INTEGER DEFAULT 5,
  p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  chunk_id UUID,
  source_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as chunk_id,
    c.source_id,
    c.content,
    c.metadata,
    cosine_similarity(c.embedding, p_query_embedding) as similarity
  FROM ai_knowledge_chunks c
  JOIN ai_knowledge_sources s ON s.id = c.source_id
  WHERE s.agent_id = p_agent_id 
    AND s.is_active = true 
    AND s.status = 'completed'
    AND c.embedding IS NOT NULL
  HAVING cosine_similarity(c.embedding, p_query_embedding) >= p_min_similarity
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Função de similaridade do cosseno para arrays JSONB
CREATE OR REPLACE FUNCTION cosine_similarity(a JSONB, b JSONB)
RETURNS FLOAT AS $$
DECLARE
  dot_product FLOAT := 0;
  norm_a FLOAT := 0;
  norm_b FLOAT := 0;
  len INTEGER;
  i INTEGER;
  va FLOAT;
  vb FLOAT;
BEGIN
  IF a IS NULL OR b IS NULL THEN RETURN 0; END IF;
  
  len := LEAST(jsonb_array_length(a), jsonb_array_length(b));
  IF len = 0 THEN RETURN 0; END IF;
  
  FOR i IN 0..len-1 LOOP
    va := (a->i)::FLOAT;
    vb := (b->i)::FLOAT;
    dot_product := dot_product + (va * vb);
    norm_a := norm_a + (va * va);
    norm_b := norm_b + (vb * vb);
  END LOOP;
  
  IF norm_a = 0 OR norm_b = 0 THEN RETURN 0; END IF;
  
  RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION cosine_similarity IS 'Calcula similaridade do cosseno entre dois vetores armazenados como JSONB arrays';
COMMENT ON FUNCTION search_knowledge_chunks IS 'Busca chunks de conhecimento por similaridade semântica';
