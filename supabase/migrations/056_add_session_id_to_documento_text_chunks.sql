-- Ligar chunks a chat_sessions para que al entrar al chat se recupere contexto por sesión
-- sin depender de tramite_id (que puede no estar disponible al cargar la conversación).

-- 1. Añadir session_id (nullable) para chunks originados en el chat de preaviso
ALTER TABLE documento_text_chunks
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_session ON documento_text_chunks(session_id) WHERE session_id IS NOT NULL;

COMMENT ON COLUMN documento_text_chunks.session_id IS 'Sesión de chat donde se subió el documento; permite RAG por conversación al reabrir el chat.';

-- 2. Hacer tramite_id nullable para chunks que solo tengan session_id (chat)
-- Los chunks de expedientes/upload siguen usando tramite_id.
ALTER TABLE documento_text_chunks
ALTER COLUMN tramite_id DROP NOT NULL;
