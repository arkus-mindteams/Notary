import test from 'node:test'
import assert from 'node:assert/strict'
import { GMIIndependentCaptureFlow } from '@/lib/ai/routing/gmi-independent-capture-flow'

const REQUIRED_MISSING_BASE = [
  'inmueble.folio_real',
  'inmueble.partidas',
  'inmueble.direccion',
  'vendedores[]',
  'vendedores[].tipo_persona',
  'compradores[]',
  'compradores[].tipo_persona',
  'compradores[0].persona_fisica.estado_civil',
  'compradores[].persona_fisica.conyuge.nombre',
  'inmueble.existe_hipoteca',
  'gravamenes',
  'actosNotariales.cancelacionCreditoVendedor',
  'actosNotariales.aperturaCreditoComprador',
  'creditos[]',
]

function toUpdateMap(result: Awaited<ReturnType<GMIIndependentCaptureFlow['process']>>) {
  const map = new Map<string, unknown>()
  for (const update of result.proposed_updates || []) {
    const path = String((update as any)?.path || '').trim()
    if (!path) continue
    map.set(path, (update as any)?.value)
  }
  return map
}

test('GMIIndependentCaptureFlow cubre 5 variaciones semanticas (estado civil + gravamen + credito)', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red en fallback heuristico de variaciones')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const commonPrefix = [
      'PARTIDA NO: 6431741',
      'FOLIO REAL: 1782485',
      'UNIDAD: 6D',
      'CONJ. HABITACIONAL: CONDOMINIO D-2 CONSTRUIDO EN EL LOTE 43, RESULTANTE DE LA RELOTIFICACION DE LOS LOTES 34, 35, 36 Y 37 DE LA MANZANA 831 DE DESARROLLO HABITACIONAL VISTA BUGAMBILIAS, DE ESTA CIUDAD.',
      'VENDEDOR: INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE.',
    ].join('\n')

    const variation1 = `${commonPrefix}
COMPRADOR: JOSE GUADALUPE SANDOVAL MURILLO, CASADO CON ARMINDA FERRA JUSTO.
EL INMUEBLE SE TRANSMITE LIBRE DE GRAVAMEN.`
    const v1 = await flow.process({
      message: variation1,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })
    const m1 = toUpdateMap(v1)
    assert.equal(m1.get('inmueble.folio_real'), '1782485')
    assert.equal(m1.get('vendedores[0].tipo_persona'), 'persona_moral')
    assert.equal(
      m1.get('vendedores[0].persona_moral.denominacion_social'),
      'INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE'
    )
    assert.equal(m1.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(m1.get('compradores[0].persona_fisica.conyuge.nombre'), 'ARMINDA FERRA JUSTO')
    assert.equal(m1.get('compradores[0].persona_fisica.estado_civil'), 'casado')
    assert.equal(m1.get('inmueble.existe_hipoteca'), false)
    assert.deepEqual(m1.get('gravamenes'), [])

    const variation2 = `${commonPrefix}
COMPRADOR: JOSE GUADALUPE SANDOVAL MURILLO, CASADO CON ARMINDA FERRA JUSTO.
EL INMUEBLE PRESENTA GRAVAMEN HIPOTECARIO, MISMO QUE SERA LIQUIDADO DURANTE LA OPERACION MEDIANTE CREDITO OTORGADO POR INSTITUCION BANCARIA.`
    const v2 = await flow.process({
      message: variation2,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })
    const m2 = toUpdateMap(v2)
    assert.equal(m2.get('inmueble.existe_hipoteca'), true)
    assert.equal(m2.get('actosNotariales.cancelacionCreditoVendedor'), true)
    assert.equal(m2.get('actosNotariales.aperturaCreditoComprador'), true)
    assert.deepEqual(m2.get('creditos'), [{ institucion: null, participantes: [] }])

    const variation3 = `${commonPrefix}
COMPRADOR: JOSE GUADALUPE SANDOVAL MURILLO, CASADO CON ARMINDA FERRA JUSTO.
EL INMUEBLE CUENTA CON GRAVAMEN HIPOTECARIO QUE PERMANECERA VIGENTE POSTERIOR A LA OPERACION.`
    const v3 = await flow.process({
      message: variation3,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })
    const m3 = toUpdateMap(v3)
    assert.equal(m3.get('inmueble.existe_hipoteca'), true)
    assert.equal(m3.get('actosNotariales.cancelacionCreditoVendedor'), false)

    const variation4 = `${commonPrefix}
COMPRADOR: JOSE GUADALUPE SANDOVAL MURILLO, SOLTERO.
EL INMUEBLE SE TRANSMITE LIBRE DE GRAVAMEN.`
    const v4 = await flow.process({
      message: variation4,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })
    const m4 = toUpdateMap(v4)
    assert.equal(m4.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(m4.get('compradores[0].persona_fisica.estado_civil'), 'soltero')
    assert.equal(m4.has('compradores[0].persona_fisica.conyuge.nombre'), false)
    assert.equal(m4.get('inmueble.existe_hipoteca'), false)

    const variation5 = `${commonPrefix}
COMPRADOR: JOSE GUADALUPE SANDOVAL MURILLO, SOLTERO.
EL INMUEBLE PRESENTA GRAVAMEN HIPOTECARIO, EL CUAL SERA LIQUIDADO EN LA MISMA OPERACION MEDIANTE FINANCIAMIENTO BANCARIO.`
    const v5 = await flow.process({
      message: variation5,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })
    const m5 = toUpdateMap(v5)
    assert.equal(m5.get('compradores[0].persona_fisica.estado_civil'), 'soltero')
    assert.equal(m5.get('inmueble.existe_hipoteca'), true)
    assert.equal(m5.get('actosNotariales.cancelacionCreditoVendedor'), true)
    assert.equal(m5.get('actosNotariales.aperturaCreditoComprador'), true)
    assert.deepEqual(m5.get('creditos'), [{ institucion: null, participantes: [] }])
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow captura tipo_persona con respuesta corta cuando falta vendedor', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para respuesta corta de tipo_persona')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'fisica',
      requiredMissing: ['vendedores[]', 'vendedores[].tipo_persona'],
      collectedData: {},
    })

    const updates = (result.proposed_updates || []) as Array<Record<string, unknown>>
    const typeUpdate = updates.find((u) => String(u?.path || '') === 'vendedores[0].tipo_persona')
    assert.ok(typeUpdate, 'Debe proponer update para tipo_persona de vendedor')
    assert.equal(String(typeUpdate?.value || ''), 'persona_fisica')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow captura oportunisticamente multiple campos aunque required_missing sea vendedor', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para captura oportunista estructurada')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: [
        'PARTIDA NO: 6431741',
        'FOLIO REAL: 1782485',
        'CONJ. HABITACIONAL: CONDOMINIO D-2 CONSTRUIDO EN EL LOTE 43.',
        'VENDEDOR: INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE.',
        'COMPRADOR: JOSE GUADALUPE SANDOVAL MURILLO, CASADO CON ARMINDA FERRA JUSTO.',
        'EL INMUEBLE SE TRANSMITE LIBRE DE GRAVAMEN.',
      ].join('\n'),
      requiredMissing: ['vendedores[]', 'vendedores[].tipo_persona'],
      collectedData: {},
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('vendedores[0].tipo_persona'), 'persona_moral')
    assert.equal(
      map.get('vendedores[0].persona_moral.denominacion_social'),
      'INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE'
    )
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(map.get('compradores[0].persona_fisica.estado_civil'), 'casado')
    assert.equal(map.get('inmueble.folio_real'), '1782485')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow captura compra de contado en respuesta corta', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para respuesta corta de contado')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'compra de contado',
      requiredMissing: ['existencia_credito'],
      collectedData: {},
    })

    const updates = (result.proposed_updates || []) as Array<Record<string, unknown>>
    const creditosUpdate = updates.find((u) => String(u?.path || '') === 'creditos')
    assert.ok(creditosUpdate, 'Debe proponer update para creditos')
    assert.deepEqual(creditosUpdate?.value, [])
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow resuelve comprador por referencia "esposo del acta"', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para referencia contextual de acta')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'el comprador es el esposo del acta que adjunto',
      requiredMissing: [
        'compradores[]',
        'compradores[].tipo_persona',
        'compradores[0].persona_fisica.estado_civil',
        'compradores[].persona_fisica.conyuge.nombre',
      ],
      collectedData: {
        conyuges_detectados: [
          { nombre: 'JOSE GUADALUPE SANDOVAL MURILLO', sexo: 'hombre' },
          { nombre: 'ARMINDA FERRA JUSTO', sexo: 'mujer' },
        ],
      },
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(map.get('compradores[0].persona_fisica.conyuge.nombre'), 'ARMINDA FERRA JUSTO')
    assert.equal(map.get('compradores[0].persona_fisica.estado_civil'), 'casado')
    assert.equal(map.get('compradores[0].tipo_persona'), 'persona_fisica')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow resuelve comprador por referencia a INE/constancia cuando hay una persona detectada', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para referencia contextual de INE/constancia')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'el comprador es el siguiente y adjunto su ine',
      requiredMissing: ['compradores[]', 'compradores[].tipo_persona'],
      collectedData: {
        personas_detectadas_no_clasificadas: [{ nombre: 'JOSE GUADALUPE SANDOVAL MURILLO' }],
      },
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(map.get('compradores[0].tipo_persona'), 'persona_fisica')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow asigna rol comprador desde personas detectadas cuando usuario dice "es el comprador"', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para asignacion de rol comprador')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'es el comprador',
      lastQuestionIntent: 'comprador',
      pendingQuestions: ['Indica quien es el comprador.'],
      requiredMissing: ['compradores[]', 'compradores[].tipo_persona'],
      collectedData: {
        personas_detectadas_no_clasificadas: [{ nombre: 'JOSE GUADALUPE SANDOVAL MURILLO' }],
      },
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(map.get('compradores[0].tipo_persona'), 'persona_fisica')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow resuelve participantes de credito cuando usuario dice "el unico participante es el comprador"', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para inferencia de participantes de credito')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'el unico participante es el comprador',
      requiredMissing: ['creditos[0].participantes[]'],
      collectedData: {
        compradores: [
          {
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              nombre: 'JOSE GUADALUPE SANDOVAL MURILLO',
            },
          },
        ],
      },
    })

    const map = toUpdateMap(result)
    assert.deepEqual(map.get('creditos[0].participantes'), [
      {
        party_id: null,
        nombre: 'JOSE GUADALUPE SANDOVAL MURILLO',
        rol: 'acreditado',
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})
