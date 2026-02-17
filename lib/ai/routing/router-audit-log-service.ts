import { createHash } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import type { AgentUsed, Intent, RouterUIContext } from '@/lib/ai/routing/types'

interface RouterAuditEntry {
  userAuthId: string
  chatId: string
  tramiteId: string
  traceId: string
  intent: Intent
  agentUsed: AgentUsed
  message: string
  uiContext?: RouterUIContext
  answer?: string
  topKIds?: string[]
  errors?: Record<string, unknown>
  latencies?: Record<string, unknown>
}

export class RouterAuditLogService {
  static async logRoute(entry: RouterAuditEntry): Promise<void> {
    try {
      const supabase = createServerClient()
      const payload = {
        user_id: entry.userAuthId,
        session_id: entry.chatId,
        tramite_id: entry.tramiteId,
        category: 'ai_usage',
        event_type: 'agent_router_decision',
        data: {
          trace_id: entry.traceId,
          intent: entry.intent,
          agent_used: entry.agentUsed,
          message_hash: sha256(entry.message),
          ui_context_hash: sha256(safeStringify(entry.uiContext || {})),
          answer_hash: sha256(String(entry.answer || '')),
          topk_ids: entry.topKIds || [],
          errors: entry.errors || {},
          latency_ms: entry.latencies || {},
        },
      }

      const { error } = await supabase.from('activity_logs').insert(payload)
      if (error) {
        console.error('[RouterAuditLogService] Failed to persist route audit:', error)
      }
    } catch (error) {
      console.error('[RouterAuditLogService] Unexpected error:', error)
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

