/**
 * Handler para selección de folio real
 */

import { FolioSelectionCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

export class FolioSelectionHandler {
  static async handle(
    command: FolioSelectionCommand,
    context: any
  ): Promise<HandlerResult> {
    // 1. Validar que el folio existe en candidatos (pero ser flexible si viene del documento)
    const folios = context.folios?.candidates || []
    const folioExists = folios.some((f: any) => {
      const folioValue = typeof f === 'string' ? f : f.folio
      return this.normalizeFolio(folioValue) === this.normalizeFolio(command.payload.selectedFolio)
    })

    // Si el folio no está en candidatos pero viene con información del documento, agregarlo
    if (!folioExists) {
      if (command.payload.folioInfo && folios.length > 0) {
        // El folio viene del documento pero no está en candidatos - agregarlo
        console.log(`[FolioSelectionHandler] Folio ${command.payload.selectedFolio} no estaba en candidatos, agregándolo`)
        const updatedCandidates = [...folios, {
          folio: String(command.payload.selectedFolio),
          scope: this.inferScope(command.payload.selectedFolio, context.folios),
          attrs: command.payload.folioInfo
        }]
        context.folios = {
          ...context.folios,
          candidates: updatedCandidates
        }
      } else if (folios.length > 0) {
        // Si hay candidatos pero el folio no está y no viene con info, es un error
        throw new Error(`Folio ${command.payload.selectedFolio} no encontrado en candidatos`)
      }
      // Si no hay candidatos, continuar (puede ser un folio único)
    }

    // 2. Obtener información asociada al folio
    const folioInfo = command.payload.folioInfo || 
      this.getFolioInfo(command.payload.selectedFolio, folios)

    // 3. Determinar scope si no está especificado
    const scope = command.payload.scope || this.inferScope(
      command.payload.selectedFolio,
      context.folios
    )

    // 4. Actualizar inmueble
    const updatedContext = { ...context }
    updatedContext.inmueble = {
      ...updatedContext.inmueble,
      folio_real: command.payload.selectedFolio,
      folio_real_confirmed: command.payload.confirmedByUser,
      folio_real_scope: scope,
      // Auto-popular datos asociados
      superficie: folioInfo?.superficie || updatedContext.inmueble?.superficie,
      direccion: {
        ...updatedContext.inmueble?.direccion,
        calle: folioInfo?.ubicacion || updatedContext.inmueble?.direccion?.calle
      },
      datos_catastrales: {
        ...updatedContext.inmueble?.datos_catastrales,
        unidad: folioInfo?.unidad || updatedContext.inmueble?.datos_catastrales?.unidad,
        condominio: folioInfo?.condominio || updatedContext.inmueble?.datos_catastrales?.condominio,
        lote: folioInfo?.lote || updatedContext.inmueble?.datos_catastrales?.lote,
        manzana: folioInfo?.manzana || updatedContext.inmueble?.datos_catastrales?.manzana,
        fraccionamiento: folioInfo?.fraccionamiento || updatedContext.inmueble?.datos_catastrales?.fraccionamiento
      }
    }

    // Actualizar selección de folio
    updatedContext.folios = {
      ...updatedContext.folios,
      selection: {
        selected_folio: command.payload.selectedFolio,
        selected_scope: scope,
        confirmed_by_user: command.payload.confirmedByUser
      }
    }

    // 5. Emitir eventos
    const events = ['FolioSelected', 'InmuebleUpdated']
    if (folioInfo) {
      events.push('FolioInfoAutoPopulated')
    }

    return { updatedContext, events }
  }

  private static normalizeFolio(folio: string): string {
    return String(folio || '').replace(/\D/g, '')
  }

  private static inferScope(folio: string, folios: any): 'unidades' | 'inmuebles_afectados' | 'otros' {
    if (!folios) return 'otros'
    
    // Inferir scope basado en qué lista contiene el folio
    if (folios.unidades?.includes(folio)) return 'unidades'
    if (folios.inmuebles_afectados?.includes(folio)) return 'inmuebles_afectados'
    return 'otros'
  }

  private static getFolioInfo(folio: string, candidates: any[]): any | null {
    for (const candidate of candidates) {
      const candidateFolio = typeof candidate === 'string' ? candidate : candidate.folio
      if (this.normalizeFolio(candidateFolio) === this.normalizeFolio(folio)) {
        return typeof candidate === 'object' ? candidate.attrs : null
      }
    }
    return null
  }
}
