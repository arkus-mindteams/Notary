/**
 * Handler para estado civil del comprador
 */

import { EstadoCivilCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

export class EstadoCivilHandler {
  static async handle(
    command: EstadoCivilCommand,
    context: any
  ): Promise<HandlerResult> {
    // 1. Validar
    const validation = ValidationService.validateEstadoCivil(command.payload.estadoCivil)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // 2. Actualizar contexto
    const updatedContext = { ...context }
    const buyerIndex = command.payload.buyerIndex
    const compradores = [...(context.compradores || [])]
    
    if (!compradores[buyerIndex]) {
      compradores[buyerIndex] = {
        party_id: null,
        tipo_persona: null,
        persona_fisica: {}
      }
    }

    const buyer = compradores[buyerIndex]
    
    compradores[buyerIndex] = {
      ...buyer,
      tipo_persona: buyer.tipo_persona || 'persona_fisica',
      persona_fisica: {
        ...buyer.persona_fisica,
        estado_civil: command.payload.estadoCivil
      }
    }

    updatedContext.compradores = compradores

    // 3. Emitir eventos
    const events = ['BuyerEstadoCivilUpdated']

    // Si es casado, emitir evento adicional
    if (command.payload.estadoCivil === 'casado') {
      events.push('BuyerCasadoDetected')
    }

    return { updatedContext, events }
  }
}
