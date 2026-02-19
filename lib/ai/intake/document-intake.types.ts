import { z } from 'zod'

export const DOCUMENT_TYPE_VALUES = [
  'INE',
  'COMPROBANTE_DOMICILIO',
  'ESTADO_CUENTA',
  'RFC',
  'CURP',
  'ACTA_NACIMIENTO',
  'PASAPORTE',
  'LICENCIA',
  'OTRO',
] as const

export type DocumentDetectedType = (typeof DOCUMENT_TYPE_VALUES)[number]

export const documentEvidenceSchema = z.object({
  label: z.string().trim().min(1),
  snippet: z.string().trim().min(1).max(160),
  pageNumber: z.number().int().min(1),
  bbox: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .partial()
    .optional()
    .nullable(),
})

export const documentIntakePageSchema = z.object({
  pageNumber: z.number().int().min(1),
  text: z.string(),
  evidence: z.array(documentEvidenceSchema).default([]),
})

export const documentIntakeFactSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.object({
    pageNumber: z.number().int().min(1),
    snippet: z.string().trim().min(1).max(160),
  }),
})

export const documentIntakeItemSchema = z.object({
  documentId: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  detectedType: z.enum(DOCUMENT_TYPE_VALUES),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
  summary: z.array(z.string()).min(2).max(6),
  pages: z.array(documentIntakePageSchema).min(1),
  keyFields: z.record(z.any()).default({}),
  facts: z.array(documentIntakeFactSchema).default([]),
  raw: z.any().optional(),
})

export const documentIntakeProviderResponseSchema = z.object({
  traceId: z.string().trim().min(1),
  documents: z.array(documentIntakeItemSchema).min(1),
})

export type DocumentIntakeItem = z.infer<typeof documentIntakeItemSchema>
export type DocumentIntakePage = z.infer<typeof documentIntakePageSchema>
export type DocumentIntakeFact = z.infer<typeof documentIntakeFactSchema>
export type DocumentIntakeProviderResponse = z.infer<typeof documentIntakeProviderResponseSchema>

export type FileInput = {
  documentId: string
  filename: string
  mimeType: string
  file: File
}

export type DocumentIntakeOptions = {
  maxPages?: number
  storeChunks?: boolean
  tramiteId?: string | null
  sessionId?: string | null
}

export type RuleMergedFactValue = {
  value: string
  sources: Array<{ documentId: string; pageNumber: number; snippet: string; confidence: number }>
}

export type RuleConflict = {
  key: string
  values: string[]
  sources: Array<{ documentId: string; value: string; pageNumber: number; snippet: string }>
}

export type RuleSuggestion = {
  message: string
  sources: string[]
}

export type RuleResult = {
  mergedFacts: Record<string, RuleMergedFactValue>
  conflicts: RuleConflict[]
  suggestions: RuleSuggestion[]
}

export type DocumentIntakeBatchResult = {
  traceId: string
  documents: DocumentIntakeItem[]
  rules: RuleResult
}

