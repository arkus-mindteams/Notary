/**
 * Endpoint de chat usando Plugin System
 */

import { NextResponse } from 'next/server'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { getPreavisoTransitionRules } from '@/lib/tramites/plugins/preaviso/preaviso-transitions'
import { PreavisoConversationLogService } from '@/lib/services/preaviso-conversation-log-service'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'unsupported_media_type', message: 'Content-Type must be application/json' },
        { status: 415 }
      )
    }

    const body = await req.json()
    const { messages, context, tramiteId: tramiteIdFromBody } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'bad_request', message: 'messages array is required' },
        { status: 400 }
      )
    }

    // Obtener último mensaje del usuario
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user')?.content || ''

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: 'bad_request', message: 'user message is required' },
        { status: 400 }
      )
    }

    // Mapear tramiteId: si viene un UUID (ID de base de datos), usar el tipo del trámite del contexto
    // o default a 'preaviso'. El frontend puede enviar el UUID del trámite, pero necesitamos el ID del plugin.
    let pluginId = 'preaviso' // Default
    if (tramiteIdFromBody && typeof tramiteIdFromBody === 'string') {
      // Si es un UUID (formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), ignorarlo y usar el tipo del contexto
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tramiteIdFromBody)
      if (!isUUID) {
        // Si no es UUID, puede ser el ID del plugin directamente
        pluginId = tramiteIdFromBody
      } else {
        // Es UUID, usar el tipo del trámite del contexto si está disponible
        const contextTipo = context?.tipoOperacion || context?.tipo
        if (contextTipo === 'preaviso' || !contextTipo) {
          pluginId = 'preaviso'
        } else {
          // En el futuro, mapear otros tipos de trámites
          pluginId = 'preaviso' // Por ahora, solo preaviso está implementado
        }
      }
    }

    // Obtener sistema de trámites
    const tramiteSystem = getTramiteSystem()

    // Obtener usuario autenticado para logging de usage
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    // Inyectar userId en el contexto
    const processingContext = {
      ...(context || {}),
      _userId: userId // System-reserved field for user tracking
    }

    // Procesar mensaje
    const result = await tramiteSystem.process(
      pluginId,
      lastUserMessage,
      processingContext,
      messages.slice(-10) // Últimos 10 mensajes para contexto
    )

    // Logging (DB): guardar historial en modelo normalizado
    try {
      const supabase = createServerClient()
      const conversationId =
        context?.conversation_id ||
        body?.conversation_id ||
        null

      if (conversationId) {
        // 1. Guardar mensaje del usuario
        // Nota: en una implementación ideal, el frontend ya habría guardado el mensaje del usuario
        // mediante el endpoint POST /api/chat/sessions/[id]/messages para optimismo.
        // Pero por robustez, verificamos o insertamos si no existe, o simplemente asumimos
        // que este endpoint es el encargado de procesar y persistir todo si se usa como "monolito".
        // Para simplificar la migración: insertamos ambos aquí.

        // Insertar user message
        const { error: userMsgError } = await supabase.from('chat_messages').insert({
          session_id: conversationId,
          role: 'user',
          content: lastUserMessage,
          metadata: {
            tramite_id: tramiteIdFromBody,
            plugin_id: pluginId,
            timestamp: new Date().toISOString()
          }
        })

        if (userMsgError) console.error('[preaviso-chat] Error saving user message:', userMsgError)

        const lastAssistantMessage = result.message || null

        // Insertar assistant message
        if (lastAssistantMessage) {
          const { error: assistantMsgError } = await supabase.from('chat_messages').insert({
            session_id: conversationId,
            role: 'assistant',
            content: lastAssistantMessage,
            metadata: {
              processing_time: null, // Podríamos medir esto
              tokens: result.meta?.usage || null
            }
          })
          if (assistantMsgError) console.error('[preaviso-chat] Error saving assistant message:', assistantMsgError)
        }

        // 2. Actualizar sesión (Last Context + Título Dinámico)
        const updates: any = {
          last_context: result.data,
          updated_at: new Date().toISOString()
        }

        // Título dinámico: Si detectamos Folio Real en el contexto
        const folioReal = result.data?.inmueble?.folio_real
        if (folioReal) {
          // Solo actualizamos si el título no ha sido personalizado (esto es difícil de saber sin flag, 
          // pero podemos asumir que si empieza con "Chat " es default o si queremos forzarlo)
          // Estrategia: "Folio Real: <folio>"
          updates.title = `Folio Real: ${folioReal}`
        }

        const { error: sessionError } = await supabase
          .from('chat_sessions')
          .update(updates)
          .eq('id', conversationId)

        if (sessionError) console.error('[preaviso-chat] Error updating session:', sessionError)
      }
    } catch (e) {
      console.error('[preaviso-chat] logging error', e)
    }

    // Retornar respuesta (formato compatible con frontend)
    // El frontend espera: { message(s), data, state }
    const transitionRules = pluginId === 'preaviso' ? getPreavisoTransitionRules() : []

    return NextResponse.json({
      message: result.message, // String único
      messages: [result.message], // Array para compatibilidad
      data: result.data,
      state: {
        current_state: result.state.current,
        state_status: {
          // Mapear estados completados/faltantes a status
          ...result.state.completed.reduce((acc: any, id: string) => {
            acc[id] = 'completed'
            return acc
          }, {}),
          ...result.state.missing.reduce((acc: any, id: string) => {
            acc[id] = 'incomplete'
            return acc
          }, {}),
          [result.state.current]: 'pending'
        },
        required_missing: result.state.missing,
        blocking_reasons: result.state.validation.errors,
        allowed_actions: result.meta?.allowed_tools || [],
        transition_info: result.meta?.transition || null,
        transition_rules: transitionRules
      },
      commands: result.commands, // Para debugging
      meta: result.meta || null
    })

  } catch (error: any) {
    console.error('[preaviso-chat] Error:', error)
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error.message || 'Error procesando mensaje'
      },
      { status: 500 }
    )
  }
}
