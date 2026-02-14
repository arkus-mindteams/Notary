import { createHash, randomUUID } from 'crypto'
import type { ZodIssue } from 'zod'
import { ActivityLogService } from '@/lib/services/activity-log-service'
import { PreavisoExtractionPlugin } from '@/lib/ai/extraction/plugins/preaviso-extraction-plugin'
import type {
  ExtractionAuditLogger,
  ExtractionInput,
  ExtractionLLMClient,
  ExtractionPlugin,
  ExtractionResult,
  TramiteExtractionType,
} from '@/lib/ai/extraction/types'

const MAX_ATTEMPTS = 3

class OpenAIExtractionClient implements ExtractionLLMClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_MODEL || 'gpt-4o'
  }

  async complete(args: {
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
  }) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      ...(this.model.includes('o1') || this.model.includes('o3')
        ? {}
        : { response_format: { type: 'json_object' }, temperature: 0 }),
      ...(this.model.includes('gpt-4') || this.model.includes('gpt-5') || this.model.includes('o1') || this.model.includes('o3')
        ? { max_completion_tokens: args.maxTokens || 3000 }
        : { max_tokens: args.maxTokens || 3000 }),
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${errData?.error?.message || 'Unknown error'}`)
    }

    const data = await resp.json()
    return {
      content: String(data?.choices?.[0]?.message?.content || ''),
      usage: data?.usage,
      model: this.model,
    }
  }
}

class ActivityLogExtractionAuditLogger implements ExtractionAuditLogger {
  async log(entry: {
    traceId: string
    tramiteType: TramiteExtractionType
    documentId: string
    attempt: number
    status: 'retry' | 'success' | 'error'
    reason?: string
    model?: string
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const userId = String(entry.metadata?.user_id || 'system')
    await ActivityLogService.logDocumentExtraction({
      userId,
      tramiteId: entry.metadata?.tramite_id ? String(entry.metadata?.tramite_id) : undefined,
      documentoId: entry.documentId,
      traceId: entry.traceId,
      status: entry.status,
      attempt: entry.attempt,
      reason: entry.reason,
      actionType: 'document_extraction',
      metadata: {
        model: entry.model,
        tramite_type: entry.tramiteType,
        usage: entry.usage || null,
        ...(entry.metadata || {}),
      },
    })
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

export class ExtractionAgent {
  private readonly plugins = new Map<TramiteExtractionType, ExtractionPlugin>()
  private readonly llmClient: ExtractionLLMClient
  private readonly auditLogger: ExtractionAuditLogger

  constructor(args?: {
    llmClient?: ExtractionLLMClient
    auditLogger?: ExtractionAuditLogger
  }) {
    this.llmClient = args?.llmClient || new OpenAIExtractionClient()
    this.auditLogger = args?.auditLogger || new ActivityLogExtractionAuditLogger()
    this.registerPlugin(new PreavisoExtractionPlugin())
  }

  registerPlugin(plugin: ExtractionPlugin) {
    this.plugins.set(plugin.tramiteType, plugin)
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const plugin = this.plugins.get(input.tramiteType)
    if (!plugin) {
      throw new Error(`No extraction plugin registered for tramite ${input.tramiteType}`)
    }

    const traceId = input.auditContext?.traceId || randomUUID()
    const rawText = String(input.rawText || '').trim()
    if (!rawText) {
      throw new Error('No hay texto disponible para extraer')
    }

    const metadataBase = {
      user_id: input.auditContext?.userId || null,
      tramite_id: input.auditContext?.tramiteId || null,
      text_length: rawText.length,
      text_hash: createHash('sha256').update(rawText).digest('hex'),
      file_meta: input.fileMeta || {},
    }

    let lastModelOutput = ''
    let lastValidationErrors: string[] = []

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const isRepair = attempt > 1
      const systemPrompt = plugin.buildSystemPrompt(input)
      const userPrompt = isRepair
        ? plugin.buildRepairPrompt({
          input,
          lastModelOutput,
          validationErrors: lastValidationErrors,
        })
        : plugin.buildUserPrompt(input)

      const llmResult = await this.llmClient.complete({
        systemPrompt,
        userPrompt,
        maxTokens: 3000,
      })

      lastModelOutput = llmResult.content
      const parsed = this.parseJson(llmResult.content)
      if (!parsed.ok) {
        lastValidationErrors = [parsed.error]
        await this.auditLogger.log({
          traceId,
          tramiteType: input.tramiteType,
          documentId: input.documentId,
          attempt,
          status: attempt < MAX_ATTEMPTS ? 'retry' : 'error',
          reason: parsed.error,
          model: llmResult.model,
          usage: llmResult.usage,
          metadata: metadataBase,
        })
        if (attempt < MAX_ATTEMPTS) {
          continue
        }
        throw new AIOutputInvalidError('No se pudo parsear JSON de salida de IA', {
          trace_id: traceId,
          attempts: attempt,
          cause: parsed.error,
        })
      }

      const validation = plugin.outputSchema.safeParse(parsed.value)
      if (!validation.success) {
        lastValidationErrors = this.buildValidationErrors(validation.error.issues)
        await this.auditLogger.log({
          traceId,
          tramiteType: input.tramiteType,
          documentId: input.documentId,
          attempt,
          status: attempt < MAX_ATTEMPTS ? 'retry' : 'error',
          reason: lastValidationErrors.join(' | '),
          model: llmResult.model,
          usage: llmResult.usage,
          metadata: metadataBase,
        })
        if (attempt < MAX_ATTEMPTS) {
          continue
        }
        throw new AIOutputInvalidError('JSON de IA invalido segun schema', {
          trace_id: traceId,
          attempts: attempt,
          issues: lastValidationErrors,
        })
      }

      const data = validation.data as any
      await this.auditLogger.log({
        traceId,
        tramiteType: input.tramiteType,
        documentId: input.documentId,
        attempt,
        status: 'success',
        model: llmResult.model,
        usage: llmResult.usage,
        metadata: metadataBase,
      })

      return {
        structured: data,
        confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        source_refs: Array.isArray(data.source_refs) ? data.source_refs : [],
        trace_id: traceId,
      }
    }

    throw new AIOutputInvalidError('No se pudo extraer informacion estructurada', {
      trace_id: traceId,
      attempts: MAX_ATTEMPTS,
    })
  }

  private parseJson(content: string): { ok: true; value: unknown } | { ok: false; error: string } {
    const text = String(content || '').trim()
    if (!text) return { ok: false, error: 'Respuesta vacia de IA' }

    let candidate = text
    if (candidate.startsWith('```')) {
      const match = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) candidate = match[1]
    }

    try {
      return { ok: true, value: JSON.parse(candidate) }
    } catch (error: any) {
      return { ok: false, error: `JSON.parse fallo: ${error?.message || 'invalid_json'}` }
    }
  }

  private buildValidationErrors(issues: ZodIssue[]): string[] {
    return issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
  }
}

