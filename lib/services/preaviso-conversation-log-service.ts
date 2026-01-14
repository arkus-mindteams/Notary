import { createServerClient } from '@/lib/supabase'

type ConversationMessage = {
  role: 'user' | 'assistant' | string
  content: string
  [key: string]: any
}

export type UpsertPreavisoConversationLogParams = {
  conversationId: string
  tramiteId?: string | null
  userId?: string | null
  pluginId?: string | null
  messages?: ConversationMessage[]
  lastUserMessage?: string | null
  lastAssistantMessage?: string | null
  context?: any
  state?: any
  meta?: any
}

export class PreavisoConversationLogService {
  static async upsert(params: UpsertPreavisoConversationLogParams): Promise<void> {
    const supabase = createServerClient()

    // Validación mínima
    if (!params.conversationId) return

    // Guardar solo un subset razonable del contexto para evitar inflar la fila con blobs enormes
    const safeContext = params.context ? this.pruneContext(params.context) : null

    const payload: any = {
      conversation_id: params.conversationId,
      tramite_id: params.tramiteId || null,
      user_id: params.userId || null,
      plugin_id: params.pluginId || null,
      last_user_message: params.lastUserMessage || null,
      last_assistant_message: params.lastAssistantMessage || null,
      context: safeContext,
      state: params.state || null,
      meta: params.meta || null,
      updated_at: new Date().toISOString(),
    }
    if (params.messages !== undefined) {
      payload.messages = params.messages
    }

    const { error } = await supabase
      .from('preaviso_conversation_logs')
      .upsert(payload, { onConflict: 'conversation_id' })

    if (error) {
      // No debe romper el flujo del chat
      console.error('[PreavisoConversationLogService] upsert error', error)
    }
  }

  private static pruneContext(ctx: any): any {
    try {
      const c = { ...(ctx || {}) }
      // Evitar guardar contenido pesado: documentos procesados completos y extractedData muy grandes
      if (Array.isArray(c.documentosProcesados) && c.documentosProcesados.length > 0) {
        c.documentosProcesados = c.documentosProcesados.slice(-10).map((d: any) => ({
          nombre: d?.nombre,
          tipo: d?.tipo,
        }))
      }
      return c
    } catch {
      return null
    }
  }
}

