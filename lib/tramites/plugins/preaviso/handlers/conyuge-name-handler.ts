/**
 * Handler para nombre del cónyuge
 */

import { ConyugeNameCommand, HandlerResult } from '../../../base/types'
import { ValidationService } from '../../../shared/services/validation-service'
import { ConyugeService } from '../../../shared/services/conyuge-service'

export class ConyugeNameHandler {
  static async handle(
    command: ConyugeNameCommand,
    context: any
  ): Promise<HandlerResult> {
    // 1. Validar nombre
    if (!ValidationService.isValidName(command.payload.name)) {
      throw new Error(`Nombre "${command.payload.name}" no válido`)
    }

    // 2. Verificar que el comprador esté casado
    const buyerIndex = command.payload.buyerIndex
    const buyer = context.compradores?.[buyerIndex]
    
    if (!buyer) {
      throw new Error(`Comprador en índice ${buyerIndex} no encontrado`)
    }

    if (buyer.persona_fisica?.estado_civil !== 'casado') {
      throw new Error('El comprador debe estar casado para agregar cónyuge')
    }

    // 3. Verificar que el nombre no sea del comprador mismo
    const compradorNombre = buyer.persona_fisica?.nombre
    if (ConyugeService.namesMatch(command.payload.name, compradorNombre || '')) {
      throw new Error('El nombre del cónyuge no puede ser igual al del comprador')
    }

    // 4. Actualizar contexto
    const updatedContext = { ...context }
    const compradores = [...(context.compradores || [])]
    
    compradores[buyerIndex] = {
      ...buyer,
      persona_fisica: {
        ...buyer.persona_fisica,
        conyuge: {
          nombre: command.payload.name,
          rfc: command.payload.rfc || null,
          curp: command.payload.curp || null,
          participa: buyer.persona_fisica?.conyuge?.participa || false
        }
      }
    }

    updatedContext.compradores = compradores

    // 5. Auto-rol: si hay crédito(s) y el comprador es casado, agregar al cónyuge como COACREDITADO por defecto
    // (sin re-preguntar) cuando aún no existe en participantes.
    if (Array.isArray(updatedContext.creditos) && updatedContext.creditos.length > 0) {
      const conyugeNombre = command.payload.name
      const creditos = [...updatedContext.creditos]
      for (let i = 0; i < creditos.length; i++) {
        const credito = creditos[i]
        const participantes = Array.isArray(credito?.participantes) ? [...credito.participantes] : []
        const already = participantes.some((p: any) => {
          if (p?.party_id && p.party_id === 'conyuge') return true
          if (p?.nombre && ConyugeService.namesMatch(p.nombre, conyugeNombre)) return true
          return false
        })
        if (!already) {
          participantes.push({
            party_id: null,
            nombre: conyugeNombre,
            rol: 'coacreditado'
          })
          creditos[i] = { ...credito, participantes }
        }
      }
      updatedContext.creditos = creditos

      // Marcar participa=true si hay crédito (por defecto, para reflejar coacreditación)
      const prevConyuge = updatedContext.compradores?.[buyerIndex]?.persona_fisica?.conyuge
      if (prevConyuge) {
        compradores[buyerIndex] = {
          ...compradores[buyerIndex],
          persona_fisica: {
            ...compradores[buyerIndex].persona_fisica,
            conyuge: {
              ...prevConyuge,
              participa: true
            }
          }
        }
        updatedContext.compradores = compradores
      }
    }

    console.log('[ConyugeNameHandler] Cónyuge actualizado:', {
      compradorNombre: compradores[buyerIndex]?.persona_fisica?.nombre,
      conyugeNombre: compradores[buyerIndex]?.persona_fisica?.conyuge?.nombre,
      conyugeRfc: compradores[buyerIndex]?.persona_fisica?.conyuge?.rfc,
      conyugeCurp: compradores[buyerIndex]?.persona_fisica?.conyuge?.curp,
      source: command.payload.source
    })

    return { 
      updatedContext, 
      events: ['ConyugeNameUpdated'] 
    }
  }
}
