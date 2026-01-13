/**
 * Endpoint alternativo de chat usando Plugin System
 * Activar con feature flag: USE_PLUGIN_SYSTEM=1
 */

import { NextResponse } from 'next/server'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'

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
    
    // Procesar mensaje
    const result = await tramiteSystem.process(
      pluginId,
      lastUserMessage,
      context || {},
      messages.slice(-10) // Últimos 10 mensajes para contexto
    )

    // Retornar respuesta (formato compatible con frontend)
    // El frontend espera: { message(s), data, state }
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
        allowed_actions: []
      },
      commands: result.commands // Para debugging
    })

  } catch (error: any) {
    console.error('[preaviso-chat-v2] Error:', error)
    return NextResponse.json(
      { 
        error: 'internal_error', 
        message: error.message || 'Error procesando mensaje' 
      },
      { status: 500 }
    )
  }
}
