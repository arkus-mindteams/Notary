/**
 * Document Processor para Preaviso
 * Procesa documentos y genera comandos en lugar de actualizar contexto directamente
 */

import { Command } from '../../base/types'
import { ValidationService } from '../../shared/services/validation-service'
import { ConyugeService } from '../../shared/services/conyuge-service'

import { createHash } from 'crypto'
import { DocumentoService } from '../../../services/documento-service'

export class PreavisoDocumentProcessor {
  /**
   * Procesa documento y genera comandos
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<{ commands: Command[]; extractedData: any }> {
    // 0. Intelligent Processing: Check if we already extracted this file globally
    let fileHash = ''
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileHash = createHash('md5').update(buffer).digest('hex')

      const cachedExtraction = await DocumentoService.findExtractionData(fileHash)
      if (cachedExtraction) {
        // Validación de versión de caché para inscripciones
        // Si es inscripción, requerimos que tenga la marca de "segundo pase" (_v=2)
        // Esto corrige el problema donde extracciones antiguas o incompletas (ej. solo 2 folios)
        // bloquean la detección correcta (ej. 8 folios).
        let isValidCache = true
        if (documentType === 'inscripcion') {
          if ((cachedExtraction._v || 0) < 2) {
            console.log(`[PreavisoDocumentProcessor] Cache hit but OUTDATED version (${cachedExtraction._v || 0}) for inscripcion. Forcing re-process.`)
            isValidCache = false
          }
        }

        if (isValidCache) {
          console.log(`[PreavisoDocumentProcessor] Intelligent Processing: Reusing global extraction for hash ${fileHash}`)
          // Reuse cached data
          let extracted = cachedExtraction

          // Simular flujo de procesamiento con datos cacheados
          let commands: Command[] = []
          switch (documentType) {
            case 'inscripcion':
              commands = this.processInscripcion(extracted, context)
              break
            case 'identificacion':
              commands = this.processIdentificacion(extracted, context)
              break
            case 'acta_matrimonio':
              commands = this.processActaMatrimonio(extracted, context)
              break
            case 'escritura':
              commands = this.processEscritura(extracted, context)
              break
            default:
              commands = []
          }

          return {
            commands,
            extractedData: extracted
          }
        }
      }
    } catch (e) {
      console.error('[PreavisoDocumentProcessor] Error checking cache:', e)
      // Continue normal flow if cache check fails
    }

    // 1. Llamar a OpenAI Vision API (reutilizar lógica existente)
    let extracted = await this.extractWithOpenAI(file, documentType)

    // 2. Segundo pase para folios (solo inscripción) - detecta TODOS los folios
    let secondPassSuccess = false
    if (documentType === 'inscripcion') {
      const { result, success } = await this.ensureAllFoliosOnPage(file, extracted)
      extracted = result
      if (success) {
        // Solo marcar versión 2 si el segundo pase se ejecutó CORRECTAMENTE (sin errores)
        extracted._v = 2
        secondPassSuccess = true
      } else {
        console.warn('[PreavisoDocumentProcessor] Second pass failed. NOT marking as v2 to allow retry.')
      }
    } else {
      // Para otros documentos, asumimos que v1 es suficiente o no aplica v2
      extracted._v = 2
      secondPassSuccess = true
    }

    // 2.5. Cache the result for future global reuse
    // Solo cachear si tenemos un resultado "completo" (v2) o si no es inscripción (v1 ok)
    // Esto evita cachear resultados parciales cuando falla el segundo pase
    if (fileHash && extracted && Object.keys(extracted).length > 0 && secondPassSuccess) {
      // Save asynchronously/background
      DocumentoService.saveExtractionData(fileHash, extracted).catch((err: any) => {
        console.error('[PreavisoDocumentProcessor] Error saving cache:', err)
      })
    }

    // 3. Procesar según tipo y generar comandos
    let commands: Command[] = []
    switch (documentType) {
      case 'inscripcion':
        commands = this.processInscripcion(extracted, context)
        break

      case 'identificacion':
        commands = this.processIdentificacion(extracted, context)
        break

      case 'acta_matrimonio':
        commands = this.processActaMatrimonio(extracted, context)
        break

      case 'escritura':
        commands = this.processEscritura(extracted, context)
        break

      default:
        commands = []
    }

    return {
      commands,
      extractedData: extracted // Retornar datos extraídos originales
    }
  }

  /**
   * Segundo pase dedicado para detectar TODOS los folios
   * El LLM a veces solo detecta el primer folio, este pase asegura que se detecten todos
   */
  private async ensureAllFoliosOnPage(file: File, current: any): Promise<{ result: any; success: boolean }> {
    const folios = Array.isArray(current?.foliosReales) ? current.foliosReales.filter(Boolean) : []
    const foliosConInfo = Array.isArray(current?.foliosConInfo) ? current.foliosConInfo : []
    const foliosConInfoFolios = foliosConInfo.map((f: any) => f?.folio).filter(Boolean)
    const totalKnown = new Set([...folios, ...foliosConInfoFolios].map((x: any) => String(x)))

    // Verificar si hay folios de "inmuebles afectados" detectados
    const hasInmueblesAfectados = Array.isArray(current?.foliosRealesInmueblesAfectados) &&
      current.foliosRealesInmueblesAfectados.length > 0

    // SIEMPRE ejecutar segundo pase para inscripciones para asegurar que capturamos TODOS los folios
    // El LLM a veces omite folios que están en diferentes secciones de la misma página
    // El segundo pase es más agresivo y específico para folios

    // Si tenemos 0-1 folios, hacer segundo pase dedicado
    try {
      const apiKey = process.env.OPENAI_API_KEY
      const model = process.env.OPENAI_MODEL || 'gpt-4o'

      if (!apiKey) return { result: current, success: false }

      // Convertir archivo a base64
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mimeType = file.type || 'image/jpeg'

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
  "foliosReales": ["lista de TODOS los folios reales detectados como strings, sin omitir ninguno. Si no encuentras ninguno, []"],
  "foliosRealesUnidades": ["lista de folios reales detectados en secciones de UNIDADES (p.ej. 'DEPARTAMENTO/LOCAL/ESTACIONAMIENTO', 'UNIDAD', 'CONJ. HABITACIONAL'). Si no hay, []"],
  "foliosRealesInmueblesAfectados": ["lista de folios reales detectados específicamente bajo el encabezado 'INMUEBLE(S) AFECTADO(S)'. Si no hay, []"]
}

REGLAS CRÍTICAS:
- Escanea TODA la imagen METICULOSAMENTE (arriba, en medio, abajo, izquierda, derecha). No te quedes con el primero.
- Busca el patrón "FOLIO REAL:" en TODA la imagen, no solo en una sección.
- Incluye TODOS los folios, incluso si aparecen en distintas secciones:
  * Secciones de UNIDADES (DEPARTAMENTO, LOCAL, ESTACIONAMIENTO, etc.)
  * Sección "INMUEBLE(S) AFECTADO(S)" o "INMUEBLES AFECTADOS"
  * Sección "ANTECEDENTES" o "ANTECEDENTES REGISTRALES"
  * Cualquier otra sección donde aparezca "FOLIO REAL:"
- Si hay varios folios (incluso si son consecutivos como 1782480, 1782481, 1782482, 1782483, 1782484, 1782485, 1782486), deben ir TODOS en el array.
- NO omitas ningún folio, incluso si son números consecutivos.
- Clasifica los folios según su sección: unidades vs inmuebles afectados.
- Si un folio aparece en la sección "INMUEBLE(S) AFECTADO(S)", debe ir en foliosRealesInmueblesAfectados[].
- NO inventes datos: si no se ve claro, usa null.`

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: folioScanSystem },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Encuentra TODOS los folios reales en esta imagen. Busca METICULOSAMENTE en TODA la imagen, incluyendo: secciones de UNIDADES, sección "INMUEBLE(S) AFECTADO(S)", y cualquier otra sección. NO omitas ningún folio, incluso si son números consecutivos. Incluye TODOS los folios que encuentres.' },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
              ]
            }
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
          ...(model.includes("gpt-5") || model.includes("o1")
            ? { max_completion_tokens: 2000 }
            : { max_tokens: 2000 })
        })
      })

      if (!response.ok) {
        // Si hay error, no bloquear el flujo principal
        return { result: current, success: false }
      }

      const data = await response.json()
      const content = data.choices[0]?.message?.content || '{}'

      let parsed: any = null
      try {
        let jt = String(content || '').trim()
        if (jt.startsWith('```')) {
          const m = jt.match(/```(?:json)?\n([\s\S]*?)\n```/)
          if (m) jt = m[1]
        }
        parsed = JSON.parse(jt)
      } catch {
        parsed = null
      }

      if (!parsed) return { result: current, success: false }

      const scanned = Array.isArray(parsed?.foliosReales) ? parsed.foliosReales.filter(Boolean).map((x: any) => String(x)) : []
      const scannedFolios = Array.isArray(parsed?.folios) ? parsed.folios : []
      if (scanned.length === 0 && scannedFolios.length === 0) return { result: current, success: true } // Success but no new info is technically a success

      const scannedFromObjects = scannedFolios
        .map((f: any) => f?.folio)
        .filter(Boolean)
        .map((x: any) => String(x))
      const scannedAll = [...scanned, ...scannedFromObjects]
      if (scannedAll.length === 0) return { result: current, success: true }

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
      console.log('[DocumentProcessor.ensureAllFoliosOnPage] Folios después del segundo pase:', {
        foliosIniciales: folios,
        foliosConInfoIniciales: foliosConInfoFolios,
        foliosEscaneados: scannedAll,
        foliosMergeados: mergedFolios,
        totalDetectados: mergedFolios.length
      })

      const next = { ...(current || {}) }
      next.foliosReales = mergedFolios
      // Si hay múltiples, folioReal debe ser null (evita autoselección)
      if (mergedFolios.length > 1) next.folioReal = null

      // Actualizar foliosRealesUnidades e inmueblesAfectados del segundo pase
      if (Array.isArray(parsed?.foliosRealesUnidades) && parsed.foliosRealesUnidades.length > 0) {
        next.foliosRealesUnidades = parsed.foliosRealesUnidades.filter(Boolean).map((x: any) => String(x))
      }
      if (Array.isArray(parsed?.foliosRealesInmueblesAfectados) && parsed.foliosRealesInmueblesAfectados.length > 0) {
        next.foliosRealesInmueblesAfectados = parsed.foliosRealesInmueblesAfectados.filter(Boolean).map((x: any) => String(x))
      }

      // Mergear foliosConInfo del segundo pase con los existentes
      const scannedFoliosInfo = scannedFolios.map((f: any) => ({
        folio: String(f?.folio || ''),
        unidad: f?.unidad || null,
        condominio: f?.condominio || null,
        ubicacion: f?.ubicacion || null,
        direccion: f?.direccion || null,
        superficie: f?.superficie || null
      })).filter((f: any) => f.folio)

      // Mergear con foliosConInfo existentes
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
          direccion: f?.direccion ?? prev?.direccion ?? null,
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

      return { result: next, success: true }
    } catch (error) {
      console.error('[DocumentProcessor] Error en segundo pase de folios:', error)
      return { result: current, success: false }
    }
  }

  /**
   * Extrae información con OpenAI Vision API
   * (Reutiliza lógica de preaviso-process-document)
   */
  private async extractWithOpenAI(file: File, documentType: string): Promise<any> {
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || 'gpt-4o'

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    // Convertir archivo a base64
    const arrayBuffer = await file.arrayBuffer()
    const mimeType = file.type || 'image/jpeg'

    // Validar tipos soportados por OpenAI Vision
    const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    if (!supportedImageTypes.includes(mimeType)) {
      const screenshotTip = 'Recomendación: Abra el archivo, tome una captura de pantalla (screenshot) de la sección relevante y péguela aquí en el chat.'

      if (mimeType.includes('pdf')) {
        throw new Error(`El procesamiento directo de PDFs no está soportado por esta vía visual. ${screenshotTip}`)
      }
      if (mimeType.includes('word') || mimeType.includes('officedocument')) {
        throw new Error(`Los documentos de Word (.docx) no son soportados. ${screenshotTip}`)
      }
      // Intentar enviar como imagen de todas formas si no es documento conocido, pero advertir
      console.warn('[DocumentProcessor] Tipo MIME no estándar para visión:', mimeType)
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Obtener prompt según tipo de documento
    const { systemPrompt, userPrompt } = this.getPromptsForDocumentType(documentType)

    // Llamar a OpenAI Vision API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        ...(model.includes("gpt-5") || model.includes("o1")
          ? { max_completion_tokens: 2000 }
          : { max_tokens: 2000 }
        )
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      // Mejorar mensaje de error de OpenAI
      const msg = errorData.error?.message || 'Unknown error'
      if (msg.includes('Invalid MIME type')) {
        throw new Error(`Formato de archivo no soportado por IA (${mimeType}). Use JPG, PNG o WEBP.`)
      }
      throw new Error(`OpenAI API error: ${msg}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '{}'

    try {
      return JSON.parse(content)
    } catch (error) {
      console.error('[DocumentProcessor] Error parsing OpenAI response:', error)
      return {}
    }
  }

  /**
   * Obtiene prompts según tipo de documento
   */
  private getPromptsForDocumentType(documentType: string): { systemPrompt: string; userPrompt: string } {
    // Por ahora, usar prompts simplificados
    // En producción, usar los prompts completos de preaviso-process-document

    switch (documentType) {
      case 'inscripcion':
        return {
          systemPrompt: `Eres un experto en análisis de documentos registrales (hojas de inscripción, certificados registrales, etc.). Analiza el documento METICULOSAMENTE y extrae TODA la información disponible en formato JSON:

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
      "ubicacion": "dirección completa del inmueble asociado a este folio (string simple para fallback)",
      "direccion": {
        "calle": "nombre de la calle",
        "numero": "número exterior",
        "colonia": "colonia",
        "municipio": "municipio",
        "codigo_postal": "CP"
      },
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
  "gravamenes": "Array de objetos con detalles de gravámenes si existen, EJEMPLO: [{ acreedor: 'BANCO...', monto: '...', moneda: 'MXN' }]. Si el documento dice explícitamente 'LIBRE DE GRAVAMEN', 'SIN GRAVAMEN' o 'NO SE REPORTAN GRAVÁMENES', retorna el string exacto 'LIBRE'. Si no hay información, retornar null",
  "numeroExpediente": "número de expediente registral si está visible"
}

INSTRUCCIONES CRÍTICAS:
1. Extrae SOLO la información que puedas leer CLARAMENTE en el documento. Si no estás seguro, usa null.
1.1 PROPIETARIO/TITULAR (CRÍTICO):
   - El campo propietario.nombre SOLO puede salir de la sección rotulada como "PROPIETARIO(S)" o "TITULAR REGISTRAL" (si existe).
   - NO uses nombres de personal del registro/notaría: ignora "EJECUTIVO", "ANALISTA", "SUBREGISTRADOR", "COTEJADO", "COTEJADO CONTRA ORIGINAL", "MÉTODO DE AUTENTICIDAD", "FIRMA ELECTRÓNICA", "CÓDIGO DE AUTENTICIDAD".
   - Si no encuentras claramente el propietario bajo PROPIETARIO(S)/TITULAR REGISTRAL, deja propietario.nombre = null y propietario_contexto = "DESCONOCIDO".
   - Si lo encuentras, llena propietario_contexto como "PROPIETARIO(S)" o "TITULAR REGISTRAL" según el encabezado.
2. FOLIOS REALES (CRÍTICO): recorre TODA la página METICULOSAMENTE y detecta TODAS las ocurrencias del patrón "FOLIO REAL:" (puede aparecer múltiples veces).
   - Busca en TODAS las secciones: UNIDADES, "INMUEBLE(S) AFECTADO(S)", y cualquier otra sección.
   - Si encuentras más de un folio real, ponlos TODOS en foliosReales[] (sin omitir ninguno) y pon "folioReal": null.
   - NO omitas folios consecutivos (ej: si ves 1782480, 1782481, 1782482, 1782483, 1782484, 1782485, 1782486, incluye TODOS).
   - Si solo encuentras uno, ponlo en foliosReales[] y también en "folioReal".
   - NO te quedes con el primero: debes escanear el documento completo (arriba, medio, abajo, todas las secciones) antes de responder.
   - Además clasifica los folios según su sección: llena foliosRealesUnidades[] y foliosRealesInmueblesAfectados[] cuando aplique.
   - Si un folio aparece bajo el encabezado "INMUEBLE(S) AFECTADO(S)" o "INMUEBLES AFECTADOS", debe ir en foliosRealesInmueblesAfectados[].
3. Si detectas múltiples folios, intenta extraer información del inmueble asociada a cada folio en foliosConInfo[].
   - Si el documento muestra claramente qué información corresponde a cada folio, asóciala correctamente.
   - Si no puedes asociar información específica a cada folio, usa los campos generales (ubicacion, superficie, partida, datosCatastrales).
   - Si puedes, incluye una entrada en foliosConInfo[] por CADA folio detectado (al menos con { folio }).
4. Para partidas: prioriza las partidas que aparecen en la sección TÍTULO / INSCRIPCIÓN (esas van en partidasTitulo[]). NO uses las de ANTECEDENTES como partida principal.
   - Si encuentras partidas en ANTECEDENTES, colócalas en partidasAntecedentes[].
   - En partidas[] incluye TODAS las partidas detectadas, pero asegúrate de incluir las de partidasTitulo[] si existen.
5. Para dirección: si está disponible como objeto estructurado, usa direccion{}. Si solo está como texto, usa ubicacion.
6. NO extraigas ni infieras forma de pago o institución de crédito desde la inscripción (eso se confirma con el usuario en el chat).
7. Si algún campo no está disponible o no es legible, usa null (no inventes valores).`,
          userPrompt: 'Analiza este documento de inscripción registral METICULOSAMENTE. Extrae TODA la información que puedas leer claramente. IMPORTANTE: Busca TODOS los folios reales en TODAS las secciones del documento (UNIDADES, INMUEBLE(S) AFECTADO(S), y cualquier otra). NO omitas ningún folio, incluso si son números consecutivos. Incluye también: partidas registrales (todas si hay múltiples), sección, dirección completa del inmueble, datos catastrales (lote, manzana, fraccionamiento, condominio, unidad), superficie, propietario/titular registral, y cualquier gravamen o hipoteca visible. Si hay múltiples folios, intenta asociar la información del inmueble a cada folio según cómo aparezca en el documento.'
        }

      case 'identificacion':
        return {
          systemPrompt: `Eres un experto en análisis de documentos de identificación (INE, pasaporte, licencia, etc.). Extrae información en formato JSON:
{
  "nombre": "nombre completo tal como aparece en el documento (ej: "WU, JINWEI" o "QIAOZHEN ZHANG")",
  "rfc": "RFC si está visible",
  "curp": "CURP si está visible"
}

IMPORTANTE:
- Extrae el nombre EXACTAMENTE como aparece en el documento, incluyendo comas, apellidos primero, etc.
- Si es un pasaporte, el nombre puede aparecer en formato "APELLIDO, NOMBRE" o "NOMBRE APELLIDO"
- Si el nombre tiene comas, inclúyelas en la extracción
- Si no puedes leer el nombre claramente, usa null`,
          userPrompt: 'Analiza este documento de identificación METICULOSAMENTE y extrae el nombre completo exactamente como aparece en el documento.'
        }

      case 'acta_matrimonio':
        return {
          systemPrompt: `Eres un experto en análisis de actas de matrimonio. Extrae información en formato JSON:
{
  "conyuge1": { "nombre": "nombre completo del cónyuge 1 (exactamente como aparece)" },
  "conyuge2": { "nombre": "nombre completo del cónyuge 2 (exactamente como aparece)" }
}

REGLAS:
- Devuelve nombres completos, con apellidos y nombres, tal como aparecen (respetando orden, comas si existieran).
- NO inventes nombres. Si un nombre no es legible, usa null.
- Si el documento usa etiquetas como "CONTRAYENTE", "CÓNYUGE", "ESPOSO/ESPOSA", extrae ambos.`,
          userPrompt: 'Analiza esta acta de matrimonio y extrae los nombres completos de AMBOS cónyuges exactamente como aparecen.'
        }

      default:
        return {
          systemPrompt: 'Extrae información relevante del documento en formato JSON.',
          userPrompt: 'Analiza este documento y extrae la información relevante.'
        }
    }
  }

  /**
   * Procesa documento de inscripción
   */
  private processInscripcion(extracted: any, context: any): Command[] {
    const commands: Command[] = []

    // Folios: usar foliosReales del extracted (que ya incluye el merge del segundo pase)
    // ROBUSTEZ: Asegurar que incluimos folios de todas las sub-listas detectadas
    // A veces el LLM llena 'foliosRealesUnidades' pero olvida ponerlos en 'foliosReales'
    const mainList = Array.isArray(extracted.foliosReales) ? extracted.foliosReales : []
    const unidadesList = Array.isArray(extracted.foliosRealesUnidades) ? extracted.foliosRealesUnidades : []
    const afectadosList = Array.isArray(extracted.foliosRealesInmueblesAfectados) ? extracted.foliosRealesInmueblesAfectados : []

    const combined = new Set([...mainList, ...unidadesList, ...afectadosList])
    const folios = Array.from(combined).filter(Boolean).map((f: any) => String(f))

    // Asegurar que todos los folios de foliosConInfo también estén en la lista
    const foliosFromInfo = Array.isArray(extracted.foliosConInfo)
      ? extracted.foliosConInfo.map((f: any) => String(f?.folio || '')).filter(Boolean)
      : []

    // Mergear ambas listas (dedupe)
    const allFolios = new Set([...folios, ...foliosFromInfo])
    const mergedFolios = Array.from(allFolios).filter(Boolean)

    console.log('[DocumentProcessor] Folios detectados (Merged):', {
      mainList,
      unidadesList,
      afectadosList,
      mergedFolios,
      total: mergedFolios.length
    })

    // CRÍTICO: Siempre preguntar al usuario cuál folio usar, incluso si solo hay uno detectado
    // Solo auto-seleccionar si el contexto ya tiene ese mismo folio confirmado por el usuario EN ESTA SESIÓN
    const existingSelection = context.folios?.selection
    const existingFolioConfirmed = existingSelection?.confirmed_by_user === true &&
      existingSelection?.selected_folio

    // Verificar si el contexto tiene candidatos previos (indica que ya se procesó un documento en esta sesión)
    const hasPreviousCandidates = Array.isArray(context.folios?.candidates) && context.folios.candidates.length > 0

    if (mergedFolios.length > 1) {
      // Múltiples folios: siempre preguntar
      console.log('[DocumentProcessor] Múltiples folios detectados, preguntando al usuario')
      commands.push({
        type: 'multiple_folios_detected',
        timestamp: new Date(),
        payload: {
          folios: mergedFolios, // Usar lista mergeada para asegurar que todos los folios estén incluidos
          foliosConInfo: extracted.foliosConInfo || [],
          scope: {
            unidades: extracted.foliosRealesUnidades || [],
            inmuebles_afectados: extracted.foliosRealesInmueblesAfectados || []
          }
        }
      })
    } else if (mergedFolios.length === 1) {
      const detectedFolio = mergedFolios[0]
      const normalizeFolio = (f: any) => String(f || '').replace(/\D/g, '')
      const normalizedDetected = normalizeFolio(detectedFolio)
      const normalizedExisting = existingFolioConfirmed ? normalizeFolio(existingFolioConfirmed) : null

      // Solo auto-seleccionar si:
      // 1. El folio detectado coincide con el ya confirmado por el usuario EN ESTA SESIÓN
      // 2. Y hay candidatos previos (indica que ya se procesó un documento en esta sesión)
      // Si no hay candidatos previos, es una nueva sesión y siempre debemos preguntar
      if (hasPreviousCandidates && normalizedExisting && normalizedDetected === normalizedExisting) {
        console.log('[DocumentProcessor] Folio detectado coincide con el ya confirmado en esta sesión, usando ese')
        const folioInfo = extracted.foliosConInfo?.find((f: any) =>
          normalizeFolio(f?.folio) === normalizedDetected
        ) || extracted.foliosConInfo?.[0]

        commands.push({
          type: 'folio_selection',
          timestamp: new Date(),
          payload: {
            selectedFolio: detectedFolio,
            folioInfo: folioInfo,
            confirmedByUser: true // Ya estaba confirmado
          }
        })
      } else {
        // Si hay un solo folio pero:
        // - No está confirmado, O
        // - No hay candidatos previos (nueva sesión después de refrescar)
        // Entonces preguntar de todos modos
        console.log('[DocumentProcessor] Un solo folio detectado pero no confirmado o nueva sesión, preguntando al usuario', {
          hasPreviousCandidates,
          normalizedExisting,
          normalizedDetected
        })
        commands.push({
          type: 'multiple_folios_detected',
          timestamp: new Date(),
          payload: {
            folios: mergedFolios, // Tratar como múltiples para que pregunte
            foliosConInfo: extracted.foliosConInfo || [],
            scope: {
              unidades: extracted.foliosRealesUnidades || [],
              inmuebles_afectados: extracted.foliosRealesInmueblesAfectados || []
            }
          }
        })
      }
    } else {
      // No se detectaron folios
      console.log('[DocumentProcessor] No se detectaron folios en el documento')
    }

    // Propietario/Titular registral
    if (extracted.propietario?.nombre) {
      const tipoPersona = ValidationService.inferTipoPersona(extracted.propietario.nombre) || 'persona_fisica'

      // Si viene del documento de inscripción, se considera confirmado automáticamente
      // (el documento es fuente de verdad)
      commands.push({
        type: 'titular_registral',
        timestamp: new Date(),
        payload: {
          name: extracted.propietario.nombre,
          rfc: extracted.propietario.rfc,
          curp: extracted.propietario.curp,
          inferredTipoPersona: tipoPersona,
          confirmed: true, // Confirmado automáticamente porque viene del documento
          source: 'documento_inscripcion'
        }
      })
    }

    // 3. Gravámenes (Fix: procesar explícitamente)
    if (extracted.gravamenes) {
      if (extracted.gravamenes === 'LIBRE' || extracted.gravamenes === 'SIN GRAVAMEN') {
        console.log('[DocumentProcessor] Inmueble LIBRE de gravamen detectado')
        commands.push({
          type: 'encumbrance',
          timestamp: new Date(),
          payload: { exists: false, source: 'documento_inscripcion' }
        })
      } else if (Array.isArray(extracted.gravamenes) && extracted.gravamenes.length > 0) {
        console.log('[DocumentProcessor] Gravámenes detectados:', extracted.gravamenes.length)
        commands.push({
          type: 'encumbrance',
          timestamp: new Date(),
          payload: { exists: true, source: 'documento_inscripcion' }
        })

        // Agregar cada gravamen detectado
        extracted.gravamenes.forEach((g: any, idx: number) => {
          if (g && (g.acreedor || g.monto)) {
            commands.push({
              type: 'gravamen_acreedor',
              timestamp: new Date(),
              payload: {
                gravamenIndex: idx,
                institution: g.acreedor || 'ACREEDOR DESCONOCIDO',
                monto: g.monto || null,
                moneda: g.moneda || 'MXN',
                source: 'documento_inscripcion'
              }
            })
          }
        })
      }
    }

    // Información del inmueble (partidas, sección, dirección, etc.)
    // Esta información se guarda directamente en extractedData y se procesa en el endpoint
    // para actualizar el contexto.inmueble

    return commands
  }

  /**
   * Procesa documento de identificación
   */
  private processIdentificacion(extracted: any, context: any): Command[] {
    const commands: Command[] = []
    const nombre = extracted.nombre

    console.log('[DocumentProcessor] Procesando identificación:', {
      nombreExtraido: nombre,
      _document_intent: (context as any)?._document_intent ?? null,
      compradorNombre: context.compradores?.[0]?.persona_fisica?.nombre,
      compradorCasado: context.compradores?.[0]?.persona_fisica?.estado_civil === 'casado',
      conyugeNombre: context.compradores?.[0]?.persona_fisica?.conyuge?.nombre
    })

    if (!nombre || !ValidationService.isValidName(nombre)) {
      console.warn('[DocumentProcessor] Nombre no válido o no extraído:', nombre)
      return commands
    }

    // Determinar a qué va (comprador, cónyuge, vendedor)
    const intent = this.determineDocumentIntent(nombre, context)
    console.log('[DocumentProcessor] Intent detectado:', intent, 'para nombre:', nombre)

    // Si aún no hay comprador y no hay intención explícita, no asumir: registrar personas pendientes
    const hasBuyer = !!context.compradores?.[0]?.persona_fisica?.nombre
    const explicitIntent = (context as any)?._document_intent
    if (!hasBuyer && !explicitIntent) {
      commands.push({
        type: 'document_people_detected',
        timestamp: new Date(),
        payload: {
          source: 'identificacion',
          persons: [
            {
              name: nombre,
              rfc: extracted.rfc,
              curp: extracted.curp,
              source: 'documento_identificacion'
            }
          ]
        }
      })
      return commands
    }

    switch (intent) {
      case 'buyer':
        commands.push({
          type: 'buyer_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            inferredTipoPersona: 'persona_fisica',
            source: 'documento_identificacion'
          }
        })
        break

      case 'conyuge':
        commands.push({
          type: 'conyuge_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            source: 'documento_identificacion'
          }
        })
        break

      case 'seller':
        const tipoPersona = ValidationService.inferTipoPersona(nombre) || 'persona_fisica'
        commands.push({
          type: 'titular_registral',
          timestamp: new Date(),
          payload: {
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            inferredTipoPersona: tipoPersona,
            confirmed: false,
            source: 'documento_identificacion'
          }
        })
        break
    }

    return commands
  }

  /**
   * Procesa acta de matrimonio
   */
  private processActaMatrimonio(extracted: any, context: any): Command[] {
    const commands: Command[] = []

    const nombres = [
      extracted.conyuge1?.nombre,
      extracted.conyuge2?.nombre
    ].filter(Boolean)

    if (nombres.length >= 2) {
      const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
      const comprador = context.compradores?.[0]

      // Si no hay comprador aún, NO asumir roles. Pedir confirmación al usuario.
      if (!compradorNombre) {
        commands.push({
          type: 'document_people_detected',
          timestamp: new Date(),
          payload: {
            source: 'acta_matrimonio',
            persons: nombres.map((n: string) => ({
              name: n,
              source: 'documento_acta_matrimonio'
            }))
          }
        })
        return commands
      }

      // CRÍTICO: si viene acta de matrimonio, asegurar estado civil CASADO antes de guardar cónyuge
      // (el handler de cónyuge exige buyer.estado_civil === 'casado').
      const estadoCivilActual = comprador?.persona_fisica?.estado_civil
      if (comprador && estadoCivilActual !== 'casado') {
        commands.push({
          type: 'estado_civil',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            estadoCivil: 'casado',
            source: 'documento_acta_matrimonio'
          }
        })
      }

      // Si hay comprador, identificar cuál es el cónyuge
      if (compradorNombre) {
        for (const nombre of nombres) {
          if (nombre && !ConyugeService.namesMatch(nombre, compradorNombre)) {
            // Es el cónyuge
            commands.push({
              type: 'conyuge_name',
              timestamp: new Date(),
              payload: {
                buyerIndex: 0,
                name: nombre,
                source: 'documento_acta_matrimonio'
              }
            })
          }
        }
      }
      // Nota: ya se aseguró estado civil arriba para evitar errores de orden.
    } else if (nombres.length === 1) {
      // Si solo hay un nombre en el acta, puede ser que el comprador ya esté identificado
      // y este sea el cónyuge
      const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
      const comprador = context.compradores?.[0]
      const estadoCivilActual = comprador?.persona_fisica?.estado_civil
      if (comprador && estadoCivilActual !== 'casado') {
        commands.push({
          type: 'estado_civil',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            estadoCivil: 'casado',
            source: 'documento_acta_matrimonio'
          }
        })
      }
      if (compradorNombre && !ConyugeService.namesMatch(nombres[0], compradorNombre)) {
        commands.push({
          type: 'conyuge_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name: nombres[0],
            source: 'documento_acta_matrimonio'
          }
        })
      }
    }

    return commands
  }

  /**
   * Procesa escritura
   */
  private processEscritura(extracted: any, context: any): Command[] {
    // Similar a inscripción pero con menos campos
    return this.processInscripcion(extracted, context)
  }

  /**
   * Determina a qué va el documento (MEJORADO)
   * Considera el contexto de la conversación y _document_intent
   */
  private determineDocumentIntent(nombre: string, context: any): 'buyer' | 'conyuge' | 'seller' | 'unknown' {
    const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
    const vendedorNombre = context.vendedores?.[0]?.persona_fisica?.nombre ||
      context.vendedores?.[0]?.persona_moral?.denominacion_social
    const conyugeNombre = ConyugeService.getConyugeNombre(context)
    const compradorCasado = context.compradores?.[0]?.persona_fisica?.estado_civil === 'casado'
    const nombreNoEsComprador = compradorNombre && !ConyugeService.namesMatch(nombre, compradorNombre)

    // PRIORIDAD 0: Si el contexto indica explícitamente que se espera un documento del cónyuge
    // (esto se establece cuando el asistente pregunta por el cónyuge)
    const documentIntent = (context as any)?._document_intent
    if (documentIntent === 'conyuge' && compradorCasado && nombreNoEsComprador) {
      console.log('[DocumentProcessor] Intent explícito del contexto: conyuge')
      return 'conyuge'
    }

    // PRIORIDAD 1: Si coincide exactamente con comprador → es del comprador
    if (compradorNombre && ConyugeService.namesMatch(nombre, compradorNombre)) {
      return 'buyer'
    }

    // PRIORIDAD 2: Si coincide exactamente con cónyuge → es del cónyuge
    if (conyugeNombre && ConyugeService.namesMatch(nombre, conyugeNombre)) {
      return 'conyuge'
    }

    // PRIORIDAD 3: Si coincide exactamente con vendedor → es del vendedor
    if (vendedorNombre && ConyugeService.namesMatch(nombre, vendedorNombre)) {
      return 'seller'
    }

    // PRIORIDAD 4: Si hay comprador casado y el nombre NO es del comprador → probablemente cónyuge
    // Esta es la lógica clave: si el comprador está casado y el nombre no coincide con el comprador,
    // es muy probable que sea el cónyuge (especialmente si se está preguntando por el cónyuge)
    if (compradorCasado && nombreNoEsComprador && !conyugeNombre) {
      console.log('[DocumentProcessor] Inferido como cónyuge: comprador casado, nombre no coincide con comprador')
      return 'conyuge'
    }

    // PRIORIDAD 5: Si no hay comprador → no asumir (esperar confirmación)
    if (!compradorNombre) {
      return 'unknown'
    }

    // PRIORIDAD 6: Si hay comprador casado y el nombre no es del comprador → probablemente cónyuge
    // (incluso si ya hay vendedor, el cónyuge tiene prioridad sobre el vendedor cuando el comprador está casado)
    if (compradorCasado && nombreNoEsComprador) {
      console.log('[DocumentProcessor] Inferido como cónyuge: comprador casado, nombre diferente')
      return 'conyuge'
    }

    // PRIORIDAD 7: Si hay comprador pero no vendedor → probablemente es del vendedor
    if (compradorNombre && !vendedorNombre) {
      return 'seller'
    }

    // Por defecto, comprador
    return 'buyer'
  }
}
