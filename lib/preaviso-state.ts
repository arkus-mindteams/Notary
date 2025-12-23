export interface PreavisoStateSnapshot {
  current_state: string
  state_status: Record<string, string>
  required_missing: string[]
  blocking_reasons: string[]
  allowed_actions: string[]
}

export interface PreavisoStateComputation {
  state: PreavisoStateSnapshot
  derived: {
    documentosProcesados: any[]
    docInscripcion: any | null
    infoInscripcion: any
    tipoOperacion: any
    creditosProvided: boolean
    creditos: any[] | undefined
    creditosArr: any[]
    tieneCreditos: boolean
    necesitaCredito: boolean | undefined
    inmueble: any
    folioReal: any
    partidas: any[]
    seccion: any
    direccion: any
    superficie: any
    valor: any
    vendedores: any[]
    compradores: any[]
    primerVendedor: any
    titularRegistral: any
    vendedorNombre: any
    vendedorTipoPersona: any
    anyBuyerCasado: boolean
    capturedData: any
  }
}

/**
 * Calcula el estado del flujo de preaviso de manera determinista en el backend.
 * - No contiene reglas legales (eso vive en PROMPT 2)
 * - Decide únicamente completitud / faltantes / bloqueo para control de flujo
 */
export function computePreavisoState(context?: any): PreavisoStateComputation {
  const normalizeForMatch = (value: any): string => {
    const s = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quitar acentos/diacríticos
      .toLowerCase()
      .replace(/[“”"']/g, '')
      .replace(/[^a-z0-9\s]/g, ' ') // quitar puntuación
      .replace(/\s+/g, ' ')
      .trim()
    return s
  }
  const documentosProcesados = context?.documentosProcesados || []
  const docInscripcion =
    documentosProcesados.find((d: any) => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo') || null
  const infoInscripcion = docInscripcion?.informacionExtraida || {}

  // Determinar estado actual y completitud de cada estado (v1.4)
  let currentState = 'ESTADO_0'
  const stateStatus: Record<string, string> = {
    ESTADO_0: 'automatic',
    ESTADO_1: 'incomplete',
    ESTADO_2: 'incomplete',
    ESTADO_3: 'incomplete',
    ESTADO_4: 'incomplete',
    ESTADO_5: 'not_applicable',
    ESTADO_6: 'incomplete',
    ESTADO_8: 'pending',
  }

  const tipoOperacion = context?.tipoOperacion || 'compraventa'

  // Forma de pago (v1.4):
  // - context.creditos undefined => forma de pago NO confirmada
  // - [] => contado confirmado
  // - [..] => crédito confirmado
  const creditosProvided = context?.creditos !== undefined
  const creditos = context?.creditos as any[] | undefined
  const creditosArr = Array.isArray(creditos) ? creditos : []
  const tieneCreditos = (creditos?.length || 0) > 0
  const necesitaCredito = tieneCreditos ? true : (creditosProvided ? false : undefined)

  // Inmueble / registro (usa contexto + extracción)
  const inmueble = context?.inmueble
  const folioReal = inmueble?.folio_real || infoInscripcion.folioReal
  const partidasFromInmueble = Array.isArray(inmueble?.partidas)
    ? inmueble.partidas
    : (inmueble?.partida ? [inmueble.partida] : [])
  const partidasFromDoc = Array.isArray(infoInscripcion.partidas)
    ? infoInscripcion.partidas
    : (infoInscripcion.partida ? [infoInscripcion.partida] : [])
  const partidas = [...partidasFromInmueble, ...partidasFromDoc].filter(Boolean)
  // La "sección" puede venir del documento, pero NO bloquea
  const seccion = inmueble?.seccion || infoInscripcion.seccion
  const direccionCompleta = inmueble?.direccion
  const direccion = direccionCompleta?.calle
    ? `${direccionCompleta.calle} ${direccionCompleta.numero || ''} ${direccionCompleta.colonia || ''}`.trim()
    : inmueble?.direccion?.calle || infoInscripcion.ubicacion || infoInscripcion.direccion
  const superficie = inmueble?.superficie || infoInscripcion.superficie
  const valor = inmueble?.valor || infoInscripcion.valor

  // Nota: "valor" NO es obligatorio para avanzar (solo se captura si el usuario lo proporciona/confirmar).
  const estado2Completo = !!(folioReal && (partidas?.length || 0) > 0 && direccion && superficie)
  stateStatus.ESTADO_2 = estado2Completo ? 'completed' : 'incomplete'

  // Vendedor/titular
  const vendedores = context?.vendedores || []
  const primerVendedor = vendedores[0]
  const vendedorNombre =
    primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social || infoInscripcion.propietario?.nombre
  const vendedorTipoPersona = primerVendedor?.tipo_persona
  // Titular registral idealmente viene del documento; si el usuario ya confirmó explícitamente al vendedor como titular,
  // permitir usar el nombre capturado como referencia para no bloquear el flujo.
  const vendedorConfirmadoComoTitular = primerVendedor?.titular_registral_confirmado === true
  const titularRegistral = infoInscripcion.propietario?.nombre || (vendedorConfirmadoComoTitular ? vendedorNombre : null)

  // Regla de completitud del vendedor (control de flujo):
  // - Si el usuario confirmó explícitamente que el vendedor capturado ES el titular registral
  //   (titular_registral_confirmado=true) y ya tenemos tipo_persona + nombre, considerar COMPLETO
  //   aunque el texto extraído del documento sea muy largo o tenga variaciones.
  // - En caso contrario, requerir match normalizado entre vendedorNombre y titularRegistral.
  if (vendedorConfirmadoComoTitular && vendedorNombre && vendedorTipoPersona) {
    stateStatus.ESTADO_3 = 'completed'
  } else if (vendedorNombre && vendedorTipoPersona && titularRegistral && normalizeForMatch(vendedorNombre) === normalizeForMatch(titularRegistral)) {
    stateStatus.ESTADO_3 = 'completed'
  } else if (vendedorNombre || titularRegistral) {
    stateStatus.ESTADO_3 = 'incomplete'
  }

  // Operación/forma de pago
  stateStatus.ESTADO_1 = tipoOperacion && creditosProvided ? 'completed' : 'incomplete'

  // Compradores
  const compradores = context?.compradores || []
  const primerComprador = compradores[0]
  const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social
  const compradorTipoPersona = primerComprador?.tipo_persona
  // Regla mínima: nombre + tipo_persona; CURP/RFC/CSF no bloqueantes
  if (compradorNombre && compradorTipoPersona) {
    stateStatus.ESTADO_4 = 'completed'
  } else if (compradorNombre || compradorTipoPersona) {
    stateStatus.ESTADO_4 = 'incomplete'
  }

  // Créditos
  // Regla:
  // - Si la forma de pago NO está confirmada (creditosProvided=false) => PASO 5 PENDIENTE (no contar como completo)
  // - Si la forma de pago está confirmada y es contado (creditosProvided=true y creditosArr.length==0) => NO APLICA
  // - Si es crédito => INCOMPLETE/COMPLETED según datos
  if (!creditosProvided) {
    stateStatus.ESTADO_5 = 'pending'
  } else if (creditosArr.length === 0) {
    stateStatus.ESTADO_5 = 'not_applicable'
  } else {
    // Nota: El monto puede quedar pendiente (null) si el usuario explícitamente no lo tiene.
    // Para control de flujo, consideramos completo con institucion + participantes.
    const creditosCompletos = creditosArr.every((c: any) => c.institucion && c.participantes && c.participantes.length > 0)
    stateStatus.ESTADO_5 = creditosCompletos ? 'completed' : 'incomplete'
  }

  // Gravámenes/hipoteca (aplica si registro indica o vendedor declara o ya hay gravámenes)
  const gravamenes = context?.gravamenes || []
  const vendedorDeclaraHipoteca = primerVendedor?.tiene_credito
  const registroIndicaGravamen = !!infoInscripcion.gravamenes
  const hayGravamenesCapturados = Array.isArray(gravamenes) && gravamenes.length > 0

  // existeHipoteca tri-state: true | false | null (desconocido)
  const existeHipoteca =
    registroIndicaGravamen || hayGravamenesCapturados || vendedorDeclaraHipoteca === true
      ? true
      : (vendedorDeclaraHipoteca === false ? false : null)

  if (existeHipoteca === true) {
    // No marcar "completo" solo porque el vendedor dijo que sí hay hipoteca.
    // Se completa cuando la cancelación está confirmada para cada gravamen capturado.
    // Si aún no hay gravámenes capturados, queda INCOMPLETE (porque aplica pero falta capturar/confirmar).
    if (!hayGravamenesCapturados) {
      stateStatus.ESTADO_6 = 'incomplete'
    } else {
      const gravamenesCompletos = gravamenes.every((g: any) => g.cancelacion_confirmada === true)
      stateStatus.ESTADO_6 = gravamenesCompletos ? 'completed' : 'incomplete'
    }
  } else if (existeHipoteca === false) {
    stateStatus.ESTADO_6 = 'not_applicable'
  } else {
    // Desconocido: no asumir "no aplica"
    stateStatus.ESTADO_6 = 'pending'
  }

  // Generación
  const todosCompletos =
    stateStatus.ESTADO_1 === 'completed' &&
    stateStatus.ESTADO_2 === 'completed' &&
    stateStatus.ESTADO_3 === 'completed' &&
    stateStatus.ESTADO_4 === 'completed' &&
    (stateStatus.ESTADO_5 === 'completed' || stateStatus.ESTADO_5 === 'not_applicable') &&
    (stateStatus.ESTADO_6 === 'completed' || stateStatus.ESTADO_6 === 'not_applicable')

  if (todosCompletos) {
    stateStatus.ESTADO_8 = 'ready'
    currentState = 'ESTADO_8'
  }

  // Seleccionar currentState según flujo obligatorio
  if (currentState !== 'ESTADO_8') {
    if (stateStatus.ESTADO_2 !== 'completed') currentState = 'ESTADO_2'
    else if (stateStatus.ESTADO_3 !== 'completed') currentState = 'ESTADO_3'
    else if (stateStatus.ESTADO_1 !== 'completed') currentState = 'ESTADO_1'
    else if (stateStatus.ESTADO_4 !== 'completed') currentState = 'ESTADO_4'
    else if (stateStatus.ESTADO_5 === 'incomplete') currentState = 'ESTADO_5'
    else if (stateStatus.ESTADO_6 === 'incomplete') currentState = 'ESTADO_6'
  }

  // Snapshot de datos capturados (para prompt3 / debug interno)
  const capturedData: any = {
    tipoOperacion: tipoOperacion || null,
    compradores: compradores.length > 0 ? compradores : [],
    vendedores: vendedores.length > 0 ? vendedores : [],
    creditos: creditosProvided ? (creditosArr.length > 0 ? creditosArr : []) : undefined,
    gravamenes: gravamenes.length > 0 ? gravamenes : [],
    inmueble: null,
  }

  if (folioReal || (partidas?.length || 0) > 0 || seccion || direccion || superficie || valor) {
    capturedData.inmueble = {
      folio_real: folioReal || null,
      partidas: partidas || [],
      all_registry_pages_confirmed: inmueble?.all_registry_pages_confirmed || false,
      direccion: inmueble?.direccion || {
        calle: null,
        numero: null,
        colonia: null,
        municipio: null,
        estado: null,
        codigo_postal: null,
      },
      superficie: superficie || null,
      valor: valor || null,
      datos_catastrales: inmueble?.datos_catastrales || {
        lote: null,
        manzana: null,
        fraccionamiento: null,
        condominio: null,
        unidad: null,
        modulo: null,
      },
    }
  }

  const requiredMissing: string[] = []
  const blockingReasons: string[] = []

  if (currentState === 'ESTADO_1') {
    if (!tipoOperacion) requiredMissing.push('tipoOperacion')
    if (!creditosProvided) requiredMissing.push('existencia_credito')
  }

  if (currentState === 'ESTADO_2') {
    if (!folioReal) requiredMissing.push('inmueble.folio_real')
    if ((partidas?.length || 0) === 0) requiredMissing.push('inmueble.partidas')
    if (!direccion) requiredMissing.push('inmueble.direccion')
    if (!superficie) requiredMissing.push('inmueble.superficie')
    // inmueble.valor NO es obligatorio
  }

  if (currentState === 'ESTADO_3') {
    // Si el titular registral ya fue detectado desde la inscripción, NO pedir "vendedores[]" desde cero.
    // En ese caso solo falta confirmar el tipo_persona y capturarlo en estructura v1.4 vía <DATA_UPDATE>.
    if (vendedores.length === 0 && !titularRegistral) requiredMissing.push('vendedores[]')
    if (!vendedorTipoPersona) requiredMissing.push('vendedores[].tipo_persona')
    if (!titularRegistral && !vendedorConfirmadoComoTitular) blockingReasons.push('titular_registral_missing')
    if (vendedorNombre && titularRegistral && normalizeForMatch(vendedorNombre) !== normalizeForMatch(titularRegistral) && !vendedorConfirmadoComoTitular) {
      blockingReasons.push('vendedor_titular_mismatch')
    }
  }

  if (currentState === 'ESTADO_4') {
    if (compradores.length === 0) requiredMissing.push('compradores[]')
    if (!compradorTipoPersona) requiredMissing.push('compradores[].tipo_persona')
  }

  if (currentState === 'ESTADO_5') {
    if (!Array.isArray(creditos) || creditos.length === 0) {
      requiredMissing.push('creditos[]')
    } else {
      creditos.forEach((credito: any, index: number) => {
        if (!credito.institucion) requiredMissing.push(`creditos[${index}].institucion`)
        if (!credito.participantes || credito.participantes.length === 0) requiredMissing.push(`creditos[${index}].participantes[]`)
      })
    }
  }

  if (currentState === 'ESTADO_6') {
    if (existeHipoteca === true && gravamenes.length === 0) {
      requiredMissing.push('gravamenes[]')
    } else if (gravamenes.length > 0) {
      gravamenes.forEach((gravamen: any, index: number) => {
        if (!gravamen.cancelacion_confirmada) requiredMissing.push(`gravamenes[${index}].cancelacion_confirmada`)
      })
    }
  }

  const allowedActions: string[] = []
  if (blockingReasons.length > 0) allowedActions.push('CLARIFY_CONFLICT')
  else if (requiredMissing.length > 0) allowedActions.push('ASK_FOR_DATA')
  else if (currentState === 'ESTADO_8') allowedActions.push('NO_ACTION')
  else allowedActions.push('ASK_FOR_CONFIRMATION')

  const anyBuyerCasado = compradores.some((c: any) => (c?.persona_fisica?.estado_civil || '').toLowerCase() === 'casado')

  return {
    state: {
      current_state: currentState,
      state_status: stateStatus,
      required_missing: requiredMissing,
      blocking_reasons: blockingReasons,
      allowed_actions: allowedActions,
    },
    derived: {
      documentosProcesados,
      docInscripcion,
      infoInscripcion,
      tipoOperacion,
      creditosProvided,
      creditos,
      creditosArr,
      tieneCreditos,
      necesitaCredito,
      inmueble,
      folioReal,
      partidas: partidas || [],
      seccion,
      direccion,
      superficie,
      valor,
      vendedores,
      compradores,
      primerVendedor,
      titularRegistral,
      vendedorNombre,
      vendedorTipoPersona,
      anyBuyerCasado,
      capturedData,
    },
  }
}


