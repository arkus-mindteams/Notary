/**
 * Command Router
 * Coordina handlers y ejecuta comandos
 */

import { Command, HandlerResult } from './types'

// Importar handlers (se hará dinámicamente)
import { EstadoCivilHandler } from '../plugins/preaviso/handlers/estado-civil-handler'
import { FolioSelectionHandler } from '../plugins/preaviso/handlers/folio-selection-handler'
import { MultipleFoliosHandler } from '../plugins/preaviso/handlers/multiple-folios-handler'
import { BuyerNameHandler } from '../plugins/preaviso/handlers/buyer-name-handler'
import { ConyugeNameHandler } from '../plugins/preaviso/handlers/conyuge-name-handler'
import { TitularRegistralHandler } from '../plugins/preaviso/handlers/titular-registral-handler'
import { PaymentMethodHandler } from '../plugins/preaviso/handlers/payment-method-handler'
import { CreditInstitutionHandler } from '../plugins/preaviso/handlers/credit-institution-handler'
import { CreditParticipantHandler } from '../plugins/preaviso/handlers/credit-participant-handler'
import { EncumbranceHandler } from '../plugins/preaviso/handlers/encumbrance-handler'
import { InmuebleManualHandler } from '../plugins/preaviso/handlers/inmueble-manual-handler'

export class CommandRouter {
  private handlers: Map<string, any> = new Map()

  constructor() {
    // Registrar handlers de preaviso
    this.handlers.set('estado_civil', EstadoCivilHandler)
    this.handlers.set('folio_selection', FolioSelectionHandler)
    this.handlers.set('multiple_folios_detected', MultipleFoliosHandler)
    this.handlers.set('buyer_name', BuyerNameHandler)
    this.handlers.set('conyuge_name', ConyugeNameHandler)
    this.handlers.set('titular_registral', TitularRegistralHandler)
    this.handlers.set('payment_method', PaymentMethodHandler)
    this.handlers.set('credit_institution', CreditInstitutionHandler)
    this.handlers.set('credit_participant', CreditParticipantHandler)
    this.handlers.set('encumbrance', EncumbranceHandler)
    this.handlers.set('inmueble_manual', InmuebleManualHandler)
  }

  /**
   * Registra un handler nuevo
   */
  registerHandler(commandType: string, handler: any): void {
    this.handlers.set(commandType, handler)
  }

  /**
   * Ejecuta un comando usando el handler apropiado
   */
  async route(command: Command, context: any): Promise<HandlerResult> {
    const Handler = this.handlers.get(command.type)
    
    if (!Handler) {
      throw new Error(`No handler found for command type: ${command.type}`)
    }

    return Handler.handle(command, context)
  }
}
