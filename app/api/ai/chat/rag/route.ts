import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { RetrievalResponseAgent, AIOutputInvalidError } from '@/lib/ai/rag/retrieval-response-agent'

const requestSchema = z.object({
  chatId: z.string().uuid(),
  tramiteId: z.string().uuid(),
  message: z.string().trim().min(1),
  pluginType: z.string().trim().min(1).optional(),
}).strict()

const ragAgent = new RetrievalResponseAgent()

const errorResponse = (
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  traceId?: string
) =>
  NextResponse.json(
    {
      error: {
        code,
        message,
        details,
        ...(traceId ? { trace_id: traceId } : {}),
      },
    },
    { status }
  )

const defaultDeps = {
  getCurrentUserFromRequest,
  findChatSession: async (chatId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id,user_id')
      .eq('id', chatId)
      .maybeSingle()
    if (error) throw new Error(`Error loading chat session: ${error.message}`)
    return (data || null) as { id: string; user_id: string } | null
  },
  findTramiteScope: async (tramiteId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('tramites')
      .select('id,tipo,user_id,comprador_id,compradores(notaria_id)')
      .eq('id', tramiteId)
      .maybeSingle()
    if (error) throw new Error(`Error loading tramite: ${error.message}`)
    return (data || null) as {
      id: string
      tipo: string
      user_id?: string | null
      comprador_id?: string | null
      compradores?: { notaria_id?: string | null } | null
    } | null
  },
  insertChatMessage: async (chatId: string, role: string, content: string, metadata: Record<string, unknown>) => {
    const supabase = createServerClient()
    const { error } = await supabase.from('chat_messages').insert({
      session_id: chatId,
      role,
      content,
      metadata,
    })
    if (error) {
      console.error('[POST /api/ai/chat/rag] Failed to persist chat message:', error)
    }
  },
  updateChatSessionTimestamp: async (chatId: string) => {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId)
    if (error) {
      console.error('[POST /api/ai/chat/rag] Failed to update chat session timestamp:', error)
    }
  },
  respond: (args: Parameters<RetrievalResponseAgent['respond']>[0]) => ragAgent.respond(args),
}

type RouteDeps = typeof defaultDeps

export function createRagChatRouteHandler(deps: RouteDeps = defaultDeps) {
  return async function POST(req: Request) {
    try {
      const currentUser = await deps.getCurrentUserFromRequest(req)
      if (!currentUser || !currentUser.activo || !currentUser.auth_user_id) {
        return errorResponse(401, 'UNAUTHORIZED', 'No autenticado')
      }

      const parsedBody = requestSchema.safeParse(await req.json())
      if (!parsedBody.success) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Body invalido', {
          issues: parsedBody.error.issues.map((x) => ({
            path: x.path.join('.'),
            message: x.message,
          })),
        })
      }

      const body = parsedBody.data
      const [chatSession, tramiteScope] = await Promise.all([
        deps.findChatSession(body.chatId),
        deps.findTramiteScope(body.tramiteId),
      ])

      if (!chatSession) {
        return errorResponse(404, 'NOT_FOUND', 'Chat no encontrado')
      }
      if (!tramiteScope) {
        return errorResponse(404, 'NOT_FOUND', 'Tramite no encontrado')
      }

      if (currentUser.rol !== 'superadmin') {
        if (String(chatSession.user_id) !== String(currentUser.auth_user_id)) {
          return errorResponse(403, 'FORBIDDEN', 'No autorizado para este chat')
        }
        if (tramiteScope.user_id && String(tramiteScope.user_id) !== String(currentUser.id)) {
          return errorResponse(403, 'FORBIDDEN', 'No autorizado para este tramite')
        }
        const tramiteNotariaId = tramiteScope.compradores?.notaria_id || null
        if (currentUser.notaria_id && tramiteNotariaId && String(currentUser.notaria_id) !== String(tramiteNotariaId)) {
          return errorResponse(403, 'FORBIDDEN', 'No autorizado por alcance de notaria')
        }
      }

      const result = await deps.respond({
        chatId: body.chatId,
        tramiteId: body.tramiteId,
        userMessage: body.message,
        userAuthId: currentUser.auth_user_id,
        pluginType: body.pluginType || tramiteScope.tipo || 'preaviso',
      })

      await Promise.all([
        deps.insertChatMessage(body.chatId, 'user', body.message, {
          trace_id: result.trace_id,
          source: 'rag_chat',
          tramite_id: body.tramiteId,
        }),
        deps.insertChatMessage(body.chatId, 'assistant', result.answer, {
          trace_id: result.trace_id,
          source: 'rag_chat',
          tramite_id: body.tramiteId,
          citations: result.citations,
          suggested_updates: result.suggested_updates || [],
        }),
        deps.updateChatSessionTimestamp(body.chatId),
      ])

      return NextResponse.json(
        {
          answer: result.answer,
          citations: result.citations,
          trace_id: result.trace_id,
        },
        { status: 200 }
      )
    } catch (error: any) {
      if (error instanceof AIOutputInvalidError) {
        return errorResponse(
          502,
          'AI_OUTPUT_INVALID',
          error.message,
          error.details || {},
          String(error.details?.trace_id || '')
        )
      }

      console.error('[POST /api/ai/chat/rag] Error:', error)
      return errorResponse(500, 'INTERNAL_ERROR', error?.message || 'Error interno del servidor')
    }
  }
}

export const POST = createRagChatRouteHandler()

