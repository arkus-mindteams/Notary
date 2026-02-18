import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentRouter } from '@/lib/ai/routing/agent-router'

test('AgentRouter enruta QNA a RetrievalResponseAgent', async () => {
  const router = new AgentRouter({
    intentClassifier: { classify: async () => 'QNA' } as any,
    retrievalAgent: {
      respond: async () => ({
        answer: 'Respuesta con evidencia',
        citations: ['doc-1'],
        trace_id: 'trace-qna',
        audit: {
          retrieved_document_chunk_ids: ['doc-1'],
          retrieved_knowledge_chunk_ids: ['k-1'],
          latencies: { totalMs: 10, retrievalMs: 6, llmMs: 4 },
        },
      }),
    } as any,
    extractionAgent: { extract: async () => ({ trace_id: 'x' }) } as any,
    proposeStateUpdateAgent: { propose: async () => ({ trace_id: 'y', proposed_updates: [], actions: [], answer: '' }) } as any,
    documentGenerationAgent: { prepare: async () => ({ trace_id: 'z', actions: [], payload: {}, answer: '' }) } as any,
    auditLogger: async () => {},
    now: (() => {
      let t = 0
      return () => (t += 5)
    })(),
    newTraceId: () => 'trace-fallback',
  } as any)

  const result = await router.route({
    chatId: 'chat-1',
    tramiteId: 'tramite-1',
    message: 'Que significa este gravamen?',
    userAuthId: 'auth-1',
    uiContext: {},
  })

  assert.equal(result.intent, 'QNA')
  assert.equal(result.agent_used, 'RetrievalResponseAgent')
  assert.equal(result.trace_id, 'trace-qna')
  assert.deepEqual(result.citations, ['doc-1'])
})

test('AgentRouter enruta UPDATE_STATE a ProposeStateUpdateAgent con propuestas', async () => {
  const router = new AgentRouter({
    intentClassifier: { classify: async () => 'UPDATE_STATE' } as any,
    retrievalAgent: { respond: async () => ({ answer: '', citations: [], trace_id: 'n/a' }) } as any,
    extractionAgent: { extract: async () => ({ trace_id: 'x' }) } as any,
    proposeStateUpdateAgent: {
      propose: async () => ({
        trace_id: 'trace-update',
        proposed_updates: [{ op: 'set', path: 'compradores[0].persona_fisica.rfc', value: 'ABCD010101AAA' }],
        actions: [{ type: 'review_proposed_updates' }],
        answer: 'Propuesta creada',
      }),
    } as any,
    documentGenerationAgent: { prepare: async () => ({ trace_id: 'z', actions: [], payload: {}, answer: '' }) } as any,
    auditLogger: async () => {},
    now: () => 1,
    newTraceId: () => 'trace-new',
  } as any)

  const result = await router.route({
    chatId: 'chat-1',
    tramiteId: 'tramite-1',
    message: 'Mi RFC es ABCD010101AAA',
    userAuthId: 'auth-1',
    uiContext: { currentStep: 'compradores' },
  })

  assert.equal(result.intent, 'UPDATE_STATE')
  assert.equal(result.agent_used, 'ProposeStateUpdateAgent')
  assert.equal((result.proposed_updates || []).length > 0, true)
})

test('AgentRouter fallback UNKNOWN usa RetrievalResponseAgent y pide aclaracion', async () => {
  const router = new AgentRouter({
    intentClassifier: { classify: async () => 'UNKNOWN' } as any,
    retrievalAgent: {
      respond: async () => ({
        answer: 'No encuentro evidencia suficiente.',
        citations: [],
        trace_id: 'trace-unknown',
      }),
    } as any,
    extractionAgent: { extract: async () => ({ trace_id: 'x' }) } as any,
    proposeStateUpdateAgent: { propose: async () => ({ trace_id: 'y', proposed_updates: [], actions: [], answer: '' }) } as any,
    documentGenerationAgent: { prepare: async () => ({ trace_id: 'z', actions: [], payload: {}, answer: '' }) } as any,
    auditLogger: async () => {},
    now: () => 1,
    newTraceId: () => 'trace-new',
  } as any)

  const result = await router.route({
    chatId: 'chat-1',
    tramiteId: 'tramite-1',
    message: 'mmm',
    userAuthId: 'auth-1',
    uiContext: {},
  })

  assert.equal(result.intent, 'UNKNOWN')
  assert.equal(result.agent_used, 'RetrievalResponseAgent')
  assert.equal((result.answer || '').toLowerCase().includes('confirma si quieres'), true)
})

test('AgentRouter registra log con intent, agent_used y trace_id', async () => {
  const logs: any[] = []
  const router = new AgentRouter({
    intentClassifier: { classify: async () => 'QNA' } as any,
    retrievalAgent: {
      respond: async () => ({
        answer: 'Respuesta',
        citations: ['doc-2'],
        trace_id: 'trace-log',
      }),
    } as any,
    extractionAgent: { extract: async () => ({ trace_id: 'x' }) } as any,
    proposeStateUpdateAgent: { propose: async () => ({ trace_id: 'y', proposed_updates: [], actions: [], answer: '' }) } as any,
    documentGenerationAgent: { prepare: async () => ({ trace_id: 'z', actions: [], payload: {}, answer: '' }) } as any,
    auditLogger: async (entry: any) => logs.push(entry),
    now: () => 1,
    newTraceId: () => 'trace-new',
  } as any)

  await router.route({
    chatId: 'chat-1',
    tramiteId: 'tramite-1',
    message: 'Que sigue?',
    userAuthId: 'auth-1',
    uiContext: {},
  })

  assert.equal(logs.length, 1)
  assert.equal(logs[0].intent, 'QNA')
  assert.equal(logs[0].agentUsed, 'RetrievalResponseAgent')
  assert.equal(logs[0].traceId, 'trace-log')
})

