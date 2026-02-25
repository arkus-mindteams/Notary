import { randomUUID } from 'crypto'
import { z } from 'zod'

const GMI_DEBUG = process.env.GMI_CAPTURE_DEBUG === '1'

export interface GMIIndependentCaptureInput {
  message: string
  currentStep?: string
  lastQuestionIntent?: string | null
  requiredMissing?: string[]
  pendingQuestions?: string[]
  collectedData?: Record<string, unknown>
  systemInstructions?: string
  detectedPeople?: string[]
  recentMessages?: Array<{ role: string; content: string }>
}

export interface GMIIndependentCaptureResult {
  intent: 'UPDATE_STATE'
  agent_used: 'GMIIndependentCaptureFlow'
  answer: string
  proposed_updates: Array<Record<string, unknown>>
  actions: Array<Record<string, unknown>>
  trace_id: string
}

const selectionSchema = z.object({
  matched_required_missing: z.string().trim().nullable(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().trim().optional(),
})

const extractionSchema = z.object({
  applies: z.boolean().optional(),
  op: z.literal('set').optional(),
  path: z.string().trim().optional(),
  value: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().trim().optional(),
})

const ALLOWED_UPDATE_PATHS = [
  /^compradores\[\d+\]\.persona_fisica\.nombre$/,
  /^compradores\[\d+\]\.persona_fisica\.rfc$/,
  /^compradores\[\d+\]\.persona_fisica\.curp$/,
  /^compradores\[\d+\]\.persona_fisica\.estado_civil$/,
  /^compradores\[\d+\]\.tipo_persona$/,
  /^compradores\[\d+\]\.persona_moral\.denominacion_social$/,
  /^compradores\[\d+\]\.persona_fisica\.conyuge\.nombre$/,
  /^vendedores\[\d+\]\.persona_fisica\.nombre$/,
  /^vendedores\[\d+\]\.tipo_persona$/,
  /^vendedores\[\d+\]\.persona_moral\.denominacion_social$/,
  /^inmueble\.folio_real$/,
  /^inmueble\.partidas$/,
  /^inmueble\.direccion$/,
  /^inmueble\.direccion\.(calle|numero|colonia|municipio|estado|codigo_postal)$/,
  /^inmueble\.existe_hipoteca$/,
  /^gravamenes$/,
  /^actosNotariales\.aperturaCreditoComprador$/,
  /^actosNotariales\.cancelacionCreditoVendedor$/,
  /^creditos$/,
  /^creditos\[\d+\]\.institucion$/,
  /^creditos\[\d+\]\.participantes$/,
]

class GMIClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey =
      process.env.GMI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      ''
    this.model = process.env.GMI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  async json(systemPrompt: string, payload: Record<string, unknown>, maxOutputTokens = 320): Promise<unknown | null> {
    if (!this.apiKey) return null

    const body = {
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens,
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'SYSTEM:',
                systemPrompt,
                '',
                'PAYLOAD:',
                JSON.stringify(payload),
              ].join('\n'),
            },
          ],
        },
      ],
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) return null

    const data = await resp.json().catch(() => ({}))
    let text = extractGeminiText(data).trim()
    if (!text) return null
    if (text.startsWith('```')) {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) text = match[1]
    }
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
}

export class GMIIndependentCaptureFlow {
  private readonly gmi = new GMIClient()

  async process(input: GMIIndependentCaptureInput): Promise<GMIIndependentCaptureResult> {
    const traceId = randomUUID()
    const message = stripCollectionHints(String(input.message || ''))
    const requiredMissing = normalizeRequiredMissing(input.requiredMissing)

    if (!this.gmi.isConfigured()) {
      return this.emptyResult(
        traceId,
        'GMI no esta configurado. Define GMI_API_KEY/GEMINI_API_KEY para habilitar este flujo.'
      )
    }
    if (!message) {
      return this.emptyResult(traceId, 'No recibi contenido para capturar.')
    }

    const heuristicUpdates = inferHeuristicUpdates({
      message,
      requiredMissing,
      collectedData: input.collectedData || {},
    })
    if (heuristicUpdates.length > 0) {
      return {
        intent: 'UPDATE_STATE',
        agent_used: 'GMIIndependentCaptureFlow',
        answer: 'Detecte multiples datos del mensaje y genere propuestas de actualizacion para los campos faltantes.',
        proposed_updates: heuristicUpdates,
        actions: [
          {
            type: 'review_proposed_updates',
            requires_domain_commit: true,
            source: 'gmi_independent_capture',
            mode: 'multi_field_fallback',
          },
        ],
        trace_id: traceId,
      }
    }

    if (requiredMissing.length === 0) {
      return this.emptyResult(traceId, 'No hay campos requeridos activos para capturar en este momento.')
    }

    const selected =
      requiredMissing.length === 1
        ? requiredMissing[0]
        : await this.selectMissing({
            ...input,
            message,
            requiredMissing,
          })
    if (!selected) {
      return this.emptyResult(traceId, 'No pude mapear el mensaje a un campo faltante especifico.')
    }

    const extracted = await this.extractForMissing({
      ...input,
      message,
      requiredMissing,
      selectedMissing: selected,
    })
    if (!extracted) {
      return this.emptyResult(
        traceId,
        `No pude extraer un valor confiable para "${selected}".`
      )
    }

    return {
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'Genere una propuesta de actualizacion alineada a los campos faltantes. Revisa y confirma para aplicar.',
      proposed_updates: [extracted],
      actions: [
        {
          type: 'review_proposed_updates',
          requires_domain_commit: true,
          source: 'gmi_independent_capture',
          selected_required_missing: selected,
        },
      ],
      trace_id: traceId,
    }
  }

  private async selectMissing(
    input: GMIIndependentCaptureInput & { requiredMissing: string[]; message: string }
  ): Promise<string | null> {
    const payload = {
      message: input.message,
      currentStep: input.currentStep || null,
      lastQuestionIntent: input.lastQuestionIntent || null,
      pendingQuestions: Array.isArray(input.pendingQuestions) ? input.pendingQuestions : [],
      collectedData: input.collectedData || {},
      required_missing_candidates: input.requiredMissing,
      detectedPeople: Array.isArray(input.detectedPeople) ? input.detectedPeople : [],
      recentMessages: Array.isArray(input.recentMessages)
        ? input.recentMessages.slice(-5).map((m) => ({
            role: String(m?.role || ''),
            content: stripCollectionHints(String(m?.content || '')).slice(0, 300),
          }))
        : [],
      rules: [
        'Selecciona SOLO un item exacto de required_missing_candidates o null.',
        'No inventes campos fuera de la lista.',
      ],
    }

    const parsed = await this.gmi.json(
      [
        'Eres un recolector de datos de tramite notarial.',
        'Trabaja solo con el mensaje del usuario, preguntas pendientes y contexto recolectado.',
        'No inventes campos ni valores.',
        'Responde SOLO JSON.',
        input.systemInstructions ? `INSTRUCCIONES_ADICIONALES: ${input.systemInstructions}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      payload,
      220
    )
    const safe = selectionSchema.safeParse(parsed)
    if (!safe.success) return null
    const selected = String(safe.data.matched_required_missing || '').trim()
    if (!selected || !input.requiredMissing.includes(selected)) return null
    if (GMI_DEBUG) {
      console.log('[GMIIndependentCaptureFlow] selected_missing', {
        selected,
        confidence: safe.data.confidence ?? null,
      })
    }
    return selected
  }

  private async extractForMissing(
    input: GMIIndependentCaptureInput & {
      requiredMissing: string[]
      message: string
      selectedMissing: string
    }
  ): Promise<Record<string, unknown> | null> {
    const targetPath = targetPathFromMissing(input.selectedMissing)
    if (!targetPath) return null

    const folioCandidates = Array.isArray((input.collectedData as any)?.folios?.candidates)
      ? ((input.collectedData as any).folios.candidates as any[])
          .map((c: any) => String(c?.folio || '').trim())
          .filter(Boolean)
          .slice(0, 20)
      : []

    const payload = {
      message: input.message,
      selected_required_missing: input.selectedMissing,
      target_path: targetPath,
      currentStep: input.currentStep || null,
      lastQuestionIntent: input.lastQuestionIntent || null,
      pendingQuestions: Array.isArray(input.pendingQuestions) ? input.pendingQuestions : [],
      collectedData: input.collectedData || {},
      folioCandidates,
      recentMessages: Array.isArray(input.recentMessages)
        ? input.recentMessages.slice(-5).map((m) => ({
            role: String(m?.role || ''),
            content: stripCollectionHints(String(m?.content || '')).slice(0, 300),
          }))
        : [],
      rules: [
        'Si no hay evidencia suficiente: applies=false.',
        'Si applies=true: op="set" y path debe ser compatible con target_path.',
        'No inventes datos.',
        'Si target_path es inmueble.folio_real y el mensaje contiene un folio de folioCandidates, usa ese valor exacto.',
      ],
      examples: {
        creditos: {
          credito: [{ institucion: null, participantes: [] }],
          contado: [],
        },
        estado_civil: ['casado', 'soltero', 'divorciado', 'viudo', 'union_libre'],
      },
    }

    const parsed = await this.gmi.json(
      [
        'Eres un extractor estricto de un unico campo faltante.',
        'Usa solo el mensaje del usuario, preguntas pendientes y contexto recolectado.',
        'No inventes informacion.',
        'Responde SOLO JSON.',
        input.systemInstructions ? `INSTRUCCIONES_ADICIONALES: ${input.systemInstructions}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      payload,
      280
    )
    const safe = extractionSchema.safeParse(parsed)
    const normalizedExtraction = normalizeExtractionCandidate(parsed, targetPath)
    const fallbackFolioValue =
      targetPath === 'inmueble.folio_real'
        ? extractCandidateFolioFromMessage(input.message, folioCandidates)
        : null
    if (!normalizedExtraction && fallbackFolioValue) {
      return {
        op: 'set',
        path: 'inmueble.folio_real',
        value: fallbackFolioValue,
        reason: 'Folio candidato detectado directamente del mensaje del usuario',
      }
    }
    if (!normalizedExtraction) return null
    if (normalizedExtraction.applies === false) return null

    const rawPath = String(normalizedExtraction.path || targetPath).trim()
    const canonicalPath = canonicalizePath(rawPath)
    if (!isAllowedPath(canonicalPath)) return null
    if (!matchesMissing(canonicalPath, input.selectedMissing)) return null

    const normalizedValue = normalizeValue(canonicalPath, normalizedExtraction.value)
    if (normalizedValue === null || normalizedValue === undefined) return null
    if (typeof normalizedValue === 'string' && !normalizedValue.trim()) return null

    return {
      op: 'set',
      path: canonicalPath,
      value: normalizedValue,
      reason:
        String(normalizedExtraction.reason || '').trim() ||
        `Captura inferida por GMI para ${input.selectedMissing}`,
    }
  }

  private emptyResult(traceId: string, answer: string): GMIIndependentCaptureResult {
    return {
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer,
      proposed_updates: [],
      actions: [
        {
          type: 'request_missing_field',
          reason: 'No se detectaron cambios estructurados claros para aplicar como propuesta',
        },
      ],
      trace_id: traceId,
    }
  }
}

function stripCollectionHints(value: string): string {
  const raw = String(value || '')
  if (!raw) return ''
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = String(line || '').trim()
      if (!trimmed) return true
      if (/^\[OBJETIVO_DE_CAPTURA\]\s*:/i.test(trimmed)) return false
      if (/^\[PERSONAS_DETECTADAS_NO_CLASIFICADAS\]\s*:/i.test(trimmed)) return false
      return true
    })
    .join('\n')
    .trim()
}

function normalizeRequiredMissing(requiredMissing?: string[]): string[] {
  return Array.isArray(requiredMissing)
    ? requiredMissing.map((x) => String(x || '').trim()).filter(Boolean)
    : []
}

function canonicalizePath(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return raw
  let out = raw
    .replace(/^compradores\[\]\.nombre$/, 'compradores[0].persona_fisica.nombre')
    .replace(/^vendedores\[\]\.nombre$/, 'vendedores[0].persona_fisica.nombre')
    .replace(/^compradores\[\]\.tipo_persona$/, 'compradores[0].tipo_persona')
    .replace(/^vendedores\[\]\.tipo_persona$/, 'vendedores[0].tipo_persona')
    .replace(/^compradores\[\]\.persona_fisica\.conyuge\.nombre$/, 'compradores[0].persona_fisica.conyuge.nombre')
    .replace(/^creditos\[\]\.institucion$/, 'creditos[0].institucion')
    .replace(/^creditos\[\]\.participantes\[\]$/, 'creditos[0].participantes')
    .replace(/^creditos\[\]\.participantes$/, 'creditos[0].participantes')
  out = out.replace(/^compradores\[(\d+)\]\.nombre$/, 'compradores[$1].persona_fisica.nombre')
  out = out.replace(/^vendedores\[(\d+)\]\.nombre$/, 'vendedores[$1].persona_fisica.nombre')
  out = out.replace(/\.participantes\[\]$/, '.participantes')
  return out
}

function isAllowedPath(path: string): boolean {
  return ALLOWED_UPDATE_PATHS.some((r) => r.test(path))
}

function targetPathFromMissing(missing: string): string | null {
  const raw = String(missing || '').trim()
  if (!raw) return null
  if (raw === 'compradores[].nombre') return 'compradores[0].persona_fisica.nombre'
  if (raw === 'vendedores[].nombre') return 'vendedores[0].persona_fisica.nombre'
  if (raw === 'compradores[].tipo_persona') return 'compradores[0].tipo_persona'
  if (raw === 'vendedores[].tipo_persona') return 'vendedores[0].tipo_persona'
  if (raw === 'compradores[].persona_fisica.conyuge.nombre') return 'compradores[0].persona_fisica.conyuge.nombre'
  if (raw === 'gravamenes[]') return 'gravamenes'
  if (raw === 'inmueble.hipoteca') return 'inmueble.existe_hipoteca'
  if (raw === 'actosNotariales.cancelacionCreditoVendedor') return 'actosNotariales.cancelacionCreditoVendedor'
  if (raw === 'actosNotariales.aperturaCreditoComprador') return 'actosNotariales.aperturaCreditoComprador'
  if (raw === 'existencia_credito' || raw === 'creditos[]') return 'creditos'
  if (raw.startsWith('creditos[') && raw.endsWith('.participantes[]')) return raw.replace(/\.participantes\[\]$/, '.participantes')
  if (raw.endsWith('[]')) return raw.slice(0, -2)
  return raw
}

function matchesMissing(path: string, missing: string): boolean {
  const canonicalPath = canonicalizePath(path)
  const target = targetPathFromMissing(missing)
  if (!target) return false
  const canonicalTarget = canonicalizePath(target)
  if (canonicalPath === canonicalTarget) return true
  if (canonicalTarget === 'vendedores' && canonicalPath.startsWith('vendedores[')) return true
  if (canonicalTarget === 'compradores' && canonicalPath.startsWith('compradores[')) return true
  if (canonicalTarget === 'inmueble.direccion' && canonicalPath.startsWith('inmueble.direccion.')) return true
  if (canonicalTarget === 'gravamenes' && (canonicalPath === 'gravamenes' || canonicalPath === 'inmueble.existe_hipoteca')) return true
  if (canonicalTarget === 'inmueble.existe_hipoteca' && canonicalPath === 'gravamenes') return true
  if (missing === 'creditos[]' && canonicalPath.startsWith('creditos[')) return true
  if (/^creditos\[\d+\]\./.test(missing) && canonicalPath.startsWith('creditos[')) {
    const missNorm = missing.replace(/\.participantes\[\]$/, '.participantes')
    return canonicalPath === missNorm
  }
  return false
}

function normalizeValue(path: string, value: unknown): unknown {
  // Normalizacion estructural minima; la inferencia de negocio la decide GMI.
  if (path === 'creditos' && typeof value === 'boolean') {
    return value ? [{ institucion: null, participantes: [] }] : []
  }
  if (/^creditos\[\d+\]\.participantes$/.test(path)) {
    if (Array.isArray(value)) return value
    if (typeof value === 'string' && value.trim()) return [value.trim()]
  }
  if (path === 'gravamenes' && typeof value === 'string') {
    return value.trim() ? [value.trim()] : []
  }
  return value
}

function extractGeminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) {
    const text = parts
      .map((p: any) => String(p?.text || ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (text) return text
  }
  return ''
}

function normalizeExtractionCandidate(
  raw: unknown,
  targetPath: string
): {
  applies?: boolean
  path?: string
  value?: unknown
  reason?: string
} | null {
  const direct = extractionSchema.safeParse(raw)
  if (direct.success) {
    return {
      applies: direct.data.applies,
      path: direct.data.path || targetPath,
      value: direct.data.value,
      reason: direct.data.reason,
    }
  }

  const obj = isRecord(raw) ? raw : null
  if (!obj) return null

  const fromUpdate =
    isRecord(obj.update) ? obj.update :
    (Array.isArray(obj.proposed_updates) && obj.proposed_updates.length > 0 && isRecord(obj.proposed_updates[0]))
      ? (obj.proposed_updates[0] as Record<string, unknown>)
      : null

  if (fromUpdate) {
    return {
      applies: obj.applies === false ? false : true,
      path: String(fromUpdate.path || targetPath),
      value: (fromUpdate as any).value,
      reason: String((fromUpdate as any).reason || obj.reason || '').trim(),
    }
  }

  // Variantes comunes de Gemini: field/value o payload anidado por dominio.
  const field = String(obj.field || obj.path || '').trim()
  const value =
    obj.value !== undefined ? obj.value :
    (isRecord(obj.inmueble) && (obj.inmueble as any).folio_real !== undefined) ? (obj.inmueble as any).folio_real :
    (obj.folio_real !== undefined ? obj.folio_real : undefined)

  if (value === undefined) return null
  return {
    applies: obj.applies === false ? false : true,
    path: field || targetPath,
    value,
    reason: String(obj.reason || '').trim(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractCandidateFolioFromMessage(message: string, candidates: string[]): string | null {
  const normalizedCandidates = Array.isArray(candidates)
    ? candidates.map((c) => String(c || '').trim()).filter(Boolean)
    : []
  if (normalizedCandidates.length === 0) return null

  const compact = String(message || '')
  const found = compact.match(/\b\d{5,10}\b/g) || []
  for (const token of found) {
    if (normalizedCandidates.includes(token)) return token
  }
  return null
}

function inferHeuristicUpdates(args: {
  message: string
  requiredMissing: string[]
  collectedData: Record<string, unknown>
}): Array<Record<string, unknown>> {
  const message = String(args.message || '')
  const requiredMissing = Array.isArray(args.requiredMissing) ? args.requiredMissing : []
  if (!message.trim()) return []
  const opportunistic = isLikelyStructuredCaptureMessage(message)

  const shouldCapturePath = (path: string): boolean => {
    if (requiredMissing.some((missing) => matchesMissing(path, missing))) return true
    if (!opportunistic) return false
    return isAllowedPath(path)
  }

  const updates: Array<Record<string, unknown>> = []

  const paymentModeHint = inferShortPaymentModeHint(message)
  if (paymentModeHint === 'contado') {
    if (shouldCapturePath('creditos')) {
      updates.push({
        op: 'set',
        path: 'creditos',
        value: [],
        reason: 'Modo de pago contado capturado por respuesta corta',
      })
    }
    if (shouldCapturePath('actosNotariales.aperturaCreditoComprador')) {
      updates.push({
        op: 'set',
        path: 'actosNotariales.aperturaCreditoComprador',
        value: false,
        reason: 'Modo de pago contado capturado por respuesta corta',
      })
    }
  }
  if (paymentModeHint === 'credito') {
    if (shouldCapturePath('creditos')) {
      updates.push({
        op: 'set',
        path: 'creditos',
        value: [{ institucion: null, participantes: [] }],
        reason: 'Modo de pago con credito capturado por respuesta corta',
      })
    }
    if (shouldCapturePath('actosNotariales.aperturaCreditoComprador')) {
      updates.push({
        op: 'set',
        path: 'actosNotariales.aperturaCreditoComprador',
        value: true,
        reason: 'Modo de pago con credito capturado por respuesta corta',
      })
    }
  }

  const typeHint = inferShortPersonTypeHint(message)
  if (typeHint) {
    if (shouldCapturePath('vendedores[0].tipo_persona')) {
      updates.push({
        op: 'set',
        path: 'vendedores[0].tipo_persona',
        value: typeHint,
        reason: 'Tipo de vendedor capturado por respuesta corta',
      })
    }
    if (shouldCapturePath('compradores[0].tipo_persona')) {
      updates.push({
        op: 'set',
        path: 'compradores[0].tipo_persona',
        value: typeHint,
        reason: 'Tipo de comprador capturado por respuesta corta',
      })
    }
  }

  if (shouldCapturePath('inmueble.folio_real')) {
    const folioCandidates = Array.isArray((args.collectedData as any)?.folios?.candidates)
      ? ((args.collectedData as any).folios.candidates as any[])
          .map((c: any) => String(c?.folio || '').trim())
          .filter(Boolean)
      : []
    const value = extractFolioFromMessage(message, folioCandidates)
    if (value) {
      updates.push({
        op: 'set',
        path: 'inmueble.folio_real',
        value,
        reason: 'Folio real detectado en mensaje de captura multiple',
      })
    }
  }

  if (shouldCapturePath('inmueble.partidas')) {
    const partidas = extractPartidasFromMessage(message)
    if (partidas.length > 0) {
      updates.push({
        op: 'set',
        path: 'inmueble.partidas',
        value: partidas,
        reason: 'Partidas detectadas en mensaje de captura multiple',
      })
    }
  }

  if (shouldCapturePath('inmueble.direccion')) {
    const direccionLine = extractLabeledValue(message, ['conj. habitacional', 'conj habitacional', 'direccion'])
    if (direccionLine) {
      updates.push({
        op: 'set',
        path: 'inmueble.direccion.calle',
        value: direccionLine,
        reason: 'Direccion detectada en mensaje de captura multiple',
      })
    }
  }

  if (
    shouldCapturePath('compradores[0].persona_fisica.nombre') ||
    shouldCapturePath('compradores[0].tipo_persona') ||
    shouldCapturePath('compradores[0].persona_fisica.conyuge.nombre') ||
    shouldCapturePath('compradores[0].persona_fisica.estado_civil')
  ) {
    const buyerReference = resolveBuyerReferenceFromContext(message, args.collectedData)
    if (buyerReference) {
      if (shouldCapturePath('compradores[0].tipo_persona')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].tipo_persona',
          value: 'persona_fisica',
          reason: 'Tipo de comprador inferido por referencia contextual',
        })
      }
      if (shouldCapturePath('compradores[0].persona_fisica.nombre')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].persona_fisica.nombre',
          value: buyerReference.buyerName,
          reason: 'Comprador inferido por referencia contextual en mensaje',
        })
      }
      if (buyerReference.spouseName && shouldCapturePath('compradores[0].persona_fisica.conyuge.nombre')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].persona_fisica.conyuge.nombre',
          value: buyerReference.spouseName,
          reason: 'Conyuge inferido por referencia contextual en mensaje',
        })
      }
      if (buyerReference.estadoCivil && shouldCapturePath('compradores[0].persona_fisica.estado_civil')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].persona_fisica.estado_civil',
          value: buyerReference.estadoCivil,
          reason: 'Estado civil inferido por referencia contextual en mensaje',
        })
      }
    }

    const compradorLine = extractLabeledValue(message, ['comprador'])
    if (compradorLine) {
      const parsed = parsePersonAndOptionalSpouse(compradorLine)
      if (parsed.personName) {
        if (shouldCapturePath('compradores[0].tipo_persona')) {
          updates.push({
            op: 'set',
            path: 'compradores[0].tipo_persona',
            value: 'persona_fisica',
            reason: 'Tipo de comprador inferido en captura multiple',
          })
        }
        if (shouldCapturePath('compradores[0].persona_fisica.nombre')) {
          updates.push({
            op: 'set',
            path: 'compradores[0].persona_fisica.nombre',
            value: parsed.personName,
            reason: 'Comprador detectado en mensaje de captura multiple',
          })
        }
        if (parsed.spouseName && shouldCapturePath('compradores[0].persona_fisica.conyuge.nombre')) {
          updates.push({
            op: 'set',
            path: 'compradores[0].persona_fisica.conyuge.nombre',
            value: parsed.spouseName,
            reason: 'Conyuge del comprador detectado en mensaje de captura multiple',
          })
        }
        if (
          shouldCapturePath('compradores[0].persona_fisica.estado_civil') &&
          (parsed.estadoCivil === 'casado' || parsed.estadoCivil === 'soltero')
        ) {
          updates.push({
            op: 'set',
            path: 'compradores[0].persona_fisica.estado_civil',
            value: parsed.estadoCivil,
            reason: 'Estado civil detectado en mensaje de captura multiple',
          })
        }
      }
    }
  }

  if (
    shouldCapturePath('vendedores[0].tipo_persona') ||
    shouldCapturePath('vendedores[0].persona_fisica.nombre') ||
    shouldCapturePath('vendedores[0].persona_moral.denominacion_social')
  ) {
    const vendedorLine = extractLabeledValue(message, ['vendedor'])
    if (vendedorLine) {
      const sellerType = inferPartyType(vendedorLine)
      if (shouldCapturePath('vendedores[0].tipo_persona')) {
        updates.push({
          op: 'set',
          path: 'vendedores[0].tipo_persona',
          value: sellerType,
          reason: 'Tipo de vendedor inferido en captura multiple',
        })
      }
      if (sellerType === 'persona_moral' && shouldCapturePath('vendedores[0].persona_moral.denominacion_social')) {
        updates.push({
          op: 'set',
          path: 'vendedores[0].persona_moral.denominacion_social',
          value: cleanName(vendedorLine),
          reason: 'Vendedor persona moral detectado en mensaje de captura multiple',
        })
      }
      if (sellerType === 'persona_fisica' && shouldCapturePath('vendedores[0].persona_fisica.nombre')) {
        updates.push({
          op: 'set',
          path: 'vendedores[0].persona_fisica.nombre',
          value: cleanName(vendedorLine),
          reason: 'Vendedor persona fisica detectado en mensaje de captura multiple',
        })
      }
    }
  }

  const gravamen = inferGravamenAndCreditSemantics(message)
  if (gravamen.hasSignal) {
    if (shouldCapturePath('inmueble.existe_hipoteca') && gravamen.existeHipoteca !== null) {
      updates.push({
        op: 'set',
        path: 'inmueble.existe_hipoteca',
        value: gravamen.existeHipoteca,
        reason: 'Semantica de gravamen detectada en mensaje de captura multiple',
      })
    }
    if (shouldCapturePath('gravamenes') && Array.isArray(gravamen.gravamenes)) {
      updates.push({
        op: 'set',
        path: 'gravamenes',
        value: gravamen.gravamenes,
        reason: 'Detalle de gravamen detectado en mensaje de captura multiple',
      })
    }
    if (shouldCapturePath('actosNotariales.cancelacionCreditoVendedor') && gravamen.cancelacionCreditoVendedor !== null) {
      updates.push({
        op: 'set',
        path: 'actosNotariales.cancelacionCreditoVendedor',
        value: gravamen.cancelacionCreditoVendedor,
        reason: 'Estado de cancelacion de gravamen detectado en mensaje de captura multiple',
      })
    }
    if (shouldCapturePath('actosNotariales.aperturaCreditoComprador') && gravamen.aperturaCreditoComprador !== null) {
      updates.push({
        op: 'set',
        path: 'actosNotariales.aperturaCreditoComprador',
        value: gravamen.aperturaCreditoComprador,
        reason: 'Semantica de forma de pago detectada en mensaje de captura multiple',
      })
    }
    if (shouldCapturePath('creditos') && gravamen.aperturaCreditoComprador === true) {
      updates.push({
        op: 'set',
        path: 'creditos',
        value: [{ institucion: null, participantes: [] }],
        reason: 'Se detecto financiamiento/credito en el mensaje',
      })
    }
    if (shouldCapturePath('creditos') && gravamen.aperturaCreditoComprador === false && gravamen.hasContadoSignal) {
      updates.push({
        op: 'set',
        path: 'creditos',
        value: [],
        reason: 'Se detecto operacion de contado en el mensaje',
      })
    }
  }

  const canonical = updates
    .map((u) => {
      const path = canonicalizePath(String((u as any).path || ''))
      const value = normalizeValue(path, (u as any).value)
      if (!path || !isAllowedPath(path)) return null
      if (value === null || value === undefined) return null
      if (typeof value === 'string' && !value.trim()) return null
      return {
        ...u,
        op: 'set',
        path,
        value,
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>

  const dedup = new Map<string, Record<string, unknown>>()
  for (const u of canonical) {
    dedup.set(String((u as any).path || ''), u)
  }
  return Array.from(dedup.values())
}

function isLikelyStructuredCaptureMessage(message: string): boolean {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  const strongSignals = [
    /\bfolio real\b/,
    /\bpartida\b/,
    /\bvendedor\s*[:#-]/,
    /\bcomprador\s*[:#-]/,
    /\bconj\.?\s*habitacional\b/,
    /\b(inmueble|gravamen|hipoteca|credito|financiamiento)\b/,
  ]
  const hits = strongSignals.reduce((acc, pattern) => acc + (pattern.test(normalized) ? 1 : 0), 0)
  return hits >= 2 || normalized.length > 220
}

function extractFolioFromMessage(message: string, candidates: string[]): string | null {
  const byCandidates = extractCandidateFolioFromMessage(message, candidates)
  if (byCandidates) return byCandidates
  const labeled = String(message || '').match(/\bfolio\s*real\b[\s:#-]*([0-9]{5,10})\b/i)
  if (labeled?.[1]) return String(labeled[1]).trim()
  const fallback = String(message || '').match(/\b([0-9]{5,10})\b/)
  if (fallback?.[1]) return String(fallback[1]).trim()
  return null
}

function extractPartidasFromMessage(message: string): string[] {
  const out: string[] = []
  const labeled = String(message || '').match(/\bpartida(?:s)?(?:\s*no\.?)?\b[\s:#-]*([0-9,\s-]{4,})/i)
  if (labeled?.[1]) {
    const tokens = labeled[1].match(/\d{4,10}/g) || []
    for (const t of tokens) out.push(String(t))
  }
  return Array.from(new Set(out))
}

function extractLabeledValue(message: string, labels: string[]): string | null {
  const source = String(message || '')
  for (const rawLabel of labels) {
    const label = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`${label}\\s*[:#-]\\s*([\\s\\S]{1,500})`, 'i')
    const match = source.match(regex)
    if (!match?.[1]) continue
    const value = String(match[1])
      .split(/\b(vendedor|comprador)\s*[:#-]/i)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.;,:]+$/, '')
    if (value) return value
  }
  return null
}

function parsePersonAndOptionalSpouse(raw: string): {
  personName: string | null
  spouseName: string | null
  estadoCivil: 'casado' | 'soltero' | null
} {
  const text = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!text) return { personName: null, spouseName: null, estadoCivil: null }

  const married = text.match(/^(.*?)\s+y\s+su\s+espos[ao]\s+(.+)$/i)
  if (married) {
    const personName = cleanName(married[1])
    const spouseName = cleanName(married[2])
    return {
      personName: personName || null,
      spouseName: spouseName || null,
      estadoCivil: 'casado',
    }
  }

  const marriedWith = text.match(/^(.*?)[,.\s]+casad[oa]\s+con\s+(.+)$/i)
  if (marriedWith) {
    return {
      personName: cleanName(marriedWith[1]) || null,
      spouseName: cleanName(marriedWith[2]) || null,
      estadoCivil: 'casado',
    }
  }

  const single = text.match(/^(.*?)[,.\s]+solter[oa]\b/i)
  if (single) {
    return {
      personName: cleanName(single[1]) || null,
      spouseName: null,
      estadoCivil: 'soltero',
    }
  }

  return {
    personName: cleanName(text) || null,
    spouseName: null,
    estadoCivil: null,
  }
}

function cleanName(value: string): string {
  return String(value || '')
    .split(/[.;]\s*(?=el inmueble|inmueble|presenta|cuenta con|se transmite|mismo que|el cual|mediante)/i)[0]
    .replace(/^(el|la)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,:]+$/, '')
}

function inferPartyType(value: string): 'persona_fisica' | 'persona_moral' {
  const upper = String(value || '').toUpperCase()
  if (
    /\b(SA|S\.A\.|SAPI|SOCIEDAD|CV|C\.V\.|S DE RL|S\. DE R\.L\.|INMOBILIARIA|CONSTRUCTORA)\b/.test(upper)
  ) {
    return 'persona_moral'
  }
  return 'persona_fisica'
}

function inferShortPersonTypeHint(message: string): 'persona_fisica' | 'persona_moral' | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null
  if (/^(fisica|persona fisica|es fisica|si, fisica|si fisica)$/.test(normalized)) return 'persona_fisica'
  if (/^(moral|persona moral|es moral|si, moral|si moral)$/.test(normalized)) return 'persona_moral'
  return null
}

function inferShortPaymentModeHint(message: string): 'contado' | 'credito' | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  if (/^(compra )?de contado$/.test(normalized)) return 'contado'
  if (/^(contado|es contado|sera contado|sera de contado|si, contado)$/.test(normalized)) return 'contado'

  if (/^(con credito|credito|sera con credito|si, con credito|si credito)$/.test(normalized)) return 'credito'
  return null
}

function resolveBuyerReferenceFromContext(
  message: string,
  collectedData: Record<string, unknown>
): { buyerName: string; spouseName: string | null; estadoCivil: 'casado' | 'soltero' | null } | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || !/\bcomprador\b/.test(normalized)) return null

  const spouses = extractCouplePeople(collectedData)
  if (/\b(esposo|hombre)\b/.test(normalized) && spouses.length > 0) {
    const male = spouses.find((p) => p.sexo === 'hombre') || spouses[0]
    const spouse = spouses.find((p) => p.nombre !== male.nombre) || null
    return {
      buyerName: male.nombre,
      spouseName: spouse?.nombre || null,
      estadoCivil: spouse ? 'casado' : null,
    }
  }
  if (/\b(esposa|mujer)\b/.test(normalized) && spouses.length > 0) {
    const female = spouses.find((p) => p.sexo === 'mujer') || spouses[0]
    const spouse = spouses.find((p) => p.nombre !== female.nombre) || null
    return {
      buyerName: female.nombre,
      spouseName: spouse?.nombre || null,
      estadoCivil: spouse ? 'casado' : null,
    }
  }

  const docReference = /\b(ine|identidad|constancia|situacion fiscal|csf)\b/.test(normalized)
  if (docReference) {
    const detected = extractUnclassifiedPeople(collectedData)
    if (detected.length === 1) {
      return {
        buyerName: detected[0].nombre,
        spouseName: null,
        estadoCivil: null,
      }
    }
  }

  return null
}

function extractCouplePeople(collectedData: Record<string, unknown>): Array<{ nombre: string; sexo: 'hombre' | 'mujer' | null }> {
  const raw = Array.isArray((collectedData as any)?.conyuges_detectados)
    ? ((collectedData as any).conyuges_detectados as any[])
    : []
  return raw
    .map((item) => {
      const nombre = cleanName(String(item?.nombre || item?.name || ''))
      if (!nombre) return null
      const sexoRaw = String(item?.sexo || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
      const sexo =
        sexoRaw === 'hombre' || sexoRaw === 'masculino'
          ? 'hombre'
          : sexoRaw === 'mujer' || sexoRaw === 'femenino'
            ? 'mujer'
            : null
      return { nombre, sexo }
    })
    .filter(Boolean) as Array<{ nombre: string; sexo: 'hombre' | 'mujer' | null }>
}

function extractUnclassifiedPeople(collectedData: Record<string, unknown>): Array<{ nombre: string }> {
  const raw = Array.isArray((collectedData as any)?.personas_detectadas_no_clasificadas)
    ? ((collectedData as any).personas_detectadas_no_clasificadas as any[])
    : []
  return raw
    .map((item) => {
      const nombre = cleanName(String(item?.nombre || item?.name || ''))
      return nombre ? { nombre } : null
    })
    .filter(Boolean) as Array<{ nombre: string }>
}

function inferGravamenAndCreditSemantics(message: string): {
  hasSignal: boolean
  existeHipoteca: boolean | null
  gravamenes: string[] | null
  cancelacionCreditoVendedor: boolean | null
  aperturaCreditoComprador: boolean | null
  hasContadoSignal: boolean
} {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) {
    return {
      hasSignal: false,
      existeHipoteca: null,
      gravamenes: null,
      cancelacionCreditoVendedor: null,
      aperturaCreditoComprador: null,
      hasContadoSignal: false,
    }
  }

  const libre = /\blibre de gravamen\b/.test(normalized)
  const hasHipoteca = /\b(gravamen|hipoteca|hipotecario)\b/.test(normalized)
  const liquidado = /\b(liquidado|liquidara|liquidara|cancelado|se cancela|durante la operacion|en la misma operacion)\b/.test(
    normalized
  )
  const vigente = /\b(permanecera vigente|permanece vigente|no se liquida|subsiste|vigente posterior)\b/.test(normalized)
  const bancario = /\b(credito|financiamiento|institucion bancaria|banco)\b/.test(normalized)
  const contado = /\b(contado|recursos propios|sin credito)\b/.test(normalized)

  let existeHipoteca: boolean | null = null
  if (libre) existeHipoteca = false
  else if (hasHipoteca) existeHipoteca = true

  let cancelacion: boolean | null = null
  if (existeHipoteca === true) {
    if (liquidado) cancelacion = true
    else if (vigente) cancelacion = false
  }

  let apertura: boolean | null = null
  if (bancario) apertura = true
  else if (contado) apertura = false

  const gravamenes =
    existeHipoteca === false
      ? []
      : existeHipoteca === true
        ? ['hipoteca']
        : null

  return {
    hasSignal: libre || hasHipoteca || liquidado || vigente || bancario || contado,
    existeHipoteca,
    gravamenes,
    cancelacionCreditoVendedor: cancelacion,
    aperturaCreditoComprador: apertura,
    hasContadoSignal: contado,
  }
}
