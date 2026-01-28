/**
 * Handler para corregir comprador/cónyuge (swap o asignación explícita).
 */
import { HandlerResult, Command } from '../../../base/types'

export class BuyerConyugeSwapHandler {
  static async handle(command: Command, context: any): Promise<HandlerResult> {
    const updatedContext = { ...context }
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
    const conyuge = buyerFisica.conyuge || { nombre: null, participa: true }

    const swap = command.payload?.swap === true
    const compradorNombre = command.payload?.compradorNombre
    const conyugeNombre = command.payload?.conyugeNombre

    let nextBuyerNombre = buyerFisica.nombre || null
    let nextConyugeNombre = conyuge.nombre || null

    if (swap && nextBuyerNombre && nextConyugeNombre) {
      const tmp = nextBuyerNombre
      nextBuyerNombre = nextConyugeNombre
      nextConyugeNombre = tmp
    }

    if (typeof compradorNombre === 'string' && compradorNombre.trim()) {
      nextBuyerNombre = compradorNombre.trim()
    }
    if (typeof conyugeNombre === 'string' && conyugeNombre.trim()) {
      nextConyugeNombre = conyugeNombre.trim()
    }

    compradores[0] = {
      ...buyer,
      party_id: buyer.party_id || 'comprador_1',
      tipo_persona: buyer.tipo_persona || 'persona_fisica',
      persona_fisica: {
        ...buyerFisica,
        nombre: nextBuyerNombre,
        estado_civil: buyerFisica.estado_civil || 'casado',
        conyuge: {
          ...conyuge,
          nombre: nextConyugeNombre,
          participa: conyuge.participa !== undefined ? conyuge.participa : true
        }
      }
    }

    updatedContext.compradores = compradores
    return { updatedContext, events: ['BuyerConyugeSwap'] }
  }
}
