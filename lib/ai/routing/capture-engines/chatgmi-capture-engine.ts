import { GMIIndependentCaptureFlow } from '@/lib/ai/routing/gmi-independent-capture-flow'
import type { CaptureEngine, CaptureEngineInput, CaptureEngineResult } from '@/lib/ai/routing/capture-engines/types'

export class ChatGMICaptureEngine implements CaptureEngine {
  constructor(private readonly flow: GMIIndependentCaptureFlow = new GMIIndependentCaptureFlow()) {}

  async propose(input: CaptureEngineInput): Promise<CaptureEngineResult> {
    const result = await this.flow.process({
      message: input.message,
      currentStep: input.currentStep,
      lastQuestionIntent: input.lastQuestionIntent,
      requiredMissing: input.requiredMissing,
      pendingQuestions: input.pendingQuestions,
      collectedData: input.collectedData,
      detectedPeople: input.detectedPeople,
      recentMessages: input.recentMessages,
    })
    return {
      trace_id: result.trace_id,
      proposed_updates: result.proposed_updates,
      actions: result.actions,
      answer: result.answer,
    }
  }
}
