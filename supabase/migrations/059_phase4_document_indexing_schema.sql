-- Fase 4: esquema de indexacion de texto + embeddings por chunk (idempotente)
-- Compatible con esquema existente de documento_text_chunks.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

ALTER TABLE documento_text_chunks
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS token_count INTEGER,
  ADD COLUMN IF NOT EXISTS document_hash TEXT,
  ADD COLUMN IF NOT EXISTS chunking_version TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

-- Backfill para filas legacy (evita nulos y mantiene reproducibilidad minima)
UPDATE documento_text_chunks
SET
  content = COALESCE(content, text, ''),
  document_hash = COALESCE(
    document_hash,
    encode(digest(COALESCE(text, '') || ':' || COALESCE(page_number, 1)::text, 'sha256'), 'hex')
  ),
  chunking_version = COALESCE(chunking_version, 'legacy_v0'),
  embedding_model = COALESCE(embedding_model, 'legacy'),
  embedding_dimensions = COALESCE(embedding_dimensions, 0)
WHERE
  content IS NULL
  OR document_hash IS NULL
  OR chunking_version IS NULL
  OR embedding_model IS NULL
  OR embedding_dimensions IS NULL;

ALTER TABLE documento_text_chunks
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN document_hash SET NOT NULL,
  ALTER COLUMN chunking_version SET NOT NULL,
  ALTER COLUMN embedding_model SET NOT NULL,
  ALTER COLUMN embedding_dimensions SET NOT NULL;

-- Mantener texto legacy sincronizado para compatibilidad de rutas actuales.
UPDATE documento_text_chunks
SET text = content
WHERE text IS DISTINCT FROM content;

-- Idempotencia de indexacion por firma logica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_text_chunks_index_signature
  ON documento_text_chunks (
    documento_id,
    chunking_version,
    embedding_model,
    chunk_index,
    document_hash
  );

CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_document_hash
  ON documento_text_chunks (documento_id, document_hash);

CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_chunking_model
  ON documento_text_chunks (chunking_version, embedding_model);

COMMENT ON COLUMN documento_text_chunks.content IS 'Contenido textual canonico del chunk para indexacion.';
COMMENT ON COLUMN documento_text_chunks.token_count IS 'Conteo aproximado de tokens del chunk.';
COMMENT ON COLUMN documento_text_chunks.document_hash IS 'Hash SHA-256 del texto base indexado (reproducibilidad/idempotencia).';
COMMENT ON COLUMN documento_text_chunks.chunking_version IS 'Version del algoritmo de chunking usado.';
COMMENT ON COLUMN documento_text_chunks.embedding_model IS 'Modelo de embeddings usado para este chunk.';
COMMENT ON COLUMN documento_text_chunks.embedding_dimensions IS 'Dimension del vector de embedding.';
