-- Fase 5: retrieval vectorial para knowledge_chunks (RAG chat)
-- No modifica chunking/indexacion de documentos (Fase 4), solo habilita busqueda semantica de knowledge.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope_active
  ON knowledge_chunks (tramite, scope, is_active, priority);

CREATE OR REPLACE FUNCTION match_knowledge_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_tramite text,
  filter_scope text default 'chat_generation'
)
RETURNS TABLE (
  id uuid,
  chunk_key text,
  title text,
  content text,
  version text,
  content_hash text,
  similarity float,
  embedding_model text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.chunk_key,
    kc.title,
    kc.content,
    kc.version,
    kc.content_hash,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    kc.embedding_model
  FROM knowledge_chunks kc
  WHERE kc.is_active = TRUE
    AND kc.tramite = filter_tramite
    AND kc.scope = filter_scope
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_knowledge_chunks(vector, float, int, text, text)
  IS 'Retorna knowledge chunks por similitud vectorial para construir contexto RAG minimizado.';

