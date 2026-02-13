import { z } from 'zod'

export type TramiteExtractionType = 'preaviso'

export interface ExtractionInput {
  tramiteType: TramiteExtractionType
  documentId: string
  rawText?: string
  fileMeta?: Record<string, unknown>
  auditContext?: {
    userId?: string | null
    tramiteId?: string | null
    traceId?: string
  }
}

export interface ExtractionResult<TStructured = unknown> {
  structured: TStructured
  confidence?: number
  warnings?: string[]
  source_refs?: Array<{
    field: string
    evidence: string
  }>
  trace_id: string
}

export interface ExtractionPlugin<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  tramiteType: TramiteExtractionType
  outputSchema: TSchema
  buildSystemPrompt(input: ExtractionInput): string
  buildUserPrompt(input: ExtractionInput): string
  buildRepairPrompt(args: {
    input: ExtractionInput
    lastModelOutput: string
    validationErrors: string[]
  }): string
}

export interface ExtractionLLMResult {
  content: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  model?: string
}

export interface ExtractionLLMClient {
  complete(args: {
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
  }): Promise<ExtractionLLMResult>
}

export interface ExtractionAuditLogEntry {
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
}

export interface ExtractionAuditLogger {
  log(entry: ExtractionAuditLogEntry): Promise<void>
}

