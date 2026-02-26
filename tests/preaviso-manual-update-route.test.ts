import test from 'node:test'
import assert from 'node:assert/strict'
import { createPreavisoManualUpdateHandler } from '@/app/api/preaviso/manual-update/route'
import { ProposedUpdateDomainViolationError } from '@/lib/services/preaviso-proposed-update-service'

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/preaviso/manual-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('manual-update aplica commit y regresa snapshot actualizado', async () => {
  let receivedArgs: any = null
  const handler = createPreavisoManualUpdateHandler({
    getCurrentUserFromRequest: async () => ({
      id: 'user-id',
      auth_user_id: 'auth-user-id',
      rol: 'admin',
      activo: true,
    }),
    findTramiteScope: async () => ({ id: 'tramite-id', tipo: 'preaviso', user_id: 'user-id' }),
    commitProposedUpdates: async (args: any) => {
      receivedArgs = args
      return {
        applied_updates: 1,
        data: {
          compradores: [{ tipo_persona: 'persona_fisica', persona_fisica: { nombre: 'SERGIO LIZARRAGA MARTINEZ' } }],
        },
        state: {
          current_state: 'ESTADO_4',
          state_status: {},
          required_missing: ['compradores[0].persona_fisica.estado_civil'],
          blocking_reasons: [],
          allowed_actions: ['ASK_FOR_DATA'],
          wizard_state: { current_step: 4, total_steps: 6, steps: [], can_finalize: false },
        },
      }
    },
  } as any)

  const res = await handler(
    buildRequest({
      tramiteId: '22222222-2222-4222-8222-222222222222',
      updates: [{ path: 'compradores[0].persona_fisica.nombre', value: 'SERGIO LIZARRAGA MARTINEZ' }],
      source: 'manual',
    })
  )

  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(Boolean(json?.ok), true)
  assert.equal(String(receivedArgs?.source || ''), 'manual')
  assert.equal(String(receivedArgs?.proposedUpdates?.[0]?.path || ''), 'compradores[0].persona_fisica.nombre')
  assert.equal(String(json?.data?.compradores?.[0]?.persona_fisica?.nombre || ''), 'SERGIO LIZARRAGA MARTINEZ')
})

test('manual-update responde 422 cuando dominio rechaza el path/valor', async () => {
  const handler = createPreavisoManualUpdateHandler({
    getCurrentUserFromRequest: async () => ({
      id: 'user-id',
      auth_user_id: 'auth-user-id',
      rol: 'admin',
      activo: true,
    }),
    findTramiteScope: async () => ({ id: 'tramite-id', tipo: 'preaviso', user_id: 'user-id' }),
    commitProposedUpdates: async () => {
      throw new ProposedUpdateDomainViolationError('Path no permitido para commit: compradores[].nombre')
    },
  } as any)

  const res = await handler(
    buildRequest({
      tramiteId: '22222222-2222-4222-8222-222222222222',
      updates: [{ path: 'compradores[].nombre', value: 'X' }],
      source: 'manual',
    })
  )

  assert.equal(res.status, 422)
  const json = await res.json()
  assert.equal(String(json?.error?.code || ''), 'DOMAIN_RULE_VIOLATION')
})

