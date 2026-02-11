/**
 * Handler para institución de crédito
 * Si el comprador tiene cónyuge, infiere participantes = comprador (acreditado) + cónyuge (coacreditado).
 */

import { CreditInstitutionCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'

export class CreditInstitutionHandler {
  static async handle(
    command: CreditInstitutionCommand,
    context: any
  ): Promise<HandlerResult> {
    // 0. Sanitizar: quitar ruido conversacional
    let institution = command.payload.institution
    if (institution) {
      // Remover ruido conversacional (ej: "perdon, me equivoque, el redito es con SANTANDER")
      // Usamos una versión con repeticion para los prefijos
      institution = institution
        .replace(/^((no|perdon|perd[oó]n|disculpa|error|me\s+equivoque|no\s+era|es\s+con|sera\s+con|ser[aá]\s+con|actualiza|corrige|corrijo|cambio|cambia|el\s+banco\s+es|la\s+institucion\s+es|con)\b[,.\s:]*)+/gi, '')
        .replace(/\b(el\s+redito|el\s+credito|el\s+cr[eé]dito)\s+(es\s+con|ser[aá]\s+con|era\s+con|es)\b[,.\s:]*/gi, '')
        .replace(/\b(el\s+banco|la\s+institucion|la\s+instituci[oó]n|del|de\s+la)\b[,.\s:]*/gi, '')
        .trim()

      // Limpiar puntuación inicial/final residual (ej: ", SANTANDER")
      institution = institution.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').trim()

      // Capitalización especial
      const upper = institution.toUpperCase()
      if (['BANJICO', 'BBVA', 'HSBC', 'INFONAVIT', 'FOVISSSTE', 'SANTANDER', 'BANORTE', 'SCOTIABANK'].includes(upper)) {
        institution = upper
      }
    }

    // 1. Validar institución
    if (!ValidationService.isValidInstitution(institution)) {
      throw new Error(`Institución "${institution}" no válida`)
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

    const credito = creditos[creditIndex]
    const participantesExistentes = Array.isArray(credito.participantes) ? credito.participantes : []

    creditos[creditIndex] = {
      ...credito,
      institucion: institution,
      participantes: participantesExistentes.length > 0 ? participantesExistentes : this.inferParticipantes(context)
    }

    updatedContext.creditos = creditos

    return {
      updatedContext,
      events: ['CreditInstitutionUpdated']
    }
  }

  /**
   * Si hay comprador y (si está casado) cónyuge, infiere participantes: acreditado = comprador, coacreditado = cónyuge.
   */
  private static inferParticipantes(context: any): Array<{ party_id: string | null; nombre: string | null; rol: string }> {
    const comprador = context?.compradores?.[0]
    const nombreComprador = comprador?.persona_fisica?.nombre || comprador?.persona_moral?.denominacion_social || null
    const estadoCivil = (comprador?.persona_fisica?.estado_civil || '').toLowerCase()
    const conyugeNombre = comprador?.persona_fisica?.conyuge?.nombre || null
    const esCasado = estadoCivil === 'casado' && !!conyugeNombre

    if (!nombreComprador) return []

    const participantes: Array<{ party_id: string | null; nombre: string | null; rol: string }> = [
      { party_id: 'comprador_1', nombre: nombreComprador, rol: 'acreditado' }
    ]
    if (esCasado) {
      participantes.push({ party_id: null, nombre: conyugeNombre, rol: 'coacreditado' })
    }
    return participantes
  }
}
