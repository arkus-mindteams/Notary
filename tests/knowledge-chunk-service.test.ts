import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { KnowledgeChunkService } from '@/lib/services/knowledge-chunk-service'

let originalConsoleError: typeof console.error

beforeEach(() => {
  originalConsoleError = console.error
  console.error = () => {}
})

afterEach(() => {
  console.error = originalConsoleError
})

test('buildKnowledgeContext usa fallback sin DB y genera snapshot reproducible', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  const result = await KnowledgeChunkService.buildKnowledgeContext({
    tramite: 'preaviso',
    scope: 'chat_generation',
    promptVersion: 'preaviso.chat.v2.0.0',
    missingFields: ['creditos[0].institucion']
  })

  assert.ok(result.promptContext.includes('KNOWLEDGE OFICIAL'))
  assert.ok(result.snapshot.knowledge_chunk_ids.length > 0)
  assert.equal(result.snapshot.tramite, 'preaviso')
  assert.equal(result.snapshot.scope, 'chat_generation')
  assert.ok(result.snapshot.knowledge_hash.length >= 32)
})

test('buildKnowledgeContext conserva hash con la misma selección', async () => {
  const a = await KnowledgeChunkService.buildKnowledgeContext({
    tramite: 'preaviso',
    scope: 'chat_generation',
    promptVersion: 'preaviso.chat.v2.0.0',
    missingFields: ['compradores[0].persona_fisica.estado_civil']
  })

  const b = await KnowledgeChunkService.buildKnowledgeContext({
    tramite: 'preaviso',
    scope: 'chat_generation',
    promptVersion: 'preaviso.chat.v2.0.0',
    missingFields: ['compradores[0].persona_fisica.estado_civil']
  })

  assert.equal(a.snapshot.knowledge_hash, b.snapshot.knowledge_hash)
  assert.deepEqual(a.snapshot.knowledge_chunk_keys, b.snapshot.knowledge_chunk_keys)
})
