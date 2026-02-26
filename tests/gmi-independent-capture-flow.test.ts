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

test('routeAnswerEvents detecta confirmacion de cancelacion de gravamen con "si se cancelara"', () => {
  const routed = GMIIndependentCaptureFlow.routeAnswerEvents({
    message: 'si se cancelara',
    requiredMissing: ['gravamenes[0].cancelacion_confirmada'],
  })

  const eventTypes = routed.events.map((event) => event.type)
  assert.equal(eventTypes.includes('ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA'), true)
  const updateMap = new Map<string, unknown>(
    routed.updates.map((update) => [String((update as any)?.path || ''), (update as any)?.value])
  )
  assert.equal(updateMap.get('gravamenes[0].cancelacion_confirmada'), true)
  assert.equal(routed.updates.length > 0, true)
})

test('routeAnswerEvents detecta confirmacion negativa de cancelacion de gravamen con "no"', () => {
  const routed = GMIIndependentCaptureFlow.routeAnswerEvents({
    message: 'no',
    requiredMissing: ['gravamenes[0].cancelacion_confirmada'],
  })
  const updateMap = new Map<string, unknown>(
    routed.updates.map((update) => [String((update as any)?.path || ''), (update as any)?.value])
  )
  assert.equal(updateMap.get('gravamenes[0].cancelacion_confirmada'), false)
})

test('routeAnswerEvents normaliza gravamenes legado string a objeto cuando compila cancelacion', () => {
  const routed = GMIIndependentCaptureFlow.routeAnswerEvents({
    message: 'si se cancelara',
    requiredMissing: ['gravamenes[0].cancelacion_confirmada'],
    collectedData: {
      gravamenes: ['BANCO DEL BAJIO, SOCIEDAD ANONIMA'],
    },
  })

  const updateMap = new Map<string, unknown>(
    routed.updates.map((update) => [String((update as any)?.path || ''), (update as any)?.value])
  )
  assert.deepEqual(updateMap.get('gravamenes'), [
    {
      institucion: 'BANCO DEL BAJIO, SOCIEDAD ANONIMA',
      cancelacion_confirmada: null,
    },
  ])
  assert.equal(updateMap.get('gravamenes[0].cancelacion_confirmada'), true)
})

test('GMIIndependentCaptureFlow captura credito + institucion en el mismo mensaje cuando falta existencia_credito', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para inferencia local de credito + institucion')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'se realizara con un credito con banco mercantil del norte',
      requiredMissing: ['existencia_credito'],
      collectedData: {},
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('actosNotariales.aperturaCreditoComprador'), true)
    assert.deepEqual(map.get('creditos'), [{ institucion: null, participantes: [] }])
    assert.equal(map.get('creditos[0].institucion'), 'BANCO MERCANTIL DEL NORTE')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow hace role-closure cuando hay 2 personas y usuario asigna conyuge con typo leve', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para role-closure determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'armida es la conyuge',
      requiredMissing: [
        'compradores[]',
        'compradores[].tipo_persona',
        'compradores[].persona_fisica.conyuge.nombre',
        'compradores[0].persona_fisica.estado_civil',
      ],
      collectedData: {
        documentos: ['1763578352094_Actadematrimonio_1.pdf'],
        personas_detectadas_no_clasificadas: [
          { nombre: 'JOSE GUADALUPE MURILLO SANDOVAL' },
          { nombre: 'ARMINDA FERRA JUSTO' },
        ],
      },
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.conyuge.nombre'), 'ARMINDA FERRA JUSTO')
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE MURILLO SANDOVAL')
    assert.equal(map.get('compradores[0].tipo_persona'), 'persona_fisica')
    assert.equal(map.get('compradores[0].persona_fisica.estado_civil'), 'casado')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow no deduce comprador por cierre cuando hay mas de 2 personas detectadas', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para prueba de no-cierre')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'arminda es la conyuge',
      requiredMissing: [
        'compradores[]',
        'compradores[].tipo_persona',
        'compradores[].persona_fisica.conyuge.nombre',
      ],
      collectedData: {
        personas_detectadas_no_clasificadas: [
          { nombre: 'JOSE GUADALUPE MURILLO SANDOVAL' },
          { nombre: 'ARMINDA FERRA JUSTO' },
          { nombre: 'OTRA PERSONA MAS' },
        ],
      },
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.conyuge.nombre'), 'ARMINDA FERRA JUSTO')
    assert.equal(map.has('compradores[0].persona_fisica.nombre'), false)
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow compila evento comprador cuando mensaje responde "El comprador es ..."', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para evento comprador determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'EL COMPRADOR es JOSE GUADALUPE SANDOVAL MURILLO',
      requiredMissing: ['compradores[]', 'compradores[].nombre', 'compradores[].tipo_persona'],
      collectedData: {},
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow compila evento vendedor con persona moral cuando mensaje responde "El vendedor es ..."', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para evento vendedor determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'EL VENDEDOR es INMOBILIARIA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION',
      requiredMissing: ['vendedores[]', 'vendedores[].tipo_persona'],
      collectedData: {},
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('vendedores[0].tipo_persona'), 'persona_moral')
    assert.equal(
      map.get('vendedores[0].persona_moral.denominacion_social'),
      'INMOBILIARIA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION'
    )
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow evita calle greedy y segmenta mensaje multi-campo', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para segmentacion multi-campo determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const message = [
      'CONJ. HABITACIONAL: CONDOMINIO D-2 CONSTRUIDO EN EL LOTE 43, RESULTANTE DE LA RELOTIFICACION DE LOS LOTES 34, 35, 36 Y 37 DE LA MANZANA 831 DE DESARROLLO HABITACIONAL VISTA BUGAMBILIAS, DE ESTA CIUDAD.',
      'se tiene un gravamen hipotecario vigente',
      'EL VENDEDOR es INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE',
      'EL COMPRADOR es JOSE GUADALUPE SANDOVAL MURILLO',
      'el pago se realiza con credito BANCO MERCANTIL DEL NORTE',
    ].join(' ')
    const result = await flow.process({
      message,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })

    const map = toUpdateMap(result)
    const calle = String(map.get('inmueble.direccion.calle') || '')
    assert.equal(/\b(VENDEDOR|COMPRADOR|GRAVAMEN|CREDITO)\b/i.test(calle), false)
    assert.equal(map.get('vendedores[0].tipo_persona'), 'persona_moral')
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(map.get('inmueble.existe_hipoteca'), true)
    assert.equal(map.get('actosNotariales.aperturaCreditoComprador'), true)
    assert.deepEqual(map.get('creditos'), [{ institucion: null, participantes: [] }])
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow captura folio + partida + direccion segura en mensaje clasico completo', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para extraccion determinista de inmueble')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const message = [
      'PARTIDA NO: 6431741',
      'FOLIO REAL: 1782485',
      'CONJ. HABITACIONAL: CONDOMINIO D-2 CONSTRUIDO EN EL LOTE 43 DE DESARROLLO HABITACIONAL VISTA BUGAMBILIAS, DE ESTA CIUDAD.',
      'un terreno de 200 m2',
      'EL VENDEDOR es INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE.',
      'EL COMPRADOR es JOSE GUADALUPE SANDOVAL MURILLO.',
      'Se tiene un gravamen hipotecario vigente y el pago sera con credito BANCO MERCANTIL DEL NORTE.',
    ].join(' ')
    const result = await flow.process({
      message,
      requiredMissing: REQUIRED_MISSING_BASE,
      collectedData: {},
    })

    const map = toUpdateMap(result)
    const calle = String(map.get('inmueble.direccion.calle') || '')
    assert.equal(map.get('inmueble.folio_real'), '1782485')
    assert.deepEqual(map.get('inmueble.partidas'), ['6431741'])
    assert.equal(map.get('inmueble.superficie'), '200 m2')
    assert.equal(/\b(VENDEDOR|COMPRADOR|GRAVAMEN|CREDITO)\b/i.test(calle), false)
    assert.equal(/\bterreno\s+de\s+200\s*m2\b/i.test(calle), false)
    assert.equal(calle.length >= 30, true)
    assert.equal(map.get('vendedores[0].tipo_persona'), 'persona_moral')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow no setea direccion.calle cuando input largo no tiene marcador semantico claro', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ applies: false, op: 'set', path: 'inmueble.direccion.calle', value: null }) }],
          },
        },
      ],
    }),
  })) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message:
        'CONJ. HABITACIONAL: CONDOMINIO D-2 EN LOTE 43 CON DESCRIPCION EXTENSA DEL OBJETO INMOBILIARIO Y MUCHOS DETALLES ADICIONALES DE REFERENCIA REGISTRAL Y UBICACION FISICA QUE SUPERAN LONGITUD ESPERADA SIN MARCADORES DE OTROS CAMPOS Y CON TEXTO EXTRA PARA REBASAR EL UMBRAL DE LONGITUD EN EL BLOQUE DE DIRECCION SIN SEPARADORES SEMANTICOS EXPLICITOS NI ETIQUETAS DE VENDEDOR O COMPRADOR',
      requiredMissing: ['inmueble.direccion'],
      collectedData: {},
    })

    const map = toUpdateMap(result)
    assert.equal(map.has('inmueble.direccion.calle'), false)
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow detecta comprador + conyuge en mensaje clasico completo MAYUSCULAS', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para sectionizer determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const message = [
      'PARTIDA NO: 6431741',
      'FOLIO REAL: 1782485',
      'UNIDAD:6D CONJ. HABITACIONAL: CONDOMINIO D-2 CONSTRUIDO EN EL LOTE 43 DE DESARROLLO HABITACIONAL VISTA BUGAMBILIAS, DE ESTA CIUDAD.',
      'SE TIENE UN GRAVAMEN CON BANCO DEL BAJIO, SOCIEDAD ANONIMA, INSTITUCION DE BANCA MULTIPLE.',
      'EL VENDEDOR ES INMOBILIARIA Y DESARROLLADORA ENCASA SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE.',
      'EL COMPRADOR ES JOSE GUADALUPE SANDOVAL MURILLO JUNTO CON SU ESPOSA ARMIDA FERRA JUSTO.',
      'EL PAGO DEL INMUEBLE SE REALIZARA MEDIANTE UN CREDITO DE BANCO MERCANTIL DEL NORTE.',
    ].join(' ')

    const result = await flow.process({
      message,
      requiredMissing: [
        'inmueble.folio_real',
        'inmueble.partidas',
        'inmueble.direccion',
        'vendedores[]',
        'vendedores[].tipo_persona',
        'compradores[]',
        'compradores[].tipo_persona',
        'existencia_credito',
        'compradores[].persona_fisica.conyuge.nombre',
      ],
      collectedData: {},
    })

    const map = toUpdateMap(result)
    assert.equal(map.get('inmueble.folio_real'), '1782485')
    assert.deepEqual(map.get('inmueble.partidas'), ['6431741'])
    assert.equal(map.get('vendedores[0].tipo_persona'), 'persona_moral')
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE GUADALUPE SANDOVAL MURILLO')
    assert.equal(map.get('compradores[0].persona_fisica.conyuge.nombre'), 'ARMIDA FERRA JUSTO')
    assert.equal(map.get('actosNotariales.aperturaCreditoComprador'), true)
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow captura comprador sin dos puntos: "el comprador es X"', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para comprador determinista sin dos puntos')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'el COMPRADOR es JOSE LUIS PEREZ GOMEZ',
      requiredMissing: ['compradores[]', 'compradores[].tipo_persona'],
      collectedData: {},
    })
    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE LUIS PEREZ GOMEZ')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow captura compradores multiples en "compradores: A y B"', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para compradores multiples deterministas')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'compradores: JOSE LUIS PEREZ GOMEZ y MARIA ELENA RAMIREZ LOPEZ',
      requiredMissing: ['compradores[]', 'compradores[].tipo_persona'],
      collectedData: {},
    })
    const map = toUpdateMap(result)
    assert.equal(map.get('compradores[0].persona_fisica.nombre'), 'JOSE LUIS PEREZ GOMEZ')
    assert.equal(map.get('compradores[1].persona_fisica.nombre'), 'MARIA ELENA RAMIREZ LOPEZ')
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow compila credito explicito y cubre existencia_credito', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para credito determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'el pago del inmueble se realizara mediante un credito de BANCO MERCANTIL DEL NORTE',
      requiredMissing: ['existencia_credito'],
      collectedData: {},
    })
    const map = toUpdateMap(result)
    assert.equal(map.get('actosNotariales.aperturaCreditoComprador'), true)
    assert.deepEqual(map.get('creditos'), [{ institucion: null, participantes: [] }])
    assert.equal(String(map.get('creditos[0].institucion') || '').includes('BANCO MERCANTIL DEL NORTE'), true)
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})

test('GMIIndependentCaptureFlow compila gravamen explicito con institucion', async () => {
  const prevApiKey = process.env.GMI_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GMI_API_KEY = 'test-key'
  globalThis.fetch = (async () => {
    throw new Error('No deberia llamar red para gravamen determinista')
  }) as any

  try {
    const flow = new GMIIndependentCaptureFlow()
    const result = await flow.process({
      message: 'se tiene un gravamen con BANCO DEL BAJIO, SOCIEDAD ANONIMA, INSTITUCION DE BANCA MULTIPLE',
      requiredMissing: ['gravamenes', 'inmueble.existe_hipoteca'],
      collectedData: {},
    })
    const map = toUpdateMap(result)
    assert.equal(map.get('inmueble.existe_hipoteca'), true)
    assert.equal(Array.isArray(map.get('gravamenes')), true)
    assert.equal((map.get('gravamenes') as any[]).length > 0, true)
  } finally {
    globalThis.fetch = originalFetch
    if (prevApiKey === undefined) delete process.env.GMI_API_KEY
    else process.env.GMI_API_KEY = prevApiKey
  }
})
