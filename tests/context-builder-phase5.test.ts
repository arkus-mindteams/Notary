import test from 'node:test'
import assert from 'node:assert/strict'
import { ContextBuilder } from '@/lib/ai/rag/context-builder'

test('ContextBuilder build retorna estructura estable con topK y metadata', async () => {
  const builder = new ContextBuilder({
    createTraceId: () => 'trace-fixed',
    getTramiteState: async () => ({
      tramite_id: 'tramite-1',
      plugin_type: 'preaviso',
      estado: 'en_proceso',
      wizard_state: { current_step: 2, total_steps: 6, can_finalize: false },
      summary: { tipo_operacion: 'compraventa' },
    }),
    retrieveDocumentChunks: async () => [
      {
        id: 'doc-a',
        documento_id: 'documento-1',
        page_number: 1,
        chunk_index: 0,
        snippet: 'Texto documento A',
        similarity: 0.9,
        embedding_model: 'text-embedding-3-small',
        chunking_version: 'v1',
        document_hash: 'hash-a',
      },
    ],
    retrieveKnowledgeChunks: async () => [
      {
        id: 'know-a',
        chunk_key: 'persona_y_tono',
        title: 'Persona',
        version: '2.0.0',
        snippet: 'Regla de tono',
        similarity: 0.8,
        content_hash: 'khash-a',
        embedding_model: 'text-embedding-3-small',
      },
    ],
    listRecentMessages: async () => [
      { id: 'm1', role: 'user', content: 'hola' },
      { id: 'm2', role: 'assistant', content: 'hola, en que te ayudo?' },
    ],
  } as any)

  const pack = await builder.build({
    tramiteId: 'tramite-1',
    chatId: 'chat-1',
    userQuery: 'Que falta del preaviso?',
    pluginType: 'preaviso',
  })

  assert.equal(pack.context_metadata.trace_id, 'trace-fixed')
  assert.equal(pack.retrieved_document_chunks.length, 1)
  assert.equal(pack.retrieved_knowledge_chunks.length, 1)
  assert.equal(pack.recent_messages.length, 2)
  assert.equal(pack.context_metadata.topk_doc, 6)
  assert.equal(pack.context_metadata.topk_knowledge, 4)
  assert.ok(pack.context_metadata.knowledge_snapshot.hash.length > 10)
  assert.deepEqual(pack.context_metadata.knowledge_snapshot.knowledge_chunk_ids, ['know-a'])
})

