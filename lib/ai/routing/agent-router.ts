import { randomUUID } from 'crypto'
import { z } from 'zod'
import { RetrievalResponseAgent } from '@/lib/ai/rag/retrieval-response-agent'
import { ExtractionAgent } from '@/lib/ai/extraction/extraction-agent'
import { IntentClassifier } from '@/lib/ai/routing/intent-classifier'
import { ProposeStateUpdateAgent } from '@/lib/ai/routing/propose-state-update-agent'
import { DocumentGenerationAgent } from '@/lib/ai/routing/document-generation-agent'
import { RouterAuditLogService } from '@/lib/ai/routing/router-audit-log-service'
import type { Intent, RouterResult, RouterUIContext } from '@/lib/ai/routing/types'

const extractionContextSchema = z.object({
  documentId: z.string().trim().min(1),
  rawText: z.string().trim().min(1),
  fileMeta: z.record(z.unknown()).optional(),
  tramiteType: z.literal('preaviso').optional(),
})

type RouterDeps = {
  intentClassifier: IntentClassifier
  retrievalAgent: RetrievalResponseAgent
  extractionAgent: ExtractionAgent
  proposeStateUpdateAgent: ProposeStateUpdateAgent
  documentGenerationAgent: DocumentGenerationAgent
  auditLogger: typeof RouterAuditLogService.logRoute
  now: () => number
  newTraceId: () => string
}

const defaultDeps: RouterDeps = {
  intentClassifier: new IntentClassifier(),
  retrievalAgent: new RetrievalResponseAgent(),
  extractionAgent: new ExtractionAgent(),
  proposeStateUpdateAgent: new ProposeStateUpdateAgent(),
  documentGenerationAgent: new DocumentGenerationAgent(),
  auditLogger: RouterAuditLogService.logRoute,
  now: () => Date.now(),
  newTraceId: () => randomUUID(),
}

export class AgentRouter {
  constructor(private readonly deps: RouterDeps = defaultDeps) {}

  async route(args: {
    tramiteId: string
    chatId: string
    message: string
    uiContext?: RouterUIContext
    userAuthId: string
  }): Promise<RouterResult> {
    const startedAt = this.deps.now()
    let traceId = this.deps.newTraceId()
    let intent: Intent = 'UNKNOWN'
    let agentUsed: RouterResult['agent_used'] = 'RetrievalResponseAgent'
    const stageErrors: Record<string, unknown> = {}
    const stageLatencies: Record<string, unknown> = {}
    let topKIds: string[] = []
    let answer = ''

    try {
      const classifyStart = this.deps.now()
      try {
        intent = await this.deps.intentClassifier.classify({
          message: args.message,
          hasDocument: args.uiContext?.hasDocument,
          uiAction: args.uiContext?.uiAction,
          currentStep: args.uiContext?.currentStep,
        })
      } catch (error: any) {
        stageErrors.classify = error?.message || 'classification_error'
        intent = 'UNKNOWN'
      }
      stageLatencies.classify_ms = this.deps.now() - classifyStart

      if (intent === 'EXTRACT_DOCUMENT') {
        agentUsed = 'ExtractionAgent'
        const extractionInput = extractionContextSchema.safeParse({
          documentId: args.uiContext?.documentId,
          rawText: args.uiContext?.rawText,
          fileMeta: args.uiContext?.fileMeta || {},
          tramiteType: args.uiContext?.tramiteType || 'preaviso',
        })

        if (!extractionInput.success) {
          traceId = this.deps.newTraceId()
          return {
            intent,
            agent_used: agentUsed,
            actions: [
              {
                type: 'request_missing_field',
                field: 'uiContext.documentId|uiContext.rawText',
                reason: 'Se requiere documentId y rawText para extraer',
              },
            ],
            trace_id: traceId,
          }
        }

        const agentStart = this.deps.now()
        const extraction = await this.deps.extractionAgent.extract({
          documentId: extractionInput.data.documentId,
          rawText: extractionInput.data.rawText,
          tramiteType: extractionInput.data.tramiteType || 'preaviso',
          fileMeta: extractionInput.data.fileMeta,
          auditContext: {
            userId: args.userAuthId,
            tramiteId: args.tramiteId,
          },
        })
        stageLatencies.agent_ms = this.deps.now() - agentStart
        traceId = extraction.trace_id
        answer = 'Extraccion completada. Revisa structured y confirma antes de aplicar cambios.'
        return {
          intent,
          agent_used: agentUsed,
          answer,
          actions: [{ type: 'review_extraction' }],
          proposed_updates: [],
          trace_id: traceId,
        }
      }

      if (intent === 'UPDATE_STATE') {
        agentUsed = 'ProposeStateUpdateAgent'
        const agentStart = this.deps.now()
        const proposal = await this.deps.proposeStateUpdateAgent.propose({
          message: args.message,
          currentStep: args.uiContext?.currentStep,
        })
        stageLatencies.agent_ms = this.deps.now() - agentStart
        traceId = proposal.trace_id
        answer = proposal.answer
        return {
          intent,
          agent_used: agentUsed,
          answer: proposal.answer,
          proposed_updates: proposal.proposed_updates,
          actions: proposal.actions,
          trace_id: proposal.trace_id,
        }
      }

      if (intent === 'GENERATE_DOCUMENT') {
        agentUsed = 'DocumentGenerationAgent'
        const agentStart = this.deps.now()
        const generation = await this.deps.documentGenerationAgent.prepare({
          tramiteId: args.tramiteId,
          outputFormat: args.uiContext?.outputFormat,
          documentTitle: args.uiContext?.documentTitle,
        })
        stageLatencies.agent_ms = this.deps.now() - agentStart
        traceId = generation.trace_id
        answer = generation.answer
        return {
          intent,
          agent_used: agentUsed,
          answer: generation.answer,
          actions: generation.actions,
          trace_id: generation.trace_id,
        }
      }

      const retrievalStart = this.deps.now()
      const retrieval = await this.deps.retrievalAgent.respond({
        chatId: args.chatId,
        tramiteId: args.tramiteId,
        userMessage: args.message,
        userAuthId: args.userAuthId,
        pluginType: args.uiContext?.pluginType || 'preaviso',
      })
      stageLatencies.retrieve_ms = this.deps.now() - retrievalStart
      traceId = retrieval.trace_id
      const retrievedDocIds = retrieval.audit?.retrieved_document_chunk_ids || []
      const retrievedKnowledgeIds = retrieval.audit?.retrieved_knowledge_chunk_ids || []
      topKIds = [...retrievedDocIds, ...retrievedKnowledgeIds]
      if (topKIds.length === 0) {
        topKIds = retrieval.citations || []
      }
      if (retrieval.audit?.latencies) {
        stageLatencies.retrieval_ms = retrieval.audit.latencies.retrievalMs
        stageLatencies.llm_ms = retrieval.audit.latencies.llmMs
      }
      answer = retrieval.answer

      if (intent === 'UNKNOWN') {
        const clarification =
          'Para continuar con precision, confirma si quieres: resolver una duda, extraer un documento, actualizar datos, o generar el documento final.'
        return {
          intent,
          agent_used: 'RetrievalResponseAgent',
          answer: `${retrieval.answer}\n\n${clarification}`.trim(),
          citations: retrieval.citations,
          actions: [{ type: 'request_clarification' }],
          trace_id: retrieval.trace_id,
        }
      }

      return {
        intent: 'QNA',
        agent_used: 'RetrievalResponseAgent',
        answer: retrieval.answer,
        citations: retrieval.citations,
        trace_id: retrieval.trace_id,
      }
    } catch (error: any) {
      stageErrors.execute = error?.message || 'routing_execution_error'
      return {
        intent: intent || 'UNKNOWN',
        agent_used: agentUsed,
        answer: 'No se pudo completar la orquestacion de agentes en este momento.',
        actions: [{ type: 'retry' }],
        trace_id: traceId,
      }
    } finally {
      stageLatencies.total_ms = this.deps.now() - startedAt
      await this.deps.auditLogger({
        userAuthId: args.userAuthId,
        chatId: args.chatId,
        tramiteId: args.tramiteId,
        traceId,
        intent,
        agentUsed,
        message: args.message,
        uiContext: args.uiContext || {},
        answer,
        topKIds,
        errors: stageErrors,
        latencies: stageLatencies,
      })
    }
  }
}
