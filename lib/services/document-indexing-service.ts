import { createHash } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { EmbeddingsService } from '@/lib/services/embeddings'
import { DocumentChunker, DEFAULT_CHUNKING_VERSION } from '@/lib/services/document-chunker'
import { DocumentTextExtractor } from '@/lib/services/document-text-extractor'
import { ActivityLogService } from '@/lib/services/activity-log-service'

type DocumentoRow = {
  id: string
  nombre: string
  mime_type: string
  s3_key: string | null
  metadata: Record<string, any> | null
}

type PersistedChunkRow = {
  documento_id: string
  tramite_id: string | null
  session_id: string | null
  page_number: number
  chunk_index: number
  text: string
  content: string
  token_count: number | null
  metadata: Record<string, any>
  embedding: number[]
  document_hash: string
  chunking_version: string
  embedding_model: string
  embedding_dimensions: number
}

export type DocumentIndexStatus = 'indexed' | 'skipped' | 'needs_ocr' | 'error'

export type DocumentIndexResult = {
  chunks_created: number
  embeddings_created: number
  status: DocumentIndexStatus
  trace_id: string
  extraction_source?: string
  needs_ocr_reason?: string
}

type IndexingDeps = {
  findDocumentoById: (documentoId: string) => Promise<DocumentoRow | null>
  findTramiteIdByDocumentoId: (documentoId: string) => Promise<string | null>
  hasExistingIndexSignature: (params: {
    documentoId: string
    documentHash: string
    chunkingVersion: string
    embeddingModel: string
  }) => Promise<boolean>
  deleteIndexSignature: (params: {
    documentoId: string
    documentHash: string
    chunkingVersion: string
    embeddingModel: string
  }) => Promise<void>
  upsertChunks: (rows: PersistedChunkRow[]) => Promise<void>
  generateEmbedding: (text: string) => Promise<number[] | null>
  extractText: (documento: DocumentoRow) => Promise<{
    text: string
    source: string
    needs_ocr: boolean
    reason?: string
  }>
  logEvent: (params: {
    userId: string
    traceId: string
    documentoId: string
    tramiteId?: string | null
    stage: string
    status: 'start' | 'success' | 'error' | 'skipped' | 'needs_ocr'
    durationMs?: number
    metadata?: Record<string, any>
  }) => Promise<void>
}

const defaultDeps: IndexingDeps = {
  findDocumentoById: async (documentoId) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('documentos')
      .select('id,nombre,mime_type,s3_key,metadata')
      .eq('id', documentoId)
      .maybeSingle()
    if (error) throw new Error(`document_lookup_failed:${error.message}`)
    return (data || null) as DocumentoRow | null
  },
  findTramiteIdByDocumentoId: async (documentoId) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('tramite_documentos')
      .select('tramite_id')
      .eq('documento_id', documentoId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return (data?.tramite_id as string | undefined) || null
  },
  hasExistingIndexSignature: async (params) => {
    const supabase = createServerClient()
    const { count, error } = await supabase
      .from('documento_text_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('documento_id', params.documentoId)
      .eq('document_hash', params.documentHash)
      .eq('chunking_version', params.chunkingVersion)
      .eq('embedding_model', params.embeddingModel)
    if (error) throw new Error(`index_lookup_failed:${error.message}`)
    return (count || 0) > 0
  },
  deleteIndexSignature: async (params) => {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('documento_text_chunks')
      .delete()
      .eq('documento_id', params.documentoId)
      .eq('document_hash', params.documentHash)
      .eq('chunking_version', params.chunkingVersion)
      .eq('embedding_model', params.embeddingModel)
    if (error) throw new Error(`index_delete_failed:${error.message}`)
  },
  upsertChunks: async (rows) => {
    if (rows.length === 0) return
    const supabase = createServerClient()
    const { error } = await supabase
      .from('documento_text_chunks')
      .upsert(rows, {
        onConflict: 'documento_id,chunking_version,embedding_model,chunk_index,document_hash',
      })
    if (error) throw new Error(`chunk_upsert_failed:${error.message}`)
  },
  generateEmbedding: async (text) => EmbeddingsService.generateEmbedding(text),
  extractText: async (documento) => {
    const extractor = new DocumentTextExtractor()
    return extractor.extract(documento)
  },
  logEvent: async (params) => {
    await ActivityLogService.logDocumentIndexing({
      userId: params.userId,
      traceId: params.traceId,
      documentoId: params.documentoId,
      tramiteId: params.tramiteId || undefined,
      stage: params.stage,
      status: params.status,
      durationMs: params.durationMs,
      metadata: params.metadata,
    })
  },
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export class DocumentIndexingService {
  static readonly CHUNKING_VERSION = DEFAULT_CHUNKING_VERSION

  constructor(private readonly deps: IndexingDeps = defaultDeps) {}

  async indexDocument(params: {
    documentoId: string
    forceReindex?: boolean
    traceId: string
    userId: string
  }): Promise<DocumentIndexResult> {
    const startedAt = Date.now()
    const forceReindex = Boolean(params.forceReindex)
    const embeddingModel = EmbeddingsService.getModelName()
    const embeddingDimensions = EmbeddingsService.getModelDimensions()

    let tramiteId: string | null = null
    try {
      const documento = await this.deps.findDocumentoById(params.documentoId)
      if (!documento) {
        throw new Error('document_not_found')
      }

      tramiteId = await this.deps.findTramiteIdByDocumentoId(params.documentoId)
      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'index_document',
        status: 'start',
        metadata: {
          force_reindex: forceReindex,
          chunking_version: DocumentIndexingService.CHUNKING_VERSION,
          embedding_model: embeddingModel,
        },
      })

      const extractStartedAt = Date.now()
      const extraction = await this.deps.extractText(documento)
      const extractDurationMs = Date.now() - extractStartedAt
      if (extraction.needs_ocr || !extraction.text.trim()) {
        await this.deps.logEvent({
          userId: params.userId,
          traceId: params.traceId,
          documentoId: params.documentoId,
          tramiteId,
          stage: 'extract_text',
          status: 'needs_ocr',
          durationMs: extractDurationMs,
          metadata: {
            source: extraction.source,
            reason: extraction.reason || 'text_not_usable',
          },
        })
        return {
          chunks_created: 0,
          embeddings_created: 0,
          status: 'needs_ocr',
          trace_id: params.traceId,
          extraction_source: extraction.source,
          needs_ocr_reason: extraction.reason || 'text_not_usable',
        }
      }

      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'extract_text',
        status: 'success',
        durationMs: extractDurationMs,
        metadata: { source: extraction.source },
      })

      const documentHash = hashText(extraction.text)
      const alreadyIndexed = await this.deps.hasExistingIndexSignature({
        documentoId: params.documentoId,
        documentHash,
        chunkingVersion: DocumentIndexingService.CHUNKING_VERSION,
        embeddingModel,
      })

      if (alreadyIndexed && !forceReindex) {
        await this.deps.logEvent({
          userId: params.userId,
          traceId: params.traceId,
          documentoId: params.documentoId,
          tramiteId,
          stage: 'idempotency',
          status: 'skipped',
          metadata: {
            reason: 'already_indexed',
            document_hash: documentHash,
          },
        })
        return {
          chunks_created: 0,
          embeddings_created: 0,
          status: 'skipped',
          trace_id: params.traceId,
          extraction_source: extraction.source,
        }
      }

      if (alreadyIndexed && forceReindex) {
        await this.deps.deleteIndexSignature({
          documentoId: params.documentoId,
          documentHash,
          chunkingVersion: DocumentIndexingService.CHUNKING_VERSION,
          embeddingModel,
        })
      }

      const chunkStartedAt = Date.now()
      const chunks = DocumentChunker.chunk({
        rawText: extraction.text,
        chunkingVersion: DocumentIndexingService.CHUNKING_VERSION,
        docMeta: {
          extractor_source: extraction.source,
        },
      })
      const chunkDurationMs = Date.now() - chunkStartedAt

      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'chunking',
        status: 'success',
        durationMs: chunkDurationMs,
        metadata: { chunk_count: chunks.length },
      })

      const embeddingStartedAt = Date.now()
      const rows: PersistedChunkRow[] = []
      for (const chunk of chunks) {
        const embedding = await this.deps.generateEmbedding(chunk.content)
        if (!embedding || embedding.length === 0) {
          throw new Error(`embedding_failed_for_chunk_${chunk.chunk_index}`)
        }
        rows.push({
          documento_id: params.documentoId,
          tramite_id: tramiteId,
          session_id: null,
          page_number: 1,
          chunk_index: chunk.chunk_index,
          text: chunk.content,
          content: chunk.content,
          token_count: chunk.token_count,
          metadata: {
            ...chunk.metadata,
            trace_id: params.traceId,
          },
          embedding,
          document_hash: documentHash,
          chunking_version: DocumentIndexingService.CHUNKING_VERSION,
          embedding_model: embeddingModel,
          embedding_dimensions: embeddingDimensions,
        })
      }
      const embeddingDurationMs = Date.now() - embeddingStartedAt

      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'embedding',
        status: 'success',
        durationMs: embeddingDurationMs,
        metadata: {
          chunk_count: rows.length,
          embedding_model: embeddingModel,
        },
      })

      const persistStartedAt = Date.now()
      await this.deps.upsertChunks(rows)
      const persistDurationMs = Date.now() - persistStartedAt

      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'persist',
        status: 'success',
        durationMs: persistDurationMs,
        metadata: {
          chunk_count: rows.length,
          embedding_model: embeddingModel,
          document_hash: documentHash,
        },
      })

      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'index_document',
        status: 'success',
        durationMs: Date.now() - startedAt,
        metadata: {
          chunk_count: rows.length,
          embedding_model: embeddingModel,
        },
      })

      return {
        chunks_created: rows.length,
        embeddings_created: rows.length,
        status: 'indexed',
        trace_id: params.traceId,
        extraction_source: extraction.source,
      }
    } catch (error) {
      await this.deps.logEvent({
        userId: params.userId,
        traceId: params.traceId,
        documentoId: params.documentoId,
        tramiteId,
        stage: 'index_document',
        status: 'error',
        durationMs: Date.now() - startedAt,
        metadata: {
          error_message: String((error as any)?.message || 'indexing_error'),
        },
      })
      throw error
    }
  }
}
