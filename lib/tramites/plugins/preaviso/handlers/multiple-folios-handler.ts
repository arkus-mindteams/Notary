/**
 * Handler para múltiples folios detectados
 * Actualiza el contexto con los folios candidatos y prepara para selección
 */

import { Command, HandlerResult } from '../../../base/types'

export class MultipleFoliosHandler {
  static async handle(
    command: Command,
    context: any
  ): Promise<HandlerResult> {
    const folios = command.payload.folios || []
    const foliosConInfo = command.payload.foliosConInfo || []
    const scope = command.payload.scope || {}

    if (folios.length === 0) {
      throw new Error('No se detectaron folios en el comando multiple_folios_detected')
    }

    // Actualizar contexto con folios candidatos
    const updatedContext = { ...context }

    // Construir estructura de candidatos con scope
    const candidates: any[] = []
    
    // Agregar folios de unidades
    if (scope.unidades && Array.isArray(scope.unidades)) {
      for (const folio of scope.unidades) {
        const folioInfo = foliosConInfo.find((f: any) => f.folio === folio)
        candidates.push({
          folio: String(folio),
          scope: 'unidades',
          attrs: folioInfo || {}
        })
      }
    }

    // Agregar folios de inmuebles afectados
    if (scope.inmuebles_afectados && Array.isArray(scope.inmuebles_afectados)) {
      for (const folio of scope.inmuebles_afectados) {
        const folioInfo = foliosConInfo.find((f: any) => f.folio === folio)
        candidates.push({
          folio: String(folio),
          scope: 'inmuebles_afectados',
          attrs: folioInfo || {}
        })
      }
    }

    // Agregar folios sin scope específico
    const allFolios = new Set([
      ...(scope.unidades || []),
      ...(scope.inmuebles_afectados || []),
      ...folios
    ])

    for (const folio of folios) {
      const folioStr = String(folio)
      // Solo agregar si no está ya en candidatos
      if (!candidates.some(c => String(c.folio) === folioStr)) {
        const folioInfo = foliosConInfo.find((f: any) => String(f.folio) === folioStr)
        candidates.push({
          folio: folioStr,
          scope: 'otros',
          attrs: folioInfo || {}
        })
      }
    }

    // Actualizar estructura de folios
    updatedContext.folios = {
      ...updatedContext.folios,
      candidates,
      selection: {
        selected_folio: null, // No hay selección aún
        selected_scope: null,
        confirmed_by_user: false
      }
    }

    // También actualizar foliosRealesUnidades e inmuebles_afectados para compatibilidad
    if (!updatedContext.foliosRealesUnidades) {
      updatedContext.foliosRealesUnidades = scope.unidades || []
    }
    if (!updatedContext.foliosRealesInmueblesAfectados) {
      updatedContext.foliosRealesInmueblesAfectados = scope.inmuebles_afectados || []
    }

    return {
      updatedContext,
      events: ['MultipleFoliosDetected']
    }
  }
}
