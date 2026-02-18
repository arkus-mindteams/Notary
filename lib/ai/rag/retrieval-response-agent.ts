import { createHash } from 'crypto'
import { z } from 'zod'
import { ContextBuilder } from '@/lib/ai/rag/context-builder'
import { RagAuditLogService } from '@/lib/ai/rag/rag-audit-log-service'
import type { ContextPack, RAGPluginType } from '@/lib/ai/rag/types'

const responseSchema = z.object({
  answer: z.string().trim().min(1),
  citations: z.array(z.string().trim()).default([]),
  suggested_updates: z.array(z.record(z.unknown())).optional(),
})

type LLMResponse = {
  content: string
  model: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

type LLMClient = {
  complete: (args: {
    systemPrompt: string
    userPrompt: string
  }) => Promise<LLMResponse>
}

class OpenAIRAGClient implements LLMClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_MODEL || 'gpt-4o'
  }

  async complete(args: {
    systemPrompt: string
    userPrompt: string
  }): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      ...(this.model.includes('o1') || this.model.includes('o3') || this.model.includes('gpt-5')
        ? {}
        : {
            response_format: { type: 'json_object' },
            temperature: 0,
          }),
      ...(this.model.includes('gpt-4') || this.model.includes('gpt-5') || this.model.includes('o1') || this.model.includes('o3')
        ? { max_completion_tokens: 900 }
        : { max_tokens: 900 }),
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${errorData?.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    return {
      content: extractMessageContent(data?.choices?.[0]?.message),
      usage: data?.usage || undefined,
      model: this.model,
    }
  }
}

export class AIOutputInvalidError extends Error {
  code = 'AI_OUTPUT_INVALID'
  details: Record<string, unknown>

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.details = details
  }
}

type AgentDeps = {
  contextBuilder: ContextBuilder
  llmClient: LLMClient
  logTurn: (args: {
    userAuthId: string
    chatId: string
    tramiteId: string
    traceId: string
    model: string
    promptHash: string
    contextHash: string
    retrievedDocumentChunkIds: string[]
    retrievedKnowledgeChunkIds: string[]
    latencies: { totalMs: number; retrievalMs: number; llmMs: number }
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
  }) => Promise<void>
}

const defaultDeps: AgentDeps = {
  contextBuilder: new ContextBuilder(),
  llmClient: new OpenAIRAGClient(),
  logTurn: RagAuditLogService.logTurn,
}

export class RetrievalResponseAgent {
  constructor(private readonly deps: AgentDeps = defaultDeps) {}

  async respond(args: {
    chatId: string
    tramiteId: string
    userMessage: string
    userAuthId: string
    pluginType?: RAGPluginType
  }): Promise<{
    answer: string
    citations: string[]
    suggested_updates?: Record<string, unknown>[]
    trace_id: string
    audit?: {
      retrieved_document_chunk_ids: string[]
      retrieved_knowledge_chunk_ids: string[]
      latencies: { totalMs: number; retrievalMs: number; llmMs: number }
    }
  }> {
    const startedAt = Date.now()

    const retrievalStartedAt = Date.now()
    const context = await this.deps.contextBuilder.build({
      chatId: args.chatId,
      tramiteId: args.tramiteId,
      userQuery: args.userMessage,
      pluginType: args.pluginType || 'preaviso',
    })
    const retrievalMs = Date.now() - retrievalStartedAt

    const contextJson = JSON.stringify(context)
    const contextHash = sha256(contextJson)
    const allowedCitationIds = new Set<string>([
      ...context.retrieved_document_chunks.map((x) => x.id),
      ...context.retrieved_knowledge_chunks.map((x) => x.id),
    ])

    const traceId = context.context_metadata.trace_id
    if (allowedCitationIds.size === 0) {
      const answer = 'No encontré evidencia relevante en documentos o base de conocimiento para responder con certeza.'
      await this.deps.logTurn({
        userAuthId: args.userAuthId,
        chatId: args.chatId,
        tramiteId: args.tramiteId,
        traceId,
        model: 'fallback-no-context',
        promptHash: sha256('fallback-no-context'),
        contextHash,
        retrievedDocumentChunkIds: [],
        retrievedKnowledgeChunkIds: [],
        latencies: {
          totalMs: Date.now() - startedAt,
          retrievalMs,
          llmMs: 0,
        },
        usage: null,
      })
      return { answer, citations: [], trace_id: traceId, suggested_updates: [] }
    }

    const systemPrompt = this.buildSystemPrompt()
    const userPrompt = this.buildUserPrompt(context, args.userMessage)
    const promptHash = sha256(`${systemPrompt}\n\n${userPrompt}`)

    const llmStartedAt = Date.now()
    const llm = await this.deps.llmClient.complete({
      systemPrompt,
      userPrompt,
    })
    const llmMs = Date.now() - llmStartedAt

    let parsed: z.infer<typeof responseSchema>
    try {
      parsed = this.parseAndValidate(llm.content, traceId)
    } catch (error) {
      console.warn('[RetrievalResponseAgent] Invalid/empty LLM JSON output, using safe fallback', {
        trace_id: traceId,
        model: llm.model,
        error: error instanceof Error ? error.message : 'unknown_error',
      })
      parsed = {
        answer: 'No encontré evidencia relevante en documentos o base de conocimiento para responder con certeza.',
        citations: [],
        suggested_updates: [],
      }
    }
    const citations = parsed.citations.filter((id) => allowedCitationIds.has(id))

    await this.deps.logTurn({
      userAuthId: args.userAuthId,
      chatId: args.chatId,
      tramiteId: args.tramiteId,
      traceId,
      model: llm.model,
      promptHash,
      contextHash,
      retrievedDocumentChunkIds: context.retrieved_document_chunks.map((x) => x.id),
      retrievedKnowledgeChunkIds: context.retrieved_knowledge_chunks.map((x) => x.id),
      latencies: {
        totalMs: Date.now() - startedAt,
        retrievalMs,
        llmMs,
      },
      usage: llm.usage || null,
    })

    return {
      answer: parsed.answer,
      citations,
      suggested_updates: parsed.suggested_updates || [],
      trace_id: traceId,
      audit: {
        retrieved_document_chunk_ids: context.retrieved_document_chunks.map((x) => x.id),
        retrieved_knowledge_chunk_ids: context.retrieved_knowledge_chunks.map((x) => x.id),
        latencies: {
          totalMs: Date.now() - startedAt,
          retrievalMs,
          llmMs,
        },
      },
    }
  }

  private buildSystemPrompt(): string {
    return [
      'Eres un asistente notarial que responde solo con evidencia del contexto proporcionado.',
      'No inventes hechos ni reglas legales.',
      'Si falta evidencia suficiente, dilo explícitamente.',
      'Devuelve SOLO un JSON con: answer (string), citations (string[]), suggested_updates (array opcional).',
      'suggested_updates solo propone cambios, nunca confirma mutaciones de estado.',
    ].join(' ')
  }

  private buildUserPrompt(context: ContextPack, userMessage: string): string {
    return JSON.stringify(
      {
        user_query: userMessage,
        tramite_state: context.tramite_state,
        retrieved_document_chunks: context.retrieved_document_chunks.map((c) => ({
          id: c.id,
          documento_id: c.documento_id,
          page_number: c.page_number,
          chunk_index: c.chunk_index,
          snippet: c.snippet,
        })),
        retrieved_knowledge_chunks: context.retrieved_knowledge_chunks.map((c) => ({
          id: c.id,
          chunk_key: c.chunk_key,
          title: c.title,
          version: c.version,
          snippet: c.snippet,
        })),
        recent_messages: context.recent_messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
        response_format: {
          answer: 'string',
          citations: ['chunk-or-knowledge-id'],
          suggested_updates: [{ key: 'field.path', value: 'proposed-value', reason: 'why' }],
        },
      },
      null,
      0
    )
  }

  private parseAndValidate(content: string, traceId: string) {
    let candidate = String(content || '').trim()
    if (!candidate) {
      throw new AIOutputInvalidError('Respuesta vacia de IA', { trace_id: traceId })
    }
    if (candidate.startsWith('```')) {
      const match = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) {
        candidate = match[1]
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch (error: any) {
      throw new AIOutputInvalidError('No se pudo parsear JSON de IA', {
        trace_id: traceId,
        cause: error?.message || 'invalid_json',
      })
    }

    const validation = responseSchema.safeParse(parsed)
    if (!validation.success) {
      throw new AIOutputInvalidError('JSON de IA invalido segun schema', {
        trace_id: traceId,
        issues: validation.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    return validation.data
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function extractMessageContent(message: any): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((part: any) => {
        if (typeof part === 'string') return part
        if (part && typeof part.text === 'string') return part.text
        if (part && typeof part.content === 'string') return part.content
        return ''
      })
      .filter(Boolean)
    return parts.join('\n').trim()
  }
  if (typeof message.refusal === 'string') return message.refusal
  return ''
}

