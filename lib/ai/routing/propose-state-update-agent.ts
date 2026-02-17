import { randomUUID } from 'crypto'

export interface ProposeStateUpdateInput {
  message: string
  currentStep?: string
}

export interface ProposeStateUpdateResult {
  proposed_updates: Array<Record<string, unknown>>
  actions: Array<Record<string, unknown>>
  trace_id: string
  answer: string
}

export class ProposeStateUpdateAgent {
  async propose(input: ProposeStateUpdateInput): Promise<ProposeStateUpdateResult> {
    const traceId = randomUUID()
    const message = String(input.message || '')
    const normalized = normalize(message)
    const updates: Array<Record<string, unknown>> = []

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
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

