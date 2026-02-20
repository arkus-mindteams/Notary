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
  assert.equal(Boolean(out.mergedFacts.folio_real), false)
  assert.equal(out.mergedFacts.folio_real_candidates.value.includes('17824885'), true)
  assert.equal(out.mergedFacts.folio_real_candidates.value.includes('17824886'), true)
  assert.equal(out.conflicts.some((c) => c.key === 'folio_real'), true)
  assert.equal(out.suggestions.length > 0, true)
})

test('applyRules detecta huella numero_oficial + unidad + letra y sugiere usarla para elegir folio', () => {
  const docs: DocumentIntakeItem[] = [
    baseDoc({
      documentId: 'doc-num-oficial',
      facts: [
        { key: 'numero_oficial', value: '6634', confidence: 0.9, evidence: { pageNumber: 1, snippet: 'CORRESPONDE AL NUMERO: 6634' } },
        { key: 'unidad', value: '6', confidence: 0.9, evidence: { pageNumber: 1, snippet: 'INT.: 6' } },
        { key: 'letra_unidad', value: 'D', confidence: 0.9, evidence: { pageNumber: 1, snippet: 'LETRA: D' } },
      ],
    }),
    baseDoc({
      documentId: 'doc-inscripcion-a',
      facts: [{ key: 'folio_real', value: '17824840', confidence: 0.82, evidence: { pageNumber: 1, snippet: 'FOLIO REAL: 17824840' } }],
    }),
    baseDoc({
      documentId: 'doc-inscripcion-b',
      facts: [{ key: 'folio_real', value: '17824865', confidence: 0.81, evidence: { pageNumber: 2, snippet: 'FOLIO REAL: 17824865' } }],
    }),
  ]

  const out = applyRules(docs)
  assert.equal(out.mergedFacts.numero_oficial.value, '6634')
  assert.equal(out.conflicts.some((c) => c.key === 'folio_real'), true)
  assert.equal(out.suggestions.some((s) => s.message.includes('huella de inmueble')), true)
})

test('applyRules detecta conflicto vendedor_identidad cuando propietario no coincide con identificacion', () => {
  const docs: DocumentIntakeItem[] = [
    baseDoc({
      documentId: 'doc-inscripcion',
      detectedType: 'OTRO',
      keyFields: {
        propietario: 'JOSE GUADALUPE SANDOVAL MURILLO',
      },
      facts: [
        {
          key: 'propietario',
          value: 'JOSE GUADALUPE SANDOVAL MURILLO',
          confidence: 0.95,
          evidence: { pageNumber: 1, snippet: 'PROPIETARIO(S): JOSE GUADALUPE SANDOVAL MURILLO' },
        },
      ],
    }),
    baseDoc({
      documentId: 'doc-ine',
      detectedType: 'INE',
      keyFields: {
        nombre: 'ARMINDA FERRA JUSTO',
      },
      facts: [
        {
          key: 'nombre',
          value: 'ARMINDA FERRA JUSTO',
          confidence: 0.9,
          evidence: { pageNumber: 1, snippet: 'NOMBRE: ARMINDA FERRA JUSTO' },
        },
      ],
    }),
  ]

  const out = applyRules(docs)
  assert.equal(out.mergedFacts.vendedor_nombre.value, 'JOSE GUADALUPE SANDOVAL MURILLO')
  assert.equal(out.conflicts.some((c) => c.key === 'vendedor_identidad'), true)
})

