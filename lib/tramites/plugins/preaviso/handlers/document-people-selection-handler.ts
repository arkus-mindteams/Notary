/**
 * Handler para seleccionar comprador a partir de personas detectadas.
 */
import { HandlerResult, Command } from '../../../base/types'

export class DocumentPeopleSelectionHandler {
  static async handle(command: Command, context: any): Promise<HandlerResult> {
    const updatedContext = { ...context }
    const pending = updatedContext._document_people_pending
    const persons = Array.isArray(pending?.persons) ? pending.persons : []

    const buyerIndex = typeof command.payload?.buyerIndex === 'number' ? command.payload.buyerIndex : null
    const otherIndex = typeof command.payload?.otherIndex === 'number' ? command.payload.otherIndex : null
    const buyerName = command.payload?.buyerName || (buyerIndex !== null ? persons[buyerIndex]?.name : null)
    const otherName = command.payload?.otherName || (otherIndex !== null ? persons[otherIndex]?.name : null)
    const relationRaw = typeof command.payload?.relation === 'string' ? command.payload.relation : null
    const source = command.payload?.source || pending?.source || null

    if (!buyerName) {
      return { updatedContext, events: ['DocumentPeopleSelectionSkipped'] }
    }

    const compradores = [...(context.compradores || [])]
    if (!compradores[0]) {
      compradores[0] = {
        party_id: 'comprador_1',
        tipo_persona: 'persona_fisica',
        persona_fisica: {},
        persona_moral: undefined
      }
    }

    const buyer = compradores[0]
    const buyerFisica = buyer.persona_fisica || {}

    const relation = relationRaw ? relationRaw.toLowerCase() : null
    const isSpouse =
      source === 'acta_matrimonio' ||
      (relation && /(conyuge|c[oó]nyuge|espos[oa]|pareja)/i.test(relation))

    const currentName = buyerFisica.nombre || null
    const pickLongerName = (a?: string | null, b?: string | null) => {
      const aa = (a || '').trim()
      const bb = (b || '').trim()
      if (!aa) return bb || null
      if (!bb) return aa || null
      const aTokens = aa.split(/\s+/).length
      const bTokens = bb.split(/\s+/).length
      if (bTokens > aTokens) return bb
      if (aTokens > bTokens) return aa
      return bb.length >= aa.length ? bb : aa
    }

    const finalBuyerName = pickLongerName(currentName, buyerName)

    compradores[0] = {
      ...buyer,
      party_id: buyer.party_id || 'comprador_1',
      tipo_persona: buyer.tipo_persona || 'persona_fisica',
      persona_fisica: {
        ...buyerFisica,
        nombre: finalBuyerName,
        estado_civil: isSpouse ? 'casado' : (buyerFisica.estado_civil || null),
        conyuge: isSpouse && otherName
          ? {
              ...buyerFisica.conyuge,
              nombre: otherName,
              participa: buyerFisica.conyuge?.participa !== undefined ? buyerFisica.conyuge.participa : true
            }
          : buyerFisica.conyuge
      }
    }

    updatedContext.compradores = compradores
    updatedContext._document_people_pending = {
      ...pending,
      status: 'resolved',
      other_person: otherName ? { name: otherName, relation: relation || null } : pending?.other_person || null,
      other_relationship: relation || pending?.other_relationship || null
    }

    return { updatedContext, events: ['DocumentPeopleSelection'] }
  }
}
