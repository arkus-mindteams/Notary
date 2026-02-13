import { Command } from '../../base/types'
import { createHash } from 'crypto'
import { DocumentoService } from '../../../services/documento-service'
import { getHandler } from './document-processor/handlers/registry'
import { ActivityLogService } from '../../../services/activity-log-service'

export class PreavisoDocumentProcessor {
  private decodeJsQuotedLiteral(literal: string): string {
    if (!literal || literal.length < 2) return literal
    const quote = literal[0]
    const inner = literal.slice(1, -1)
    if (quote === '"') {
      try {
        return JSON.parse(literal)
      } catch {
        return inner
      }
    }
    // single-quoted JS literal fallback
    return inner
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
  }

  private rebuildFromJsConcatenation(raw: string): string | null {
    const text = String(raw || '').trim()
    if (!text.includes('+')) return null
    const matches = text.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)
    if (!matches || matches.length === 0) return null
    const rebuilt = matches.map((m) => this.decodeJsQuotedLiteral(m)).join('')
    return rebuilt.trim() || null
  }

  private countDetectedFolios(extracted: any): number {
    const single = extracted?.folioReal ? [String(extracted.folioReal)] : []
    const main = Array.isArray(extracted?.foliosReales)
      ? extracted.foliosReales.filter(Boolean).map((x: any) => String(x))
      : []
    const info = Array.isArray(extracted?.foliosConInfo)
      ? extracted.foliosConInfo.map((x: any) => String(x?.folio || '')).filter(Boolean)
      : []
    const unidades = Array.isArray(extracted?.foliosRealesUnidades)
      ? extracted.foliosRealesUnidades.filter(Boolean).map((x: any) => String(x))
      : []
    const afectados = Array.isArray(extracted?.foliosRealesInmueblesAfectados)
      ? extracted.foliosRealesInmueblesAfectados.filter(Boolean).map((x: any) => String(x))
      : []
    return new Set([...single, ...main, ...info, ...unidades, ...afectados]).size
  }

  private hasMeaningfulExtraction(documentType: string, extracted: any): boolean {
    if (!extracted || typeof extracted !== 'object') return false

    if (documentType === 'inscripcion') {
      if (this.countDetectedFolios(extracted) > 0) return true
      const fullText = typeof extracted?.textoCompleto === 'string' ? extracted.textoCompleto.trim() : ''
      if (fullText.length >= 200) return true
      return false
    }

    const keys = Object.keys(extracted).filter((k) => !['_v', '_parse_recovered'].includes(k))
    return keys.length > 0
  }

  private safeParseJsonObject(raw: string): any | null {
    const text = String(raw || '').trim()
    if (!text) return null

    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const unfenced = (fenceMatch?.[1] || text).trim()
    const reconstructed = this.rebuildFromJsConcatenation(unfenced)
    const parseInput = (reconstructed || unfenced).trim()

    const firstBrace = parseInput.indexOf('{')
    const lastBrace = parseInput.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null
    }

    const candidate = parseInput.slice(firstBrace, lastBrace + 1).trim()

    try {
      return JSON.parse(candidate)
    } catch {
      // Recovery strategy: try progressively earlier closing braces.
      for (let i = candidate.length - 1; i >= 0; i--) {
        if (candidate[i] !== '}') continue
        const partial = candidate.slice(0, i + 1)
        try {
          return JSON.parse(partial)
        } catch {
          // continue
        }
      }
      return null
    }
  }

  private extractFoliosFromRawText(raw: string): string[] {
    const text = String(raw || '')
    if (!text) return []

    const found = new Set<string>()
    const pushDigits = (value: string) => {
      const digits = String(value || '').replace(/\D/g, '')
      if (digits.length >= 6 && digits.length <= 9) found.add(digits)
    }

    // Prefer explicit folio arrays when present.
    const arrayKeyPattern = /"?(foliosReales(?:Unidades|InmueblesAfectados)?)"?\s*:\s*\[([\s\S]*?)\]/gi
    let arrayMatch: RegExpExecArray | null
    while ((arrayMatch = arrayKeyPattern.exec(text)) !== null) {
      const arrayBody = arrayMatch[2] || ''
      const numPattern = /["']?(\d{6,9})["']?/g
      let numMatch: RegExpExecArray | null
      while ((numMatch = numPattern.exec(arrayBody)) !== null) {
        pushDigits(numMatch[1])
      }
    }

    // Also recover folios listed as objects: { "folio": "1234567" }.
    const folioObjectPattern = /"folio"\s*:\s*["']?(\d{6,9})["']?/gi
    let folioObjMatch: RegExpExecArray | null
    while ((folioObjMatch = folioObjectPattern.exec(text)) !== null) {
      pushDigits(folioObjMatch[1])
    }

    // Last resort: folio-like mentions in plain text.
    if (found.size === 0) {
      const plainPattern = /folio[^\n\r]{0,80}?(\d{6,9})/gi
      let plainMatch: RegExpExecArray | null
      while ((plainMatch = plainPattern.exec(text)) !== null) {
        pushDigits(plainMatch[1])
      }
    }

    return Array.from(found)
  }

  private shouldRunSecondPassForInscripcion(extracted: any): { run: boolean; reason: string } {
    const folios = Array.isArray(extracted?.foliosReales)
      ? extracted.foliosReales.filter(Boolean).map((x: any) => String(x))
      : []
    const foliosConInfo = Array.isArray(extracted?.foliosConInfo)
      ? extracted.foliosConInfo.map((x: any) => String(x?.folio || '').trim()).filter(Boolean)
      : []
    const foliosUnidades = Array.isArray(extracted?.foliosRealesUnidades)
      ? extracted.foliosRealesUnidades.filter(Boolean).map((x: any) => String(x))
      : []
    const textoCompleto = typeof extracted?.textoCompleto === 'string' ? extracted.textoCompleto.trim() : ''

    const foliosSet = new Set(folios)
    const infoSet = new Set(foliosConInfo)
    const coveredFolios = Array.from(foliosSet).filter((f) => infoSet.has(f)).length
    const coverageRatio = foliosSet.size > 0 ? coveredFolios / foliosSet.size : 0

    if (foliosSet.size <= 1) return { run: true, reason: 'single_or_zero_folios' }
    if (coverageRatio < 0.8) return { run: true, reason: 'low_folios_info_coverage' }
    if (textoCompleto.length < 1200) return { run: true, reason: 'short_transcription' }
    if (foliosUnidades.length > 0 && foliosUnidades.length < foliosSet.size) {
      return { run: true, reason: 'partial_units_detection' }
    }

    return { run: false, reason: 'first_pass_has_good_coverage' }
  }

  /**
   * Procesa documento y genera comandos
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<{ commands: Command[]; extractedData: any }> {
    const handler = getHandler(documentType)
    const bulkFastMode = context?._bulk_fast_mode === true

    // 0. Intelligent Processing: Check if we already extracted this file globally (salvo forceReprocess)
    let fileHash = ''
    const forceReprocess = context?.forceReprocess === true
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      fileHash = createHash('md5').update(buffer).digest('hex')

      if (!forceReprocess) {
        const cachedExtraction = await DocumentoService.findExtractionData(fileHash)
        if (cachedExtraction) {
        // ValidaciÃ³n de versiÃ³n de cachÃ© para inscripciones
        let isValidCache = true
        if (documentType === 'inscripcion') {
          if ((cachedExtraction._v || 0) < 2) {
            isValidCache = false
          }
          if (!this.hasMeaningfulExtraction(documentType, cachedExtraction)) {
            isValidCache = false
          }
        }

        if (isValidCache) {
          console.info('[PreavisoDocumentProcessor] cache_hit', {
            document_type: documentType,
            file_name: file?.name,
            file_hash: fileHash,
            folios_detected: this.countDetectedFolios(cachedExtraction)
          })
          let commands = handler.process(cachedExtraction, context)

          return {
            commands,
            extractedData: cachedExtraction
          }
        } else {
          console.warn('[PreavisoDocumentProcessor] cache_invalid_ignored', {
            document_type: documentType,
            file_name: file?.name,
            file_hash: fileHash,
            cache_version: cachedExtraction?._v || 0,
            folios_detected: this.countDetectedFolios(cachedExtraction)
          })
        }
      } else {
        console.info('[PreavisoDocumentProcessor] cache_miss', {
          document_type: documentType,
          file_name: file?.name,
          file_hash: fileHash
        })
      }
      }
    } catch (e) {
      console.error('[PreavisoDocumentProcessor] Error checking cache:', e)
    }

    // 1. Llamar a OpenAI Vision API (usando prompts del handler)
    const firstPassStartedAt = Date.now()
    let extracted: any = {}
    let firstPassUsage: any = null
    try {
      const firstPassResult = await this.extractWithOpenAI(file, documentType, context)
      extracted = firstPassResult.extracted || {}
      firstPassUsage = firstPassResult.usage || null
    } catch (error: any) {
      console.error('[PreavisoDocumentProcessor] first_pass_failed', {
        document_type: documentType,
        file_name: file?.name,
        message: String(error?.message || error)
      })
      extracted = {}
      firstPassUsage = null
    }
    const firstPassMs = Date.now() - firstPassStartedAt

    // âœ… LOGGING: 1er pase
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
            from_cache: false,
            duration_ms: firstPassMs
          }
        })
      } catch (logError) {
        console.error('[PreavisoDocumentProcessor] Error logging first pass:', logError)
      }
    }

    // 2. Segundo pase para folios (solo inscripcion, adaptativo)
    let secondPassSuccess = false
    let secondPassExecuted = false
    if (documentType === 'inscripcion') {
      const decision = this.shouldRunSecondPassForInscripcion(extracted)
      const detectedFolios = this.countDetectedFolios(extracted)
      const mustRecoverFolios = bulkFastMode && detectedFolios === 0
      const firstPassEmpty = Object.keys(extracted || {}).length === 0
      // Si el primer pase viene vacío/truncado, forzar segundo pase para no perder folios.
      const shouldRunSecondPass = firstPassEmpty || (!bulkFastMode ? decision.run : mustRecoverFolios)

      if (shouldRunSecondPass) {
        secondPassExecuted = true
        const secondPassStartedAt = Date.now()
        const { result, success, usage: secondPassUsage } = await this.ensureAllFoliosOnPage(file, extracted, context)
        const secondPassMs = Date.now() - secondPassStartedAt
        // Si el segundo pase devuelve algo útil, reemplazar; si no, conservar lo previo.
        if (result && typeof result === 'object' && Object.keys(result).length > 0) {
          extracted = result
        }
        extracted._v = 2
        secondPassSuccess = success || this.countDetectedFolios(extracted) > 0

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
                from_cache: false,
                duration_ms: secondPassMs,
                trigger_reason: firstPassEmpty
                  ? 'first_pass_empty_or_parse_failed'
                  : (mustRecoverFolios ? 'bulk_fast_missing_folios' : decision.reason)
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
    } else {
      extracted._v = 2
      secondPassSuccess = true
    }

    console.info('[PreavisoDocumentProcessor] processDocument timing', {
      document_type: documentType,
      bulk_fast_mode: bulkFastMode,
      first_pass_ms: firstPassMs,
      second_pass_enabled: documentType === 'inscripcion',
      second_pass_executed: secondPassExecuted
    })

    // 2.5. Cache the result for future global reuse
    if (fileHash && this.hasMeaningfulExtraction(documentType, extracted) && secondPassSuccess) {
      DocumentoService.saveExtractionData(fileHash, extracted).catch((err: any) => {
        console.error('[PreavisoDocumentProcessor] Error saving cache:', err)
      })
    } else {
      console.warn('[PreavisoDocumentProcessor] cache_skip_save_non_meaningful', {
        document_type: documentType,
        file_name: file?.name,
        file_hash: fileHash || null,
        second_pass_success: secondPassSuccess,
        folios_detected: this.countDetectedFolios(extracted)
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
    // El LLM a veces omite folios que estÃ¡n en diferentes secciones de la misma pÃ¡gina
    // El segundo pase es mÃ¡s agresivo y especÃ­fico para folios

    // Si tenemos 0-1 folios, hacer segundo pase dedicado
    try {
      const apiKey = process.env.OPENAI_API_KEY
      const model = process.env.OPENAI_MODEL || 'gpt-4o'

      if (!apiKey) return { result: current, success: false, usage: null }

      // Convertir archivo a base64
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mimeType = file.type || 'image/jpeg'

      const folioScanSystem = `Eres un extractor especializado. Tu ÃšNICA tarea es:
1) encontrar TODOS los "FOLIO REAL:" en esta imagen y
2) extraer, si estÃ¡ visible cerca de cada folio, datos bÃ¡sicos (unidad y/o superficie y/o ubicaciÃ³n).

Devuelve SOLO este JSON:
{
  "folios": [
    {
      "folio": "nÃºmero de folio real (string)",
      "unidad": "unidad si aplica (string o null)",
      "condominio": "condominio/conjunto si aplica (string o null)",
      "ubicacion": "ubicaciÃ³n/direcciÃ³n si aplica (string o null)",
      "superficie": "superficie si aplica (string con unidad) o null"
    }
  ],
  "foliosReales": ["lista de TODOS los folios reales detectados como strings, sin omitir ninguno. Si no encuentras ninguno, []"],
  "foliosRealesUnidades": ["lista de folios reales detectados en secciones de UNIDADES (p.ej. 'DEPARTAMENTO/LOCAL/ESTACIONAMIENTO', 'UNIDAD', 'CONJ. HABITACIONAL'). Si no hay, []"],
  "foliosRealesInmueblesAfectados": ["lista de folios reales detectados especÃ­ficamente bajo el encabezado 'INMUEBLE(S) AFECTADO(S)'. Si no hay, []"]
}

REGLAS CRÃTICAS:
- Escanea TODA la imagen METICULOSAMENTE (arriba, en medio, abajo, izquierda, derecha). No te quedes con el primero.
- Busca el patrÃ³n "FOLIO REAL:" en TODA la imagen, no solo en una secciÃ³n.
- Incluye TODOS los folios, incluso si aparecen en distintas secciones:
  * Secciones de UNIDADES (DEPARTAMENTO, LOCAL, ESTACIONAMIENTO, etc.)
  * SecciÃ³n "INMUEBLE(S) AFECTADO(S)" o "INMUEBLES AFECTADOS"
  * SecciÃ³n "ANTECEDENTES" o "ANTECEDENTES REGISTRALES"
  * Cualquier otra secciÃ³n donde aparezca "FOLIO REAL:"
- Si hay varios folios (incluso si son consecutivos como 1782480, 1782481, 1782482, 1782483, 1782484, 1782485, 1782486), deben ir TODOS en el array.
- NO omitas ningÃºn folio, incluso si son nÃºmeros consecutivos.
- Clasifica los folios segÃºn su secciÃ³n: unidades vs inmuebles afectados.
- Si un folio aparece en la secciÃ³n "INMUEBLE(S) AFECTADO(S)", debe ir en foliosRealesInmueblesAfectados[].
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
                { type: 'text', text: 'Encuentra TODOS los folios reales en esta imagen. Busca METICULOSAMENTE en TODA la imagen, incluyendo: secciones de UNIDADES, secciÃ³n "INMUEBLE(S) AFECTADO(S)", y cualquier otra secciÃ³n. NO omitas ningÃºn folio, incluso si son nÃºmeros consecutivos. Incluye TODOS los folios que encuentres.' },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
              ]
            }
          ],
          // o1 models don't support temperature or response_format
          ...(model.includes("o1") || model.includes("o3") ? {} : {
            temperature: 0,
            response_format: { type: 'json_object' }
          }),
          // gpt-4o, gpt-5.x, o1, o3 use max_completion_tokens; gpt-3.5-turbo uses max_tokens
          ...(model.includes("gpt-4") || model.includes("gpt-5") || model.includes("o1") || model.includes("o3")
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
      const usage = data.usage || null // âœ… Capturar usage del segundo pase

      const parsed: any = this.safeParseJsonObject(content)
      const scanned = Array.isArray(parsed?.foliosReales)
        ? parsed.foliosReales.filter(Boolean).map((x: any) => String(x))
        : []
      const scannedFolios = Array.isArray(parsed?.folios) ? parsed.folios : []
      const recoveredFromRaw = this.extractFoliosFromRawText(content)
      if (scanned.length === 0 && scannedFolios.length === 0 && recoveredFromRaw.length === 0) {
        return { result: current, success: true, usage: usage } // Success but no new info is technically a success
      }

      const scannedFromObjects = scannedFolios
        .map((f: any) => f?.folio)
        .filter(Boolean)
        .map((x: any) => String(x))
      const scannedAll = [...scanned, ...scannedFromObjects, ...recoveredFromRaw]
      if (scannedAll.length === 0) return { result: current, success: true, usage: usage }

      // Merge (dedupe por dÃ­gitos)
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
      // Si hay mÃºltiples, folioReal debe ser null (evita autoselecciÃ³n)
      if (mergedFolios.length > 1) next.folioReal = null

      // Actualizar foliosRealesUnidades e inmueblesAfectados del segundo pase
      if (Array.isArray(parsed?.foliosRealesUnidades) && parsed.foliosRealesUnidades.length > 0) {
        next.foliosRealesUnidades = parsed.foliosRealesUnidades.filter(Boolean).map((x: any) => String(x))
      }
      if (Array.isArray(parsed?.foliosRealesInmueblesAfectados) && parsed.foliosRealesInmueblesAfectados.length > 0) {
        next.foliosRealesInmueblesAfectados = parsed.foliosRealesInmueblesAfectados.filter(Boolean).map((x: any) => String(x))
      }

      // Mergear foliosConInfo del segundo pase con los existentes
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
   * Extrae informaciÃ³n con OpenAI Vision API
   */
  private async extractWithOpenAI(file: File, documentType: string, context?: any): Promise<{ extracted: any; usage: any }> {
    const apiKey = process.env.OPENAI_API_KEY
    const bulkFastMode = context?._bulk_fast_mode === true
    const model = (bulkFastMode ? process.env.OPENAI_DOC_MODEL_BULK : process.env.OPENAI_DOC_MODEL) || process.env.OPENAI_MODEL || 'gpt-4o'

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const arrayBuffer = await file.arrayBuffer()
    const mimeType = file.type || 'image/jpeg'

    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const handler = getHandler(documentType)
    const { systemPrompt, userPrompt } = handler.getPrompts()
    const outputTokenCap = bulkFastMode
      ? Number(process.env.OPENAI_DOC_MAX_TOKENS_BULK || 1800)
      : Number(process.env.OPENAI_DOC_MAX_TOKENS || 5000)
    const timeoutMs = bulkFastMode
      ? Number(process.env.OPENAI_DOC_TIMEOUT_BULK_MS || 18000)
      : Number(process.env.OPENAI_DOC_TIMEOUT_MS || 30000)
    const timeoutController = new AbortController()
    const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs)
    const fastModeHint = bulkFastMode
      ? '\nModo bulk_fast activo: prioriza datos estructurados. Si no cabe, textoCompleto puede venir truncado.'
      : ''

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: timeoutController.signal,
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
                  text: `${userPrompt}${fastModeHint}`
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
          ...(model.includes("o1") || model.includes("o3") ? {} : {
            temperature: 0.1,
            response_format: { type: 'json_object' }
          }),
          ...(model.includes("gpt-4") || model.includes("gpt-5") || model.includes("o1") || model.includes("o3")
            ? { max_completion_tokens: outputTokenCap }
            : { max_tokens: outputTokenCap }
          )
        })
      })
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`OpenAI API timeout after ${timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const msg = errorData.error?.message || 'Unknown error'
      throw new Error(`OpenAI API error: ${msg}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '{}'
    const usage = data.usage || null // âœ… Capturar usage

    const parsed = this.safeParseJsonObject(content)
    if (parsed && typeof parsed === 'object') {
      console.info('[DocumentProcessor] parse_mode=json_ok', {
        document_type: documentType,
        file_name: file?.name,
        content_length: String(content || '').length,
        folios_detected: this.countDetectedFolios(parsed)
      })
      return {
        extracted: parsed,
        usage: usage
      }
    }

    const recoveredFolios = this.extractFoliosFromRawText(content)
    if (recoveredFolios.length > 0) {
      console.warn('[DocumentProcessor] OpenAI JSON truncated, recovered folios via regex fallback', {
        document_type: documentType,
        file_name: file?.name,
        recovered_folios: recoveredFolios.length,
        content_length: String(content || '').length
      })
      return {
        extracted: {
          folioReal: recoveredFolios.length === 1 ? recoveredFolios[0] : null,
          foliosReales: recoveredFolios,
          _parse_recovered: 'regex_folio_fallback'
        },
        usage: usage
      }
    }

    console.error('[DocumentProcessor] Error parsing OpenAI response: invalid_or_truncated_json', {
      document_type: documentType,
      file_name: file?.name,
      content_length: String(content || '').length,
      content_preview: String(content || '').slice(0, 300)
    })
    return {
      extracted: {},
      usage: usage
    }
  }

}
