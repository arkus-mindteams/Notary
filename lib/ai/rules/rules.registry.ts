import type { DocumentIntakeItem, RuleConflict, RuleMergedFactValue, RuleSuggestion } from '@/lib/ai/intake/document-intake.types'

export type RuleAccumulator = {
  mergedFacts: Record<string, RuleMergedFactValue>
  conflicts: RuleConflict[]
  suggestions: RuleSuggestion[]
}

export type IntakeRule = (documents: DocumentIntakeItem[], acc: RuleAccumulator) => void

function normalizeValue(value: string): string {
  return String(value || '').trim().toUpperCase()
}

export const unitLetterRule: IntakeRule = (documents, acc) => {
  const values = new Map<string, { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[]>()
  for (const doc of documents) {
    for (const fact of doc.facts || []) {
      if (fact.key !== 'unidad' && fact.key !== 'letra_unidad') continue
      const k = fact.key
      const list = values.get(k) || []
      list.push({
        value: fact.value,
        source: doc.documentId,
        pageNumber: fact.evidence.pageNumber,
        snippet: fact.evidence.snippet,
        confidence: fact.confidence,
      })
      values.set(k, list)
    }
  }

  for (const [key, sourceValues] of values.entries()) {
    if (sourceValues.length === 0) continue
    const unique = Array.from(new Set(sourceValues.map((x) => normalizeValue(x.value))))
    const dominant = sourceValues.sort((a, b) => b.confidence - a.confidence)[0]
    acc.mergedFacts[key] = {
      value: dominant.value,
      sources: sourceValues.map((x) => ({
        documentId: x.source,
        pageNumber: x.pageNumber,
        snippet: x.snippet,
        confidence: x.confidence,
      })),
    }
    if (unique.length > 1) {
      acc.conflicts.push({
        key,
        values: Array.from(new Set(sourceValues.map((x) => x.value))),
        sources: sourceValues.map((x) => ({
          documentId: x.source,
          value: x.value,
          pageNumber: x.pageNumber,
          snippet: x.snippet,
        })),
      })
      acc.suggestions.push({
        message: `Conflicto detectado en ${key}. Validar con usuario antes de mutar estado.`,
        sources: Array.from(new Set(sourceValues.map((x) => x.source))),
      })
    }
  }
}

export const folioRealRule: IntakeRule = (documents, acc) => {
  const folioFacts: { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[] = []
  for (const doc of documents) {
    for (const fact of doc.facts || []) {
      if (fact.key !== 'folio_real') continue
      folioFacts.push({
        value: fact.value,
        source: doc.documentId,
        pageNumber: fact.evidence.pageNumber,
        snippet: fact.evidence.snippet,
        confidence: fact.confidence,
      })
    }
  }

  if (folioFacts.length === 0) return

  const dominant = [...folioFacts].sort((a, b) => b.confidence - a.confidence)[0]
  acc.mergedFacts.folio_real = {
    value: dominant.value,
    sources: folioFacts.map((x) => ({
      documentId: x.source,
      pageNumber: x.pageNumber,
      snippet: x.snippet,
      confidence: x.confidence,
    })),
  }

  const unique = Array.from(new Set(folioFacts.map((x) => normalizeValue(x.value))))
  if (unique.length > 1) {
    acc.conflicts.push({
      key: 'folio_real',
      values: Array.from(new Set(folioFacts.map((x) => x.value))),
      sources: folioFacts.map((x) => ({
        documentId: x.source,
        value: x.value,
        pageNumber: x.pageNumber,
        snippet: x.snippet,
      })),
    })
    acc.suggestions.push({
      message: 'Se detectaron folios reales distintos entre documentos. Requiere confirmacion humana.',
      sources: Array.from(new Set(folioFacts.map((x) => x.source))),
    })
  }
}

export const rulesRegistry: IntakeRule[] = [unitLetterRule, folioRealRule]

