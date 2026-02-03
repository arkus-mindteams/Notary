-- Function to search for similar document chunks using vector similarity
-- Returns chunks sorted by similarity distance
create or replace function match_document_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_tramite_id uuid default null
)
returns table (
  id uuid,
  documento_id uuid,
  text text,
  similarity float,
  metadata jsonb,
  page_number int
)
language plpgsql
as $$
begin
  return query
  select
    documento_text_chunks.id,
    documento_text_chunks.documento_id,
    documento_text_chunks.text,
    1 - (documento_text_chunks.embedding <=> query_embedding) as similarity,
    documento_text_chunks.metadata,
    documento_text_chunks.page_number
  from documento_text_chunks
  where 1 - (documento_text_chunks.embedding <=> query_embedding) > match_threshold
  and (filter_tramite_id is null or documento_text_chunks.tramite_id = filter_tramite_id)
  order by documento_text_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
