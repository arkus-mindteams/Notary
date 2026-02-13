import { PreavisoWizardStateService } from '../lib/services/preaviso-wizard-state-service'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const baseContext = {
  tipoOperacion: 'compraventa',
  creditos: [],
  vendedores: [
    {
      tipo_persona: 'persona_moral',
      persona_moral: { denominacion_social: 'INMOBILIARIA DEMO SA DE CV' },
      titular_registral_confirmado: true,
    },
  ],
  compradores: [
    {
      tipo_persona: 'persona_fisica',
      persona_fisica: {
        nombre: 'JOSE DEMO',
        estado_civil: 'soltero',
      },
    },
  ],
  inmueble: {
    folio_real: '1782485',
    partidas: ['6431741'],
    direccion: {
      calle: 'CALLE DEMO',
      numero: '123',
      colonia: 'CENTRO',
      municipio: 'TIJUANA',
      estado: 'BAJA CALIFORNIA',
      codigo_postal: '22000',
    },
    existe_hipoteca: false,
    datos_catastrales: {
      lote: '43',
      manzana: '831',
      fraccionamiento: 'VISTA BUGAMBILIAS',
      condominio: 'D-2',
      unidad: '6D',
      modulo: null,
    },
  },
  gravamenes: [],
  documentosProcesados: [],
}

function run() {
  const state1 = PreavisoWizardStateService.fromContext(baseContext)
  assert(state1.total_steps === 6, `total_steps debe ser 6 y fue ${state1.total_steps}`)
  assert(state1.steps.length === state1.total_steps, 'steps.length debe coincidir con total_steps')
  assert(state1.current_step >= 1 && state1.current_step <= state1.total_steps, 'current_step fuera de rango')

  const step6 = state1.steps.find((s) => s.state_id === 'ESTADO_6')
  assert(!!step6, 'No se encontró ESTADO_6 en steps')
  assert(step6!.status === 'completed', `ESTADO_6 debe estar completed si existe_hipoteca=false, fue ${step6!.status}`)

  assert(state1.can_finalize === true, 'can_finalize debe ser true cuando todos los pasos están completos')

  const state2 = PreavisoWizardStateService.fromContext({
    ...baseContext,
    inmueble: {
      ...baseContext.inmueble,
      existe_hipoteca: true,
    },
    gravamenes: [
      {
        tipo: 'hipoteca',
        institucion: 'BANORTE',
        cancelacion_confirmada: false,
      },
    ],
  })
  assert(state2.steps.length === 6, 'Nunca debe haber más de 6 pasos del wizard')
  assert(state2.total_steps === 6, 'Nunca debe reportarse total_steps diferente de 6')
  assert(state2.current_step <= 6, 'Nunca debe reportarse current_step > 6')

  console.log('OK: wizard_state parity checks passed')
}

run()

