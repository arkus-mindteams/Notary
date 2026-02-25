import { ProposeStateUpdateAgent } from '@/lib/ai/routing/propose-state-update-agent'
import type { CaptureEngine, CaptureEngineInput, CaptureEngineResult } from '@/lib/ai/routing/capture-engines/types'

export class ChatGPTCaptureEngine implements CaptureEngine {
  constructor(private readonly agent: ProposeStateUpdateAgent = new ProposeStateUpdateAgent()) {}

  async propose(input: CaptureEngineInput): Promise<CaptureEngineResult> {
    return this.agent.propose({
      message: input.message,
      currentStep: input.currentStep,
      lastQuestionIntent: input.lastQuestionIntent,
      requiredMissing: input.requiredMissing,
      detectedPeople: input.detectedPeople,
      recentMessages: input.recentMessages,
    })
  }
}
