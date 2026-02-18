-- Fase 4: estado de extraccion/indexacion text-first por documento
-- Fuente de verdad para saber si el documento requiere OCR/Vision.

ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS text_extraction_status TEXT,
  ADD COLUMN IF NOT EXISTS needs_ocr BOOLEAN,
  ADD COLUMN IF NOT EXISTS document_hash TEXT,
  ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS indexing_metadata JSONB;

UPDATE documentos
SET
  text_extraction_status = COALESCE(text_extraction_status, 'PENDING'),
  needs_ocr = COALESCE(needs_ocr, false),
  indexing_metadata = COALESCE(indexing_metadata, '{}'::jsonb)
WHERE
  text_extraction_status IS NULL
  OR needs_ocr IS NULL
  OR indexing_metadata IS NULL;

ALTER TABLE documentos
  ALTER COLUMN text_extraction_status SET DEFAULT 'PENDING',
  ALTER COLUMN text_extraction_status SET NOT NULL,
  ALTER COLUMN needs_ocr SET DEFAULT false,
  ALTER COLUMN needs_ocr SET NOT NULL,
  ALTER COLUMN indexing_metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN indexing_metadata SET NOT NULL;

ALTER TABLE documentos
  DROP CONSTRAINT IF EXISTS documentos_text_extraction_status_check;

ALTER TABLE documentos
  ADD CONSTRAINT documentos_text_extraction_status_check
  CHECK (text_extraction_status IN ('PENDING', 'OK', 'NO_TEXT', 'ERROR'));

CREATE INDEX IF NOT EXISTS idx_documentos_text_extraction_status
  ON documentos (text_extraction_status);

CREATE INDEX IF NOT EXISTS idx_documentos_needs_ocr
  ON documentos (needs_ocr);

CREATE INDEX IF NOT EXISTS idx_documentos_document_hash
  ON documentos (document_hash)
  WHERE document_hash IS NOT NULL;

COMMENT ON COLUMN documentos.text_extraction_status IS 'Estado del pipeline text-first: PENDING, OK, NO_TEXT o ERROR.';
COMMENT ON COLUMN documentos.needs_ocr IS 'true si no hubo texto utilizable y se requiere OCR/Vision como fallback.';
COMMENT ON COLUMN documentos.document_hash IS 'Hash SHA-256 del texto base indexado para idempotencia/reproducibilidad.';
COMMENT ON COLUMN documentos.indexed_at IS 'Timestamp de la ultima indexacion del documento.';
COMMENT ON COLUMN documentos.indexing_metadata IS 'Metadata de indexacion (modelo de embeddings, chunking_version, source, etc.).';
