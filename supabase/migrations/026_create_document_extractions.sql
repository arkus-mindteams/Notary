-- Create table for storing cached AI extractions independent of file storage
CREATE TABLE IF NOT EXISTS document_extractions (
  file_hash TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups (though PK is already indexed)
-- CREATE INDEX IF NOT EXISTS idx_document_extractions_hash ON document_extractions(file_hash);

COMMENT ON TABLE document_extractions IS 'Cache of AI extraction results keyed by file hash';
