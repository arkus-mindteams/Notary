-- Permitir comprador_id NULL para trámites en borrador (sin comprador identificado aún)
ALTER TABLE tramites 
ALTER COLUMN comprador_id DROP NOT NULL;

-- Permitir comprador_id NULL para documentos en borrador (sin comprador identificado aún)
ALTER TABLE documentos 
ALTER COLUMN comprador_id DROP NOT NULL;

-- Agregar user_id para identificar quién está trabajando en el trámite
ALTER TABLE tramites 
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Crear índice para búsquedas rápidas de trámites activos por usuario
CREATE INDEX IF NOT EXISTS idx_tramites_user_id ON tramites(user_id);
CREATE INDEX IF NOT EXISTS idx_tramites_user_estado ON tramites(user_id, estado) WHERE comprador_id IS NULL;

-- Agregar campo file_hash para deduplicación de documentos
ALTER TABLE documentos 
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Crear índices para búsquedas rápidas por hash
CREATE INDEX IF NOT EXISTS idx_documentos_file_hash ON documentos(file_hash);
CREATE INDEX IF NOT EXISTS idx_documentos_comprador_hash ON documentos(comprador_id, file_hash);

-- Comentarios
COMMENT ON COLUMN tramites.comprador_id IS 'NULL para trámites en borrador, se asigna cuando se identifica el comprador';
COMMENT ON COLUMN tramites.user_id IS 'ID del usuario que está trabajando en el trámite';
COMMENT ON COLUMN documentos.file_hash IS 'Hash del archivo (MD5) para deduplicación';

