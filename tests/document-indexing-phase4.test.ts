import test from 'node:test'
import assert from 'node:assert/strict'
import { DocumentChunker, DEFAULT_CHUNKING_VERSION } from '@/lib/services/document-chunker'
import { DocumentIndexingService } from '@/lib/services/document-indexing-service'

test('DocumentChunker es determinista para mismo input + version', () => {
  const rawText = Array.from({ length: 1600 }, (_, idx) => `Linea ${idx + 1}: dato notarial relevante.`).join('\n')
  const input = {
    rawText,
    chunkingVersion: DEFAULT_CHUNKING_VERSION,
    docMeta: { document_type: 'escritura' },
  }

  const chunksA = DocumentChunker.chunk(input)
  const chunksB = DocumentChunker.chunk(input)

  assert.equal(chunksA.length > 0, true)
  assert.deepEqual(chunksA, chunksB)
})

test('DocumentIndexingService evita duplicados cuando ya existe la firma de indexacion', async () => {
  const inserted: any[] = []
  const signatures = new Set<string>()

  const deps: any = {
    findDocumentoById: async () => ({
      id: 'doc-1',
      nombre: 'archivo.pdf',
      mime_type: 'application/pdf',
      s3_key: 'expedientes/x/file.pdf',
      metadata: null,
    }),
    findTramiteIdByDocumentoId: async () => 'tramite-1',
    hasExistingIndexSignature: async ({ documentoId, documentHash, chunkingVersion, embeddingModel }: any) =>
      signatures.has(`${documentoId}:${documentHash}:${chunkingVersion}:${embeddingModel}`),
    deleteIndexSignature: async () => {},
    upsertChunks: async (rows: any[]) => {
      inserted.push(...rows)
      for (const row of rows) {
        signatures.add(`${row.documento_id}:${row.document_hash}:${row.chunking_version}:${row.embedding_model}`)
      }
    },
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    extractText: async () => ({
      text: Array.from({ length: 1400 }, (_, i) => `texto legal ${i + 1}`).join(' '),
      source: 'metadata',
      needs_ocr: false,
    }),
    logEvent: async () => {},
  }

  const service = new DocumentIndexingService(deps)
  const first = await service.indexDocument({
    documentoId: 'doc-1',
    forceReindex: false,
    traceId: 'trace-1',
    userId: 'user-1',
  })
  const second = await service.indexDocument({
    documentoId: 'doc-1',
    forceReindex: false,
    traceId: 'trace-2',
    userId: 'user-1',
  })

  assert.equal(first.status, 'indexed')
  assert.equal(second.status, 'skipped')
  assert.equal(second.chunks_created, 0)
  assert.equal(inserted.length > 0, true)
})

test('DocumentIndexingService retorna needs_ocr cuando no hay texto usable y no rompe', async () => {
  const deps: any = {
    findDocumentoById: async () => ({
      id: 'doc-ocr',
      nombre: 'scan.pdf',
      mime_type: 'application/pdf',
      s3_key: 'expedientes/x/scan.pdf',
      metadata: null,
    }),
    findTramiteIdByDocumentoId: async () => null,
    hasExistingIndexSignature: async () => false,
    deleteIndexSignature: async () => {},
    upsertChunks: async () => {},
    generateEmbedding: async () => [0.1, 0.2, 0.3],
    extractText: async () => ({
      text: '',
      source: 'none',
      needs_ocr: true,
      reason: 'pdf_text_not_usable',
    }),
    logEvent: async () => {},
  }

  const service = new DocumentIndexingService(deps)
  const result = await service.indexDocument({
    documentoId: 'doc-ocr',
    forceReindex: false,
    traceId: 'trace-needs-ocr',
    userId: 'user-1',
  })

  assert.equal(result.status, 'needs_ocr')
  assert.equal(result.chunks_created, 0)
  assert.equal(result.embeddings_created, 0)
})

