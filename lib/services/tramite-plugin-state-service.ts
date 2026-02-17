import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import type { TramiteType, TramiteWizardStateSnapshot } from '@/lib/tramites/plugins/tramite-plugin'
import { getPathValue, hasMeaningfulValue } from '@/lib/tramites/plugins/shared-schemas'

function coerceState(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object') return input as Record<string, unknown>
  return {}
}

export class TramitePluginStateService {
  static buildStateSnapshot(tramiteType: TramiteType | string, state: unknown): TramiteWizardStateSnapshot {
    const plugin = PluginRegistry.getInstance().get(tramiteType)
    const parsedStateResult = plugin.schemas.stateSchema.safeParse(state)
    const parsedState = parsedStateResult.success ? parsedStateResult.data : coerceState(state)

    const steps = plugin.stepsDefinition()
    const completedByStep = steps.map((step) => step.isComplete(parsedState))
    const totalSteps = steps.length
    const firstPendingIndex = completedByStep.findIndex((completed) => !completed)
    const hasPending = firstPendingIndex >= 0

    const requiredMissing = plugin.getRequiredMissingFields
      ? plugin.getRequiredMissingFields(parsedState)
      : plugin
          .requiredFieldsForFinalize()
          .filter((path) => !hasMeaningfulValue(getPathValue(parsedState, path)))

    const blockingReasons = plugin.getBlockingReasons ? plugin.getBlockingReasons(parsedState) : []
    const currentStepIndex = hasPending ? firstPendingIndex : Math.max(0, totalSteps - 1)
    const currentStep = steps[currentStepIndex]

    const stepRows = steps.map((step, index) => {
      const completed = completedByStep[index]
      const blocked = !completed && index === currentStepIndex && (requiredMissing.length > 0 || blockingReasons.length > 0)

      return {
        id: step.id,
        state_id: step.stateId || step.id,
        status: completed ? ('completed' as const) : blocked ? ('blocked' as const) : ('pending' as const),
      }
    })

    const canFinalize = stepRows.every((step) => step.status === 'completed') && requiredMissing.length === 0 && blockingReasons.length === 0

    const stateStatus: Record<string, string> = {}
    for (const row of stepRows) {
      stateStatus[row.state_id] = row.status
    }

    return {
      current_state: currentStep?.stateId || currentStep?.id || 'UNKNOWN',
      state_status: stateStatus,
      required_missing: Array.from(new Set(requiredMissing.filter(Boolean))),
      blocking_reasons: Array.from(new Set(blockingReasons.filter(Boolean))),
      wizard_state: {
        current_step: Math.max(1, Math.min(hasPending ? firstPendingIndex + 1 : totalSteps, Math.max(totalSteps, 1))),
        total_steps: totalSteps,
        steps: stepRows,
        can_finalize: canFinalize,
      },
    }
  }
}
