/**
 * Handler para dejar solo al comprador como participante del crédito (acreditado).
 * Quita coacreditados cuando el usuario indica "solo el comprador".
 */

import { CreditParticipantsOnlyBuyerCommand, HandlerResult } from '../../../base/types'

export class CreditParticipantsOnlyBuyerHandler {
  static async handle(
    command: CreditParticipantsOnlyBuyerCommand,
    context: any
  ): Promise<HandlerResult> {
    const updatedContext = { ...context }
    const creditos = [...(context.creditos || [])]
    const creditIndex = command.payload.creditIndex

    if (!creditos[creditIndex]) {
      return { updatedContext, events: [] }
    }

    const nombreComprador = context?.compradores?.[0]?.persona_fisica?.nombre ||
      context?.compradores?.[0]?.persona_moral?.denominacion_social || null

    creditos[creditIndex] = {
      ...creditos[creditIndex],
      participantes: [
        { party_id: 'comprador_1', nombre: nombreComprador, rol: 'acreditado' }
      ]
    }
    updatedContext.creditos = creditos

    return {
      updatedContext,
      events: ['CreditParticipantUpdated']
    }
  }
}
