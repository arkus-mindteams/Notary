export type Intent = 'QNA' | 'EXTRACT_DOCUMENT' | 'UPDATE_STATE' | 'GENERATE_DOCUMENT' | 'UNKNOWN'

export type AgentUsed =
  | 'RetrievalResponseAgent'
  | 'ExtractionAgent'
  | 'ProposeStateUpdateAgent'
  | 'DocumentGenerationAgent'

export interface RouterUIContext {
  hasDocument?: boolean
  uiAction?: string
  currentStep?: string
  lastQuestionIntent?: string | null
  detectedPeople?: string[]
  recentMessages?: Array<{ role: string; content: string }>
  pluginType?: string
  documentId?: string
  rawText?: string
  fileMeta?: Record<string, unknown>
  tramiteType?: string
  outputFormat?: 'docx' | 'pdf'
  documentTitle?: string
}

export interface ClassifyIntentInput {
  message: string
  hasDocument?: boolean
  uiAction?: string
  currentStep?: string
}

export interface RouterResult {
  intent: Intent
  agent_used: AgentUsed
  answer?: string
  citations?: string[]
  proposed_updates?: Array<Record<string, unknown>>
  actions?: Array<Record<string, unknown>>
  trace_id: string
}

