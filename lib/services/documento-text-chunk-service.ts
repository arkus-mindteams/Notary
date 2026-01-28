import { createServerClient } from '@/lib/supabase'

export type DocumentoTextChunk = {
  id: string
  documento_id: string
  tramite_id: string
  page_number: number
  chunk_index: number
  text: string
  metadata?: Record<string, any> | null
  created_at: string
}

export class DocumentoTextChunkService {
  static async upsertChunk(args: {
    documentoId: string
    tramiteId: string
    pageNumber: number
    chunkIndex?: number
    text: string
    metadata?: Record<string, any> | null
  }): Promise<DocumentoTextChunk> {
    const supabase = createServerClient()
    const chunkIndex = args.chunkIndex ?? 0
    const { data, error } = await supabase
      .from('documento_text_chunks')
      .upsert(
        {
          documento_id: args.documentoId,
          tramite_id: args.tramiteId,
          page_number: args.pageNumber,
          chunk_index: chunkIndex,
          text: args.text,
          metadata: args.metadata || null,
        },
        { onConflict: 'documento_id,page_number,chunk_index' }
      )
      .select('*')
      .single()

    if (error) throw new Error(`Error upserting documento_text_chunks: ${error.message}`)
    return data as DocumentoTextChunk
  }

  static async searchChunks(args: {
    tramiteId: string
    query: string
    documentoIds?: string[] | null
    limit?: number
  }): Promise<DocumentoTextChunk[]> {
    const supabase = createServerClient()
    const limit = Math.max(1, Math.min(20, args.limit ?? 6))
    const q = String(args.query || '').trim()
    if (!q) return []

    // Nota: `textSearch` usa el TSVector generado (tsv). Config = 'spanish'.
    let query = supabase
      .from('documento_text_chunks')
      .select('id,documento_id,tramite_id,page_number,chunk_index,text,metadata,created_at')
      .eq('tramite_id', args.tramiteId)
      .textSearch('tsv', q, { type: 'websearch', config: 'spanish' })
      .limit(limit)

    if (Array.isArray(args.documentoIds) && args.documentoIds.length > 0) {
      query = query.in('documento_id', args.documentoIds)
    }

    const { data, error } = await query
    if (error) throw new Error(`Error searching documento_text_chunks: ${error.message}`)
    return (data || []) as DocumentoTextChunk[]
  }
}

