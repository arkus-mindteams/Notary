import { z } from 'zod'

export type TramiteType = 'preaviso' | 'preventivo' | (string & {})

export interface TramitePluginSchemas {
  extractionSchema: z.ZodTypeAny
  stateSchema: z.ZodTypeAny
  proposedUpdateSchema: z.ZodTypeAny
}

export interface TramiteStepDefinition {
  id: string
  stateId?: string
  label: string
  isComplete: (state: unknown) => boolean
}

export interface TramiteKnowledgeScope {
  tramite: string
  scope: string
  tenantId?: string | null
}

export interface TramiteRetrievalConfig {
  topKDoc: number
  topKKnowledge: number
  knowledgeScope?: string
  additionalFilters?: Record<string, unknown>
}

export interface TramiteDocGenerationConfig {
  commitEndpoint: string
  defaultFormat: 'docx' | 'pdf'
  defaultTitle: string
  templates?: string[]
  baseMapping?: Record<string, unknown>
}

export interface BuildExtractionPromptInput {
  tramiteType: TramiteType
  documentId: string
  rawText?: string
  fileMeta?: Record<string, unknown>
}

export interface TramitePlugin {
  tramiteType: TramiteType
  schemas: TramitePluginSchemas
  stepsDefinition: () => TramiteStepDefinition[]
  knowledgeScope: (args?: { tenantId?: string | null; scope?: string }) => TramiteKnowledgeScope
  retrievalConfig: () => TramiteRetrievalConfig
  docGenerationConfig: () => TramiteDocGenerationConfig
  requiredFieldsForFinalize: () => string[]
  buildExtractionSystemPrompt: (input: BuildExtractionPromptInput) => string
  buildExtractionUserPrompt: (input: BuildExtractionPromptInput) => string
  buildExtractionRepairPrompt: (args: {
    input: BuildExtractionPromptInput
    lastModelOutput: string
    validationErrors: string[]
  }) => string
  getRequiredMissingFields?: (state: unknown) => string[]
  getBlockingReasons?: (state: unknown) => string[]
}

export interface TramiteWizardStateSnapshot {
  current_state: string
  state_status: Record<string, string>
  required_missing: string[]
  blocking_reasons: string[]
  wizard_state: {
    current_step: number
    total_steps: number
    steps: Array<{
      id: string
      state_id: string
      status: 'pending' | 'completed' | 'blocked'
    }>
    can_finalize: boolean
  }
}
