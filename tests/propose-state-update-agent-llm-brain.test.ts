import test from 'node:test'
import assert from 'node:assert/strict'
import { ProposeStateUpdateAgent } from '@/lib/ai/routing/propose-state-update-agent'

test('ProposeStateUpdateAgent usa selector+extractor LLM para participantes de credito por required_missing', async () => {
  const previousApiKey = process.env.OPENAI_API_KEY
  const previousModel = process.env.OPENAI_STATE_UPDATE_MODEL
  const originalFetch = globalThis.fetch

  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_STATE_UPDATE_MODEL = 'gpt-4o-mini'

  let call = 0
  globalThis.fetch = (async () => {
    call += 1
    if (call === 1) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matched_required_missing: 'creditos[0].participantes[]',
                  confidence: 0.91,
                  reason: 'El usuario responde quienes participan en el credito',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                applies: true,
                op: 'set',
                path: 'creditos[0].participantes',
                value: ['Mauricio'],
                confidence: 0.88,
                reason: 'Participante explicitamente mencionado',
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as any

  try {
    const agent = new ProposeStateUpdateAgent()
    const result = await agent.propose({
      message: 'mauricio participa en el credito',
      currentStep: 'ESTADO_5',
      lastQuestionIntent: 'credito',
      requiredMissing: ['creditos[0].participantes[]'],
      recentMessages: [
        { role: 'assistant', content: 'Indica quienes participan en el credito.' },
        { role: 'user', content: 'mauricio participa en el credito' },
      ],
    })

    const update = (result.proposed_updates || [])[0] as Record<string, unknown>
    assert.equal(String(update?.path || ''), 'creditos[0].participantes')
    assert.deepEqual(update?.value, ['Mauricio'])
  } finally {
    globalThis.fetch = originalFetch
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousApiKey
    if (previousModel === undefined) delete process.env.OPENAI_STATE_UPDATE_MODEL
    else process.env.OPENAI_STATE_UPDATE_MODEL = previousModel
  }
})
