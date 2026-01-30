-- Enable pgvector extension
create extension if not exists vector with schema public;

-- Ensure table exists (copy from 015) in case it was skipped
CREATE TABLE IF NOT EXISTS documento_text_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  tramite_id UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(documento_id, page_number, chunk_index)
);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_tramite ON documento_text_chunks(tramite_id);
CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_documento ON documento_text_chunks(documento_id);

-- Add vector column
ALTER TABLE documento_text_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add HNSW index for vector similarity
CREATE INDEX IF NOT EXISTS idx_documento_text_chunks_embedding 
ON documento_text_chunks 
USING hnsw (embedding vector_cosine_ops);
