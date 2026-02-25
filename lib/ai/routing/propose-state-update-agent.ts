import { randomUUID } from 'crypto'
import { z } from 'zod'

const STATE_UPDATE_DEBUG = process.env.STATE_UPDATE_DEBUG === '1'

export interface ProposeStateUpdateInput {
  message: string
  currentStep?: string
  lastQuestionIntent?: string | null
  detectedPeople?: string[]
  recentMessages?: Array<{ role: string; content: string }>
}

export interface ProposeStateUpdateResult {
  proposed_updates: Array<Record<string, unknown>>
  actions: Array<Record<string, unknown>>
  trace_id: string
  answer: string
}

const llmProposalSchema = z.object({
  answer: z.string().trim().optional(),
  proposed_updates: z.array(z.record(z.unknown())).optional(),
  actions: z.array(z.record(z.unknown())).optional(),
})

const replyMatchSchema = z.object({
  is_valid_reply: z.boolean(),
  matched_turn_index: z.number().int().min(1).max(5).nullable().optional(),
  matched_intent: z.string().trim().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

class OpenAIReplyMatcherClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_STATE_UPDATE_MODEL || 'gpt-4o-mini'
  }

  async match(input: ProposeStateUpdateInput): Promise<{
    isValid: boolean
    matchedTurnIndex: number | null
    matchedIntent: string | null
    confidence: number
  } | null> {
    if (!this.apiKey) return null
    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent][matcher] start', {
        has_last_intent: Boolean(input.lastQuestionIntent),
        recent_messages_count: Array.isArray(input.recentMessages) ? input.recentMessages.length : 0,
        message_preview: String(input.message || '').slice(0, 120),
      })
    }

    const sanitizedMessage = stripCollectionHints(String(input.message || ''))
    const recent = Array.isArray(input.recentMessages)
      ? input.recentMessages
          .slice(-5)
          .map((m, idx) => ({
            idx: idx + 1,
            role: String(m?.role || ''),
            content: stripCollectionHints(String(m?.content || '')).slice(0, 320),
          }))
      : []
    const lastAssistantQuestion = getLastAssistantQuestion(input.recentMessages)

    const systemPrompt =
      'Evalua si el mensaje del usuario es una respuesta valida al intent pendiente o a una de las ultimas 5 interacciones. ' +
      'Responde SOLO JSON con: is_valid_reply, matched_turn_index, matched_intent, confidence.'

    const userPrompt = JSON.stringify({
      message: sanitizedMessage,
      pending_intent: String(input.lastQuestionIntent || ''),
      current_step: String(input.currentStep || ''),
      last_assistant_question: lastAssistantQuestion,
      recent_messages: recent,
      allowed_intents: ['comprador', 'vendedor', 'folio_real', 'rfc', 'curp', 'estado_civil', 'desconocido'],
      rules: [
        'Si el mensaje no responde claramente a algo pendiente, is_valid_reply=false.',
        'Si responde, matched_intent debe indicar el dato principal que intenta capturar.',
        'matched_turn_index refiere al item idx de recent_messages (1..5).',
        'Si la ultima pregunta del asistente solicita un dato puntual y el usuario responde con ese dato, marcala valida.',
      ],
    })

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...(this.model.includes('o1') || this.model.includes('o3') || this.model.includes('gpt-5')
        ? {}
        : {
            response_format: { type: 'json_object' },
            temperature: 0,
          }),
      ...(this.model.includes('gpt-4') || this.model.includes('gpt-5') || this.model.includes('o1') || this.model.includes('o3')
        ? { max_completion_tokens: 220 }
        : { max_tokens: 220 }),
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      if (STATE_UPDATE_DEBUG) {
        console.log('[ProposeStateUpdateAgent][matcher] non_ok_response', {
          status: resp.status,
        })
      }
      return null
    }

    const data = await resp.json().catch(() => ({}))
    let content = extractMessageContent(data?.choices?.[0]?.message).trim()
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) content = match[1]
    }
    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent][matcher] raw_response_preview', {
        content_preview: content.slice(0, 280),
      })
    }
    const parsed = replyMatchSchema.safeParse(JSON.parse(content || '{}'))
    if (!parsed.success) {
      if (STATE_UPDATE_DEBUG) {
        console.log('[ProposeStateUpdateAgent][matcher] parse_failed', {
          content_preview: content.slice(0, 240),
        })
      }
      return null
    }
    const p = parsed.data
    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent][matcher] result', {
        is_valid_reply: p.is_valid_reply,
        matched_turn_index: p.matched_turn_index ?? null,
        matched_intent: p.matched_intent ?? null,
        confidence: p.confidence ?? null,
      })
    }
    return {
      isValid: p.is_valid_reply === true,
      matchedTurnIndex: typeof p.matched_turn_index === 'number' ? p.matched_turn_index : null,
      matchedIntent: p.matched_intent ? String(p.matched_intent) : null,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    }
  }
}

class OpenAIStateUpdateFallbackClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_STATE_UPDATE_MODEL || 'gpt-4o-mini'
  }

  async propose(input: ProposeStateUpdateInput): Promise<ProposeStateUpdateResult | null> {
    if (!this.apiKey) return null
    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent][fallback] start', {
        has_last_intent: Boolean(input.lastQuestionIntent),
        recent_messages_count: Array.isArray(input.recentMessages) ? input.recentMessages.length : 0,
        message_preview: String(input.message || '').slice(0, 120),
      })
    }

    const systemPrompt =
      'Eres un asistente de actualizacion de estado para un tramite notarial. ' +
      'Responde SOLO JSON valido con: answer, proposed_updates, actions. ' +
      'Si el usuario da un dato corto (ej. solo nombre), usa lastQuestionIntent/currentStep para inferir el campo. ' +
      'Cada update debe ser {op:"set", path:string, value:any, reason:string}. ' +
      'Respeta el intent pendiente: no propongas updates de otro intent si no hay evidencia explicita en el mensaje del usuario.'

    const sanitizedMessage = stripCollectionHints(String(input.message || ''))
    const lastAssistantQuestion = getLastAssistantQuestion(input.recentMessages)
    const userPrompt = JSON.stringify({
      message: sanitizedMessage,
      currentStep: input.currentStep || null,
      lastQuestionIntent: input.lastQuestionIntent || null,
      lastAssistantQuestion,
      detectedPeople: Array.isArray(input.detectedPeople) ? input.detectedPeople : [],
      recentMessages: Array.isArray(input.recentMessages)
        ? input.recentMessages
            .slice(-5)
          .map((m) => ({
              role: String(m?.role || ''),
              content: stripCollectionHints(String(m?.content || '')).slice(0, 300),
            }))
        : [],
      allowedPathsExamples: [
        'compradores[0].persona_fisica.nombre',
        'compradores[0].persona_fisica.rfc',
        'compradores[0].persona_fisica.curp',
        'vendedores[0].persona_fisica.nombre',
        'inmueble.folio_real',
      ],
      rules: [
        'No inventes datos no mencionados por el usuario.',
        'No cambies mas de 3 campos por mensaje.',
        'Si la ultima pregunta del asistente pidio un campo y el usuario responde con un valor plausible, propon el set directo.',
        'Si no hay update seguro, proposed_updates debe ser [] y pide aclaracion.',
      ],
    })

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...(this.model.includes('o1') || this.model.includes('o3') || this.model.includes('gpt-5')
        ? {}
        : {
            response_format: { type: 'json_object' },
            temperature: 0,
          }),
      ...(this.model.includes('gpt-4') || this.model.includes('gpt-5') || this.model.includes('o1') || this.model.includes('o3')
        ? { max_completion_tokens: 400 }
        : { max_tokens: 400 }),
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      if (STATE_UPDATE_DEBUG) {
        console.log('[ProposeStateUpdateAgent][fallback] non_ok_response', {
          status: resp.status,
        })
      }
      return null
    }

    const data = await resp.json().catch(() => ({}))
    let content = extractMessageContent(data?.choices?.[0]?.message).trim()
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) content = match[1]
    }
    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent][fallback] raw_response_preview', {
        content_preview: content.slice(0, 280),
      })
    }

    const parsedJson = JSON.parse(content || '{}')
    const parsed = llmProposalSchema.safeParse(parsedJson)
    if (!parsed.success) {
      if (STATE_UPDATE_DEBUG) {
        console.log('[ProposeStateUpdateAgent][fallback] parse_failed', {
          content_preview: content.slice(0, 240),
        })
      }
      return null
    }

    const proposedUpdates = normalizeProposedUpdates(
      Array.isArray(parsed.data.proposed_updates) ? parsed.data.proposed_updates : []
    )
    const constrainedUpdates = constrainUpdatesToPendingIntent({
      input,
      message: sanitizedMessage,
      updates: proposedUpdates,
    })
    const actions = Array.isArray(parsed.data.actions) ? parsed.data.actions : []
    const answer = String(parsed.data.answer || '').trim()
    const traceId = randomUUID()

    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent][fallback] normalized', {
        proposed_updates_count: constrainedUpdates.length,
        actions_count: actions.length,
      })
    }

    if (constrainedUpdates.length === 0) return null

    return {
      trace_id: traceId,
      proposed_updates: constrainedUpdates,
      actions:
        actions.length > 0
          ? actions
          : [
              {
                type: 'review_proposed_updates',
                requires_domain_commit: true,
              },
            ],
      answer: answer || 'Genere propuestas de cambio con contexto. Revisa y confirma para aplicar en Domain Service.',
    }
  }
}

export class ProposeStateUpdateAgent {
  private readonly replyMatcher = new OpenAIReplyMatcherClient()
  private readonly fallbackClient = new OpenAIStateUpdateFallbackClient()

  async propose(input: ProposeStateUpdateInput): Promise<ProposeStateUpdateResult> {
    const traceId = randomUUID()
    const message = stripCollectionHints(String(input.message || ''))
    const normalized = normalize(message)
    const updates: Array<Record<string, unknown>> = []
    if (STATE_UPDATE_DEBUG) {
      console.log('[ProposeStateUpdateAgent] propose_start', {
        current_step: input.currentStep || null,
        last_question_intent: input.lastQuestionIntent || null,
        message_preview: String(input.message || '').slice(0, 120),
      })
    }

    const rfcMatch = normalized.match(/\b(?:mi\s+)?rfc\s*(?:es|:)?\s*([a-z0-9]{10,13})\b/i)
    if (rfcMatch?.[1]) {
      updates.push({
        op: 'set',
        path: 'compradores[0].persona_fisica.rfc',
        value: rfcMatch[1].toUpperCase(),
        reason: 'dato proporcionado por usuario',
      })
    }

    const curpMatch = normalized.match(/\b(?:mi\s+)?curp\s*(?:es|:)?\s*([a-z0-9]{18})\b/i)
    if (curpMatch?.[1]) {
      updates.push({
        op: 'set',
        path: 'compradores[0].persona_fisica.curp',
        value: curpMatch[1].toUpperCase(),
        reason: 'dato proporcionado por usuario',
      })
    }

    const nameMatch = message.match(/\bmi\s+nombre\s+es\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.'-]{4,})/i)
    if (nameMatch?.[1]) {
      updates.push({
        op: 'set',
        path: 'compradores[0].persona_fisica.nombre',
        value: nameMatch[1].trim(),
        reason: 'dato proporcionado por usuario',
      })
    }

    const folioMatch = normalized.match(/\bfolio(?:\s+real)?\s*(?:es|:)?\s*([a-z0-9-]{4,})\b/i)
    if (folioMatch?.[1]) {
      updates.push({
        op: 'set',
        path: 'inmueble.folio_real',
        value: folioMatch[1].toUpperCase(),
        reason: 'dato proporcionado por usuario',
      })
    }

    const actions: Array<Record<string, unknown>> = []
    if (updates.length === 0) {
      const matchedUpdate = await this.tryMatchedReplyUpdate({
        ...input,
        message,
      })
      if (matchedUpdate) {
        if (STATE_UPDATE_DEBUG) {
          console.log('[ProposeStateUpdateAgent] matched_update_applied', {
            path: String((matchedUpdate as any).path || ''),
          })
        }
        return {
          trace_id: randomUUID(),
          proposed_updates: [matchedUpdate],
          actions: [
            {
              type: 'review_proposed_updates',
              requires_domain_commit: true,
            },
          ],
          answer: 'Genere propuesta de cambio con base en el intent pendiente y el historial reciente. Revisa y confirma para aplicar.',
        }
      }
      try {
        const llmFallback = await this.fallbackClient.propose({
          ...input,
          message,
        })
        if (llmFallback && llmFallback.proposed_updates.length > 0) {
          if (STATE_UPDATE_DEBUG) {
            console.log('[ProposeStateUpdateAgent] llm_fallback_applied', {
              proposed_updates_count: llmFallback.proposed_updates.length,
            })
          }
          return llmFallback
        }
      } catch {
        // Fall through to deterministic missing-field response.
      }
      if (STATE_UPDATE_DEBUG) {
        console.log('[ProposeStateUpdateAgent] no_update_detected', {
          current_step: input.currentStep || 'unknown',
        })
      }
      actions.push({
        type: 'request_missing_field',
        field: input.currentStep || 'unknown',
        reason: 'No se detectaron cambios estructurados claros para aplicar como propuesta',
      })
    } else {
      actions.push({
        type: 'review_proposed_updates',
        requires_domain_commit: true,
      })
    }

    return {
      trace_id: traceId,
      proposed_updates: updates,
      actions,
      answer:
        updates.length > 0
          ? 'Genere propuestas de cambio. Revisa y confirma para aplicar en Domain Service.'
          : 'No pude inferir un cambio exacto. Indica el campo y valor para proponer una actualizacion.',
    }
  }

  private async tryMatchedReplyUpdate(input: ProposeStateUpdateInput): Promise<Record<string, unknown> | null> {
    const nameOnlyUpdate = inferNameOnlyUpdate(input)
    if (nameOnlyUpdate) {
      if (STATE_UPDATE_DEBUG) {
        console.log('[ProposeStateUpdateAgent] name_only_update_applied', {
          path: String((nameOnlyUpdate as any)?.path || ''),
          value_preview: String((nameOnlyUpdate as any)?.value || '').slice(0, 120),
        })
      }
      return nameOnlyUpdate
    }

    try {
      const match = await this.replyMatcher.match(input)
      if (!match || !match.isValid || match.confidence < 0.65) return null
      const pendingIntent = normalizeIntentLabel(input.lastQuestionIntent || '')
      const matchedIntent = normalizeIntentLabel(match.matchedIntent || '')
      const shortReply = String(input.message || '').trim().length <= 40
      const intent =
        pendingIntent && shortReply && matchedIntent && matchedIntent !== pendingIntent
          ? pendingIntent
          : normalizeIntentLabel(match.matchedIntent || input.lastQuestionIntent || '')
      const update = inferUpdateFromIntent(input.message, intent)
      if (!update) return null
      return {
        ...update,
        reason: `${String(update.reason || 'dato inferido')}; matched_intent=${intent}; turn_index=${match.matchedTurnIndex ?? 'na'}; confidence=${match.confidence.toFixed(2)}`,
      }
    } catch {
      return null
    }
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function getLastAssistantQuestion(
  recentMessages?: Array<{ role: string; content: string }>
): string | null {
  if (!Array.isArray(recentMessages) || recentMessages.length === 0) return null
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const m = recentMessages[i]
    if (String(m?.role || '').toLowerCase() !== 'assistant') continue
    const content = stripCollectionHints(String(m?.content || '')).trim()
    if (!content) continue
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    for (let j = lines.length - 1; j >= 0; j -= 1) {
      const line = lines[j]
      if (line.includes('?')) return line.slice(0, 240)
    }
    return lines[lines.length - 1].slice(0, 240) || null
  }
  return null
}

function extractMessageContent(message: any): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((part: any) => {
        if (typeof part === 'string') return part
        if (part && typeof part.text === 'string') return part.text
        if (part && typeof part.content === 'string') return part.content
        return ''
      })
      .filter(Boolean)
    return parts.join('\n').trim()
  }
  if (typeof message.refusal === 'string') return message.refusal
  return ''
}

function normalizeProposedUpdates(raw: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const item of raw) {
    const op = String(item?.op || '').trim().toLowerCase()
    const path = String(item?.path || '').trim()
    const value = item?.value
    if (op !== 'set') continue
    if (!path) continue
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && !value.trim()) continue
    out.push({
      op: 'set',
      path,
      value,
      reason: String(item?.reason || 'dato inferido con contexto').trim(),
    })
    if (out.length >= 3) break
  }
  return out
}

function inferNameOnlyUpdate(input: ProposeStateUpdateInput): Record<string, unknown> | null {
  const rawMessage = String(input.message || '').trim()
  if (!rawMessage) return null

  const compactMessage = rawMessage
    .replace(/\s+/g, ' ')
    .trim()
  if (compactMessage.length < 6) return null

  const normalizedIntent = String(input.lastQuestionIntent || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  const hasDigits = /\d/.test(compactMessage)
  const looksLikeFolioOrCode =
    /^\d{5,}$/.test(compactMessage.replace(/\s+/g, '')) ||
    /\bfolio\b/i.test(compactMessage) ||
    /\b(rfc|curp)\b/i.test(compactMessage)
  if (hasDigits || looksLikeFolioOrCode) return null

  const tokens = compactMessage.split(' ').filter(Boolean)
  if (tokens.length < 2 || tokens.length > 6) return null
  if (isRoleAliasInsteadOfName(compactMessage)) return null
  const letters = (compactMessage.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length
  if (letters < 6) return null

  let path: string | null = null
  if (normalizedIntent.includes('comprador')) {
    path = 'compradores[0].persona_fisica.nombre'
  } else if (normalizedIntent.includes('vendedor')) {
    path = 'vendedores[0].persona_fisica.nombre'
  }
  if (!path) return null

  return {
    op: 'set',
    path,
    value: compactMessage,
    reason: 'Nombre inferido de respuesta breve segun ultimo intent de captura',
  }
}

function normalizeIntentLabel(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function inferUpdateFromIntent(message: string, intent: string): Record<string, unknown> | null {
  const raw = String(message || '').trim()
  if (!raw) return null
  const normalized = normalize(raw)

  if (intent.includes('folio')) {
    const explicit = normalized.match(/\bfolio(?:\s+real)?\s*(?:es|:)?\s*([a-z0-9-]{4,})\b/i)
    const compact = raw.replace(/\s+/g, '')
    const candidate = explicit?.[1] || (/^\d{5,10}$/.test(compact) ? compact : null)
    if (!candidate) return null
    return {
      op: 'set',
      path: 'inmueble.folio_real',
      value: String(candidate).toUpperCase(),
      reason: 'Respuesta validada para folio real',
    }
  }

  if (intent.includes('rfc')) {
    const m = normalized.match(/\b([a-z0-9]{12,13})\b/i)
    if (!m?.[1]) return null
    return {
      op: 'set',
      path: 'compradores[0].persona_fisica.rfc',
      value: String(m[1]).toUpperCase(),
      reason: 'Respuesta validada para RFC del comprador',
    }
  }

  if (intent.includes('curp')) {
    const m = normalized.match(/\b([a-z0-9]{18})\b/i)
    if (!m?.[1]) return null
    return {
      op: 'set',
      path: 'compradores[0].persona_fisica.curp',
      value: String(m[1]).toUpperCase(),
      reason: 'Respuesta validada para CURP del comprador',
    }
  }

  if (intent.includes('vendedor') || intent.includes('comprador')) {
    const aliasBased = inferSpouseAliasPartyUpdate(raw, intent)
    if (aliasBased) return aliasBased
    const tmp = inferNameOnlyUpdate({
      message: raw,
      lastQuestionIntent: intent,
    })
    return tmp
  }

  if (intent.includes('estado_civil') || intent.includes('estado civil')) {
    const v = normalized
    const mapped =
      /\bcasad/.test(v) ? 'casado' :
      /\bsolter/.test(v) ? 'soltero' :
      /\bdivorciad/.test(v) ? 'divorciado' :
      /\bviud/.test(v) ? 'viudo' :
      null
    if (!mapped) return null
    return {
      op: 'set',
      path: 'compradores[0].persona_fisica.estado_civil',
      value: mapped,
      reason: 'Respuesta validada para estado civil del comprador',
    }
  }

  return null
}

function constrainUpdatesToPendingIntent(args: {
  input: ProposeStateUpdateInput
  message: string
  updates: Array<Record<string, unknown>>
}): Array<Record<string, unknown>> {
  const pendingIntent = normalizeIntentLabel(args.input.lastQuestionIntent || '')
  if (!pendingIntent) return args.updates

  const normalizedMessage = normalize(String(args.message || ''))
  const hasDigits = /\d/.test(normalizedMessage)

  return args.updates.filter((u) => {
    const path = String(u?.path || '').trim()
    const value = String((u as any)?.value || '').trim()

    if (pendingIntent.includes('comprador')) {
      const allowedBuyerPath =
        path.startsWith('compradores[') &&
        (
          path.endsWith('.persona_fisica.nombre') ||
          path.endsWith('.persona_fisica.rfc') ||
          path.endsWith('.persona_fisica.curp') ||
          path.endsWith('.persona_fisica.estado_civil')
        )
      if (!allowedBuyerPath) return false
      if (!hasDigits && (path.endsWith('.persona_fisica.rfc') || path.endsWith('.persona_fisica.curp'))) return false
      return true
    }

    if (pendingIntent.includes('vendedor')) {
      const allowedSellerPath = path.startsWith('vendedores[') && path.endsWith('.persona_fisica.nombre')
      if (!allowedSellerPath) return false
      if (isRoleAliasInsteadOfName(value)) return false
      return true
    }

    if (pendingIntent.includes('folio')) {
      return path === 'inmueble.folio_real'
    }

    return true
  })
}

function inferSpouseAliasPartyUpdate(
  rawMessage: string,
  intent: string
): Record<string, unknown> | null {
  const normalizedMessage = normalize(rawMessage)
  const normalizedIntent = normalizeIntentLabel(intent)
  const isBuyer = normalizedIntent.includes('comprador')
  const isSeller = normalizedIntent.includes('vendedor')
  if (!isBuyer && !isSeller) return null

  const mentionsSpouseAlias =
    /\b(esposo|esposa|conyuge)\b/.test(normalizedMessage) &&
    /\b(comprador|compradora|vendedor|vendedora)\b/.test(normalizedMessage)
  if (!mentionsSpouseAlias) return null

  const canonicalAlias =
    /\b(esposa)\b/.test(normalizedMessage)
      ? 'la esposa'
      : /\b(esposo)\b/.test(normalizedMessage)
        ? 'el esposo'
        : 'el conyuge'

  return {
    op: 'set',
    path: isBuyer ? 'compradores[0].persona_fisica.nombre' : 'vendedores[0].persona_fisica.nombre',
    value: canonicalAlias,
    reason: 'Referencia de rol (esposo/esposa/conyuge) para resolver con personas detectadas del documento',
  }
}



function isRoleAliasInsteadOfName(value: string): boolean {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return false
  if (/^(el|la)\s+(esposo|esposa|conyuge|comprador|compradora|vendedor|vendedora)$/.test(normalized)) return true
  if (/^(esposo|esposa|conyuge|comprador|compradora|vendedor|vendedora)$/.test(normalized)) return true
  if (/^(el|la)\s+(esposo|esposa|conyuge)\s+es\s+(el|la)\s+(comprador|compradora|vendedor|vendedora)$/.test(normalized)) return true
  if (/^(el|la)\s+(comprador|compradora|vendedor|vendedora)\s+es\s+(el|la)\s+(esposo|esposa|conyuge)$/.test(normalized)) return true
  if (/\b(esposo|esposa|conyuge)\b/.test(normalized) && /\b(comprador|compradora|vendedor|vendedora)\b/.test(normalized)) return true
  return false
}

