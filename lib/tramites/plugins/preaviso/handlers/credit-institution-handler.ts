/**
 * Handler para institución de crédito
 */

import { CreditInstitutionCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

export class CreditInstitutionHandler {
  static async handle(
    command: CreditInstitutionCommand,
    context: any
  ): Promise<HandlerResult> {
    // 1. Validar institución
    if (!ValidationService.isValidInstitution(command.payload.institution)) {
      throw new Error(`Institución "${command.payload.institution}" no válida`)
    }

    // 2. Actualizar créditos
    const updatedContext = { ...context }
    const creditos = [...(context.creditos || [])]
    const creditIndex = command.payload.creditIndex
    
    if (!creditos[creditIndex]) {
      creditos[creditIndex] = {
        institucion: null,
        monto: null,
        tipo: null,
        participantes: []
      }
    }

    creditos[creditIndex] = {
      ...creditos[creditIndex],
      institucion: command.payload.institution
    }

    updatedContext.creditos = creditos

    return { 
      updatedContext, 
      events: ['CreditInstitutionUpdated'] 
    }
  }
}
