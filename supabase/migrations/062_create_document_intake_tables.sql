-- PoC Document Intake: OCR + clasificacion + evidencias + chunks textuales

CREATE TABLE IF NOT EXISTS document_intake_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id text NOT NULL,
  documento_id text NOT NULL,
  tramite_id uuid NULL REFERENCES tramites(id) ON DELETE SET NULL,
  session_id uuid NULL REFERENCES chat_sessions(id) ON DELETE SET NULL,
  filename text NOT NULL,
  mime_type text NULL,
  detected_type text NOT NULL,
  confidence numeric(5,4) NULL,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_intake_results_trace_doc
  ON document_intake_results (trace_id, documento_id);

CREATE INDEX IF NOT EXISTS idx_document_intake_results_tramite
  ON document_intake_results (tramite_id)
  WHERE tramite_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_intake_results_session
  ON document_intake_results (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_intake_results_type
  ON document_intake_results (detected_type);

CREATE TABLE IF NOT EXISTS document_intake_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id text NOT NULL,
  documento_id text NOT NULL,
  tramite_id uuid NULL REFERENCES tramites(id) ON DELETE SET NULL,
  session_id uuid NULL REFERENCES chat_sessions(id) ON DELETE SET NULL,
  page_number integer NOT NULL DEFAULT 1,
  chunk_index integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_intake_chunks_unique
  ON document_intake_chunks (trace_id, documento_id, page_number, chunk_index);

CREATE INDEX IF NOT EXISTS idx_document_intake_chunks_trace
  ON document_intake_chunks (trace_id);

CREATE INDEX IF NOT EXISTS idx_document_intake_chunks_doc
  ON document_intake_chunks (documento_id);

CREATE INDEX IF NOT EXISTS idx_document_intake_chunks_tramite
  ON document_intake_chunks (tramite_id)
  WHERE tramite_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_intake_chunks_session
  ON document_intake_chunks (session_id)
  WHERE session_id IS NOT NULL;

COMMENT ON TABLE document_intake_results IS 'Resultado OCR+clasificacion+facts por documento para trazabilidad y reutilizacion en RAG.';
COMMENT ON TABLE document_intake_chunks IS 'Chunks textuales del intake para consultas ligeras o indexacion posterior.';

