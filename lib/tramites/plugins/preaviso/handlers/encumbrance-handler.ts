/**
 * Handler para gravámenes/hipotecas
 */

import { EncumbranceCommand, HandlerResult } from '../../../base/types'

export class EncumbranceHandler {
  static async handle(
    command: EncumbranceCommand,
    context: any
  ): Promise<HandlerResult> {
    const updatedContext = { ...context }
    
    // Actualizar inmueble
    updatedContext.inmueble = {
      ...updatedContext.inmueble,
      existe_hipoteca: command.payload.exists
    }

    // Actualizar gravámenes
    if (command.payload.exists) {
      const gravamenes = [...(context.gravamenes || [])]
      
      if (gravamenes.length === 0) {
        gravamenes.push({
          tipo: command.payload.tipo || 'hipoteca',
          cancelacion_confirmada: command.payload.cancellationConfirmed ?? null
        })
      } else {
        gravamenes[0] = {
          ...gravamenes[0],
          tipo: command.payload.tipo || gravamenes[0].tipo,
          cancelacion_confirmada: command.payload.cancellationConfirmed !== undefined 
            ? command.payload.cancellationConfirmed 
            : gravamenes[0].cancelacion_confirmada
        }
      }

      updatedContext.gravamenes = gravamenes
    } else {
      // No hay gravamen
      updatedContext.gravamenes = []
    }

    return { 
      updatedContext, 
      events: ['EncumbranceUpdated'] 
    }
  }
}
