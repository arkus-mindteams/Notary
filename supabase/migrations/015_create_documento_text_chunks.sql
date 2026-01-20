-- Tabla para persistir texto OCR (por página/chunk) y permitir búsquedas (RAG) por trámite/documento.
-- Objetivo: que el chat pueda "revisar" un dato del documento ya subido sin re-procesar la imagen.

CREATE TABLE IF NOT EXISTS documento_text_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  tramite_id UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,

  -- 1-based (para PDFs multi-página). Para imágenes sueltas usar 1.
  page_number INTEGER NOT NULL DEFAULT 1,
  chunk_index INTEGER NOT NULL DEFAULT 0,

  -- Texto OCR/extraído. Guardar como texto plano (sin HTML).
  text TEXT NOT NULL,

  -- Metadatos (opcional): cómo se obtuvo, idioma, etc.
  metadata JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(documento_id, page_number, chunk_index)
);

-- Full-text search (español). Generado y almacenado para indexar con GIN.
ALTER TABLE documento_text_chunks
ADD COLUMN IF NOT EXISTS tsv tsvector
GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(text, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_tramite ON documento_text_chunks(tramite_id);
CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_documento ON documento_text_chunks(documento_id);
CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_tsv ON documento_text_chunks USING GIN (tsv);

COMMENT ON TABLE documento_text_chunks IS 'Texto OCR/extraído por documento/página para permitir búsqueda y verificación por el chat (RAG).';
COMMENT ON COLUMN documento_text_chunks.tsv IS 'TSVector generado para búsqueda de texto (config: spanish).';

