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
    foliosRealesCandidates: any[]
    hasMultipleFolios: boolean
    foliosRealesUnidades: string[]
    foliosRealesInmueblesAfectados: string[]
    folioRealScope: 'unidades' | 'inmuebles_afectados' | null
    hasMultipleFolioScopes: boolean
    folioSelection: {
      selected_folio: string | null
      selected_scope: 'unidades' | 'inmuebles_afectados' | 'otros' | null
      confirmed_by_user: boolean
    }
    partidasCandidates: any[]
    hasMultiplePartidas: boolean
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
  const PREAVISO_DEBUG = process.env.PREAVISO_DEBUG === '1'
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
  const inscripcionDocs = Array.isArray(documentosProcesados)
    ? documentosProcesados.filter((d: any) => d?.tipo === 'inscripcion' || d?.tipo === 'escritura' || d?.tipo === 'titulo')
    : []
  // Preferir inscripción si existe (en vez de tomar el primer doc cualquiera).
  const docInscripcion =
    inscripcionDocs.find((d: any) => d?.tipo === 'inscripcion') ||
    inscripcionDocs[0] ||
    null

  // Agregar y deduplicar info de inscripción a través de TODAS las páginas/documentos procesados.
  // Esto evita que a veces solo se muestren "2 folios" (cuando la primera página trae 2) y luego cambien las opciones.
  const mergeFolioKey = (folio: any): string | null => {
    if (folio === undefined || folio === null) return null
    const s = String(folio).trim()
    if (!s) return null
    // Normalizar por dígitos para dedupe estable
    const digits = s.replace(/\D/g, '')
    return digits || s
  }

  const uniqueStrings = (values: any[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of values) {
      if (v === undefined || v === null) continue
      const s = String(v).trim()
      if (!s) continue
      const k = s
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
    }
    return out
  }

  const infos = inscripcionDocs.map((d: any) => d?.informacionExtraida || {})
  const baseInfo = docInscripcion?.informacionExtraida || {}

  const extractFoliosFromLooseValue = (v: any): string[] => {
    if (v === undefined || v === null) return []
    const s = String(v).trim()
    if (!s) return []
    // Caso común: "1764668, 1764669" o "Folio Real: 1764668 1764669"
    const matches = s.match(/\d{6,}/g) || []
    const uniq = Array.from(new Set(matches.map(m => m.replace(/\D/g, '')).filter(Boolean)))
    // Si se detecta al menos un folio por dígitos, usar eso.
    if (uniq.length > 0) return uniq
    // Si no, devolver el string tal cual (fallback conservador)
    return [s]
  }

  const foliosRealesAgg = uniqueStrings(
    infos.flatMap((info: any) => {
      const arr = Array.isArray(info?.foliosReales) ? info.foliosReales : []
      // Expandir elementos de foliosReales[] por si vienen como "1782480, 1782481"
      const fromFoliosRealesArr = arr.flatMap((v: any) => extractFoliosFromLooseValue(v))
      const fromFolioReal = extractFoliosFromLooseValue(info?.folioReal)
      // Algunos modelos llenan folios SOLO en foliosConInfo[].folio
      const foliosConInfo = Array.isArray((info as any)?.foliosConInfo) ? (info as any).foliosConInfo : []
      const fromFoliosConInfo = foliosConInfo.flatMap((f: any) => extractFoliosFromLooseValue(f?.folio))
      return [...fromFoliosRealesArr, ...fromFolioReal, ...fromFoliosConInfo]
    })
  )

  const foliosConInfoMap = new Map<string, any>()
  for (const info of infos) {
    const arr = Array.isArray((info as any)?.foliosConInfo) ? (info as any).foliosConInfo : []
    for (const f of arr) {
      const key = mergeFolioKey(f?.folio)
      if (!key) continue
      const prev = foliosConInfoMap.get(key) || {}
      // Merge simple: preferir valores no vacíos
      foliosConInfoMap.set(key, {
        ...prev,
        ...Object.fromEntries(
          Object.entries(f || {}).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        ),
      })
    }
  }
  const foliosConInfoAgg = Array.from(foliosConInfoMap.values())

  const partidasAgg = uniqueStrings(
    infos.flatMap((info: any) => {
      const tituloArr = Array.isArray(info?.partidasTitulo) ? info.partidasTitulo : []
      const arr = Array.isArray(info?.partidas) ? info.partidas : []
      const one = info?.partida ? [info.partida] : []
      return [...tituloArr, ...arr, ...one]
    })
  )

  const pickFirstNonEmpty = (getter: (info: any) => any): any => {
    for (const info of infos) {
      const v = getter(info)
      if (v === undefined || v === null) continue
      const s = typeof v === 'string' ? v.trim() : v
      if (typeof v === 'string' && !s) continue
      return v
    }
    return null
  }

  const infoInscripcion = {
    ...baseInfo,
    foliosReales: foliosRealesAgg,
    foliosConInfo: foliosConInfoAgg,
    foliosRealesUnidades: uniqueStrings(
      infos.flatMap((info: any) => (Array.isArray(info?.foliosRealesUnidades) ? info.foliosRealesUnidades : []))
    ),
    foliosRealesInmueblesAfectados: uniqueStrings(
      infos.flatMap((info: any) => (Array.isArray(info?.foliosRealesInmueblesAfectados) ? info.foliosRealesInmueblesAfectados : []))
    ),
    partidas: partidasAgg.length > 0 ? partidasAgg : (baseInfo as any).partidas,
    partidasTitulo: uniqueStrings(
      infos.flatMap((info: any) => (Array.isArray(info?.partidasTitulo) ? info.partidasTitulo : []))
    ),
    partidasAntecedentes: uniqueStrings(
      infos.flatMap((info: any) => (Array.isArray(info?.partidasAntecedentes) ? info.partidasAntecedentes : []))
    ),
    seccion: (baseInfo as any).seccion ?? pickFirstNonEmpty((i: any) => i?.seccion),
    ubicacion: (baseInfo as any).ubicacion ?? pickFirstNonEmpty((i: any) => i?.ubicacion),
    direccion: (baseInfo as any).direccion ?? pickFirstNonEmpty((i: any) => i?.direccion),
    superficie: (baseInfo as any).superficie ?? pickFirstNonEmpty((i: any) => i?.superficie),
  }

  // Determinar estado actual y completitud de cada estado (v1.4)
  let currentState = 'ESTADO_0'
  const stateStatus: Record<string, string> = {
    ESTADO_0: 'automatic',
    ESTADO_1: 'incomplete',
    ESTADO_2: 'incomplete',
    ESTADO_3: 'incomplete',
    ESTADO_4: 'incomplete',
    ESTADO_5: 'pending', // Inicialmente pendiente hasta que se confirme la forma de pago
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
  const normalizeDigits = (v: any): string | null => {
    if (v === undefined || v === null) return null
    const digits = String(v).replace(/\D/g, '')
    return digits ? digits : null
  }
  const foliosRealesFromDoc = Array.isArray(infoInscripcion.foliosReales)
    ? infoInscripcion.foliosReales.filter(Boolean)
    : []
  const foliosFromFolioReal = extractFoliosFromLooseValue(infoInscripcion.folioReal)
  const foliosModel = (context as any)?.folios || {}
  const selectionRaw = foliosModel?.selection || {}
  const folioSelection = {
    selected_folio: selectionRaw?.selected_folio ? String(selectionRaw.selected_folio) : null,
    selected_scope:
      selectionRaw?.selected_scope === 'unidades' ||
      selectionRaw?.selected_scope === 'inmuebles_afectados' ||
      selectionRaw?.selected_scope === 'otros'
        ? selectionRaw.selected_scope
        : null,
    confirmed_by_user: selectionRaw?.confirmed_by_user === true,
  }

  const folioRealScope: 'unidades' | 'inmuebles_afectados' | null =
    folioSelection.selected_scope === 'unidades' || folioSelection.selected_scope === 'inmuebles_afectados'
      ? folioSelection.selected_scope
      : null

  const foliosRealesUnidades = Array.isArray((infoInscripcion as any).foliosRealesUnidades)
    ? (infoInscripcion as any).foliosRealesUnidades.filter(Boolean).map((x: any) => String(x))
    : []
  const foliosRealesInmueblesAfectados = Array.isArray((infoInscripcion as any).foliosRealesInmueblesAfectados)
    ? (infoInscripcion as any).foliosRealesInmueblesAfectados.filter(Boolean).map((x: any) => String(x))
    : []
  const hasMultipleFolioScopes = foliosRealesUnidades.length > 0 && foliosRealesInmueblesAfectados.length > 0

  const candidatesFromModel = Array.isArray(foliosModel?.candidates) ? foliosModel.candidates : []
  const candidatesFromModelForScope = (scope: 'unidades' | 'inmuebles_afectados' | 'otros') =>
    candidatesFromModel.filter((c: any) => (c?.scope || 'otros') === scope).map((c: any) => String(c?.folio || '').replace(/\D/g, '')).filter(Boolean)

  const fromModelUnidades = candidatesFromModelForScope('unidades')
  const fromModelAfectados = candidatesFromModelForScope('inmuebles_afectados')
  const fromModelOtros = candidatesFromModelForScope('otros')

  const baseCandidates = (fromModelUnidades.length + fromModelAfectados.length + fromModelOtros.length) > 0
    ? uniqueStrings([...fromModelUnidades, ...fromModelAfectados, ...fromModelOtros])
    : (foliosRealesFromDoc.length > 0 ? foliosRealesFromDoc : foliosFromFolioReal)
  const scopedCandidates =
    folioRealScope === 'unidades'
      ? (foliosRealesUnidades.length > 0 ? foliosRealesUnidades : baseCandidates)
      : folioRealScope === 'inmuebles_afectados'
        ? (foliosRealesInmueblesAfectados.length > 0 ? foliosRealesInmueblesAfectados : baseCandidates)
        : baseCandidates
  const foliosRealesCandidates = scopedCandidates

  // Si hay múltiples folios detectados y el usuario aún no eligió uno explícitamente,
  // NO asumir ninguno como folio_real para completitud de ESTADO_2.
  const hasMultipleFolios = foliosRealesCandidates.length > 1
  const selectedFolio = folioSelection.selected_folio
  const folioConfirmed = folioSelection.confirmed_by_user === true
  const selectedFolioDigits = normalizeDigits(selectedFolio)
  const folioInCandidates =
    !!selectedFolio &&
    foliosRealesCandidates.some((c: any) => {
      const cd = normalizeDigits(c)
      return cd && selectedFolioDigits ? cd === selectedFolioDigits : String(c) === String(selectedFolio)
    })

  // Folio efectivo:
  // - Si hay múltiples candidatos: solo aceptar folio si fue confirmado por el usuario y pertenece a los candidatos actuales.
  // - Si no hay múltiples: aceptar folio del contexto o el del documento (si existe).
  // Sin default de folio del trámite:
  // - Si hay candidatos y no está confirmado => folioReal = null (siempre pedir confirmación/selección)
  // - Si no hay candidatos => mantener null y pedir al usuario que lo indique
  const hasAnyCandidates = foliosRealesCandidates.length > 0
  // Folio efectivo:
  // - Si hay candidatos (vienen típicamente de hoja de inscripción): exigir confirmación explícita del usuario.
  // - Si NO hay candidatos (captura manual): aceptar `inmueble.folio_real` como fuente directa.
  const folioReal = hasAnyCandidates
    ? (folioConfirmed && folioInCandidates ? selectedFolio : null)
    : (inmueble?.folio_real ? String(inmueble.folio_real) : null)

  if (PREAVISO_DEBUG) {
    console.info('[preaviso-state] folios detectados', {
      foliosRealesFromDoc,
      foliosRealesCandidates,
      selectedFolio,
      folioConfirmed,
      folioInCandidates,
      effectiveFolioReal: folioReal,
    })
  }
  const partidasFromInmueble = Array.isArray(inmueble?.partidas)
    ? inmueble.partidas
    : (inmueble?.partida ? [inmueble.partida] : [])
  const partidasFromDoc = Array.isArray(infoInscripcion.partidas)
    ? infoInscripcion.partidas
    : (infoInscripcion.partida ? [infoInscripcion.partida] : [])
  const partidas = [...partidasFromInmueble, ...partidasFromDoc].filter(Boolean)
  const partidasTituloFromDoc = Array.isArray((infoInscripcion as any).partidasTitulo)
    ? (infoInscripcion as any).partidasTitulo.filter(Boolean)
    : []
  const partidasCandidates = (partidasTituloFromDoc.length > 0 ? partidasTituloFromDoc : partidasFromDoc).filter(Boolean)
  const hasMultiplePartidas = partidasCandidates.length > 1
  // La "sección" puede venir del documento, pero NO bloquea
  const seccion = inmueble?.seccion || infoInscripcion.seccion
  const direccionCompleta = inmueble?.direccion
  const direccion = direccionCompleta?.calle
    ? `${direccionCompleta.calle} ${direccionCompleta.numero || ''} ${direccionCompleta.colonia || ''}`.trim()
    : inmueble?.direccion?.calle || infoInscripcion.ubicacion || infoInscripcion.direccion
  const superficie = inmueble?.superficie || infoInscripcion.superficie
  const valor = inmueble?.valor || infoInscripcion.valor

  // Nota: "valor" NO es obligatorio para avanzar (solo se captura si el usuario lo proporciona/confirmar).
  // Superficie NO debe bloquear el flujo (si el usuario no la tiene o la considera irrelevante).
  const estado2Completo = !!(folioReal && (partidas?.length || 0) > 0 && direccion)
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
  // - Si el vendedor viene del documento (source: 'documento_inscripcion'), también considerarlo completo
  //   porque el documento es fuente de verdad.
  // - Si el vendedor tiene nombre y tipo_persona Y hay propietario en el documento, considerar completo
  //   (el documento es fuente de verdad, no necesita confirmación explícita)
  // - En caso contrario, requerir match normalizado entre vendedorNombre y titularRegistral.
  
  // Verificar si el vendedor viene del documento de inscripción
  const vendedorVieneDelDocumento = primerVendedor?.persona_fisica?.nombre && infoInscripcion.propietario?.nombre ||
                                     primerVendedor?.persona_moral?.denominacion_social && infoInscripcion.propietario?.nombre
  
  if (vendedorConfirmadoComoTitular && vendedorNombre && vendedorTipoPersona) {
    // Confirmado explícitamente por el usuario
    stateStatus.ESTADO_3 = 'completed'
  } else if (vendedorNombre && vendedorTipoPersona && titularRegistral && normalizeForMatch(vendedorNombre) === normalizeForMatch(titularRegistral)) {
    // Match normalizado entre vendedor y titular registral
    stateStatus.ESTADO_3 = 'completed'
  } else if (vendedorNombre && vendedorTipoPersona && infoInscripcion.propietario?.nombre) {
    // Si tenemos nombre y tipo_persona del vendedor Y el documento tiene propietario, considerar completo
    // (el documento es fuente de verdad, no necesita confirmación explícita si viene del documento)
    stateStatus.ESTADO_3 = 'completed'
  } else if (vendedorNombre && vendedorTipoPersona && vendedorVieneDelDocumento) {
    // Si el vendedor viene del documento y tiene nombre + tipo_persona, considerar completo
    // (el documento es fuente de verdad)
    stateStatus.ESTADO_3 = 'completed'
  } else if (vendedorNombre || titularRegistral) {
    stateStatus.ESTADO_3 = 'incomplete'
  }

  // Operación/forma de pago
  // ESTADO_1 está completo SOLO si:
  // 1. tipoOperacion está definido (siempre es 'compraventa')
  // 2. La forma de pago está confirmada (creditosProvided = true)
  //    - creditos = undefined => NO confirmado => ESTADO_1 incomplete
  //    - creditos = [] => Confirmado contado => ESTADO_1 completed
  //    - creditos = [...] => Confirmado crédito => ESTADO_1 completed
  // Si creditosProvided = false, significa que aún no se sabe si será crédito o contado
  stateStatus.ESTADO_1 = tipoOperacion && creditosProvided ? 'completed' : 'incomplete'

  // Compradores
  const compradores = context?.compradores || []
  const primerComprador = compradores[0]
  const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social
  const compradorTipoPersona = primerComprador?.tipo_persona
  // Regla:
  // - Persona moral: nombre + tipo_persona
  // - Persona física: nombre + tipo_persona + estado_civil (para decidir rama de cónyuge y para el documento)
  // CURP/RFC/CSF no bloqueantes.
  const compradorEstadoCivil = primerComprador?.persona_fisica?.estado_civil || null
  const compradorFisicaCompleto =
    compradorTipoPersona === 'persona_fisica' && !!compradorNombre && !!compradorEstadoCivil
  const compradorMoralCompleto = compradorTipoPersona === 'persona_moral' && !!compradorNombre

  if (compradorFisicaCompleto || compradorMoralCompleto) {
    stateStatus.ESTADO_4 = 'completed'
  } else if (compradorNombre || compradorTipoPersona || compradorEstadoCivil) {
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
  const registroIndicaGravamen = (() => {
    const v = (infoInscripcion as any)?.gravamenes
    if (v === null || v === undefined) return false
    if (v === true) return true
    if (v === false) return false
    const s = String(v).trim().toLowerCase()
    if (!s) return false
    // Si el extractor devolvió "null" como string o texto equivalente, no tomarlo como positivo.
    if (s === 'null' || s === 'ninguno' || s === 'ninguna') return false
    // Negaciones típicas
    if (/\b(sin|no)\b/.test(s) && /\b(gravamen|grav[aá]menes|hipoteca|embargo)\b/.test(s)) return false
    // Señales positivas
    if (/\b(gravamen|grav[aá]menes|hipoteca|embargo)\b/.test(s)) return true
    // Conservador: si no es claro, no afirmarlo (se pregunta al usuario en PASO 6)
    return false
  })()
  const hayGravamenesCapturados = Array.isArray(gravamenes) && gravamenes.length > 0
  const inmuebleDeclaraHipoteca = (context?.inmueble as any)?.existe_hipoteca

  // existeHipoteca tri-state: true | false | null (desconocido)
  // NOTA: Si el usuario ya contestó explícitamente (true/false), eso es autoridad para el flujo (no defaults).
  const existeHipoteca =
    inmuebleDeclaraHipoteca === true
      ? true
      : inmuebleDeclaraHipoteca === false
        ? false
        : (registroIndicaGravamen || hayGravamenesCapturados ? true : null)

  if (existeHipoteca === true) {
    // No marcar "completo" solo porque el vendedor dijo que sí hay hipoteca.
    // Se completa cuando ya sabemos "cómo se cancelará" (cancelacion_confirmada true/false) para cada gravamen capturado.
    // Si aún no hay gravámenes capturados, queda INCOMPLETE (porque aplica pero falta capturar).
    if (!hayGravamenesCapturados) {
      stateStatus.ESTADO_6 = 'incomplete'
    } else {
      const gravamenesCompletos = gravamenes.every((g: any) =>
        (g.cancelacion_confirmada === true || g.cancelacion_confirmada === false) &&
        !!g.institucion
      )
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
    // PASOS 5/6: si están "pending" significa que falta hacer la pregunta (no asumir no aplica).
    else if (stateStatus.ESTADO_5 === 'incomplete' || stateStatus.ESTADO_5 === 'pending') currentState = 'ESTADO_5'
    else if (stateStatus.ESTADO_6 === 'incomplete' || stateStatus.ESTADO_6 === 'pending') currentState = 'ESTADO_6'
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
      folio_real_confirmed: inmueble?.folio_real_confirmed === true,
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
    if (!folioReal && hasMultipleFolios) blockingReasons.push('multiple_folio_real_detected')
    if (!folioReal && hasMultipleFolioScopes && !folioRealScope) blockingReasons.push('folio_real_scope_selection_required')
    if (!folioReal && hasAnyCandidates && !hasMultipleFolios && foliosRealesCandidates.length === 1) blockingReasons.push('folio_real_confirmation_required')
    const partidasSeleccionadas = Array.isArray(inmueble?.partidas) ? inmueble.partidas.filter(Boolean) : []
    if (hasMultiplePartidas && partidasSeleccionadas.length !== 1) blockingReasons.push('multiple_partida_detected')
    if ((partidas?.length || 0) === 0) requiredMissing.push('inmueble.partidas')
    if (!direccion) requiredMissing.push('inmueble.direccion')
    // Superficie NO es obligatoria
    // inmueble.valor NO es obligatorio
  }

  if (currentState === 'ESTADO_3') {
    // Si el titular registral ya fue detectado desde la inscripción, NO pedir "vendedores[]" desde cero.
    // En ese caso solo falta confirmar el tipo_persona y capturarlo en estructura v1.4 vía <DATA_UPDATE>.
    if (vendedores.length === 0 && !titularRegistral) requiredMissing.push('vendedores[]')
    if (!vendedorTipoPersona) requiredMissing.push('vendedores[].tipo_persona')
    
    // Si el vendedor viene del documento de inscripción y tiene nombre + tipo_persona, no bloquear
    // (el documento es fuente de verdad)
    const vendedorVieneDelDocumento = primerVendedor && (
      infoInscripcion.propietario?.nombre ||
      primerVendedor.titular_registral_confirmado === true
    )
    
    // Solo bloquear por titular_registral si NO viene del documento
    if (!titularRegistral && !vendedorConfirmadoComoTitular && !vendedorVieneDelDocumento) {
      blockingReasons.push('titular_registral_missing')
    }
    
    // Solo bloquear por mismatch si NO viene del documento y NO está confirmado
    if (vendedorNombre && titularRegistral && normalizeForMatch(vendedorNombre) !== normalizeForMatch(titularRegistral) && !vendedorConfirmadoComoTitular && !vendedorVieneDelDocumento) {
      blockingReasons.push('vendedor_titular_mismatch')
    }
  }

  if (currentState === 'ESTADO_4') {
    if (compradores.length === 0) requiredMissing.push('compradores[]')
    if (!compradorTipoPersona) requiredMissing.push('compradores[].tipo_persona')
    if (compradorTipoPersona === 'persona_fisica' && !compradorEstadoCivil) {
      requiredMissing.push('compradores[0].persona_fisica.estado_civil')
    }
    
    // Verificar compradores adicionales (cónyuges) - NO requerir tipo_persona si es cónyuge
    // Los cónyuges siempre son persona_fisica y se asignan automáticamente
    const comprador0 = compradores[0]
    const conyugeNombre = comprador0?.persona_fisica?.conyuge?.nombre || null
    if (conyugeNombre && compradores.length > 1) {
      for (let i = 1; i < compradores.length; i++) {
        const c = compradores[i]
        const nombreComprador = c?.persona_fisica?.nombre || c?.persona_moral?.denominacion_social || null
        const esConyuge = nombreComprador && conyugeNombre && 
          normalizeForMatch(nombreComprador) === normalizeForMatch(conyugeNombre)
        
        // Si es cónyuge y no tiene tipo_persona, asignarlo automáticamente (pero esto se hace en el código, no aquí)
        // Solo verificar que no se requiera tipo_persona para cónyuges
        if (esConyuge && !c.tipo_persona) {
          // No agregar a requiredMissing - el tipo se asignará automáticamente
          // Esto evita que el sistema pida tipo_persona para cónyuges
        }
      }
    }
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
        if (gravamen.cancelacion_confirmada !== true && gravamen.cancelacion_confirmada !== false) {
          requiredMissing.push(`gravamenes[${index}].cancelacion_confirmada`)
        }
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
      foliosRealesCandidates,
      hasMultipleFolios,
      foliosRealesUnidades,
      foliosRealesInmueblesAfectados,
      folioRealScope,
      hasMultipleFolioScopes,
      folioSelection,
      partidasCandidates: partidasCandidates || [],
      hasMultiplePartidas,
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


