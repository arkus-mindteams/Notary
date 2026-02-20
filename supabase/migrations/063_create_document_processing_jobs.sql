CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  auth_user_id uuid NULL,
  tramite_id uuid NULL REFERENCES tramites(id) ON DELETE SET NULL,
  session_id uuid NULL REFERENCES chat_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  total_docs integer NOT NULL DEFAULT 0,
  processed_docs integer NOT NULL DEFAULT 0,
  failed_docs integer NOT NULL DEFAULT 0,
  current_document text NULL,
  message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_user
  ON document_processing_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_session
  ON document_processing_jobs (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_tramite
  ON document_processing_jobs (tramite_id)
  WHERE tramite_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_status
  ON document_processing_jobs (status, updated_at DESC);

COMMENT ON TABLE document_processing_jobs IS 'Estado persistido de procesamiento de documentos para rehidratacion de progreso tras recarga.';

