/**
 * Endpoint de chat usando Plugin System
 */

import { NextResponse } from 'next/server'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { getPreavisoTransitionRules } from '@/lib/tramites/plugins/preaviso/preaviso-transitions'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { ActivityLogService } from '@/lib/services/activity-log-service'
import { PreavisoWizardStateService } from '@/lib/services/preaviso-wizard-state-service'
import { computePreavisoState } from '@/lib/preaviso-state'

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

    // Obtener usuario autenticado usando el helper oficial
    const usuario = await getCurrentUserFromRequest(req)
    let authUserId = usuario?.auth_user_id || null

    // Fallback: si no hay usuario en el request, intentar obtenerlo de la sesión o trámite previos
    if (!authUserId) {
      const convId = (typeof body?.conversation_id === 'string' && body.conversation_id) || (typeof context?.conversation_id === 'string' && context.conversation_id)
      const tId = tramiteIdFromBody || context?.tramiteId

      if (convId || tId) {
        const supabase = createServerClient()
        if (convId) {
          const { data: sessionRecord } = await supabase
            .from('chat_sessions')
            .select('user_id')
            .eq('id', convId)
            .single()
          if (sessionRecord?.user_id) authUserId = sessionRecord.user_id
        }
        if (!authUserId && tId) {
          const { data: tramiteRecord } = await supabase
            .from('tramites')
            .select('auth_user_id')
            .eq('id', tId)
            .single()
          if (tramiteRecord?.auth_user_id) authUserId = tramiteRecord.auth_user_id
        }
      }
    }

    // Inyectar userId y sessionId en el contexto para trazabilidad logs
    const conversationId =
      (typeof body?.conversation_id === 'string' && body.conversation_id) ||
      (typeof context?.conversation_id === 'string' && context.conversation_id) ||
      (typeof context?.sessionId === 'string' && context.sessionId) ||
      null

    const processingContext = {
      ...(context || {}),
      _userId: authUserId, // System-reserved field for user tracking
      conversation_id: conversationId, // System-reserved field for session tracking
      tramiteId: tramiteIdFromBody || context?.tramiteId || null
    }

    // Procesar mensaje (últimos 20 mensajes = ~10 intercambios para contexto de todo el chat)
    const result = await tramiteSystem.process(
      pluginId,
      lastUserMessage,
      processingContext,
      messages.slice(-20)
    )

    // Logging (DB): guardar historial en modelo normalizado
    try {
      const supabase = createServerClient()
      const conversationId =
        (typeof body?.conversation_id === 'string' && body.conversation_id) ||
        (typeof context?.conversation_id === 'string' && context.conversation_id) ||
        (typeof context?.sessionId === 'string' && context.sessionId) ||
        null

      if (conversationId) {
        const knowledgeSnapshot = result.meta?.knowledge_snapshot || null

        // 1. Guardar mensaje del usuario
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
              processing_time: null,
              tokens: result.meta?.usage || null,
              knowledge_snapshot: knowledgeSnapshot
            }
          })
          if (assistantMsgError) console.error('[preaviso-chat] Error saving assistant message:', assistantMsgError)
        } else {
          console.warn('[preaviso-chat] AI result has no message to save to chat_messages')
        }

        // 2. Actualizar sesión (Last Context + Título Dinámico)
        const updates: any = {
          last_context: result.data,
          updated_at: new Date().toISOString()
        }

        // Título dinámico: Si detectamos Folio Real en el contexto
        const folioReal = result.data?.inmueble?.folio_real
        if (folioReal) {
          updates.title = `Folio Real: ${folioReal}`
        }

        const { error: sessionError } = await supabase
          .from('chat_sessions')
          .update(updates)
          .eq('id', conversationId)

        if (sessionError) console.error('[preaviso-chat] Error updating session:', sessionError)

        // 3. Registrar uso de IA en activity_logs para el dashboard unificado
        if (authUserId && result.meta?.usage) {
          ActivityLogService.logAIUsage({
            userId: authUserId,
            sessionId: conversationId,
            tramiteId: tramiteIdFromBody || undefined,
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            tokensInput: result.meta.usage.prompt_tokens,
            tokensOutput: result.meta.usage.completion_tokens,
            actionType: 'general_chat',
            metadata: {
              category: 'preaviso',
              plugin_id: pluginId
            }
          }).catch(console.error)
        }

        if (authUserId && knowledgeSnapshot) {
          ActivityLogService.logKnowledgeSnapshot({
            userId: authUserId,
            sessionId: conversationId,
            tramiteId: (tramiteIdFromBody as string) || undefined,
            snapshot: knowledgeSnapshot,
            actionType: 'generate_question_knowledge_snapshot'
          }).catch(console.error)
        }
      }
    } catch (e) {
      console.error('[preaviso-chat] logging error', e)
    }

    // Retornar respuesta (formato compatible con frontend)
    const transitionRules = pluginId === 'preaviso' ? getPreavisoTransitionRules() : []

    const computed = computePreavisoState(result.data)
    const stateStatus = computed.state.state_status

    const wizardState = PreavisoWizardStateService.fromSnapshot(
      computed.state.current_state,
      stateStatus,
      computed.state.required_missing,
      computed.state.blocking_reasons
    )

    return NextResponse.json({
      message: result.message,
      messages: [result.message],
      data: result.data,
      state: {
        current_state: computed.state.current_state,
        state_status: stateStatus,
        required_missing: computed.state.required_missing,
        blocking_reasons: computed.state.blocking_reasons,
        allowed_actions: result.meta?.allowed_tools || [],
        transition_info: result.meta?.transition || null,
        transition_rules: transitionRules,
        wizard_state: wizardState,
      },
      commands: result.commands,
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
