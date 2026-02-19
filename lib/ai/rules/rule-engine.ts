import type { DocumentIntakeItem, RuleResult } from '@/lib/ai/intake/document-intake.types'
import { rulesRegistry } from '@/lib/ai/rules/rules.registry'

export function applyRules(intakeResults: DocumentIntakeItem[]): RuleResult {
  const acc: RuleResult = {
    mergedFacts: {},
    conflicts: [],
    suggestions: [],
  }

  for (const rule of rulesRegistry) {
    rule(intakeResults, acc)
  }

  return acc
}

