import { NextResponse } from "next/server"
import { CompradorService } from '@/lib/services/comprador-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { computePreavisoState } from '@/lib/preaviso-state'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const documentType = formData.get("documentType") as string | null
    const contextRaw = formData.get("context") as string | null

    let context: any = null
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw)
      } catch {
        context = null
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: "bad_request", message: "file is required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || "gpt-4o"

    if (!apiKey) {
      return NextResponse.json(
        { error: "configuration_error", message: "OPENAI_API_KEY missing" },
        { status: 500 }
      )
    }

    // Verificar que sea una imagen (los PDFs ya deben estar convertidos en el cliente)
    const isImage = file.type.startsWith("image/")
    if (!isImage) {
      return NextResponse.json(
        { error: "unsupported_format", message: "Solo se aceptan imágenes. Los PDFs deben convertirse a imágenes en el cliente." },
        { status: 400 }
      )
    }

    // Validar y normalizar el tipo MIME a formatos soportados por OpenAI
    // OpenAI Vision API solo acepta: png, jpeg, gif, webp
    const supportedMimeTypes: Record<string, string> = {
      'image/png': 'image/png',
      'image/jpeg': 'image/jpeg',
      'image/jpg': 'image/jpeg', // Normalizar jpg a jpeg
      'image/gif': 'image/gif',
      'image/webp': 'image/webp',
    }

    let mimeType = file.type?.toLowerCase() || 'image/jpeg'
    
    // Normalizar tipos comunes
    if (mimeType === 'image/jpg') {
      mimeType = 'image/jpeg'
    }
    
    // Verificar que el tipo sea soportado
    if (!supportedMimeTypes[mimeType] && !mimeType.startsWith('image/')) {
      // Si no es un tipo soportado, intentar detectarlo por extensión
      const fileName = file.name.toLowerCase()
      if (fileName.endsWith('.png')) {
        mimeType = 'image/png'
      } else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
        mimeType = 'image/jpeg'
      } else if (fileName.endsWith('.gif')) {
        mimeType = 'image/gif'
      } else if (fileName.endsWith('.webp')) {
        mimeType = 'image/webp'
      } else {
        // Por defecto, usar PNG si no se puede determinar
        mimeType = 'image/png'
      }
    }

    // Validar que el tipo final sea soportado
    if (!supportedMimeTypes[mimeType] && !mimeType.match(/^image\/(png|jpeg|gif|webp)$/)) {
      return NextResponse.json(
        { 
          error: "unsupported_format", 
          message: `Formato de imagen no soportado: ${mimeType}. OpenAI solo acepta: PNG, JPEG, GIF, WEBP.` 
        },
        { status: 400 }
      )
    }

    // Convertir archivo a base64
    const arrayBuffer = await file.arrayBuffer()
    
    // Validar que el archivo no esté vacío
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "invalid_file", message: "El archivo está vacío" },
        { status: 400 }
      )
    }
    
    // Validar tamaño máximo (OpenAI tiene límites)
    const maxSize = 20 * 1024 * 1024 // 20MB
    if (arrayBuffer.byteLength > maxSize) {
      return NextResponse.json(
        { error: "file_too_large", message: `El archivo es demasiado grande (${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB). Máximo: 20MB` },
        { status: 400 }
      )
    }
    
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    
    // Asegurar que el mimeType final sea válido
    mimeType = supportedMimeTypes[mimeType] || mimeType
    
    // Log para debugging en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log(`[preaviso-process-document] Processing file: ${file.name}, type: ${mimeType}, size: ${arrayBuffer.byteLength} bytes`)
    }

    // Construir prompt según el tipo de documento
    let systemPrompt = ""
    let userPrompt = ""

    switch (documentType) {
      case "escritura":
        systemPrompt = `Eres un experto en análisis de documentos notariales. Analiza la Escritura o título de propiedad y extrae la siguiente información en formato JSON:
{
  "folioReal": "número del folio real",
  "seccion": "sección registral",
  "partida": "partida registral",
  "ubicacion": "dirección completa del inmueble",
  "propietario": {
    "nombre": "nombre completo del propietario",
    "rfc": "RFC si está disponible",
    "curp": "CURP si está disponible"
  },
  "superficie": "superficie del inmueble si está disponible",
  "valor": "valor del inmueble si está disponible"
}

Extrae SOLO la información que puedas leer claramente. Si algún campo no está disponible, usa null.`
        userPrompt = "Analiza este documento de Escritura o título de propiedad y extrae la información solicitada."
        break

      case "plano":
        systemPrompt = `Eres un experto en análisis de planos catastrales. Analiza el plano y extrae la siguiente información en formato JSON:
{
  "superficie": "superficie en metros cuadrados",
  "lote": "número de lote si está disponible",
  "manzana": "número de manzana si está disponible",
  "fraccionamiento": "nombre del fraccionamiento si está disponible",
  "medidas": "medidas del terreno si están disponibles"
}

Extrae SOLO la información que puedas leer claramente.`
        userPrompt = "Analiza este plano catastral y extrae la información solicitada."
        break

      case "identificacion":
        systemPrompt = `Eres un experto en análisis de documentos de identificación oficial mexicana. Analiza el documento (puede ser INE/IFE, Pasaporte, Licencia de conducir, CURP, o cualquier otro documento oficial) y extrae TODA la información disponible en formato JSON:
{
  "nombre": "nombre completo como aparece en el documento",
  "rfc": "RFC si está visible en el documento",
  "curp": "CURP si está visible en el documento",
  "direccion": "dirección completa si está visible",
  "fechaNacimiento": "fecha de nacimiento si está visible",
  "tipoDocumento": "INE/IFE, Pasaporte, Licencia, CURP, etc.",
  "numeroDocumento": "número de credencial/pasaporte/etc si está visible"
}

IMPORTANTE:
- Extrae TODA la información que puedas leer claramente del documento
- Si es una INE/IFE, busca nombre completo en el frente, CURP y dirección en el reverso
- Si es un pasaporte, extrae nombre, fecha de nacimiento, número de pasaporte
- Si es una CURP, extrae nombre, CURP, fecha de nacimiento
- Si es una licencia, extrae nombre, dirección, número de licencia
- Lee cuidadosamente todos los campos visibles en el documento
- NO infieras si esta identificación corresponde a comprador o vendedor. No incluyas ese campo.`
        userPrompt = "Analiza este documento de identificación oficial y extrae TODA la información disponible que puedas leer. Sé exhaustivo y preciso."
        break

      case "inscripcion":
        systemPrompt = `Eres un experto en análisis de documentos registrales (hojas de inscripción, certificados registrales, etc.). Analiza el documento y extrae TODA la información disponible en formato JSON:
{
  "folioReal": "número del folio real si está visible",
  "foliosReales": ["lista de folios reales detectados (strings). Si detectas más de uno, inclúyelos todos aquí. Si detectas solo uno, incluye ese único valor. Si no detectas ninguno, usa []"],
  "seccion": "sección registral si está visible",
  "partida": "partida registral si está visible",
  "ubicacion": "dirección completa del inmueble si está visible",
  "propietario": {
    "nombre": "nombre completo del propietario/titular registral si está visible",
    "rfc": "RFC si está disponible"
  },
  "superficie": "superficie del inmueble si está disponible",
  "valor": "valor del inmueble si está disponible",
  "gravamenes": "información sobre gravámenes o hipotecas si está visible, o null si no hay"
}

IMPORTANTE:
- Extrae SOLO la información que puedas leer claramente en el documento
- Si detectas múltiples folios reales, NO elijas uno: ponlos todos en foliosReales[].
- NO extraigas ni infieras forma de pago o institución de crédito desde la inscripción (eso se confirma con el usuario en el chat).
- Si algún campo no está disponible o no es legible, usa null`
        userPrompt = "Analiza este documento de inscripción registral y extrae TODA la información disponible que puedas leer claramente, incluyendo folio real, partida, sección, propietario y gravámenes."
        break

      default:
        systemPrompt = `Eres un experto en análisis de documentos notariales. Analiza el documento y extrae toda la información relevante que puedas identificar relacionada con:
- Folio real, sección, partida
- Datos de personas (nombres, RFC, CURP)
- Información del inmueble (dirección, superficie, valor)
- Información crediticia si está presente (forma de pago, institución de crédito)

Devuelve la información en formato JSON estructurado, incluyendo un campo "formaPago" si el documento menciona si la operación será de contado o con crédito.`
        userPrompt = "Analiza este documento y extrae toda la información relevante, incluyendo cualquier mención sobre forma de pago."
    }

    // Llamar a OpenAI Vision API
    const url = `https://api.openai.com/v1/chat/completions`
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
        ...(model.includes("gpt-5") || model.includes("o1") 
          ? { max_completion_tokens: 2000 }
          : { max_tokens: 2000 }
        ),
      }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      let errorData: any = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        // Si no es JSON, usar el texto como está
      }
      
      console.error(`[preaviso-process-document] OpenAI API error: ${resp.status} - ${errorText}`)
      
      // Manejar errores específicos de formato de imagen
      if (errorData?.error?.code === 'invalid_image_format' || 
          errorData?.error?.message?.includes('unsupported image') ||
          errorData?.error?.message?.includes('image format')) {
        return NextResponse.json(
          { 
            error: "invalid_image_format", 
            message: `Formato de imagen no soportado por OpenAI. El archivo debe ser PNG, JPEG, GIF o WEBP. Tipo detectado: ${mimeType}. Por favor, verifica que el archivo sea una imagen válida.` 
          },
          { status: 400 }
        )
      }
      
      // Manejar otros errores de OpenAI
      const errorMessage = errorData?.error?.message || `Error procesando documento: ${resp.status}`
      return NextResponse.json(
        { error: "api_error", message: errorMessage },
        { status: resp.status >= 400 && resp.status < 500 ? resp.status : 500 }
      )
    }

    const data = await resp.json()
    const extractedText = data?.choices?.[0]?.message?.content || ""

    if (!extractedText) {
      return NextResponse.json(
        { error: "empty_response", message: "No se pudo extraer información del documento" },
        { status: 500 }
      )
    }

    // Parsear JSON
    let extractedData
    try {
      let jsonText = extractedText.trim()
      if (jsonText.startsWith("```")) {
        const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/)
        if (match) jsonText = match[1]
      }
      extractedData = JSON.parse(jsonText)
    } catch (e) {
      console.error("[preaviso-process-document] Error parsing JSON:", e)
      return NextResponse.json(
        { error: "parse_error", message: "Error al procesar la respuesta de la IA" },
        { status: 500 }
      )
    }

    // Normalización defensiva (evita regresiones por variaciones del OCR/LLM)
    // Garantiza que, cuando aplique, exista extractedData.propietario.nombre (titular registral)
    const normalizePropietario = (data: any) => {
      if (!data || typeof data !== 'object') return data

      // Caso: propietario como string
      if (typeof data.propietario === 'string') {
        data.propietario = { nombre: data.propietario, rfc: null, curp: null }
      }

      // Caso: propietario como objeto pero con llave alternativa para nombre
      if (data.propietario && typeof data.propietario === 'object') {
        const nombreAlt =
          data.propietario.nombre ||
          data.propietario.nombre_completo ||
          data.propietario.nombreCompleto ||
          data.propietario.titular ||
          null
        if (!data.propietario.nombre && nombreAlt) data.propietario.nombre = nombreAlt
      }

      // Fallbacks comunes fuera de "propietario"
      const nombreFallback =
        data.titularRegistral ||
        data.titular_registral ||
        data.titular ||
        data.propietarioNombre ||
        data.nombreTitular ||
        data.nombre_titular ||
        null

      if (!data.propietario && nombreFallback) {
        data.propietario = { nombre: nombreFallback, rfc: null, curp: null }
      } else if (data.propietario && typeof data.propietario === 'object' && !data.propietario.nombre && nombreFallback) {
        data.propietario.nombre = nombreFallback
      }

      return data
    }

    extractedData = normalizePropietario(extractedData)

    // Helper: merge canónico (v1.4) en backend para que state y data siempre estén alineados.
    const safeArray = (v: any): any[] => (Array.isArray(v) ? v : [])
    const safeObj = (v: any): any => (v && typeof v === 'object' ? v : {})
    const asStringOrNull = (v: any): string | null => (v === undefined || v === null ? null : String(v))
    const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean)))

    const mergeExtractedIntoContext = (docType: string | null, extracted: any, baseContext: any) => {
      const update: any = {}
      const ctx = baseContext || {}

      // Base inmueble (asegurar estructura v1.4 mínima)
      const inmueble = safeObj(ctx.inmueble)
      const direccion = safeObj(inmueble.direccion)
      const datosCatastrales = safeObj(inmueble.datos_catastrales)

      const ensureInmueble = () => {
        update.inmueble = {
          folio_real: inmueble?.folio_real ?? null,
          partidas: safeArray(inmueble?.partidas),
          all_registry_pages_confirmed: inmueble?.all_registry_pages_confirmed === true,
          direccion: {
            calle: direccion?.calle ?? null,
            numero: direccion?.numero ?? null,
            colonia: direccion?.colonia ?? null,
            municipio: direccion?.municipio ?? null,
            estado: direccion?.estado ?? null,
            codigo_postal: direccion?.codigo_postal ?? null,
          },
          superficie: inmueble?.superficie ?? null,
          valor: inmueble?.valor ?? null,
          datos_catastrales: {
            lote: datosCatastrales?.lote ?? null,
            manzana: datosCatastrales?.manzana ?? null,
            fraccionamiento: datosCatastrales?.fraccionamiento ?? null,
            condominio: datosCatastrales?.condominio ?? null,
            unidad: datosCatastrales?.unidad ?? null,
            modulo: datosCatastrales?.modulo ?? null,
          },
        }
      }

      // === ESCRITURA / INSCRIPCIÓN ===
      if (docType === 'escritura' || docType === 'inscripcion') {
        ensureInmueble()
        if (extracted?.folioReal) update.inmueble.folio_real = String(extracted.folioReal)

        // Partidas: soportar partida (string) y partidas (array)
        const partidas = safeArray(update.inmueble.partidas)
        if (extracted?.partida) partidas.push(String(extracted.partida))
        if (Array.isArray(extracted?.partidas)) {
          for (const p of extracted.partidas) if (p) partidas.push(String(p))
        }
        update.inmueble.partidas = uniq(partidas)

        // Ubicación → dirección (sin parseo agresivo)
        if (extracted?.ubicacion) {
          if (typeof extracted.ubicacion === 'string') {
            update.inmueble.direccion = { ...update.inmueble.direccion, calle: extracted.ubicacion }
          } else if (typeof extracted.ubicacion === 'object') {
            update.inmueble.direccion = { ...update.inmueble.direccion, ...extracted.ubicacion }
          }
        }

        // Superficie/valor (stringificar defensivo)
        if (extracted?.superficie) update.inmueble.superficie = asStringOrNull(extracted.superficie)
        if (extracted?.valor) update.inmueble.valor = asStringOrNull(extracted.valor)

        // Titular registral → vendedores[0] (NO asumir tipo_persona)
        const propietarioNombre = extracted?.propietario?.nombre
        const propietarioRfc = extracted?.propietario?.rfc
        const propietarioCurp = extracted?.propietario?.curp
        if (propietarioNombre) {
          const vendedores = safeArray(ctx.vendedores)
          const v0 = vendedores[0] || { party_id: null, tipo_persona: null, tiene_credito: null }

          // Si ya está como persona moral, actualizar denominación/rfc; si no, dejar placeholder en persona_fisica sin asumir tipo_persona.
          if (v0?.tipo_persona === 'persona_moral' || v0?.persona_moral) {
            vendedores[0] = {
              ...v0,
              persona_moral: {
                ...(v0.persona_moral || {}),
                denominacion_social: propietarioNombre || v0?.persona_moral?.denominacion_social || null,
                rfc: propietarioRfc || v0?.persona_moral?.rfc || null,
              },
            }
          } else {
            vendedores[0] = {
              ...v0,
              tipo_persona: v0?.tipo_persona ?? null,
              persona_fisica: {
                ...(v0.persona_fisica || {}),
                nombre: propietarioNombre || v0?.persona_fisica?.nombre || null,
                rfc: propietarioRfc || v0?.persona_fisica?.rfc || null,
                curp: propietarioCurp || v0?.persona_fisica?.curp || null,
              },
            }
          }

          update.vendedores = vendedores
        }
      }

      // === PLANO ===
      if (docType === 'plano') {
        ensureInmueble()
        if (extracted?.superficie) update.inmueble.superficie = asStringOrNull(extracted.superficie)
        if (extracted?.lote) update.inmueble.datos_catastrales.lote = asStringOrNull(extracted.lote)
        if (extracted?.manzana) update.inmueble.datos_catastrales.manzana = asStringOrNull(extracted.manzana)
        if (extracted?.fraccionamiento) update.inmueble.datos_catastrales.fraccionamiento = asStringOrNull(extracted.fraccionamiento)
      }

      // === IDENTIFICACIÓN ===
      if (docType === 'identificacion') {
        const nombre = extracted?.nombre
        if (nombre) {
          const vendedores = safeArray(ctx.vendedores)
          const compradores = safeArray(ctx.compradores)

          const v0 = vendedores[0]
          const c0 = compradores[0]
          const vendedorNombre = v0?.persona_fisica?.nombre || v0?.persona_moral?.denominacion_social || null
          const compradorNombre = c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social || null

          // Heurística (sin inferencia del modelo): si falta comprador → asignar a comprador; si comprador ya existe pero falta vendedor → asignar a vendedor; si ambos existen → asignar a comprador.
          const target = !compradorNombre ? 'comprador' : (!vendedorNombre ? 'vendedor' : 'comprador')

          // Si el documento es INE/IFE/Pasaporte/Licencia/CURP, es persona física (clasificación por tipo de documento, no por suposición).
          const tipoDoc = String(extracted?.tipoDocumento || '').toLowerCase()
          const esPersonaFisicaPorDoc = /(ine|ife|pasaporte|licencia|curp)/i.test(tipoDoc)
          const tipo_persona = esPersonaFisicaPorDoc ? 'persona_fisica' : null

          const personaFisica = {
            nombre: String(nombre),
            rfc: extracted?.rfc ? String(extracted.rfc) : null,
            curp: extracted?.curp ? String(extracted.curp) : null,
            estado_civil: null,
          }

          if (target === 'comprador') {
            const next = compradores.length > 0 ? [...compradores] : [{ party_id: null, tipo_persona: null, persona_fisica: {}, persona_moral: undefined }]
            const base = next[0] || { party_id: null, tipo_persona: null }
            next[0] = {
              ...base,
              tipo_persona: base?.tipo_persona ?? tipo_persona,
              persona_fisica: { ...(base?.persona_fisica || {}), ...personaFisica },
            }
            update.compradores = next
          } else {
            const next = vendedores.length > 0 ? [...vendedores] : [{ party_id: null, tipo_persona: null, tiene_credito: null, persona_fisica: {}, persona_moral: undefined }]
            const base = next[0] || { party_id: null, tipo_persona: null, tiene_credito: null }
            next[0] = {
              ...base,
              tipo_persona: base?.tipo_persona ?? tipo_persona,
              persona_fisica: { ...(base?.persona_fisica || {}), ...personaFisica },
            }
            update.vendedores = next
          }

          // Retornar target para que el caller pueda decidir expediente lookup
          update.__targetPerson = target
        }
      }

      return update
    }

    // Si hay contexto, aplicamos merge canónico y devolvemos `data` + `state` ya alineados.
    let dataUpdate: any = null
    let state: any = null
    let mergedContextForState: any = null
    if (context) {
      dataUpdate = mergeExtractedIntoContext(documentType, extractedData, context)

      const prevDocs = Array.isArray(context.documentosProcesados) ? context.documentosProcesados : []
      const nextDocs = [
        ...prevDocs,
        {
          nombre: file.name,
          tipo: documentType || 'desconocido',
          informacionExtraida: extractedData,
        },
      ]

      // No exponer campos internos (__targetPerson) fuera del backend
      const { __targetPerson, ...cleanDataUpdate } = dataUpdate || {}
      mergedContextForState = { ...context, ...cleanDataUpdate, documentosProcesados: nextDocs }
      state = computePreavisoState(mergedContextForState).state
      dataUpdate = cleanDataUpdate
    }

    // Expediente existente: ahora se decide por target inferido por contexto (no por inferencia del modelo).
    let expedienteExistente = null
    const shouldLookupExpediente =
      documentType === "identificacion" &&
      !!context &&
      !!dataUpdate &&
      // si el merge impactó compradores, interpretamos que era identificación del comprador
      Object.prototype.hasOwnProperty.call(dataUpdate, 'compradores')

    if (shouldLookupExpediente) {
      try {
        const currentUser = await getCurrentUserFromRequest(req)
        const notariaId = currentUser?.rol === 'superadmin' ? null : currentUser?.notaria_id

        let comprador = null
        if (extractedData?.rfc) {
          comprador = await CompradorService.findCompradorByRFC(extractedData.rfc)
        }
        if (!comprador && extractedData?.curp) {
          comprador = await CompradorService.findCompradorByCURP(extractedData.curp)
        }

        if (comprador) {
          if (currentUser?.rol === 'abogado' && comprador.notaria_id !== currentUser.notaria_id) {
            expedienteExistente = null
          } else {
            const tramites = await TramiteService.findTramitesByCompradorId(comprador.id, notariaId || undefined)
            expedienteExistente = {
              compradorId: comprador.id,
              compradorNombre: comprador.nombre,
              tieneExpedientes: tramites.length > 0,
              cantidadTramites: tramites.length,
              tramites: tramites.map(t => ({
                id: t.id,
                tipo: t.tipo,
                estado: t.estado,
                createdAt: t.created_at,
                updatedAt: t.updated_at
              }))
            }
          }
        }
      } catch (error: any) {
        console.error("[preaviso-process-document] Error buscando expedientes:", error)
      }
    }

    return NextResponse.json({
      success: true,
      extractedData,
      fileName: file.name,
      fileType: documentType,
      ...(dataUpdate && { data: dataUpdate }),
      ...(expedienteExistente && { expedienteExistente }),
      ...(state && { state }),
    })

  } catch (error: any) {
    console.error("[preaviso-process-document] Error:", error)
    return NextResponse.json(
      { error: "internal_error", message: error.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

