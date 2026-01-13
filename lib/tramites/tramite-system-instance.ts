/**
 * Instancia singleton del sistema de trámites
 * Inicializa y registra todos los plugins
 */

import { TramiteSystem } from './base/tramite-system'
import { PreavisoPlugin } from './plugins/preaviso/preaviso-plugin'

let systemInstance: TramiteSystem | null = null

/**
 * Obtiene la instancia singleton del sistema de trámites
 */
export function getTramiteSystem(): TramiteSystem {
  if (!systemInstance) {
    systemInstance = new TramiteSystem()
    
    // Registrar plugins
    const preavisoPlugin = new PreavisoPlugin()
    systemInstance.registerPlugin(preavisoPlugin)
    
    // En el futuro, registrar otros plugins aquí:
    // const testamentoPlugin = new TestamentoPlugin()
    // systemInstance.registerPlugin(testamentoPlugin)
  }
  
  return systemInstance
}
