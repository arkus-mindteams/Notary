export interface CaptureEngineInput {
  message: string
  currentStep?: string
  lastQuestionIntent?: string | null
  requiredMissing?: string[]
  detectedPeople?: string[]
  recentMessages?: Array<{ role: string; content: string }>
  pendingQuestions?: string[]
  collectedData?: Record<string, unknown>
}

export interface CaptureEngineResult {
  trace_id: string
  proposed_updates: Array<Record<string, unknown>>
  actions: Array<Record<string, unknown>>
  answer: string
}

export interface CaptureEngine {
  propose(input: CaptureEngineInput): Promise<CaptureEngineResult>
}
