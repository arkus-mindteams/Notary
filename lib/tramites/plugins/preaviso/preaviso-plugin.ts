/**
 * Plugin de Preaviso
 * Implementa TramitePlugin para el trámite de Preaviso de Compraventa
 */

import { TramitePlugin } from '../../base/tramite-plugin'
import { StateDefinition, CaptureRule, ValidationResult, InterpretationResult, Command } from '../../base/types'
import { InputParser } from '../../shared/input-parser'
import { LLMService } from '../../shared/services/llm-service'
import { ValidationService } from '../../shared/services/validation-service'
import { PreavisoDocumentProcessor } from './document-processor'
import { computePreavisoState } from '../../../preaviso-state'
import { PreavisoTemplateRenderer } from '../../../preaviso-template-renderer'
import { getPreavisoTransitionInfo } from './preaviso-transitions'
import {
  getPreavisoAllowedToolIdsForState,
  getPreavisoToolRegistry,
  getPreavisoToolByCommandType
} from './preaviso-tools'
import { getPreavisoStates } from './preaviso-state-definitions'
import { PreavisoPrompts } from './preaviso-prompts'

export class PreavisoPlugin implements TramitePlugin {
  id = 'preaviso'
  name = 'Preaviso de Compraventa'
  description = 'Trámite de preaviso de compraventa de bienes inmuebles'

  private inputParser: InputParser
  private llmService: LLMService
  private documentProcessor: PreavisoDocumentProcessor

  constructor() {
    this.inputParser = new InputParser()
    this.llmService = new LLMService()
    this.documentProcessor = new PreavisoDocumentProcessor()
  }

  /**
   * Obtiene estados del trámite
   */
  getStates(context: any): StateDefinition[] {
    return getPreavisoStates(context)
  }

  /**
   * Determina estado actual
   */
  determineCurrentState(context: any): StateDefinition {
    const computed = computePreavisoState(context)
    const states = this.getStates(context)

    // Mapear estado computado a StateDefinition
    const stateId = computed.state.current_state
    return states.find(s => s.id === stateId) || states[0]
  }

  /**
   * Obtiene reglas de captura deterministas
   */
  getCaptureRules(): CaptureRule[] {
    // Las reglas están en InputParser
    // Este método puede retornar reglas adicionales específicas del plugin
    return []
  }

  /**
   * Valida contexto
   */
  validate(context: any): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const missing: string[] = []

    // Validar compradores
    const compradores = context.compradores || []
    if (compradores.length === 0) {
      missing.push('compradores[]')
    } else {
      for (const comprador of compradores) {
        if (!comprador.persona_fisica?.nombre && !comprador.persona_moral?.denominacion_social) {
          errors.push('Comprador sin nombre')
        }
        if (!comprador.tipo_persona) {
          missing.push('compradores[].tipo_persona')
        }
      }
    }

    // Validar vendedores
    if (context.vendedores) {
      for (const vendedor of context.vendedores) {
        if (!vendedor.tipo_persona) {
          // Intentar inferir automáticamente
          const nombre = vendedor.persona_fisica?.nombre || vendedor.persona_moral?.denominacion_social
          if (nombre) {
            const inferred = ValidationService.inferTipoPersona(nombre)
            if (inferred) {
              vendedor.tipo_persona = inferred
            }
          }
        }
      }
    }

    // Re-validar compradores para inferencia automática
    if (context.compradores) {
      for (const comprador of context.compradores) {
        if (!comprador.tipo_persona) {
          const nombre = comprador.persona_fisica?.nombre || comprador.persona_moral?.denominacion_social
          if (nombre) {
            const inferred = ValidationService.inferTipoPersona(nombre)
            if (inferred) {
              comprador.tipo_persona = inferred
            }
          }
        }
      }
    }

    const vendedores = context.vendedores || []
    if (vendedores.length === 0) {
      missing.push('vendedores[]')
    } else {
      // Validar que los vendedores existentes tengan datos mínimos
      for (const vendedor of vendedores) {
        if (!vendedor.persona_fisica?.nombre && !vendedor.persona_moral?.denominacion_social) {
          errors.push('Vendedor sin nombre')
        }
        if (!vendedor.tipo_persona) {
          missing.push('vendedores[].tipo_persona')
        }
      }
    }

    // Validar inmueble
    if (!context.inmueble?.folio_real) {
      missing.push('inmueble.folio_real')
    }

    // Validar créditos
    if (Array.isArray(context?.creditos) && context.creditos.length > 0) {
      const creditos = context.creditos || []
      for (const credito of creditos) {
        if (!credito.institucion) {
          errors.push('Crédito sin institución')
        }
        if (!credito.participantes || credito.participantes.length === 0) {
          missing.push('creditos[].participantes[]')
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missing
    }
  }

  /**
   * Convierte a JSON final para generación de documento
   */
  toFinalJSON(context: any): any {
    return PreavisoTemplateRenderer.prepareTemplateData(context)
  }

  /**
   * Genera pregunta usando LLM (FLEXIBLE)
   */
  async generateQuestion(
    state: StateDefinition,
    context: any,
    conversationHistory: any[] = []
  ): Promise<string> {
    // 1. ANÁLISIS DE INTENCIÓN DEL USUARIO
    const lastUserMsg = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].content : ''
    const isQuestion = lastUserMsg.includes('?') ||
      lastUserMsg.toLowerCase().includes('cambiar') ||
      lastUserMsg.toLowerCase().includes('corregir') ||
      lastUserMsg.toLowerCase().includes('error') ||
      lastUserMsg.toLowerCase().includes('quien es') ||
      lastUserMsg.toLowerCase().includes('cuál es') ||
      lastUserMsg.toLowerCase().includes('cual es') ||
      lastUserMsg.toLowerCase().includes('que es') ||
      lastUserMsg.toLowerCase().includes('qué es')

    const isGreeting = /^(hola|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches|saludos)/i.test(lastUserMsg)

    // Lógica específica de flujo para "Personas Pendientes" del procesador de documentos
    const pendingPeople = context?._document_people_pending
    const pendingPersons = Array.isArray(pendingPeople?.persons) ? pendingPeople.persons : []

    if (pendingPeople?.status === 'pending' && pendingPersons.length >= 2) {
      const list = pendingPersons
        .slice(0, 2)
        .map((p: any, idx: number) => `Persona ${idx + 1}: ${p?.name || ''}`.trim())
        .join('\n')
      if (pendingPeople?.source === 'acta_matrimonio') {
        return `Detecté dos personas en el acta de matrimonio:\n${list}\n\n¿Quién es el comprador? (La otra persona se tomará como cónyuge).`
      }
      return `Detecté dos identificaciones:\n${list}\n\n¿Quién es el comprador y qué parentesco tiene la otra persona? (por ejemplo: "El comprador es Persona 1 y la otra es su cónyuge").`
    }

    if (pendingPeople?.status === 'pending' && pendingPersons.length === 1) {
      const nombre = pendingPersons[0]?.name || ''
      if (pendingPeople?.source === 'acta_matrimonio') {
        return `Detecté este nombre en el acta de matrimonio: ${nombre}. ¿Es el comprador?`
      }
      return `Detecté una identificación a nombre de ${nombre}. ¿Es el comprador?`
    }

    // Guardrail determinista: folios múltiples
    const folioCandidates = Array.isArray(context?.folios?.candidates)
      ? context.folios.candidates
      : []
    const selectedFolio = context?.folios?.selection?.selected_folio
    const hasMultipleFolios = folioCandidates.length > 1 && !selectedFolio && !isQuestion && !isGreeting

    if (folioCandidates.length === 1 && !selectedFolio && !isQuestion && !isGreeting) {
      const folio = typeof folioCandidates[0] === 'string' ? folioCandidates[0] : folioCandidates[0]?.folio
      if (folio) {
        return `Detecté el folio real ${folio} en la hoja de inscripción. ¿Confirmas que usemos ese folio para este trámite?`
      }
    }

    // CALCULAR ESTADO REAL
    const computed = computePreavisoState(context)
    const systemState = computed.state
    const missingNow = systemState.required_missing
    const isComplete = systemState.current_state === 'ESTADO_8'

    if (isComplete) {
      if (!isQuestion && !isGreeting) {
        return 'Listo: con la información capturada ya puedes generar el Preaviso. Puedes ver el documento en los botones de arriba del chat.'
      }
    }

    // Detectar intención de carga de documento
    const lastUserMsgLower = lastUserMsg.toLowerCase()
    const uploadIntentKeywords = [
      'te la comparto', 'comparto enseguida', 'la subo', 'lo subo',
      'deja la busco', 'déjame buscar', 'dejame buscar', 'un momento',
      'enseguida', 'ya va', 'ahí va', 'ahi va', 'te lo paso', 'te la paso',
      'buscando', 'esperame', 'espérame', 'dame un segundo', 'dame un momento'
    ]
    const hasUploadIntent = uploadIntentKeywords.some(keyword => lastUserMsgLower.includes(keyword))

    if (hasUploadIntent && !isGreeting) {
      return 'Claro, quedo en espera del documento. Avísame si necesitas ayuda para subirlo.'
    }

    // Diagnostic
    const allStates = this.getStates(context)
    const systemDiagnostic = Object.entries(systemState.state_status)
      .map(([k, v]) => {
        const stateName = allStates.find(s => s.id === k)?.name || k
        return `- ${stateName} (${k}): ${v}`
      })
      .join('\n')

    // USAR NUEVO SERVICIO DE PROMPTS
    const systemPrompts = await PreavisoPrompts.generateSystemPrompts(
      context,
      this.name,
      state,
      missingNow,
      systemDiagnostic
    )

    const prompt = PreavisoPrompts.generateUserPrompt(
      context,
      conversationHistory,
      missingNow,
      isGreeting,
      hasMultipleFolios,
      folioCandidates
    )

    try {
      const response = await this.llmService.call(
        prompt,
        systemPrompts,
        context?._userId,
        'generate_question',
        'preaviso', // category
        context?.conversation_id, // sessionId
        context?.tramiteId
      )
      return response.trim()
    } catch (error: any) {
      console.error('[PreavisoPlugin] Error generando pregunta:', error)
      return this.generateDeterministicQuestion(state, context, missingNow)
    }
  }

  /**
   * Genera pregunta determinista (fallback)
   */
  private generateDeterministicQuestion(state: StateDefinition, context: any, preComputedMissing?: string[]): string {
    let missing: string[] = preComputedMissing || []
    if (!preComputedMissing) {
      const computed = computePreavisoState(context)
      missing = computed.state.required_missing
    }

    if (missing.length === 0) {
      return 'Listo: con la información capturada ya puedes generar el Preaviso. Puedes ver el documento en los botones de arriba del chat.'
    }

    const firstMissing = missing[0]

    if (firstMissing.includes('folio_real') || firstMissing.includes('multiple_folio_real_detected')) {
      const folios = context.folios?.candidates || []
      const computed = computePreavisoState(context)
      const hasMultiple = computed.derived.hasMultipleFolios || folios.length > 1

      if (hasMultiple) {
        const folioList = folios.map((f: any) => {
          const folio = typeof f === 'string' ? f : f.folio
          return `- Folio ${folio} `
        }).join('\n')
        return `En la hoja de inscripción detecté más de un folio real. Por favor, indícame exactamente cuál es el folio real que vamos a utilizar para este trámite: \n\n${folioList} \n\n(responde con el número del folio exactamente)`
      }
      return 'Por favor, indícame el folio real del inmueble y la sección.'
    }

    if (firstMissing.includes('compradores')) {
      return 'Por favor, indícame el nombre completo del comprador.'
    }

    if (firstMissing.includes('tipo_persona')) {
      return 'Por favor, confirma si es persona física o moral.'
    }

    if (firstMissing.includes('estado_civil')) {
      return '¿Cuál es el estado civil del comprador?'
    }

    if (firstMissing.includes('vendedores')) {
      return 'Por favor, confirma el nombre del titular registral (vendedor).'
    }

    if (firstMissing.includes('titular_registral_missing') || firstMissing.includes('vendedor_titular_mismatch')) {
      const vendedor = context.vendedores?.[0]
      const nombre = vendedor?.persona_fisica?.nombre || vendedor?.persona_moral?.denominacion_social
      if (nombre) {
        return `Tengo capturado como posible vendedor: ${nombre}. ¿Confirmas que es el titular registral?`
      }
      return 'Por favor, confirma el nombre del titular registral (vendedor).'
    }

    if (firstMissing.includes('tipoOperacion') || firstMissing.includes('existencia_credito')) {
      return '¿La compraventa será de contado o con crédito?'
    }

    if (firstMissing.includes('creditos')) {
      const creditos = context.creditos || []
      const credito0 = creditos[0]
      if (credito0 && !credito0.institucion) {
        return 'Por favor, indícame la institución de crédito.'
      }
      if (credito0?.institucion && (!credito0.participantes || credito0.participantes.length === 0)) {
        return 'Por favor, indícame quiénes participarán en el crédito (acreditado/coacreditado).'
      }
      return 'Por favor, indícame los detalles del crédito (institución).'
    }

    if (firstMissing.includes('existe_hipoteca') || firstMissing.includes('gravamenes')) {
      if (firstMissing.includes('cancelacion_confirmada')) {
        return '¿La hipoteca / gravamen se cancelará antes o con motivo de la operación? (responde sí / no)'
      }
      return '¿Hay algún gravamen o hipoteca vigente o pendiente por cancelar?'
    }

    if (firstMissing.includes('direccion')) {
      return 'Por favor, proporciona la dirección del inmueble (Calle, Número, Colonia, Municipio).'
    }

    if (firstMissing.includes('partidas')) {
      return 'No detecté partidas en la captura. Por favor confirma la partida.'
    }

    return `Por favor, proporciona la información faltante: ${firstMissing.replace(/_/g, ' ')}.`
  }

  /**
   * Interpreta input del usuario
   */
  async interpretInput(
    input: string,
    context: any,
    lastAssistantMessage?: string
  ): Promise<InterpretationResult> {
    const deterministic = await this.inputParser.interpret(input, context, lastAssistantMessage)

    if (deterministic.captured) {
      return deterministic
    }

    return {
      captured: false,
      needsLLM: true
    }
  }

  /**
   * Procesa documento
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<{ commands: Command[]; extractedData?: any }> {
    return this.documentProcessor.processDocument(file, documentType, context)
  }

  // --- MÉTODOS DE ABSTRACCIÓN DE DOMINIO ---

  getLoopGuardMessage(stateId: string, context: any): string | null {
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
      const buyer0 = context?.compradores?.[0]
      const casadoSinConyuge = buyer0?.persona_fisica?.estado_civil === 'casado' &&
        !buyer0?.persona_fisica?.conyuge?.nombre &&
        !(context?.compradores?.length > 1 && (context.compradores[1]?.persona_fisica?.nombre || context.compradores[1]?.persona_moral?.denominacion_social))
      if (casadoSinConyuge) {
        return 'Para avanzar necesito el nombre completo del cónyuge del comprador.'
      }
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

  inferLastQuestionIntent(context: any, stateId: string): string | null {
    const pendingPeople = context?._document_people_pending
    if (
      pendingPeople?.status === 'pending' &&
      Array.isArray(pendingPeople?.persons) &&
      pendingPeople.persons.length >= 1
    ) {
      return 'document_people_select_buyer'
    }

    const buyer0 = context?.compradores?.[0]

    if (stateId === 'ESTADO_1') {
      if (context?.creditos === undefined) return 'payment_method'
      if (Array.isArray(context?.creditos) && context.creditos.length > 0) {
        const inst = context.creditos[0]?.institucion
        if (!inst) return 'credit_institution'
      }
    }
    if (stateId === 'ESTADO_4') {
      const buyerName = buyer0?.persona_fisica?.nombre || buyer0?.persona_moral?.denominacion_social
      if (!buyerName) return 'buyer_name'
      if (!buyer0?.tipo_persona) return 'buyer_tipo_persona'
      if (buyer0?.tipo_persona === 'persona_fisica' && !buyer0?.persona_fisica?.estado_civil) return 'estado_civil'
      // Si casado, no se completa el paso 4 hasta capturar el nombre del cónyuge
      if (buyer0?.persona_fisica?.estado_civil === 'casado' && !buyer0?.persona_fisica?.conyuge?.nombre) {
        const compradores = context?.compradores || []
        const conyugeComoSegundo = compradores.length > 1 && (compradores[1]?.persona_fisica?.nombre || compradores[1]?.persona_moral?.denominacion_social)
        if (!conyugeComoSegundo) return 'conyuge_name'
      }
    }
    if (stateId === 'ESTADO_4B') {
      if (buyer0?.persona_fisica?.estado_civil === 'casado' && !buyer0?.persona_fisica?.conyuge?.nombre) {
        return 'conyuge_name'
      }
    }
    if (stateId === 'ESTADO_5') {
      const inst = context?.creditos?.[0]?.institucion
      if (!inst) return 'credit_institution'
      const parts = context?.creditos?.[0]?.participantes
      if (!parts || parts.length === 0) return 'credit_participants'
    }
    if (stateId === 'ESTADO_2') {
      if (!context?.inmueble?.folio_real) return 'folio_real'
      const partidas = context?.inmueble?.partidas || []
      if (!Array.isArray(partidas) || partidas.length === 0) return 'partidas'
      const direccion = context?.inmueble?.direccion?.calle
      if (!direccion) return 'inmueble_direccion'
    }
    if (stateId === 'ESTADO_3') {
      const vendedor0 = context?.vendedores?.[0]
      const vendedorNombre =
        vendedor0?.persona_fisica?.nombre ||
        vendedor0?.persona_moral?.denominacion_social
      if (!vendedorNombre) return 'seller_name'
      if (!vendedor0?.tipo_persona) return 'seller_tipo_persona'
    }
    if (stateId === 'ESTADO_6') {
      if (context?.inmueble?.existe_hipoteca === null || context?.inmueble?.existe_hipoteca === undefined) {
        return 'encumbrance'
      }
      const g0 = Array.isArray(context?.gravamenes) ? context.gravamenes[0] : null
      if (context?.inmueble?.existe_hipoteca === true && !g0?.institucion) {
        return 'gravamen_acreedor'
      }
    }
    if (stateId === 'ESTADO_6B') {
      return 'encumbrance_cancellation'
    }

    return null
  }

  inferDocumentIntent(assistantText: string): any | null {
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

  convertDataToCommands(data: any, context: any): Command[] {
    const commands: Command[] = []

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

    if (data.folio_selection) {
      commands.push({
        type: 'folio_selection',
        timestamp: new Date(),
        source: 'llm',
        payload: {
          selectedFolio: data.folio_selection.selected_folio,
          confirmedByUser: true
        }
      })
    }

    if (data.confirmacion_folio_unico === true && context?.folios?.candidates?.length === 1) {
      const candidate = context.folios.candidates[0]
      const folio = typeof candidate === 'string' ? candidate : candidate.folio
      if (folio) {
        commands.push({
          type: 'folio_selection',
          timestamp: new Date(),
          source: 'llm',
          payload: {
            selectedFolio: folio,
            confirmedByUser: true
          }
        })
      }
    }

    return commands
  }

  allowedToolsForState(stateId: string): string[] {
    return getPreavisoAllowedToolIdsForState(stateId)
  }

  getToolRegistry(): any[] {
    return getPreavisoToolRegistry()
  }

  getToolByCommandType(commandType: string): any | null {
    return getPreavisoToolByCommandType(commandType)
  }

  getTransitionInfo(prevStateId: string | null, newStateId: string, context: any): any {
    return getPreavisoTransitionInfo(prevStateId, newStateId, context)
  }

  hasField(context: any, fieldPath: string): boolean {
    const parts = fieldPath.split('.')
    let current = context

    for (const part of parts) {
      if (part.includes('[]')) {
        const arrayName = part.replace('[]', '')
        if (!Array.isArray(current[arrayName]) || current[arrayName].length === 0) {
          return false
        }
        current = current[arrayName][0]
      } else {
        if (part === 'nombre' && (current.persona_fisica || current.persona_moral)) {
          const nombre = current.persona_fisica?.nombre || current.persona_moral?.denominacion_social
          if (nombre && nombre.trim().length > 0) {
            return true
          }
          return false
        }

        if (current[part] === undefined || current[part] === null) {
          return false
        }
        current = current[part]
      }
    }

    return true
  }

  mergeDocumentData(context: any, extracted: any, documentType: string): any {
    if (documentType !== 'inscripcion' && documentType !== 'escritura') {
      return context
    }

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
