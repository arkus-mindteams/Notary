/**
 * Sistema base de trámites
 * No conoce detalles de trámites específicos, solo coordina plugins
 */

import { TramitePlugin, Command, TramiteResponse, HandlerResult, LastQuestionIntent } from './types'
import { FlexibleStateMachine } from './flexible-state-machine'
import { CommandRouter } from './command-router'
import { LLMService } from '../shared/services/llm-service'
import { diffContext } from '../shared/context-diff'
import { getPreavisoTransitionInfo } from '../plugins/preaviso/preaviso-transitions'
import { ToolContext } from './tools'
import {
  getPreavisoAllowedToolIdsForState,
  getPreavisoToolByCommandType,
  getPreavisoToolRegistry
} from '../plugins/preaviso/preaviso-tools'

export class TramiteSystem {
  private plugins: Map<string, TramitePlugin> = new Map()
  private stateMachine: FlexibleStateMachine
  private commandRouter: CommandRouter
  private llmService: LLMService

  constructor() {
    this.stateMachine = new FlexibleStateMachine()
    this.commandRouter = new CommandRouter()
    this.llmService = new LLMService()
  }

  /**
   * Registra un plugin de trámite
   */
  registerPlugin(plugin: TramitePlugin): void {
    this.plugins.set(plugin.id, plugin)
  }

  /**
   * Obtiene un plugin por ID
   */
  getPlugin(tramiteId: string): TramitePlugin | null {
    return this.plugins.get(tramiteId) || null
  }

  /**
   * Procesa un mensaje del usuario (FLEXIBLE)
   */
  async process(
    tramiteId: string,
    userInput: string,
    context: any,
    conversationHistory: any[] = []
  ): Promise<TramiteResponse> {
    // 1. Obtener plugin
    const plugin = this.getPlugin(tramiteId)
    if (!plugin) {
      throw new Error(`Trámite ${tramiteId} no encontrado`)
    }

    // 2. Interpretar input del usuario (FLEXIBLE - puede estar fuera de orden)
    const interpretation = await plugin.interpretInput(
      userInput,
      context,
      conversationHistory[conversationHistory.length - 2]?.content
    )

    // 3. Intentar captura determinista (si aplica)
    let updatedContext = { ...context }
    // Preaviso: la operación es fija (compraventa). Mantenerla en el contexto para evitar preguntas inútiles.
    if (tramiteId === 'preaviso' && (updatedContext as any)?.tipoOperacion === undefined) {
      ;(updatedContext as any).tipoOperacion = 'compraventa'
    }
    let commands: Command[] = []

    if (interpretation.captured && interpretation.captureRule) {
      // Hay captura determinista → generar comando
      const dataAny: any = interpretation.data
      if (dataAny && Array.isArray(dataAny.__commands) && dataAny.__commands.length > 0) {
        commands.push(...dataAny.__commands)
      } else {
        const command = this.createCommandFromInterpretation(interpretation, context)
        if (command) {
          commands.push(command)
        }
      }
    }

    // 4. Si no hay captura determinista, usar LLM para interpretar (FLEXIBLE)
    if (!interpretation.captured || interpretation.needsLLM) {
      const toolState = this.stateMachine.determineCurrentState(plugin, updatedContext)
      const allowedToolIds = tramiteId === 'preaviso' ? getPreavisoAllowedToolIdsForState(toolState.id) : []
      const toolContext = this.buildToolContext(context)
      const llmResult = await this.interpretWithLLM(
        userInput,
        updatedContext,
        plugin,
        conversationHistory,
        { allowedToolIds, toolContext }
      )
      
      if (llmResult.commands && llmResult.commands.length > 0) {
        const filtered = this.filterCommandsByAllowedTools(llmResult.commands, allowedToolIds)
        commands.push(...filtered)
      }
      
      // Actualizar contexto con lo que LLM extrajo
      if (llmResult.updatedContext) {
        // CRÍTICO: tratar updatedContext del LLM como "delta" y evitar que vacíe arrays por accidente.
        // Ejemplo de bug observado: el modelo devuelve compradores: [] y se pierde el comprador/cónyuge.
        const delta = { ...(llmResult.updatedContext || {}) }
        const preserveIfEmptyArray = (key: string) => {
          if (Object.prototype.hasOwnProperty.call(delta, key)) {
            const v = (delta as any)[key]
            if (Array.isArray(v) && v.length === 0) {
              // Preservar el valor previo si existía (evitar wipes)
              ;(delta as any)[key] = (updatedContext as any)[key]
            }
          }
        }
        preserveIfEmptyArray('compradores')
        preserveIfEmptyArray('vendedores')
        preserveIfEmptyArray('creditos')
        preserveIfEmptyArray('gravamenes')
        preserveIfEmptyArray('documentosProcesados')

        // CRÍTICO: proteger `creditos` contra overwrites parciales del LLM.
        // Caso observado: el modelo puede volver a mandar creditos[0].institucion=null y se pierde BBVA.
        if (Object.prototype.hasOwnProperty.call(delta, 'creditos')) {
          const prevC = (updatedContext as any)?.creditos
          const nextC = (delta as any)?.creditos
          if (Array.isArray(prevC) && Array.isArray(nextC) && prevC.length > 0 && nextC.length > 0) {
            const merged0 = {
              ...(prevC[0] || {}),
              ...(nextC[0] || {}),
              institucion: (nextC[0]?.institucion ?? prevC[0]?.institucion ?? null),
              participantes: (Array.isArray(nextC[0]?.participantes) && nextC[0].participantes.length > 0)
                ? nextC[0].participantes
                : (prevC[0]?.participantes || []),
              tipo_credito: (nextC[0]?.tipo_credito ?? prevC[0]?.tipo_credito ?? null),
              monto: (nextC[0]?.monto ?? prevC[0]?.monto ?? null),
            }
            ;(delta as any).creditos = [merged0, ...nextC.slice(1)]
          } else if (Array.isArray(prevC) && Array.isArray(nextC) && prevC.length > 0 && nextC.length === 0) {
            // Si el LLM intenta vaciar creditos, preservar (forma de pago ya confirmada)
            ;(delta as any).creditos = prevC
          }
        }

        // CRÍTICO: Evitar que el LLM "resetee" el objeto inmueble con updates parciales (ej. inmueble: {}).
        // Hacemos merge profundo preservando los campos ya capturados.
        if (Object.prototype.hasOwnProperty.call(delta, 'inmueble')) {
          const prevInmueble = (updatedContext as any)?.inmueble
          const nextInmueble = (delta as any)?.inmueble
          if (nextInmueble === null) {
            // No permitir null si ya tenemos inmueble
            ;(delta as any).inmueble = prevInmueble
          } else if (typeof nextInmueble === 'object' && nextInmueble) {
            const mergedDireccion =
              (prevInmueble?.direccion && nextInmueble?.direccion)
                ? { ...prevInmueble.direccion, ...nextInmueble.direccion }
                : (nextInmueble?.direccion ?? prevInmueble?.direccion)
            ;(delta as any).inmueble = {
              ...(prevInmueble || {}),
              ...(nextInmueble || {}),
              direccion: mergedDireccion,
              // Preservar campos clave si el update los omite o los pone falsy por accidente
              folio_real: nextInmueble?.folio_real ?? prevInmueble?.folio_real ?? null,
              partidas: nextInmueble?.partidas ?? prevInmueble?.partidas ?? [],
              superficie: nextInmueble?.superficie ?? prevInmueble?.superficie ?? null,
              existe_hipoteca: (nextInmueble?.existe_hipoteca !== undefined ? nextInmueble.existe_hipoteca : prevInmueble?.existe_hipoteca),
            }
          } else if (nextInmueble === undefined) {
            // no-op
          } else {
            // Si viene como string/otro tipo raro, no reemplazar si ya hay objeto
            if (prevInmueble && typeof prevInmueble === 'object') {
              ;(delta as any).inmueble = prevInmueble
            }
          }
        }

        updatedContext = { ...updatedContext, ...delta }
      }
    }

    // 5. Ejecutar comandos con handlers (con recuperación y rollback)
    const commandExecution = await this.executeCommandsWithRecovery(commands, updatedContext)
    updatedContext = commandExecution.updatedContext

    // 6. Recalcular estado (FLEXIBLE - puede saltar estados)
    const newState = this.stateMachine.determineCurrentState(plugin, updatedContext)
    const prevStateId = context?._state_meta?.current_state || null
    const transitionInfo =
      tramiteId === 'preaviso'
        ? getPreavisoTransitionInfo(prevStateId, newState.id, updatedContext)
        : { from: prevStateId, to: newState.id, allowed: true, reason: 'default' }

    // 7. Validar
    const validation = plugin.validate(updatedContext)

    // 8. Generar respuesta (FLEXIBLE - LLM genera pregunta natural)
    let response = await plugin.generateQuestion(newState, updatedContext, conversationHistory)

    // 8.1. Inferir intención de documento del mensaje del asistente
    // Si el asistente pregunta por el cónyuge, establecer _document_intent para guiar el procesamiento de documentos
    const inferDocumentIntentFromAssistant = (assistantText: string): any | null => {
      const t = String(assistantText || '').toLowerCase()
      const mentionsConyuge = /\bc[oó]nyuge\b/.test(t)
      if (!mentionsConyuge) return null
      const asksName = /(nombre\s+completo|ind[ií]came\s+por\s+favor|para\s+poder\s+captur(ar|arlo)|para\s+continuar\s+necesito|me\s+indicas)/i.test(assistantText)
      const mentionsId = /\b(identificaci[oó]n|credencial|pasaporte|ine|ife|licencia|curp)\b/i.test(assistantText)
      const mentionsActa = /\b(acta\s+de\s+matrimonio|matrimonio)\b/i.test(assistantText)
      if (asksName || mentionsId || mentionsActa) {
        return { _document_intent: 'conyuge' }
      }
      return null
    }

    const documentIntentUpdate = inferDocumentIntentFromAssistant(response)
    if (documentIntentUpdate) {
      console.log('[TramiteSystem] _document_intent inferred from assistant message', {
        inferred: documentIntentUpdate,
        assistantText: response
      })
      updatedContext = { ...updatedContext, ...documentIntentUpdate }
    }

    // 8.2. Inferir la intención de la última pregunta (para respuestas cortas y context-aware parsing)
    const inferLastQuestionIntent = (): LastQuestionIntent | null => {
      if (tramiteId !== 'preaviso') return null

      const pendingPeople = updatedContext?._document_people_pending
      if (
        pendingPeople?.status === 'pending' &&
        Array.isArray(pendingPeople?.persons) &&
        pendingPeople.persons.length >= 1
      ) {
        return 'document_people_select_buyer'
      }

      // Si ya está todo completo, no hay intención pendiente
      const missingNow = this.stateMachine.getMissingStates(plugin, updatedContext)
      if (missingNow.length === 0) return null

      // Heurísticas por estado y campos faltantes
      const stateId = newState.id
      const buyer0 = updatedContext?.compradores?.[0]

      if (stateId === 'ESTADO_1') {
        if (updatedContext?.creditos === undefined) return 'payment_method'
        if (Array.isArray(updatedContext?.creditos) && updatedContext.creditos.length > 0) {
          const inst = updatedContext.creditos[0]?.institucion
          if (!inst) return 'credit_institution'
        }
      }
      if (stateId === 'ESTADO_4') {
        const buyerName = buyer0?.persona_fisica?.nombre || buyer0?.persona_moral?.denominacion_social
        if (!buyerName) return 'buyer_name'
        if (!buyer0?.tipo_persona) return 'buyer_tipo_persona'
        if (buyer0?.tipo_persona === 'persona_fisica' && !buyer0?.persona_fisica?.estado_civil) return 'estado_civil'
      }
      if (stateId === 'ESTADO_4B') {
        if (buyer0?.persona_fisica?.estado_civil === 'casado' && !buyer0?.persona_fisica?.conyuge?.nombre) {
          return 'conyuge_name'
        }
      }
      if (stateId === 'ESTADO_5') {
        const inst = updatedContext?.creditos?.[0]?.institucion
        if (!inst) return 'credit_institution'
        const parts = updatedContext?.creditos?.[0]?.participantes
        if (!parts || parts.length === 0) return 'credit_participants'
      }
      if (stateId === 'ESTADO_2') {
        if (!updatedContext?.inmueble?.folio_real) return 'folio_real'
        const partidas = updatedContext?.inmueble?.partidas || []
        if (!Array.isArray(partidas) || partidas.length === 0) return 'partidas'
        const direccion = updatedContext?.inmueble?.direccion?.calle
        if (!direccion) return 'inmueble_direccion'
      }
      if (stateId === 'ESTADO_3') {
        const vendedor0 = updatedContext?.vendedores?.[0]
        const vendedorNombre =
          vendedor0?.persona_fisica?.nombre ||
          vendedor0?.persona_moral?.denominacion_social
        if (!vendedorNombre) return 'seller_name'
        if (!vendedor0?.tipo_persona) return 'seller_tipo_persona'
      }
      if (stateId === 'ESTADO_6') {
        if (updatedContext?.inmueble?.existe_hipoteca === null || updatedContext?.inmueble?.existe_hipoteca === undefined) {
          return 'encumbrance'
        }
        const g0 = Array.isArray(updatedContext?.gravamenes) ? updatedContext.gravamenes[0] : null
        if (updatedContext?.inmueble?.existe_hipoteca === true && !g0?.institucion) {
          return 'gravamen_acreedor'
        }
      }
      if (stateId === 'ESTADO_6B') {
        return 'encumbrance_cancellation'
      }

      return null
    }

    const lastIntent = inferLastQuestionIntent()

    // 8.3. Guardrail anti-loop: si el usuario repite sin avanzar, forzar mensaje guiado
    const prevCounts = (context?._state_meta?.reask_counts || {}) as Record<string, number>
    const reaskCounts = { ...prevCounts }
    if (prevStateId === newState.id) {
      reaskCounts[newState.id] = (reaskCounts[newState.id] || 0) + 1
    } else {
      reaskCounts[newState.id] = 0
    }
    const loopLimit = 3
    const loopGuardTriggered = reaskCounts[newState.id] >= loopLimit
    if (loopGuardTriggered) {
      response = this.buildLoopGuardMessage(newState.id, updatedContext) || response
    }

    updatedContext = {
      ...updatedContext,
      _last_question_intent: lastIntent,
      _state_meta: {
        current_state: newState.id,
        previous_state: prevStateId,
        last_transition: transitionInfo,
        reask_counts: reaskCounts,
        loop_guard_triggered: loopGuardTriggered,
        updated_at: new Date().toISOString()
      }
    }

    // 9. Obtener estados completados y faltantes
    const completed = this.stateMachine.getCompletedStates(plugin, updatedContext)
    const missing = this.stateMachine.getMissingStates(plugin, updatedContext)

    const contextDelta = diffContext(context || {}, updatedContext || {})
    const allowedToolsForState =
      tramiteId === 'preaviso'
        ? getPreavisoAllowedToolIdsForState(newState.id)
        : []

    return {
      message: response,
      data: updatedContext,
      state: {
        current: newState.id,
        completed,
        missing,
        validation
      },
      commands: commands.map(c => c.type), // Para debugging
      meta: {
        transition: transitionInfo,
        command_errors: commandExecution.errors,
        context_diff: contextDelta,
        allowed_tools: allowedToolsForState,
        tool_context: {
          state_meta: updatedContext?._state_meta || null,
          transition_info: transitionInfo,
          context_diff: contextDelta
        }
      }
    }
  }

  /**
   * Procesa un documento subido
   */
  async processDocument(
    tramiteId: string,
    file: File,
    documentType: string,
    context: any
  ): Promise<{ data: any; commands: Command[]; extractedData?: any; meta?: any }> {
    const plugin = this.getPlugin(tramiteId)
    if (!plugin) {
      throw new Error(`Trámite ${tramiteId} no encontrado`)
    }

    // Si el plugin tiene processDocument, usarlo
    if (plugin.processDocument) {
      const result = await plugin.processDocument(file, documentType, context)
      const commands = result.commands || []
      const toolMode =
        (context?._state_meta?.document_tool_mode as 'strict' | 'flexible' | undefined) ||
        'flexible'
      const toolRegistry = tramiteId === 'preaviso' ? getPreavisoToolRegistry() : []
      const allToolIds = toolRegistry.map((t) => t.id)
      const toolState = this.stateMachine.determineCurrentState(plugin, context || {})
      const allowedToolIds =
        toolMode === 'strict'
          ? (tramiteId === 'preaviso' ? getPreavisoAllowedToolIdsForState(toolState.id) : [])
          : allToolIds
      const filteredCommands = this.filterCommandsByAllowedTools(commands, allowedToolIds)
      const droppedCommands = commands
        .filter((c) => !filteredCommands.includes(c))
        .map((c) => c.type)
      const extractedData = result.extractedData
      
      // Ejecutar comandos
      let updatedContext = { ...context }
      const commandErrors: any[] = []
      for (const command of filteredCommands) {
        try {
          console.log(`[TramiteSystem] Ejecutando comando: ${command.type}`, command.payload)
          const handlerResult = await this.commandRouter.route(command, updatedContext)
          // Merge profundo del contexto actualizado
          // CRÍTICO: Preservar arrays existentes si el handler no los actualiza explícitamente
          // ESPECIALMENTE IMPORTANTE: Preservar el cónyuge en compradores
          if (handlerResult.updatedContext.compradores !== undefined) {
            // Merge inteligente de compradores para preservar cónyuge
            const prevCompradores = updatedContext.compradores || []
            const nextCompradores = handlerResult.updatedContext.compradores || []
            
            if (prevCompradores.length > 0 && nextCompradores.length > 0) {
              // Merge: preservar cónyuge y otros datos importantes
              const merged: any[] = []
              const prevMap = new Map<string, any>()
              prevCompradores.forEach((c: any, idx: number) => {
                const key = c?.party_id || `comprador_${idx}`
                prevMap.set(key, c)
              })
              
              // Agregar/actualizar con los nuevos
              nextCompradores.forEach((c: any, idx: number) => {
                const key = c?.party_id || `comprador_${idx}`
                const prev = prevMap.get(key)
                if (prev) {
                  // Merge profundo: preservar datos previos pero actualizar con nuevos
                  merged.push({
                    ...prev,
                    ...c,
                    persona_fisica: c.persona_fisica ? {
                      ...prev.persona_fisica,
                      ...c.persona_fisica,
                      // CRÍTICO: Preservar cónyuge si ya existe y el nuevo no lo incluye
                      conyuge: c.persona_fisica?.conyuge || prev.persona_fisica?.conyuge
                    } : prev.persona_fisica,
                    persona_moral: c.persona_moral || prev.persona_moral
                  })
                  prevMap.delete(key)
                } else {
                  merged.push(c)
                }
              })
              
              // Agregar compradores previos que no fueron actualizados
              prevMap.forEach((c) => merged.push(c))
              updatedContext.compradores = merged
            } else if (nextCompradores.length > 0) {
              updatedContext.compradores = nextCompradores
            }
            // Si solo hay previos, mantenerlos (no hacer nada)
          } else {
            // Si el handler no actualiza compradores, preservar los existentes
            updatedContext.compradores = updatedContext.compradores
          }
          
          updatedContext = { 
            ...updatedContext, 
            ...handlerResult.updatedContext,
            // Asegurar que arrays se actualicen correctamente
            // Si el handler actualiza vendedores, usar esa versión; si no, preservar la existente
            vendedores: handlerResult.updatedContext.vendedores !== undefined 
              ? handlerResult.updatedContext.vendedores 
              : updatedContext.vendedores,
            compradores: updatedContext.compradores, // Ya se hizo merge arriba
            creditos: handlerResult.updatedContext.creditos !== undefined
              ? handlerResult.updatedContext.creditos
              : updatedContext.creditos,
            folios: handlerResult.updatedContext.folios !== undefined
              ? handlerResult.updatedContext.folios
              : updatedContext.folios
          }
          console.log(`[TramiteSystem] Contexto después de ${command.type}:`, {
            vendedores: updatedContext.vendedores,
            compradores: updatedContext.compradores
          })
        } catch (error: any) {
          console.error(`[TramiteSystem] Error procesando comando ${command.type}:`, error)
          commandErrors.push({
            command: command.type,
            message: error?.message || String(error)
          })
        }
      }

      // Si hay extractedData de un documento de inscripción, actualizar información del inmueble
      if (extractedData && (documentType === 'inscripcion' || documentType === 'escritura')) {
        updatedContext = this.mergeInmuebleData(updatedContext, extractedData)
      }

      return {
        data: updatedContext,
        commands: filteredCommands,
        extractedData,
        meta: {
          command_errors: commandErrors,
          context_diff: diffContext(context || {}, updatedContext || {}),
          allowed_tools: allowedToolIds,
          dropped_commands: droppedCommands,
          tool_mode: toolMode
        }
      }
    }

    // Si no tiene processDocument, retornar contexto sin cambios
    return {
      data: context,
      commands: [],
      extractedData: null
    }
  }

  /**
   * Crea comando desde interpretación
   */
  private createCommandFromInterpretation(
    interpretation: any,
    context: any
  ): Command | null {
    if (!interpretation.captureRule || !interpretation.data) {
      return null
    }

    const rule = interpretation.captureRule
    const data = interpretation.data

    // Mapear nombre de handler a tipo de comando
    const handlerToCommandType: Record<string, string> = {
      'EstadoCivilHandler': 'estado_civil',
      'FolioSelectionHandler': 'folio_selection',
      'BuyerNameHandler': 'buyer_name',
      'ConyugeNameHandler': 'conyuge_name',
      'TitularRegistralHandler': 'titular_registral',
      'PaymentMethodHandler': 'payment_method',
      'CreditInstitutionHandler': 'credit_institution',
      'CreditParticipantHandler': 'credit_participant',
      'EncumbranceHandler': 'encumbrance'
    }

    const commandType = handlerToCommandType[rule.handler] || rule.name

    return {
      type: commandType,
      timestamp: new Date(),
      payload: data
    } as Command
  }

  private async executeCommandsWithRecovery(
    commands: Command[],
    baseContext: any
  ): Promise<{ updatedContext: any; errors: any[] }> {
    let updatedContext = { ...baseContext }
    const errors: any[] = []
    const maxRetries = 1

    for (const command of commands) {
      const snapshot = this.safeClone(updatedContext)
      let attempt = 0
      let success = false
      while (attempt <= maxRetries) {
        try {
          const result = await this.commandRouter.route(command, updatedContext)
          updatedContext = { ...updatedContext, ...result.updatedContext }
          success = true
          break
        } catch (error: any) {
          attempt += 1
          if (attempt > maxRetries) {
            errors.push({
              command: command.type,
              message: error?.message || String(error),
              retry_count: attempt - 1
            })
            updatedContext = snapshot
          }
        }
      }
      if (!success) {
        console.warn('[TramiteSystem] comando fallido con rollback', { command: command.type })
      }
    }

    return { updatedContext, errors }
  }

  private safeClone(value: any): any {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return { ...value }
    }
  }

  private filterCommandsByAllowedTools(commands: Command[], allowedToolIds: string[]): Command[] {
    if (!allowedToolIds || allowedToolIds.length === 0) return commands
    return commands.filter((command) => {
      const tool = getPreavisoToolByCommandType(command.type)
      if (!tool) return false
      return allowedToolIds.includes(tool.id)
    })
  }

  private buildToolContext(context: any): ToolContext {
    return {
      state_meta: context?._state_meta || null,
      transition_info: context?._state_meta?.last_transition || null,
      context_diff: null
    }
  }

  private buildLoopGuardMessage(stateId: string, context: any): string | null {
    if (stateId === 'ESTADO_2') {
      return 'Para avanzar necesito datos del inmueble: folio real, partida(s) y dirección (calle y municipio). Ejemplo: “Folio 1234567, Partida 7654321, Calle X 123, Municipio Monterrey”.'
    }
    if (stateId === 'ESTADO_3') {
      return 'Para avanzar necesito el/los vendedor(es) con nombre completo y tipo de persona (física o moral). Ejemplo: “Vendedor: Juan Pérez, persona física”.'
    }
    if (stateId === 'ESTADO_1') {
      return 'Para avanzar necesito confirmar la forma de pago: ¿contado o crédito? Ejemplo: “Será crédito”.'
    }
    if (stateId === 'ESTADO_4') {
      return 'Para avanzar necesito el nombre del comprador, tipo de persona y su estado civil. Ejemplo: “Comprador: Ana López, persona física, casada”.'
    }
    if (stateId === 'ESTADO_4B') {
      return 'Para avanzar necesito el nombre completo del cónyuge. Ejemplo: “Cónyuge: María García”.'
    }
    if (stateId === 'ESTADO_5') {
      return 'Para avanzar necesito la institución del crédito y los participantes (acreditado/coacreditado). Ejemplo: “Crédito BBVA; acreditado el comprador y coacreditada su cónyuge”.'
    }
    if (stateId === 'ESTADO_6') {
      return 'Para avanzar necesito confirmar si el inmueble tiene gravamen/hipoteca. Ejemplo: “Sí, tiene hipoteca”.'
    }
    if (stateId === 'ESTADO_6B') {
      return 'Para avanzar necesito confirmar si la hipoteca/gravamen se cancelará. Ejemplo: “Sí, se cancelará con la compraventa”.'
    }
    return null
  }

  /**
   * Interpreta con LLM (para máxima flexibilidad)
   */
  private async interpretWithLLM(
    input: string,
    context: any,
    plugin: TramitePlugin,
    history: any[],
    opts: { allowedToolIds: string[]; toolContext: ToolContext }
  ): Promise<{ commands?: Command[]; updatedContext?: any }> {
    const toolRegistry = plugin.id === 'preaviso' ? getPreavisoToolRegistry() : []
    const allowedTools = toolRegistry.filter((t) => opts.allowedToolIds.includes(t.id))
    const allowedToolsText = allowedTools.map((t) => `- ${t.id}: ${t.description}`).join('\n') || '- (ninguna)'
    // LLM interpreta input incluso si está fuera de orden
    const prompt = `
      Eres un asistente notarial ayudando con un ${plugin.name}.
      
      Contexto actual:
      ${JSON.stringify(context, null, 2)}

      Tool Context (puerto único):
      ${JSON.stringify(opts.toolContext, null, 2)}

      Tools permitidas en este estado:
      ${allowedToolsText}
      
      Historial de conversación (últimos 3 mensajes):
      ${history.slice(-3).map((m: any) => `${m.role}: ${m.content}`).join('\n')}
      
      Input del usuario: "${input}"
      
      Tu tarea: Interpreta el input del usuario y extrae TODA la información relevante.
      
      IMPORTANTE - Sé FLEXIBLE:
      1. Si el usuario proporciona información fuera de orden, acéptala y captúrala
      2. Si el usuario proporciona información de múltiples campos, captura todo
      3. Si el usuario corrige información previa, actualízala
      4. Si el usuario proporciona información implícita, infiérela (pero sé conservador)
      5. No intentes capturar datos fuera de las tools permitidas listadas arriba
      
      Emite <DATA_UPDATE> con la información extraída en formato JSON v1.4.
      
      Si no hay información nueva para capturar, NO emitas <DATA_UPDATE>.
    `

    const response = await this.llmService.call(prompt)
    const extracted = this.extractDataFromLLMResponse(response)

    if (extracted) {
      // Convertir datos extraídos a comandos
      const commands = this.convertDataToCommands(extracted, context)
      return {
        commands,
        updatedContext: extracted
      }
    }

    return {}
  }

  /**
   * Extrae datos de respuesta del LLM
   */
  private extractDataFromLLMResponse(message: string): any | null {
    const dataUpdateMatch = message.match(/<DATA_UPDATE>([\s\S]*?)<\/DATA_UPDATE>/)
    
    if (!dataUpdateMatch) {
      return null
    }

    try {
      const jsonStr = dataUpdateMatch[1].trim()
      return JSON.parse(jsonStr)
    } catch (error) {
      console.error('[TramiteSystem] Error parsing LLM response:', error)
      return null
    }
  }

  /**
   * Convierte datos extraídos a comandos
   */
  private convertDataToCommands(data: any, context: any): Command[] {
    const commands: Command[] = []

    // Detectar tipo de datos y crear comandos apropiados
    if (data.compradores && Array.isArray(data.compradores)) {
      for (const comprador of data.compradores) {
        if (comprador.persona_fisica?.nombre) {
          commands.push({
            type: 'buyer_name',
            timestamp: new Date(),
            source: 'llm',
            payload: {
              buyerIndex: 0,
              name: comprador.persona_fisica.nombre,
              rfc: comprador.persona_fisica.rfc,
              curp: comprador.persona_fisica.curp,
              inferredTipoPersona: comprador.tipo_persona || 'persona_fisica'
            }
          })
        }
        
        if (comprador.persona_fisica?.estado_civil) {
          commands.push({
            type: 'estado_civil',
            timestamp: new Date(),
            source: 'llm',
            payload: {
              buyerIndex: 0,
              estadoCivil: comprador.persona_fisica.estado_civil
            }
          })
        }
      }
    }

    if (data.vendedores && Array.isArray(data.vendedores)) {
      for (const vendedor of data.vendedores) {
        const nombre = vendedor.persona_fisica?.nombre || vendedor.persona_moral?.denominacion_social
        if (nombre) {
          commands.push({
            type: 'titular_registral',
            timestamp: new Date(),
            source: 'llm',
            payload: {
              name: nombre,
              inferredTipoPersona: vendedor.tipo_persona,
              confirmed: vendedor.titular_registral_confirmado || false
            }
          })
        }
      }
    }

    if (data.creditos && Array.isArray(data.creditos)) {
      for (const credito of data.creditos) {
        if (credito.institucion) {
          commands.push({
            type: 'credit_institution',
            timestamp: new Date(),
            source: 'llm',
            payload: {
              creditIndex: 0,
              institution: credito.institucion
            }
          })
        }
      }
    }

    // ... más conversiones

    return commands
  }

  /**
   * Mergea información del inmueble desde extractedData al contexto
   */
  private mergeInmuebleData(context: any, extracted: any): any {
    const updatedContext = { ...context }
    const inmueble = updatedContext.inmueble || {}
    
    // Partidas: priorizar partidasTitulo sobre partidas generales
    const partidasTitulo = Array.isArray(extracted.partidasTitulo) ? extracted.partidasTitulo.filter(Boolean) : []
    const partidas = partidasTitulo.length > 0 
      ? partidasTitulo 
      : (Array.isArray(extracted.partidas) ? extracted.partidas.filter(Boolean) : [])
    
    if (partidas.length > 0) {
      const existingPartidas = Array.isArray(inmueble.partidas) ? inmueble.partidas : []
      const mergedPartidas = [...new Set([...existingPartidas, ...partidas.map(String)])]
      inmueble.partidas = mergedPartidas
    }
    
    // Sección
    if (extracted.seccion) {
      inmueble.seccion = extracted.seccion
    }
    
    // Dirección
    if (extracted.direccion) {
      inmueble.direccion = {
        ...(inmueble.direccion || {}),
        calle: extracted.direccion.calle || inmueble.direccion?.calle || null,
        numero: extracted.direccion.numero || inmueble.direccion?.numero || null,
        colonia: extracted.direccion.colonia || inmueble.direccion?.colonia || null,
        municipio: extracted.direccion.municipio || inmueble.direccion?.municipio || null,
        estado: extracted.direccion.estado || inmueble.direccion?.estado || null,
        codigo_postal: extracted.direccion.codigo_postal || inmueble.direccion?.codigo_postal || null
      }
    } else if (extracted.ubicacion && typeof extracted.ubicacion === 'string') {
      // Si viene como string, intentar parsear
      inmueble.direccion = {
        ...(inmueble.direccion || {}),
        calle: extracted.ubicacion
      }
    }
    
    // Superficie
    if (extracted.superficie) {
      inmueble.superficie = String(extracted.superficie)
    }
    
    // Valor
    if (extracted.valor) {
      inmueble.valor = String(extracted.valor)
    }
    
    // Datos catastrales
    if (extracted.datosCatastrales) {
      inmueble.datos_catastrales = {
        ...(inmueble.datos_catastrales || {}),
        lote: extracted.datosCatastrales.lote ? String(extracted.datosCatastrales.lote) : inmueble.datos_catastrales?.lote || null,
        manzana: extracted.datosCatastrales.manzana ? String(extracted.datosCatastrales.manzana) : inmueble.datos_catastrales?.manzana || null,
        fraccionamiento: extracted.datosCatastrales.fraccionamiento || inmueble.datos_catastrales?.fraccionamiento || null,
        condominio: extracted.datosCatastrales.condominio || inmueble.datos_catastrales?.condominio || null,
        unidad: extracted.datosCatastrales.unidad ? String(extracted.datosCatastrales.unidad) : inmueble.datos_catastrales?.unidad || null,
        modulo: extracted.datosCatastrales.modulo || inmueble.datos_catastrales?.modulo || null
      }
    }
    
    updatedContext.inmueble = inmueble
    
    return updatedContext
  }
}
