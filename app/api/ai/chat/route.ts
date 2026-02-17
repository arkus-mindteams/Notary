import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { AgentRouter } from '@/lib/ai/routing/agent-router'
import {
  PreavisoProposedUpdateService,
  ProposedUpdateDomainViolationError,
} from '@/lib/services/preaviso-proposed-update-service'
import { PreavisoDomainService } from '@/lib/services/preaviso-domain-service'
import { TramiteService } from '@/lib/services/tramite-service'
import type { PreavisoData } from '@/lib/tramites/shared/types/preaviso-types'
import { computePreavisoState } from '@/lib/preaviso-state'
import { PreavisoWizardStateService } from '@/lib/services/preaviso-wizard-state-service'
import { DomainRuleViolationError } from '@/lib/services/preaviso-domain-service'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'

const requestSchema = z
  .object({
    chatId: z.string().uuid(),
    tramiteId: z.string().uuid(),
    message: z.string().trim().min(1),
    uiContext: z
      .object({
        hasDocument: z.boolean().optional(),
        uiAction: z.string().trim().optional(),
        currentStep: z.string().trim().optional(),
        pluginType: z.string().trim().optional(),
        documentId: z.string().trim().optional(),
        rawText: z.string().optional(),
        fileMeta: z.record(z.unknown()).optional(),
        tramiteType: z.literal('preaviso').optional(),
        outputFormat: z.enum(['docx', 'pdf']).optional(),
        documentTitle: z.string().trim().optional(),
      })
      .optional(),
  })
  .strict()

const router = new AgentRouter()

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
  route: (args: Parameters<AgentRouter['route']>[0]) => router.route(args),
  commitProposedUpdates: PreavisoProposedUpdateService.commit,
  finalizePreavisoFromTramite: async (args: {
    tramiteId: string
    currentUser: any
    generatedDocument?: { formato?: 'docx' | 'pdf'; titulo?: string }
  }) => {
    const tramite = await TramiteService.findTramiteById(args.tramiteId)
    if (!tramite) {
      throw new ProposedUpdateDomainViolationError('Tramite no encontrado para finalizar')
    }
    return PreavisoDomainService.finalizePreaviso(
      {
        tramiteId: args.tramiteId,
        preavisoData: (tramite.datos || {}) as PreavisoData,
        generatedDocument: args.generatedDocument,
      },
      args.currentUser
    )
  },
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
      console.error('[POST /api/ai/chat] Failed to persist chat message:', error)
    }
  },
  updateChatSessionTimestamp: async (chatId: string) => {
    const supabase = createServerClient()
    const { error } = await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId)
    if (error) {
      console.error('[POST /api/ai/chat] Failed to update chat session timestamp:', error)
    }
  },
  updateChatSessionContext: async (chatId: string, context: Record<string, unknown>) => {
    const supabase = createServerClient()
    const folioReal = (context as any)?.inmueble?.folio_real
    const updates: Record<string, unknown> = {
      last_context: context,
      updated_at: new Date().toISOString(),
    }
    if (folioReal) {
      updates.title = `Folio Real: ${String(folioReal)}`
    }
    const { error } = await supabase
      .from('chat_sessions')
      .update(updates)
      .eq('id', chatId)
    if (error) {
      console.error('[POST /api/ai/chat] Failed to update chat session last_context:', error)
    }
  },
  findLatestAssistantProposals: async (chatId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id,metadata,created_at')
      .eq('session_id', chatId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw new Error(`Error loading assistant proposals: ${error.message}`)

    const rows = (data || []) as Array<{ id: string; metadata?: any }>
    const found = rows.find((row) => {
      const proposals = row?.metadata?.proposed_updates
      return Array.isArray(proposals) && proposals.length > 0
    })
    return found ? (found.metadata?.proposed_updates as Array<Record<string, unknown>>) : []
  },
  findLatestAssistantActions: async (chatId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id,metadata,created_at')
      .eq('session_id', chatId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw new Error(`Error loading assistant actions: ${error.message}`)

    const rows = (data || []) as Array<{ id: string; metadata?: any }>
    const found = rows.find((row) => Array.isArray(row?.metadata?.actions) && row.metadata.actions.length > 0)
    return found ? (found.metadata?.actions as Array<Record<string, unknown>>) : []
  },
  getTramiteStateSnapshot: async (tramiteId: string) => {
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) {
      throw new ProposedUpdateDomainViolationError('Tramite no encontrado')
    }
    const computed = computePreavisoState(tramite.datos || {})
    const wizardState = PreavisoWizardStateService.fromSnapshot(
      computed.state.current_state,
      computed.state.state_status,
      computed.state.required_missing,
      computed.state.blocking_reasons
    )
    return {
      current_state: computed.state.current_state,
      state_status: computed.state.state_status,
      required_missing: computed.state.required_missing,
      blocking_reasons: computed.state.blocking_reasons,
      allowed_actions: computed.state.allowed_actions,
      wizard_state: wizardState,
    }
  },
  findRecentChatMessages: async (chatId: string, limit = 20) => {
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
  runLegacyPreavisoProcess: async (args: {
    message: string
    context: any
    history: Array<{ role: string; content: string }>
  }) => {
    const system = getTramiteSystem()
    return system.process('preaviso', args.message, args.context || {}, args.history || [])
  },
  persistTramiteData: async (tramiteId: string, data: any) => {
    await TramiteService.updateTramite(tramiteId, { datos: data })
  },
  loadTramiteData: async (tramiteId: string) => {
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) throw new ProposedUpdateDomainViolationError('Tramite no encontrado')
    return tramite.datos || {}
  },
}

type RouteDeps = typeof defaultDeps

export function createUnifiedAIChatRouteHandler(deps: RouteDeps = defaultDeps) {
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

      const routed = await deps.route({
        chatId: body.chatId,
        tramiteId: body.tramiteId,
        message: body.message,
        uiContext: {
          ...(body.uiContext || {}),
          pluginType: body.uiContext?.pluginType || tramiteScope.tipo || 'preaviso',
        },
        userAuthId: currentUser.auth_user_id,
      })

      let tramiteState = await deps.getTramiteStateSnapshot(body.tramiteId)

      let responsePayload: Record<string, unknown> = { ...routed }

      const confirmationRequested =
        body.uiContext?.uiAction === 'confirm_proposed_updates' ||
        body.uiContext?.uiAction === 'confirm_document_generation' ||
        isConfirmationMessage(body.message)

      const shouldUseLegacyStateUpdateFallback =
        !confirmationRequested &&
        routed.intent === 'UPDATE_STATE' &&
        shouldFallbackToLegacyStateUpdate(body.message)

      const shouldRecoverFromQnaMisroute =
        !confirmationRequested &&
        routed.intent === 'QNA' &&
        shouldTreatQnaAsStateUpdate(body.message, routed.answer)
      const shouldRecoverFromExtractMissingPayload =
        !confirmationRequested &&
        routed.intent === 'EXTRACT_DOCUMENT' &&
        isExtractionMissingPayload(routed.actions) &&
        (body.uiContext?.uiAction === 'chat_after_document_process' ||
          body.uiContext?.hasDocument === true ||
          /subi|subido|subir|documento|captura|imagen|archivo/i.test(body.message))

      let usedLegacyStateFallback = false

      if (shouldUseLegacyStateUpdateFallback || shouldRecoverFromQnaMisroute || shouldRecoverFromExtractMissingPayload) {
        const [tramiteData, recentMessages] = await Promise.all([
          deps.loadTramiteData(body.tramiteId),
          deps.findRecentChatMessages(body.chatId, 20),
        ])

        const legacyHistory = [
          ...recentMessages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') })),
          { role: 'user', content: body.message },
        ]

        const legacy = await deps.runLegacyPreavisoProcess({
          message: body.message,
          context: {
            ...(tramiteData || {}),
            conversation_id: body.chatId,
            tramiteId: body.tramiteId,
            _userId: currentUser.auth_user_id,
          },
          history: legacyHistory,
        })

        const normalizedLegacyData = reconcileLegacyCapturedData({
          prevData: (tramiteData || {}) as Record<string, any>,
          nextData: (legacy.data || {}) as Record<string, any>,
          message: body.message,
        })
        const normalizedWithHistory = hydrateCriticalFieldsFromHistory(
          normalizedLegacyData,
          recentMessages.map((m) => String(m.content || ''))
        )
        const normalizedEnriched = enrichInmuebleFromFolioCandidates(normalizedWithHistory)

        await deps.persistTramiteData(body.tramiteId, normalizedEnriched)
        const computed = computePreavisoState(normalizedEnriched || {})
        const wizardState = PreavisoWizardStateService.fromSnapshot(
          computed.state.current_state,
          computed.state.state_status,
          computed.state.required_missing,
          computed.state.blocking_reasons
        )
        const guidance = buildMissingDataGuidance(
          computed.state.required_missing || [],
          computed.state.blocking_reasons || []
        )
        const hasMissing = guidance.required_missing.length > 0 || guidance.blocking_reasons.length > 0

        responsePayload = {
          ...routed,
          intent: 'UPDATE_STATE',
          agent_used: 'ProposeStateUpdateAgent',
          answer: hasMissing
            ? guidance.message
            : legacy.message || routed.answer || 'Datos actualizados desde el mensaje del usuario.',
          proposed_updates: [],
          actions: [
            ...(Array.isArray(routed.actions)
              ? routed.actions.filter((a: any) => !(routed.intent === 'EXTRACT_DOCUMENT' && a?.type === 'request_missing_field'))
              : []),
            { type: 'legacy_state_update_applied' },
            ...(hasMissing
              ? [
                  {
                    type: 'request_missing_field',
                    required_missing: guidance.required_missing,
                    blocking_reasons: guidance.blocking_reasons,
                    next_questions: guidance.next_questions,
                  },
                ]
              : []),
          ],
          data: normalizedEnriched || {},
          state: {
            current_state: computed.state.current_state,
            state_status: computed.state.state_status,
            required_missing: computed.state.required_missing,
            blocking_reasons: computed.state.blocking_reasons,
            allowed_actions: computed.state.allowed_actions,
            wizard_state: wizardState,
          },
        }
        responsePayload = appendFolioSelectionActionIfNeeded(responsePayload, normalizedEnriched)
        usedLegacyStateFallback = true
      }

      if (routed.intent === 'GENERATE_DOCUMENT' && !confirmationRequested) {
        if (shouldFallbackToLegacyStateUpdate(body.message)) {
          const [tramiteData, recentMessages] = await Promise.all([
            deps.loadTramiteData(body.tramiteId),
            deps.findRecentChatMessages(body.chatId, 20),
          ])
          const legacyHistory = [
            ...recentMessages.map((m) => ({ role: String(m.role || 'user'), content: String(m.content || '') })),
            { role: 'user', content: body.message },
          ]
          const legacy = await deps.runLegacyPreavisoProcess({
            message: body.message,
            context: {
              ...(tramiteData || {}),
              conversation_id: body.chatId,
              tramiteId: body.tramiteId,
              _userId: currentUser.auth_user_id,
            },
            history: legacyHistory,
          })
          const normalizedLegacyData = reconcileLegacyCapturedData({
            prevData: (tramiteData || {}) as Record<string, any>,
            nextData: (legacy.data || {}) as Record<string, any>,
            message: body.message,
          })
          const normalizedWithHistory = hydrateCriticalFieldsFromHistory(
            normalizedLegacyData,
            recentMessages.map((m) => String(m.content || ''))
          )
          const normalizedEnriched = enrichInmuebleFromFolioCandidates(normalizedWithHistory)
          await deps.persistTramiteData(body.tramiteId, normalizedEnriched)
          tramiteState = await deps.getTramiteStateSnapshot(body.tramiteId)
          responsePayload = {
            ...responsePayload,
            answer: legacy.message || responsePayload.answer,
            data: normalizedEnriched || {},
            state: tramiteState,
            actions: [
              ...(Array.isArray((responsePayload as any).actions) ? ((responsePayload as any).actions as any[]) : []),
              { type: 'legacy_state_update_applied' },
            ],
          }
        }

        const canFinalize = !!tramiteState?.wizard_state?.can_finalize
        if (!canFinalize) {
          const guidance = buildMissingDataGuidance(
            Array.isArray(tramiteState.required_missing) ? tramiteState.required_missing : [],
            Array.isArray(tramiteState.blocking_reasons) ? tramiteState.blocking_reasons : []
          )
          responsePayload = {
            ...routed,
            answer: guidance.message,
            actions: [
              {
                type: 'request_missing_field',
                required_missing: guidance.required_missing,
                blocking_reasons: guidance.blocking_reasons,
                next_questions: guidance.next_questions,
              },
            ],
            state: tramiteState,
          }
          const tramiteDataForActions = await deps.loadTramiteData(body.tramiteId)
          responsePayload = appendFolioSelectionActionIfNeeded(responsePayload, tramiteDataForActions)
        } else {
          responsePayload = {
            ...routed,
            state: tramiteState,
          }
        }
      }

      if (confirmationRequested) {
        const updatesFromRoute = Array.isArray(routed.proposed_updates) ? routed.proposed_updates : []
        const updatesToCommit =
          updatesFromRoute.length > 0 ? updatesFromRoute : await deps.findLatestAssistantProposals(body.chatId)
        const latestActions = await deps.findLatestAssistantActions(body.chatId)
        const pendingDocumentGeneration = latestActions.find((a: any) => a?.type === 'prepare_document_generation')

        if (updatesToCommit.length > 0) {
          const committed = await deps.commitProposedUpdates({
            tramiteId: body.tramiteId,
            userId: currentUser.auth_user_id,
            traceId: routed.trace_id,
            proposedUpdates: updatesToCommit,
          })

          const currentAnswer =
            routed.intent === 'UPDATE_STATE' && routed.agent_used === 'ProposeStateUpdateAgent'
              ? String(routed.answer || '').trim()
              : ''
          responsePayload = {
            ...routed,
            intent: 'UPDATE_STATE',
            agent_used: 'ProposeStateUpdateAgent',
            answer: currentAnswer
              ? `${currentAnswer}\n\nCambios aplicados correctamente al tramite.`
              : 'Cambios aplicados correctamente al tramite.',
            proposed_updates: [],
            actions: [
              ...(routed.intent === 'UPDATE_STATE' && Array.isArray(routed.actions) ? routed.actions : []),
              {
                type: 'commit_applied',
                applied_updates: committed.applied_updates,
              },
            ],
            commit: {
              applied_updates: committed.applied_updates,
              committed: true,
            },
            data: committed.data,
            state: committed.state,
          }
        } else if (pendingDocumentGeneration) {
          if (!tramiteState?.wizard_state?.can_finalize) {
            const guidance = buildMissingDataGuidance(
              Array.isArray(tramiteState.required_missing) ? tramiteState.required_missing : [],
              Array.isArray(tramiteState.blocking_reasons) ? tramiteState.blocking_reasons : []
            )
            return errorResponse(
              422,
              'DOMAIN_RULE_VIOLATION',
              guidance.message,
              {
                required_missing: guidance.required_missing,
                blocking_reasons: guidance.blocking_reasons,
                next_questions: guidance.next_questions,
                state: tramiteState,
              }
            )
          }
          const finalized = await deps.finalizePreavisoFromTramite({
            tramiteId: body.tramiteId,
            currentUser,
            generatedDocument: {
              formato: (pendingDocumentGeneration as any)?.generatedDocument?.formato || 'docx',
              titulo:
                (pendingDocumentGeneration as any)?.generatedDocument?.titulo ||
                'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO',
            },
          })
          responsePayload = {
            ...routed,
            intent: 'GENERATE_DOCUMENT',
            agent_used: 'DocumentGenerationAgent',
            answer: 'Documento generado y versionado correctamente.',
            actions: [
              ...(Array.isArray(routed.actions) ? routed.actions : []),
              {
                type: 'document_generation_committed',
                tramite_id: finalized.tramiteId,
                version: finalized.documentVersion,
              },
            ],
            commit: {
              committed: true,
              type: 'document_generation',
              version: finalized.documentVersion,
              tramite_id: finalized.tramiteId,
            },
          }
        } else {
          responsePayload = {
            ...routed,
            intent: 'UPDATE_STATE',
            answer: 'No hay propuestas pendientes para aplicar. Indica un cambio y luego confirma con "ejecuta".',
            actions: [
              ...(Array.isArray(routed.actions) ? routed.actions : []),
              { type: 'no_pending_proposals' },
            ],
          }
        }
      } else if (
        !usedLegacyStateFallback &&
        routed.intent === 'UPDATE_STATE' &&
        Array.isArray(routed.proposed_updates) &&
        routed.proposed_updates.length > 0
      ) {
        responsePayload = {
          ...routed,
          answer: `${String(routed.answer || '').trim()}\n\nSi deseas aplicarlos escribe "ejecuta".`.trim(),
          actions: [
            ...(Array.isArray(routed.actions) ? routed.actions : []),
            { type: 'confirm_commit' },
          ],
        }
      }

      await Promise.all([
        deps.insertChatMessage(body.chatId, 'user', body.message, {
          source: 'unified_ai_chat',
          trace_id: routed.trace_id,
          intent: routed.intent,
          agent_used: routed.agent_used,
          tramite_id: body.tramiteId,
        }),
        ...(responsePayload?.answer
          ? [
              deps.insertChatMessage(body.chatId, 'assistant', String(responsePayload.answer), {
                source: 'unified_ai_chat',
                trace_id: routed.trace_id,
                intent: String(responsePayload.intent || routed.intent),
                agent_used: String(responsePayload.agent_used || routed.agent_used),
                citations: (responsePayload.citations as unknown[]) || routed.citations || [],
                proposed_updates: (responsePayload.proposed_updates as unknown[]) || [],
                actions: (responsePayload.actions as unknown[]) || [],
                tramite_id: body.tramiteId,
              }),
            ]
          : []),
        deps.updateChatSessionTimestamp(body.chatId),
        ...(responsePayload?.data && typeof responsePayload.data === 'object'
          ? [deps.updateChatSessionContext(body.chatId, responsePayload.data as Record<string, unknown>)]
          : []),
      ])

      return NextResponse.json(responsePayload, { status: 200 })
    } catch (error: any) {
      if (error instanceof DomainRuleViolationError) {
        return errorResponse(422, error.code, error.message, {})
      }
      if (error instanceof ProposedUpdateDomainViolationError) {
        return errorResponse(422, error.code, error.message, {})
      }
      console.error('[POST /api/ai/chat] Error:', error)
      return errorResponse(500, 'INTERNAL_ERROR', error?.message || 'Error interno del servidor')
    }
  }
}

// TODO(Fase 6): keep /api/ai/chat/rag and /api/ai/preaviso-chat for compatibility during migration.
export const POST = createUnifiedAIChatRouteHandler()

function isConfirmationMessage(message: string): boolean {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /\b(ejecuta|confirma|confirmar|confirmo|aplica|aplicar|guardar cambios|si, aplica|si aplica|ok|dale)\b/.test(normalized)
}

function buildMissingDataGuidance(requiredMissing: string[], blockingReasons: string[]) {
  const uniqueMissing = Array.from(new Set(requiredMissing.filter(Boolean)))
  const uniqueBlocking = Array.from(new Set(blockingReasons.filter(Boolean)))

  const nextQuestions = uniqueMissing.slice(0, 3).map(mapMissingFieldToQuestion)
  const blockingHints = uniqueBlocking.slice(0, 2).map(mapBlockingReasonToHint)

  const messageParts: string[] = [
    'Aun no se puede generar el documento porque faltan datos obligatorios del tramite.',
  ]

  if (nextQuestions.length > 0) {
    messageParts.push(`Para continuar, necesito: ${nextQuestions.join(' ')}`)
  }
  if (blockingHints.length > 0) {
    messageParts.push(`Ademas, hay que resolver: ${blockingHints.join(' ')}`)
  }

  return {
    message: messageParts.join(' ').trim(),
    required_missing: uniqueMissing,
    blocking_reasons: uniqueBlocking,
    next_questions: nextQuestions,
  }
}

function mapMissingFieldToQuestion(field: string): string {
  const normalized = String(field || '')

  if (normalized === 'tipoOperacion') return 'confirma el tipo de operacion.'
  if (normalized === 'existencia_credito') return 'indica si la compra se hara con credito.'
  if (normalized === 'inmueble.folio_real') return 'proporciona o confirma el folio real del inmueble.'
  if (normalized === 'inmueble.partidas') return 'proporciona la partida registral del inmueble.'
  if (normalized === 'inmueble.direccion') return 'proporciona la direccion del inmueble.'
  if (normalized === 'vendedores[]') return 'indica quien es el vendedor.'
  if (normalized === 'vendedores[].tipo_persona') return 'confirma si el vendedor es persona fisica o moral.'
  if (normalized === 'compradores[]') return 'indica quien es el comprador.'
  if (normalized === 'compradores[].tipo_persona') return 'confirma si el comprador es persona fisica o moral.'
  if (normalized === 'compradores[0].persona_fisica.estado_civil') return 'indica el estado civil del comprador.'
  if (normalized === 'compradores[].persona_fisica.conyuge.nombre') return 'indica el nombre completo del conyuge.'
  if (normalized === 'creditos[]') return 'proporciona la informacion del credito del comprador.'
  if (/^creditos\[\d+\]\.institucion$/.test(normalized)) return 'indica la institucion del credito.'
  if (/^creditos\[\d+\]\.participantes\[\]$/.test(normalized)) return 'indica quienes participan en el credito.'
  if (normalized === 'gravamenes[]') return 'indica los gravamenes/hipotecas del inmueble.'
  if (/^gravamenes\[\d+\]\.institucion$/.test(normalized)) return 'indica la institucion del gravamen.'
  if (/^gravamenes\[\d+\]\.cancelacion_confirmada$/.test(normalized)) return 'confirma si el gravamen sera cancelado.'

  return `completa el campo obligatorio "${normalized}".`
}

function mapBlockingReasonToHint(reason: string): string {
  const normalized = String(reason || '')
  if (normalized === 'multiple_folio_real_detected') return 'hay multiples folios reales detectados y se debe seleccionar uno.'
  if (normalized === 'folio_real_scope_selection_required') return 'falta confirmar el alcance del folio (unidad o inmueble afectado).'
  if (normalized === 'folio_real_confirmation_required') return 'falta confirmar el folio detectado en documentos.'
  if (normalized === 'multiple_partida_detected') return 'hay multiples partidas detectadas y se debe elegir una.'
  if (normalized === 'titular_registral_missing') return 'falta el titular registral del inmueble.'
  if (normalized === 'vendedor_titular_mismatch') return 'el vendedor no coincide con el titular registral; se requiere aclaracion.'
  return `resolver conflicto: ${normalized}.`
}

function shouldFallbackToLegacyStateUpdate(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const hasDomainShortSignal =
    /\b(credito|contado|gravamen|hipoteca|folio|partida|direccion|comprador|vendedor|persona|fisica|moral|estado civil|casado|soltero|divorciado|viudo|union libre|cancela|cancelado|cancelacion)\b/.test(lower) &&
    /\b(es|si|sin|con|confirmo|indico|indica|sera|se)\b/.test(lower)
  const hasCancellationReply =
    /\bcancel/.test(lower) &&
    /\b(si|no|confirmo|confirmado|correcto|sera|se)\b/.test(lower)
  const hasDirectFolioReply =
    /^\d{6,10}$/.test(text.replace(/\s+/g, '')) ||
    (/\b(folio|partida)\b/.test(lower) && /\b\d{5,10}\b/.test(lower))

  if (!(hasDomainShortSignal || hasDirectFolioReply || hasCancellationReply) && /\b(ejecuta|confirmo|confirma|ok|dale|si)\b/.test(lower) && text.length <= 25) {
    return false
  }

  const hasNarrativeSignals =
    text.length >= 80 ||
    (text.match(/\n/g)?.length || 0) >= 2 ||
    /folio|partida|lote|manzana|condominio|vendedor|comprador|direccion|credito|gravamen|hipoteca|cancel/i.test(text)

  return hasNarrativeSignals || hasDomainShortSignal || hasDirectFolioReply || hasCancellationReply
}

function shouldTreatQnaAsStateUpdate(message: string, answer?: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  if (text.includes('?')) return false

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const domainSignal =
    /\b(credito|credito|contado|gravamen|hipoteca|folio|partida|direccion|direccion|comprador|vendedor|estado civil|casado|soltero)\b/.test(normalized) &&
    /\b(es|son|sin|con|confirmo|indico|indica)\b/.test(normalized)

  const noEvidenceAnswer = /no encontre evidencia relevante|no encontr[eé] evidencia relevante/i.test(String(answer || ''))

  return domainSignal || noEvidenceAnswer
}

function isExtractionMissingPayload(actions: unknown): boolean {
  if (!Array.isArray(actions)) return false
  return actions.some((a: any) => {
    if (a?.type !== 'request_missing_field') return false
    const field = String(a?.field || '')
    return field.includes('uiContext.documentId') || field.includes('uiContext.rawText')
  })
}

function appendFolioSelectionActionIfNeeded(
  payload: Record<string, unknown>,
  data: Record<string, any>
): Record<string, unknown> {
  const actions = Array.isArray(payload.actions) ? [...payload.actions] : []
  const hasMissingAction = actions.some((a: any) => a?.type === 'request_missing_field')
  if (!hasMissingAction) return payload

  const blockingReasons = actions
    .filter((a: any) => a?.type === 'request_missing_field')
    .flatMap((a: any) => (Array.isArray(a?.blocking_reasons) ? a.blocking_reasons : []))

  const hasMultipleFolioConflict = blockingReasons.includes('multiple_folio_real_detected')
  if (!hasMultipleFolioConflict) return payload

  const candidates = Array.isArray(data?.folios?.candidates) ? data.folios.candidates : []
  if (candidates.length <= 1) return payload

  const options = candidates
    .map((c: any) => {
      const folio = String(c?.folio || '').replace(/\D/g, '')
      if (!folio) return null
      const scope = String(c?.scope || 'otros')
      const unidad = String(c?.attrs?.unidad || '').trim()
      const label = unidad ? `${folio} (${scope} · unidad ${unidad})` : `${folio} (${scope})`
      return { folio, scope, label }
    })
    .filter(Boolean)
    .slice(0, 20)

  if (options.length <= 1) return payload

  actions.push({
    type: 'select_folio',
    prompt: 'Selecciona el folio correcto para continuar:',
    options,
  })

  return {
    ...payload,
    actions,
  }
}

function reconcileLegacyCapturedData(args: {
  prevData: Record<string, any>
  nextData: Record<string, any>
  message: string
}): Record<string, any> {
  const prev = args.prevData || {}
  const next = args.nextData || {}
  const message = String(args.message || '')
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const merged: Record<string, any> = {
    ...next,
    inmueble: {
      ...(prev.inmueble || {}),
      ...(next.inmueble || {}),
      direccion: mergeObjectPreservingNonEmpty(
        (prev.inmueble?.direccion || {}) as Record<string, unknown>,
        (next.inmueble?.direccion || {}) as Record<string, unknown>
      ),
      datos_catastrales: mergeObjectPreservingNonEmpty(
        (prev.inmueble?.datos_catastrales || {}) as Record<string, unknown>,
        (next.inmueble?.datos_catastrales || {}) as Record<string, unknown>
      ),
    },
  }

  // Nunca degradar datos clave del inmueble por respuestas cortas ambiguas.
  const prevInmueble = (prev.inmueble || {}) as Record<string, any>
  const nextInmueble = (merged.inmueble || {}) as Record<string, any>
  merged.inmueble = {
    ...nextInmueble,
    folio_real: coalesceString(nextInmueble.folio_real, prevInmueble.folio_real),
    superficie: coalesceValue(nextInmueble.superficie, prevInmueble.superficie),
    valor: coalesceValue(nextInmueble.valor, prevInmueble.valor),
    partidas:
      Array.isArray(nextInmueble.partidas) && nextInmueble.partidas.length > 0
        ? nextInmueble.partidas
        : Array.isArray(prevInmueble.partidas)
          ? prevInmueble.partidas
          : [],
    direccion: mergeObjectPreservingNonEmpty(
      (prevInmueble.direccion || {}) as Record<string, unknown>,
      (nextInmueble.direccion || {}) as Record<string, unknown>
    ),
    datos_catastrales: mergeObjectPreservingNonEmpty(
      (prevInmueble.datos_catastrales || {}) as Record<string, unknown>,
      (nextInmueble.datos_catastrales || {}) as Record<string, unknown>
    ),
  }

  if (Array.isArray(prev.vendedores) && prev.vendedores.length > 0 && (!Array.isArray(next.vendedores) || next.vendedores.length === 0)) {
    merged.vendedores = prev.vendedores
  }
  if (Array.isArray(prev.compradores) && prev.compradores.length > 0 && (!Array.isArray(next.compradores) || next.compradores.length === 0)) {
    merged.compradores = prev.compradores
  }
  if (Array.isArray(prev.documentos) && prev.documentos.length > 0 && (!Array.isArray(next.documentos) || next.documentos.length === 0)) {
    merged.documentos = prev.documentos
  }

  const saysNoCredit = /\b(sin credito|sin crédito|no credito|no crédito|de contado|pago de contado)\b/.test(normalized)
  const saysWithCredit = /\b(con credito|con crédito)\b/.test(normalized)
  const saysNoLien = /\b(sin gravamen|sin hipoteca|no hay gravamen|no tiene gravamen|ni gravamen|sin ningun gravamen|libre de gravamen|libre de hipoteca)\b/.test(normalized)
  const saysWithLienByExplicitPhrase = /\b(con gravamen|con hipoteca|existe hipoteca)\b/.test(normalized)
  const saysWithLienByTiene = /\btiene gravamen\b/.test(normalized) && !/\bno tiene gravamen\b/.test(normalized)
  const saysWithLien = saysWithLienByExplicitPhrase || saysWithLienByTiene

  if (saysNoCredit && !saysWithCredit) {
    merged.creditos = []
    merged.actosNotariales = {
      ...(merged.actosNotariales || {}),
      aperturaCreditoComprador: false,
    }
  }

  if (saysNoLien && !saysWithLien) {
    merged.gravamenes = []
    merged.inmueble = {
      ...(merged.inmueble || {}),
      existe_hipoteca: false,
    }
    merged.actosNotariales = {
      ...(merged.actosNotariales || {}),
      cancelacionCreditoVendedor: false,
    }
  }

  if (saysWithLien) {
    merged.inmueble = {
      ...(merged.inmueble || {}),
      existe_hipoteca: true,
    }
  }

  if (Array.isArray(merged.creditos) && merged.creditos.length > 0) {
    merged.creditos = merged.creditos.map((c: any) => {
      const institution = String(c?.institucion || '').toLowerCase()
      if (institution.includes('gravamen') || institution.includes('hipoteca') || institution.includes('contado')) {
        return { ...c, institucion: null }
      }
      return c
    })
  }

  // Regla determinista anti-loop:
  // si el usuario confirma tipo de comprador (persona fisica/moral) en mensaje corto,
  // crear o completar compradores[0] para destrabar ESTADO_4.
  const buyerTipoPersona = inferBuyerTipoPersonaFromMessage(normalized)
  if (buyerTipoPersona) {
    const compradores = Array.isArray(merged.compradores) ? [...merged.compradores] : []
    const buyer0 = { ...(compradores[0] || {}) }
    buyer0.party_id = buyer0.party_id || 'comprador_1'
    buyer0.tipo_persona = buyerTipoPersona

    if (buyerTipoPersona === 'persona_moral') {
      buyer0.persona_moral = {
        ...(buyer0.persona_moral || {}),
        denominacion_social: buyer0.persona_moral?.denominacion_social || null,
        rfc: buyer0.persona_moral?.rfc || null,
      }
    } else {
      buyer0.persona_fisica = {
        ...(buyer0.persona_fisica || {}),
        nombre: buyer0.persona_fisica?.nombre || null,
        estado_civil: buyer0.persona_fisica?.estado_civil || null,
        rfc: buyer0.persona_fisica?.rfc || null,
        curp: buyer0.persona_fisica?.curp || null,
      }
    }

    compradores[0] = buyer0
    merged.compradores = compradores
  }

  // Regla determinista anti-loop (estado civil):
  // respuestas cortas como "es casado" deben reflejarse en comprador[0].persona_fisica.estado_civil.
  const buyerEstadoCivil = inferBuyerEstadoCivilFromMessage(normalized)
  if (buyerEstadoCivil) {
    const compradores = Array.isArray(merged.compradores) ? [...merged.compradores] : []
    const buyer0 = { ...(compradores[0] || {}) }
    buyer0.party_id = buyer0.party_id || 'comprador_1'
    buyer0.tipo_persona = buyer0.tipo_persona || 'persona_fisica'
    buyer0.persona_fisica = {
      ...(buyer0.persona_fisica || {}),
      nombre: buyer0.persona_fisica?.nombre || null,
      rfc: buyer0.persona_fisica?.rfc || null,
      curp: buyer0.persona_fisica?.curp || null,
      estado_civil: buyerEstadoCivil,
    }
    compradores[0] = buyer0
    merged.compradores = compradores
  }

  // Heuristica determinista para mensajes narrativos "todo en uno":
  // si el parser no capturo partida/direccion pero el texto si los contiene,
  // completar un minimo estructurado para evitar perdida de contexto tras commit.
  const extractedPartida = extractPartidaFromText(message)
  const extractedAddress = extractAddressFromText(message)

  if (
    extractedPartida &&
    (!Array.isArray(merged?.inmueble?.partidas) || merged.inmueble.partidas.length === 0)
  ) {
    merged.inmueble = {
      ...(merged.inmueble || {}),
      partidas: [extractedPartida],
    }
  }

  if (extractedAddress && !String(merged?.inmueble?.direccion?.calle || '').trim()) {
    merged.inmueble = {
      ...(merged.inmueble || {}),
      direccion: {
        ...(merged.inmueble?.direccion || {}),
        calle: extractedAddress,
      },
    }
  }

  return merged
}

function extractPartidaFromText(message: string): string | null {
  const text = String(message || '')
  const match = text.match(/\bpartida(?:\s+registral)?(?:\s+no\.?)?\s*[:#]?\s*([A-Z0-9-]{4,})\b/i)
  if (!match) return null
  const candidate = String(match[1] || '')
    .trim()
    .replace(/[.,;:]+$/, '')
  if (!candidate) return null
  const normalized = candidate
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (normalized === 'registral') return null
  return candidate
}

function inferBuyerTipoPersonaFromMessage(normalizedMessage: string): 'persona_fisica' | 'persona_moral' | null {
  const text = String(normalizedMessage || '')
  const hasPersonaMoral = /\b(persona\s+moral|moral)\b/.test(text)
  const hasPersonaFisica = /\b(persona\s+fisica|fisica)\b/.test(text)
  if (hasPersonaMoral && !hasPersonaFisica) return 'persona_moral'
  if (hasPersonaFisica && !hasPersonaMoral) return 'persona_fisica'
  return null
}

function inferBuyerEstadoCivilFromMessage(
  normalizedMessage: string
): 'casado' | 'soltero' | 'divorciado' | 'viudo' | 'union_libre' | null {
  const text = String(normalizedMessage || '')
  if (/\b(casad[oa]s?)\b/.test(text)) return 'casado'
  if (/\b(solter[oa]s?)\b/.test(text)) return 'soltero'
  if (/\b(divorciad[oa]s?)\b/.test(text)) return 'divorciado'
  if (/\b(viud[oa]s?)\b/.test(text)) return 'viudo'
  if (/\b(union libre|union_libre)\b/.test(text)) return 'union_libre'
  return null
}

function extractAddressFromText(message: string): string | null {
  const text = String(message || ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const markerMatch = text.match(
    /\b(?:construido en|ubicado en|domicilio(?: del inmueble)?|direccion(?: del inmueble)?)\b\s*[:\-]?\s*(.+)$/i
  )
  if (!markerMatch) return null

  const tail = markerMatch[1] || ''
  const cut = tail.split(/\b(?:vendedor|comprador|forma de pago|sin gravamen|con gravamen|credito|hipoteca)\b/i)[0]
  const cleaned = cut.trim().replace(/[.,;:]+$/, '')

  if (cleaned.length < 12) return null
  return cleaned.slice(0, 240)
}

function hydrateCriticalFieldsFromHistory(
  data: Record<string, any>,
  historyMessages: string[]
): Record<string, any> {
  const merged = { ...(data || {}) } as Record<string, any>
  const inmueble = { ...(merged.inmueble || {}) } as Record<string, any>
  const direccion = { ...(inmueble.direccion || {}) } as Record<string, any>

  const historyText = historyMessages.join('\n')
  const folioFromHistory = extractFolioFromText(historyText)
  const partidaFromHistory = extractPartidaFromText(historyText)
  const addressFromHistory = extractAddressFromText(historyText)
  const labeledParties = extractLabeledPartiesFromText(historyText)

  if (!String(inmueble.folio_real || '').trim() && folioFromHistory) {
    inmueble.folio_real = folioFromHistory
  }
  if ((!Array.isArray(inmueble.partidas) || inmueble.partidas.length === 0) && partidaFromHistory) {
    inmueble.partidas = [partidaFromHistory]
  }
  if (!String(direccion.calle || '').trim() && addressFromHistory) {
    direccion.calle = addressFromHistory
  }

  if ((!Array.isArray(merged.compradores) || merged.compradores.length === 0) && labeledParties.comprador) {
    merged.compradores = [buildPartyFromLabel('comprador_1', labeledParties.comprador)]
  }
  if ((!Array.isArray(merged.vendedores) || merged.vendedores.length === 0) && labeledParties.vendedor) {
    merged.vendedores = [buildPartyFromLabel('vendedor_1', labeledParties.vendedor)]
  }
  if (
    Array.isArray(merged.vendedores) &&
    merged.vendedores.length === 1 &&
    (!Array.isArray(merged.compradores) || merged.compradores.length === 0) &&
    labeledParties.comprador
  ) {
    // Corrige caso típico donde el comprador quedó mal asignado como vendedor.
    const onlySeller = merged.vendedores[0]
    const sellerName = String(onlySeller?.persona_fisica?.nombre || onlySeller?.persona_moral?.denominacion_social || '')
      .toUpperCase()
      .trim()
    const buyerName = labeledParties.comprador.toUpperCase().trim()
    if (sellerName && buyerName && sellerName === buyerName) {
      merged.compradores = [buildPartyFromLabel('comprador_1', labeledParties.comprador)]
    }
  }

  inmueble.direccion = direccion
  merged.inmueble = inmueble
  return merged
}

function extractFolioFromText(message: string): string | null {
  const text = String(message || '')
  const match = text.match(/\bfolio(?:\s+real)?(?:\s+no\.?)?\s*[:#]?\s*([A-Z0-9-]{5,})\b/i)
  if (!match) return null
  return String(match[1] || '')
    .trim()
    .replace(/[.,;:]+$/, '')
}

function extractLabeledPartiesFromText(text: string): { comprador: string | null; vendedor: string | null } {
  const source = String(text || '')
  const compradorMatch = source.match(/\bcomprador(?:\s*[:\-])\s*([^\n\r]+)/i)
  const vendedorMatch = source.match(/\bvendedor(?:\s*[:\-])\s*([^\n\r]+)/i)
  return {
    comprador: compradorMatch ? sanitizePartyLabel(compradorMatch[1]) : null,
    vendedor: vendedorMatch ? sanitizePartyLabel(vendedorMatch[1]) : null,
  }
}

function sanitizePartyLabel(value: string): string | null {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim()
  if (!cleaned || cleaned.length < 4) return null
  return cleaned
}

function enrichInmuebleFromFolioCandidates(data: Record<string, any>): Record<string, any> {
  const next = { ...(data || {}) } as Record<string, any>
  const inmueble = { ...(next.inmueble || {}) } as Record<string, any>
  const direccion = { ...(inmueble.direccion || {}) } as Record<string, any>
  const dc = { ...(inmueble.datos_catastrales || {}) } as Record<string, any>

  const folios = next.folios || {}
  const candidates = Array.isArray(folios?.candidates) ? folios.candidates : []
  if (candidates.length === 0) return next

  const selectedFolio = String(folios?.selection?.selected_folio || '').replace(/\D/g, '')
  let target: any = null
  if (selectedFolio) {
    target = candidates.find((c: any) => String(c?.folio || '').replace(/\D/g, '') === selectedFolio) || null
  }

  if (!target) {
    const withAttrs = candidates.filter((c: any) => c?.attrs && Object.keys(c.attrs || {}).length > 0)
    if (withAttrs.length === 1) target = withAttrs[0]
  }

  if (!target) return next
  const attrs = (target.attrs || {}) as Record<string, any>
  const attrsDireccion = (attrs.direccion || {}) as Record<string, any>

  const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim())
  const hasManyFolios = candidates.length > 1

  // Solo autoasignar folio cuando no hay ambigüedad clara.
  if (isEmpty(inmueble.folio_real)) {
    if (!hasManyFolios && target?.folio) {
      inmueble.folio_real = String(target.folio)
    } else if (selectedFolio) {
      inmueble.folio_real = selectedFolio
    }
  }

  if (!Array.isArray(inmueble.partidas) || inmueble.partidas.length === 0) {
    const partida = String(attrs.partida || '').trim()
    if (partida) inmueble.partidas = [partida]
  }

  if (isEmpty(direccion.calle)) {
    const fromCalle = String(attrsDireccion.calle || '').trim()
    const fromUbicacion = String(attrs.ubicacion || '').trim()
    direccion.calle = fromCalle || fromUbicacion || direccion.calle || null
  }
  if (isEmpty(direccion.numero) && !isEmpty(attrsDireccion.numero)) direccion.numero = attrsDireccion.numero
  if (isEmpty(direccion.colonia) && !isEmpty(attrsDireccion.colonia)) direccion.colonia = attrsDireccion.colonia
  if (isEmpty(direccion.municipio) && !isEmpty(attrsDireccion.municipio)) direccion.municipio = attrsDireccion.municipio
  if (isEmpty(direccion.estado) && !isEmpty(attrsDireccion.estado)) direccion.estado = attrsDireccion.estado
  if (isEmpty(direccion.codigo_postal) && !isEmpty(attrsDireccion.codigo_postal)) direccion.codigo_postal = attrsDireccion.codigo_postal

  if (isEmpty(inmueble.superficie) && !isEmpty(attrs.superficie)) {
    inmueble.superficie = attrs.superficie
  }

  if (isEmpty(dc.lote) && !isEmpty(attrs.lote)) dc.lote = String(attrs.lote)
  if (isEmpty(dc.manzana) && !isEmpty(attrs.manzana)) dc.manzana = String(attrs.manzana)
  if (isEmpty(dc.fraccionamiento) && !isEmpty(attrs.fraccionamiento)) dc.fraccionamiento = String(attrs.fraccionamiento)
  if (isEmpty(dc.condominio) && !isEmpty(attrs.condominio)) dc.condominio = String(attrs.condominio)
  if (isEmpty(dc.unidad) && !isEmpty(attrs.unidad)) dc.unidad = String(attrs.unidad)
  if (isEmpty(dc.modulo) && !isEmpty(attrs.modulo)) dc.modulo = String(attrs.modulo)

  inmueble.direccion = direccion
  inmueble.datos_catastrales = dc
  next.inmueble = inmueble
  return next
}

function buildPartyFromLabel(partyId: string, rawName: string) {
  const upper = String(rawName || '').toUpperCase()
  const looksMoral = /\b(SA|S\.A\.|SAPI|SOCIEDAD|CV|C\.V\.)\b/.test(upper)

  if (looksMoral) {
    return {
      party_id: partyId,
      tipo_persona: 'persona_moral',
      persona_moral: {
        rfc: null,
        denominacion_social: rawName,
      },
      tiene_credito: null,
    }
  }

  const parsed = parsePersonAndSpouseFromLabel(rawName)
  return {
    party_id: partyId,
    tipo_persona: 'persona_fisica',
    persona_fisica: {
      nombre: parsed.personName,
      rfc: null,
      curp: null,
      estado_civil: parsed.isMarried ? 'casado' : null,
      ...(parsed.spouseName
        ? {
            conyuge: {
              nombre: parsed.spouseName,
              rfc: null,
              curp: null,
              participa: false,
            },
          }
        : {}),
    },
    tiene_credito: null,
  }
}

function parsePersonAndSpouseFromLabel(rawLabel: string): {
  personName: string
  spouseName: string | null
  isMarried: boolean
} {
  const raw = String(rawLabel || '').trim()
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const spousePattern =
    /(.*?)\s+y\s+su\s+espos[ao]\s+([a-z0-9 .,'-]+)$/i
  const spouseMatch = raw.match(spousePattern)
  if (spouseMatch) {
    const personName = String(spouseMatch[1] || '').trim().replace(/[.,;:]+$/, '')
    const spouseName = String(spouseMatch[2] || '').trim().replace(/[.,;:]+$/, '')
    if (personName) {
      return {
        personName,
        spouseName: spouseName || null,
        isMarried: true,
      }
    }
  }

  const marriedHint = /\b(espos[ao]s?|conyuge|c[oó]nyuge|matrimonio)\b/.test(normalized)
  return {
    personName: raw,
    spouseName: null,
    isMarried: marriedHint,
  }
}

function coalesceString(nextValue: unknown, prevValue: unknown): string | null {
  const next = String(nextValue ?? '').trim()
  if (next) return next
  const prev = String(prevValue ?? '').trim()
  return prev || null
}

function coalesceValue<T>(nextValue: T | null | undefined, prevValue: T | null | undefined): T | null {
  if (nextValue !== null && nextValue !== undefined) return nextValue
  if (prevValue !== null && prevValue !== undefined) return prevValue
  return null
}

function mergeObjectPreservingNonEmpty(
  prevObj: Record<string, unknown>,
  nextObj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prevObj }
  for (const [key, value] of Object.entries(nextObj || {})) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    out[key] = value
  }
  return out
}
