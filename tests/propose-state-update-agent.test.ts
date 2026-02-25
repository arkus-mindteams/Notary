import test from 'node:test'
import assert from 'node:assert/strict'
import { ProposeStateUpdateAgent } from '@/lib/ai/routing/propose-state-update-agent'

test('ProposeStateUpdateAgent captura estado civil en respuesta corta con intent comprador', async () => {
  const agent = new ProposeStateUpdateAgent()

  const result = await agent.propose({
    message: 'es casado',
    lastQuestionIntent: 'comprador',
    recentMessages: [
      { role: 'assistant', content: 'Indica el estado civil del comprador.' },
      { role: 'user', content: 'es casado' },
    ],
  })

  const update = (result.proposed_updates || [])[0] as Record<string, unknown>
  assert.equal(String(update?.path || ''), 'compradores[0].persona_fisica.estado_civil')
  assert.equal(String(update?.value || ''), 'casado')
})

test('ProposeStateUpdateAgent conserva captura de nombre para respuesta corta nominal', async () => {
  const agent = new ProposeStateUpdateAgent()

  const result = await agent.propose({
    message: 'Sergio Lizarraga Martinez',
    lastQuestionIntent: 'comprador',
    recentMessages: [
      { role: 'assistant', content: 'Indica el nombre del comprador.' },
      { role: 'user', content: 'Sergio Lizarraga Martinez' },
    ],
  })

  const update = (result.proposed_updates || [])[0] as Record<string, unknown>
  assert.equal(String(update?.path || ''), 'compradores[0].persona_fisica.nombre')
  assert.equal(String(update?.value || ''), 'Sergio Lizarraga Martinez')
})
