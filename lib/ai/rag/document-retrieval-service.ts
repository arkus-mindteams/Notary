import { createServerClient } from '@/lib/supabase'
import { EmbeddingsService } from '@/lib/services/embeddings'
import { TOPK_DOC, type RetrievedDocumentChunk } from '@/lib/ai/rag/types'

interface MatchDocumentChunkRow {
  id: string
  documento_id: string
  text: string
  similarity: number
  metadata?: Record<string, unknown> | null
  page_number?: number | null
}

interface DocumentChunkDetailRow {
  id: string
  documento_id: string
  tramite_id?: string | null
  page_number?: number | null
  chunk_index?: number | null
  text?: string | null
  content?: string | null
  embedding_model?: string | null
  chunking_version?: string | null
  document_hash?: string | null
}

type RetrievalDeps = {
  generateEmbedding: (text: string) => Promise<number[] | null>
  matchDocumentChunks: (args: {
    queryEmbedding: number[]
    matchThreshold: number
    matchCount: number
    tramiteId: string
  }) => Promise<MatchDocumentChunkRow[]>
  getChunkDetailsByIds: (ids: string[]) => Promise<DocumentChunkDetailRow[]>
}

const defaultDeps: RetrievalDeps = {
  generateEmbedding: EmbeddingsService.generateEmbedding,
  matchDocumentChunks: async (args) => {
    const supabase = createServerClient()
    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: args.queryEmbedding,
      match_threshold: args.matchThreshold,
      match_count: args.matchCount,
      filter_tramite_id: args.tramiteId,
      filter_session_id: null,
    })
    if (error) {
      throw new Error(`Document retrieval failed: ${error.message}`)
    }
    return (data || []) as MatchDocumentChunkRow[]
  },
  getChunkDetailsByIds: async (ids) => {
    if (ids.length === 0) return []
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('documento_text_chunks')
      .select('id,documento_id,tramite_id,page_number,chunk_index,text,content,embedding_model,chunking_version,document_hash')
      .in('id', ids)
    if (error) {
      throw new Error(`Chunk details lookup failed: ${error.message}`)
    }
    return (data || []) as DocumentChunkDetailRow[]
  },
}

export class DocumentRetrievalService {
  constructor(private readonly deps: RetrievalDeps = defaultDeps) {}

  async search(args: {
    query: string
    tramiteId: string
    topK?: number
    threshold?: number
  }): Promise<RetrievedDocumentChunk[]> {
    const query = String(args.query || '').trim()
    if (!query || !args.tramiteId) return []

    const queryEmbedding = await this.deps.generateEmbedding(query)
    if (!queryEmbedding) return []

    const topK = Math.max(1, Math.min(20, args.topK ?? TOPK_DOC))
    const matchRows = await this.deps.matchDocumentChunks({
      queryEmbedding,
      matchThreshold: args.threshold ?? 0.45,
      matchCount: topK,
      tramiteId: args.tramiteId,
    })

    if (matchRows.length === 0) return []

    const scoreById = new Map<string, number>()
    for (const row of matchRows) {
      scoreById.set(row.id, Number(row.similarity || 0))
    }

    const details = await this.deps.getChunkDetailsByIds(matchRows.map((x) => x.id))
    const filteredByScope = details.filter((row) => String(row.tramite_id || '') === String(args.tramiteId))

    const merged = filteredByScope
      .map((row): RetrievedDocumentChunk => {
        const rawText = String(row.content || row.text || '').trim()
        return {
          id: row.id,
          documento_id: row.documento_id,
          page_number: row.page_number ?? null,
          chunk_index: row.chunk_index ?? null,
          snippet: this.toSnippet(rawText),
          similarity: Number(scoreById.get(row.id) || 0),
          embedding_model: row.embedding_model ?? null,
          chunking_version: row.chunking_version ?? null,
          document_hash: row.document_hash ?? null,
        }
      })
      .sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity
        return a.id.localeCompare(b.id)
      })

    return merged.slice(0, topK)
  }

  private toSnippet(input: string): string {
    const compact = input.replace(/\s+/g, ' ').trim()
    if (compact.length <= 320) return compact
    return `${compact.slice(0, 320)}...`
  }
}

