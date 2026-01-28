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
    const existingExists = updatedContext?.inmueble?.existe_hipoteca
    const inferredExists =
      command.payload.exists !== undefined
        ? command.payload.exists
        : (command.payload.cancellationConfirmed !== undefined ? true : existingExists)

    // Actualizar inmueble
    updatedContext.inmueble = {
      ...updatedContext.inmueble,
      existe_hipoteca: inferredExists
    }

    // Actualizar gravámenes
    if (inferredExists) {
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
