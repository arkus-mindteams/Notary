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

export interface GMICandidateSlot {
  slot_id: string
  path: string
  question_text: string
  allowed_values?: string[]
  asked_at?: string | null
  source: 'open_question' | 'required_missing' | 'global'
}

export interface GMIShortAnswerRouteResult {
  outcome: 'applied' | 'clarify' | 'fallback'
  selected_slot_id?: string | null
  confidence?: number
  normalized_value?: unknown
  update?: Record<string, unknown> | null
  clarify_message?: string | null
  top_alternatives?: Array<{ slot_id: string; question_text: string }> | null
  reason?: string
}

export type GMIAnswerEventType =
  | 'ANSWER_BUYER_TEXT'
  | 'ANSWER_BUYER_TYPE'
  | 'ANSWER_SELLER_TEXT'
  | 'ANSWER_SELLER_TYPE'
  | 'ANSWER_SPOUSE_TEXT'
  | 'ANSWER_FOLIO_REAL'
  | 'ANSWER_PARTIDA'
  | 'ANSWER_ADDRESS_TEXT'
  | 'ANSWER_PAYMENT_MODE'
  | 'ANSWER_BUYER_MARITAL_STATUS'
  | 'ANSWER_CREDIT_INSTITUTION_TEXT'
  | 'ANSWER_GRAVAMEN_EXISTS'
  | 'ANSWER_GRAVAMEN_INSTITUTION_TEXT'
  | 'ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA'

export interface GMIAnswerEvent {
  type: GMIAnswerEventType
  payload: Record<string, unknown>
}

export type GMISectionType = 'buyer' | 'seller' | 'credito' | 'gravamen' | 'inmueble' | 'unknown'

export interface GMIMessageSection {
  type: GMISectionType
  start: number
  end: number
  raw: string
  norm: string
}

export interface GMISectionDiagnostic {
  type: GMISectionType
  start: number
  end: number
  length: number
}

export interface GMIAnswerRouterResult {
  events: GMIAnswerEvent[]
  updates: Array<Record<string, unknown>>
  blocked_calle_reason: string | null
  sections_detected: GMISectionDiagnostic[]
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

type GeminiResponseSchema = Record<string, unknown>

const selectionResponseSchema: GeminiResponseSchema = {
  type: 'OBJECT',
  additionalProperties: false,
  properties: {
    matched_required_missing: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
    reason: { type: 'STRING' },
  },
  required: ['matched_required_missing'],
}

const extractionValueSchema: GeminiResponseSchema = {
  anyOf: [
    { type: 'STRING' },
    { type: 'NUMBER' },
    { type: 'BOOLEAN' },
    { type: 'NULL' },
    {
      type: 'ARRAY',
      items: {
        anyOf: [{ type: 'STRING' }, { type: 'NUMBER' }, { type: 'BOOLEAN' }, { type: 'NULL' }],
      },
    },
    {
      type: 'OBJECT',
      additionalProperties: true,
    },
  ],
}

const extractionResponseSchema: GeminiResponseSchema = {
  type: 'OBJECT',
  additionalProperties: false,
  properties: {
    applies: { type: 'BOOLEAN' },
    op: { type: 'STRING', enum: ['set'] },
    path: { type: 'STRING' },
    value: extractionValueSchema,
    confidence: { type: 'NUMBER' },
    reason: { type: 'STRING' },
  },
  required: ['applies', 'op', 'path', 'value'],
}

const shortAnswerRouteSchema = z.object({
  chosen_slot_id: z.string().trim().nullable(),
  normalized_value: z.unknown().optional(),
  confidence: z.number().min(0).max(1).optional(),
  needs_clarification: z.boolean().optional(),
  top_alternatives: z.array(z.string().trim().min(1)).max(2).optional(),
})

const creditInstitutionValidationSchema = z.object({
  is_financial_institution: z.boolean(),
  canonical_name: z.string().trim().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().trim().optional(),
})

const shortAnswerRouteResponseSchema: GeminiResponseSchema = {
  type: 'OBJECT',
  additionalProperties: false,
  properties: {
    chosen_slot_id: { type: 'STRING', nullable: true },
    normalized_value: extractionValueSchema,
    confidence: { type: 'NUMBER' },
    needs_clarification: { type: 'BOOLEAN' },
    top_alternatives: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      maxItems: 2,
    },
  },
  required: ['chosen_slot_id'],
}

const creditInstitutionValidationResponseSchema: GeminiResponseSchema = {
  type: 'OBJECT',
  additionalProperties: false,
  properties: {
    is_financial_institution: { type: 'BOOLEAN' },
    canonical_name: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
    reason: { type: 'STRING' },
  },
  required: ['is_financial_institution'],
}

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
  /^gravamenes\[\d+\]\.institucion$/,
  /^gravamenes\[\d+\]\.cancelacion_confirmada$/,
  /^actosNotariales\.aperturaCreditoComprador$/,
  /^actosNotariales\.cancelacionCreditoVendedor$/,
  /^existencia_credito$/,
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

  async json(
    systemPrompt: string,
    payload: Record<string, unknown>,
    maxOutputTokens = 320,
    responseSchema?: GeminiResponseSchema
  ): Promise<unknown | null> {
    if (!this.apiKey) return null

    const generationConfig: Record<string, unknown> = {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens,
    }
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema
    }

    const body = {
      generationConfig,
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
  private readonly shortRouteThreshold = Number(process.env.GMI_SHORT_ROUTE_CONFIDENCE || 0.62)
  private readonly institutionValidationThreshold = Number(process.env.GMI_INSTITUTION_CONFIDENCE || 0.6)

  static canonicalizePath(path: string): string {
    return canonicalizePath(path)
  }

  static targetPathFromMissing(missing: string): string | null {
    return targetPathFromMissing(missing)
  }

  static isAllowedPath(path: string): boolean {
    return isAllowedPath(path)
  }

  static routeAnswerEvents(args: {
    message: string
    requiredMissing?: string[]
    collectedData?: Record<string, unknown>
  }): GMIAnswerRouterResult {
    const sections = sectionizeMessage(stripCollectionHints(String(args.message || '')))
    const events = detectDeterministicAnswerEvents({
      message: stripCollectionHints(String(args.message || '')),
      requiredMissing: normalizeRequiredMissing(args.requiredMissing),
      sections,
    })
    const updates = compileDeterministicAnswerEvents(events, args.collectedData)
    const blockedCalleReason = detectBlockedCalleReason(String(args.message || ''))
    return {
      events,
      updates,
      blocked_calle_reason: blockedCalleReason,
      sections_detected: sections.map((s) => ({
        type: s.type,
        start: s.start,
        end: s.end,
        length: Math.max(0, s.end - s.start),
      })),
    }
  }

  static normalizeForDetection(raw: string): string {
    return normalizeForDetection(raw)
  }

  static sectionizeMessage(raw: string): GMIMessageSection[] {
    return sectionizeMessage(raw)
  }

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

    const heuristicResult = inferHeuristicUpdates({
      message,
      requiredMissing,
      collectedData: input.collectedData || {},
      lastQuestionIntent: input.lastQuestionIntent || null,
      pendingQuestions: Array.isArray(input.pendingQuestions) ? input.pendingQuestions : [],
    })
    const heuristicUpdates = heuristicResult.updates
    if (heuristicUpdates.length > 0) {
      const validatedHeuristicUpdates = await this.validateCreditInstitutionUpdates(heuristicUpdates)
      if (validatedHeuristicUpdates.length === 0) {
        return this.emptyResult(traceId, 'No pude validar una institucion financiera confiable con la informacion proporcionada.')
      }
      return {
        intent: 'UPDATE_STATE',
        agent_used: 'GMIIndependentCaptureFlow',
        answer: 'Detecte multiples datos del mensaje y genere propuestas de actualizacion para los campos faltantes.',
        proposed_updates: validatedHeuristicUpdates,
        actions: [
          {
            type: 'review_proposed_updates',
            requires_domain_commit: true,
            source: 'gmi_independent_capture',
            mode: 'multi_field_fallback',
            events_detected: heuristicResult.meta.events_detected,
            blocked_calle_reason: heuristicResult.meta.blocked_calle_reason,
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
      const selectedLabel = describeMissingField(selected)
      return this.emptyResult(
        traceId,
        `No pude extraer un valor confiable para ${selectedLabel}.`
      )
    }
    const validatedExtracted = await this.validateCreditInstitutionUpdate(extracted)
    if (!validatedExtracted) {
      return this.emptyResult(traceId, 'No pude validar una institucion financiera confiable con la informacion proporcionada.')
    }

    return {
      intent: 'UPDATE_STATE',
      agent_used: 'GMIIndependentCaptureFlow',
      answer: 'Genere una propuesta de actualizacion alineada a los campos faltantes. Revisa y confirma para aplicar.',
      proposed_updates: [validatedExtracted],
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
      220,
      selectionResponseSchema
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

  async routeShortAnswer(args: {
    message: string
    candidateSlots: GMICandidateSlot[]
    systemInstructions?: string
  }): Promise<GMIShortAnswerRouteResult> {
    const message = stripCollectionHints(String(args.message || ''))
    const candidateSlots = Array.isArray(args.candidateSlots)
      ? args.candidateSlots
          .map((slot) => ({
            ...slot,
            slot_id: String(slot?.slot_id || '').trim(),
            path: canonicalizePath(String(slot?.path || '').trim()),
            question_text: String(slot?.question_text || '').trim(),
            allowed_values: Array.isArray(slot?.allowed_values)
              ? slot.allowed_values.map((v) => String(v || '').trim()).filter(Boolean)
              : [],
          }))
          .filter((slot) => slot.slot_id && slot.path && isAllowedPath(slot.path))
      : []

    if (!this.gmi.isConfigured()) {
      return { outcome: 'fallback', reason: 'gmi_not_configured' }
    }
    if (!message || candidateSlots.length === 0) {
      return { outcome: 'fallback', reason: 'missing_message_or_slots' }
    }

    // Camino determinista: cuando exactamente un slot abierto es compatible
    // con el mensaje corto, aplicarlo sin depender del router LLM.
    const deterministicMatches = candidateSlots
      .map((slot) => ({
        slot,
        normalized: normalizeShortAnswerValue(slot, message),
      }))
      .filter(
        (item) =>
          item.normalized !== null &&
          item.normalized !== undefined &&
          !(typeof item.normalized === 'string' && !item.normalized.trim())
      )

    if (deterministicMatches.length === 1) {
      const match = deterministicMatches[0]
      return {
        outcome: 'applied',
        selected_slot_id: match.slot.slot_id,
        confidence: 0.99,
        normalized_value: match.normalized,
        update: {
          op: 'set',
          path: match.slot.path,
          value: match.normalized,
          reason: `Short-answer deterministico aplicado al slot compatible ${match.slot.slot_id}`,
        },
        reason: 'single_compatible_slot_deterministic',
      }
    }

    // Camino determinista: si solo hay un slot abierto y el valor se normaliza
    // correctamente, aplicar sin depender del router LLM.
    if (candidateSlots.length === 1) {
      const only = candidateSlots[0]
      const normalizedSingle = normalizeShortAnswerValue(only, message)
      if (
        normalizedSingle !== null &&
        normalizedSingle !== undefined &&
        !(typeof normalizedSingle === 'string' && !normalizedSingle.trim())
      ) {
        return {
          outcome: 'applied',
          selected_slot_id: only.slot_id,
          confidence: 0.99,
          normalized_value: normalizedSingle,
          update: {
            op: 'set',
            path: only.path,
            value: normalizedSingle,
            reason: `Short-answer deterministico aplicado al slot unico ${only.slot_id}`,
          },
          reason: 'single_open_slot_deterministic',
        }
      }
    }

    const payload = {
      user_message: message,
      candidate_slots: candidateSlots.map((slot) => ({
        slot_id: slot.slot_id,
        path: slot.path,
        question_text: slot.question_text,
        allowed_values: slot.allowed_values || [],
        asked_at: slot.asked_at || null,
        source: slot.source,
      })),
      rules: [
        'Selecciona SOLO un slot_id de candidate_slots o null.',
        'No inventes slot_id ni paths.',
        'Si hay ambiguedad entre slots, needs_clarification=true.',
      ],
    }

    const parsed = await this.gmi.json(
      [
        'Eres un router semantico para respuestas cortas en flujo notarial.',
        'Debes mapear el mensaje a un slot abierto o pedir aclaracion.',
        'Responde SOLO JSON.',
        args.systemInstructions ? `INSTRUCCIONES_ADICIONALES: ${args.systemInstructions}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      payload,
      220,
      shortAnswerRouteResponseSchema
    )
    const safe = shortAnswerRouteSchema.safeParse(parsed)
    if (!safe.success) return { outcome: 'fallback', reason: 'invalid_router_output' }

    const chosenSlotId = String(safe.data.chosen_slot_id || '').trim()
    const confidence = Number(safe.data.confidence ?? 0)
    const needsClarification = safe.data.needs_clarification === true
    const slot = candidateSlots.find((item) => item.slot_id === chosenSlotId) || null
    if (!slot) {
      return { outcome: 'fallback', reason: 'no_slot_selected' }
    }
    if (!isAllowedPath(slot.path)) {
      return { outcome: 'fallback', reason: 'selected_slot_path_not_allowed' }
    }

    const normalized = normalizeShortAnswerValue(slot, safe.data.normalized_value)
    const alternatives = (safe.data.top_alternatives || [])
      .map((id) => candidateSlots.find((slotItem) => slotItem.slot_id === id))
      .filter(Boolean)
      .slice(0, 2)
      .map((slotItem) => ({
        slot_id: String(slotItem!.slot_id),
        question_text: String(slotItem!.question_text || slotItem!.path),
      }))

    if (needsClarification || confidence < this.shortRouteThreshold || normalized === null || normalized === undefined) {
      return {
        outcome: 'clarify',
        selected_slot_id: slot.slot_id,
        confidence,
        top_alternatives: alternatives,
        clarify_message: buildClarifyMessage(slot, alternatives),
        reason: normalized === null || normalized === undefined ? 'normalized_value_empty' : 'low_confidence_or_ambiguous',
      }
    }

    return {
      outcome: 'applied',
      selected_slot_id: slot.slot_id,
      confidence,
      normalized_value: normalized,
      update: {
        op: 'set',
        path: slot.path,
        value: normalized,
        reason: `Short-answer router aplicado al slot ${slot.slot_id}`,
      },
    }
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
      280,
      extractionResponseSchema
    )
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

  private async validateCreditInstitutionUpdates(
    updates: Array<Record<string, unknown>>
  ): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = []
    for (const update of updates) {
      const next = await this.validateCreditInstitutionUpdate(update)
      if (next) out.push(next)
    }
    return out
  }

  private async validateCreditInstitutionUpdate(
    update: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const path = canonicalizePath(String(update?.path || ''))
    if (!/^creditos\[\d+\]\.institucion$/.test(path)) return update
    const rawValue = String(update?.value || '').trim()
    if (!rawValue) return null

    const verdict = await this.classifyCreditInstitution(rawValue)
    if (!verdict.valid) return null

    return {
      ...update,
      path,
      value: verdict.canonicalName || rawValue,
    }
  }

  private async classifyCreditInstitution(input: string): Promise<{
    valid: boolean
    canonicalName: string | null
    confidence: number
  }> {
    const fallback = basicCreditInstitutionHeuristic(input)
    const payload = {
      candidate_text: input,
      locale: 'mx',
      domain: 'preaviso_notarial_credito',
      rules: [
        'Valida si el texto representa una institucion financiera real.',
        'Rechaza frases legales/genericas y texto narrativo.',
        'Si es valida, regresa canonical_name limpio.',
      ],
    }

    let parsed: unknown = null
    try {
      parsed = await this.gmi.json(
        'Eres un clasificador de instituciones financieras para tramites notariales en Mexico. Responde SOLO JSON.',
        payload,
        140,
        creditInstitutionValidationResponseSchema
      )
    } catch {
      parsed = null
    }

    const safe = creditInstitutionValidationSchema.safeParse(parsed)
    if (!safe.success) {
      return {
        valid: fallback,
        canonicalName: fallback ? input.trim() : null,
        confidence: fallback ? 0.55 : 0,
      }
    }

    const valid = safe.data.is_financial_institution === true
    const confidence = Number(safe.data.confidence ?? 0)
    if (!valid || confidence < this.institutionValidationThreshold) {
      return { valid: false, canonicalName: null, confidence }
    }

    const canonicalName = String(safe.data.canonical_name || '').trim()
    return {
      valid: true,
      canonicalName: canonicalName || input.trim(),
      confidence,
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

function basicCreditInstitutionHeuristic(value: string): boolean {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || normalized.length < 3) return false
  if (/(?:inciso|articulo|noveno|terminos del|el cual se otorga|de la presente)/.test(normalized)) return false
  if (/^(institucion|institucion financiera|entidad|banco|credito|financiamiento)$/.test(normalized)) return false
  if (/^(por confirmar|desconocido|pendiente|n\/a|na|null)$/.test(normalized)) return false
  return true
}

function describeMissingField(field: string): string {
  const normalized = String(field || '').trim()
  if (!normalized) return 'ese campo'
  if (normalized === 'inmueble.folio_real') return 'el folio real del inmueble'
  if (normalized === 'existencia_credito') return 'si la compra sera con credito o de contado'
  if (normalized === 'vendedores[]') return 'quien es el vendedor'
  if (normalized === 'compradores[]') return 'quien es el comprador'
  if (normalized === 'vendedores[].tipo_persona') return 'si el vendedor es persona fisica o moral'
  if (normalized === 'vendedores[].nombre') return 'el nombre completo del vendedor'
  if (normalized === 'compradores[].nombre') return 'el nombre completo del comprador'
  if (normalized === 'compradores[].tipo_persona') return 'si el comprador es persona fisica o moral'
  if (normalized === 'compradores[].persona_fisica.conyuge.nombre') return 'el nombre completo del conyuge del comprador'
  if (/^compradores\[\d+\]\.persona_fisica\.conyuge\.nombre$/.test(normalized))
    return 'el nombre completo del conyuge del comprador'
  if (/^compradores\[\d+\]\.persona_fisica\.estado_civil$/.test(normalized))
    return 'el estado civil del comprador'
  if (/^compradores\[\d+\]\.persona_fisica\.nombre$/.test(normalized))
    return 'el nombre completo del comprador'
  if (/^vendedores\[\d+\]\.persona_fisica\.nombre$/.test(normalized))
    return 'el nombre completo del vendedor'
  if (/^compradores\[\d+\]\.tipo_persona$/.test(normalized))
    return 'si el comprador es persona fisica o moral'
  if (/^vendedores\[\d+\]\.tipo_persona$/.test(normalized))
    return 'si el vendedor es persona fisica o moral'
  if (normalized.startsWith('inmueble.')) return 'informacion del inmueble'
  if (normalized.startsWith('compradores')) return 'informacion del comprador'
  if (normalized.startsWith('vendedores')) return 'informacion del vendedor'
  if (normalized.startsWith('creditos') || normalized.startsWith('actosNotariales.') || normalized === 'existencia_credito') {
    return 'informacion del credito o forma de pago'
  }
  return 'ese dato obligatorio'
}

function canonicalizePath(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return raw
  let out = raw
    .replace(/^existencia_credito$/, 'actosNotariales.aperturaCreditoComprador')
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
  if (/^gravamenes\[\d+\]\./.test(raw)) return raw
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
  if (/^gravamenes\[\d+\]\./.test(missing) && canonicalPath.startsWith('gravamenes[')) return canonicalPath === missing
  if (canonicalTarget === 'inmueble.existe_hipoteca' && canonicalPath === 'gravamenes') return true
  if (missing === 'existencia_credito' && canonicalPath === 'actosNotariales.aperturaCreditoComprador') return true
  if (missing === 'existencia_credito' && (canonicalPath === 'creditos' || canonicalPath.startsWith('creditos['))) return true
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
  if (path === 'gravamenes') {
    if (typeof value === 'string') {
      return value.trim() ? [{ institucion: value.trim(), cancelacion_confirmada: null }] : []
    }
    if (Array.isArray(value)) {
      const normalizedItems = value
        .map((item) => {
          if (typeof item === 'string') {
            const institucion = item.trim()
            return institucion ? { institucion, cancelacion_confirmada: null } : null
          }
          if (item && typeof item === 'object') {
            const rec = item as Record<string, unknown>
            const institucion = String(rec.institucion ?? '').trim() || null
            const cancelacion =
              typeof rec.cancelacion_confirmada === 'boolean' ? rec.cancelacion_confirmada : null
            if (!institucion && cancelacion === null) return null
            return { institucion, cancelacion_confirmada: cancelacion }
          }
          return null
        })
        .filter(Boolean)
      return normalizedItems
    }
  }
  if (/^gravamenes\[\d+\]\.cancelacion_confirmada$/.test(path)) {
    if (typeof value === 'boolean') return value
    const normalized = normalizeForDetection(String(value || ''))
    if (isAffirmativeToken(normalized)) return true
    if (isNegativeToken(normalized)) return false
  }
  if (path === 'existencia_credito' || path === 'actosNotariales.aperturaCreditoComprador') {
    if (typeof value === 'boolean') return value
    const normalized = normalizeForDetection(String(value || ''))
    if (/(credito|cr[eé]dito|financiamiento)/.test(normalized)) return true
    if (/(contado|sin credito|sin cr[eé]dito|efectivo)/.test(normalized)) return false
  }
  return value
}

function normalizeShortAnswerValue(slot: GMICandidateSlot, value: unknown): unknown {
  const path = canonicalizePath(String(slot.path || ''))
  const allowed = Array.isArray(slot.allowed_values) ? slot.allowed_values : []

  const normalizeStringToken = (input: string): string =>
    String(input || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

  const resolveAllowed = (raw: unknown): string | null => {
    if (raw === null || raw === undefined) return null
    const rawNormalized = normalizeStringToken(String(raw))
    if (!rawNormalized) return null
    const exact = allowed.find((item) => normalizeStringToken(item) === rawNormalized)
    return exact || null
  }

  if (/\.tipo_persona$/.test(path)) {
    const candidate = resolveAllowed(value)
    if (candidate) return candidate
    return null
  }
  if (/\.estado_civil$/.test(path)) {
    const candidate = resolveAllowed(value)
    if (candidate) return candidate
    return null
  }
  if (path === 'inmueble.existe_hipoteca') {
    if (typeof value === 'boolean') return value
    const candidate = resolveAllowed(value)
    if (candidate === 'si') return true
    if (candidate === 'no') return false
    return null
  }
  if (path === 'actosNotariales.aperturaCreditoComprador') {
    if (typeof value === 'boolean') return value
    const candidate = resolveAllowed(value)
    if (candidate === 'credito') return true
    if (candidate === 'contado') return false
    return null
  }
  if (path === 'creditos') {
    if (Array.isArray(value)) return value
    const candidate = resolveAllowed(value)
    if (candidate === 'contado') return []
    if (candidate === 'credito') return [{ institucion: null, participantes: [] }]
    return null
  }
  if (path.startsWith('creditos[') && path.endsWith('.institucion')) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  if (path.startsWith('compradores[') && path.includes('.nombre')) {
    if (typeof value === 'string' && value.trim()) return inferShortNameCandidate(value)
  }
  if (path.startsWith('vendedores[') && path.includes('.nombre')) {
    if (typeof value === 'string' && value.trim()) return inferShortNameCandidate(value)
  }

  return normalizeValue(path, value)
}

function buildClarifyMessage(
  slot: GMICandidateSlot,
  alternatives: Array<{ slot_id: string; question_text: string }>
): string {
  const options = [slot, ...alternatives.map((x) => ({ slot_id: x.slot_id, question_text: x.question_text } as any))]
    .slice(0, 2)
    .map((item: any) => String(item?.question_text || '').trim())
    .filter(Boolean)
  if (options.length === 0) {
    return 'Para evitar errores, confirma a que dato corresponde tu respuesta.'
  }
  if (options.length === 1) {
    return `Para evitar errores, confirma: ${options[0]}`
  }
  return `Tu respuesta puede corresponder a dos campos. Confirma cual aplica: 1) ${options[0]} 2) ${options[1]}`
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

const CALLE_FOREIGN_MARKERS_REGEX = /\b(vendedor|comprador|conyug|esposa|credito|banco|gravamen|hipoteca)\b/i
const CALLE_FALLBACK_MAX_CHARS = 250
const CALLE_SEGMENT_MIN_CHARS = 30
const CALLE_SEGMENT_MAX_CHARS = 250

function inferHeuristicUpdates(args: {
  message: string
  requiredMissing: string[]
  collectedData: Record<string, unknown>
  lastQuestionIntent?: string | null
  pendingQuestions?: string[]
}): {
  updates: Array<Record<string, unknown>>
  meta: {
    events_detected: string[]
    blocked_calle_reason: string | null
  }
} {
  const message = String(args.message || '')
  const requiredMissing = Array.isArray(args.requiredMissing) ? args.requiredMissing : []
  if (!message.trim()) {
    return {
      updates: [],
      meta: {
        events_detected: [],
        blocked_calle_reason: null,
      },
    }
  }
  const opportunistic = isLikelyStructuredCaptureMessage(message)
  const peopleClassificationActive = hasPendingPeopleClassificationTask(requiredMissing, args.collectedData)

  const shouldCapturePath = (path: string): boolean => {
    if (requiredMissing.some((missing) => matchesMissing(path, missing))) return true
    if (peopleClassificationActive && isPeopleClassificationPath(path)) return true
    if (!opportunistic) return false
    return isAllowedPath(path)
  }

  const updates: Array<Record<string, unknown>> = []
  const compiledAnswerRoute = GMIIndependentCaptureFlow.routeAnswerEvents({
    message,
    requiredMissing,
    collectedData: args.collectedData,
  })
  for (const compiled of compiledAnswerRoute.updates) updates.push(compiled)
  const hasCompiledBuyerName = compiledAnswerRoute.events.some((event) => event.type === 'ANSWER_BUYER_TEXT')
  const hasCompiledSpouseName = compiledAnswerRoute.events.some((event) => event.type === 'ANSWER_SPOUSE_TEXT')
  const hasCompiledSellerName = compiledAnswerRoute.events.some((event) => event.type === 'ANSWER_SELLER_TEXT')
  const shortNameCandidate = inferShortNameCandidate(message)
  const nameIntentScope = detectNameIntentScope({
    requiredMissing,
    lastQuestionIntent: args.lastQuestionIntent || null,
    pendingQuestions: Array.isArray(args.pendingQuestions) ? args.pendingQuestions : [],
  })

  if (shortNameCandidate && nameIntentScope !== null) {
    if (
      (nameIntentScope === 'comprador' || nameIntentScope === 'any') &&
      shouldCapturePath('compradores[0].persona_fisica.nombre')
    ) {
      updates.push({
        op: 'set',
        path: 'compradores[0].persona_fisica.nombre',
        value: shortNameCandidate,
        reason: 'Nombre corto capturado segun la ultima pregunta activa del chat',
      })
    }
    if (
      (nameIntentScope === 'vendedor' || nameIntentScope === 'any') &&
      shouldCapturePath('vendedores[0].persona_fisica.nombre')
    ) {
      updates.push({
        op: 'set',
        path: 'vendedores[0].persona_fisica.nombre',
        value: shortNameCandidate,
        reason: 'Nombre corto capturado segun la ultima pregunta activa del chat',
      })
    }
  }

  const paymentModeHint = peopleClassificationActive ? null : inferShortPaymentModeHint(message)
  const institutionHint = peopleClassificationActive ? null : inferCreditInstitutionFromMessage(message)
  const estadoCivilHint = inferShortEstadoCivilHint(message)
  const roleAssignment = resolveDetectedPersonRoleAssignment({
    message,
    requiredMissing,
    lastQuestionIntent: args.lastQuestionIntent || null,
    pendingQuestions: Array.isArray(args.pendingQuestions) ? args.pendingQuestions : [],
    collectedData: args.collectedData,
  })

  if (roleAssignment) {
    if (roleAssignment.role === 'comprador') {
      if (shouldCapturePath('compradores[0].tipo_persona')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].tipo_persona',
          value: 'persona_fisica',
          reason: 'Persona detectada clasificada como comprador por referencia del usuario',
        })
      }
      if (shouldCapturePath('compradores[0].persona_fisica.nombre')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].persona_fisica.nombre',
          value: roleAssignment.personName,
          reason: 'Comprador asignado desde personas detectadas no clasificadas',
        })
      }
    }
    if (roleAssignment.role === 'vendedor') {
      if (shouldCapturePath('vendedores[0].tipo_persona')) {
        updates.push({
          op: 'set',
          path: 'vendedores[0].tipo_persona',
          value: 'persona_fisica',
          reason: 'Persona detectada clasificada como vendedor por referencia del usuario',
        })
      }
      if (shouldCapturePath('vendedores[0].persona_fisica.nombre')) {
        updates.push({
          op: 'set',
          path: 'vendedores[0].persona_fisica.nombre',
          value: roleAssignment.personName,
          reason: 'Vendedor asignado desde personas detectadas no clasificadas',
        })
      }
    }
    if (roleAssignment.role === 'conyuge') {
      if (shouldCapturePath('compradores[0].persona_fisica.conyuge.nombre')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].persona_fisica.conyuge.nombre',
          value: roleAssignment.personName,
          reason: 'Conyuge asignado desde personas detectadas no clasificadas',
        })
      }
      if (shouldCapturePath('compradores[0].persona_fisica.estado_civil')) {
        updates.push({
          op: 'set',
          path: 'compradores[0].persona_fisica.estado_civil',
          value: 'casado',
          reason: 'Estado civil inferido por asignacion explicita de conyuge',
        })
      }

      const roleClosure = resolveRoleClosureFromConyugeAssignment({
        assignedConyugeName: roleAssignment.personName,
        requiredMissing,
        collectedData: args.collectedData,
      })
      if (roleClosure) {
        if (shouldCapturePath('compradores[0].tipo_persona')) {
          updates.push({
            op: 'set',
            path: 'compradores[0].tipo_persona',
            value: 'persona_fisica',
            reason: 'Tipo de comprador inferido por cierre determinista de roles',
          })
        }
        if (shouldCapturePath('compradores[0].persona_fisica.nombre')) {
          updates.push({
            op: 'set',
            path: 'compradores[0].persona_fisica.nombre',
            value: roleClosure.buyerName,
            reason: 'Comprador inferido por cierre determinista de roles (2 personas detectadas)',
          })
        }
        if (roleClosure.forceCasado && shouldCapturePath('compradores[0].persona_fisica.estado_civil')) {
          updates.push({
            op: 'set',
            path: 'compradores[0].persona_fisica.estado_civil',
            value: 'casado',
            reason: 'Estado civil inferido por evidencia de acta de matrimonio y cierre de roles',
          })
        }
      }
    }
  }

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
    if (institutionHint && shouldCapturePath('creditos[0].institucion')) {
      updates.push({
        op: 'set',
        path: 'creditos[0].institucion',
        value: institutionHint,
        reason: 'Institucion del credito detectada en el mismo mensaje de confirmacion de credito',
      })
    }
  }

  if (estadoCivilHint) {
    if (shouldCapturePath('compradores[0].persona_fisica.estado_civil')) {
      updates.push({
        op: 'set',
        path: 'compradores[0].persona_fisica.estado_civil',
        value: estadoCivilHint,
        reason: 'Estado civil del comprador capturado por respuesta corta',
      })
    }
    if (shouldCapturePath('vendedores[0].persona_fisica.estado_civil')) {
      updates.push({
        op: 'set',
        path: 'vendedores[0].persona_fisica.estado_civil',
        value: estadoCivilHint,
        reason: 'Estado civil del vendedor capturado por respuesta corta',
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

  const creditParticipantsFromContext = peopleClassificationActive
    ? null
    : resolveCreditParticipantsFromContext(message, args.collectedData)
  if (creditParticipantsFromContext && shouldCapturePath('creditos[0].participantes')) {
    updates.push({
      op: 'set',
      path: 'creditos[0].participantes',
      value: creditParticipantsFromContext,
      reason: 'Participantes del credito inferidos por referencia al comprador',
    })
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
    const direccionLine = extractAddressSegmentForCalle(message)
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
    const buyerReference = hasCompiledBuyerName ? null : resolveBuyerReferenceFromContext(message, args.collectedData)
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
      if (!hasCompiledSpouseName && buyerReference.spouseName && shouldCapturePath('compradores[0].persona_fisica.conyuge.nombre')) {
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

    const compradorLine = hasCompiledBuyerName ? null : extractLabeledValue(message, ['comprador'])
    if (compradorLine) {
      const parsed = parsePersonAndOptionalSpouse(compradorLine)
      if (parsed.personName && isLiteralPartyText(parsed.personName)) {
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
        if (!hasCompiledSpouseName && parsed.spouseName && shouldCapturePath('compradores[0].persona_fisica.conyuge.nombre')) {
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
    const vendedorLine = hasCompiledSellerName ? null : extractLabeledValue(message, ['vendedor'])
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

  const gravamen = peopleClassificationActive
    ? {
        hasSignal: false,
        existeHipoteca: null,
        gravamenes: null,
        cancelacionCreditoVendedor: null,
        aperturaCreditoComprador: null,
        hasContadoSignal: false,
      }
    : inferGravamenAndCreditSemantics(message)
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
      if (institutionHint && shouldCapturePath('creditos[0].institucion')) {
        updates.push({
          op: 'set',
          path: 'creditos[0].institucion',
          value: institutionHint,
          reason: 'Institucion bancaria detectada en mensaje multi-campo',
        })
      }
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
  return {
    updates: Array.from(dedup.values()),
    meta: {
      events_detected: compiledAnswerRoute.events.map((event) => event.type),
      blocked_calle_reason: detectBlockedCalleReason(message),
    },
  }
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
    const regex = new RegExp(`(?:\\bel\\s+)?${label}\\s*(?:es|[:#-])\\s*([\\s\\S]{1,500})`, 'i')
    const match = source.match(regex)
    if (!match?.[1]) continue
    const value = String(match[1])
      .split(/\b(vendedor|comprador)\s*(?:es|[:#-])/i)[0]
      .split(/\b(se tiene un gravamen|gravamen|hipoteca|credito|banco|el pago)\b/i)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.;,:]+$/, '')
    if (value) return value
  }
  return null
}

// Detection-only normalization. Keep raw substrings for persisted values.
function normalizeForDetection(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionizeMessage(raw: string): GMIMessageSection[] {
  const source = String(raw || '')
  if (!source.trim()) return [{ type: 'unknown', start: 0, end: 0, raw: '', norm: '' }]

  const markerPatterns: Array<{ type: Exclude<GMISectionType, 'unknown'>; regex: RegExp }> = [
    { type: 'buyer', regex: /\b(?:el\s+)?comprador(?:es)?\b/gi },
    { type: 'seller', regex: /\b(?:el\s+)?vendedor(?:es)?\b/gi },
    { type: 'credito', regex: /\b(?:credito|cr[eé]dito|contado|forma\s+de\s+pago|pago)\b/gi },
    { type: 'gravamen', regex: /\b(?:gravamen|hipoteca|hipotecario)\b/gi },
    { type: 'inmueble', regex: /\b(?:folio\s*real|partida(?:s)?|direccion|direcci[oó]n|objeto\s+del\s+inmueble|conj\.?\s*habitacional)\b/gi },
  ]

  const markers: Array<{ type: Exclude<GMISectionType, 'unknown'>; index: number }> = []
  for (const marker of markerPatterns) {
    const re = new RegExp(marker.regex.source, marker.regex.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      markers.push({ type: marker.type, index: match.index })
    }
  }

  markers.sort((a, b) => a.index - b.index)
  const deduped: Array<{ type: Exclude<GMISectionType, 'unknown'>; index: number }> = []
  const seen = new Set<number>()
  for (const marker of markers) {
    if (seen.has(marker.index)) continue
    seen.add(marker.index)
    deduped.push(marker)
  }

  if (deduped.length === 0) {
    return [{ type: 'unknown', start: 0, end: source.length, raw: source, norm: normalizeForDetection(source) }]
  }

  const sections: GMIMessageSection[] = []
  if (deduped[0].index > 0) {
    const leadingRaw = source.slice(0, deduped[0].index).trim()
    if (leadingRaw) {
      sections.push({
        type: 'unknown',
        start: 0,
        end: deduped[0].index,
        raw: leadingRaw,
        norm: normalizeForDetection(leadingRaw),
      })
    }
  }

  for (let i = 0; i < deduped.length; i += 1) {
    const current = deduped[i]
    const next = deduped[i + 1]
    const start = current.index
    const end = next ? next.index : source.length
    const slice = source.slice(start, end).trim()
    if (!slice) continue
    sections.push({
      type: current.type,
      start,
      end,
      raw: slice,
      norm: normalizeForDetection(slice),
    })
  }

  return sections.length > 0
    ? sections
    : [{ type: 'unknown', start: 0, end: source.length, raw: source, norm: normalizeForDetection(source) }]
}

function dedupeAnswerEvents(events: GMIAnswerEvent[]): GMIAnswerEvent[] {
  const out: GMIAnswerEvent[] = []
  const seen = new Set<string>()
  for (const event of events || []) {
    const textLike = String(event.payload?.text || event.payload?.value || '').trim()
    const key = `${event.type}|${normalizeForDetection(textLike)}|${String(event.payload?.index ?? '')}|${String(event.payload?.buyer_index ?? '')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}

function extractBuyerSection(section: GMIMessageSection): GMIAnswerEvent[] {
  const events: GMIAnswerEvent[] = []
  const raw = String(section.raw || '')
  if (!raw.trim()) return events
  let body = raw
    .replace(/^\s*(?:el\s+)?comprador(?:es)?\b/i, '')
    .trim()
  body = body.replace(/^(?:es|son)?\s*[:#-]?\s*/i, '').trim()
  if (!body) return events

  const spouseFromPatterns =
    body.match(/\bjunto\s+con\s+su\s+espos[ao]\s+([A-Za-zÀ-ÿ' ]{4,120})/i)?.[1] ||
    body.match(/\bsu\s+conyuge\s+([A-Za-zÀ-ÿ' ]{4,120})/i)?.[1] ||
    body.match(/\bcasad[oa]\s+con\s+([A-Za-zÀ-ÿ' ]{4,120})/i)?.[1] ||
    null
  if (spouseFromPatterns) {
    const spouseName = cleanName(spouseFromPatterns)
    if (spouseName) events.push({ type: 'ANSWER_SPOUSE_TEXT', payload: { text: spouseName, buyer_index: 0 } })
  }
  const marital =
    /\bsolter[oa]\b/i.test(body) ? 'soltero'
      : /\bcasad[oa]\b/i.test(body) ? 'casado'
        : null
  if (marital) {
    events.push({ type: 'ANSWER_BUYER_MARITAL_STATUS', payload: { estado_civil: marital, buyer_index: 0 } })
  }

  let buyerBody = body
    .replace(/\bjunto\s+con\s+su\s+espos[ao]\s+[A-Za-zÀ-ÿ' ]{4,120}/i, '')
    .replace(/\bsu\s+conyuge\s+[A-Za-zÀ-ÿ' ]{4,120}/i, '')
    .replace(/\bcasad[oa]\s+con\s+[A-Za-zÀ-ÿ' ]{4,120}/i, '')
    .replace(/[.;]+$/g, '')
    .trim()
  buyerBody = buyerBody
    .split(/\b(el\s+pago|pago|se\s+tiene|gravamen|hipoteca|credito|cr[eé]dito|vendedor(?:es)?)\b/i)[0]
    .replace(/[.;,:-]+$/g, '')
    .trim()

  const pluralBuyers =
    /^\s*compradores/i.test(raw) ||
    (/^\s*compradores/i.test(body) && /\s+y\s+/i.test(body))
  const candidates = pluralBuyers ? splitBuyerCandidates(buyerBody) : [buyerBody]
  let index = 0
  for (const candidate of candidates) {
    const clean = sanitizeBuyerCandidate(candidate)
    if (!clean || !isLiteralPartyText(clean)) continue
    events.push({ type: 'ANSWER_BUYER_TEXT', payload: { text: clean, index } })
    const inferredType = inferPartyType(clean)
    if (inferredType === 'persona_moral') {
      events.push({ type: 'ANSWER_BUYER_TYPE', payload: { tipo_persona: 'persona_moral', index } })
    }
    index += 1
  }

  return events
}

function sanitizeBuyerCandidate(candidate: string): string {
  const stripped = String(candidate || '')
    .replace(/^\s*[:#\-.,;]+\s*/g, '')
    .replace(/^\s*(?:el\s+)?comprador(?:es)?\s*(?:es|son)?\s*[:#-]?\s*/i, '')
    .split(/\b(el\s+pago|pago|se\s+tiene|gravamen|hipoteca|credito|cr[eé]dito|vendedor(?:es)?)\b/i)[0]
    .replace(/\bEL\b\s*$/i, '')
    .replace(/[,;\s]+solter[oa]\b/gi, '')
    .replace(/[,;\s]+casad[oa]\b/gi, '')
    .replace(/[.;,:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleanName(stripped)
}

function splitBuyerCandidates(raw: string): string[] {
  const text = String(raw || '').trim()
  if (!text) return []
  const parts = text
    .split(/\s+y\s+/i)
    .map((x) => x.replace(/^[,.;\s]+|[,.;\s]+$/g, '').trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts
  return [text]
}

function extractSellerSection(section: GMIMessageSection): GMIAnswerEvent[] {
  const events: GMIAnswerEvent[] = []
  const sellerText = extractRoleTextSegment(section.raw, 'vendedor')
  if (!sellerText || !isLiteralPartyText(sellerText)) return events
  events.push({ type: 'ANSWER_SELLER_TEXT', payload: { text: sellerText } })
  const sellerType = inferPartyType(sellerText)
  events.push({ type: 'ANSWER_SELLER_TYPE', payload: { tipo_persona: sellerType } })
  return events
}

function extractInmuebleSection(section: GMIMessageSection): GMIAnswerEvent[] {
  const events: GMIAnswerEvent[] = []
  const folio = extractFolioRealStrictFromMessage(section.raw)
  if (folio) events.push({ type: 'ANSWER_FOLIO_REAL', payload: { value: folio } })
  const partidas = extractPartidasFromMessage(section.raw)
  if (partidas.length > 0) events.push({ type: 'ANSWER_PARTIDA', payload: { values: partidas } })
  const address = extractAddressSegmentForCalle(section.raw)
  if (address) events.push({ type: 'ANSWER_ADDRESS_TEXT', payload: { text: address } })
  return events
}

function extractInstitutionRaw(raw: string): string | null {
  const source = String(raw || '')
  if (!source.trim()) return null
  const match =
    source.match(/\b(?:credito|cr[eé]dito|gravamen|hipoteca)\s+(?:de|con)\s+([A-ZÁÉÍÓÚÑ0-9,.\s]+)(?:$|[.;])/i) ||
    source.match(/\bcon\s+([A-ZÁÉÍÓÚÑ0-9,.\s]+BANCO[A-ZÁÉÍÓÚÑ0-9,.\s]*)/i) ||
    source.match(/\b(BANCO[\wÁÉÍÓÚÑ,\.\s-]{6,180})/i)
  if (!match?.[1]) return null
  return String(match[1]).replace(/\s+/g, ' ').trim().replace(/[.;,:]+$/, '')
}

function extractCreditoSection(section: GMIMessageSection): GMIAnswerEvent[] {
  const events: GMIAnswerEvent[] = []
  const raw = String(section.raw || '')
  const norm = normalizeForDetection(raw)
  if (!raw.trim()) return events

  let mode: 'credito' | 'contado' | null = null
  if (/\b(mediante un credito|mediante credito|con credito|a traves de credito|a través de crédito|credito de)\b/i.test(raw)) {
    mode = 'credito'
  } else if (/\b(al contado|de contado|sin credito|sin crédito|pago en efectivo)\b/i.test(raw)) {
    mode = 'contado'
  } else {
    mode = inferShortPaymentModeHint(raw)
  }
  if (mode) {
    events.push({ type: 'ANSWER_PAYMENT_MODE', payload: { mode } })
  }

  if (mode === 'credito' || /\b(banco|institucion de banca multiple|institución de banca múltiple)\b/.test(norm)) {
    const institution =
      extractInstitutionRaw(raw) ||
      inferCreditInstitutionFromMessage(raw)
    if (institution) {
      events.push({ type: 'ANSWER_CREDIT_INSTITUTION_TEXT', payload: { institucion_raw: institution } })
    }
  }
  return events
}

function extractGravamenSection(section: GMIMessageSection): GMIAnswerEvent[] {
  const events: GMIAnswerEvent[] = []
  const raw = String(section.raw || '')
  const norm = normalizeForDetection(raw)
  if (!raw.trim()) return events

  if (/\blibre de gravamen\b/.test(norm)) {
    events.push({ type: 'ANSWER_GRAVAMEN_EXISTS', payload: { exists: false } })
    return events
  }
  if (/\b(se tiene un gravamen|tiene gravamen|existe hipoteca|gravamen con|hipoteca)\b/.test(norm)) {
    events.push({ type: 'ANSWER_GRAVAMEN_EXISTS', payload: { exists: true } })
    const institution = extractInstitutionRaw(raw)
    if (institution) {
      events.push({ type: 'ANSWER_GRAVAMEN_INSTITUTION_TEXT', payload: { institucion_raw: institution } })
    }
  }
  return events
}

function isAffirmativeToken(normalized: string): boolean {
  const text = String(normalized || '').trim()
  if (!text) return false
  if (/\bsi\b/.test(text)) return true
  return (
    /^(si|afirmativo|correcto)$/.test(text) ||
    /\bsi\s+se\s+cancelara\b/.test(text) ||
    /\bsi\s+se\s+cancelara\s+con\b/.test(text) ||
    /\bse\s+cancela\b/.test(text) ||
    /\bse\s+cancelara\b/.test(text) ||
    /\bse\s+cancelara\s+si\b/.test(text)
  )
}

function isNegativeToken(normalized: string): boolean {
  const text = String(normalized || '').trim()
  if (!text) return false
  if (/\bno\b/.test(text)) return true
  return (
    /^(no|negativo)$/.test(text) ||
    /\bno\s+se\s+cancela\b/.test(text) ||
    /\bno\s+se\s+cancelara\b/.test(text)
  )
}

function extractGravamenCancelacionYesNoEvent(args: {
  message: string
  requiredMissing: string[]
}): GMIAnswerEvent[] {
  const requiredMissing = Array.isArray(args.requiredMissing) ? args.requiredMissing : []
  const needsCancelacion = requiredMissing.some((missing) =>
    /^gravamenes\[\d+\]\.cancelacion_confirmada$/.test(String(missing || '').trim())
  )
  if (!needsCancelacion) return []
  const normalized = normalizeForDetection(String(args.message || ''))
  if (!normalized) return []
  if (isNegativeToken(normalized)) {
    return [{ type: 'ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA', payload: { value: false } }]
  }
  if (isAffirmativeToken(normalized)) {
    return [{ type: 'ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA', payload: { value: true } }]
  }
  return []
}

function detectDeterministicAnswerEvents(args: {
  message: string
  requiredMissing: string[]
  sections?: GMIMessageSection[]
}): GMIAnswerEvent[] {
  const message = String(args.message || '')
  const events: GMIAnswerEvent[] = []
  const normalizedMissing = Array.isArray(args.requiredMissing) ? args.requiredMissing : []
  const sections = Array.isArray(args.sections) && args.sections.length > 0 ? args.sections : sectionizeMessage(message)

  const hasBuyerRelevantMissing = normalizedMissing.some((missing) =>
    ['compradores[]', 'compradores[].nombre', 'compradores[].tipo_persona'].includes(String(missing || ''))
  )
  const hasSellerRelevantMissing = normalizedMissing.some((missing) =>
    ['vendedores[]', 'vendedores[].nombre', 'vendedores[].tipo_persona'].includes(String(missing || ''))
  )
  const hasFolioMissing = normalizedMissing.some((missing) => String(missing || '').trim() === 'inmueble.folio_real')
  const hasPartidaMissing = normalizedMissing.some((missing) => String(missing || '').trim() === 'inmueble.partidas')
  const hasDireccionMissing = normalizedMissing.some((missing) => String(missing || '').trim() === 'inmueble.direccion')

  const sectionEvents: GMIAnswerEvent[] = []
  sectionEvents.push(
    ...extractGravamenCancelacionYesNoEvent({
      message,
      requiredMissing: normalizedMissing,
    })
  )
  for (const section of sections) {
    if (section.type === 'buyer') sectionEvents.push(...extractBuyerSection(section))
    if (section.type === 'seller') sectionEvents.push(...extractSellerSection(section))
    if (section.type === 'inmueble') sectionEvents.push(...extractInmuebleSection(section))
    if (section.type === 'credito') sectionEvents.push(...extractCreditoSection(section))
    if (section.type === 'gravamen') sectionEvents.push(...extractGravamenSection(section))
  }

  // Global fallback scan keeps compatibility when sectionizer misses explicit markers.
  if (sectionEvents.length === 0) {
    const buyerText = extractRoleTextSegment(message, 'comprador')
    if (buyerText && isLiteralPartyText(buyerText)) {
      sectionEvents.push({ type: 'ANSWER_BUYER_TEXT', payload: { text: buyerText, index: 0 } })
    }
    const sellerText = extractRoleTextSegment(message, 'vendedor')
    if (sellerText && isLiteralPartyText(sellerText)) {
      sectionEvents.push({ type: 'ANSWER_SELLER_TEXT', payload: { text: sellerText } })
    }
    const spouseText = extractSpouseTextSegment(message)
    if (spouseText) {
      sectionEvents.push({ type: 'ANSWER_SPOUSE_TEXT', payload: { text: spouseText, buyer_index: 0 } })
    }
  }

  for (const event of sectionEvents) {
    if (
      (event.type === 'ANSWER_BUYER_TEXT' || event.type === 'ANSWER_BUYER_TYPE' || event.type === 'ANSWER_SPOUSE_TEXT') &&
      !hasBuyerRelevantMissing &&
      !/\bcomprador|compradores|conyuge|esposa|esposo\b/i.test(message)
    ) {
      continue
    }
    if (
      (event.type === 'ANSWER_SELLER_TEXT' || event.type === 'ANSWER_SELLER_TYPE') &&
      !hasSellerRelevantMissing &&
      !/\bvendedor|vendedores\b/i.test(message)
    ) {
      continue
    }
    if (event.type === 'ANSWER_FOLIO_REAL' && !hasFolioMissing) continue
    if (event.type === 'ANSWER_PARTIDA' && !hasPartidaMissing) continue
    if (event.type === 'ANSWER_ADDRESS_TEXT' && !hasDireccionMissing) continue
    if (
      (event.type === 'ANSWER_PAYMENT_MODE' || event.type === 'ANSWER_CREDIT_INSTITUTION_TEXT') &&
      !normalizedMissing.some((missing) => ['existencia_credito', 'creditos[]'].includes(String(missing || '').trim())) &&
      !/\bcredito|cr[eé]dito|contado|pago\b/i.test(message)
    ) {
      continue
    }
    if (
      (event.type === 'ANSWER_GRAVAMEN_EXISTS' ||
        event.type === 'ANSWER_GRAVAMEN_INSTITUTION_TEXT' ||
        event.type === 'ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA') &&
      !normalizedMissing.some((missing) => {
        const normalized = String(missing || '').trim()
        return (
          ['inmueble.existe_hipoteca', 'gravamenes', 'gravamenes[]'].includes(normalized) ||
          /^gravamenes\[\d+\]\./.test(normalized)
        )
      }) &&
      !/\bgravamen|hipoteca|cancel/i.test(message)
    ) {
      continue
    }
    events.push(event)
  }

  return dedupeAnswerEvents(events)
}

function compileDeterministicAnswerEvents(
  events: GMIAnswerEvent[],
  collectedData?: Record<string, unknown>
): Array<Record<string, unknown>> {
  const updates: Array<Record<string, unknown>> = []
  const pushUpdate = (path: string, value: unknown, reason: string) => {
    updates.push({
      op: 'set',
      path,
      value,
      reason,
    })
  }

  for (const event of events || []) {
    if (event.type === 'ANSWER_BUYER_TEXT') {
      const text = cleanName(String(event.payload?.text || ''))
      if (!text) continue
      const index = Number.isFinite(Number(event.payload?.index)) ? Math.max(0, Number(event.payload?.index)) : 0
      const inferredType = inferPartyType(text)
      if (inferredType === 'persona_moral') {
        pushUpdate(`compradores[${index}].tipo_persona`, 'persona_moral', 'Buyer event compilado: tipo_persona inferido')
        pushUpdate(
          `compradores[${index}].persona_moral.denominacion_social`,
          text,
          'Buyer event compilado: denominacion social'
        )
      } else {
        pushUpdate(`compradores[${index}].persona_fisica.nombre`, text, 'Buyer event compilado: nombre')
      }
    }
    if (event.type === 'ANSWER_BUYER_TYPE') {
      const tipo = String(event.payload?.tipo_persona || '').trim()
      const index = Number.isFinite(Number(event.payload?.index)) ? Math.max(0, Number(event.payload?.index)) : 0
      if (tipo === 'persona_fisica' || tipo === 'persona_moral') {
        pushUpdate(`compradores[${index}].tipo_persona`, tipo, 'Buyer event compilado: tipo_persona explicito')
      }
    }
    if (event.type === 'ANSWER_SELLER_TEXT') {
      const text = cleanName(String(event.payload?.text || ''))
      if (!text) continue
      const inferredType = inferPartyType(text)
      if (inferredType === 'persona_moral') {
        pushUpdate('vendedores[0].tipo_persona', 'persona_moral', 'Seller event compilado: tipo_persona inferido')
        pushUpdate(
          'vendedores[0].persona_moral.denominacion_social',
          text,
          'Seller event compilado: denominacion social'
        )
      } else {
        pushUpdate('vendedores[0].persona_fisica.nombre', text, 'Seller event compilado: nombre')
      }
    }
    if (event.type === 'ANSWER_SELLER_TYPE') {
      const tipo = String(event.payload?.tipo_persona || '').trim()
      if (tipo === 'persona_fisica' || tipo === 'persona_moral') {
        pushUpdate('vendedores[0].tipo_persona', tipo, 'Seller event compilado: tipo_persona explicito')
      }
    }
    if (event.type === 'ANSWER_SPOUSE_TEXT') {
      const text = cleanName(String(event.payload?.text || ''))
      if (!text) continue
      const buyerIndex = Number.isFinite(Number(event.payload?.buyer_index))
        ? Math.max(0, Number(event.payload?.buyer_index))
        : 0
      pushUpdate(`compradores[${buyerIndex}].persona_fisica.conyuge.nombre`, text, 'Spouse event compilado')
      pushUpdate(`compradores[${buyerIndex}].persona_fisica.estado_civil`, 'casado', 'Spouse event compilado: estado civil casado')
    }
    if (event.type === 'ANSWER_FOLIO_REAL') {
      const value = String(event.payload?.value || '').trim()
      if (!value) continue
      pushUpdate('inmueble.folio_real', value, 'Inmueble event compilado: folio real')
    }
    if (event.type === 'ANSWER_PARTIDA') {
      const values = Array.isArray(event.payload?.values)
        ? event.payload.values.map((x) => String(x || '').trim()).filter(Boolean)
        : []
      if (values.length === 0) continue
      pushUpdate('inmueble.partidas', Array.from(new Set(values)), 'Inmueble event compilado: partidas')
    }
    if (event.type === 'ANSWER_ADDRESS_TEXT') {
      const text = String(event.payload?.text || '').trim()
      if (!text) continue
      pushUpdate('inmueble.direccion.calle', text, 'Inmueble event compilado: direccion segura')
    }
    if (event.type === 'ANSWER_PAYMENT_MODE') {
      const mode = String(event.payload?.mode || '').trim()
      if (mode === 'credito') {
        pushUpdate('existencia_credito', true, 'Credito event compilado: existencia_credito')
        pushUpdate('actosNotariales.aperturaCreditoComprador', true, 'Credito event compilado: apertura')
        pushUpdate('creditos', [{ institucion: null, participantes: [] }], 'Credito event compilado: estructura creditos')
      }
      if (mode === 'contado') {
        pushUpdate('existencia_credito', false, 'Credito event compilado: existencia_credito')
        pushUpdate('actosNotariales.aperturaCreditoComprador', false, 'Credito event compilado: operacion contado')
        pushUpdate('creditos', [], 'Credito event compilado: sin credito')
      }
    }
    if (event.type === 'ANSWER_CREDIT_INSTITUTION_TEXT') {
      const institutionRaw = String(event.payload?.institucion_raw || '').trim()
      if (institutionRaw) {
        pushUpdate('creditos', [{ institucion: null, participantes: [] }], 'Credito event compilado: estructura por institucion')
        pushUpdate('creditos[0].institucion', institutionRaw, 'Credito event compilado: institucion')
      }
    }
    if (event.type === 'ANSWER_GRAVAMEN_EXISTS') {
      const exists = event.payload?.exists === true
      pushUpdate('inmueble.existe_hipoteca', exists, 'Gravamen event compilado: existencia')
      if (!exists) {
        pushUpdate('gravamenes', [], 'Gravamen event compilado: libre de gravamen')
      }
      if (exists) {
        pushUpdate(
          'gravamenes',
          [{ institucion: null, cancelacion_confirmada: null }],
          'Gravamen event compilado: estructura base'
        )
      }
    }
    if (event.type === 'ANSWER_GRAVAMEN_INSTITUTION_TEXT') {
      const institutionRaw = String(event.payload?.institucion_raw || '').trim()
      if (institutionRaw) {
        pushUpdate('inmueble.existe_hipoteca', true, 'Gravamen event compilado: existencia por institucion')
        pushUpdate(
          'gravamenes',
          [{ institucion: institutionRaw, cancelacion_confirmada: null }],
          'Gravamen event compilado: institucion'
        )
        pushUpdate('gravamenes[0].institucion', institutionRaw, 'Gravamen event compilado: institucion puntual')
      }
    }
    if (event.type === 'ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA') {
      if (typeof event.payload?.value !== 'boolean') continue
      pushUpdate(
        'gravamenes[0].cancelacion_confirmada',
        event.payload.value === true,
        'Gravamen event compilado: cancelacion confirmada'
      )
      if (event.payload.value === true) {
        pushUpdate('actosNotariales.cancelacionCreditoVendedor', true, 'Gravamen event compilado: cancelacion activa')
      }
      if (event.payload.value === false) {
        pushUpdate('actosNotariales.cancelacionCreditoVendedor', false, 'Gravamen event compilado: cancelacion no aplica')
      }
    }
    if (event.type === 'ANSWER_BUYER_MARITAL_STATUS') {
      const estadoCivil = String(event.payload?.estado_civil || '').trim()
      const buyerIndex = Number.isFinite(Number(event.payload?.buyer_index))
        ? Math.max(0, Number(event.payload?.buyer_index))
        : 0
      if (estadoCivil) {
        pushUpdate(`compradores[${buyerIndex}].persona_fisica.estado_civil`, estadoCivil, 'Buyer event compilado: estado civil')
      }
    }
  }

  const dedup = new Map<string, Record<string, unknown>>()
  for (const update of updates) dedup.set(String(update.path || ''), update)

  const hasGravamenNestedUpdate = Array.from(dedup.keys()).some((path) => /^gravamenes\[\d+\]\./.test(path))
  const hasGravamenCollectionUpdate = dedup.has('gravamenes')
  if (hasGravamenNestedUpdate && !hasGravamenCollectionUpdate) {
    const existing = Array.isArray((collectedData as any)?.gravamenes) ? (((collectedData as any).gravamenes as any[]) || []) : []
    const first = existing[0]
    if (typeof first === 'string' && first.trim()) {
      dedup.set('gravamenes', {
        op: 'set',
        path: 'gravamenes',
        value: [{ institucion: first.trim(), cancelacion_confirmada: null }],
        reason: 'Normalizacion de gravamenes: string legado a objeto',
      })
    } else if (!first) {
      dedup.set('gravamenes', {
        op: 'set',
        path: 'gravamenes',
        value: [{ institucion: null, cancelacion_confirmada: null }],
        reason: 'Normalizacion de gravamenes: estructura base',
      })
    }
  }

  return Array.from(dedup.values())
}

function inferExplicitRoleTypeFromMessage(
  message: string,
  role: 'comprador' | 'vendedor'
): 'persona_fisica' | 'persona_moral' | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || !normalized.includes(role)) return null
  if (new RegExp(`\\b${role}\\b[^\\n.;]{0,60}\\bpersona\\s+moral\\b`).test(normalized)) return 'persona_moral'
  if (new RegExp(`\\b${role}\\b[^\\n.;]{0,60}\\bpersona\\s+fisica\\b`).test(normalized)) return 'persona_fisica'
  return null
}

function extractRoleTextSegment(message: string, role: 'comprador' | 'vendedor'): string | null {
  const source = String(message || '')
  if (!source.trim()) return null

  const stopMarkers = /\b(se tiene un gravamen|gravamen|hipoteca|el pago|pago|credito|banco|comprador|vendedor)\b/i
  const inlineRegex = new RegExp(
    `(?:\\bel\\s+)?${role}\\s*(?:es|[:#-])?\\s*([\\s\\S]{2,320})`,
    'i'
  )
  const inline = source.match(inlineRegex)?.[1]
  if (inline) {
    let parsed = String(inline).split(/\r?\n/)[0].trim()
    const markerIndex = parsed.search(stopMarkers)
    if (markerIndex > 0) parsed = parsed.slice(0, markerIndex).trim()
    if (parsed) return cleanName(parsed)
  }

  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    if (!new RegExp(`\\b${role}\\b`, 'i').test(line)) continue
    let stripped = line
      .replace(new RegExp(`^.*?\\b${role}\\b\\s*(?:es|[:#-])?\\s*`, 'i'), '')
      .trim()
    const markerIndex = stripped.search(stopMarkers)
    if (markerIndex > 0) stripped = stripped.slice(0, markerIndex).trim()
    if (stripped) return cleanName(stripped)
  }

  return null
}

function extractSpouseTextSegment(message: string): string | null {
  const source = String(message || '')
  const match = source.match(/\b(?:su\s+)?(?:conyuge|conyugue|esposa|esposo)\s*(?:es|[:#-])\s*([^\n.;]{2,180})/i)
  if (!match?.[1]) return null
  return cleanName(String(match[1]))
}

function isLiteralPartyText(value: string): boolean {
  const normalized = normalizeLooseText(String(value || ''))
  if (!normalized) return false
  if (normalized.length < 4) return false
  if (/\b(esposo|esposa|conyuge|conyugue|acta|adjunto|ine|constancia|siguiente|documento)\b/.test(normalized)) {
    return false
  }
  return true
}

function detectBlockedCalleReason(message: string): string | null {
  const source = String(message || '')
  if (!source.trim()) return null
  if (source.length > CALLE_FALLBACK_MAX_CHARS) {
    return 'calle_blocked_input_too_long'
  }
  if (CALLE_FOREIGN_MARKERS_REGEX.test(source)) {
    return 'calle_blocked_foreign_markers'
  }
  return null
}

function extractAddressSegmentForCalle(message: string): string | null {
  const source = String(message || '')
  if (!source.trim()) return null
  if (detectBlockedCalleReason(source)) {
    const marker = source.search(/\b(se tiene un gravamen|el vendedor|vendedor|el comprador|comprador|el pago|credito|banco|hipoteca|gravamen)\b/i)
    if (marker <= 0) return null
    const prefix = source.slice(0, marker).trim()
    if (!prefix) return null
    const fromLabel = extractLabeledValue(prefix, ['conj. habitacional', 'conj habitacional', 'direccion'])
    const candidate = stripAddressTransitionTail(fromLabel || cleanName(prefix))
    if (
      !candidate ||
      candidate.length < CALLE_SEGMENT_MIN_CHARS ||
      candidate.length > CALLE_SEGMENT_MAX_CHARS ||
      CALLE_FOREIGN_MARKERS_REGEX.test(candidate)
    ) {
      return null
    }
    return candidate
  }

  const direct = stripAddressTransitionTail(extractLabeledValue(source, ['conj. habitacional', 'conj habitacional', 'direccion']))
  if (!direct) return null
  if (
    direct.length < CALLE_SEGMENT_MIN_CHARS ||
    direct.length > CALLE_SEGMENT_MAX_CHARS ||
    CALLE_FOREIGN_MARKERS_REGEX.test(direct)
  ) {
    return null
  }
  return direct
}

function stripAddressTransitionTail(value: string | null): string {
  return String(value || '')
    .replace(/\bse\s+tiene\s+un\s*$/i, '')
    .replace(/\bse\s+tiene\s*$/i, '')
    .replace(/[.;,:-]+$/g, '')
    .trim()
}

function extractFolioRealStrictFromMessage(message: string): string | null {
  const source = String(message || '')
  if (!source.trim()) return null
  const strict =
    source.match(/\bfolio\s*real\b\s*[:#-]?\s*([0-9]{5,10})\b/i) ||
    source.match(/\bfolio\s*real\s+([0-9]{5,10})\b/i)
  if (strict?.[1]) return String(strict[1]).trim()
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

function normalizeLooseText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSemanticTokens(value: string): string[] {
  const stopwords = new Set([
    'el',
    'la',
    'los',
    'las',
    'un',
    'una',
    'de',
    'del',
    'y',
    'es',
    'como',
    'con',
    'sin',
    'al',
    'por',
    'para',
    'que',
    'su',
    'esposa',
    'esposo',
    'conyuge',
    'conyugue',
    'comprador',
    'vendedor',
  ])
  return normalizeLooseText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token))
}

function levenshteinDistance(a: string, b: string): number {
  const x = String(a || '')
  const y = String(b || '')
  if (x === y) return 0
  if (!x.length) return y.length
  if (!y.length) return x.length
  const dp: number[] = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i += 1) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= y.length; j += 1) {
      const temp = dp[j]
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
      prev = temp
    }
  }
  return dp[y.length]
}

function fuzzyTokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const minLen = Math.min(a.length, b.length)
  if (minLen < 4) return false
  const threshold = minLen >= 7 ? 2 : 1
  return levenshteinDistance(a, b) <= threshold
}

function scorePersonMention(message: string, personName: string): number {
  const messageNorm = normalizeLooseText(message)
  const personNorm = normalizeLooseText(personName)
  if (!messageNorm || !personNorm) return 0
  if (messageNorm.includes(personNorm)) return 100

  const messageTokens = getSemanticTokens(messageNorm)
  const personTokens = getSemanticTokens(personNorm)
  if (messageTokens.length === 0 || personTokens.length === 0) return 0

  let exact = 0
  let fuzzy = 0
  for (const personToken of personTokens) {
    if (messageTokens.includes(personToken)) {
      exact += 1
      continue
    }
    if (messageTokens.some((msgToken) => fuzzyTokenMatch(personToken, msgToken))) {
      fuzzy += 1
    }
  }
  return exact * 3 + fuzzy * 2
}

function findBestDetectedPersonByMessage(message: string, detected: Array<{ nombre: string }>): { nombre: string } | null {
  if (!detected.length) return null
  const scored = detected
    .map((person) => ({ person, score: scorePersonMention(message, person.nombre) }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  if (!top || top.score <= 0) return null
  const second = scored[1]
  if (second && second.score === top.score) return null
  return top.person
}

function resolveRoleClosureFromConyugeAssignment(args: {
  assignedConyugeName: string
  requiredMissing: string[]
  collectedData: Record<string, unknown>
}): { buyerName: string; forceCasado: boolean } | null {
  const detected = extractUnclassifiedPeople(args.collectedData)
  if (detected.length !== 2) return null

  const buyerPaths = [
    'compradores[]',
    'compradores[].nombre',
    'compradores[0].persona_fisica.nombre',
    'compradores[].tipo_persona',
    'compradores[0].tipo_persona',
  ]
  const sellerPaths = [
    'vendedores[]',
    'vendedores[].nombre',
    'vendedores[0].persona_fisica.nombre',
    'vendedores[].tipo_persona',
    'vendedores[0].tipo_persona',
  ]
  const hasBuyerMissing = args.requiredMissing.some((missing) => buyerPaths.some((path) => matchesMissing(path, missing)))
  const hasSellerMissing = args.requiredMissing.some((missing) => sellerPaths.some((path) => matchesMissing(path, missing)))
  if (!hasBuyerMissing || hasSellerMissing) return null

  const assigned =
    findBestDetectedPersonByMessage(args.assignedConyugeName, detected) ||
    detected.find(
      (person) =>
        normalizeLooseText(person.nombre) === normalizeLooseText(args.assignedConyugeName)
    ) ||
    null
  if (!assigned) return null

  const counterpart = detected.find((person) => person.nombre !== assigned.nombre)
  if (!counterpart) return null

  const forceCasado = hasMarriageActEvidence(args.collectedData)
  return { buyerName: counterpart.nombre, forceCasado }
}

function hasMarriageActEvidence(collectedData: Record<string, unknown>): boolean {
  const docs = Array.isArray((collectedData as any)?.documentos)
    ? ((collectedData as any).documentos as unknown[])
    : []
  return docs.some((doc) => {
    const name = normalizeLooseText(String(doc || ''))
    return name.includes('acta') && name.includes('matrimonio')
  })
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
  if (/\b(de contado|sin credito|sin financiamiento|recursos propios)\b/.test(normalized)) return 'contado'

  if (/^(con credito|con un credito|credito|sera con credito|si, con credito|si credito)$/.test(normalized)) return 'credito'
  if (/\b(con credito|credito bancario|financiamiento bancario|mediante credito|a credito)\b/.test(normalized)) return 'credito'
  return null
}

function inferCreditInstitutionFromMessage(message: string): string | null {
  const raw = String(message || '')
  if (!raw.trim()) return null

  const normalizeInstitution = (input: string): string | null => {
    const cleaned = String(input || '')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]+$/g, '')
      .trim()
    if (!cleaned) return null
    return cleaned.toUpperCase()
  }

  const commonBanks = [
    'BANCO MERCANTIL DEL NORTE',
    'BANORTE',
    'BBVA',
    'BANAMEX',
    'SANTANDER',
    'HSBC',
    'SCOTIABANK',
    'BANCO AZTECA',
    'BANCO DEL BAJIO',
    'INBURSA',
    'AFIRME',
    'FOVISSSTE',
    'INFONAVIT',
  ]
  const normalized = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  for (const bank of commonBanks) {
    if (normalized.includes(bank)) return bank
  }

  const withLabel =
    raw.match(/\b(?:banco|institucion|instituci[oó]n|financiamiento)\b\s*(?:de|del|con)?\s*[:\-]?\s*([A-Za-z0-9&.\s]{3,120})/i) ||
    raw.match(/\bcon\s+credito\s+con\s+([A-Za-z0-9&.\s]{3,120})/i) ||
    raw.match(/\bcredito\s+con\s+([A-Za-z0-9&.\s]{3,120})/i)
  if (!withLabel?.[1]) return null

  const candidate = withLabel[1]
    .split(/\b(?:acreditado|coacreditado|participa|participantes|comprador|vendedor)\b/i)[0]
    .trim()
  return normalizeInstitution(candidate)
}

function inferShortEstadoCivilHint(
  message: string
): 'casado' | 'soltero' | 'divorciado' | 'viudo' | 'union_libre' | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  if (/^(casado|casada|es casado|es casada|si, casado|si casado)$/.test(normalized)) return 'casado'
  if (/^(soltero|soltera|es soltero|es soltera|si, soltero|si soltero)$/.test(normalized)) return 'soltero'
  if (/^(divorciado|divorciada|es divorciado|es divorciada)$/.test(normalized)) return 'divorciado'
  if (/^(viudo|viuda|es viudo|es viuda)$/.test(normalized)) return 'viudo'
  if (/^(union libre|en union libre|concubinato)$/.test(normalized)) return 'union_libre'
  return null
}

function inferShortNameCandidate(message: string): string | null {
  const raw = String(message || '').trim()
  if (!raw) return null
  if (raw.length < 6 || raw.length > 90) return null
  if (/\d/.test(raw)) return null
  if (/[:#\-]/.test(raw)) return null
  if (/[,.]/.test(raw)) return null
  if (
    /\b(fisica|moral|credito|contado|folio|partida|casad[oa]|solter[oa]|gravamen|hipoteca|conyuge|conyugue|esposa|esposo|comprador|vendedor)\b/i.test(
      raw
    )
  ) {
    return null
  }
  if (/\bes\s+(el|la|un|una)\b/i.test(raw)) {
    return null
  }
  if (!/^[\p{L}'\s]+$/u.test(raw)) return null
  const tokens = raw.split(/\s+/).filter(Boolean)
  if (tokens.length < 2 || tokens.length > 6) return null
  const cleaned = cleanName(raw)
  return cleaned || null
}

function resolveDetectedPersonRoleAssignment(args: {
  message: string
  requiredMissing: string[]
  lastQuestionIntent: string | null
  pendingQuestions: string[]
  collectedData: Record<string, unknown>
}): { role: 'comprador' | 'vendedor' | 'conyuge'; personName: string } | null {
  const normalized = String(args.message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  const hasBuyer = /\bcomprador(?:es)?\b/.test(normalized)
  const hasSeller = /\bvendedor(?:es)?\b/.test(normalized)
  const hasSpouse = /\b(conyuge|conyugue|esposa|esposo)\b/.test(normalized)

  let role: 'comprador' | 'vendedor' | 'conyuge' | null = null
  if (hasSpouse) role = 'conyuge'
  else if (hasBuyer && !hasSeller) role = 'comprador'
  else if (hasSeller && !hasBuyer) role = 'vendedor'

  const pendingText = String((args.pendingQuestions || []).join(' ') || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const lastIntent = String(args.lastQuestionIntent || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (!role && /^(es|si|correcto|ok)\b/.test(normalized)) {
    if (/\b(conyuge|conyugue|esposa|esposo)\b/.test(pendingText) || /\bconyug(?:e|ue)\b/.test(lastIntent)) role = 'conyuge'
    else if (/\bcomprador\b/.test(pendingText) || /\bcomprador\b/.test(lastIntent)) role = 'comprador'
    else if (/\bvendedor\b/.test(pendingText) || /\bvendedor\b/.test(lastIntent)) role = 'vendedor'
  }

  if (!role) return null

  const detected = extractUnclassifiedPeople(args.collectedData)
  if (detected.length === 0) return null

  if (detected.length === 1) {
    return { role, personName: detected[0].nombre }
  }

  // Match determinista de frases tipo "ARMINDA es la conyuge" (orden libre)
  const explicitRoleWithName = detected.find((p) => {
    const personNorm = normalizeLooseText(String(p.nombre || ''))
    if (!personNorm) return false
    if (!normalized.includes(personNorm)) return false
    if (role === 'conyuge') return /\b(conyuge|conyugue|esposa|esposo)\b/.test(normalized)
    if (role === 'comprador') return /\bcomprador(?:es)?\b/.test(normalized)
    if (role === 'vendedor') return /\bvendedor(?:es)?\b/.test(normalized)
    return false
  })
  if (explicitRoleWithName) return { role, personName: explicitRoleWithName.nombre }

  const exactMatched = detected.filter((p) => {
    const personNorm = normalizeLooseText(String(p.nombre || ''))
    return personNorm && normalized.includes(personNorm)
  })
  if (exactMatched.length === 1) return { role, personName: exactMatched[0].nombre }

  const bestMatch = findBestDetectedPersonByMessage(args.message, detected)
  if (bestMatch) return { role, personName: bestMatch.nombre }

  return null
}

function detectNameIntentScope(args: {
  requiredMissing: string[]
  lastQuestionIntent: string | null
  pendingQuestions: string[]
}): 'comprador' | 'vendedor' | 'any' | null {
  const hasBuyerNameMissing = args.requiredMissing.some((m) =>
    matchesMissing('compradores[0].persona_fisica.nombre', m)
  )
  const hasSellerNameMissing = args.requiredMissing.some((m) =>
    matchesMissing('vendedores[0].persona_fisica.nombre', m)
  )

  const normalizedIntent = String(args.lastQuestionIntent || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const pendingText = (args.pendingQuestions || [])
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const asksNombre = /\bnombre\b/.test(pendingText)
  const asksBuyer = /\bcomprador\b/.test(pendingText) || /\bcomprador\b/.test(normalizedIntent)
  const asksSeller = /\bvendedor\b/.test(pendingText) || /\bvendedor\b/.test(normalizedIntent)

  if (asksNombre && asksBuyer) return 'comprador'
  if (asksNombre && asksSeller) return 'vendedor'
  if (hasBuyerNameMissing && hasSellerNameMissing) return 'any'
  if (hasBuyerNameMissing && (asksBuyer || asksNombre || normalizedIntent.includes('comprador'))) return 'comprador'
  if (hasSellerNameMissing && (asksSeller || asksNombre || normalizedIntent.includes('vendedor'))) return 'vendedor'
  if (hasBuyerNameMissing) return 'comprador'
  if (hasSellerNameMissing) return 'vendedor'
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

  const docReference = /\b(ine|identidad|identificacion|identificacion oficial|credencial|constancia|situacion fiscal|csf)\b/.test(
    normalized
  )
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

function resolveCreditParticipantsFromContext(
  message: string,
  collectedData: Record<string, unknown>
): Array<{ party_id: string | null; nombre: string; rol: 'acreditado' | 'coacreditado' }> | null {
  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null

  const mentionsParticipants = /\b(participa|participan|participante|participantes)\b/.test(normalized)
  const mentionsBuyer = /\bcomprador(?:es)?\b/.test(normalized)
  if (!mentionsParticipants || !mentionsBuyer) return null

  const buyerName = getPrimaryBuyerNameFromCollectedData(collectedData)
  if (!buyerName) return null

  const singleBuyerSignal =
    /\b(unico|unico participante|solo|solamente)\b/.test(normalized) ||
    /\bel participante es el comprador\b/.test(normalized) ||
    /\bparticipa el comprador\b/.test(normalized)

  if (!singleBuyerSignal) return null

  return [
    {
      party_id: null,
      nombre: buyerName,
      rol: 'acreditado',
    },
  ]
}

function getPrimaryBuyerNameFromCollectedData(collectedData: Record<string, unknown>): string | null {
  const buyers = Array.isArray((collectedData as any)?.compradores) ? ((collectedData as any).compradores as any[]) : []
  const firstBuyer = buyers[0]
  if (!firstBuyer || typeof firstBuyer !== 'object') return null

  const personaFisicaNombre = cleanName(String(firstBuyer?.persona_fisica?.nombre || ''))
  if (personaFisicaNombre) return personaFisicaNombre

  const personaMoralNombre = cleanName(String(firstBuyer?.persona_moral?.denominacion_social || ''))
  if (personaMoralNombre) return personaMoralNombre

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
  const fromPending =
    Array.isArray((collectedData as any)?._document_people_pending?.persons)
      ? ((collectedData as any)._document_people_pending.persons as any[])
      : []
  const fromUnclassified = Array.isArray((collectedData as any)?.personas_detectadas_no_clasificadas)
    ? ((collectedData as any).personas_detectadas_no_clasificadas as any[])
    : []
  const fromSpouses = Array.isArray((collectedData as any)?.conyuges_detectados)
    ? ((collectedData as any).conyuges_detectados as any[])
    : []
  const seen = new Set<string>()
  const result: Array<{ nombre: string }> = []
  for (const item of [...fromPending, ...fromUnclassified, ...fromSpouses]) {
    const nombre = cleanName(String(item?.nombre || item?.name || ''))
    const key = normalizeLooseText(nombre)
    if (!nombre || !key || seen.has(key)) continue
    seen.add(key)
    result.push({ nombre })
  }
  return result
}

function isPeopleClassificationPath(path: string): boolean {
  const canonical = canonicalizePath(String(path || ''))
  return (
    canonical === 'compradores[0].persona_fisica.nombre' ||
    canonical === 'compradores[0].tipo_persona' ||
    canonical === 'compradores[0].persona_fisica.conyuge.nombre' ||
    canonical === 'compradores[0].persona_fisica.estado_civil' ||
    canonical === 'vendedores[0].persona_fisica.nombre' ||
    canonical === 'vendedores[0].tipo_persona'
  )
}

function hasPendingPeopleClassificationTask(requiredMissing: string[], collectedData: Record<string, unknown>): boolean {
  const pendingPeople = extractUnclassifiedPeople(collectedData)
  if (pendingPeople.length === 0) return false
  return (requiredMissing || []).some((missing) => {
    const normalized = String(missing || '').trim()
    return (
      matchesMissing('compradores[]', normalized) ||
      matchesMissing('compradores[0].persona_fisica.nombre', normalized) ||
      matchesMissing('compradores[0].tipo_persona', normalized) ||
      matchesMissing('compradores[0].persona_fisica.conyuge.nombre', normalized) ||
      matchesMissing('compradores[0].persona_fisica.estado_civil', normalized) ||
      matchesMissing('vendedores[]', normalized) ||
      matchesMissing('vendedores[0].persona_fisica.nombre', normalized) ||
      matchesMissing('vendedores[0].tipo_persona', normalized)
    )
  })
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

