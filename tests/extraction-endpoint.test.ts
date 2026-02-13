import test from 'node:test'
import assert from 'node:assert/strict'
import { createExtractRouteHandler } from '@/app/api/expedientes/tramites/[id]/extract/route'
import { ExtractionAgent } from '@/lib/ai/extraction/extraction-agent'
import { preavisoExtractionSchema } from '@/lib/ai/extraction/plugins/preaviso-extraction-plugin'
import type { ExtractionAuditLogEntry, ExtractionLLMClient } from '@/lib/ai/extraction/types'

class SequenceLLMClient implements ExtractionLLMClient {
  private index = 0
  constructor(private readonly responses: string[]) {}

  async complete() {
    const content = this.responses[this.index] ?? this.responses[this.responses.length - 1] ?? '{}'
    this.index += 1
    return { content, model: 'test-model', usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }
  }
}

class MemoryAuditLogger {
  entries: ExtractionAuditLogEntry[] = []

  async log(entry: ExtractionAuditLogEntry): Promise<void> {
    this.entries.push(entry)
  }
}

const makeDeps = (extractFn: (args: any) => Promise<any>) => ({
  getCurrentUserFromRequest: async () => ({
    id: 'user-1',
    auth_user_id: 'auth-user-1',
    activo: true,
    rol: 'abogado',
  }),
  findTramiteById: async () => ({
    id: 'tramite-1',
    tipo: 'preaviso',
    user_id: 'user-1',
  }),
  findDocumentoById: async () => ({
    id: 'doc-1',
    nombre: 'inscripcion.pdf',
    mime_type: 'application/pdf',
    tipo: 'escritura',
    ['tama\u00f1o']: 123,
    metadata: {},
  }),
  extract: extractFn,
  isDocumentLinkedToTramite: async () => true,
})

test('POST /api/expedientes/tramites/:id/extract reintenta JSON invalido y responde schema valido', async () => {
  const logger = new MemoryAuditLogger()
  const llm = new SequenceLLMClient([
    '{ invalid json',
    JSON.stringify({
      source_document_type: 'inscripcion',
      inmueble: {
        folio_real: '1782486',
        partidas: ['12345'],
        seccion: 'CIVIL',
        numero_expediente: null,
        direccion: {
          calle: 'Av. Principal',
          numero: '100',
          colonia: 'Centro',
          municipio: 'Monterrey',
          estado: 'NL',
          codigo_postal: '64000',
        },
        superficie: '120 m2',
        valor: null,
        datos_catastrales: {
          lote: '1',
          manzana: '2',
          fraccionamiento: 'Centro',
          condominio: null,
          unidad: null,
          modulo: null,
        },
      },
      titular_registral: {
        nombre: 'JUAN PEREZ',
        rfc: null,
        curp: null,
      },
      compradores_detectados: [],
      conyuges_detectados: [],
      gravamenes: 'LIBRE',
      confidence: 0.85,
      warnings: [],
      source_refs: [{ field: 'inmueble.folio_real', evidence: 'FOLIO REAL 1782486' }],
    }),
  ])
  const agent = new ExtractionAgent({ llmClient: llm, auditLogger: logger })
  const handler = createExtractRouteHandler(makeDeps((args: any) => agent.extract(args)) as any)

  const req = new Request('http://localhost/api/expedientes/tramites/tramite-1/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      documentId: 'doc-1',
      tramiteType: 'preaviso',
      rawText: 'FOLIO REAL 1782486. Propietario JUAN PEREZ. Libre de gravamen.',
    }),
  })

  const resp = await handler(req, { params: { id: 'tramite-1' } })
  assert.equal(resp.status, 200)

  const body = await resp.json()
  const parsed = preavisoExtractionSchema.safeParse(body.structured)
  assert.equal(parsed.success, true)
  assert.ok(body.trace_id)
  assert.equal(logger.entries.length, 2)
  assert.equal(logger.entries[0].status, 'retry')
  assert.equal(logger.entries[1].status, 'success')
})

test('POST /api/expedientes/tramites/:id/extract retorna AI_OUTPUT_INVALID y registra error final', async () => {
  const logger = new MemoryAuditLogger()
  const llm = new SequenceLLMClient(['not-json-1', 'not-json-2', 'not-json-3'])
  const agent = new ExtractionAgent({ llmClient: llm, auditLogger: logger })
  const handler = createExtractRouteHandler(makeDeps((args: any) => agent.extract(args)) as any)

  const req = new Request('http://localhost/api/expedientes/tramites/tramite-1/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      documentId: 'doc-1',
      tramiteType: 'preaviso',
      rawText: 'Texto sin estructura',
    }),
  })

  const resp = await handler(req, { params: { id: 'tramite-1' } })
  assert.equal(resp.status, 422)

  const body = await resp.json()
  assert.equal(body.error.code, 'AI_OUTPUT_INVALID')
  assert.equal(logger.entries.length, 3)
  assert.equal(logger.entries[2].status, 'error')
})
