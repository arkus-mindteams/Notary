/**
 * Handler para titular registral (vendedor)
 */

import { TitularRegistralCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

export class TitularRegistralHandler {
  static async handle(
    command: TitularRegistralCommand,
    context: any
  ): Promise<HandlerResult> {
    // 1. Validar nombre
    if (!ValidationService.isValidName(command.payload.name)) {
      throw new Error(`Nombre "${command.payload.name}" no válido`)
    }

    // 2. Inferir tipo persona
    const tipoPersona = command.payload.inferredTipoPersona || 
      ValidationService.inferTipoPersona(command.payload.name) ||
      'persona_fisica'

    // 3. Actualizar vendedores
    const updatedContext = { ...context }
    const vendedores = [...(context.vendedores || [])]
    
    if (vendedores.length === 0) {
      vendedores.push({
        party_id: 'vendedor_1',
        tipo_persona: null,
        persona_fisica: {},
        persona_moral: undefined
      })
    }

    const vendedor = vendedores[0]
    
    // Si viene del documento y no está confirmado explícitamente, marcarlo como confirmado
    // (el documento es fuente de verdad)
    const confirmed = command.payload.confirmed !== undefined 
      ? command.payload.confirmed 
      : (command.payload.source === 'documento_inscripcion' ? true : false)

    console.log('[TitularRegistralHandler] Procesando:', {
      name: command.payload.name,
      tipoPersona,
      confirmed,
      source: command.payload.source
    })

    vendedores[0] = {
      ...vendedor,
      party_id: vendedor.party_id || 'vendedor_1',
      tipo_persona: tipoPersona,
      titular_registral_confirmado: confirmed,
      persona_fisica: tipoPersona === 'persona_fisica'
        ? {
            ...vendedor.persona_fisica,
            nombre: command.payload.name,
            rfc: command.payload.rfc || vendedor.persona_fisica?.rfc || null,
            curp: command.payload.curp || vendedor.persona_fisica?.curp || null
          }
        : undefined,
      persona_moral: tipoPersona === 'persona_moral'
        ? {
            ...vendedor.persona_moral,
            denominacion_social: command.payload.name,
            rfc: command.payload.rfc || vendedor.persona_moral?.rfc || null
          }
        : undefined
    }

    updatedContext.vendedores = vendedores

    console.log('[TitularRegistralHandler] Vendedor actualizado:', {
      nombre: vendedores[0].persona_fisica?.nombre || vendedores[0].persona_moral?.denominacion_social,
      tipo_persona: vendedores[0].tipo_persona,
      confirmado: vendedores[0].titular_registral_confirmado
    })

    return { 
      updatedContext, 
      events: ['TitularRegistralUpdated'] 
    }
  }
}
