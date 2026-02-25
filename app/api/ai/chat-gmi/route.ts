import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { GMIIndependentCaptureFlow } from '@/lib/ai/routing/gmi-independent-capture-flow'
import {
  PreavisoProposedUpdateService,
  ProposedUpdateDomainViolationError,
} from '@/lib/services/preaviso-proposed-update-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import { TramitePluginStateService } from '@/lib/services/tramite-plugin-state-service'

const requestSchema = z
  .object({
    chatId: z.string().uuid(),
    tramiteId: z.string().uuid(),
    message: z.string().trim().min(1),
    uiContext: z
      .object({
        currentStep: z.string().trim().optional(),
        lastQuestionIntent: z.string().trim().nullable().optional(),
        detectedPeople: z.array(z.string().trim().min(1)).optional(),
      })
      .optional(),
  })
  .strict()

const gmiCapture = new GMIIndependentCaptureFlow()

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
  loadTramiteData: async (tramiteId: string) => {
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) throw new Error('Tramite no encontrado')
    return (tramite.datos || {}) as Record<string, unknown>
  },
  getTramiteStateSnapshot: async (tramiteId: string) => {
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) throw new Error('Tramite no encontrado')
    const plugin = PluginRegistry.getInstance().get(String(tramite.tipo || 'preaviso'))
    const snapshot = TramitePluginStateService.buildStateSnapshot(plugin.tramiteType, tramite.datos || {})
    return snapshot
  },
  findRecentChatMessages: async (chatId: string, limit = 8) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role,content,created_at')
      .eq('session_id', chatId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw new Error(`Error loading chat history: ${error.message}`)
    return (data || []) as Array<{ role: string; content: string; created_at: string }>
  },
  commitProposedUpdates: PreavisoProposedUpdateService.commit,
  insertChatMessage: async (chatId: string, role: string, content: string, metadata: Record<string, unknown>) => {
    const supabase = createServerClient()
    await supabase.from('chat_messages').insert({
      session_id: chatId,
      role,
      content,
      metadata,
    })
  },
  updateChatSessionTimestamp: async (chatId: string) => {
    const supabase = createServerClient()
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId)
  },
  updateChatSessionContext: async (chatId: string, context: Record<string, unknown>) => {
    const supabase = createServerClient()
    await supabase
      .from('chat_sessions')
      .update({
        last_context: context,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chatId)
  },
}

type RouteDeps = typeof defaultDeps

export function createDirectChatGMIRouteHandler(deps: RouteDeps = defaultDeps) {
  return async function POST(req: Request) {
    try {
      const currentUser = await deps.getCurrentUserFromRequest(req)
      if (!currentUser || !currentUser.activo || !currentUser.auth_user_id) {
        return errorResponse(401, 'UNAUTHORIZED', 'No autenticado')
      }

      const parsedBody = requestSchema.safeParse(await req.json())
      if (!parsedBody.success) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Body invalido', {
          issues: parsedBody.error.issues.map((x) => ({ path: x.path.join('.'), message: x.message })),
        })
      }
      const body = parsedBody.data

      const [chatSession, tramiteScope] = await Promise.all([
        deps.findChatSession(body.chatId),
        deps.findTramiteScope(body.tramiteId),
      ])
      if (!chatSession) return errorResponse(404, 'NOT_FOUND', 'Chat no encontrado')
      if (!tramiteScope) return errorResponse(404, 'NOT_FOUND', 'Tramite no encontrado')

      if (currentUser.rol !== 'superadmin') {
        if (String(chatSession.user_id) !== String(currentUser.auth_user_id)) {
          return errorResponse(403, 'FORBIDDEN', 'No autorizado para este chat')
        }
        if (tramiteScope.user_id && String(tramiteScope.user_id) !== String(currentUser.id)) {
          return errorResponse(403, 'FORBIDDEN', 'No autorizado para este tramite')
        }
      }

      const [tramiteData, stateSnapshot, recentMessages] = await Promise.all([
        deps.loadTramiteData(body.tramiteId),
        deps.getTramiteStateSnapshot(body.tramiteId),
        deps.findRecentChatMessages(body.chatId, 8),
      ])
      const requiredMissing = Array.isArray(stateSnapshot.required_missing) ? stateSnapshot.required_missing : []
      const blockingReasons = Array.isArray(stateSnapshot.blocking_reasons) ? stateSnapshot.blocking_reasons : []
      const folioCandidates = Array.isArray((tramiteData as any)?.folios?.candidates)
        ? ((tramiteData as any).folios.candidates as any[])
            .map((c: any) => String(c?.folio || '').trim())
            .filter(Boolean)
            .slice(0, 20)
        : []
      const pendingQuestions = requiredMissing.slice(0, 4).map((f) => mapMissingFieldToQuestion(f))
      const systemInstructions = buildGMISystemInstructions({
        requiredMissing,
        blockingReasons,
        folioCandidates,
      })

      const proposal = await gmiCapture.process({
        message: body.message,
        currentStep: body.uiContext?.currentStep,
        lastQuestionIntent: body.uiContext?.lastQuestionIntent || null,
        requiredMissing,
        pendingQuestions,
        collectedData: tramiteData,
        systemInstructions,
        detectedPeople: body.uiContext?.detectedPeople || [],
        recentMessages: recentMessages.map((m) => ({ role: m.role, content: m.content })),
      })

      let responsePayload: Record<string, unknown> = {
        intent: 'UPDATE_STATE',
        agent_used: 'ChatGMICaptureEngine',
        answer: proposal.answer,
        proposed_updates: proposal.proposed_updates || [],
        actions: proposal.actions || [],
        trace_id: proposal.trace_id,
        data: tramiteData,
        state: stateSnapshot,
      }

      if (Array.isArray(proposal.proposed_updates) && proposal.proposed_updates.length > 0) {
        const committed = await deps.commitProposedUpdates({
          tramiteId: body.tramiteId,
          userId: currentUser.auth_user_id,
          traceId: proposal.trace_id,
          proposedUpdates: proposal.proposed_updates as any,
        })
        responsePayload = {
          ...responsePayload,
          answer: 'Cambios aplicados correctamente al tramite.',
          proposed_updates: [],
          actions: [
            ...(Array.isArray(proposal.actions) ? proposal.actions : []),
            { type: 'commit_applied', applied_updates: committed.applied_updates, mode: 'auto' },
          ],
          commit: {
            applied_updates: committed.applied_updates,
            committed: true,
            mode: 'auto',
          },
          data: committed.data,
          state: committed.state,
        }
      }

      const finalState = ((responsePayload as any).state || {}) as Record<string, unknown>
      const requiredMissingFinal = Array.isArray((finalState as any).required_missing)
        ? ((finalState as any).required_missing as string[])
        : []
      const blockingReasonsFinal = Array.isArray((finalState as any).blocking_reasons)
        ? ((finalState as any).blocking_reasons as string[])
        : []
      if (requiredMissingFinal.length > 0 || blockingReasonsFinal.length > 0) {
        const guidance = buildMissingDataGuidance(requiredMissingFinal, blockingReasonsFinal)
        responsePayload = {
          ...responsePayload,
          answer: `${String((responsePayload as any).answer || '').trim()}\n\n${guidance.message}`.trim(),
          actions: [
            ...(Array.isArray((responsePayload as any).actions) ? ((responsePayload as any).actions as any[]) : []),
            {
              type: 'request_missing_field',
              required_missing: guidance.required_missing,
              blocking_reasons: guidance.blocking_reasons,
              next_questions: guidance.next_questions,
            },
          ],
        }
      }

      await Promise.all([
        deps.insertChatMessage(body.chatId, 'user', body.message, {
          source: 'chat_gmi_direct',
          intent: 'UPDATE_STATE',
          trace_id: String(responsePayload.trace_id || ''),
          tramite_id: body.tramiteId,
        }),
        deps.insertChatMessage(body.chatId, 'assistant', String(responsePayload.answer || ''), {
          source: 'chat_gmi_direct',
          intent: 'UPDATE_STATE',
          trace_id: String(responsePayload.trace_id || ''),
          proposed_updates: (responsePayload.proposed_updates as unknown[]) || [],
          actions: (responsePayload.actions as unknown[]) || [],
          tramite_id: body.tramiteId,
        }),
        deps.updateChatSessionTimestamp(body.chatId),
        responsePayload?.data && typeof responsePayload.data === 'object'
          ? deps.updateChatSessionContext(body.chatId, responsePayload.data as Record<string, unknown>)
          : Promise.resolve(),
      ])

      return NextResponse.json(responsePayload, { status: 200 })
    } catch (error: any) {
      if (error instanceof ProposedUpdateDomainViolationError) {
        return errorResponse(422, error.code, error.message)
      }
      return errorResponse(500, 'INTERNAL_ERROR', error?.message || 'Error interno del servidor')
    }
  }
}

export const POST = createDirectChatGMIRouteHandler()

function mapMissingFieldToQuestion(field: string): string {
  const normalized = String(field || '')
  if (normalized === 'inmueble.folio_real') return 'Indica cual folio real corresponde al inmueble de esta operacion.'
  if (normalized === 'existencia_credito') return 'Indica si la compra se hara con credito.'
  if (/^creditos\[\d+\]\.institucion$/.test(normalized)) return 'Indica la institucion del credito.'
  if (/^creditos\[\d+\]\.participantes\[\]$/.test(normalized)) return 'Indica quienes participan en el credito.'
  if (normalized === 'vendedores[]') return 'Indica quien es el vendedor.'
  if (normalized === 'vendedores[].tipo_persona') return 'Confirma si el vendedor es persona fisica o moral.'
  if (normalized === 'compradores[].nombre') return 'Indica el nombre completo del comprador.'
  if (normalized === 'compradores[].tipo_persona') return 'Confirma si el comprador es persona fisica o moral.'
  if (normalized === 'compradores[0].persona_fisica.estado_civil') return 'Indica el estado civil del comprador.'
  return `Completa: ${normalized}`
}

function buildMissingDataGuidance(requiredMissing: string[], blockingReasons: string[]) {
  const uniqueMissing = Array.from(new Set((requiredMissing || []).filter(Boolean)))
  const uniqueBlocking = Array.from(new Set((blockingReasons || []).filter(Boolean)))
  const nextQuestions = uniqueMissing.slice(0, 3).map((f) => mapMissingFieldToQuestion(f))

  const parts: string[] = ['Aun faltan datos o documentos obligatorios para completar el tramite.']
  if (nextQuestions.length > 0) parts.push(`Para continuar necesito: ${nextQuestions.join(' ')}`)
  if (uniqueBlocking.includes('multiple_folio_real_detected')) {
    parts.push('Tambien falta resolver el bloqueo: seleccionar un folio real valido de los candidatos detectados.')
  }
  if (nextQuestions.length > 0) {
    parts.push('Si ese dato no aparece en el documento, puedes capturarlo manualmente en el chat.')
  }

  return {
    message: parts.join(' ').trim(),
    required_missing: uniqueMissing,
    blocking_reasons: uniqueBlocking,
    next_questions: nextQuestions,
  }
}

function buildGMISystemInstructions(args: {
  requiredMissing: string[]
  blockingReasons: string[]
  folioCandidates: string[]
}): string {
  const instructions: string[] = [
    'Prioriza responder el campo faltante activo del flujo.',
    'Si hay un solo required_missing, enfocate en ese campo.',
  ]

  if (args.requiredMissing.includes('inmueble.folio_real')) {
    instructions.push('Cuando el usuario escriba un folio real, propon set en inmueble.folio_real.')
  }
  if (args.blockingReasons.includes('multiple_folio_real_detected') && args.folioCandidates.length > 0) {
    instructions.push(
      `Hay multiples folios candidatos. Solo acepta uno de esta lista: ${args.folioCandidates.join(', ')}`
    )
  }

  return instructions.join(' ')
}
