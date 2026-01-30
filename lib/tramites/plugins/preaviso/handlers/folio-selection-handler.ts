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
    const folios = context.folios?.candidates || []
    const { selectedFolio, confirmedByUser, intent } = command.payload

    // 1. Normalizar y buscar candidato
    const targetDigits = this.normalizeFolio(selectedFolio)
    const matchIndex = folios.findIndex((f: any) => {
      const val = typeof f === 'string' ? f : f.folio
      return this.normalizeFolio(val) === targetDigits
    })

    // Si no está en candidatos pero la lista existe, advierto (pero permito si es corrección manual)
    if (matchIndex === -1 && folios.length > 0) {
      console.warn(`[FolioSelectionHandler] Folio ${selectedFolio} seleccionado no encontrado en candidatos.`)
    }

    // 2. Recuperar info del candidato
    let folioInfo: any = command.payload.folioInfo || null
    if (!folioInfo && matchIndex !== -1) {
      const match = folios[matchIndex]
      if (typeof match === 'object') {
        folioInfo = match.attrs || match // Adaptar según la estructura guardada
      }
    }

    // 3. Determinar confirmación basada en INTENT
    // SELECT o CONFIRM -> true
    // FOCUS -> false
    // Fallback: usar confirmedByUser si intent no viene (compatibilidad)
    const isConfirmed = (intent === 'SELECT' || intent === 'CONFIRM') || (confirmedByUser === true && intent !== 'FOCUS')

    // 4. Determinar scope
    const scope = command.payload.scope || this.inferScope(selectedFolio, context.folios)

    // 5. Actualizar contexto
    const updatedContext = { ...context }

    updatedContext.folios = {
      ...updatedContext.folios,
      selection: {
        selected_folio: selectedFolio,
        selected_scope: scope,
        confirmed_by_user: isConfirmed
      }
    }

    // Si confirmé, actualizar inmueble principal para avanzar estado
    if (isConfirmed) {
      updatedContext.inmueble = {
        ...updatedContext.inmueble,
        folio_real: selectedFolio,
        folio_real_confirmed: true,
        folio_real_scope: scope,
        // Auto-popular solo si tenemos info nueva o para no borrar lo existente
        superficie: folioInfo?.superficie || updatedContext.inmueble?.superficie,
        direccion: {
          ...updatedContext.inmueble?.direccion,
          ...(folioInfo?.direccion || {}),
          calle: folioInfo?.direccion?.calle || folioInfo?.ubicacion || updatedContext.inmueble?.direccion?.calle
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
    } else {
      // Si es FOCUS, podriamos querer actualizar `inmueble` temporalmente para que el bot responda preguntas
      // sobre "el inmueble", pero SIN `folio_real_confirmed: true`.
      // Esto permite que el bot vea los datos del folio enfocado.
      updatedContext.inmueble = {
        ...updatedContext.inmueble,
        folio_real: selectedFolio, // Se setea para referencia
        folio_real_confirmed: false, // CLAVE: No avanza estado
        folio_real_scope: scope,
        // Auto-popular datos para responder dudas
        superficie: folioInfo?.superficie || updatedContext.inmueble?.superficie,
        direccion: {
          ...updatedContext.inmueble?.direccion,
          ...(folioInfo?.direccion || {}),
          calle: folioInfo?.direccion?.calle || folioInfo?.ubicacion || updatedContext.inmueble?.direccion?.calle
        }
      }
    }

    // 6. Emitir eventos
    const events = ['FolioSelected']
    if (isConfirmed) {
      events.push('InmuebleUpdated')
      if (folioInfo) events.push('FolioInfoAutoPopulated')
    } else {
      // Si es solo FOCUS (o pregunta), indicar que no avance
      events.push('FolioFocusOnly')
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
