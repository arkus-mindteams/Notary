import test from 'node:test'
import assert from 'node:assert/strict'
import { computePreavisoState } from '@/lib/preaviso-state'

test('ESTADO_6 pendiente debe pedir inmueble.existe_hipoteca', () => {
  const computed = computePreavisoState({
    tipoOperacion: 'compraventa',
    creditos: [],
    inmueble: {
      folio_real: '1782485',
      partidas: ['6431741'],
      direccion: { calle: 'DOMICILIO' },
      // existe_hipoteca intencionalmente omitido => desconocido
    },
    vendedores: [
      {
        tipo_persona: 'persona_moral',
        persona_moral: { denominacion_social: 'INMOBILIARIA X' },
      },
    ],
    compradores: [
      {
        tipo_persona: 'persona_fisica',
        persona_fisica: { nombre: 'JOSE', estado_civil: 'soltero' },
      },
    ],
    gravamenes: [],
  })

  assert.equal(computed.state.current_state, 'ESTADO_6')
  assert.equal(computed.state.state_status.ESTADO_6, 'pending')
  assert.ok(computed.state.required_missing.includes('inmueble.existe_hipoteca'))
})

