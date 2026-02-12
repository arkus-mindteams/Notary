import { computePreavisoState } from '@/lib/preaviso-state'

export type WizardStepStatus = 'pending' | 'completed' | 'blocked'

export interface PreavisoWizardStep {
  id: 'paso1' | 'paso2' | 'paso3' | 'paso4' | 'paso5' | 'paso6'
  state_id: 'ESTADO_1' | 'ESTADO_2' | 'ESTADO_3' | 'ESTADO_4' | 'ESTADO_5' | 'ESTADO_6'
  status: WizardStepStatus
}

export interface PreavisoWizardState {
  current_step: number
  total_steps: number
  steps: PreavisoWizardStep[]
  can_finalize: boolean
}

const WIZARD_STATES: Array<PreavisoWizardStep['state_id']> = [
  'ESTADO_1',
  'ESTADO_2',
  'ESTADO_3',
  'ESTADO_4',
  'ESTADO_5',
  'ESTADO_6',
]

export class PreavisoWizardStateService {
  static fromContext(context: any): PreavisoWizardState {
    const computed = computePreavisoState(context)
    return this.fromSnapshot(
      computed.state.current_state,
      computed.state.state_status,
      computed.state.required_missing || [],
      computed.state.blocking_reasons || []
    )
  }

  static fromSnapshot(
    currentState: string,
    stateStatus: Record<string, string>,
    requiredMissing: string[] = [],
    blockingReasons: string[] = []
  ): PreavisoWizardState {
    const steps: PreavisoWizardStep[] = WIZARD_STATES.map((stateId, index) => {
      const raw = stateStatus[stateId]
      const completed = raw === 'completed' || raw === 'not_applicable'
      const blocked = !completed && currentState === stateId && (requiredMissing.length > 0 || blockingReasons.length > 0)

      return {
        id: `paso${index + 1}` as PreavisoWizardStep['id'],
        state_id: stateId,
        status: completed ? 'completed' : blocked ? 'blocked' : 'pending',
      }
    })

    const totalSteps = steps.length
    const firstNonCompleted = steps.findIndex((step) => step.status !== 'completed')
    const currentStep = firstNonCompleted === -1 ? totalSteps : firstNonCompleted + 1
    const canFinalize = steps.every((step) => step.status === 'completed') && blockingReasons.length === 0

    return {
      current_step: Math.max(1, Math.min(currentStep, totalSteps)),
      total_steps: totalSteps,
      steps,
      can_finalize: canFinalize,
    }
  }
}
