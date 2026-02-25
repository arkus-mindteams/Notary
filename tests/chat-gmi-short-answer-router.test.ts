import test from 'node:test'
import assert from 'node:assert/strict'
import { createDirectChatGMIRouteHandler } from '@/app/api/ai/chat-gmi/route'

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/ai/chat-gmi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createBaseDeps(overrides: Record<string, any> = {}) {
  return {
    getCurrentUserFromRequest: async () => ({
      id: 'user-id',
      auth_user_id: 'auth-user-id',
      rol: 'admin',
      activo: true,
    }),
    findChatSession: async () => ({ id: 'chat-id', user_id: 'auth-user-id' }),
    findTramiteScope: async () => ({ id: 'tramite-id', tipo: 'preaviso', user_id: 'user-id' }),
    loadTramiteData: async () => ({}),
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_4',
      state_status: {},
      required_missing: [],
      blocking_reasons: [],
      wizard_state: { current_step: 4, total_steps: 6, steps: [], can_finalize: false },
    }),
    findRecentChatMessages: async () => [],
    routeShortAnswer: async () => ({ outcome: 'fallback' }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'fallback general',
      proposed_updates: [],
      actions: [],
      trace_id: 'trace-fallback',
    }),
    commitProposedUpdates: async () => ({
      applied_updates: 1,
      data: { ok: true },
      state: {
        current_state: 'ESTADO_4',
        state_status: {},
        required_missing: [],
        blocking_reasons: [],
        wizard_state: { current_step: 4, total_steps: 6, steps: [], can_finalize: false },
      },
    }),
    insertChatMessage: async () => {},
    updateChatSessionTimestamp: async () => {},
    updateChatSessionContext: async () => {},
    ...overrides,
  }
}

test('short answer router aplica "casado" usando slot abierto guardado en metadata y created_at', async () => {
  let receivedSlots: any[] = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_4',
      state_status: {},
      required_missing: ['compradores[0].persona_fisica.estado_civil'],
      blocking_reasons: [],
      wizard_state: { current_step: 4, total_steps: 6, steps: [], can_finalize: false },
    }),
    findRecentChatMessages: async () => ([
      {
        role: 'assistant',
        content: 'Indica estado civil',
        created_at: '2026-02-25T10:00:00.000Z',
        metadata: {
          actions: [
            {
              type: 'request_missing_field',
              required_missing: ['compradores[0].persona_fisica.estado_civil'],
              next_questions: ['Indica el estado civil del comprador.'],
            },
          ],
        },
      },
      {
        role: 'user',
        content: 'ok',
        created_at: '2026-02-25T10:01:00.000Z',
        metadata: {},
      },
    ]),
    routeShortAnswer: async (args: any) => {
      receivedSlots = args.candidateSlots
      return {
        outcome: 'applied',
        selected_slot_id: 'slot:compradores[0].persona_fisica.estado_civil',
        confidence: 0.93,
        normalized_value: 'casado',
        update: {
          op: 'set',
          path: 'compradores[0].persona_fisica.estado_civil',
          value: 'casado',
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'casado',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  const json = await res.json()
  const actions = Array.isArray(json?.actions) ? json.actions : []
  assert.ok(actions.some((a: any) => a?.type === 'commit_applied'))
  assert.ok(Array.isArray(receivedSlots) && receivedSlots.length > 0)
  const estadoCivilSlot = receivedSlots.find((slot: any) => slot.path === 'compradores[0].persona_fisica.estado_civil')
  assert.ok(estadoCivilSlot)
  assert.equal(String(estadoCivilSlot.asked_at), '2026-02-25T10:00:00.000Z')
})

test('short answer router ambiguo responde aclaracion enfocada (max 2 opciones)', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_5',
      state_status: {},
      required_missing: ['actosNotariales.aperturaCreditoComprador', 'inmueble.existe_hipoteca'],
      blocking_reasons: [],
      wizard_state: { current_step: 5, total_steps: 6, steps: [], can_finalize: false },
    }),
    routeShortAnswer: async () => ({
      outcome: 'clarify',
      selected_slot_id: 'slot:actosNotariales.aperturaCreditoComprador',
      confidence: 0.41,
      clarify_message: 'Tu respuesta puede corresponder a dos campos.',
      top_alternatives: [
        { slot_id: 'slot:actosNotariales.aperturaCreditoComprador', question_text: 'Indica si la compra se hara con credito.' },
        { slot_id: 'slot:inmueble.existe_hipoteca', question_text: 'Confirma si el inmueble tiene hipoteca o esta libre de gravamen.' },
      ],
    }),
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'si',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(String(json?.answer || '').includes('No pude extraer'), false)
  const actions = Array.isArray(json?.actions) ? json.actions : []
  const clarifyAction = actions.find((a: any) => String(a?.reason || '') === 'short_answer_ambiguous')
  assert.ok(clarifyAction)
  assert.ok(Array.isArray(clarifyAction?.next_questions))
  assert.ok((clarifyAction?.next_questions || []).length <= 2)
})

test('sin candidate_slots el short router no se activa y se mantiene flujo general', async () => {
  let shortRouterCalled = 0
  let runCaptureCalled = 0
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_2',
      state_status: {},
      required_missing: [],
      blocking_reasons: [],
      wizard_state: { current_step: 2, total_steps: 6, steps: [], can_finalize: false },
    }),
    routeShortAnswer: async () => {
      shortRouterCalled += 1
      return { outcome: 'fallback' }
    },
    runCapture: async () => {
      runCaptureCalled += 1
      return {
        intent: 'UPDATE_STATE',
        agent_used: 'GMIIndependentCaptureFlow',
        answer: 'fallback general',
        proposed_updates: [],
        actions: [],
        trace_id: 'trace-fallback',
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'ok',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  assert.equal(shortRouterCalled, 0)
  assert.equal(runCaptureCalled, 1)
})

test('short answer router aplica deterministicamente nombre de conyuge con slot unico', async () => {
  const originalApiKey = process.env.GMI_API_KEY
  process.env.GMI_API_KEY = process.env.GMI_API_KEY || 'test-key'
  const flow = new (await import('@/lib/ai/routing/gmi-independent-capture-flow')).GMIIndependentCaptureFlow()

  const result = await flow.routeShortAnswer({
    message: 'DOMINGO JAVIER MORENO GÁMEZ',
    candidateSlots: [
      {
        slot_id: 'slot:compradores[0].persona_fisica.conyuge.nombre',
        path: 'compradores[0].persona_fisica.conyuge.nombre',
        question_text: 'Indica el nombre del conyuge del comprador.',
        source: 'required_missing',
        asked_at: '2026-02-25T10:00:00.000Z',
      },
    ],
  })

  assert.equal(result.outcome, 'applied')
  assert.equal(String(result.update?.path || ''), 'compradores[0].persona_fisica.conyuge.nombre')
  assert.equal(String(result.update?.value || ''), 'DOMINGO JAVIER MORENO GÁMEZ')

  if (!originalApiKey) delete process.env.GMI_API_KEY
})

test('short answer router aplica nombre de conyuge cuando es el unico slot compatible entre varios abiertos', async () => {
  const originalApiKey = process.env.GMI_API_KEY
  process.env.GMI_API_KEY = process.env.GMI_API_KEY || 'test-key'
  const flow = new (await import('@/lib/ai/routing/gmi-independent-capture-flow')).GMIIndependentCaptureFlow()

  const result = await flow.routeShortAnswer({
    message: 'DOMINGO JAVIER MORENO GÁMEZ',
    candidateSlots: [
      {
        slot_id: 'slot:compradores[0].persona_fisica.conyuge.nombre',
        path: 'compradores[0].persona_fisica.conyuge.nombre',
        question_text: 'Indica el nombre del conyuge del comprador.',
        source: 'open_question',
        asked_at: '2026-02-25T10:00:00.000Z',
      },
      {
        slot_id: 'slot:compradores[0].tipo_persona',
        path: 'compradores[0].tipo_persona',
        question_text: 'Confirma si el comprador es persona fisica o moral.',
        source: 'required_missing',
        asked_at: null,
        allowed_values: ['persona_fisica', 'persona_moral'],
      },
    ],
  })

  assert.equal(result.outcome, 'applied')
  assert.equal(String(result.update?.path || ''), 'compradores[0].persona_fisica.conyuge.nombre')
  assert.equal(String(result.update?.value || ''), 'DOMINGO JAVIER MORENO GÁMEZ')

  if (!originalApiKey) delete process.env.GMI_API_KEY
})
