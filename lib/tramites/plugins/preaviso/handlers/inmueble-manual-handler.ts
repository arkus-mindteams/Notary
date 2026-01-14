/**
 * Handler para captura manual de datos de inmueble/registro
 */

import { HandlerResult, InmuebleManualCommand } from '../../../base/types'

export class InmuebleManualHandler {
  static async handle(
    command: InmuebleManualCommand,
    context: any
  ): Promise<HandlerResult> {
    const updatedContext = { ...context }
    const inmueble = { ...(updatedContext.inmueble || {}) }

    const payload = command.payload || {}

    if (payload.folio_real) {
      inmueble.folio_real = String(payload.folio_real)
      inmueble.folio_real_confirmed = true
    }

    if (Array.isArray(payload.partidas) && payload.partidas.length > 0) {
      const prev = Array.isArray(inmueble.partidas) ? inmueble.partidas : []
      const merged = [...new Set([...prev, ...payload.partidas.map(String)])]
      inmueble.partidas = merged
    }

    if (payload.seccion) {
      inmueble.seccion = payload.seccion
    }

    if (payload.direccion) {
      inmueble.direccion = {
        ...(inmueble.direccion || {}),
        ...(payload.direccion || {})
      }
    }

    if (payload.datos_catastrales) {
      inmueble.datos_catastrales = {
        ...(inmueble.datos_catastrales || {}),
        ...(payload.datos_catastrales || {})
      }
    }

    updatedContext.inmueble = inmueble
    return { updatedContext, events: ['InmuebleManualUpdated'] }
  }
}
