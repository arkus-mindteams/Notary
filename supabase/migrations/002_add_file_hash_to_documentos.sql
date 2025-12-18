-- Agregar campo file_hash para deduplicación de documentos
ALTER TABLE documentos 
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Crear índice para búsquedas rápidas por hash
CREATE INDEX IF NOT EXISTS idx_documentos_file_hash ON documentos(file_hash);

-- Crear índice compuesto para búsquedas por comprador y hash
CREATE INDEX IF NOT EXISTS idx_documentos_comprador_hash ON documentos(comprador_id, file_hash);

-- Comentario
COMMENT ON COLUMN documentos.file_hash IS 'Hash del archivo (MD5 o SHA256) para deduplicación';

