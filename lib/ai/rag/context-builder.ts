import { createHash, randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { EmbeddingsService } from '@/lib/services/embeddings'
import { TramiteService } from '@/lib/services/tramite-service'
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import { TramitePluginStateService } from '@/lib/services/tramite-plugin-state-service'
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
    const registry = PluginRegistry.getInstance()
    const plugin = registry.get(pluginType)
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) {
      throw new Error('Tramite not found')
    }

    const snapshot = TramitePluginStateService.buildStateSnapshot(plugin.tramiteType, tramite.datos || {})

    const reduced: ReducedTramiteState = {
      tramite_id: tramite.id,
      plugin_type: plugin.tramiteType,
      estado: tramite.estado,
      summary: buildStateSummary(tramite.datos || {}),
      wizard_state: snapshot.wizard_state,
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
    const registry = PluginRegistry.getInstance()
    const plugin = registry.get(String(args.pluginType || 'preaviso'))
    const retrievalConfig = plugin.retrievalConfig()
    const knowledgeScope = plugin.knowledgeScope({ scope: retrievalConfig.knowledgeScope || 'chat_generation' })

    const [tramiteState, documentChunks, knowledgeChunks, recentMessages] = await Promise.all([
      this.deps.getTramiteState(args.tramiteId, plugin.tramiteType),
      this.deps.retrieveDocumentChunks({
        query: args.userQuery,
        tramiteId: args.tramiteId,
        topK: retrievalConfig.topKDoc || TOPK_DOC,
      }),
      this.deps.retrieveKnowledgeChunks({
        query: args.userQuery,
        tramite: knowledgeScope.tramite,
        scope: knowledgeScope.scope,
        topK: retrievalConfig.topKKnowledge || TOPK_KNOW,
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
        topk_doc: retrievalConfig.topKDoc || TOPK_DOC,
        topk_knowledge: retrievalConfig.topKKnowledge || TOPK_KNOW,
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
  const comprador0 = compradores[0] || {}
  const vendedor0 = vendedores[0] || {}
  const credito0 = creditos[0] || {}
  const compradorNombre = String(
    comprador0?.persona_fisica?.nombre || comprador0?.persona_moral?.denominacion_social || ''
  ).trim()
  const vendedorNombre = String(
    vendedor0?.persona_fisica?.nombre || vendedor0?.persona_moral?.denominacion_social || ''
  ).trim()
  const creditoInstitucion = String(credito0?.institucion || '').trim()
  const creditoParticipantes = Array.isArray(credito0?.participantes) ? credito0.participantes : []

  return {
    tipo_operacion: raw?.tipoOperacion || null,
    actos_notariales: raw?.actosNotariales || {},
    inmueble: {
      folio_real: inmueble?.folio_real || null,
      direccion: inmueble?.direccion || null,
      partidas_count: Array.isArray(inmueble?.partidas) ? inmueble.partidas.length : 0,
    },
    entidades_clave: {
      comprador_principal: {
        nombre: compradorNombre || null,
        tipo_persona: comprador0?.tipo_persona || null,
        estado_civil: comprador0?.persona_fisica?.estado_civil || null,
      },
      vendedor_principal: {
        nombre: vendedorNombre || null,
        tipo_persona: vendedor0?.tipo_persona || null,
      },
      credito_principal: {
        institucion: creditoInstitucion || null,
        participantes_count: creditoParticipantes.length,
        participantes_preview: creditoParticipantes
          .map((p: any) => String(p || '').trim())
          .filter(Boolean)
          .slice(0, 3),
      },
    },
    counts: {
      vendedores: vendedores.length,
      compradores: compradores.length,
      creditos: creditos.length,
      gravamenes: gravamenes.length,
    },
  }
}

