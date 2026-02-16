import test from 'node:test'
import assert from 'node:assert/strict'
import { RetrievalResponseAgent } from '@/lib/ai/rag/retrieval-response-agent'

test('RetrievalResponseAgent responde fallback cuando no hay chunks', async () => {
  let llmCalled = false
  const logs: any[] = []
  const agent = new RetrievalResponseAgent({
    contextBuilder: {
      build: async () => ({
        tramite_state: {
          tramite_id: 'tramite-1',
          plugin_type: 'preaviso',
          estado: 'en_proceso',
          summary: {},
        },
        retrieved_document_chunks: [],
        retrieved_knowledge_chunks: [],
        recent_messages: [],
        context_metadata: {
          trace_id: 'trace-empty',
          topk_doc: 6,
          topk_knowledge: 4,
          recent_messages_window: 8,
          embedding_model: 'text-embedding-3-small',
          chunking_version: 'v1',
          knowledge_snapshot: {
            version: 'none',
            hash: 'hash-none',
            knowledge_chunk_ids: [],
          },
        },
      }),
    } as any,
    llmClient: {
      complete: async () => {
        llmCalled = true
        return { content: '{"answer":"x","citations":[]}', model: 'test-model' }
      },
    },
    logTurn: async (entry: any) => {
      logs.push(entry)
    },
  })

  const response = await agent.respond({
    chatId: 'chat-1',
    tramiteId: 'tramite-1',
    userMessage: 'Dime el folio',
    userAuthId: 'auth-user-1',
    pluginType: 'preaviso',
  })

  assert.equal(llmCalled, false)
  assert.equal(response.trace_id, 'trace-empty')
  assert.equal(response.citations.length, 0)
  assert.ok(response.answer.toLowerCase().includes('no encontr'))
  assert.equal(logs.length, 1)
  assert.equal(logs[0].model, 'fallback-no-context')
})

