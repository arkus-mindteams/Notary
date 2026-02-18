export const TOPK_DOC = 6
export const TOPK_KNOW = 4
export const N_RECENT_MSG = 8

export type RAGPluginType = 'preaviso' | string

export interface TrackedChatMessage {
  id: string
  role: string
  content: string
  created_at?: string
}

export interface ReducedTramiteState {
  tramite_id: string
  plugin_type: RAGPluginType
  estado: string
  wizard_state?: {
    current_step: number
    total_steps: number
    can_finalize: boolean
  }
  summary: Record<string, unknown>
}

export interface RetrievedDocumentChunk {
  id: string
  documento_id: string
  page_number: number | null
  chunk_index: number | null
  snippet: string
  similarity: number
  embedding_model?: string | null
  chunking_version?: string | null
  document_hash?: string | null
}

export interface RetrievedKnowledgeChunk {
  id: string
  chunk_key: string
  title: string
  version: string
  snippet: string
  similarity: number
  content_hash?: string | null
  embedding_model?: string | null
}

export interface ContextPack {
  tramite_state: ReducedTramiteState
  retrieved_document_chunks: RetrievedDocumentChunk[]
  retrieved_knowledge_chunks: RetrievedKnowledgeChunk[]
  recent_messages: TrackedChatMessage[]
  context_metadata: {
    trace_id: string
    topk_doc: number
    topk_knowledge: number
    recent_messages_window: number
    embedding_model: string
    chunking_version: string
    knowledge_snapshot: {
      version: string
      hash: string
      knowledge_chunk_ids: string[]
    }
  }
}

