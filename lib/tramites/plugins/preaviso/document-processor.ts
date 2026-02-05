import { Command } from '../../base/types'
import { createHash } from 'crypto'
import { DocumentoService } from '../../../services/documento-service'
import { getHandler } from './document-processor/handlers/registry'
import { ActivityLogService } from '../../../services/activity-log-service'

export class PreavisoDocumentProcessor {
  /**
   * Procesa documento y genera comandos
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<{ commands: Command[]; extractedData: any }> {
    const handler = getHandler(documentType)

    // 0. Intelligent Processing: Check if we already extracted this file globally
    let fileHash = ''
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileHash = createHash('md5').update(buffer).digest('hex')

      const cachedExtraction = await DocumentoService.findExtractionData(fileHash)
      if (cachedExtraction) {
        // Validación de versión de caché para inscripciones
        let isValidCache = true
        if (documentType === 'inscripcion') {
          if ((cachedExtraction._v || 0) < 2) {
            console.log(`[PreavisoDocumentProcessor] Cache hit but OUTDATED version (${cachedExtraction._v || 0}) for inscripcion. Forcing re-process.`)
            isValidCache = false
          }
        }

        if (isValidCache) {
          console.log(`[PreavisoDocumentProcessor] Intelligent Processing: Reusing global extraction for hash ${fileHash}`)
          let commands = handler.process(cachedExtraction, context)

          return {
            commands,
            extractedData: cachedExtraction
          }
        }
      }
    } catch (e) {
      console.error('[PreavisoDocumentProcessor] Error checking cache:', e)
    }

    // 1. Llamar a OpenAI Vision API (usando prompts del handler)
    const { extracted, usage: firstPassUsage } = await this.extractWithOpenAI(file, documentType)

    // ✅ LOGGING: 1er pase
    if (context._userId && firstPassUsage) {
      try {
        await ActivityLogService.logAIUsage({
          userId: context._userId,
          sessionId: context.conversation_id,
          tramiteId: context.tramiteId,
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          tokensInput: firstPassUsage.prompt_tokens || 0,
          tokensOutput: firstPassUsage.completion_tokens || 0,
          actionType: 'extract_document_data',
          metadata: {
            document_type: documentType,
            file_name: file.name,
            file_hash: fileHash,
            pass: 'first',
            from_cache: false
          }
        })
      } catch (logError) {
        console.error('[PreavisoDocumentProcessor] Error logging first pass:', logError)
      }
    }

    // 2. Segundo pase para folios (solo inscripción)
    let secondPassSuccess = false
    if (documentType === 'inscripcion') {
      const { result, success, usage: secondPassUsage } = await this.ensureAllFoliosOnPage(file, extracted, context)
      extracted._v = 2
      secondPassSuccess = success

      // ✅ LOGGING: 2do pase (solo si se ejecutó)
      if (context._userId && secondPassUsage) {
        try {
          await ActivityLogService.logAIUsage({
            userId: context._userId,
            sessionId: context.conversation_id,
            tramiteId: context.tramiteId,
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            tokensInput: secondPassUsage.prompt_tokens || 0,
            tokensOutput: secondPassUsage.completion_tokens || 0,
            actionType: 'extract_document_folios',
            metadata: {
              document_type: 'inscripcion',
              file_name: file.name,
              file_hash: fileHash,
              pass: 'second',
              folios_detected: result.foliosReales?.length || 0,
              from_cache: false
            }
          })
        } catch (logError) {
          console.error('[PreavisoDocumentProcessor] Error logging second pass:', logError)
        }
      }
    } else {
      extracted._v = 2
      secondPassSuccess = true
    }

    // 2.5. Cache the result for future global reuse
    if (fileHash && extracted && Object.keys(extracted).length > 0 && secondPassSuccess) {
      DocumentoService.saveExtractionData(fileHash, extracted).catch((err: any) => {
        console.error('[PreavisoDocumentProcessor] Error saving cache:', err)
      })
    }

    // 3. Generar comandos usando el handler
    const commands = handler.process(extracted, context)

    return {
      commands,
      extractedData: extracted
    }
  }

  /**
   * Segundo pase dedicado para detectar TODOS los folios
   * El LLM a veces solo detecta el primer folio, este pase asegura que se detecten todos
   */
  private async ensureAllFoliosOnPage(file: File, current: any, context?: any): Promise<{ result: any; success: boolean; usage: any }> {
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

      if (!apiKey) return { result: current, success: false, usage: null }

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
          // o1 models don't support temperature or response_format
          ...(model.includes("o1") || model.includes("o3") ? {} : {
            temperature: 0,
            response_format: { type: 'json_object' }
          }),
          // gpt-4o, gpt-4o-mini, o1, o3 use max_completion_tokens
          // gpt-3.5-turbo uses max_tokens
          ...(model.includes("gpt-4") || model.includes("o1") || model.includes("o3")
            ? { max_completion_tokens: 2000 }
            : { max_tokens: 2000 })
        })
      })

      if (!response.ok) {
        // Si hay error, no bloquear el flujo principal
        return { result: current, success: false, usage: null }
      }

      const data = await response.json()
      const content = data.choices[0]?.message?.content || '{}'
      const usage = data.usage || null // ✅ Capturar usage del segundo pase

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

      if (!parsed) return { result: current, success: false, usage: usage }

      const scanned = Array.isArray(parsed?.foliosReales) ? parsed.foliosReales.filter(Boolean).map((x: any) => String(x)) : []
      const scannedFolios = Array.isArray(parsed?.folios) ? parsed.folios : []
      if (scanned.length === 0 && scannedFolios.length === 0) return { result: current, success: true, usage: usage } // Success but no new info is technically a success

      const scannedFromObjects = scannedFolios
        .map((f: any) => f?.folio)
        .filter(Boolean)
        .map((x: any) => String(x))
      const scannedAll = [...scanned, ...scannedFromObjects]
      if (scannedAll.length === 0) return { result: current, success: true, usage: usage }

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

      return { result: next, success: true, usage: usage }
    } catch (error) {
      console.error('[DocumentProcessor] Error en segundo pase de folios:', error)
      return { result: current, success: false, usage: null }
    }
  }

  /**
   * Extrae información con OpenAI Vision API
   */
  private async extractWithOpenAI(file: File, documentType: string): Promise<{ extracted: any; usage: any }> {
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || 'gpt-4o'

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    // Convertir archivo a base64
    const arrayBuffer = await file.arrayBuffer()
    const mimeType = file.type || 'image/jpeg'

    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Obtener prompt según el handler
    const handler = getHandler(documentType)
    const { systemPrompt, userPrompt } = handler.getPrompts()

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
        // o1 models don't support temperature or response_format
        ...(model.includes("o1") || model.includes("o3") ? {} : {
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        // gpt-4o, gpt-4o-mini, o1, o3 use max_completion_tokens
        // gpt-3.5-turbo uses max_tokens
        ...(model.includes("gpt-4") || model.includes("o1") || model.includes("o3")
          ? { max_completion_tokens: 2000 }
          : { max_tokens: 2000 }
        )
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const msg = errorData.error?.message || 'Unknown error'
      throw new Error(`OpenAI API error: ${msg}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '{}'
    const usage = data.usage || null // ✅ Capturar usage

    try {
      return {
        extracted: JSON.parse(content),
        usage: usage
      }
    } catch (error) {
      console.error('[DocumentProcessor] Error parsing OpenAI response:', error)
      return {
        extracted: {},
        usage: usage
      }
    }
  }

}
