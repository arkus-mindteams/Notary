/**
 * Handler para método de pago (contado/crédito)
 * 
 * IMPORTANTE: En el sistema v1.4, la forma de pago se determina por:
 * - creditos === undefined → no confirmado
 * - creditos === [] → contado confirmado
 * - creditos === [...] → crédito confirmado
 */

import { PaymentMethodCommand, HandlerResult } from '../../../base/types'

export class PaymentMethodHandler {
  static async handle(
    command: PaymentMethodCommand,
    context: any
  ): Promise<HandlerResult> {
    const updatedContext = { ...context }
    
    if (command.payload.method === 'contado') {
      // Contado: creditos = []
      updatedContext.creditos = []
    } else if (command.payload.method === 'credito') {
      // Crédito: crear placeholder si no existe
      if (!updatedContext.creditos || updatedContext.creditos.length === 0) {
        updatedContext.creditos = [{
          credito_id: null,
          institucion: null,
          monto: null,
          participantes: [],
          tipo_credito: null
        }]
      }
      // Si ya existe, mantenerlo (no sobrescribir)
    }

    return { 
      updatedContext, 
      events: ['PaymentMethodUpdated'] 
    }
  }
}
