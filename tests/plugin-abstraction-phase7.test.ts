import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'
import { TramitePluginStateService } from '@/lib/services/tramite-plugin-state-service'
import { ExtractionAgent } from '@/lib/ai/extraction/extraction-agent'
import { ContextBuilder } from '@/lib/ai/rag/context-builder'
import { AgentRouter } from '@/lib/ai/routing/agent-router'

test('PluginRegistry.get("preaviso") retorna plugin valido', () => {
  const registry = PluginRegistry.getInstance()
  const plugin = registry.get('preaviso')
  assert.equal(plugin.tramiteType, 'preaviso')
  assert.ok(registry.list().includes('preaviso'))
})

test('stepsDefinition produce ids estables y total_steps consistente', () => {
  const snapshot = TramitePluginStateService.buildStateSnapshot('preaviso', {
    tipoOperacion: 'compraventa',
    vendedores: [{ tipo_persona: 'fisica', persona_fisica: { nombre: 'Vendedor Uno' } }],
    compradores: [{ tipo_persona: 'fisica', persona_fisica: { nombre: 'Comprador Uno' } }],
    inmueble: { folio_real: '1782486', partidas: ['12345'], direccion: { calle: 'Av Principal' } },
    creditos: [],
    gravamenes: [],
  })

  assert.equal(snapshot.wizard_state.total_steps, 6)
  assert.deepEqual(snapshot.wizard_state.steps.map((s) => s.id), ['paso1', 'paso2', 'paso3', 'paso4', 'paso5', 'paso6'])
})

test('ExtractionAgent valida salida con extractionSchema del plugin dinamico', async () => {
  const agent = new ExtractionAgent({
    llmClient: {
      complete: async () => ({
        content: JSON.stringify({
          source_document_type: 'otro',
          solicitante: { nombre: 'Solicitante Demo' },
          inmueble: { folio_real: 'F-101' },
          warnings: [],
          source_refs: [{ field: 'inmueble.folio_real', evidence: 'F-101' }],
        }),
        model: 'test-model',
      }),
    } as any,
    auditLogger: { log: async () => {} } as any,
  })

  const result = await agent.extract({
    tramiteType: 'preventivo',
    documentId: 'doc-1',
    rawText: 'Folio F-101. Solicitante Demo.',
  })

  assert.equal(result.trace_id.length > 10, true)
  assert.equal((result.structured as any).inmueble.folio_real, 'F-101')
})

test('ContextBuilder y Router funcionan con tramiteType dinamico', async () => {
  const builder = new ContextBuilder({
    createTraceId: () => 'trace-preventivo',
    getTramiteState: async () => ({
      tramite_id: 'tramite-1',
      plugin_type: 'preventivo',
      estado: 'en_proceso',
      wizard_state: { current_step: 1, total_steps: 3, can_finalize: false },
      summary: {},
    }),
    retrieveDocumentChunks: async () => [],
    retrieveKnowledgeChunks: async () => [],
    listRecentMessages: async () => [],
  } as any)

  const context = await builder.build({
    tramiteId: 'tramite-1',
    chatId: 'chat-1',
    userQuery: 'que falta?',
    pluginType: 'preventivo',
  })

  assert.equal(context.context_metadata.topk_doc, 4)
  assert.equal(context.context_metadata.topk_knowledge, 3)

  const extractionCalls: any[] = []
  const router = new AgentRouter({
    intentClassifier: { classify: async () => 'EXTRACT_DOCUMENT' } as any,
    extractionAgent: {
      extract: async (args: any) => {
        extractionCalls.push(args)
        return { trace_id: 'trace-extract' }
      },
    } as any,
    retrievalAgent: { respond: async () => ({ answer: '', citations: [], trace_id: 'n/a' }) } as any,
    proposeStateUpdateAgent: { propose: async () => ({ trace_id: 'n/a', proposed_updates: [], actions: [], answer: '' }) } as any,
    documentGenerationAgent: { prepare: async () => ({ trace_id: 'n/a', actions: [], payload: {}, answer: '' }) } as any,
    auditLogger: async () => {},
    now: () => 1,
    newTraceId: () => 'trace-fallback',
  } as any)

  const routed = await router.route({
    chatId: 'chat-1',
    tramiteId: 'tramite-1',
    message: 'procesa documento',
    userAuthId: 'auth-1',
    uiContext: {
      hasDocument: true,
      documentId: 'doc-1',
      rawText: 'Texto',
      tramiteType: 'preventivo',
      pluginType: 'preventivo',
    },
  })

  assert.equal(routed.intent, 'EXTRACT_DOCUMENT')
  assert.equal(extractionCalls.length, 1)
  assert.equal(extractionCalls[0].tramiteType, 'preventivo')
})

test('Nuevo plugin se integra sin duplicar agentes core', () => {
  const registry = PluginRegistry.getInstance()
  assert.ok(registry.list().includes('preventivo'))
  const plugin = registry.get('preventivo')
  assert.equal(plugin.stepsDefinition().length, 3)
  assert.equal(typeof plugin.buildExtractionUserPrompt, 'function')
})
