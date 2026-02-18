import { createServerClient } from '@/lib/supabase'
import { EmbeddingsService } from '@/lib/services/embeddings'
import { TOPK_KNOW, type RetrievedKnowledgeChunk } from '@/lib/ai/rag/types'

interface MatchKnowledgeChunkRow {
  id: string
  chunk_key: string
  title: string
  content: string
  version: string
  content_hash?: string | null
  similarity: number
  embedding_model?: string | null
}

type KnowledgeRetrievalDeps = {
  generateEmbedding: (text: string) => Promise<number[] | null>
  matchKnowledgeChunks: (args: {
    queryEmbedding: number[]
    matchThreshold: number
    matchCount: number
    tramite: string
    scope: string
  }) => Promise<MatchKnowledgeChunkRow[]>
  fallbackKnowledgeChunks: (args: {
    tramite: string
    scope: string
    limit: number
  }) => Promise<MatchKnowledgeChunkRow[]>
}

const defaultDeps: KnowledgeRetrievalDeps = {
  generateEmbedding: EmbeddingsService.generateEmbedding,
  matchKnowledgeChunks: async (args) => {
    const supabase = createServerClient()
    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: args.queryEmbedding,
      match_threshold: args.matchThreshold,
      match_count: args.matchCount,
      filter_tramite: args.tramite,
      filter_scope: args.scope,
    })
    if (error) {
      throw new Error(`Knowledge retrieval failed: ${error.message}`)
    }
    return (data || []) as MatchKnowledgeChunkRow[]
  },
  fallbackKnowledgeChunks: async ({ tramite, scope, limit }) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('id,chunk_key,title,content,version,content_hash')
      .eq('tramite', tramite)
      .eq('scope', scope)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(limit)
    if (error) {
      throw new Error(`Knowledge fallback lookup failed: ${error.message}`)
    }
    return ((data || []) as any[]).map((row) => ({ ...row, similarity: 0 }))
  },
}

export class KnowledgeRetrievalService {
  constructor(private readonly deps: KnowledgeRetrievalDeps = defaultDeps) {}

  async search(args: {
    query: string
    tramite: string
    scope?: string
    topK?: number
    threshold?: number
  }): Promise<RetrievedKnowledgeChunk[]> {
    const query = String(args.query || '').trim()
    const tramite = String(args.tramite || '').trim()
    const scope = String(args.scope || 'chat_generation').trim()
    if (!query || !tramite) return []

    const queryEmbedding = await this.deps.generateEmbedding(query)
    if (!queryEmbedding) return []

    const topK = Math.max(1, Math.min(20, args.topK ?? TOPK_KNOW))
    let rows: MatchKnowledgeChunkRow[] = []

    try {
      rows = await this.deps.matchKnowledgeChunks({
        queryEmbedding,
        matchThreshold: args.threshold ?? 0.35,
        matchCount: topK,
        tramite,
        scope,
      })
      if (!rows.length) {
        rows = await this.deps.fallbackKnowledgeChunks({ tramite, scope, limit: topK })
      }
    } catch (error) {
      console.warn('[KnowledgeRetrievalService] Vector retrieval unavailable, using fallback:', error)
      rows = await this.deps.fallbackKnowledgeChunks({ tramite, scope, limit: topK })
    }

    return rows
      .map((row) => ({
        id: row.id,
        chunk_key: row.chunk_key,
        title: row.title,
        version: row.version,
        snippet: this.toSnippet(String(row.content || '')),
        similarity: Number(row.similarity || 0),
        content_hash: row.content_hash ?? null,
        embedding_model: row.embedding_model ?? null,
      }))
      .sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity
        return a.id.localeCompare(b.id)
      })
      .slice(0, topK)
  }

  private toSnippet(input: string): string {
    const compact = input.replace(/\s+/g, ' ').trim()
    if (compact.length <= 280) return compact
    return `${compact.slice(0, 280)}...`
  }
}

