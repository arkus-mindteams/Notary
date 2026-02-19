import type { DocumentIntakeProviderResponse, FileInput } from '@/lib/ai/intake/document-intake.types'

export type VisionDocumentProviderInput = {
  files: FileInput[]
  systemPrompt: string
  userPrompt: string
  traceId: string
}

export type VisionDocumentProviderOutput = {
  result: DocumentIntakeProviderResponse
  rawText: string
  rawResponse?: unknown
  model?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

export interface VisionDocumentProvider {
  processDocuments(input: VisionDocumentProviderInput): Promise<VisionDocumentProviderOutput>
}

