/**
 * Handler para nombre del comprador
 */

import { BuyerNameCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

import { ConyugeService } from '../../../shared/services/conyuge-service'

export class BuyerNameHandler {
  static async handle(
    command: BuyerNameCommand,
    context: any
  ): Promise<HandlerResult> {
    // 1. Validar nombre
    if (!ValidationService.isValidName(command.payload.name)) {
      throw new Error(`Nombre "${command.payload.name}" no válido`)
    }

    // 2. Verificar que no sea el cónyuge del comprador existente
    const buyerIndex = command.payload.buyerIndex
    const existingBuyer = context.compradores?.[buyerIndex]
    const existingBuyerNombre = existingBuyer?.persona_fisica?.nombre
    const existingBuyerCasado = existingBuyer?.persona_fisica?.estado_civil === 'casado'
    const conyugeNombre = existingBuyer?.persona_fisica?.conyuge?.nombre
    
    // Si hay un comprador casado y el nombre no coincide con el comprador, podría ser el cónyuge
    if (existingBuyerCasado && existingBuyerNombre && !ConyugeService.namesMatch(command.payload.name, existingBuyerNombre)) {
      // Si el nombre coincide con el cónyuge, no debería procesarse como comprador
      if (conyugeNombre && ConyugeService.namesMatch(command.payload.name, conyugeNombre)) {
        throw new Error(`El nombre "${command.payload.name}" corresponde al cónyuge, no al comprador`)
      }
      // Si no hay cónyuge aún pero el comprador está casado, probablemente es el cónyuge
      if (!conyugeNombre) {
        console.warn(`[BuyerNameHandler] Advertencia: El comprador está casado y el nombre "${command.payload.name}" no coincide. Podría ser el cónyuge.`)
        // No lanzar error, pero registrar advertencia
      }
    }

    // 3. Inferir tipo persona si no está especificado
    const tipoPersona = command.payload.inferredTipoPersona || 
      ValidationService.inferTipoPersona(command.payload.name) ||
      'persona_fisica' // Default

    // 4. Actualizar compradores
    const updatedContext = { ...context }
    const compradores = [...(context.compradores || [])]
    
    if (!compradores[buyerIndex]) {
      compradores[buyerIndex] = {
        party_id: buyerIndex === 0 ? 'comprador_1' : null,
        tipo_persona: null,
        persona_fisica: {},
        persona_moral: undefined
      }
    }

    const buyer = compradores[buyerIndex]
    
    compradores[buyerIndex] = {
      ...buyer,
      party_id: buyer.party_id || (buyerIndex === 0 ? 'comprador_1' : null),
      tipo_persona: tipoPersona,
      persona_fisica: tipoPersona === 'persona_fisica'
        ? {
            ...buyer.persona_fisica,
            nombre: command.payload.name,
            rfc: command.payload.rfc || buyer.persona_fisica?.rfc || null,
            curp: command.payload.curp || buyer.persona_fisica?.curp || null
          }
        : undefined,
      persona_moral: tipoPersona === 'persona_moral'
        ? {
            ...buyer.persona_moral,
            denominacion_social: command.payload.name
          }
        : undefined
    }

    updatedContext.compradores = compradores

    return { 
      updatedContext, 
      events: ['BuyerNameUpdated'] 
    }
  }
}
