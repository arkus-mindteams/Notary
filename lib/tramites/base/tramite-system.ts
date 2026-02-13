/**
 * Sistema base de trámites
 * No conoce detalles de trámites específicos, solo coordina plugins
 */

import { Command, TramiteResponse, HandlerResult, LastQuestionIntent } from './types'
import { TramitePlugin } from './tramite-plugin'
import { FlexibleStateMachine } from './flexible-state-machine'
import { CommandRouter } from './command-router'
import { LLMService } from '../shared/services/llm-service'
import { diffContext } from '../shared/context-diff'
import { ToolContext } from './tools'

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
      ; (updatedContext as any).tipoOperacion = 'compraventa'
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
      const allowedToolIds = plugin.allowedToolsForState(toolState.id)
      const toolContext = this.buildToolContext(context)

      // Calcular faltantes para guiar la interpretación
      let missingRequirements: string[] = []
      try {
        missingRequirements = this.stateMachine.getMissingStates(plugin, updatedContext)
      } catch (e) {
        console.warn('Error calculando missing states para interpretWithLLM:', e)
      }

      const llmResult = await this.interpretWithLLM(
        userInput,
        updatedContext,
        plugin,
        conversationHistory,
        { allowedToolIds, toolContext, missingRequirements }
      )

      if (llmResult.commands && llmResult.commands.length > 0) {
        const filtered = this.filterCommandsByAllowedTools(llmResult.commands, allowedToolIds, plugin, toolState.id)
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
              ; (delta as any)[key] = (updatedContext as any)[key]
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
              ; (delta as any).creditos = [merged0, ...nextC.slice(1)]
          } else if (Array.isArray(prevC) && Array.isArray(nextC) && prevC.length > 0 && nextC.length === 0) {
            // Si el LLM intenta vaciar creditos, preservar (forma de pago ya confirmada)
            ; (delta as any).creditos = prevC
          }
        }

        // CRÍTICO: Evitar que el LLM "resetee" el objeto inmueble con updates parciales (ej. inmueble: {}).
        // Hacemos merge profundo preservando los campos ya capturados.
        if (Object.prototype.hasOwnProperty.call(delta, 'inmueble')) {
          const prevInmueble = (updatedContext as any)?.inmueble
          const nextInmueble = (delta as any)?.inmueble
          if (nextInmueble === null) {
            // No permitir null si ya tenemos inmueble
            ; (delta as any).inmueble = prevInmueble
          } else if (typeof nextInmueble === 'object' && nextInmueble) {
            const mergedDireccion =
              (prevInmueble?.direccion && nextInmueble?.direccion)
                ? { ...prevInmueble.direccion, ...nextInmueble.direccion }
                : (nextInmueble?.direccion ?? prevInmueble?.direccion)
              ; (delta as any).inmueble = {
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
              ; (delta as any).inmueble = prevInmueble
            }
          }
        }

        updatedContext = { ...updatedContext, ...delta }
      }
    }

    // 5. Ejecutar comandos con handlers (con recuperación y rollback)
    if (commands.length > 0) {
      console.log(`[TramiteSystem] 🚀 Ejecutando cola de comandos (${commands.length}):`, commands.map(c => c.type))
    }
    const commandExecution = await this.executeCommandsWithRecovery(commands, updatedContext)
    updatedContext = commandExecution.updatedContext


    // 6. Recalcular estado (FLEXIBLE - puede saltar estados)
    const newState = this.stateMachine.determineCurrentState(plugin, updatedContext)
    const prevStateId = context?._state_meta?.current_state || null
    const transitionInfo = plugin.getTransitionInfo(prevStateId, newState.id, updatedContext)

    // 7. Validar
    const validation = plugin.validate(updatedContext)

    // 8. Generar respuesta (FLEXIBLE - LLM genera pregunta natural)
    let response = await plugin.generateQuestion(newState, updatedContext, conversationHistory)
    const knowledgeSnapshot = plugin.getLastKnowledgeSnapshot?.() || null

    // 8.1. Inferir intención de documento del mensaje del asistente
    const documentIntentUpdate = plugin.inferDocumentIntent(response)
    if (documentIntentUpdate) {
      console.log('[TramiteSystem] _document_intent inferred from assistant message', {
        inferred: documentIntentUpdate,
        assistantText: response
      })
      updatedContext = { ...updatedContext, ...documentIntentUpdate }
    }

    // 8.2. Inferir la intención de la última pregunta (para respuestas cortas y context-aware parsing)
    const lastIntent = plugin.inferLastQuestionIntent(updatedContext, newState.id)

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
      const loopMsg = plugin.getLoopGuardMessage(newState.id, updatedContext)
      if (loopMsg) {
        response = loopMsg
      }
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

    // 9. Obtener estados completados, faltantes y no aplicables
    const completed = this.stateMachine.getCompletedStates(plugin, updatedContext)
    const missing = this.stateMachine.getMissingStates(plugin, updatedContext)
    const notApplicable = this.stateMachine.getNotApplicableStates(plugin, updatedContext)

    const contextDelta = diffContext(context || {}, updatedContext || {})
    const allowedToolsForState = plugin.allowedToolsForState(newState.id)

    return {
      message: response,
      data: updatedContext,
      state: {
        current: newState.id,
        completed,
        missing,
        not_applicable: notApplicable,
        validation
      },
      commands: commands.map(c => c.type), // Para debugging
      meta: {
        transition: transitionInfo,
        command_errors: commandExecution.errors,
        context_diff: contextDelta,
        allowed_tools: allowedToolsForState,
        knowledge_snapshot: knowledgeSnapshot,
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

      const toolRegistry = plugin.getToolRegistry()
      const allToolIds = toolRegistry.map((t: any) => t.id)
      const toolState = this.stateMachine.determineCurrentState(plugin, context || {})

      const allowedToolIds =
        toolMode === 'strict'
          ? plugin.allowedToolsForState(toolState.id)
          : allToolIds

      const filteredCommands = this.filterCommandsByAllowedTools(commands, allowedToolIds, plugin, toolState.id)
      const droppedCommands = commands
        .filter((c) => !filteredCommands.includes(c))
        .map((c) => c.type)
      const extractedData = result.extractedData

      // Ejecutar comandos
      let updatedContext = { ...context }
      const commandErrors: any[] = []
      for (const command of filteredCommands) {
        try {
          //console.log(`[TramiteSystem] Ejecutando comando: ${command.type}`, command.payload)
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

        } catch (error: any) {
          console.error(`[TramiteSystem] Error procesando comando ${command.type}:`, error)
          commandErrors.push({
            command: command.type,
            message: error?.message || String(error)
          })
        }
      }

      // Si hay extractedData, usar plugin para mergear
      if (extractedData && plugin.mergeDocumentData) {
        updatedContext = plugin.mergeDocumentData(updatedContext, extractedData, documentType)
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

  private filterCommandsByAllowedTools(commands: Command[], allowedToolIds: string[], plugin: TramitePlugin, stateId: string): Command[] {
    if (!allowedToolIds || allowedToolIds.length === 0) return commands

    // Si el plugin implementa getToolByCommandType, usarlo para filtrar
    if (plugin.getToolByCommandType) {
      const allowed = commands.filter((command) => {
        const tool = plugin.getToolByCommandType!(command.type)
        if (!tool) {
          console.warn(`[TramiteSystem] ⚠️ Comando ${command.type} no tiene tool definido en el plugin. Se descarta.`)
          return false
        }
        const isAllowed = allowedToolIds.includes(tool.id)
        if (!isAllowed) {
          console.warn(`[TramiteSystem] 🚫 Comando ${command.type} (Tool: ${tool.id}) NO permitido en estado ${stateId}. Se descarta.`)
        }
        return isAllowed
      })
      return allowed
    }

    return commands
  }

  private buildToolContext(context: any): ToolContext {
    return {
      state_meta: context?._state_meta || null,
      transition_info: context?._state_meta?.last_transition || null,
      context_diff: null
    }
  }

  /**
   * Interpreta con LLM (para máxima flexibilidad)
   */
  private async interpretWithLLM(
    input: string,
    context: any,
    plugin: TramitePlugin,
    history: any[],
    opts: { allowedToolIds: string[]; toolContext: ToolContext; missingRequirements?: string[] }
  ): Promise<{ commands?: Command[]; updatedContext?: any }> {
    const toolRegistry = plugin.getToolRegistry()
    const allowedTools = toolRegistry.filter((t: any) => opts.allowedToolIds.includes(t.id))
    const allowedToolsText = allowedTools.map((t: any) => `- ${t.id}: ${t.description}`).join('\n') || '- (ninguna)'

    const missingInfo = opts.missingRequirements && opts.missingRequirements.length > 0
      ? `
      FALTANTES CRÍTICOS (SISTEMA):
      El sistema requiere obligatoriamente estos datos para avanzar:
      ${JSON.stringify(opts.missingRequirements)}
      
      PRIORIDAD: Si el input del usuario contiene alguno de estos datos, EXTRÁELO Y EMITE <DATA_UPDATE>.
      `
      : ''

    const blockTools = plugin.getBlockToolsOpenAI?.() ?? []
    const useBlockTools = Array.isArray(blockTools) && blockTools.length > 0 && typeof plugin.convertBlockToolToCommands === 'function'

    if (useBlockTools) {
      const extraInstructions = (plugin as any).getExtraInterpretationInstructions?.(context) || ''
      const systemContent = `
      Eres un asistente notarial experto ayudando con un ${plugin.name}.
      Contexto actual:
      ${JSON.stringify(context, null, 2)}
      Tool Context: ${JSON.stringify(opts.toolContext, null, 2)}
      ${missingInfo}
      Tienes herramientas (set_inmueble, set_vendedor, set_forma_pago, set_comprador, set_conyuge, set_credito, set_gravamen). Usa las que correspondan con lo que el usuario diga o confirme.
      
      ${extraInstructions}

      Si no hay nada que capturar, no llames herramientas.
      `
      const userContent = `Historial:\n${history.slice(-20).map((m: any) => `${m.role}: ${m.content}`).join('\n')}\n\nInput del usuario: "${input}"`
      const result = await this.llmService.callWithTools(
        [{ role: 'system', content: systemContent }, { role: 'user', content: userContent }],
        blockTools,
        { userId: context?._userId, actionType: 'interpret_intent', category: plugin.id, sessionId: context?.conversation_id || context?.sessionId, tramiteId: context?.tramiteId }
      )
      const commands: Command[] = []
      const extracted = this.extractDataFromLLMResponse(result.content)

      // 1. Primero los comandos de extracción (DATA_UPDATE) - son más generales
      if (extracted) {
        commands.push(...plugin.convertDataToCommands(extracted, context))
      }

      // 2. Después los comandos de herramientas - son más específicos y tienen prioridad
      for (const tc of result.tool_calls) {
        commands.push(...plugin.convertBlockToolToCommands!(tc.name, tc.arguments, context))
      }

      return { commands, updatedContext: extracted || undefined }
    }

    // LLM interpreta input incluso si está fuera de orden (modo legacy)
    const prompt = `
      Eres un asistente notarial ayudando con un ${plugin.name}.
      
      Contexto actual:
      ${JSON.stringify(context, null, 2)}

      Tool Context (puerto único):
      ${JSON.stringify(opts.toolContext, null, 2)}
      
      ${missingInfo}

      Tools permitidas en este estado:
      ${allowedToolsText}
      
      Historial de conversación (usa todo el historial disponible para no perder datos que el usuario ya escribió):
      ${history.slice(-20).map((m: any) => `${m.role}: ${m.content}`).join('\n')}
      
      Input del usuario: "${input}"
      
      Tu tarea: Interpreta el input del usuario y extrae TODA la información relevante.
      
      IMPORTANTE - Sé FLEXIBLE:
      1. Si el usuario proporciona información fuera de orden, acéptala y captúrala
      2. Si el usuario proporciona información de múltiples campos, captura todo
      3. Si el usuario corrige información previa, actualízala
      6. Si el usuario confirma un dato inferido o propuesto por el asistente, emítelo como confirmado
      7. Si el contexto tiene "folios.candidates" con un solo folio y el usuario dice "sí", "correcto", "confirmo", etc., emite:
         "confirmacion_folio_unico": true
      8. Si el usuario SELECCIONA o CONFIRMA un folio específico (especialmente si hay candidatos):
         - Emite "folio_selection": { "selected_folio": "NUMERO", "intent": "CONFIRM" }
      
      Emite <DATA_UPDATE> con la información extraída en formato JSON v1.4.
      
      Si no hay información nueva para capturar, NO emitas <DATA_UPDATE>.
    `

    const response = await this.llmService.call(
      prompt,
      undefined,
      context?._userId,
      'interpret_intent',
      plugin.id, // category
      context?.conversation_id || context?.sessionId,
      context?.tramiteId
    )
    const extracted = this.extractDataFromLLMResponse(response)

    if (extracted) {
      // Convertir datos extraídos a comandos (USANDO PLUGIN)
      const commands = plugin.convertDataToCommands(extracted, context)
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
}
