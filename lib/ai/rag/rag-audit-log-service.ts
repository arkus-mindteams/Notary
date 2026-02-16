import { createServerClient } from '@/lib/supabase'

interface LogRagTurnInput {
  userAuthId: string
  chatId: string
  tramiteId: string
  traceId: string
  model: string
  promptHash: string
  contextHash: string
  retrievedDocumentChunkIds: string[]
  retrievedKnowledgeChunkIds: string[]
  latencies: {
    totalMs: number
    retrievalMs: number
    llmMs: number
  }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null
}

export class RagAuditLogService {
  static async logTurn(input: LogRagTurnInput): Promise<void> {
    try {
      const supabase = createServerClient()
      const payload = {
        user_id: input.userAuthId,
        session_id: input.chatId,
        tramite_id: input.tramiteId,
        category: 'ai_usage',
        event_type: 'rag_chat_response',
        tokens_input: input.usage?.prompt_tokens ?? null,
        tokens_output: input.usage?.completion_tokens ?? null,
        tokens_total: input.usage?.total_tokens ?? null,
        data: {
          trace_id: input.traceId,
          model: input.model,
          prompt_hash: input.promptHash,
          context_hash: input.contextHash,
          retrieved_document_chunk_ids: input.retrievedDocumentChunkIds,
          retrieved_knowledge_chunk_ids: input.retrievedKnowledgeChunkIds,
          counts: {
            documents: input.retrievedDocumentChunkIds.length,
            knowledge: input.retrievedKnowledgeChunkIds.length,
          },
          latency_ms: {
            total: input.latencies.totalMs,
            retrieval: input.latencies.retrievalMs,
            llm: input.latencies.llmMs,
          },
        },
      }

      const { error } = await supabase.from('activity_logs').insert(payload)
      if (error) {
        console.error('[RagAuditLogService] Failed to persist audit log:', error)
      }
    } catch (error) {
      console.error('[RagAuditLogService] Unexpected error:', error)
    }
  }
}

