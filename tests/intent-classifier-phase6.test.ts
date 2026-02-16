import test from 'node:test'
import assert from 'node:assert/strict'
import { IntentClassifier } from '@/lib/ai/routing/intent-classifier'

test('IntentClassifier clasifica EXTRACT_DOCUMENT por mensaje determinista', async () => {
  const classifier = new IntentClassifier({
    llmClient: {
      classifyAmbiguous: async () => 'UNKNOWN',
    },
  } as any)

  const intent = await classifier.classify({
    message: 'Subo documento para extraer datos del folio',
    hasDocument: true,
    uiAction: 'document_uploaded',
  })

  assert.equal(intent, 'EXTRACT_DOCUMENT')
})

