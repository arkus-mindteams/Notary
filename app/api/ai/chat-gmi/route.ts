import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { GMIIndependentCaptureFlow, type GMICandidateSlot } from '@/lib/ai/routing/gmi-independent-capture-flow'
import {
  PreavisoProposedUpdateService,
  ProposedUpdateDomainViolationError,
} from '@/lib/services/preaviso-proposed-update-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import { TramitePluginStateService } from '@/lib/services/tramite-plugin-state-service'
import { getPathValue, hasMeaningfulValue } from '@/lib/tramites/plugins/shared-schemas'

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
      .select('id,role,content,metadata,created_at')
      .eq('session_id', chatId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw new Error(`Error loading chat history: ${error.message}`)
    return (data || []) as Array<{ id?: string; role: string; content: string; metadata?: Record<string, unknown> | null; created_at: string }>
  },
  routeShortAnswer: async (args: {
    message: string
    candidateSlots: GMICandidateSlot[]
    systemInstructions?: string
  }) => gmiCapture.routeShortAnswer(args),
  runCapture: async (input: Parameters<GMIIndependentCaptureFlow['process']>[0]) => gmiCapture.process(input),
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
        deps.findRecentChatMessages(body.chatId, 24),
      ])
      const requiredMissing = Array.isArray(stateSnapshot.required_missing) ? stateSnapshot.required_missing : []
      const blockingReasons = Array.isArray(stateSnapshot.blocking_reasons) ? stateSnapshot.blocking_reasons : []
      const stickyPeopleMissing = getStickyPeopleClassificationMissing(requiredMissing, tramiteData)
      const folioCandidates = Array.isArray((tramiteData as any)?.folios?.candidates)
        ? ((tramiteData as any).folios.candidates as any[])
            .map((c: any) => String(c?.folio || '').trim())
            .filter(Boolean)
            .slice(0, 20)
        : []
      const activeMissingForQuestions = stickyPeopleMissing.length > 0 ? stickyPeopleMissing : requiredMissing
      const pendingQuestions = activeMissingForQuestions.slice(0, 4).map((f) => mapMissingFieldToQuestion(f))
      const systemInstructions = buildGMISystemInstructions({
        requiredMissing: activeMissingForQuestions,
        blockingReasons,
        folioCandidates,
      })
      let candidateSlots = buildCandidateSlots({
        requiredMissing,
        recentMessages,
        collectedData: tramiteData,
        prioritizePeopleClassification: stickyPeopleMissing.length > 0,
      })
      if (candidateSlots.length === 0 && stickyPeopleMissing.length > 0) {
        candidateSlots = buildCandidateSlots({
          requiredMissing,
          recentMessages,
          collectedData: tramiteData,
          prioritizePeopleClassification: false,
        })
      }
      const shortAnswerMeta = detectShortAnswerSignal(body.message, candidateSlots.length)
      console.log('[chat-gmi][short-router] detect', {
        token_count: shortAnswerMeta.token_count,
        low_structure_reason: shortAnswerMeta.reason,
        short_answer_detected: shortAnswerMeta.detected,
        candidate_slots_count: candidateSlots.length,
        candidate_slots: candidateSlots.map((slot) => ({ slot_id: slot.slot_id, path: slot.path, source: slot.source })),
      })

      let proposal: Awaited<ReturnType<GMIIndependentCaptureFlow['process']>> = {
        intent: 'UPDATE_STATE',
        agent_used: 'GMIIndependentCaptureFlow',
        answer: 'No pude mapear el mensaje a un campo faltante especifico.',
        proposed_updates: [],
        actions: [{ type: 'request_missing_field', reason: 'No se detectaron cambios estructurados claros para aplicar como propuesta' }],
        trace_id: `trace-${Date.now()}`,
      }
      let routerOutcome: 'applied' | 'clarify' | 'fallback' = 'fallback'

      if (shortAnswerMeta.detected && candidateSlots.length > 0) {
        const shortRoute = await deps.routeShortAnswer({
          message: body.message,
          candidateSlots,
          systemInstructions,
        })
        routerOutcome = shortRoute.outcome
        console.log('[chat-gmi][short-router] outcome', {
          router_outcome: shortRoute.outcome,
          router_selected_slot_id: shortRoute.selected_slot_id || null,
          router_confidence: shortRoute.confidence ?? null,
          alternatives: shortRoute.top_alternatives || [],
        })

        if (shortRoute.outcome === 'applied' && shortRoute.update) {
          proposal = {
            intent: 'UPDATE_STATE',
            agent_used: 'GMIIndependentCaptureFlow',
            answer: 'Genere una propuesta de actualizacion alineada a una respuesta corta del usuario.',
            proposed_updates: [shortRoute.update],
            actions: [
              {
                type: 'review_proposed_updates',
                requires_domain_commit: true,
                source: 'gmi_short_answer_router',
              },
            ],
            trace_id: randomTraceId(),
          }
        } else if (shortRoute.outcome === 'clarify') {
          const clarifyQuestions = (shortRoute.top_alternatives || []).map((x) => x.question_text).slice(0, 2)
          proposal = {
            intent: 'UPDATE_STATE',
            agent_used: 'GMIIndependentCaptureFlow',
            answer:
              String(shortRoute.clarify_message || '').trim() ||
              'Tu respuesta parece ambigua. Confirma a que dato corresponde.',
            proposed_updates: [],
            actions: [
              {
                type: 'request_missing_field',
                reason: 'short_answer_ambiguous',
                next_questions: clarifyQuestions,
                selected_slot_id: shortRoute.selected_slot_id || null,
                confidence: shortRoute.confidence ?? null,
              },
            ],
            trace_id: randomTraceId(),
          }
        }
      }

      if (routerOutcome === 'fallback') {
        proposal = await deps.runCapture({
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
      }

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
      const finalData = (responsePayload as any)?.data && typeof (responsePayload as any).data === 'object'
        ? ((responsePayload as any).data as Record<string, unknown>)
        : {}
      const stickyPeopleMissingFinal = getStickyPeopleClassificationMissing(requiredMissingFinal, finalData)
      const activeMissingForGuidance = stickyPeopleMissingFinal.length > 0 ? stickyPeopleMissingFinal : requiredMissingFinal
      const hasShortClarifyAction = Array.isArray((responsePayload as any).actions)
        ? ((responsePayload as any).actions as any[]).some(
            (action) => String(action?.reason || '') === 'short_answer_ambiguous'
          )
        : false
      if (!hasShortClarifyAction && (activeMissingForGuidance.length > 0 || blockingReasonsFinal.length > 0)) {
        const guidance = buildMissingDataGuidance(activeMissingForGuidance, blockingReasonsFinal)
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

function randomTraceId(): string {
  return `gmi-short-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildCandidateSlots(args: {
  requiredMissing: string[]
  recentMessages: Array<{ id?: string; role: string; content: string; metadata?: Record<string, unknown> | null; created_at: string }>
  collectedData: Record<string, unknown>
  prioritizePeopleClassification?: boolean
}): GMICandidateSlot[] {
  const slots = new Map<string, GMICandidateSlot>()
  const recent = Array.isArray(args.recentMessages) ? args.recentMessages.slice(-24) : []
  const assistantMsgs = recent.filter((m) => String(m?.role || '') === 'assistant')
  const recentAssistantWindow = assistantMsgs.slice(-12)
  const knownGlobal = buildGlobalShortSlots(args.requiredMissing)

  for (const message of recentAssistantWindow) {
    const actions = Array.isArray((message?.metadata as any)?.actions)
      ? ((message?.metadata as any).actions as any[])
      : []
    for (const action of actions) {
      if (String(action?.type || '') !== 'request_missing_field') continue
      const fields = Array.isArray(action?.required_missing) ? action.required_missing : []
      const questions = Array.isArray(action?.next_questions) ? action.next_questions : []
      for (let i = 0; i < fields.length; i++) {
        const missing = String(fields[i] || '').trim()
        const path = GMIIndependentCaptureFlow.targetPathFromMissing(missing)
        if (!path) continue
        const canonicalPath = GMIIndependentCaptureFlow.canonicalizePath(path)
        if (!GMIIndependentCaptureFlow.isAllowedPath(canonicalPath)) continue
        if (args.prioritizePeopleClassification && !isPeopleClassificationPath(canonicalPath)) continue
        if (hasMeaningfulValue(getPathValue(args.collectedData || {}, canonicalPath))) continue
        const slotId = `slot:${canonicalPath}`
        if (!slots.has(slotId)) {
          slots.set(slotId, {
            slot_id: slotId,
            path: canonicalPath,
            question_text: String(questions[i] || mapMissingFieldToQuestion(missing)),
            allowed_values: inferAllowedValues(canonicalPath),
            asked_at: String(message?.created_at || ''),
            source: 'open_question',
          })
        }
      }
    }
  }

  for (const missing of args.requiredMissing || []) {
    const path = GMIIndependentCaptureFlow.targetPathFromMissing(String(missing || ''))
    if (!path) continue
    const canonicalPath = GMIIndependentCaptureFlow.canonicalizePath(path)
    if (!GMIIndependentCaptureFlow.isAllowedPath(canonicalPath)) continue
    if (args.prioritizePeopleClassification && !isPeopleClassificationPath(canonicalPath)) continue
    if (hasMeaningfulValue(getPathValue(args.collectedData || {}, canonicalPath))) continue
    const slotId = `slot:${canonicalPath}`
    if (!slots.has(slotId)) {
      slots.set(slotId, {
        slot_id: slotId,
        path: canonicalPath,
        question_text: mapMissingFieldToQuestion(String(missing || '')),
        allowed_values: inferAllowedValues(canonicalPath),
        asked_at: null,
        source: 'required_missing',
      })
    }
  }

  for (const globalSlot of knownGlobal) {
    const canonicalPath = GMIIndependentCaptureFlow.canonicalizePath(globalSlot.path)
    if (!GMIIndependentCaptureFlow.isAllowedPath(canonicalPath)) continue
    if (args.prioritizePeopleClassification && !isPeopleClassificationPath(canonicalPath)) continue
    if (hasMeaningfulValue(getPathValue(args.collectedData || {}, canonicalPath))) continue
    const slotId = `slot:${canonicalPath}`
    if (!slots.has(slotId)) {
      slots.set(slotId, {
        slot_id: slotId,
        path: canonicalPath,
        question_text: globalSlot.question_text,
        allowed_values: globalSlot.allowed_values,
        asked_at: null,
        source: 'global',
      })
    }
  }

  const sourceRank: Record<string, number> = {
    open_question: 3,
    required_missing: 2,
    global: 1,
  }
  return Array.from(slots.values()).sort((a, b) => {
    const aPeople = isPeopleClassificationPath(a.path) ? 1 : 0
    const bPeople = isPeopleClassificationPath(b.path) ? 1 : 0
    if (bPeople !== aPeople) return bPeople - aPeople
    const aTs = Date.parse(String(a.asked_at || '')) || 0
    const bTs = Date.parse(String(b.asked_at || '')) || 0
    if (bTs !== aTs) return bTs - aTs
    return (sourceRank[b.source] || 0) - (sourceRank[a.source] || 0)
  })
}

function buildGlobalShortSlots(requiredMissing: string[]): Array<Pick<GMICandidateSlot, 'path' | 'question_text' | 'allowed_values'>> {
  const missingSet = new Set((requiredMissing || []).map((m) => String(m || '').trim()))
  const entries: Array<Pick<GMICandidateSlot, 'path' | 'question_text' | 'allowed_values'>> = []
  if (missingSet.has('compradores[0].persona_fisica.estado_civil')) {
    entries.push({
      path: 'compradores[0].persona_fisica.estado_civil',
      question_text: mapMissingFieldToQuestion('compradores[0].persona_fisica.estado_civil'),
      allowed_values: ['casado', 'soltero', 'divorciado', 'viudo', 'union_libre'],
    })
  }
  if (missingSet.has('compradores[].tipo_persona') || missingSet.has('vendedores[].tipo_persona')) {
    entries.push({
      path: missingSet.has('compradores[].tipo_persona') ? 'compradores[0].tipo_persona' : 'vendedores[0].tipo_persona',
      question_text: missingSet.has('compradores[].tipo_persona')
        ? mapMissingFieldToQuestion('compradores[].tipo_persona')
        : mapMissingFieldToQuestion('vendedores[].tipo_persona'),
      allowed_values: ['persona_fisica', 'persona_moral'],
    })
  }
  if (missingSet.has('existencia_credito') || missingSet.has('creditos[]')) {
    entries.push({
      path: 'creditos',
      question_text: mapMissingFieldToQuestion('existencia_credito'),
      allowed_values: ['credito', 'contado'],
    })
  }
  if (missingSet.has('inmueble.existe_hipoteca') || missingSet.has('gravamenes')) {
    entries.push({
      path: 'inmueble.existe_hipoteca',
      question_text: 'Confirma si el inmueble tiene hipoteca o esta libre de gravamen.',
      allowed_values: ['si', 'no'],
    })
  }
  return entries
}

function inferAllowedValues(path: string): string[] | undefined {
  const p = GMIIndependentCaptureFlow.canonicalizePath(String(path || ''))
  if (/\.estado_civil$/.test(p)) return ['casado', 'soltero', 'divorciado', 'viudo', 'union_libre']
  if (/\.tipo_persona$/.test(p)) return ['persona_fisica', 'persona_moral']
  if (p === 'creditos' || p === 'actosNotariales.aperturaCreditoComprador') return ['credito', 'contado']
  if (p === 'inmueble.existe_hipoteca') return ['si', 'no']
  return undefined
}

function detectShortAnswerSignal(message: string, candidateSlotsCount: number): {
  detected: boolean
  token_count: number
  reason: string
} {
  const text = String(message || '').trim()
  const tokens = text ? text.split(/\s+/).filter(Boolean) : []
  const tokenCount = tokens.length
  if (!text || candidateSlotsCount < 1) {
    return { detected: false, token_count: tokenCount, reason: 'missing_text_or_slots' }
  }
  const hasDocStructure =
    /[\r\n]/.test(text) ||
    /[:;]/.test(text) ||
    /\b\d{5,}\b/.test(text) ||
    text.length > 120
  if (hasDocStructure) {
    return { detected: false, token_count: tokenCount, reason: 'document_like_structure' }
  }
  if (tokenCount <= 5) {
    return { detected: true, token_count: tokenCount, reason: 'token_threshold' }
  }
  return { detected: false, token_count: tokenCount, reason: 'not_short_enough' }
}

function isPeopleClassificationPath(path: string): boolean {
  const p = GMIIndependentCaptureFlow.canonicalizePath(String(path || ''))
  return (
    p === 'compradores[0].persona_fisica.nombre' ||
    p === 'compradores[0].tipo_persona' ||
    p === 'compradores[0].persona_fisica.conyuge.nombre' ||
    p === 'compradores[0].persona_fisica.estado_civil' ||
    p === 'vendedores[0].persona_fisica.nombre' ||
    p === 'vendedores[0].tipo_persona'
  )
}

function extractPendingPeopleNames(data: Record<string, unknown>): string[] {
  const fromPending = Array.isArray((data as any)?._document_people_pending?.persons)
    ? ((data as any)._document_people_pending.persons as any[])
    : []
  const fromUnclassified = Array.isArray((data as any)?.personas_detectadas_no_clasificadas)
    ? ((data as any).personas_detectadas_no_clasificadas as any[])
    : []
  const fromSpouses = Array.isArray((data as any)?.conyuges_detectados)
    ? ((data as any).conyuges_detectados as any[])
    : []
  const normalize = (value: string) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of [...fromPending, ...fromUnclassified, ...fromSpouses]) {
    const name = String(item?.name || item?.nombre || '').trim()
    const key = normalize(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function isPeopleClassificationMissing(missing: string): boolean {
  const target = GMIIndependentCaptureFlow.targetPathFromMissing(String(missing || ''))
  return target ? isPeopleClassificationPath(target) : false
}

function getStickyPeopleClassificationMissing(requiredMissing: string[], data: Record<string, unknown>): string[] {
  const pendingPeople = extractPendingPeopleNames(data)
  if (pendingPeople.length === 0) return []
  const peopleMissing = (requiredMissing || []).filter((missing) => isPeopleClassificationMissing(missing))
  return peopleMissing
}

function mapMissingFieldToQuestion(field: string): string {
  const normalized = String(field || '')
  if (normalized === 'inmueble.folio_real') return 'Indica cual folio real corresponde al inmueble de esta operacion.'
  if (normalized === 'existencia_credito') return 'Indica si la compra se hara con credito.'
  if (/^creditos\[\d+\]\.institucion$/.test(normalized)) return 'Indica la institucion del credito.'
  if (/^creditos\[\d+\]\.participantes\[\]$/.test(normalized)) return 'Indica quienes participan en el credito.'
  if (normalized === 'vendedores[]') return 'Indica quien es el vendedor.'
  if (normalized === 'compradores[]') return 'Indica quien es el comprador.'
  if (normalized === 'vendedores[].nombre') return 'Indica el nombre completo del vendedor.'
  if (normalized === 'vendedores[].tipo_persona') return 'Confirma si el vendedor es persona fisica o moral.'
  if (normalized === 'compradores[].nombre') return 'Indica el nombre completo del comprador.'
  if (normalized === 'compradores[].tipo_persona') return 'Confirma si el comprador es persona fisica o moral.'
  if (normalized === 'compradores[].persona_fisica.conyuge.nombre')
    return 'Indica el nombre completo del conyuge del comprador.'
  if (/^compradores\[\d+\]\.persona_fisica\.conyuge\.nombre$/.test(normalized))
    return 'Indica el nombre completo del conyuge del comprador.'
  if (normalized === 'compradores[0].persona_fisica.estado_civil') return 'Indica el estado civil del comprador.'
  if (/^compradores\[\d+\]\.persona_fisica\.estado_civil$/.test(normalized))
    return 'Indica el estado civil del comprador.'
  if (/^compradores\[\d+\]\.persona_fisica\.nombre$/.test(normalized))
    return 'Indica el nombre completo del comprador.'
  if (/^vendedores\[\d+\]\.persona_fisica\.nombre$/.test(normalized))
    return 'Indica el nombre completo del vendedor.'
  if (/^compradores\[\d+\]\.tipo_persona$/.test(normalized))
    return 'Confirma si el comprador es persona fisica o moral.'
  if (/^vendedores\[\d+\]\.tipo_persona$/.test(normalized))
    return 'Confirma si el vendedor es persona fisica o moral.'
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
