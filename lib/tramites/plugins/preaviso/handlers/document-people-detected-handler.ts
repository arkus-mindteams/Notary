/**
 * Handler para registrar personas detectadas en documentos (sin asumir comprador).
 */
import { HandlerResult, Command } from '../../../base/types'
import { ConyugeService } from '../../../shared/services/conyuge-service'

export class DocumentPeopleDetectedHandler {
  static async handle(command: Command, context: any): Promise<HandlerResult> {
    const updatedContext = { ...context }
    const payloadPersons = Array.isArray(command.payload?.persons)
      ? command.payload.persons
      : []

    if (payloadPersons.length === 0) {
      return { updatedContext, events: ['DocumentPeopleDetectedSkipped'] }
    }

    const pending = updatedContext._document_people_pending || {
      status: 'pending',
      source: command.payload?.source || null,
      persons: []
    }

    const existing = Array.isArray(pending.persons) ? pending.persons : []
    const seen = new Map<string, any>()
    const norm = (n: any) => ConyugeService.normalizeName(String(n || ''))

    for (const p of existing) {
      if (!p?.name) continue
      seen.set(norm(p.name), p)
    }

    for (const p of payloadPersons) {
      if (!p?.name) continue
      const key = norm(p.name)
      if (!key) continue
      const prev = seen.get(key) || {}
      seen.set(key, {
        ...prev,
        ...p,
        name: p.name,
        rfc: p.rfc ?? prev.rfc ?? null,
        curp: p.curp ?? prev.curp ?? null,
        source: p.source || command.payload?.source || prev.source || null
      })
    }

    updatedContext._document_people_pending = {
      ...pending,
      status: 'pending',
      source: command.payload?.source || pending.source || null,
      persons: Array.from(seen.values())
    }

    return { updatedContext, events: ['DocumentPeopleDetected'] }
  }
}
