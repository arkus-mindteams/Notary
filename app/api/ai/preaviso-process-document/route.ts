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
    const needOcr = (formData.get("needOcr") as string | null) || null

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
    // OpenAI Vision API tiene un límite de 20MB por imagen, pero recomendamos menos para mejor rendimiento
    const maxSize = 20 * 1024 * 1024 // 20MB
    if (arrayBuffer.byteLength > maxSize) {
      return NextResponse.json(
        { error: "file_too_large", message: `El archivo es demasiado grande (${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB). Máximo: 20MB` },
        { status: 400 }
      )
    }
    
    // Validar tamaño mínimo (archivos muy pequeños pueden estar corruptos)
    const minSize = 100 // 100 bytes mínimo
    if (arrayBuffer.byteLength < minSize) {
      return NextResponse.json(
        { error: "invalid_file", message: "El archivo es demasiado pequeño y puede estar corrupto" },
        { status: 400 }
      )
    }
    
    // Validar que el archivo tenga una firma válida de imagen (magic bytes)
    const uint8Array = new Uint8Array(arrayBuffer)
    const isValidImage = 
      // PNG: 89 50 4E 47
      (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47) ||
      // JPEG: FF D8 FF
      (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF) ||
      // GIF: 47 49 46 38 (GIF8)
      (uint8Array[0] === 0x47 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46 && uint8Array[3] === 0x38) ||
      // WEBP: RIFF...WEBP
      (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46 && uint8Array[3] === 0x46 && 
       uint8Array[8] === 0x57 && uint8Array[9] === 0x45 && uint8Array[10] === 0x42 && uint8Array[11] === 0x50)
    
    if (!isValidImage) {
      // Si no tiene firma válida pero el tipo MIME dice que es imagen, intentar corregir el tipo
      // o rechazar si definitivamente no es una imagen válida
      console.warn(`[preaviso-process-document] Archivo no tiene firma válida de imagen. Tipo MIME: ${mimeType}, Primeros bytes: ${Array.from(uint8Array.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`)
      
      // Si el tipo MIME es correcto pero la firma no coincide, puede ser un problema de conversión
      // Permitir continuar pero con advertencia
      if (!mimeType.startsWith('image/')) {
        return NextResponse.json(
          { error: "invalid_file", message: "El archivo no parece ser una imagen válida. Por favor, verifica que el archivo sea PNG, JPEG, GIF o WEBP." },
          { status: 400 }
        )
      }
    }
    
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    
    // Validar que el base64 no esté vacío
    if (!base64 || base64.length === 0) {
      return NextResponse.json(
        { error: "invalid_file", message: "Error al convertir el archivo a base64" },
        { status: 400 }
      )
    }
    
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

      case "acta_matrimonio":
        systemPrompt = `Eres un experto en análisis de actas de matrimonio. Analiza el documento y extrae la siguiente información en formato JSON:
{
  "conyuge1": { "nombre": "nombre completo del cónyuge 1 tal como aparece" },
  "conyuge2": { "nombre": "nombre completo del cónyuge 2 tal como aparece" },
  "fechaMatrimonio": "fecha del matrimonio si está visible",
  "lugarRegistro": "lugar/registro/oficialía si está visible"
}

IMPORTANTE:
- Extrae SOLO lo que puedas leer claramente. Si no estás seguro, usa null.
- NO infieras roles (comprador/vendedor). Solo extrae datos del acta.`
        userPrompt = "Analiza esta acta de matrimonio y extrae los nombres completos de ambos cónyuges y la información solicitada."
        break

      case "inscripcion":
        systemPrompt = `Eres un experto en análisis de documentos registrales (hojas de inscripción, certificados registrales, etc.). Analiza el documento METICULOSAMENTE y extrae TODA la información disponible en formato JSON:

{
  "folioReal": "número del folio real si está visible (solo si hay un único folio)",
  "foliosReales": ["lista de TODOS los folios reales detectados (strings). Si detectas más de uno, inclúyelos todos aquí. Si detectas solo uno, incluye ese único valor. Si no detectas ninguno, usa []"],
  "foliosRealesUnidades": ["lista de folios reales detectados en secciones de UNIDADES (p.ej. 'DEPARTAMENTO/LOCAL/ESTACIONAMIENTO', 'UNIDAD', 'CONJ. HABITACIONAL'). Si no hay, []"],
  "foliosRealesInmueblesAfectados": ["lista de folios reales detectados específicamente bajo el encabezado 'INMUEBLE(S) AFECTADO(S)'. Si no hay, []"],
  "foliosConInfo": [
    {
      "folio": "número del folio real (OBLIGATORIO si hay múltiples folios)",
      "unidad": "número o identificador de unidad/condominio asociado a este folio si está visible",
      "condominio": "nombre del condominio asociado a este folio si está visible",
      "partida": "partida registral asociada a este folio si está visible",
      "ubicacion": "dirección completa del inmueble asociado a este folio si está visible",
      "superficie": "superficie del inmueble asociado a este folio si está disponible (con unidad: m², m2, metros, etc.)",
      "lote": "número de lote asociado a este folio si está visible",
      "manzana": "número de manzana asociado a este folio si está visible",
      "fraccionamiento": "nombre del fraccionamiento asociado a este folio si está visible",
      "colonia": "nombre de la colonia asociado a este folio si está visible"
    }
  ],
  "seccion": "sección registral si está visible (CIVIL, MIXTA, etc.)",
  "partidasTitulo": ["lista de partidas detectadas en la sección TÍTULO / INSCRIPCIÓN (NO en ANTECEDENTES). Si hay múltiples, inclúyelas todas. Si no hay, []"],
  "partidasAntecedentes": ["lista de partidas detectadas SOLO en la sección ANTECEDENTES REGISTRALES (si existen). Si no hay, []"],
  "partidas": ["lista de TODAS las partidas registrales detectadas (strings). Si hay múltiples, inclúyelas todas. Si hay una sola, inclúyela. Si no hay, usa []"],
  "partida": "partida registral si está visible (para folio único, usar solo si partidas[] está vacío)",
  "ubicacion": "dirección completa del inmueble si está visible (para folio único)",
  "direccion": {
    "calle": "nombre de la calle si está visible",
    "numero": "número exterior si está visible",
    "colonia": "nombre de la colonia si está visible",
    "municipio": "municipio si está visible",
    "estado": "estado si está visible",
    "codigo_postal": "código postal si está visible"
  },
  "datosCatastrales": {
    "lote": "número de lote si está visible",
    "manzana": "número de manzana si está visible",
    "fraccionamiento": "nombre del fraccionamiento si está visible",
    "condominio": "nombre del condominio si está visible",
    "unidad": "número de unidad si está visible",
    "modulo": "módulo si está visible"
  },
  "propietario": {
    "nombre": "nombre completo del propietario/titular registral si está visible (exactamente como aparece)",
    "rfc": "RFC si está disponible",
    "curp": "CURP si está disponible"
  },
  "propietario_contexto": "de dónde se extrajo el nombre del propietario. Valores: \"PROPIETARIO(S)\", \"TITULAR REGISTRAL\", \"DESCONOCIDO\"",
  "superficie": "superficie del inmueble si está disponible (para folio único, con unidad: m², m2, metros, etc.)",
  "valor": "valor del inmueble si está disponible",
  "gravamenes": "información sobre gravámenes o hipotecas si está visible, o null si no hay",
  "numeroExpediente": "número de expediente registral si está visible"
}

INSTRUCCIONES CRÍTICAS:
1. Extrae SOLO la información que puedas leer CLARAMENTE en el documento. Si no estás seguro, usa null.
1.1 PROPIETARIO/TITULAR (CRÍTICO):
   - El campo propietario.nombre SOLO puede salir de la sección rotulada como "PROPIETARIO(S)" o "TITULAR REGISTRAL" (si existe).
   - NO uses nombres de personal del registro/notaría: ignora "EJECUTIVO", "ANALISTA", "SUBREGISTRADOR", "COTEJADO", "COTEJADO CONTRA ORIGINAL", "MÉTODO DE AUTENTICIDAD", "FIRMA ELECTRÓNICA", "CÓDIGO DE AUTENTICIDAD".
   - Si no encuentras claramente el propietario bajo PROPIETARIO(S)/TITULAR REGISTRAL, deja propietario.nombre = null y propietario_contexto = "DESCONOCIDO".
   - Si lo encuentras, llena propietario_contexto como "PROPIETARIO(S)" o "TITULAR REGISTRAL" según el encabezado.
2. FOLIOS REALES (CRÍTICO): recorre TODA la página y detecta TODAS las ocurrencias del patrón "FOLIO REAL:" (puede aparecer múltiples veces).
   - Si encuentras más de un folio real, ponlos TODOS en foliosReales[] (sin omitir ninguno) y pon "folioReal": null.
   - Si solo encuentras uno, ponlo en foliosReales[] y también en "folioReal".
   - NO te quedes con el primero: debes escanear el documento completo antes de responder.
   - Además clasifica los folios según su sección: llena foliosRealesUnidades[] y foliosRealesInmueblesAfectados[] cuando aplique.
3. Si detectas múltiples folios, intenta extraer información del inmueble asociada a cada folio en foliosConInfo[].
   - Si el documento muestra claramente qué información corresponde a cada folio, asóciala correctamente.
   - Si no puedes asociar información específica a cada folio, usa los campos generales (ubicacion, superficie, partida, datosCatastrales).
   - Si puedes, incluye una entrada en foliosConInfo[] por CADA folio detectado (al menos con { folio }).
4. Para partidas: prioriza las partidas que aparecen en la sección TÍTULO / INSCRIPCIÓN (esas van en partidasTitulo[]). NO uses las de ANTECEDENTES como partida principal.
   - Si encuentras partidas en ANTECEDENTES, colócalas en partidasAntecedentes[].
   - En partidas[] incluye TODAS las partidas detectadas, pero asegúrate de incluir las de partidasTitulo[] si existen.
5. Para dirección: si está disponible como objeto estructurado, usa direccion{}. Si solo está como texto, usa ubicacion.
6. NO extraigas ni infieras forma de pago o institución de crédito desde la inscripción (eso se confirma con el usuario en el chat).
7. Si algún campo no está disponible o no es legible, usa null (no inventes valores).`
        userPrompt = "Analiza este documento de inscripción registral METICULOSAMENTE. Extrae TODA la información que puedas leer claramente, incluyendo: folios reales (todos si hay múltiples), partidas registrales (todas si hay múltiples), sección, dirección completa del inmueble, datos catastrales (lote, manzana, fraccionamiento, condominio, unidad), superficie, propietario/titular registral, y cualquier gravamen o hipoteca visible. Si hay múltiples folios, intenta asociar la información del inmueble a cada folio según cómo aparezca en el documento."
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
          errorData?.error?.code === 'invalid_image' ||
          errorData?.error?.message?.includes('unsupported image') ||
          errorData?.error?.message?.includes('image format') ||
          errorData?.error?.message?.includes('Invalid image') ||
          errorData?.error?.message?.toLowerCase().includes('invalid image')) {
        return NextResponse.json(
          { 
            error: "invalid_image_format", 
            message: `Formato de imagen no válido o no soportado por OpenAI. El archivo debe ser una imagen válida en formato PNG, JPEG, GIF o WEBP. Tipo detectado: ${mimeType}. Por favor, verifica que el archivo sea una imagen válida y no esté corrupto. Si estás subiendo un PDF, asegúrate de convertirlo correctamente a imagen antes de subirlo.` 
          },
          { status: 400 }
        )
      }
      
      // Manejar otros errores de OpenAI
      const errorMessage = errorData?.error?.message || `Error procesando documento: ${resp.status}`
      if (resp.status === 429 || errorData?.error?.code === 'insufficient_quota') {
        return NextResponse.json(
          {
            error: "openai_quota_exceeded",
            message:
              "OpenAI devolvió 429 (insufficient_quota). No se pudo extraer información del documento porque la cuenta/llave no tiene cuota disponible. Revisa el plan/billing o cambia la API key.",
          },
          { status: 429 }
        )
      }
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

    // OCR / texto plano (para RAG): opcional y acotado por tipo para no duplicar costo en todo.
    // Se devuelve separado (NO se mergea en contexto) para evitar inflar `documentosProcesados`.
    let ocrText: string | null = null
    const shouldOcr =
      needOcr === '1' &&
      (documentType === 'identificacion' || documentType === 'inscripcion' || documentType === 'acta_matrimonio')

    if (shouldOcr) {
      try {
        const ocrSystem = `Eres un OCR extractor. Devuelve SOLO JSON con este shape:
{
  "text": "transcripción del texto visible en la imagen, en orden de lectura. Si hay secciones/tablas, conserva saltos de línea. No inventes texto."
}

REGLAS:
- Incluye TODO el texto legible.
- No agregues comentarios ni interpretación.
- Si no se ve claro una palabra, omítela o usa [ilegible].`
        const ocrResp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: ocrSystem },
              {
                role: "user",
                content: [
                  { type: "text", text: "Transcribe el texto visible en esta imagen." },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                ],
              },
            ],
            temperature: 0,
            response_format: { type: "json_object" },
            ...(model.includes("gpt-5") || model.includes("o1")
              ? { max_completion_tokens: 1200 }
              : { max_tokens: 1200 }),
          }),
        })
        if (ocrResp.ok) {
          const ocrData = await ocrResp.json()
          const ocrRaw = ocrData?.choices?.[0]?.message?.content || ""
          let parsed: any = null
          try {
            let jt = String(ocrRaw || '').trim()
            if (jt.startsWith("```")) {
              const m = jt.match(/```(?:json)?\n([\s\S]*?)\n```/)
              if (m) jt = m[1]
            }
            parsed = JSON.parse(jt)
          } catch {
            parsed = null
          }
          const t = parsed?.text ? String(parsed.text) : ''
          if (t.trim()) {
            // límite defensivo
            ocrText = t.length > 20000 ? t.slice(0, 20000) : t
          }
        }
      } catch {
        // No bloquear flujo principal
        ocrText = null
      }
    }

    // Segunda pasada (solo folios) cuando el modelo tiende a devolver "solo el primero" por página.
    // Esto es especialmente común en hojas con múltiples secciones (p.ej. DEPARTAMENTO/LOCAL y luego INMUEBLE(S) AFECTADO(S)).
    const ensureAllFoliosOnPage = async (current: any) => {
      // Mantenerlo acotado a inscripción para no duplicar llamadas en documentos que no lo requieren.
      // (La detección de tipo ya se normaliza en frontend; si se requiere robustez extra, reactivar escritura.)
      if (documentType !== 'inscripcion') return current
      const folios = Array.isArray(current?.foliosReales) ? current.foliosReales.filter(Boolean) : []
      const foliosConInfo = Array.isArray(current?.foliosConInfo) ? current.foliosConInfo : []
      const foliosConInfoFolios = foliosConInfo.map((f: any) => f?.folio).filter(Boolean)
      const totalKnown = new Set([...folios, ...foliosConInfoFolios].map((x: any) => String(x)))

      // Si solo tenemos 0-1 folios, intentamos una extracción dedicada.
      if (totalKnown.size > 1) return current

      try {
        const folioScanSystem = `Eres un extractor especializado. Tu ÚNICA tarea es:
1) encontrar TODOS los "FOLIO REAL:" en esta imagen y
2) extraer, si está visible cerca de cada folio, datos básicos (unidad y/o superficie y/o ubicación).

Devuelve SOLO este JSON:
{
  "folios": [
    {
      "folio": "número de folio real (string)",
      "unidad": "unidad si aplica (string o null)",
      "condominio": "condominio/conjunto si aplica (string o null)",
      "ubicacion": "ubicación/dirección si aplica (string o null)",
      "superficie": "superficie si aplica (string con unidad) o null"
    }
  ],
  "foliosReales": ["lista de TODOS los folios reales detectados como strings, sin omitir ninguno. Si no encuentras ninguno, []"]
}

REGLAS:
- Escanea TODA la imagen (arriba, en medio y abajo). No te quedes con el primero.
- Incluye TODOS, incluso si aparecen en distintas secciones (p.ej. unidades y luego "INMUEBLE(S) AFECTADO(S)").
- Si hay varios, deben ir todos en el array.
- NO inventes datos: si no se ve claro, usa null.`

        const folioScanResp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: folioScanSystem },
              {
                role: "user",
                content: [
                  { type: "text", text: "Encuentra TODOS los folios reales en esta imagen." },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
                ],
              },
            ],
            temperature: 0,
            response_format: { type: "json_object" },
            ...(model.includes("gpt-5") || model.includes("o1")
              ? { max_completion_tokens: 400 }
              : { max_tokens: 400 }),
          }),
        })

        if (!folioScanResp.ok) {
          // Si hay cuota/errores, no bloquear el flujo principal.
          return current
        }

        const folioScanData = await folioScanResp.json()
        const folioScanText = folioScanData?.choices?.[0]?.message?.content || ""
        let parsed: any = null
        try {
          let jt = String(folioScanText || '').trim()
          if (jt.startsWith("```")) {
            const m = jt.match(/```(?:json)?\n([\s\S]*?)\n```/)
            if (m) jt = m[1]
          }
          parsed = JSON.parse(jt)
        } catch {
          parsed = null
        }

        const scanned = Array.isArray(parsed?.foliosReales) ? parsed.foliosReales.filter(Boolean).map((x: any) => String(x)) : []
        const scannedFolios = Array.isArray(parsed?.folios) ? parsed.folios : []
        if (scanned.length === 0 && scannedFolios.length === 0) return current
        const scannedFromObjects = scannedFolios
          .map((f: any) => f?.folio)
          .filter(Boolean)
          .map((x: any) => String(x))
        const scannedAll = [...scanned, ...scannedFromObjects]
        if (scannedAll.length === 0) return current

        // Merge (dedupe por dígitos)
        const norm = (v: any) => {
          const digits = String(v || '').replace(/\D/g, '')
          return digits || String(v || '').trim()
        }
        const map = new Map<string, string>()
        for (const f of [...folios, ...foliosConInfoFolios, ...scannedAll]) {
          const s = String(f).trim()
          if (!s) continue
          map.set(norm(s), s)
        }

        const mergedFolios = Array.from(map.values())
        const next = { ...(current || {}) }
        next.foliosReales = mergedFolios
        // Si hay múltiples, folioReal debe ser null (evita autoselección)
        if (mergedFolios.length > 1) next.folioReal = null
        // Completar foliosConInfo con entradas mínimas por folio (para listado)
        const existingKeys = new Set(foliosConInfoFolios.map((x: any) => norm(x)))
        const nextFoliosConInfo = Array.isArray(next.foliosConInfo) ? [...next.foliosConInfo] : []
        const infoMap = new Map<string, any>()
        for (const existing of nextFoliosConInfo) {
          const key = norm(existing?.folio)
          if (!key) continue
          infoMap.set(key, existing)
        }
        // Mergear attrs por folio detectado en escaneo
        for (const f of scannedFolios) {
          const key = norm(f?.folio)
          if (!key) continue
          const prev = infoMap.get(key) || { folio: f?.folio }
          infoMap.set(key, {
            ...prev,
            folio: prev?.folio || f?.folio,
            unidad: f?.unidad ?? prev?.unidad ?? null,
            condominio: f?.condominio ?? prev?.condominio ?? null,
            ubicacion: f?.ubicacion ?? prev?.ubicacion ?? null,
            superficie: f?.superficie ?? prev?.superficie ?? null,
          })
        }
        for (const f of mergedFolios) {
          const k = norm(f)
          if (!existingKeys.has(k) && !infoMap.has(k)) {
            infoMap.set(k, { folio: f })
          }
        }
        next.foliosConInfo = Array.from(infoMap.values())

        if (process.env.PREAVISO_DEBUG === '1') {
          console.info('[preaviso-process-document] folio scan merged', {
            fileName: file.name,
            beforeCount: totalKnown.size,
            scannedCount: scannedAll.length,
            mergedCount: mergedFolios.length,
            scanned: scannedAll,
            mergedFolios,
          })
        }

        return next
      } catch {
        return current
      }
    }

    extractedData = await ensureAllFoliosOnPage(extractedData)

    // Normalización defensiva (evita regresiones por variaciones del OCR/LLM)
    // Garantiza que, cuando aplique, exista extractedData.propietario.nombre (titular registral)
    const normalizePropietario = (data: any) => {
      if (!data || typeof data !== 'object') return data

      const looksLikeStaffOrMeta = (name: any): boolean => {
        const s = String(name || '').toUpperCase()
        if (!s.trim()) return false
        return /(EJECUTIVO|ANALISTA|SUBREGISTRADOR|COTEJAD|COTEJO|METODO\s+DE\s+AUTENTICIDAD|M[ÉE]TODO\s+DE\s+AUTENTICIDAD|FIRMA\s+ELECTRONICA|FIRMA\s+ELECTR[ÓO]NICA|CODIGO\s+DE\s+AUTENTICIDAD|C[ÓO]DIGO\s+DE\s+AUTENTICIDAD)/.test(s)
      }

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

      // Guard: si el "propietario" parece nombre de personal/meta, no lo uses.
      if (data.propietario?.nombre && looksLikeStaffOrMeta(data.propietario.nombre)) {
        data.propietario.nombre = null
        data.propietario_contexto = data.propietario_contexto || 'DESCONOCIDO'
      }

      return data
    }

    extractedData = normalizePropietario(extractedData)

    // Debug: ver folios detectados por página (útil para casos donde solo devuelve el primero)
    if (process.env.PREAVISO_DEBUG === '1') {
      const folios = Array.isArray((extractedData as any)?.foliosReales) ? (extractedData as any).foliosReales : []
      const folioReal = (extractedData as any)?.folioReal ?? null
      const foliosConInfo = Array.isArray((extractedData as any)?.foliosConInfo) ? (extractedData as any).foliosConInfo : []
      console.info('[preaviso-process-document] extracted folios', {
        fileName: file.name,
        documentType,
        folioReal,
        foliosRealesCount: folios.length,
        foliosReales: folios,
        foliosConInfoCount: foliosConInfo.length,
        foliosConInfoFolios: foliosConInfo.map((f: any) => f?.folio).filter(Boolean),
      })
    }

    // Helper: merge canónico (v1.4) en backend para que state y data siempre estén alineados.
    const safeArray = (v: any): any[] => (Array.isArray(v) ? v : [])
    const safeObj = (v: any): any => (v && typeof v === 'object' ? v : {})
    const asStringOrNull = (v: any): string | null => (v === undefined || v === null ? null : String(v))
    const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean)))

    const mergeExtractedIntoContext = (docType: string | null, extracted: any, baseContext: any) => {
      const update: any = {}
      const ctx = baseContext || {}
      const fileNameForSource = file?.name || null

      // Base inmueble (asegurar estructura v1.4 mínima)
      const inmueble = safeObj(ctx.inmueble)
      const direccion = safeObj(inmueble.direccion)
      const datosCatastrales = safeObj(inmueble.datos_catastrales)

      const ensureInmueble = () => {
        update.inmueble = {
          folio_real: inmueble?.folio_real ?? null,
          // Campos internos (no parte del schema v1.4) pero necesarios para control determinista del flujo:
          folio_real_confirmed: inmueble?.folio_real_confirmed === true,
          folio_real_scope: (inmueble as any)?.folio_real_scope ?? null,
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

      // === Folios (modelo canónico) ===
      const ensureFolios = () => {
        const prev = (ctx as any).folios || {}
        const prevSelection = prev?.selection || {}
        update.folios = {
          candidates: Array.isArray(prev?.candidates) ? prev.candidates : [],
          selection: {
            selected_folio: prevSelection?.selected_folio ?? null,
            selected_scope: prevSelection?.selected_scope ?? null,
            confirmed_by_user: prevSelection?.confirmed_by_user === true,
          },
        }
      }

      const normalizeFolioDigits = (v: any): string | null => {
        if (v === undefined || v === null) return null
        const digits = String(v).replace(/\D/g, '')
        return digits ? digits : null
      }

      const addCandidate = (folioValue: any, scope: 'unidades' | 'inmuebles_afectados' | 'otros', attrs?: any) => {
        const folio = normalizeFolioDigits(folioValue)
        if (!folio) return
        const existing = Array.isArray(update.folios?.candidates) ? update.folios.candidates : []
        const key = `${scope}:${folio}`
        const map = new Map<string, any>()
        for (const c of existing) {
          const f = normalizeFolioDigits(c?.folio)
          const s = c?.scope || 'otros'
          if (!f) continue
          map.set(`${s}:${f}`, c)
        }
        const prevC = map.get(key) || { folio, scope }
        map.set(key, {
          ...prevC,
          folio,
          scope,
          attrs: { ...(prevC.attrs || {}), ...(attrs || {}) },
          sources: [
            ...(prevC.sources || []),
            {
              docName: fileNameForSource || undefined,
              docType: docType || undefined,
            },
          ],
        })
        update.folios.candidates = Array.from(map.values())
      }

      // === ESCRITURA / INSCRIPCIÓN ===
      if (docType === 'escritura' || docType === 'inscripcion') {
        ensureInmueble()
        ensureFolios()
        
        // Folio real:
        // NO fijar `inmueble.folio_real` desde extracción. El folio del trámite NO tiene default
        // y debe confirmarse explícitamente por el usuario vía `context.folios.selection`.

        // Partidas: soportar partida (string) y partidas (array).
        // Para inscripción, priorizar partidasTitulo[] (sección TÍTULO) por encima de antecedentes.
        const partidas = safeArray(update.inmueble.partidas)
        const partidasTitulo = Array.isArray(extracted?.partidasTitulo) ? extracted.partidasTitulo : []
        const partidasArr = Array.isArray(extracted?.partidas) ? extracted.partidas : []
        const partidasPreferidas = (docType === 'inscripcion' && partidasTitulo.length > 0) ? partidasTitulo : partidasArr

        if (Array.isArray(partidasPreferidas) && partidasPreferidas.length > 0) {
          for (const p of partidasPreferidas) if (p) partidas.push(String(p))
        } else if (extracted?.partida) {
          partidas.push(String(extracted.partida))
        }
        update.inmueble.partidas = uniq(partidas)

        // Sección registral
        if (extracted?.seccion) {
          // Almacenar sección en el contexto (aunque no esté en v1.4, puede ser útil)
          update.inmueble = { ...update.inmueble, seccion: asStringOrNull(extracted.seccion) } as any
        }

        // Dirección: priorizar objeto estructurado, luego string
        if (extracted?.direccion && typeof extracted.direccion === 'object') {
          update.inmueble.direccion = {
            calle: asStringOrNull(extracted.direccion.calle) || update.inmueble.direccion.calle,
            numero: asStringOrNull(extracted.direccion.numero) || update.inmueble.direccion.numero,
            colonia: asStringOrNull(extracted.direccion.colonia) || update.inmueble.direccion.colonia,
            municipio: asStringOrNull(extracted.direccion.municipio) || update.inmueble.direccion.municipio,
            estado: asStringOrNull(extracted.direccion.estado) || update.inmueble.direccion.estado,
            codigo_postal: asStringOrNull(extracted.direccion.codigo_postal) || update.inmueble.direccion.codigo_postal,
          }
        } else if (extracted?.ubicacion) {
          if (typeof extracted.ubicacion === 'string') {
            update.inmueble.direccion = { ...update.inmueble.direccion, calle: extracted.ubicacion }
          } else if (typeof extracted.ubicacion === 'object') {
            update.inmueble.direccion = { ...update.inmueble.direccion, ...extracted.ubicacion }
          }
        }

        // Datos catastrales: procesar objeto completo si está disponible
        if (extracted?.datosCatastrales && typeof extracted.datosCatastrales === 'object') {
          update.inmueble.datos_catastrales = {
            lote: asStringOrNull(extracted.datosCatastrales.lote) || update.inmueble.datos_catastrales.lote,
            manzana: asStringOrNull(extracted.datosCatastrales.manzana) || update.inmueble.datos_catastrales.manzana,
            fraccionamiento: asStringOrNull(extracted.datosCatastrales.fraccionamiento) || update.inmueble.datos_catastrales.fraccionamiento,
            condominio: asStringOrNull(extracted.datosCatastrales.condominio) || update.inmueble.datos_catastrales.condominio,
            unidad: asStringOrNull(extracted.datosCatastrales.unidad) || update.inmueble.datos_catastrales.unidad,
            modulo: asStringOrNull(extracted.datosCatastrales.modulo) || update.inmueble.datos_catastrales.modulo,
          }
        }

        // Superficie/valor (stringificar defensivo)
        if (extracted?.superficie) update.inmueble.superficie = asStringOrNull(extracted.superficie)
        if (extracted?.valor) update.inmueble.valor = asStringOrNull(extracted.valor)

        // Folios candidatos: poblar por "scope" cuando exista, sin seleccionar por defecto.
        // 1) Scopes explícitos (inscripción)
        const foliosUnidades = Array.isArray(extracted?.foliosRealesUnidades) ? extracted.foliosRealesUnidades : []
        for (const f of foliosUnidades) addCandidate(f, 'unidades')
        const foliosAfectados = Array.isArray(extracted?.foliosRealesInmueblesAfectados) ? extracted.foliosRealesInmueblesAfectados : []
        for (const f of foliosAfectados) addCandidate(f, 'inmuebles_afectados')

        // 2) foliosConInfo (si trae unidad/condominio, tratar como UNIDADES; si no, OTROS)
        const fci = Array.isArray(extracted?.foliosConInfo) ? extracted.foliosConInfo : []
        for (const entry of fci) {
          const entryScope =
            entry?.unidad || entry?.condominio ? 'unidades' : 'otros'
          addCandidate(entry?.folio, entryScope as any, {
            unidad: entry?.unidad ?? null,
            condominio: entry?.condominio ?? null,
            lote: entry?.lote ?? null,
            manzana: entry?.manzana ?? null,
            fraccionamiento: entry?.fraccionamiento ?? null,
            colonia: entry?.colonia ?? null,
            superficie: entry?.superficie ?? null,
            ubicacion: entry?.ubicacion ?? null,
            partida: entry?.partida ?? null,
          })
        }

        // 3) folios generales (fallback)
        const foliosReales = Array.isArray(extracted?.foliosReales) ? extracted.foliosReales : []
        for (const f of foliosReales) addCandidate(f, 'otros')
        if (extracted?.folioReal) addCandidate(extracted.folioReal, 'otros')

        // Helper: inferir persona moral con alta confianza a partir del nombre
        const inferTipoPersonaByName = (rawName: string): 'persona_moral' | null => {
          const n = String(rawName || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[“”"']/g, '')
            .replace(/[^a-z0-9\s.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

          // Señales fuertes de persona moral (MX + comunes)
          const pm = [
            /\bs\.?\s*a\.?\b/,                 // S.A.
            /\bs\.?\s*a\.?\s*de\s*c\.?\s*v\.?\b/, // S.A. de C.V.
            /\bs\.?\s*de\s*r\.?\s*l\.?\b/,     // S. de R.L.
            /\bs\.?\s*de\s*r\.?\s*l\.?\s*de\s*c\.?\s*v\.?\b/, // S. de R.L. de C.V.
            /\bsapi\b/,                         // SAPI
            /\bs\.?\s*a\.?\s*p\.?\s*i\.?\b/,   // S.A.P.I. o SAPI
            /\ba\.?\s*c\.?\b/,                  // A.C.
            /\bs\.?\s*c\.?\b/,                  // S.C.
            /\bsociedad\s+anonima\b/,          // "sociedad anonima"
            /\bsociedad\s+anonima\s+promotora\b/, // "sociedad anonima promotora"
            /\bsociedad\s+de\s+responsabilidad\s+limitada\b/,
            /\bsociedad\s+de\s+capital\s+variable\b/, // "sociedad de capital variable"
            /\bsociedad\s+anonima\s+promotora\s+de\s+inversion\s+de\s+capital\s+variable\b/, // Completo
            /\bcompania\b|\bcompania\s+.*\b/i,
            /\bempresa\b/,
            /\binmobiliaria\b/,                // "inmobiliaria" (común en nombres de empresas)
            /\bdesarrolladora\b/,              // "desarrolladora" (común en nombres de empresas)
            /\bcorporation\b|\bcorp\b|\binc\b|\bllc\b|\bltd\b/,
            /\bsociedad\b/,                    // "sociedad" (genérico, pero común en PM)
          ]
          if (pm.some(r => r.test(n))) return 'persona_moral'
          return null
        }

        // Titular registral → vendedores[0] (inferir tipo_persona si es posible)
        const propietarioNombre = extracted?.propietario?.nombre
        const propietarioRfc = extracted?.propietario?.rfc
        const propietarioCurp = extracted?.propietario?.curp
        if (propietarioNombre) {
          const vendedores = safeArray(ctx.vendedores)
          const v0 = vendedores[0] || { party_id: null, tipo_persona: null, tiene_credito: null }
          
          // Inferir tipo_persona desde el nombre si no está definido
          const inferredTipo = inferTipoPersonaByName(propietarioNombre)
          const tipoPersonaFinal = v0?.tipo_persona || inferredTipo || null

          // Si es persona moral (ya definida o inferida), actualizar denominación/rfc
          if (tipoPersonaFinal === 'persona_moral' || v0?.persona_moral) {
            vendedores[0] = {
              ...v0,
              tipo_persona: tipoPersonaFinal,
              persona_moral: {
                ...(v0.persona_moral || {}),
                denominacion_social: propietarioNombre || v0?.persona_moral?.denominacion_social || null,
                rfc: propietarioRfc || v0?.persona_moral?.rfc || null,
              },
              persona_fisica: undefined, // Limpiar persona_fisica si es moral
            }
          } else {
            // Si es persona física o no se puede inferir, guardar en persona_fisica
            vendedores[0] = {
              ...v0,
              tipo_persona: tipoPersonaFinal,
              persona_fisica: {
                ...(v0.persona_fisica || {}),
                nombre: propietarioNombre || v0?.persona_fisica?.nombre || null,
                rfc: propietarioRfc || v0?.persona_fisica?.rfc || null,
                curp: propietarioCurp || v0?.persona_fisica?.curp || null,
              },
              persona_moral: undefined, // Limpiar persona_moral si es física
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
          const intent = (ctx as any)?._document_intent
          
          // Detectar automáticamente si es documento del cónyuge:
          // - Si hay un comprador casado y el nombre NO coincide con el comprador
          // - O si el intent explícitamente dice 'conyuge'
          const compradores = safeArray(ctx.compradores)
          const c0 = compradores[0]
          const compradorNombre = c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social || null
          const compradorCasado = c0?.persona_fisica?.estado_civil === 'casado'
          const conyugeParticipa = c0?.persona_fisica?.conyuge?.participa === true
          const conyugeNombre = c0?.persona_fisica?.conyuge?.nombre || null
          
          // Normalizar nombres para comparación
          const normalize = (s: string) =>
            String(s || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[“”"']/g, '')
              .replace(/[^a-z0-9\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          
          const nombreNormalizado = normalize(String(nombre))
          const compradorNormalizado = compradorNombre ? normalize(String(compradorNombre)) : null
          const nombreNoEsComprador = compradorNormalizado ? nombreNormalizado !== compradorNormalizado : true
          
          // Si el comprador está casado, el cónyuge participa, y el nombre NO es del comprador,
          // y aún no tenemos nombre del cónyuge, entonces es muy probable que sea el documento del cónyuge
          const esProbableConyuge = compradorCasado && 
                                    conyugeParticipa && 
                                    !conyugeNombre && 
                                    nombreNoEsComprador &&
                                    nombreNormalizado.length >= 6

          // Caso especial: estábamos esperando documento del CÓNYUGE (intent explícito o detección automática).
          // No pisar comprador/vendedor; guardar dentro de compradores[0].persona_fisica.conyuge.
          if (intent === 'conyuge' || esProbableConyuge) {
            const compradores = safeArray(ctx.compradores)
            const next = compradores.length > 0
              ? [...compradores]
              : [{ party_id: null, tipo_persona: 'persona_fisica', persona_fisica: { nombre: null, rfc: null, curp: null, estado_civil: null }, persona_moral: undefined }]
            const base = next[0] || { party_id: null, tipo_persona: null }
            const basePF = (base as any)?.persona_fisica || {}

            next[0] = {
              ...base,
              // No forzar tipo si ya era moral; solo setear si viene vacío.
              tipo_persona: (base as any)?.tipo_persona ?? 'persona_fisica',
              persona_fisica: {
                ...basePF,
                conyuge: {
                  nombre: String(nombre),
                  participa: true,
                },
              },
            }

            update.compradores = next
            update.control_impresion = {
              ...(ctx?.control_impresion || {}),
              imprimir_conyuges: true,
            }
            update.__targetPerson = 'conyuge'
            update._document_intent = null
          } else {
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
      }

      // === ACTA DE MATRIMONIO ===
      if (docType === 'acta_matrimonio') {
        const intent = (ctx as any)?._document_intent
        const n1 = extracted?.conyuge1?.nombre ? String(extracted.conyuge1.nombre) : null
        const n2 = extracted?.conyuge2?.nombre ? String(extracted.conyuge2.nombre) : null
        const nombres = [n1, n2].filter(Boolean) as string[]

        // Procesar acta de matrimonio si:
        // 1. Hay intent explícito de 'conyuge', O
        // 2. El comprador está casado y el cónyuge participa (detección automática)
        const compradores = safeArray(ctx.compradores)
        const c0 = compradores[0]
        const compradorCasado = c0?.persona_fisica?.estado_civil === 'casado'
        const conyugeParticipa = c0?.persona_fisica?.conyuge?.participa === true
        const conyugeNombre = c0?.persona_fisica?.conyuge?.nombre || null
        
        const debeProcesarActa = intent === 'conyuge' || (compradorCasado && conyugeParticipa && !conyugeNombre && nombres.length > 0)

        if (nombres.length > 0 && debeProcesarActa) {
          const compradores = safeArray(ctx.compradores)
          const c0 = compradores[0]
          const compradorNombre = c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social || null

          const normalize = (s: string) =>
            String(s || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[“”"']/g, '')
              .replace(/[^a-z0-9\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()

          const compradorNorm = compradorNombre ? normalize(String(compradorNombre)) : null
          const picked =
            (compradorNorm ? nombres.find(n => normalize(n) !== compradorNorm) : null) ||
            nombres[0]

          const next = compradores.length > 0
            ? [...compradores]
            : [{ party_id: null, tipo_persona: 'persona_fisica', persona_fisica: { nombre: null, rfc: null, curp: null, estado_civil: null }, persona_moral: undefined }]
          const base = next[0] || { party_id: null, tipo_persona: null }
          const basePF = (base as any)?.persona_fisica || {}

          next[0] = {
            ...base,
            tipo_persona: (base as any)?.tipo_persona ?? 'persona_fisica',
            persona_fisica: {
              ...basePF,
              conyuge: {
                nombre: String(picked),
                participa: true,
              },
            },
          }
          update.compradores = next
          update.control_impresion = {
            ...(ctx?.control_impresion || {}),
            imprimir_conyuges: true,
          }
          update.__targetPerson = 'conyuge'
          update._document_intent = null
        }
      }

      return update
    }

    // Si hay contexto, aplicamos merge canónico y devolvemos `data` + `state` ya alineados.
    let dataUpdate: any = null
    let state: any = null
    let mergedContextForState: any = null
    let targetPerson: string | null = null
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
      targetPerson = (dataUpdate as any)?.__targetPerson || null
      const { __targetPerson, ...cleanDataUpdate } = dataUpdate || {}
      mergedContextForState = { ...context, ...cleanDataUpdate, documentosProcesados: nextDocs }
      state = computePreavisoState(mergedContextForState).state
      // IMPORTANTE: el frontend necesita persistir `documentosProcesados` para:
      // - Agregar/deduplicar folios reales entre múltiples páginas
      // - Mostrar el listado completo para que el usuario elija
      dataUpdate = { ...cleanDataUpdate, documentosProcesados: nextDocs }
    }

    // Expediente existente: ahora se decide por target inferido por contexto (no por inferencia del modelo).
    let expedienteExistente = null
    const shouldLookupExpediente =
      documentType === "identificacion" &&
      !!context &&
      !!dataUpdate &&
      // Solo hacer lookup cuando sea identificación del COMPRADOR (nunca para cónyuge)
      (typeof (targetPerson as any) === 'string' ? targetPerson === 'comprador' : Object.prototype.hasOwnProperty.call(dataUpdate, 'compradores'))

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
          if (currentUser?.rol === 'abogado' && (comprador as any).notaria_id !== currentUser.notaria_id) {
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
      ...(ocrText ? { ocrText } : {}),
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

