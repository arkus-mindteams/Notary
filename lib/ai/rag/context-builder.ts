import { createHash, randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { EmbeddingsService } from '@/lib/services/embeddings'
import { TramiteService } from '@/lib/services/tramite-service'
import { PreavisoWizardStateService } from '@/lib/services/preaviso-wizard-state-service'
import { DocumentRetrievalService } from '@/lib/ai/rag/document-retrieval-service'
import { KnowledgeRetrievalService } from '@/lib/ai/rag/knowledge-retrieval-service'
import {
  TOPK_DOC,
  TOPK_KNOW,
  N_RECENT_MSG,
  type ContextPack,
  type RAGPluginType,
  type ReducedTramiteState,
  type RetrievedDocumentChunk,
  type RetrievedKnowledgeChunk,
  type TrackedChatMessage,
} from '@/lib/ai/rag/types'

type ContextBuilderDeps = {
  createTraceId: () => string
  getTramiteState: (tramiteId: string, pluginType: string) => Promise<ReducedTramiteState>
  retrieveDocumentChunks: (args: {
    query: string
    tramiteId: string
    topK: number
  }) => Promise<RetrievedDocumentChunk[]>
  retrieveKnowledgeChunks: (args: {
    query: string
    tramite: string
    scope: string
    topK: number
  }) => Promise<RetrievedKnowledgeChunk[]>
  listRecentMessages: (chatId: string, limit: number) => Promise<TrackedChatMessage[]>
}

const defaultDeps: ContextBuilderDeps = {
  createTraceId: () => randomUUID(),
  getTramiteState: async (tramiteId, pluginType) => {
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) {
      throw new Error('Tramite not found')
    }

    const reduced: ReducedTramiteState = {
      tramite_id: tramite.id,
      plugin_type: pluginType,
      estado: tramite.estado,
      summary: buildStateSummary(tramite.datos || {}),
    }

    if (pluginType === 'preaviso') {
      const wizard = PreavisoWizardStateService.fromContext(tramite.datos || {})
      reduced.wizard_state = {
        current_step: wizard.current_step,
        total_steps: wizard.total_steps,
        can_finalize: wizard.can_finalize,
      }
    }

    return reduced
  },
  retrieveDocumentChunks: async (args) => {
    const service = new DocumentRetrievalService()
    return service.search({
      query: args.query,
      tramiteId: args.tramiteId,
      topK: args.topK,
    })
  },
  retrieveKnowledgeChunks: async (args) => {
    const service = new KnowledgeRetrievalService()
    return service.search({
      query: args.query,
      tramite: args.tramite,
      scope: args.scope,
      topK: args.topK,
    })
  },
  listRecentMessages: async (chatId, limit) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id,role,content,created_at')
      .eq('session_id', chatId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      throw new Error(`Failed loading recent messages: ${error.message}`)
    }
    return ((data || []) as any[])
      .reverse()
      .map((x) => ({
        id: String(x.id),
        role: String(x.role),
        content: String(x.content || ''),
        created_at: x.created_at ? String(x.created_at) : undefined,
      }))
  },
}

export class ContextBuilder {
  constructor(private readonly deps: ContextBuilderDeps = defaultDeps) {}

  async build(args: {
    tramiteId: string
    chatId: string
    userQuery: string
    pluginType: RAGPluginType
  }): Promise<ContextPack> {
    const traceId = this.deps.createTraceId()
    const pluginType = String(args.pluginType || 'preaviso')

    const [tramiteState, documentChunks, knowledgeChunks, recentMessages] = await Promise.all([
      this.deps.getTramiteState(args.tramiteId, pluginType),
      this.deps.retrieveDocumentChunks({
        query: args.userQuery,
        tramiteId: args.tramiteId,
        topK: TOPK_DOC,
      }),
      this.deps.retrieveKnowledgeChunks({
        query: args.userQuery,
        tramite: pluginType,
        scope: 'chat_generation',
        topK: TOPK_KNOW,
      }),
      this.deps.listRecentMessages(args.chatId, N_RECENT_MSG),
    ])

    const chunkingVersion = Array.from(
      new Set(documentChunks.map((x) => String(x.chunking_version || 'unknown')))
    )
      .sort()
      .join(',')

    const embeddingModels = new Set<string>([EmbeddingsService.getModelName()])
    for (const d of documentChunks) {
      if (d.embedding_model) embeddingModels.add(String(d.embedding_model))
    }
    for (const k of knowledgeChunks) {
      if (k.embedding_model) embeddingModels.add(String(k.embedding_model))
    }

    const knowledgeVersion = Array.from(new Set(knowledgeChunks.map((x) => x.version))).sort().join(',')
    const knowledgeHashBase = knowledgeChunks
      .map((x) => `${x.id}:${x.version}:${x.content_hash || ''}`)
      .sort()
      .join('|')
    const knowledgeHash = createHash('sha256').update(knowledgeHashBase || 'none').digest('hex')

    return {
      tramite_state: tramiteState,
      retrieved_document_chunks: documentChunks,
      retrieved_knowledge_chunks: knowledgeChunks,
      recent_messages: recentMessages,
      context_metadata: {
        trace_id: traceId,
        topk_doc: TOPK_DOC,
        topk_knowledge: TOPK_KNOW,
        recent_messages_window: N_RECENT_MSG,
        embedding_model: Array.from(embeddingModels).sort().join(','),
        chunking_version: chunkingVersion || 'unknown',
        knowledge_snapshot: {
          version: knowledgeVersion || 'none',
          hash: knowledgeHash,
          knowledge_chunk_ids: knowledgeChunks.map((x) => x.id),
        },
      },
    }
  }
}

function buildStateSummary(raw: Record<string, any>): Record<string, unknown> {
  const inmueble = raw?.inmueble || {}
  const vendedores = Array.isArray(raw?.vendedores) ? raw.vendedores : []
  const compradores = Array.isArray(raw?.compradores) ? raw.compradores : []
  const creditos = Array.isArray(raw?.creditos) ? raw.creditos : []
  const gravamenes = Array.isArray(raw?.gravamenes) ? raw.gravamenes : []

  return {
    tipo_operacion: raw?.tipoOperacion || null,
    actos_notariales: raw?.actosNotariales || {},
    inmueble: {
      folio_real: inmueble?.folio_real || null,
      direccion: inmueble?.direccion || null,
      partidas_count: Array.isArray(inmueble?.partidas) ? inmueble.partidas.length : 0,
    },
    counts: {
      vendedores: vendedores.length,
      compradores: compradores.length,
      creditos: creditos.length,
      gravamenes: gravamenes.length,
    },
  }
}

