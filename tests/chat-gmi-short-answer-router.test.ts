import test from 'node:test'
import assert from 'node:assert/strict'
import { createDirectChatGMIRouteHandler } from '@/app/api/ai/chat-gmi/route'
import { ProposedUpdateDomainViolationError } from '@/lib/services/preaviso-proposed-update-service'

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

test('guidance de faltantes no expone path tecnico compradores[] al usuario', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_4',
      state_status: {},
      required_missing: ['compradores[]'],
      blocking_reasons: [],
      wizard_state: { current_step: 4, total_steps: 6, steps: [], can_finalize: false },
    }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'No pude mapear el mensaje a un campo faltante especifico.',
      proposed_updates: [],
      actions: [],
      trace_id: 'trace-guidance',
    }),
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
  const json = await res.json()
  const answer = String(json?.answer || '')
  assert.equal(answer.includes('compradores[]'), false)
  assert.equal(answer.includes('Indica quien es el comprador.'), true)
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

test('event router corre en mensaje largo con roles explicitos y compila updates antes del fallback', async () => {
  let runCaptureCalled = 0
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_2',
      state_status: {},
      required_missing: ['inmueble.folio_real', 'inmueble.partidas', 'inmueble.direccion'],
      blocking_reasons: [],
      wizard_state: { current_step: 2, total_steps: 6, steps: [], can_finalize: false },
    }),
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
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: {
          vendedores: [{ tipo_persona: 'persona_moral' }],
          compradores: [{ tipo_persona: 'persona_fisica', persona_fisica: { nombre: 'JOSE LUIS PEREZ GOMEZ' } }],
        },
        state: {
          current_state: 'ESTADO_2',
          state_status: {},
          required_missing: ['inmueble.folio_real', 'inmueble.partidas', 'inmueble.direccion'],
          blocking_reasons: [],
          wizard_state: { current_step: 2, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message:
        'CONJ. HABITACIONAL: CONDOMINIO D-2 ... EL VENDEDOR es INMOBILIARIA ENCASA SOCIEDAD ANONIMA. EL COMPRADOR es JOSE LUIS PEREZ GOMEZ. se tiene un gravamen y el pago con credito BANCO.',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  assert.equal(runCaptureCalled, 0)
  assert.ok(committedUpdates.some((u) => String((u as any)?.path || '').startsWith('vendedores[0]')))
  assert.ok(committedUpdates.some((u) => String((u as any)?.path || '').startsWith('compradores[0]')))
  const json = await res.json()
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  assert.equal(diagnostics.router_ran, true)
  assert.equal(Number(diagnostics.updates_compiled_count || 0) > 0, true)
})

test('guidance no expone paths tecnicos para missing sin mapping humano explicito', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_2',
      state_status: {},
      required_missing: ['inmueble.partidas', 'inmueble.direccion'],
      blocking_reasons: [],
      wizard_state: { current_step: 2, total_steps: 6, steps: [], can_finalize: false },
    }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'No pude mapear el mensaje a un campo faltante especifico.',
      proposed_updates: [],
      actions: [],
      trace_id: 'trace-guidance-safe',
    }),
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
  const json = await res.json()
  const answer = String(json?.answer || '')
  assert.equal(/\b(inmueble\.|compradores\[|vendedores\[|creditos\[)/i.test(answer), false, answer)
  assert.equal(answer.includes('Completa:'), false)
  const requestAction = (Array.isArray(json?.actions) ? json.actions : []).find(
    (x: any) => String(x?.type || '') === 'request_missing_field'
  )
  const nextQuestions = Array.isArray(requestAction?.next_questions) ? requestAction.next_questions : []
  assert.equal(
    nextQuestions.some((q: unknown) => /\b(inmueble\.|compradores\[|vendedores\[|creditos\[)/i.test(String(q || ''))),
    false
  )
})

test('routing_diagnostics incluye sections_detected y eventos buyer/spouse en mensaje clasico completo', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_1',
      state_status: {},
      required_missing: ['existencia_credito', 'compradores[]', 'compradores[].tipo_persona'],
      blocking_reasons: [],
      wizard_state: { current_step: 1, total_steps: 6, steps: [], can_finalize: false },
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: {
          compradores: [{ persona_fisica: { nombre: 'JOSE GUADALUPE SANDOVAL MURILLO', conyuge: { nombre: 'ARMIDA FERRA JUSTO' } } }],
        },
        state: {
          current_state: 'ESTADO_1',
          state_status: {},
          required_missing: [],
          blocking_reasons: [],
          wizard_state: { current_step: 1, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message:
        'PARTIDA NO: 6431741 FOLIO REAL: 1782485 EL VENDEDOR ES INMOBILIARIA ENCASA SA. EL COMPRADOR ES JOSE GUADALUPE SANDOVAL MURILLO JUNTO CON SU ESPOSA ARMIDA FERRA JUSTO. EL PAGO SERA MEDIANTE UN CREDITO BANCO MERCANTIL DEL NORTE.',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  assert.equal(committedUpdates.length >= 4, true)
  const json = await res.json()
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  const events = Array.isArray(diagnostics.events_detected) ? diagnostics.events_detected : []
  assert.equal(events.includes('ANSWER_BUYER_TEXT'), true)
  assert.equal(events.includes('ANSWER_SPOUSE_TEXT'), true)
  assert.equal(Array.isArray(diagnostics.sections_detected), true)
  assert.equal((diagnostics.sections_detected as any[]).every((x) => typeof x?.length === 'number'), true)
  assert.equal(String(diagnostics.commit_result || ''), 'applied')
})

test('route remueve missing existencia_credito cuando mensaje indica credito explicito', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_1',
      state_status: {},
      required_missing: ['existencia_credito'],
      blocking_reasons: [],
      wizard_state: { current_step: 1, total_steps: 6, steps: [], can_finalize: false },
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: { actosNotariales: { aperturaCreditoComprador: true }, creditos: [{ institucion: 'BANCO MERCANTIL DEL NORTE' }] },
        state: {
          current_state: 'ESTADO_1',
          state_status: {},
          required_missing: [],
          blocking_reasons: [],
          wizard_state: { current_step: 1, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'el pago del inmueble se realizara mediante un credito de BANCO MERCANTIL DEL NORTE',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  const json = await res.json()
  const requiredMissing = Array.isArray(json?.state?.required_missing) ? json.state.required_missing : []
  assert.equal(requiredMissing.includes('existencia_credito'), false)
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  const events = Array.isArray(diagnostics.events_detected) ? diagnostics.events_detected : []
  assert.equal(events.includes('ANSWER_PAYMENT_MODE'), true)
  assert.equal(Number(diagnostics.credito_events_count || 0) > 0, true)
})

test('ESTADO_5 captura institucion de credito con mensaje "la institucion es banco ..."', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_5',
      state_status: {},
      required_missing: ['creditos[0].institucion'],
      blocking_reasons: [],
      wizard_state: { current_step: 5, total_steps: 6, steps: [], can_finalize: false },
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: {
          creditos: [{ institucion: 'BANCO MERCANTIL DEL NORTE', participantes: [] }],
        },
        state: {
          current_state: 'ESTADO_5',
          state_status: {},
          required_missing: [],
          blocking_reasons: [],
          wizard_state: { current_step: 5, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'la institucion es banco mercantil del norte',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  const json = await res.json()
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  const events = Array.isArray(diagnostics.events_detected) ? diagnostics.events_detected : []
  assert.equal(diagnostics.router_ran, true)
  assert.equal(events.includes('ANSWER_CREDIT_INSTITUTION_TEXT'), true)
  assert.equal(String(diagnostics.commit_result || ''), 'applied')
  assert.equal(
    committedUpdates.some((u) => String((u as any)?.path || '') === 'creditos[0].institucion'),
    true
  )
  const requiredMissing = Array.isArray(json?.state?.required_missing) ? json.state.required_missing : []
  assert.equal(requiredMissing.includes('creditos[0].institucion'), false)
})

test('route forzado en ESTADO_6 aplica yes/no de cancelacion de gravamen y evita fallback', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    loadTramiteData: async () => ({
      gravamenes: ['BANCO DEL BAJIO, SOCIEDAD ANONIMA, INSTITUCION DE BANCA MULTIPLE'],
    }),
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['gravamenes[0].institucion', 'gravamenes[0].cancelacion_confirmada'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: {
          gravamenes: [
            {
              institucion: 'BANCO DEL BAJIO, SOCIEDAD ANONIMA, INSTITUCION DE BANCA MULTIPLE',
              cancelacion_confirmada: true,
            },
          ],
        },
        state: {
          current_state: 'ESTADO_6',
          state_status: {},
          required_missing: ['gravamenes[0].institucion'],
          blocking_reasons: [],
          wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'si se cancelara',
      uiContext: {},
    })
  )

  assert.equal(res.status, 200)
  const json = await res.json()
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  const events = Array.isArray(diagnostics.events_detected) ? diagnostics.events_detected : []
  assert.equal(diagnostics.router_ran, true)
  assert.equal(diagnostics.yesno_extractor_ran, true)
  assert.equal(Number(diagnostics.yesno_events_count || 0) > 0, true)
  assert.equal(events.includes('ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA'), true)
  assert.equal(
    committedUpdates.some((u) => String((u as any)?.path || '') === 'gravamenes[0].cancelacion_confirmada'),
    true
  )
  assert.equal(
    committedUpdates.some((u) => String((u as any)?.path || '') === 'gravamenes'),
    true
  )
  const requiredMissing = Array.isArray(json?.state?.required_missing) ? json.state.required_missing : []
  assert.equal(requiredMissing.includes('gravamenes[0].cancelacion_confirmada'), false)
  assert.equal(String(json?.answer || '').includes('No pude mapear'), false)
})

test('routing_diagnostics dev incluye attempted_paths y allowlist cuando commit rechaza path', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: [],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'captura',
      proposed_updates: [
        {
          op: 'set',
          path: 'gravamenes[0].cancelacion_confirmada',
          value: true,
        },
        {
          op: 'set',
          path: 'foo.bar',
          value: 'x',
        },
      ],
      actions: [],
      trace_id: 'trace-dev-diag',
    }),
    commitProposedUpdates: async () => {
      throw new ProposedUpdateDomainViolationError('Path no permitido para commit: foo.bar')
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
  const json = await res.json()
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  assert.equal(String(diagnostics.commit_result || ''), 'rejected')
  const attempted = Array.isArray(diagnostics.attempted_paths) ? diagnostics.attempted_paths : []
  assert.equal(attempted.includes('gravamenes[0].cancelacion_confirmada'), true)
  assert.equal(attempted.includes('foo.bar'), true)
  const checks = Array.isArray(diagnostics.allowlist_match) ? diagnostics.allowlist_match : []
  assert.equal(checks.some((c: any) => c?.path === 'gravamenes[0].cancelacion_confirmada' && c?.allowlist_match === true), true)
  assert.equal(checks.some((c: any) => c?.path === 'foo.bar' && c?.allowlist_match === false), true)
  assert.equal(String(diagnostics.rejected_path || ''), 'foo.bar')
})

test('ESTADO_6 ASK_MISSING no intenta commit y responde faltantes humanizados', async () => {
  let commitCalls = 0
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['gravamenes[0].cancelacion_confirmada'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    commitProposedUpdates: async () => {
      commitCalls += 1
      throw new Error('commit should not run for ask_missing')
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'que documentos me faltan?',
      uiContext: {},
    })
  )
  assert.equal(res.status, 200)
  assert.equal(commitCalls, 0)
  const json = await res.json()
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  assert.equal(diagnostics.ask_missing_intent, true)
  assert.equal(String(diagnostics.commit_result || ''), 'skipped_no_updates')
  assert.equal(String(diagnostics.commit_reject_reason || ''), '')
  const answer = String(json?.answer || '')
  assert.equal(answer.includes('Confirma si la hipoteca se cancelara con esta operacion (si/no).'), true)
})

test('ESTADO_6 con mensaje "si" aplica cancelacion_confirmada=true y commit applied', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['gravamenes[0].cancelacion_confirmada'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    loadTramiteData: async () => ({
      gravamenes: [{ institucion: 'BANCO DEL BAJIO', cancelacion_confirmada: null }],
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: {
          gravamenes: [{ institucion: 'BANCO DEL BAJIO', cancelacion_confirmada: true }],
        },
        state: {
          current_state: 'ESTADO_6',
          state_status: {},
          required_missing: [],
          blocking_reasons: [],
          wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
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
  const diagnostics = (json?.routing_diagnostics || {}) as Record<string, unknown>
  assert.equal(String(diagnostics.commit_result || ''), 'applied')
  assert.equal(
    committedUpdates.some((u) => String((u as any)?.path || '') === 'gravamenes[0].cancelacion_confirmada' && (u as any)?.value === true),
    true
  )
})

test('ESTADO_6 prioriza guidance de gravamen sobre inmueble cuando required_missing viene mezclado', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['inmueble.partidas', 'inmueble.direccion', 'gravamenes[0].cancelacion_confirmada'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'No pude mapear el mensaje a un campo faltante especifico.',
      proposed_updates: [],
      actions: [],
      trace_id: 'trace-mixed-missing',
    }),
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
  const json = await res.json()
  const requestAction = (Array.isArray(json?.actions) ? json.actions : []).find(
    (x: any) => String(x?.type || '') === 'request_missing_field'
  )
  const nextQuestions = Array.isArray(requestAction?.next_questions) ? requestAction.next_questions : []
  assert.equal(
    String(nextQuestions[0] || ''),
    'Confirma si la hipoteca se cancelara con esta operacion (si/no).'
  )
})

test('ESTADO_6 con required_missing inmueble.existe_hipoteca pregunta cancelacion de hipoteca y no fallback de inmueble', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['inmueble.existe_hipoteca'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'No pude mapear el mensaje a un campo faltante especifico.',
      proposed_updates: [],
      actions: [],
      trace_id: 'trace-estado6-existe-hipoteca',
    }),
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
  const json = await res.json()
  const requestAction = (Array.isArray(json?.actions) ? json.actions : []).find(
    (x: any) => String(x?.type || '') === 'request_missing_field'
  )
  const nextQuestions = Array.isArray(requestAction?.next_questions) ? requestAction.next_questions : []
  assert.equal(String(nextQuestions[0] || ''), 'Confirma si la hipoteca se cancelara con esta operacion (si/no).')
  assert.equal(String(nextQuestions[0] || '').includes('inmueble (partida/direccion)'), false)
})

test('ESTADO_6 con required_missing gravamenes[] pregunta institucion de gravamen y evita fallback generico', async () => {
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['gravamenes[]'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    runCapture: async () => ({
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'No pude mapear el mensaje a un campo faltante especifico.',
      proposed_updates: [],
      actions: [],
      trace_id: 'trace-estado6-gravamenes-array',
    }),
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
  const json = await res.json()
  const requestAction = (Array.isArray(json?.actions) ? json.actions : []).find(
    (x: any) => String(x?.type || '') === 'request_missing_field'
  )
  const nextQuestions = Array.isArray(requestAction?.next_questions) ? requestAction.next_questions : []
  assert.equal(String(nextQuestions[0] || ''), 'Indica la institucion del gravamen o hipoteca.')
  assert.equal(String(nextQuestions[0] || '').includes('Falta informacion del gravamen/hipoteca.'), false)
})

test('ESTADO_6 cuando short-router aplica inmueble.existe_hipoteca sincroniza cancelacion_confirmada para no repreguntar si/no', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['inmueble.existe_hipoteca'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    routeShortAnswer: async () => ({
      outcome: 'applied',
      selected_slot_id: 'slot:inmueble.existe_hipoteca',
      confidence: 0.99,
      normalized_value: 'si',
      update: { op: 'set', path: 'inmueble.existe_hipoteca', value: true },
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: { inmueble: { existe_hipoteca: true }, gravamenes: [{ institucion: null, cancelacion_confirmada: true }] },
        state: {
          current_state: 'ESTADO_6',
          state_status: {},
          required_missing: ['gravamenes[]'],
          blocking_reasons: [],
          wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
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
  assert.equal(
    committedUpdates.some((u) => String((u as any)?.path || '') === 'gravamenes[0].cancelacion_confirmada'),
    true
  )
})

test('ESTADO_6 cuando short-router aplica gravamenes con texto convierte a gravamenes[0].institucion para preservar cancelacion', async () => {
  let committedUpdates: Array<Record<string, unknown>> = []
  const deps = createBaseDeps({
    getTramiteStateSnapshot: async () => ({
      current_state: 'ESTADO_6',
      state_status: {},
      required_missing: ['gravamenes[]'],
      blocking_reasons: [],
      wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
    }),
    routeShortAnswer: async () => ({
      outcome: 'applied',
      selected_slot_id: 'slot:gravamenes',
      confidence: 0.99,
      normalized_value: 'infonavit',
      update: { op: 'set', path: 'gravamenes', value: 'infonavit' },
    }),
    commitProposedUpdates: async (args: any) => {
      committedUpdates = Array.isArray(args?.proposedUpdates) ? args.proposedUpdates : []
      return {
        applied_updates: committedUpdates.length,
        data: { gravamenes: [{ institucion: 'infonavit', cancelacion_confirmada: true }] },
        state: {
          current_state: 'ESTADO_6',
          state_status: {},
          required_missing: [],
          blocking_reasons: [],
          wizard_state: { current_step: 6, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  })

  const handler = createDirectChatGMIRouteHandler(deps as any)
  const res = await handler(
    buildRequest({
      chatId: '11111111-1111-4111-8111-111111111111',
      tramiteId: '22222222-2222-4222-8222-222222222222',
      message: 'infonavit',
      uiContext: {},
    })
  )
  assert.equal(res.status, 200)
  assert.equal(committedUpdates.some((u) => String((u as any)?.path || '') === 'gravamenes'), false)
  assert.equal(
    committedUpdates.some((u) => String((u as any)?.path || '') === 'gravamenes[0].institucion'),
    true
  )
})
