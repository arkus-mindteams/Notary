import test from 'node:test'
import assert from 'node:assert/strict'
import { computePreavisoState } from '@/lib/preaviso-state'

test('ESTADO_5 no se completa con institucion generica/legal', () => {
  const computed = computePreavisoState({
    tipoOperacion: 'compraventa',
    creditos: [
      {
        institucion: 'El cual se otorga en los terminos del Inciso Primero del Articulo 9 (Noveno) de la',
        participantes: [],
      },
    ],
    inmueble: { existe_hipoteca: false },
    folios: { selection: { selected_folio: null, confirmed_by_user: false } },
    vendedores: [
      {
        tipo_persona: 'persona_moral',
        persona_moral: { denominacion_social: 'INMOBILIARIA X' },
      },
    ],
  })

  assert.equal(computed.state.state_status.ESTADO_5, 'incomplete')
})

test('ESTADO_5 se completa con institucion valida', () => {
  const computed = computePreavisoState({
    tipoOperacion: 'compraventa',
    creditos: [
      {
        institucion: 'BANCO MERCANTIL DEL NORTE',
        participantes: [],
      },
    ],
    inmueble: { existe_hipoteca: false },
    vendedores: [
      {
        tipo_persona: 'persona_moral',
        persona_moral: { denominacion_social: 'INMOBILIARIA X' },
      },
    ],
  })

  assert.equal(computed.state.state_status.ESTADO_5, 'completed')
})
