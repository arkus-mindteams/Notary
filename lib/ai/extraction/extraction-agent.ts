import { createHash, randomUUID } from 'crypto'
import type { ZodIssue } from 'zod'
import { ActivityLogService } from '@/lib/services/activity-log-service'
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import type {
  ExtractionAuditLogger,
  ExtractionInput,
  ExtractionLLMClient,
  ExtractionResult,
  TramiteExtractionType,
} from '@/lib/ai/extraction/types'

const MAX_ATTEMPTS = 3
const EXTRACTION_DEBUG = process.env.EXTRACTION_DEBUG === '1'
const EXTRACTION_DEBUG_MAX_CHARS = Number(process.env.EXTRACTION_DEBUG_MAX_CHARS || 12000)

function resolveExtractionModel(): string {
  return process.env.OPENAI_EXTRACTION_MODEL || process.env.OPENAI_DOC_MODEL || process.env.OPENAI_MODEL || 'gpt-4o'
}

function isGpt5Model(model: string): boolean {
  return String(model || '').toLowerCase().includes('gpt-5')
}

function clipForDebug(value: string): string {
  const text = String(value || '')
  if (text.length <= EXTRACTION_DEBUG_MAX_CHARS) return text
  return `${text.slice(0, EXTRACTION_DEBUG_MAX_CHARS)}\n...[truncated ${text.length - EXTRACTION_DEBUG_MAX_CHARS} chars]`
}

class OpenAIExtractionClient implements ExtractionLLMClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = resolveExtractionModel()
  }

  async complete(args: {
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
  }) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const primary = await this.requestCompletion(this.model, args)
    if (primary.content.trim()) return primary

    const fallbackModel = process.env.OPENAI_EXTRACTION_FALLBACK_MODEL || 'gpt-4o-mini'
    const shouldFallback =
      isGpt5Model(this.model) &&
      primary.finish_reason === 'length' &&
      fallbackModel &&
      fallbackModel !== this.model

    if (!shouldFallback) return primary
    const fallback = await this.requestCompletion(fallbackModel, {
      ...args,
      maxTokens: Math.min(Number(args.maxTokens || 3000), 3500),
    })
    return fallback.content.trim() ? fallback : primary
  }

  private async requestCompletion(
    model: string,
    args: { systemPrompt: string; userPrompt: string; maxTokens?: number }
  ) {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      ...(model.includes('o1') || model.includes('o3') || model.includes('gpt-5')
        ? {}
        : {
            response_format: { type: 'json_object' },
            temperature: 0,
          }),
      ...(model.includes('gpt-4') || model.includes('gpt-5') || model.includes('o1') || model.includes('o3')
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
      content: extractMessageContent(data?.choices?.[0]?.message),
      finish_reason: String(data?.choices?.[0]?.finish_reason || ''),
      usage: data?.usage,
      model,
    }
  }
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
  private readonly llmClient: ExtractionLLMClient
  private readonly auditLogger: ExtractionAuditLogger
  private readonly pluginRegistry: PluginRegistry

  constructor(args?: {
    llmClient?: ExtractionLLMClient
    auditLogger?: ExtractionAuditLogger
    pluginRegistry?: PluginRegistry
  }) {
    this.llmClient = args?.llmClient || new OpenAIExtractionClient()
    this.auditLogger = args?.auditLogger || new ActivityLogExtractionAuditLogger()
    this.pluginRegistry = args?.pluginRegistry || PluginRegistry.getInstance()
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const plugin = this.pluginRegistry.get(input.tramiteType)

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
      const systemPrompt = plugin.buildExtractionSystemPrompt(input)
      const userPrompt = isRepair
        ? plugin.buildExtractionRepairPrompt({
          input,
          lastModelOutput,
          validationErrors: lastValidationErrors,
        })
        : plugin.buildExtractionUserPrompt(input)

      if (EXTRACTION_DEBUG) {
        console.log('[ExtractionAgent][request]', {
          trace_id: traceId,
          document_id: input.documentId,
          attempt,
          is_repair: isRepair,
          model: resolveExtractionModel(),
          text_length: rawText.length,
          system_prompt: clipForDebug(systemPrompt),
          user_prompt: clipForDebug(userPrompt),
        })
      }

      const baseMaxTokens = Number(process.env.OPENAI_EXTRACTION_MAX_TOKENS || 3000)
      const modelName = resolveExtractionModel()
      const attemptMaxTokens = isGpt5Model(modelName)
        ? Math.min(baseMaxTokens + (attempt - 1) * 1200, 6500)
        : baseMaxTokens

      const llmResult = await this.llmClient.complete({
        systemPrompt,
        userPrompt,
        maxTokens: attemptMaxTokens,
      })

      if (EXTRACTION_DEBUG) {
        console.log('[ExtractionAgent][response]', {
          trace_id: traceId,
          document_id: input.documentId,
          attempt,
          model: llmResult.model || modelName,
          finish_reason: llmResult.finish_reason || null,
          max_tokens: attemptMaxTokens,
          usage: llmResult.usage || null,
          content: clipForDebug(llmResult.content),
        })
      }

      lastModelOutput = llmResult.content
      const parsed = this.parseJson(llmResult.content)
      if (!parsed.ok) {
        const finishReason = String(llmResult.finish_reason || '').trim()
        const reason = parsed.error === 'Respuesta vacia de IA' && finishReason === 'length'
          ? `${parsed.error} (finish_reason=length, max_tokens=${attemptMaxTokens})`
          : parsed.error
        lastValidationErrors = [reason]
        await this.auditLogger.log({
          traceId,
          tramiteType: input.tramiteType,
          documentId: input.documentId,
          attempt,
          status: attempt < MAX_ATTEMPTS ? 'retry' : 'error',
          reason,
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

      const validation = plugin.schemas.extractionSchema.safeParse(parsed.value)
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

    const rebuilt = this.rebuildFromJsConcatenation(candidate)
    if (rebuilt) candidate = rebuilt

    const firstBrace = candidate.indexOf('{')
    const lastBrace = candidate.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1).trim()
    }

    try {
      return { ok: true, value: JSON.parse(candidate) }
    } catch (error: any) {
      return { ok: false, error: `JSON.parse fallo: ${error?.message || 'invalid_json'}` }
    }
  }

  private rebuildFromJsConcatenation(raw: string): string | null {
    const text = String(raw || '').trim()
    if (!text.includes('+')) return null
    const matches = text.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)
    if (!matches || matches.length === 0) return null
    const rebuilt = matches.map((m) => this.decodeJsQuotedLiteral(m)).join('')
    return rebuilt.trim() || null
  }

  private decodeJsQuotedLiteral(literal: string): string {
    if (!literal || literal.length < 2) return literal
    const quote = literal[0]
    const inner = literal.slice(1, -1)
    if (quote === '"') {
      try {
        return JSON.parse(literal)
      } catch {
        return inner
      }
    }
    return inner
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
  }

  private buildValidationErrors(issues: ZodIssue[]): string[] {
    return issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
  }
}

