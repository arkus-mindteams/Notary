/**
 * Handler para participantes de crédito
 */

import { CreditParticipantCommand, HandlerResult } from '../../../base/types'
import { ConyugeService } from '../../../shared/services/conyuge-service'

export class CreditParticipantHandler {
  static async handle(
    command: CreditParticipantCommand,
    context: any
  ): Promise<HandlerResult> {
    const updatedContext = { ...context }
    const creditos = [...(context.creditos || [])]
    const creditIndex = command.payload.creditIndex
    
    if (!creditos[creditIndex]) {
      throw new Error(`Crédito en índice ${creditIndex} no encontrado`)
    }

    const participante = command.payload.participant
    
    // Resolver nombre si no está presente
    let nombre = participante.name
    
    if (!nombre && participante.isConyuge) {
      // Es cónyuge → obtener nombre del cónyuge
      nombre = ConyugeService.getConyugeNombre(context)
    } else if (!nombre && participante.partyId) {
      // Resolver por party_id
      nombre = this.resolveNameByPartyId(participante.partyId, context)
    }

    // Agregar participante
    const participantes = [...(creditos[creditIndex].participantes || [])]
    
    // Verificar si ya existe
    const existingIndex = participantes.findIndex((p: any) => {
      if (participante.partyId && p.party_id === participante.partyId) return true
      if (nombre && p.nombre && ConyugeService.namesMatch(p.nombre, nombre)) return true
      return false
    })

    const newParticipant = {
      party_id: participante.partyId || null,
      nombre: nombre || null,
      rol: participante.role
    }

    if (existingIndex >= 0) {
      // Actualizar existente
      participantes[existingIndex] = {
        ...participantes[existingIndex],
        ...newParticipant
      }
    } else {
      // Agregar nuevo
      participantes.push(newParticipant)
    }

    // Si el usuario solo declaró un COACREDITADO (comúnmente el cónyuge) pero no existe Acreditado,
    // auto-agregar al comprador_1 como acreditado para evitar loops de preguntas.
    const hasAcreditado = participantes.some((p: any) => p?.rol === 'acreditado')
    const hasCoacreditado = participantes.some((p: any) => p?.rol === 'coacreditado')
    if (!hasAcreditado && hasCoacreditado) {
      participantes.push({
        party_id: 'comprador_1',
        nombre: this.resolveNameByPartyId('comprador_1', context),
        rol: 'acreditado'
      })
    }

    creditos[creditIndex] = {
      ...creditos[creditIndex],
      participantes
    }

    updatedContext.creditos = creditos

    return { 
      updatedContext, 
      events: ['CreditParticipantUpdated'] 
    }
  }

  private static resolveNameByPartyId(partyId: string, context: any): string | null {
    // Resolver nombre desde compradores o vendedores
    if (partyId?.startsWith('comprador_')) {
      const index = parseInt(partyId.replace('comprador_', '')) - 1
      return context.compradores?.[index]?.persona_fisica?.nombre || null
    }
    
    if (partyId?.startsWith('vendedor_')) {
      const index = parseInt(partyId.replace('vendedor_', '')) - 1
      return context.vendedores?.[index]?.persona_fisica?.nombre || 
             context.vendedores?.[index]?.persona_moral?.denominacion_social || null
    }
    
    return null
  }
}
