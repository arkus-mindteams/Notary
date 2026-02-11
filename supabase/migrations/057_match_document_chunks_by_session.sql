-- RAG: filtrar por session_id (chat) o tramite_id (expedientes)
-- Prioridad: si viene filter_session_id se filtra por sesión (al entrar al chat);
-- si solo viene filter_tramite_id se filtra por trámite.

CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_tramite_id uuid default null,
  filter_session_id uuid default null
)
RETURNS TABLE (
  id uuid,
  documento_id uuid,
  text text,
  similarity float,
  metadata jsonb,
  page_number int
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documento_text_chunks.id,
    documento_text_chunks.documento_id,
    documento_text_chunks.text,
    1 - (documento_text_chunks.embedding <=> query_embedding) AS similarity,
    documento_text_chunks.metadata,
    documento_text_chunks.page_number
  FROM documento_text_chunks
  WHERE 1 - (documento_text_chunks.embedding <=> query_embedding) > match_threshold
    AND (filter_session_id IS NULL OR documento_text_chunks.session_id = filter_session_id)
    AND (filter_tramite_id IS NULL OR documento_text_chunks.tramite_id = filter_tramite_id)
  ORDER BY documento_text_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
