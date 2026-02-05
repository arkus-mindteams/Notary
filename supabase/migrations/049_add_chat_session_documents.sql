-- Migration: Link documents to chat sessions
-- Purpose: Track which documents were uploaded in each conversation

-- Tabla de relación entre sesiones de chat y documentos
CREATE TABLE IF NOT EXISTS chat_session_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relaciones
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  
  -- Metadata
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata adicional del upload
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraint: un documento solo puede estar una vez por sesión
  UNIQUE(session_id, documento_id)
);

-- Índices para queries rápidas
CREATE INDEX idx_chat_session_docs_session 
  ON chat_session_documents(session_id, uploaded_at DESC);

CREATE INDEX idx_chat_session_docs_documento 
  ON chat_session_documents(documento_id);

CREATE INDEX idx_chat_session_docs_message 
  ON chat_session_documents(message_id)
  WHERE message_id IS NOT NULL;

-- RLS Policies
ALTER TABLE chat_session_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view documents from their sessions
CREATE POLICY "Users can view documents from their sessions"
ON chat_session_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_session_documents.session_id
    AND chat_sessions.user_id = auth.uid()
  )
);

-- Policy: Users can insert documents to their sessions
CREATE POLICY "Users can insert documents to their sessions"
ON chat_session_documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE chat_sessions.id = chat_session_documents.session_id
    AND chat_sessions.user_id = auth.uid()
  )
);

-- Policy: Superadmins can view all
CREATE POLICY "Superadmins can view all session documents"
ON chat_session_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.rol = 'superadmin'
  )
);

-- Grants
GRANT ALL ON TABLE chat_session_documents TO service_role;
GRANT SELECT, INSERT ON TABLE chat_session_documents TO authenticated;

-- Comments
COMMENT ON TABLE chat_session_documents IS 'Relación entre sesiones de chat y documentos subidos';
COMMENT ON COLUMN chat_session_documents.session_id IS 'Sesión de chat donde se subió el documento';
COMMENT ON COLUMN chat_session_documents.documento_id IS 'Documento subido';
COMMENT ON COLUMN chat_session_documents.message_id IS 'Mensaje donde se subió el documento (opcional)';
COMMENT ON COLUMN chat_session_documents.metadata IS 'Metadata adicional del upload (tipo de extracción, tokens usados, etc.)';
