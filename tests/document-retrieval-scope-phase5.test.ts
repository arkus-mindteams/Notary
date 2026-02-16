import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentRetrievalService } from '@/lib/ai/rag/document-retrieval-service'

test('DocumentRetrievalService no retorna chunks de otro tramite (scope)', async () => {
  let seenTramiteFilter: string | null = null
  const service = new DocumentRetrievalService({
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    matchDocumentChunks: async ({ tramiteId }: { tramiteId: string }) => {
      seenTramiteFilter = tramiteId
      return [
        {
          id: 'chunk-a',
          documento_id: 'doc-1',
          text: 'texto A',
          similarity: 0.9,
          page_number: 1,
        },
        {
          id: 'chunk-b',
          documento_id: 'doc-2',
          text: 'texto B',
          similarity: 0.89,
          page_number: 2,
        },
      ]
    },
    getChunkDetailsByIds: async () => [
      {
        id: 'chunk-a',
        documento_id: 'doc-1',
        tramite_id: 'tramite-ok',
        page_number: 1,
        chunk_index: 0,
        text: 'texto A',
        embedding_model: 'text-embedding-3-small',
        chunking_version: 'v1',
      },
      {
        id: 'chunk-b',
        documento_id: 'doc-2',
        tramite_id: 'tramite-otro',
        page_number: 2,
        chunk_index: 0,
        text: 'texto B',
        embedding_model: 'text-embedding-3-small',
        chunking_version: 'v1',
      },
    ],
  } as any)

  const result = await service.search({
    query: 'folio real',
    tramiteId: 'tramite-ok',
    topK: 6,
  })

  assert.equal(seenTramiteFilter, 'tramite-ok')
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'chunk-a')
})
