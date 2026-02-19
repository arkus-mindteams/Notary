import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRules } from '@/lib/ai/rules/rule-engine'
import type { DocumentIntakeItem } from '@/lib/ai/intake/document-intake.types'

const baseDoc = (overrides: Partial<DocumentIntakeItem>): DocumentIntakeItem => ({
  documentId: 'doc-1',
  filename: 'doc.pdf',
  detectedType: 'OTRO',
  confidence: 0.9,
  issues: [],
  summary: ['a', 'b'],
  pages: [
    {
      pageNumber: 1,
      text: 'texto',
      evidence: [],
    },
  ],
  keyFields: {},
  facts: [],
  ...overrides,
})

test('applyRules consolida unidad/letra y detecta conflicto de folio real', () => {
  const docs: DocumentIntakeItem[] = [
    baseDoc({
      documentId: 'doc-a',
      facts: [
        { key: 'unidad', value: '6', confidence: 0.9, evidence: { pageNumber: 1, snippet: 'INT.: 6' } },
        { key: 'letra_unidad', value: 'D', confidence: 0.9, evidence: { pageNumber: 1, snippet: 'LETRA: D' } },
        { key: 'folio_real', value: '17824885', confidence: 0.8, evidence: { pageNumber: 1, snippet: 'FOLIO REAL: 17824885' } },
      ],
    }),
    baseDoc({
      documentId: 'doc-b',
      facts: [
        { key: 'unidad', value: '6', confidence: 0.85, evidence: { pageNumber: 2, snippet: 'UNIDAD 6' } },
        { key: 'letra_unidad', value: 'D', confidence: 0.87, evidence: { pageNumber: 2, snippet: 'LETRA D' } },
        { key: 'folio_real', value: '17824886', confidence: 0.75, evidence: { pageNumber: 2, snippet: 'FOLIO REAL 17824886' } },
      ],
    }),
  ]

  const out = applyRules(docs)
  assert.equal(out.mergedFacts.unidad.value, '6')
  assert.equal(out.mergedFacts.letra_unidad.value, 'D')
  assert.equal(out.conflicts.some((c) => c.key === 'folio_real'), true)
  assert.equal(out.suggestions.length > 0, true)
})

