import test from 'node:test'
import assert from 'node:assert/strict'
import { PreavisoProposedUpdateService } from '@/lib/services/preaviso-proposed-update-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { ActivityLogService } from '@/lib/services/activity-log-service'

test('commit de estado_civil preserva comprador existente y no borra nombre/tipo_persona', async () => {
  const originalFind = TramiteService.findTramiteById
  const originalUpdate = TramiteService.updateTramite
  const originalLog = ActivityLogService.logUserEvent

  try {
    ;(TramiteService as any).findTramiteById = async () => ({
      id: 'tramite-1',
      tipo: 'preaviso',
      datos: {
        compradores: [
          {
            party_id: 'comprador_1',
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              nombre: 'SERGIO LIZARRAGA MARTINEZ',
            },
          },
        ],
      },
    })
    ;(TramiteService as any).updateTramite = async (_id: string, updates: any) => ({
      id: 'tramite-1',
      tipo: 'preaviso',
      datos: updates?.datos || {},
    })
    ;(ActivityLogService as any).logUserEvent = async () => null

    const result = await PreavisoProposedUpdateService.commit({
      tramiteId: 'tramite-1',
      userId: 'user-1',
      traceId: 'trace-1',
      proposedUpdates: [
        {
          op: 'set',
          path: 'compradores[0].persona_fisica.estado_civil',
          value: 'soltero',
        },
      ],
    })

    const buyer0 = (result.data as any)?.compradores?.[0]
    assert.equal(String(buyer0?.tipo_persona || ''), 'persona_fisica')
    assert.equal(String(buyer0?.persona_fisica?.nombre || ''), 'SERGIO LIZARRAGA MARTINEZ')
    assert.equal(String(buyer0?.persona_fisica?.estado_civil || ''), 'soltero')
  } finally {
    ;(TramiteService as any).findTramiteById = originalFind
    ;(TramiteService as any).updateTramite = originalUpdate
    ;(ActivityLogService as any).logUserEvent = originalLog
  }
})

test('commit acepta alias compradores[].nombre y lo aplica a path canonico', async () => {
  const originalFind = TramiteService.findTramiteById
  const originalUpdate = TramiteService.updateTramite
  const originalLog = ActivityLogService.logUserEvent

  try {
    ;(TramiteService as any).findTramiteById = async () => ({
      id: 'tramite-1',
      tipo: 'preaviso',
      datos: {
        compradores: [
          {
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              nombre: 'NOMBRE ANTERIOR',
            },
          },
        ],
      },
    })
    ;(TramiteService as any).updateTramite = async (_id: string, updates: any) => ({
      id: 'tramite-1',
      tipo: 'preaviso',
      datos: updates?.datos || {},
    })
    ;(ActivityLogService as any).logUserEvent = async () => null

    const result = await PreavisoProposedUpdateService.commit({
      tramiteId: 'tramite-1',
      userId: 'user-1',
      traceId: 'trace-1',
      proposedUpdates: [
        {
          op: 'set',
          path: 'compradores[].nombre',
          value: 'SERGIO LIZARRAGA MARTINEZ',
        },
      ],
    })

    const buyer0 = (result.data as any)?.compradores?.[0]
    assert.equal(String(buyer0?.persona_fisica?.nombre || ''), 'SERGIO LIZARRAGA MARTINEZ')
  } finally {
    ;(TramiteService as any).findTramiteById = originalFind
    ;(TramiteService as any).updateTramite = originalUpdate
    ;(ActivityLogService as any).logUserEvent = originalLog
  }
})

test('commit permite gravamenes nested con trim y normaliza gravamenes string a objeto', async () => {
  const originalFind = TramiteService.findTramiteById
  const originalUpdate = TramiteService.updateTramite
  const originalLog = ActivityLogService.logUserEvent

  try {
    ;(TramiteService as any).findTramiteById = async () => ({
      id: 'tramite-1',
      tipo: 'preaviso',
      datos: {
        gravamenes: ['BANCO X'],
      },
    })
    ;(TramiteService as any).updateTramite = async (_id: string, updates: any) => ({
      id: 'tramite-1',
      tipo: 'preaviso',
      datos: updates?.datos || {},
    })
    ;(ActivityLogService as any).logUserEvent = async () => null

    const result = await PreavisoProposedUpdateService.commit({
      tramiteId: 'tramite-1',
      userId: 'user-1',
      traceId: 'trace-1',
      proposedUpdates: [
        {
          op: 'set',
          path: 'gravamenes[0].cancelacion_confirmada   ',
          value: true,
        },
        {
          op: 'set',
          path: 'gravamenes[0].institucion',
          value: 'BANCO X',
        },
      ],
    })

    assert.deepEqual((result.data as any).gravamenes, [
      {
        institucion: 'BANCO X',
        cancelacion_confirmada: true,
      },
    ])
  } finally {
    ;(TramiteService as any).findTramiteById = originalFind
    ;(TramiteService as any).updateTramite = originalUpdate
    ;(ActivityLogService as any).logUserEvent = originalLog
  }
})

test('inspectCommitPaths reporta allowlist para gravamenes nested', () => {
  const inspected = PreavisoProposedUpdateService.inspectCommitPaths([
    { op: 'set', path: 'gravamenes[0].cancelacion_confirmada   ', value: true },
    { op: 'set', path: 'gravamenes[0].institucion', value: 'BANCO X' },
  ])

  assert.deepEqual(inspected.attempted_paths, [
    'gravamenes[0].cancelacion_confirmada',
    'gravamenes[0].institucion',
  ])
  assert.equal(inspected.path_checks.every((x) => x.allowlist_match === true), true)
  assert.equal(inspected.rejected_path, null)
})
