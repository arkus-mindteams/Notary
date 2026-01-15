/**
 * Handler para acreedor de gravamen/hipoteca
 */

import { HandlerResult, Command } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

export class GravamenAcreedorHandler {
  static async handle(command: Command, context: any): Promise<HandlerResult> {
    const institution = String(command.payload?.institucion || '')
      .replace(/^acreedor(a)?\s*[:\-]?\s*/i, '')
      .trim()
    if (!ValidationService.isValidInstitution(institution)) {
      throw new Error(`Institución "${institution}" no válida`)
    }

    const updatedContext = { ...context }
    const gravamenes = [...(context.gravamenes || [])]

    if (gravamenes.length === 0) {
      gravamenes.push({
        tipo: 'hipoteca',
        institucion: institution,
        cancelacion_confirmada: null
      })
    } else {
      gravamenes[0] = {
        ...gravamenes[0],
        institucion: institution
      }
    }

    updatedContext.gravamenes = gravamenes
    return { updatedContext, events: ['GravamenAcreedorUpdated'] }
  }
}
