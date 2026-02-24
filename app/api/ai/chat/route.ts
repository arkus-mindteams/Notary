import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
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
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import { TramitePluginStateService } from '@/lib/services/tramite-plugin-state-service'

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
        lastQuestionIntent: z.string().trim().nullable().optional(),
        detectedPeople: z.array(z.string().trim().min(1)).optional(),
        documentId: z.string().trim().optional(),
        rawText: z.string().optional(),
        fileMeta: z.record(z.unknown()).optional(),
        tramiteType: z.string().trim().optional(),
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
  finalizeTramiteFromTramite: async (args: {
    tramiteId: string
    pluginType: string
    currentUser: any
    generatedDocument?: { formato?: 'docx' | 'pdf'; titulo?: string }
  }) => {
    const tramite = await TramiteService.findTramiteById(args.tramiteId)
    if (!tramite) {
      throw new ProposedUpdateDomainViolationError('Tramite no encontrado para finalizar')
    }
    const plugin = PluginRegistry.getInstance().get(args.pluginType)
    const snapshot = TramitePluginStateService.buildStateSnapshot(plugin.tramiteType, tramite.datos || {})
    if (!snapshot.wizard_state.can_finalize) {
      throw new ProposedUpdateDomainViolationError('El tramite aun no cumple requisitos para finalizar')
    }
    if (plugin.tramiteType !== 'preaviso') {
      throw new ProposedUpdateDomainViolationError(`Finalize no implementado para tramiteType=${plugin.tramiteType}`)
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
    const plugin = PluginRegistry.getInstance().get(String(tramite.tipo || 'preaviso'))
    const computed = TramitePluginStateService.buildStateSnapshot(plugin.tramiteType, tramite.datos || {})
    return {
      current_state: computed.current_state,
      state_status: computed.state_status,
      required_missing: computed.required_missing,
      blocking_reasons: computed.blocking_reasons,
      allowed_actions: [],
      wizard_state: computed.wizard_state,
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
  findLatestTramiteDocumentExtraction: async (tramiteId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('tramite_documentos')
      .select('created_at, documentos(id,nombre,tipo,metadata)')
      .eq('tramite_id', tramiteId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw new Error(`Error loading tramite documents: ${error.message}`)
    const rows = (data || []) as Array<{
      created_at?: string | null
      documentos?: {
        id?: string | null
        nombre?: string | null
        tipo?: string | null
        metadata?: Record<string, unknown> | null
      } | null
    }>

    for (const row of rows) {
      const doc = row.documentos
      const extractedData =
        doc?.metadata && typeof doc.metadata === 'object'
          ? (doc.metadata as any).extracted_data || null
          : null
      if (extractedData && typeof extractedData === 'object') {
        return {
          documentId: String(doc?.id || ''),
          fileName: String(doc?.nombre || ''),
          documentType: String(doc?.tipo || ''),
          extractedData,
        }
      }
    }
    return null
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

      const requestedPluginType = String(
        body.uiContext?.tramiteType || body.uiContext?.pluginType || tramiteScope.tipo || 'preaviso'
      )
      let resolvedPluginType = requestedPluginType
      try {
        resolvedPluginType = PluginRegistry.getInstance().get(requestedPluginType).tramiteType
      } catch {
        return errorResponse(422, 'DOMAIN_RULE_VIOLATION', 'tramiteType no soportado', {
          tramiteType: requestedPluginType,
        })
      }
      const isPreavisoPlugin = resolvedPluginType === 'preaviso'

      const shouldDirectLegacyStateUpdate =
        isPreavisoPlugin &&
        !isConfirmationMessage(body.message) &&
        shouldFallbackToLegacyStateUpdate(body.message) &&
        shouldBypassRouterForShortUpdate(body.message, body.uiContext?.uiAction)

      let tramiteState = await deps.getTramiteStateSnapshot(body.tramiteId)
      const requiredMissingForRouting = Array.isArray(tramiteState?.required_missing)
        ? (tramiteState.required_missing as string[])
        : []
      const hintedIntent =
        String(body.uiContext?.lastQuestionIntent || '').trim() ||
        deriveLastQuestionIntent(requiredMissingForRouting) ||
        null
      const hintedPeople = Array.isArray(body.uiContext?.detectedPeople)
        ? body.uiContext?.detectedPeople
            .map((v) => String(v || '').trim())
            .filter((v) => v.length > 0)
            .slice(0, 6)
        : []
      const routingMessage = buildRoutingMessageWithCollectionHint(
        body.message,
        hintedIntent,
        hintedPeople
      )
      if (routingMessage !== body.message) {
        console.info('[api/ai/chat] routing_collection_hint', {
          hinted_intent: hintedIntent,
          detected_people_count: hintedPeople.length,
          message_preview: String(body.message || '').slice(0, 120),
        })
      }

      const routed = shouldDirectLegacyStateUpdate
        ? ({
            intent: 'UPDATE_STATE',
            agent_used: 'ProposeStateUpdateAgent',
            answer: '',
            proposed_updates: [],
            actions: [],
            trace_id: randomUUID(),
          } as any)
        : await deps.route({
            chatId: body.chatId,
            tramiteId: body.tramiteId,
            message: routingMessage,
            uiContext: {
              ...(body.uiContext || {}),
              pluginType: resolvedPluginType,
              tramiteType: resolvedPluginType,
            },
            userAuthId: currentUser.auth_user_id,
          })

      let responsePayload: Record<string, unknown> = { ...routed }

      const confirmationRequested =
        body.uiContext?.uiAction === 'confirm_proposed_updates' ||
        body.uiContext?.uiAction === 'confirm_document_generation' ||
        isConfirmationMessage(body.message)

      const shouldUseLegacyStateUpdateFallback =
        isPreavisoPlugin &&
        !confirmationRequested &&
        !shouldDirectLegacyStateUpdate &&
        routed.intent === 'UPDATE_STATE' &&
        shouldFallbackToLegacyStateUpdate(body.message)

      const shouldRecoverFromQnaMisroute =
        isPreavisoPlugin &&
        !confirmationRequested &&
        routed.intent === 'QNA' &&
        shouldTreatQnaAsStateUpdate(body.message, routed.answer)
      const shouldRecoverFromUnknownMisroute =
        isPreavisoPlugin &&
        !confirmationRequested &&
        routed.intent === 'UNKNOWN' &&
        shouldTreatUnknownAsStateUpdate(body.message, routed.answer)
      const shouldRecoverFromExtractMissingPayload =
        isPreavisoPlugin &&
        !confirmationRequested &&
        routed.intent === 'EXTRACT_DOCUMENT' &&
        isExtractionMissingPayload(routed.actions) &&
        (body.uiContext?.uiAction === 'chat_after_document_process' ||
          body.uiContext?.hasDocument === true ||
          /subi|subido|subir|documento|captura|imagen|archivo/i.test(body.message))
      const shouldRetryFromDocumentEvidence =
        isPreavisoPlugin &&
        !confirmationRequested &&
        shouldRetryFromDocumentMessage(body.message) &&
        Array.isArray(routed.actions) &&
        routed.actions.some((a: any) => a?.type === 'request_missing_field')

      let usedLegacyStateFallback = false

      const shouldAnswerMissingFromState =
        isPreavisoPlugin &&
        !confirmationRequested &&
        containsNoEvidenceMessage(String(routed.answer || '')) &&
        isMissingDataQuestion(body.message)

      if (shouldAnswerMissingFromState) {
        const [tramiteData, freshState] = await Promise.all([
          deps.loadTramiteData(body.tramiteId),
          deps.getTramiteStateSnapshot(body.tramiteId),
        ])
        tramiteState = freshState
        const guidance = buildMissingDataGuidance(
          Array.isArray(freshState.required_missing) ? freshState.required_missing : [],
          Array.isArray(freshState.blocking_reasons) ? freshState.blocking_reasons : []
        )
        const docsHint = buildMissingDocumentsHint(guidance.required_missing)

        responsePayload = {
          ...routed,
          intent: 'UPDATE_STATE',
          agent_used: 'ProposeStateUpdateAgent',
          answer: docsHint
            ? `${guidance.message}\n\n${docsHint}`
            : guidance.message,
          actions: [
            {
              type: 'request_missing_field',
              required_missing: guidance.required_missing,
              blocking_reasons: guidance.blocking_reasons,
              next_questions: guidance.next_questions,
            },
          ],
          state: freshState,
          data: (tramiteData || {}) as Record<string, unknown>,
        }
        responsePayload = appendFolioSelectionActionIfNeeded(responsePayload, (tramiteData || {}) as Record<string, any>)
      }

      if (shouldDirectLegacyStateUpdate && !confirmationRequested) {
        const [tramiteData, recentMessages] = await Promise.all([
          deps.loadTramiteData(body.tramiteId),
          deps.findRecentChatMessages(body.chatId, 20),
        ])

        const normalizedLegacyData = reconcileLegacyCapturedData({
          prevData: (tramiteData || {}) as Record<string, any>,
          nextData: (tramiteData || {}) as Record<string, any>,
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
            : 'Datos actualizados desde tu respuesta. Si deseas, puedo revisar ahora mismo que datos faltan para finalizar.',
          proposed_updates: [],
          actions: [
            ...(Array.isArray(routed.actions) ? routed.actions : []),
            { type: 'direct_state_update_applied' },
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

      if (
        !shouldAnswerMissingFromState &&
        (
          shouldUseLegacyStateUpdateFallback ||
          shouldRecoverFromQnaMisroute ||
          shouldRecoverFromUnknownMisroute ||
          shouldRecoverFromExtractMissingPayload
        )
      ) {
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

      if (shouldRetryFromDocumentEvidence) {
        const [tramiteData, recentMessages, latestDocExtraction] = await Promise.all([
          deps.loadTramiteData(body.tramiteId),
          deps.findRecentChatMessages(body.chatId, 20),
          deps.findLatestTramiteDocumentExtraction(body.tramiteId),
        ])

        if (latestDocExtraction?.extractedData) {
          const mergedFromDoc = mergeStructuredExtractionIntoTramiteData(
            (tramiteData || {}) as Record<string, any>,
            latestDocExtraction.extractedData as Record<string, any>
          )
          const normalizedWithHistory = hydrateCriticalFieldsFromHistory(
            mergedFromDoc,
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
              ? `ReprocesÃƒÆ’Ã‚Â© la informaciÃƒÆ’Ã‚Â³n del documento "${latestDocExtraction.fileName || 'reciente'}". ${guidance.message}`
              : `ReprocesÃƒÆ’Ã‚Â© la informaciÃƒÆ’Ã‚Â³n del documento "${latestDocExtraction.fileName || 'reciente'}" y actualicÃƒÆ’Ã‚Â© el trÃƒÆ’Ã‚Â¡mite.`,
            proposed_updates: [],
            actions: [
              ...(Array.isArray(routed.actions) ? routed.actions : []),
              {
                type: 'document_reprocess_applied',
                document_id: latestDocExtraction.documentId || null,
                file_name: latestDocExtraction.fileName || null,
              },
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
      }

      if (routed.intent === 'GENERATE_DOCUMENT' && !confirmationRequested) {
        if (isPreavisoPlugin && shouldFallbackToLegacyStateUpdate(body.message)) {
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
          const finalized = await deps.finalizeTramiteFromTramite({
            tramiteId: body.tramiteId,
            pluginType: resolvedPluginType,
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

      const requiredMissingForIntent = Array.isArray((responsePayload as any)?.state?.required_missing)
        ? ((responsePayload as any).state.required_missing as string[])
        : (
            Array.isArray((responsePayload as any)?.actions)
              ? ((responsePayload as any).actions as any[])
                  .filter((a: any) => a?.type === 'request_missing_field')
                  .flatMap((a: any) => (Array.isArray(a?.required_missing) ? a.required_missing : []))
              : []
          )
      const nextQuestionsForIntent = Array.isArray((responsePayload as any)?.actions)
        ? ((responsePayload as any).actions as any[])
            .filter((a: any) => a?.type === 'request_missing_field')
            .flatMap((a: any) => (Array.isArray(a?.next_questions) ? a.next_questions : []))
            .map((q: any) => String(q || '').trim())
            .filter(Boolean)
        : []
      const nextLastIntent =
        deriveLastQuestionIntent(requiredMissingForIntent) ||
        deriveIntentFromNextQuestions(nextQuestionsForIntent)
      if (nextLastIntent) {
        const currentData = ((responsePayload as any)?.data && typeof (responsePayload as any).data === 'object')
          ? ((responsePayload as any).data as Record<string, unknown>)
          : {}
        ;(responsePayload as any).data = {
          ...currentData,
          _last_question_intent: nextLastIntent,
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
  const userFacingMissing = reduceMissingFieldsForQuestions(uniqueMissing)

  const nextQuestions = userFacingMissing.slice(0, 3).map(mapMissingFieldToQuestion)
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
  if (nextQuestions.length > 0) {
    messageParts.push('Si ese dato no aparece en el documento, puedes capturarlo manualmente escribiendolo en el chat.')
  }

  return {
    message: messageParts.join(' ').trim(),
    required_missing: userFacingMissing,
    blocking_reasons: uniqueBlocking,
    next_questions: nextQuestions,
  }
}

function reduceMissingFieldsForQuestions(fields: string[]): string[] {
  const set = new Set(fields.filter(Boolean))
  const result: string[] = []
  for (const field of set) {
    const hasParentComprador = field.startsWith('compradores[].') && set.has('compradores[]')
    const hasParentVendedor = field.startsWith('vendedores[].') && set.has('vendedores[]')
    const hasParentCredito = /^creditos\[\d+\]\./.test(field) && set.has('creditos[]')
    const hasParentGravamen = /^gravamenes\[\d+\]\./.test(field) && set.has('gravamenes[]')
    if (hasParentComprador || hasParentVendedor || hasParentCredito || hasParentGravamen) {
      continue
    }
    result.push(field)
  }
  return result
}

function mapMissingFieldToQuestion(field: string): string {
  const normalized = String(field || '')

  if (normalized === 'tipoOperacion') return 'confirma el tipo de operacion.'
  if (normalized === 'existencia_credito') return 'indica si la compra se hara con credito.'
  if (normalized === 'inmueble.folio_real') return 'proporciona o confirma el folio real del inmueble.'
  if (normalized === 'inmueble.partidas') return 'proporciona la partida registral del inmueble.'
  if (normalized === 'inmueble.direccion') return 'proporciona la direccion del inmueble.'
  if (normalized === 'vendedores[]') return 'indica quien es el vendedor.'
  if (normalized === 'vendedores[].nombre') return 'indica el nombre completo del vendedor.'
  if (normalized === 'vendedores[].tipo_persona') return 'confirma si el vendedor es persona fisica o moral.'
  if (normalized === 'compradores[]') return 'indica quien es el comprador.'
  if (normalized === 'compradores[].nombre') return 'indica el nombre completo del comprador.'
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

function deriveLastQuestionIntent(requiredMissing: string[]): string | null {
  const set = new Set((requiredMissing || []).map((v) => String(v || '')))
  if (Array.from(set).some((f) => f.startsWith('compradores'))) return 'comprador'
  if (Array.from(set).some((f) => f.startsWith('vendedores'))) return 'vendedor'
  if (set.has('inmueble.folio_real')) return 'folio_real'
  if (set.has('inmueble.partidas')) return 'partidas'
  if (set.has('inmueble.direccion')) return 'direccion'
  if (set.has('existencia_credito') || set.has('creditos[]') || Array.from(set).some((f) => f.startsWith('creditos['))) return 'credito'
  if (set.has('gravamenes[]') || Array.from(set).some((f) => f.startsWith('gravamenes['))) return 'gravamen'
  return null
}

function deriveIntentFromNextQuestions(questions: string[]): string | null {
  const first = String((questions || []).find((q) => String(q || '').trim()) || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!first) return null
  if (/\bcomprador/.test(first)) return 'comprador'
  if (/\bvendedor/.test(first)) return 'vendedor'
  if (/\bconyuge|conyuge|esposa|esposo/.test(first)) return 'conyuge'
  if (/\bfolio real|folio\b/.test(first)) return 'folio_real'
  if (/\bpartida/.test(first)) return 'partidas'
  if (/\bdireccion/.test(first)) return 'direccion'
  if (/\bcredito|contado|institucion/.test(first)) return 'credito'
  if (/\bgravamen|hipoteca|cancelacion/.test(first)) return 'gravamen'
  return null
}

function buildRoutingMessageWithCollectionHint(
  originalMessage: string,
  intent: string | null,
  detectedPeople: string[]
): string {
  const raw = String(originalMessage || '').trim()
  const cleanIntent = String(intent || '').trim().toLowerCase()
  if (!raw || !cleanIntent) return raw
  const peopleHint =
    Array.isArray(detectedPeople) && detectedPeople.length > 0
      ? `\n[PERSONAS_DETECTADAS_NO_CLASIFICADAS]: ${detectedPeople.join(' | ')}`
      : ''
  return `${raw}\n[OBJETIVO_DE_CAPTURA]: ${cleanIntent}${peopleHint}`
}

function shouldFallbackToLegacyStateUpdate(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const hasDomainShortSignal =
    /\b(credito|contado|gravamen|hipoteca|folio|partida|direccion|comprador|vendedor|conyuge|esposo|esposa|persona|fisica|moral|estado civil|casado|soltero|divorciado|viudo|union libre|cancela|cancelado|cancelacion)\b/.test(lower) &&
    /\b(es|si|sin|con|confirmo|indico|indica|sera|se)\b/.test(lower)
  const hasCancellationReply =
    /\bcancel/.test(lower) &&
    /\b(si|no|confirmo|confirmado|correcto|sera|se)\b/.test(lower)
  const hasDirectFolioReply =
    /^\d{6,10}$/.test(text.replace(/\s+/g, '')) ||
    /^es\s+el\s+\d{5,10}$/.test(lower) ||
    /^es\s+\d{5,10}$/.test(lower) ||
    (/\b(folio|partida)\b/.test(lower) && /\b\d{5,10}\b/.test(lower))
  const isSingleWordDomainReply = /^(contado|credito|casado|soltero|divorciado|viudo|si|no)$/.test(lower)
  const hasPaymentQuickSignal =
    /\b(contado|credito)\b/.test(lower) &&
    /\b(compra|pago|forma de pago|de)\b/.test(lower)

  if (!(hasDomainShortSignal || hasDirectFolioReply || hasCancellationReply) && /\b(ejecuta|confirmo|confirma|ok|dale|si)\b/.test(lower) && text.length <= 25) {
    return false
  }

  const hasNarrativeSignals =
    text.length >= 80 ||
    (text.match(/\n/g)?.length || 0) >= 2 ||
    /folio|partida|lote|manzana|condominio|vendedor|comprador|direccion|credito|gravamen|hipoteca|cancel/i.test(text)

  return (
    hasNarrativeSignals ||
    hasDomainShortSignal ||
    hasDirectFolioReply ||
    hasCancellationReply ||
    isSingleWordDomainReply ||
    hasPaymentQuickSignal
  )
}

function shouldBypassRouterForShortUpdate(message: string, uiAction?: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  if (text.includes('?')) return false

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const compact = normalized.replace(/\s+/g, '')
  const normalizedUiAction = String(uiAction || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalizedUiAction.includes('generate_document') || normalizedUiAction.includes('finalize')) {
    return false
  }

  if (text.length <= 40) {
    if (/^\d{5,10}$/.test(compact)) return true
    if (/^(es)?folio\d{5,10}$/.test(compact)) return true
    if (/^(es)?partida[a-z0-9-]{4,}$/.test(compact)) return true
    if (/^(contado|credito|casado|soltero|divorciado|viudo|si|no)$/.test(normalized)) return true
    if (/\b(compra|pago|forma de pago)\b/.test(normalized) && /\b(contado|credito)\b/.test(normalized)) return true
    if (/\bde contado\b/.test(normalized)) return true
    if (/\b(es|si|sin|con|confirmo|indico|indica)\b/.test(normalized) &&
      /\b(credito|contado|gravamen|hipoteca|folio|partida|direccion|comprador|vendedor|conyuge|esposo|esposa)\b/.test(normalized)) {
      return true
    }
  }

  return false
}

function shouldRetryFromDocumentMessage(message: string): boolean {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  if (!normalized) return false
  return (
    /\b(toma|usar|usa|extrae|saca|revisa|lee|recupera)\b/.test(normalized) &&
    /\b(documento|archivo|pdf|inscripcion|escritura|adjunt[ea]|subi|subido)\b/.test(normalized)
  )
}

function mergeStructuredExtractionIntoTramiteData(
  prevData: Record<string, any>,
  extractedData: Record<string, any>
): Record<string, any> {
  const prev = prevData || {}
  const extracted = extractedData || {}
  const next: Record<string, any> = { ...prev }
  const rawText = String(extracted?.textoCompleto || '')

  const inmueble = extracted?.inmueble || {}
  const direccion = inmueble?.direccion || {}
  const datosCatastrales = inmueble?.datos_catastrales || {}
  next.inmueble = {
    ...(next.inmueble || {}),
    folio_real: coalesceString(inmueble?.folio_real, next?.inmueble?.folio_real),
    partidas:
      Array.isArray(inmueble?.partidas) && inmueble.partidas.length > 0
        ? inmueble.partidas
        : Array.isArray(next?.inmueble?.partidas)
          ? next.inmueble.partidas
          : [],
    direccion: mergeObjectPreservingNonEmpty(
      (next?.inmueble?.direccion || {}) as Record<string, unknown>,
      direccion as Record<string, unknown>
    ),
    superficie: coalesceValue(inmueble?.superficie, next?.inmueble?.superficie),
    valor: coalesceValue(inmueble?.valor, next?.inmueble?.valor),
    datos_catastrales: mergeObjectPreservingNonEmpty(
      (next?.inmueble?.datos_catastrales || {}) as Record<string, unknown>,
      datosCatastrales as Record<string, unknown>
    ),
  }

  const titularNombre = String(extracted?.titular_registral?.nombre || '').trim()
  if (titularNombre) {
    const vendedores = Array.isArray(next.vendedores) ? [...next.vendedores] : []
    const looksMoral = looksLikePersonaMoralName(titularNombre)
    const base = { ...(vendedores[0] || {}) }
    if (looksMoral) {
      vendedores[0] = {
        ...base,
        party_id: base.party_id || 'vendedor_1',
        tipo_persona: 'persona_moral',
        persona_moral: {
          ...(base.persona_moral || {}),
          denominacion_social: titularNombre,
          rfc: base.persona_moral?.rfc || extracted?.titular_registral?.rfc || null,
        },
        persona_fisica: undefined,
      }
    } else {
      vendedores[0] = {
        ...base,
        party_id: base.party_id || 'vendedor_1',
        tipo_persona: 'persona_fisica',
        persona_fisica: {
          ...(base.persona_fisica || {}),
          nombre: titularNombre,
          rfc: base.persona_fisica?.rfc || extracted?.titular_registral?.rfc || null,
          curp: base.persona_fisica?.curp || extracted?.titular_registral?.curp || null,
          estado_civil: base.persona_fisica?.estado_civil || null,
        },
      }
    }
    next.vendedores = vendedores
  }

  const buyers = Array.isArray(extracted?.compradores_detectados)
    ? extracted.compradores_detectados.filter((p: any) => String(p?.nombre || '').trim())
    : []
  if (buyers.length > 0) {
    const compradores = Array.isArray(next.compradores) ? [...next.compradores] : []
    buyers.forEach((buyer: any, idx: number) => {
      const name = String(buyer?.nombre || '').trim()
      if (!name) return
      const looksMoral = looksLikePersonaMoralName(name)
      const base = { ...(compradores[idx] || {}) }
      if (looksMoral) {
        compradores[idx] = {
          ...base,
          party_id: base.party_id || `comprador_${idx + 1}`,
          tipo_persona: 'persona_moral',
          persona_moral: {
            ...(base.persona_moral || {}),
            denominacion_social: name,
            rfc: base.persona_moral?.rfc || buyer?.rfc || null,
          },
          persona_fisica: undefined,
        }
      } else {
        compradores[idx] = {
          ...base,
          party_id: base.party_id || `comprador_${idx + 1}`,
          tipo_persona: 'persona_fisica',
          persona_fisica: {
            ...(base.persona_fisica || {}),
            nombre: name,
            rfc: base.persona_fisica?.rfc || buyer?.rfc || null,
            curp: base.persona_fisica?.curp || buyer?.curp || null,
            estado_civil: base.persona_fisica?.estado_civil || null,
          },
        }
      }
    })
    next.compradores = compradores
  }

  const buyerName = String(
    next?.compradores?.[0]?.persona_fisica?.nombre ||
      next?.compradores?.[0]?.persona_moral?.denominacion_social ||
      ''
  ).trim()
  const normalizedBuyer = buyerName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const conyugeCandidates = Array.isArray(extracted?.conyuges_detectados)
    ? extracted.conyuges_detectados
        .map((p: any) => String(p?.nombre || '').trim())
        .filter(Boolean)
    : []
  const conyuge =
    conyugeCandidates.find((name: string) => {
      const normalized = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
      return normalized && normalized !== normalizedBuyer
    }) || null
  if (conyuge && Array.isArray(next.compradores) && next.compradores.length > 0) {
    const compradores = [...next.compradores]
    const c0 = { ...(compradores[0] || {}) }
    const isMoral =
      c0?.tipo_persona === 'persona_moral' ||
      looksLikePersonaMoralName(c0?.persona_moral?.denominacion_social || c0?.persona_fisica?.nombre || '')
    if (!isMoral) {
      c0.tipo_persona = c0.tipo_persona || 'persona_fisica'
      c0.persona_fisica = {
        ...(c0.persona_fisica || {}),
        nombre: c0.persona_fisica?.nombre || null,
        estado_civil: c0.persona_fisica?.estado_civil || 'casado',
        conyuge: {
          ...(c0.persona_fisica?.conyuge || {}),
          nombre: conyuge,
          participa: c0.persona_fisica?.conyuge?.participa ?? false,
        },
      }
      compradores[0] = c0
      next.compradores = compradores
    }
  }

  if (extracted?.gravamenes === 'LIBRE') {
    next.gravamenes = []
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: false }
  } else if (Array.isArray(extracted?.gravamenes) && extracted.gravamenes.length > 0) {
    next.gravamenes = extracted.gravamenes
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: true }
  }

  const derivedAcreedor = String(extracted?.__derived?.acreedor_cancelacion || '').trim()
  const hasCancellationSection = /\bCANCELACION\s+DE\s+HIPOTECA\b/i.test(rawText)
  if (derivedAcreedor || hasCancellationSection) {
    const gravamenes = Array.isArray(next?.gravamenes) ? [...next.gravamenes] : []
    const g0 = { ...(gravamenes[0] || {}) }
    gravamenes[0] = {
      gravamen_id: g0?.gravamen_id ?? null,
      tipo: g0?.tipo || 'hipoteca',
      institucion: derivedAcreedor || g0?.institucion || null,
      numero_credito: g0?.numero_credito ?? null,
      cancelacion_confirmada:
        g0?.cancelacion_confirmada === true || g0?.cancelacion_confirmada === false
          ? g0.cancelacion_confirmada
          : false,
    }
    next.gravamenes = gravamenes
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: true }
  }

  // Si hay gravamen con acreedor y tambiÃƒÆ’Ã‚Â©n crÃƒÆ’Ã‚Â©dito del comprador,
  // asumir "se cancelarÃƒÆ’Ã‚Â¡ en esta operaciÃƒÆ’Ã‚Â³n" cuando aÃƒÆ’Ã‚Âºn no venga definido.
  if (next?.inmueble?.existe_hipoteca === true && Array.isArray(next?.gravamenes) && next.gravamenes.length > 0) {
    const gravamenes = [...next.gravamenes]
    const g0 = { ...(gravamenes[0] || {}) }
    const hasAcreedor = Boolean(String(g0?.institucion || '').trim())
    const hasBuyerCredit = Array.isArray(next?.creditos) && next.creditos.length > 0
    if (hasAcreedor && hasBuyerCredit && (g0?.cancelacion_confirmada === null || g0?.cancelacion_confirmada === undefined)) {
      g0.cancelacion_confirmada = false
      gravamenes[0] = g0
      next.gravamenes = gravamenes
    }
  }

  return next
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

  const noEvidenceAnswer = containsNoEvidenceMessage(answer)

  return domainSignal || noEvidenceAnswer
}

function shouldTreatUnknownAsStateUpdate(message: string, answer?: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  if (text.includes('?')) return false

  const noEvidenceAnswer = containsNoEvidenceMessage(answer)
  if (!noEvidenceAnswer) return false

  return isLikelyPersonNameReply(text) || shouldFallbackToLegacyStateUpdate(text)
}

function isLikelyPersonNameReply(message: string): boolean {
  const text = String(message || '').trim()
  if (!text) return false
  if (text.length < 4 || text.length > 80) return false
  if (/\d/.test(text)) return false
  if (/[?@#]/.test(text)) return false

  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // Evita aceptar borradores incompletos como "NOMBRE es"
  if (/\bes\s*$/.test(normalized)) return false

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  if (!words.every((w) => /^[a-z.'-]+$/.test(w))) return false

  const blocked = new Set(['si', 'no', 'ok', 'dale', 'ejecuta', 'confirmo', 'confirmar'])
  if (words.some((w) => blocked.has(w))) return false

  return true
}

function containsNoEvidenceMessage(answer?: string): boolean {
  const normalized = String(answer || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return (
    normalized.includes('no encontre evidencia relevante') ||
    normalized.includes('no encontre suficiente evidencia')
  )
}

function inferShortRoleConfirmation(normalizedMessage: string): 'vendedor' | 'comprador' | 'conyuge' | null {
  const text = String(normalizedMessage || '').trim()
  if (!text) return null
  const isAffirmative = /\b(si|s[ií]|correcto|confirmo|afirmativo)\b/.test(text)
  if (!isAffirmative) return null
  if (/\bvendedor(a)?\b/.test(text)) return 'vendedor'
  if (/\bcomprador(a)?\b/.test(text)) return 'comprador'
  if (/\bconyuge\b|\bc[oó]nyuge\b|\besposa\b|\besposo\b/.test(text)) return 'conyuge'
  return null
}

function applyPendingPersonRole(
  merged: Record<string, any>,
  role: 'vendedor' | 'comprador' | 'conyuge',
  preferredName?: string | null
): void {
  const pending =
    (Array.isArray((merged as any)?._document_people_pending?.persons)
      ? (merged as any)._document_people_pending.persons
      : []) as Array<any>
  const uncategorized =
    (Array.isArray((merged as any)?.personas_detectadas_no_clasificadas)
      ? (merged as any).personas_detectadas_no_clasificadas
      : []) as Array<any>
  const spouses =
    (Array.isArray((merged as any)?.conyuges_detectados)
      ? (merged as any).conyuges_detectados
      : []) as Array<any>

  const norm = (v: unknown) =>
    String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const preferred = String(preferredName || '').trim()
  const preferredNorm = norm(preferred)
  const allCandidates = [...pending, ...uncategorized, ...spouses]
  const first =
    (preferredNorm
      ? allCandidates.find((p: any) => norm(p?.name || p?.nombre) === preferredNorm)
      : null) ||
    pending[0] ||
    uncategorized[0] ||
    spouses[0] ||
    null
  const name = String(preferred || first?.name || first?.nombre || '').trim()
  if (!name) return

  if (role === 'vendedor') {
    const vendedores = Array.isArray(merged.vendedores) ? [...merged.vendedores] : []
    const first = vendedores[0]
    const firstName = String(first?.persona_fisica?.nombre || first?.persona_moral?.denominacion_social || '').trim()
    if (vendedores.length === 0 || !firstName) {
      const party = buildPartyFromLabel('vendedor_1', name)
      vendedores[0] = { ...(first || {}), ...party, party_id: (first as any)?.party_id || 'vendedor_1' }
      merged.vendedores = vendedores
    } else {
    const exists = vendedores.some((v: any) => {
      const current = String(v?.persona_fisica?.nombre || v?.persona_moral?.denominacion_social || '')
      return current.trim().toLowerCase() === name.toLowerCase()
    })
    if (!exists) {
      const party = buildPartyFromLabel(`vendedor_${vendedores.length + 1}`, name)
      vendedores.push(party)
      merged.vendedores = vendedores
    }
    }
  } else if (role === 'comprador') {
    const compradores = Array.isArray(merged.compradores) ? [...merged.compradores] : []
    const first = compradores[0]
    const firstName = String(first?.persona_fisica?.nombre || first?.persona_moral?.denominacion_social || '').trim()
    if (compradores.length === 0 || !firstName) {
      const party = buildPartyFromLabel('comprador_1', name)
      compradores[0] = { ...(first || {}), ...party, party_id: (first as any)?.party_id || 'comprador_1' }
      merged.compradores = compradores
    } else {
    const exists = compradores.some((c: any) => {
      const current = String(c?.persona_fisica?.nombre || c?.persona_moral?.denominacion_social || '')
      return current.trim().toLowerCase() === name.toLowerCase()
    })
    if (!exists) {
      const party = buildPartyFromLabel(`comprador_${compradores.length + 1}`, name)
      compradores.push(party)
      merged.compradores = compradores
    }
    }
  } else if (role === 'conyuge') {
    const compradores = Array.isArray(merged.compradores) ? [...merged.compradores] : []
    if (compradores.length > 0) {
      const c0 = { ...(compradores[0] || {}) }
      c0.party_id = c0.party_id || 'comprador_1'
      c0.tipo_persona = c0.tipo_persona || 'persona_fisica'
      c0.persona_fisica = {
        ...(c0.persona_fisica || {}),
        nombre: c0.persona_fisica?.nombre || null,
        estado_civil: c0.persona_fisica?.estado_civil || 'casado',
        conyuge: {
          ...(c0.persona_fisica?.conyuge || {}),
          nombre: name,
          rfc: c0.persona_fisica?.conyuge?.rfc || null,
          curp: c0.persona_fisica?.conyuge?.curp || null,
          participa: c0.persona_fisica?.conyuge?.participa ?? false,
        },
      }
      compradores[0] = c0
      merged.compradores = compradores
    }
  }

  const target = norm(name)
  if ((merged as any)?._document_people_pending?.persons) {
    ;(merged as any)._document_people_pending.persons = pending.filter((p: any) => norm(p?.name || p?.nombre) !== target)
    if ((merged as any)._document_people_pending.persons.length === 0) {
      ;(merged as any)._document_people_pending = null
    }
  }
  if (Array.isArray((merged as any)?.personas_detectadas_no_clasificadas)) {
    ;(merged as any).personas_detectadas_no_clasificadas = uncategorized.filter((p: any) => norm(p?.name || p?.nombre) !== target)
  }
  if (Array.isArray((merged as any)?.conyuges_detectados)) {
    ;(merged as any).conyuges_detectados = spouses.filter((p: any) => norm(p?.name || p?.nombre) !== target)
  }
}

function extractExplicitRoleAssignment(
  text: string
): { role: 'vendedor' | 'comprador' | 'conyuge'; name: string | null } | null {
  const source = String(text || '').trim()
  if (!source) return null

  const roleFromRaw = (raw: string): 'vendedor' | 'comprador' | 'conyuge' | null => {
    const normalized = String(raw || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (normalized.includes('vendedor')) return 'vendedor'
    if (normalized.includes('comprador')) return 'comprador'
    if (normalized.includes('conyuge') || normalized.includes('esposa') || normalized.includes('esposo')) return 'conyuge'
    return null
  }

  // Priorizar "comprador/vendedor/conyuge es NOMBRE" para no invertir frases.
  const inverted = /\b(comprador(?:a)?|vendedor(?:a)?|c[oÃƒÂ³]nyuge|conyuge|espos[oa])\b\s*(?::|-|es)\s*([^\n\r.,;]+)/i
  const invertedMatch = source.match(inverted)
  if (invertedMatch) {
    const role = roleFromRaw(invertedMatch[1] || '')
    const name = sanitizePartyLabel(invertedMatch[2] || '')
    if (role) return { role, name }
  }

  const natural = /([A-ZÃƒÂÃƒâ€°ÃƒÂÃƒâ€œÃƒÅ¡Ãƒâ€˜0-9][A-ZÃƒÂÃƒâ€°ÃƒÂÃƒâ€œÃƒÅ¡Ãƒâ€˜0-9\s.'"-]{3,}?)\s+es\s+(?:el\s+|la\s+)?(comprador(?:a)?|vendedor(?:a)?|c[oÃƒÂ³]nyuge|conyuge|espos[oa])\b/i
  const naturalMatch = source.match(natural)
  if (naturalMatch) {
    const role = roleFromRaw(naturalMatch[2] || '')
    const left = sanitizePartyLabel(naturalMatch[1] || '')
    const name = isRoleKeyword(left) ? null : left
    if (role) return { role, name }
  }

  return null
}

function isMissingDataQuestion(message: string): boolean {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  return (
    /\b(que|cuales)\b/.test(normalized) &&
    /\b(falta|faltan|faltante|requiero|requieres|requiere|obligatorio|obligatorios)\b/.test(normalized)
  ) || /\b(documentos?\s+faltan)\b/.test(normalized)
}

function buildMissingDocumentsHint(requiredMissing: string[]): string {
  const fields = Array.from(new Set((requiredMissing || []).filter(Boolean)))
  const hints: string[] = []
  if (fields.some((f) => f === 'inmueble.folio_real' || f.startsWith('inmueble.'))) {
    hints.push('Documento sugerido: hoja de inscripcion/escritura para folio real, partida y datos del inmueble.')
  }
  if (fields.some((f) => f.startsWith('compradores'))) {
    hints.push('Documento sugerido: identificacion oficial del comprador (INE/pasaporte/licencia).')
  }
  if (fields.some((f) => f.startsWith('vendedores'))) {
    hints.push('Documento sugerido: hoja de inscripcion/escritura para titular registral o identificacion del vendedor.')
  }
  if (fields.some((f) => f.startsWith('creditos'))) {
    hints.push('Documento sugerido: estado de cuenta/carta de credito o datos del banco e institucion.')
  }
  if (fields.some((f) => f.startsWith('gravamenes'))) {
    hints.push('Documento sugerido: constancia/certificado de gravamen o informacion de cancelacion de hipoteca.')
  }
  return hints.join(' ')
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
      const label = unidad ? `${folio} (${scope} Ãƒâ€šÃ‚Â· unidad ${unidad})` : `${folio} (${scope})`
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

  // Si el usuario confirma/escribe explicitamente un folio en el chat,
  // tratarlo como confirmacion manual aunque no venga de boton de seleccion.
  const folioFromUserMessage = extractFolioFromText(message)
  if (folioFromUserMessage) {
    console.info('[api/ai/chat] folio_confirmed_from_user_message', {
      folio: folioFromUserMessage,
      message_preview: String(message || '').slice(0, 120),
    })
    const inmueble = { ...(merged.inmueble || {}) } as Record<string, any>
    inmueble.folio_real = folioFromUserMessage
    inmueble.folio_real_confirmed = true
    merged.inmueble = inmueble

    const prevFolios = (merged as any).folios || {
      candidates: [],
      selection: { selected_folio: null, selected_scope: null, confirmed_by_user: false },
    }
    ;(merged as any).folios = {
      ...prevFolios,
      selection: {
        ...(prevFolios.selection || {}),
        selected_folio: folioFromUserMessage,
        confirmed_by_user: true,
      },
    }
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

  // Captura determinista de roles escritos en chat:
  // "NOMBRE es comprador|vendedor", "comprador: NOMBRE", etc.
  const labeledFromMessage = extractLabeledPartiesFromText(message)
  if (labeledFromMessage.comprador || labeledFromMessage.vendedor) {
    console.info('[api/ai/chat] role_detected_from_message', {
      comprador: labeledFromMessage.comprador || null,
      vendedor: labeledFromMessage.vendedor || null,
      message_preview: String(message || '').slice(0, 140),
    })
  }
  if (labeledFromMessage.comprador) {
    const compradores = Array.isArray(merged.compradores) ? [...merged.compradores] : []
    if (compradores.length === 0) {
      compradores[0] = buildPartyFromLabel('comprador_1', labeledFromMessage.comprador)
    } else {
      const base = { ...(compradores[0] || {}) }
      const inferred = buildPartyFromLabel(base.party_id || 'comprador_1', labeledFromMessage.comprador)
      compradores[0] = { ...base, ...inferred, party_id: base.party_id || 'comprador_1' }
    }
    merged.compradores = compradores
  }

  if (labeledFromMessage.vendedor) {
    const vendedores = Array.isArray(merged.vendedores) ? [...merged.vendedores] : []
    if (vendedores.length === 0) {
      vendedores[0] = buildPartyFromLabel('vendedor_1', labeledFromMessage.vendedor)
    } else {
      const base = { ...(vendedores[0] || {}) }
      const inferred = buildPartyFromLabel(base.party_id || 'vendedor_1', labeledFromMessage.vendedor)
      vendedores[0] = { ...base, ...inferred, party_id: base.party_id || 'vendedor_1' }
    }
    merged.vendedores = vendedores
  }
  const explicitRoleAssignment = extractExplicitRoleAssignment(message)
  if (explicitRoleAssignment) {
    const resolvedName =
      explicitRoleAssignment.name ||
      resolvePreferredNameFromReference(message, merged)
    applyPendingPersonRole(merged, explicitRoleAssignment.role, resolvedName)
  }
  const shortRole = inferShortRoleConfirmation(normalized)
  if (!labeledFromMessage.comprador && !labeledFromMessage.vendedor && shortRole && !explicitRoleAssignment) {
    applyPendingPersonRole(merged, shortRole, null)
  }
  promoteUnclassifiedToSpouseWhenMarriageContext(merged)
  const saysNoCredit = /\b(sin credito|sin crÃƒÆ’Ã‚Â©dito|no credito|no crÃƒÆ’Ã‚Â©dito|de contado|pago de contado|contado)\b/.test(normalized)
  const saysWithCredit = /\b(con credito|con crÃƒÆ’Ã‚Â©dito|credito|crÃƒÆ’Ã‚Â©dito)\b/.test(normalized) && !/\b(sin credito|sin crÃƒÆ’Ã‚Â©dito|no credito|no crÃƒÆ’Ã‚Â©dito)\b/.test(normalized)
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
      buyer0.persona_fisica = undefined
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
    const buyerName = String(
      buyer0?.persona_fisica?.nombre ||
      buyer0?.persona_moral?.denominacion_social ||
      ''
    ).trim()
    const buyerIsMoral =
      buyer0.tipo_persona === 'persona_moral' ||
      looksLikePersonaMoralName(buyerName)
    if (buyerIsMoral) {
      return merged
    }
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

function looksLikePersonaMoralName(name: string): boolean {
  const upper = String(name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /\b(SA|S\.A\.|SAPI|SOCIEDAD|CV|C\.V\.|S DE RL|S\. DE R\.L\.)\b/.test(upper)
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
    // Corrige caso tÃƒÆ’Ã‚Â­pico donde el comprador quedÃƒÆ’Ã‚Â³ mal asignado como vendedor.
    const onlySeller = merged.vendedores[0]
    const sellerName = String(onlySeller?.persona_fisica?.nombre || onlySeller?.persona_moral?.denominacion_social || '')
      .toUpperCase()
      .trim()
    const buyerName = labeledParties.comprador.toUpperCase().trim()
    if (sellerName && buyerName && sellerName !== buyerName) {
      merged.compradores = [buildPartyFromLabel('comprador_1', labeledParties.comprador)]
    }
  }

  inmueble.direccion = direccion
  merged.inmueble = inmueble
  return merged
}

function extractFolioFromText(message: string): string | null {
  const text = String(message || '')
  const match = text.match(/\bfolio(?:\s+real)?(?:\s+no\.?)?(?:\s+(?:es|seria|serÃƒÆ’Ã‚Â­a|corresponde|confirmo|confirmamos))?\s*[:#]?\s*([A-Z0-9-]{5,})\b/i)
  if (match) {
    return String(match[1] || '')
      .trim()
      .replace(/[.,;:]+$/, '')
  }

  // Permitir respuesta corta solo con numero cuando el usuario responde al prompt de folio.
  const compact = text.trim().replace(/[.,;:\s]+$/g, '')
  if (/^\d{5,}$/.test(compact)) {
    return compact
  }
  return null
}

function extractLabeledPartiesFromText(text: string): { comprador: string | null; vendedor: string | null } {
  const source = String(text || '')
  let comprador: string | null = null
  let vendedor: string | null = null

  const assignRole = (roleRaw: string, valueRaw: string) => {
    const role = String(roleRaw || '').toLowerCase()
    const value = sanitizePartyLabel(valueRaw)
    if (!value) return
    if (role.startsWith('comprador')) comprador = value
    if (role.startsWith('vendedor')) vendedor = value
  }

  // Formato legacy: "comprador: NOMBRE" / "vendedor- NOMBRE"
  const compradorMatch = source.match(/\bcomprador(?:\s*[:\-])\s*([^\n\r]+)/i)
  const vendedorMatch = source.match(/\bvendedor(?:\s*[:\-])\s*([^\n\r]+)/i)
  if (compradorMatch?.[1]) assignRole('comprador', compradorMatch[1])
  if (vendedorMatch?.[1]) assignRole('vendedor', vendedorMatch[1])

  // Formato natural: "NOMBRE es comprador|vendedor"
  const naturalRolePattern = /([A-ZÃƒÆ’Ã‚ÂÃƒÆ’Ã¢â‚¬Â°ÃƒÆ’Ã‚ÂÃƒÆ’Ã¢â‚¬Å“ÃƒÆ’Ã…Â¡ÃƒÆ’Ã¢â‚¬Ëœ0-9][A-ZÃƒÆ’Ã‚ÂÃƒÆ’Ã¢â‚¬Â°ÃƒÆ’Ã‚ÂÃƒÆ’Ã¢â‚¬Å“ÃƒÆ’Ã…Â¡ÃƒÆ’Ã¢â‚¬Ëœ0-9\s.'"-]{3,}?)\s+es\s+(?:el\s+|la\s+)?(comprador(?:a)?|vendedor(?:a)?)\b/gi
  for (const match of source.matchAll(naturalRolePattern)) {
    assignRole(match[2] || '', match[1] || '')
  }

  // Variante: "comprador es NOMBRE" / "vendedor es NOMBRE"
  const invertedRolePattern = /\b(comprador(?:a)?|vendedor(?:a)?)\b\s*(?::|-|es)\s*([^\n\r.,;]+)/gi
  for (const match of source.matchAll(invertedRolePattern)) {
    assignRole(match[1] || '', match[2] || '')
  }

  return {
    comprador,
    vendedor,
  }
}

function sanitizePartyLabel(value: string): string | null {
  const cleaned = String(value || '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/^(el|la)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim()
  if (!cleaned || cleaned.length < 4) return null
  if (isGenericPartyReference(cleaned)) return null
  return cleaned
}

function isRoleKeyword(value: string | null | undefined): boolean {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  return /^(comprador|compradora|vendedor|vendedora|conyuge|esposo|esposa)$/.test(normalized)
}

function isGenericPartyReference(value: string): boolean {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return true
  if (/^\[?redacted\]?$/.test(normalized)) return true
  if (isRoleKeyword(normalized)) return true
  if (/^(el|la)\s+(comprador|compradora|vendedor|vendedora|conyuge|esposo|esposa|hombre|mujer)$/.test(normalized)) return true
  if (/(esposo|esposa|hombre|mujer|conyuge|comprador|vendedor).*(acta|matrimonio)/.test(normalized)) return true
  if (/(del|de la)\s+acta(\s+de\s+matrimonio)?/.test(normalized)) return true
  if (/(del|de la)\s+documento/.test(normalized)) return true
  if (/documento\s+que\s+estoy\s+subiendo/.test(normalized)) return true
  if (/^(el|la|este|esta|ese|esa|aquel|aquella)$/.test(normalized)) return true
  return false
}

function resolvePreferredNameFromReference(
  message: string,
  merged: Record<string, any>
): string | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  const spouses = Array.isArray((merged as any)?.conyuges_detectados)
    ? (merged as any).conyuges_detectados
        .map((p: any) => String(p?.nombre || p?.name || '').trim())
        .filter(Boolean)
    : []

  if (spouses.length > 0) {
    if (/\b(esposo|hombre)\b/.test(normalized)) {
      return spouses[0] || null
    }
    if (/\b(esposa|mujer)\b/.test(normalized)) {
      return spouses[1] || spouses[spouses.length - 1] || null
    }
  }

  if (/\bella\b/.test(normalized) && spouses.length > 1) {
    return spouses[1]
  }
  if (/\bel\b/.test(normalized) && spouses.length > 0) {
    return spouses[0]
  }

  return null
}

function promoteUnclassifiedToSpouseWhenMarriageContext(merged: Record<string, any>): void {
  const buyers = Array.isArray(merged?.compradores) ? merged.compradores : []
  if (buyers.length === 0) return

  const buyer0 = buyers[0] || {}
  const buyerName = String(
    buyer0?.persona_fisica?.nombre ||
      buyer0?.persona_moral?.denominacion_social ||
      ''
  ).trim()
  if (!buyerName) return

  const currentSpouseName = String(buyer0?.persona_fisica?.conyuge?.nombre || '').trim()
  if (currentSpouseName) return

  const uncategorized = Array.isArray(merged?.personas_detectadas_no_clasificadas)
    ? merged.personas_detectadas_no_clasificadas
    : []
  if (uncategorized.length !== 1) return

  const spousePool = Array.isArray(merged?.conyuges_detectados)
    ? merged.conyuges_detectados
    : []
  const hasMarriageSignal = spousePool.length > 0 || /acta\s+de\s+matrimonio/i.test(String(merged?._document_intent || ''))
  if (!hasMarriageSignal) return

  const candidateRaw = uncategorized[0]
  const candidateName = String(candidateRaw?.nombre || candidateRaw?.name || '').trim()
  if (!candidateName || isGenericPartyReference(candidateName)) return

  const norm = (v: unknown) =>
    String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  if (norm(candidateName) === norm(buyerName)) return

  const buyersNext = [...buyers]
  const c0 = { ...buyer0 }
  c0.party_id = c0.party_id || 'comprador_1'
  c0.tipo_persona = c0.tipo_persona || 'persona_fisica'
  c0.persona_fisica = {
    ...(c0.persona_fisica || {}),
    nombre: c0.persona_fisica?.nombre || buyerName,
    rfc: c0.persona_fisica?.rfc || null,
    curp: c0.persona_fisica?.curp || null,
    estado_civil: c0.persona_fisica?.estado_civil || 'casado',
    conyuge: {
      ...(c0.persona_fisica?.conyuge || {}),
      nombre: candidateName,
      rfc: c0.persona_fisica?.conyuge?.rfc || null,
      curp: c0.persona_fisica?.conyuge?.curp || null,
      participa: c0.persona_fisica?.conyuge?.participa ?? false,
    },
  }
  buyersNext[0] = c0
  merged.compradores = buyersNext
  merged.personas_detectadas_no_clasificadas = []
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
  const selectedScope = String(folios?.selection?.selected_scope || '').trim().toLowerCase()
  const folioConfirmed = Boolean(
    folios?.selection?.confirmed_by_user ||
    inmueble?.folio_real_confirmed
  )

  const countAttrs = (candidate: any): number => {
    const attrs = candidate?.attrs && typeof candidate.attrs === 'object' ? candidate.attrs : {}
    const keys = ['unidad', 'condominio', 'lote', 'manzana', 'fraccionamiento', 'colonia', 'superficie', 'ubicacion', 'partida']
    return keys.reduce((acc, key) => (attrs?.[key] ? acc + 1 : acc), 0)
  }

  let target: any = null
  if (selectedFolio) {
    const sameFolio = candidates.filter(
      (c: any) => String(c?.folio || '').replace(/\D/g, '') === selectedFolio
    )
    if (sameFolio.length > 0) {
      const scopeMatch =
        selectedScope
          ? sameFolio.filter((c: any) => String(c?.scope || '').toLowerCase() === selectedScope)
          : []
      const source = scopeMatch.length > 0 ? scopeMatch : sameFolio
      source.sort((a: any, b: any) => countAttrs(b) - countAttrs(a))
      target = source[0] || null
    }
  }

  if (!target) {
    const withAttrs = candidates.filter((c: any) => c?.attrs && Object.keys(c.attrs || {}).length > 0)
    if (withAttrs.length === 1) target = withAttrs[0]
  }

  if (!target) return next
  const attrs = (target.attrs || {}) as Record<string, any>
  const attrsDireccion = (attrs.direccion || {}) as Record<string, any>

  const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim())
  const hasUsefulAttrs = (() => {
    const keys = ['unidad', 'condominio', 'lote', 'manzana', 'fraccionamiento', 'superficie', 'ubicacion', 'partida']
    if (keys.some((k) => !isEmpty(attrs?.[k]))) return true
    return ['calle', 'numero', 'colonia', 'municipio', 'estado', 'codigo_postal'].some(
      (k) => !isEmpty(attrsDireccion?.[k])
    )
  })()
  const hasManyFolios = candidates.length > 1

  // Solo autoasignar folio cuando no hay ambigÃƒÆ’Ã‚Â¼edad clara.
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

  // Si el usuario ya confirmo folio, priorizar attrs del folio seleccionado y pisar valores ambiguos previos.
  if (folioConfirmed && selectedFolio && hasUsefulAttrs) {
    const fromCalle = String(attrsDireccion.calle || '').trim()
    const fromUbicacion = String(attrs.ubicacion || '').trim()
    direccion.calle = fromCalle || fromUbicacion || direccion.calle || null
    direccion.numero = !isEmpty(attrsDireccion.numero) ? attrsDireccion.numero : (direccion.numero || null)
    direccion.colonia = !isEmpty(attrsDireccion.colonia) ? attrsDireccion.colonia : (direccion.colonia || null)
    if (!isEmpty(attrsDireccion.municipio)) direccion.municipio = attrsDireccion.municipio
    if (!isEmpty(attrsDireccion.estado)) direccion.estado = attrsDireccion.estado
    direccion.codigo_postal = !isEmpty(attrsDireccion.codigo_postal) ? attrsDireccion.codigo_postal : (direccion.codigo_postal || null)

    if (!isEmpty(attrs.superficie)) {
      inmueble.superficie = attrs.superficie
    }

    if (!isEmpty(attrs.lote)) dc.lote = String(attrs.lote)
    if (!isEmpty(attrs.manzana)) dc.manzana = String(attrs.manzana)
    if (!isEmpty(attrs.fraccionamiento)) dc.fraccionamiento = String(attrs.fraccionamiento)
    if (!isEmpty(attrs.condominio)) dc.condominio = String(attrs.condominio)
    if (!isEmpty(attrs.unidad)) dc.unidad = String(attrs.unidad)
    if (!isEmpty(attrs.modulo)) dc.modulo = String(attrs.modulo)
  } else {
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
  }

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

  const marriedHint = /\b(espos[ao]s?|conyuge|c[oÃƒÆ’Ã‚Â³]nyuge|matrimonio)\b/.test(normalized)
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




