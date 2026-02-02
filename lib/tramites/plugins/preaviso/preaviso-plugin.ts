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
import { PreavisoSimplifiedJSON } from '../../../types/preaviso-simplified'
import { PreavisoTemplateRenderer } from '../../../preaviso-template-renderer'
import { DocumentoService } from '@/lib/services/documento-service'

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
    // IMPORTANTE: El flujo v1.4 se basa en `creditos` (no en `operacion.tipo_pago`):
    // - creditos === undefined => forma de pago NO confirmada
    // - creditos === [] => contado confirmado
    // - creditos === [...] => crédito confirmado
    //
    // Este orden debe alinearse con `computePreavisoState` para evitar preguntas irrelevantes.
    return [
      {
        id: 'ESTADO_2',
        name: 'Inmueble y Registro',
        required: true,
        // Superficie NO debe bloquear (si el usuario no la tiene o dice que es irrelevante).
        // Dirección sí es deseable para el documento, pero idealmente viene de la inscripción.
        // IMPORTANTE: permitir captura manual (sin documentosProcesados[]).
        // NOTA: usar calle para evitar marcar completo cuando solo existe el objeto direccion vacío.
        fields: ['inmueble.folio_real', 'inmueble.partidas', 'inmueble.direccion.calle'],
        conditional: () => true,
      },
      {
        id: 'ESTADO_3',
        name: 'Vendedor(es)',
        required: true,
        fields: [
          'vendedores[]',
          'vendedores[].tipo_persona',
          // Nombre puede vivir en persona_fisica.nombre o persona_moral.denominacion_social
          'vendedores[].nombre',
        ],
        conditional: () => true,
      },
      {
        id: 'ESTADO_1',
        name: 'Operación y Forma de Pago',
        required: true,
        // En preaviso, la operación es SIEMPRE compraventa. NO se pregunta ni se captura como decisión.
        // `creditos` sirve como confirmación explícita: undefined => falta preguntar (contado vs crédito)
        fields: ['creditos'],
        conditional: () => true,
      },
      {
        id: 'ESTADO_4',
        name: 'Comprador(es)',
        required: true,
        fields: [
          'compradores[]',
          'compradores[].tipo_persona',
          'compradores[].nombre',
          'compradores[].persona_fisica.estado_civil',
        ],
        conditional: () => true,
      },
      {
        id: 'ESTADO_4B',
        name: 'Cónyuge (si aplica)',
        // Si el comprador es persona_fisica y está casado, necesitamos el nombre del cónyuge.
        // El acta de matrimonio es opcional; preferimos identificación o texto.
        required: (ctx) => ctx?.compradores?.[0]?.tipo_persona === 'persona_fisica' && ctx?.compradores?.[0]?.persona_fisica?.estado_civil === 'casado',
        fields: ['compradores[].persona_fisica.conyuge.nombre'],
        conditional: (ctx) => ctx?.compradores?.[0]?.tipo_persona === 'persona_fisica' && ctx?.compradores?.[0]?.persona_fisica?.estado_civil === 'casado',
      },
      {
        id: 'ESTADO_5',
        name: 'Crédito del Comprador',
        // Solo aplica si hay créditos (no si es contado o no está confirmado)
        required: (ctx) => Array.isArray(ctx?.creditos) && ctx.creditos.length > 0,
        fields: ['creditos[].institucion', 'creditos[].participantes[]'],
        conditional: (ctx) => Array.isArray(ctx?.creditos) && ctx.creditos.length > 0,
      },
      {
        id: 'ESTADO_6',
        name: 'Gravámenes / Hipoteca',
        required: true,
        fields: ['inmueble.existe_hipoteca'],
        conditional: () => true,
      },
      {
        id: 'ESTADO_6B',
        name: 'Cancelación de hipoteca/gravamen (si aplica)',
        // Solo aplica si el inmueble SÍ tiene hipoteca/gravamen y todavía no sabemos si se cancelará.
        required: (ctx) =>
          ctx?.inmueble?.existe_hipoteca === true &&
          Array.isArray(ctx?.gravamenes) &&
          ctx.gravamenes.length > 0 &&
          !!ctx.gravamenes[0]?.institucion &&
          (ctx.gravamenes[0]?.cancelacion_confirmada === null || ctx.gravamenes[0]?.cancelacion_confirmada === undefined),
        fields: ['gravamenes[].cancelacion_confirmada'],
        conditional: (ctx) =>
          ctx?.inmueble?.existe_hipoteca === true &&
          Array.isArray(ctx?.gravamenes) &&
          ctx.gravamenes.length > 0 &&
          !!ctx.gravamenes[0]?.institucion,
      },
      {
        id: 'ESTADO_8',
        name: 'Listo para Generar',
        required: false,
        fields: [],
        conditional: () => false,
      },
    ]
  }

  /**
   * Determina estado actual (usa computePreavisoState existente)
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
              // Ajustar estructura si infirió moral pero estaba en fisica (o viceversa) si fuera necesario
              // Por ahora confiamos en que si está en persona_fisica es fisica, pero completamos el tipo
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
        // Si aun despues de inferencia falta el tipo, entonces sí es missing
        if (!vendedor.tipo_persona) {
          missing.push('vendedores[].tipo_persona')
        }
      }
    }

    // Validar inmueble
    if (!context.inmueble?.folio_real) {
      missing.push('inmueble.folio_real')
    }

    // Validar créditos (v1.4):
    // - creditos === undefined => forma de pago no confirmada (no es error legal, pero bloquea el flujo)
    // - creditos === [] => contado (no aplica)
    // - creditos === [...] => crédito (requiere institucion + participantes)
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
    // 1. ANÁLISIS DE INTENCIÓN DEL USUARIO (PRIORIDAD ALTA)
    // Antes de aplicar lógica de estados, verificar si el usuario está saludando o haciendo conversación.
    const lastUserMsg = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].content : ''
    // Detectar si el usuario está haciendo una pregunta
    const isQuestion = lastUserMsg.includes('?') ||
      lastUserMsg.toLowerCase().includes('cambiar') ||
      lastUserMsg.toLowerCase().includes('corregir') ||
      lastUserMsg.toLowerCase().includes('error') ||
      lastUserMsg.toLowerCase().includes('quien es') ||
      lastUserMsg.toLowerCase().includes('cuál es') ||
      lastUserMsg.toLowerCase().includes('cual es') ||
      lastUserMsg.toLowerCase().includes('que es') ||
      lastUserMsg.toLowerCase().includes('qué es')

    // Detectar saludos comunes
    const isGreeting = /^(hola|buenos\s*d[ií]as|buenas\s*tardes|buenas\s*noches|saludos)/i.test(lastUserMsg)

    // Si es un saludo y no tenemos una pregunta específica pendiente crítica (como confirmación de delete),
    // dejamos que el LLM genere la respuesta natural.
    if (isGreeting) {
      // Si es un saludo, pedir al LLM que responda el saludo y luego verifique el estado.
      // Pero para no romper el flujo, le damos instrucciones específicas de saludar.
    }

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

    // Guardrail determinista: si hay múltiples folios detectados y no hay selección,
    // inyectar la lista en el prompt para que el LLM pregunte naturalmente.
    const folioCandidates = Array.isArray(context?.folios?.candidates)
      ? context.folios.candidates
      : []
    const selectedFolio = context?.folios?.selection?.selected_folio
    const hasMultipleFolios = folioCandidates.length > 1 && !selectedFolio && !isQuestion && !isGreeting

    // NOTA: Ya no retornamos aquí el string hardcodeado. 
    // Dejamos que el flujo caiga hacia el LLM, y le pasamos 'hasMultipleFolios' y la lista en el prompt.
    // (Ver abajo en la construcción del prompt)

    // Si hay un solo candidato sin confirmación explícita, pedir confirmación.
    // Si hay un solo candidato sin confirmación explícita, pedir confirmación.
    if (folioCandidates.length === 1 && !selectedFolio && !isQuestion && !isGreeting) {
      const folio = typeof folioCandidates[0] === 'string' ? folioCandidates[0] : folioCandidates[0]?.folio
      if (folio) {
        return `Detecté el folio real ${folio} en la hoja de inscripción. ¿Confirmas que usemos ese folio para este trámite?`
      }
    }

    // CALCULAR ESTADO REAL (FUENTE DE VERDAD)
    const computed = computePreavisoState(context)
    const systemState = computed.state
    const missingNow = systemState.required_missing
    const isComplete = systemState.current_state === 'ESTADO_8'

    if (isComplete) {
      // Si el usuario pregunta algo (detectado por ?) o pide cambios, permitir respuesta OPEN
      // Estrategia: Dejar que el LLM decida si responder o dar el mensaje de cierre.
      // Si el usuario pregunta algo (detectado por ?) o pide cambios, permitir respuesta OPEN
      // Estrategia: Dejar que el LLM decida si responder o dar el mensaje de cierre.

      // Variables isQuestion y isGreeting ya calculadas al inicio del método


      if (!isQuestion && !isGreeting) {
        return 'Listo: con la información capturada ya puedes generar el Preaviso. Puedes ver el documento en los botones de arriba del chat.'
      }
    }

    // Lógica para detectar INTENCIÓN DE CARGA DE DOCUMENTO (Racionalidad del Agente)
    // Si el usuario dice "te la comparto", "enseguida la subo", "deja la busco", etc.
    // El agente debe ESPERAR y no volver a preguntar.
    const lastUserMsgLower = conversationHistory.length > 0
      ? conversationHistory[conversationHistory.length - 1].content.toLowerCase()
      : ''

    // Palabras clave que indican promesa de envío
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

    // RAG: Buscar contexto relevante si hay campos faltantes
    let ragContext = ''
    try {
      if (state.id !== 'ESTADO_8') {
        let query = ''
        const missing = missingNow

        if (missing.some(f => f.includes('folio_real') || f.includes('partidas') || f.includes('direccion'))) {
          query = 'antecedentes propiedad folio real partidas dirección ubicación inmueble'
        } else if (missing.some(f => f.includes('vendedores'))) {
          query = 'vendedor titular registral propietario'
        } else if (missing.some(f => f.includes('compradores'))) {
          query = 'comprador adquirente generales identificación' // generales = nombre, estado civil, etc
        } else if (missing.some(f => f.includes('estado_civil'))) {
          query = 'estado civil matrimonio soltero casado'
        } else if (missing.some(f => f.includes('creditos'))) {
          query = 'precio forma de pago crédito institución bancaria'
        } else if (missing.some(f => f.includes('hipoteca') || f.includes('gravamen'))) {
          query = 'gravamen hipoteca certificado libertad gravamen'
        }

        if (query) {
          const chunks = await DocumentoService.searchSimilarChunks(query, context.tramiteId, 0.5, 3)
          if (chunks && chunks.length > 0) {
            ragContext = `
             INFORMACIÓN EXTRAÍDA DE DOCUMENTOS (RAG):
             Los siguientes fragmentos de texto fueron encontrados en los documentos del expediente y pueden ser útiles para formular la pregunta o entender el contexto (NO inventes información que no esté aquí):
             ${chunks.map(c => `- "${c.content}" (Doc: ${c.documento?.tipo || 'Desconocido'})`).join('\n')}
             `
          }
        }
      }
    } catch (err) {
      console.error('[PreavisoPlugin] RAG Error:', err)
      // Continue without RAG
    }

    // Preparar diagnóstico del sistema para el LLM
    const allStates = this.getStates(context)
    const systemDiagnostic = Object.entries(systemState.state_status)
      .map(([k, v]) => {
        const stateName = allStates.find(s => s.id === k)?.name || k
        return `- ${stateName} (${k}): ${v}`
      })
      .join('\n')

    // Usar LLM para generar pregunta natural y flexible
    const systemPrompts = [
      `Eres un ABOGADO NOTARIAL DE CONFIANZA, cálido, profesional y humano, ayudando con un ${this.name}.
       TU MISIÓN: Guiar al cliente en el proceso, capturar la información necesaria y ASESORARLO si tiene dudas.

      ${ragContext}
      
      DIAGNÓSTICO DEL SISTEMA (FUENTE DE VERDAD):
      El sistema ha evaluado el expediente y determina lo siguiente:
      ${systemDiagnostic}
      
      FALTANTES CRÍTICOS (LO QUE DEBES PEDIR):
      ${JSON.stringify(missingNow)}
      
      INSTRUCCIÓN CRÍTICA DE SINCRONIZACIÓN:
      - Si el sistema dice que falta algo en 'FALTANTES CRÍTICOS', DEBES pedirlo, aunque creas que el usuario ya lo dijo.
      - Si el sistema marca un paso como 'incomplete', confía en el sistema.
      - Tu objetivo principal es resolver los 'FALTANTES CRÍTICOS'.

      INSTRUCCIONES DE PERSONALIDAD:
      - Actúa como un abogado notarial experto: usa lenguaje profesional pero accesible y empático.
      - Sé cordial y educado. Si el usuario te saluda, DEVUELVE EL SALUDO amablemente.
      - Si el usuario muestra dudas o confusión, explica con paciencia usando el contexto legal proporcionado.
      - Si el usuario te hace una pregunta (ej: "¿quién es el vendedor?"), RESPONDE claramente usando la información del contexto ANTES de pedir el siguiente dato.
      - Si el usuario quiere corregir algo, confirma el cambio amablemente.
      - NUNCA repitas "Listo para generar" si el usuario te está haciendo una pregunta o conversando.
      - Tu tono debe ser de ASISTENCIA, no de INTERROGATORIO.
      - IMPORTANTE: NO uses negritas (**) ni markdown formatting en tus respuestas. Escribe texto plano limpio.
      - SIEMPRE sugiere al usuario que, si tiene el documento que contiene el dato solicitado, puede subirlo al chat para extraer la información automáticamente.


      Tu tarea es generar UNA respuesta natural que atienda lo que dijo el usuario y guíe el trámite.
      
      A continuación, reglas para obtener la información faltante:

        IMPORTANTE:
      - Sé natural y conversacional
      - Evita hacer demasiadas preguntas a la vez, pero agrupa preguntas relacionadas (ej: calle y número).
      - Si el usuario SALUDA (hola, buenos días, etc.), responde el saludo CALIDAMENTE antes de pasar al tema.
      - Si el usuario pregunta "en qué nos quedamos", RESUME brevemente lo que ya tenemos y lo que falta.
      - SUGIERE SUBIR DOCUMENTOS: "Si tienes la [nombre del documento, ej: escritura, identificación] donde aparece este dato, puedes subirlo y yo lo leo por ti."
      - Si el usuario PREFIERE DICTAR LOS DATOS (folio, dirección, etc.) manualmente en lugar de subir documento, ACÉPTALO y captura la información. NO lo fuerces a subir el documento.
      - No menciones estados, pasos, o lógica interna.
      - Si el usuario ya proporcionó información, no la pidas de nuevo.
      - Sé flexible: acepta información fuera de orden.
      - NO uses negritas (**).
      
      Estado actual: ${state.name}
      Información faltante: ${JSON.stringify(missingNow)}
      
      IMPORTANTE:
      - Inmueble y Registro: Pide el Folio Real preferentemente mediante la hoja de inscripción, pero SI EL USUARIO LO DICTA, ACÉPTALO.
         - Puedes pedir folio, partida y sección en grupo si es natural.
         - Puedes pedir dirección (calle, municipio) junto.
      - Si el vendedor ya fue detectado del documento(context.vendedores[0] tiene nombre), NO preguntes por el vendedor.
      - Si el comprador ya fue detectado del documento(context.compradores[0] tiene nombre), NO preguntes por el comprador.
      - Si el cónyuge ya fue detectado del documento(context.compradores[0].persona_fisica.conyuge.nombre existe), NO preguntes por el cónyuge.
      - Si se procesó un documento de identificación y el nombre ya está en el contexto, NO preguntes por confirmación del nombre.
      - Si la forma de pago ya está confirmada(context.creditos está definido), NO vuelvas a preguntar por contado o crédito.
      - Si la institución de crédito ya está detectada(context.creditos[0].institucion existe), NO vuelvas a preguntar por la institución.
      - Si ya se capturó gravamen / hipoteca(context.inmueble.existe_hipoteca es true / false), NO vuelvas a pedir confirmaciones repetidas.Una sola respuesta basta.
      - RFC y CURP son OPCIONALES: NO los pidas.Solo captúralos si el usuario los proporciona o si vienen en los documentos.
      - El valor del inmueble NO es obligatorio: NO lo pidas.Solo captúralo si el usuario lo proporciona.
      - Solo pregunta por información que REALMENTE falta.
      - En este trámite la operación es SIEMPRE una compraventa.PROHIBIDO preguntar si es cesión de derechos, permuta, dación en pago u otra.
      - PROHIBIDO preguntar si incluye anexos / derechos adicionales(estacionamientos, bodegas, etc.).El folio real seleccionado define el inmueble del trámite.
      - PROHIBIDO preguntar si el crédito ya está autorizado, en trámite, aprobado, o estatus similar(NO es dato requerido).
      - PROHIBIDO preguntar quién va a firmar el crédito o "quién firma como acreditado"(NO es dato requerido).
      - PROHIBIDO preguntar si hay otros inmuebles adicionales en la operación(NO es parte de este flujo).
      - PROHIBIDO preguntar por complementos en efectivo / "parte en contado" / "una parte en efectivo" si ya se confirmó que será únicamente con crédito.
      - PROHIBIDO preguntar por tipo de crédito(p.ej. "hipotecario tradicional", "crédito vivienda", etc.).NO es dato requerido; con saber que es crédito y la institución es suficiente.
      - Gravámenes: Si no está claro si hay gravamen, pregunta explícitamente "¿Existe algún gravamen o hipoteca que deba cancelarse?".
      - Si existe hipoteca / gravamen(existe_hipoteca = true) y falta definir cancelación, pregunta SOLO UNA VEZ: si se cancelará antes o con motivo de la operación.No repitas.
      - Si ya están completos compradores / vendedor / crédito / gravamen, NO preguntes por "otro comprador", "condiciones especiales" o "¿procedemos?".
      - Si ya existe al menos un Vendedor registrado, ASUME QUE ES EL ÚNICO. PROHIBIDO preguntar "¿hay algún otro vendedor?" o "¿son todos?". Solo agrega más si el usuario lo pide explícitamente.
      
      REGLA CRÍTICA: DESPUÉS DE PROCESAR UN DOCUMENTO:
    - Si el usuario subió un documento y se procesó, ASUME que la información extraída es correcta.
      - NO preguntes "¿ya lo revisamos?" o "¿corresponde al comprador/vendedor?".
      - NO preguntes por "documentos adicionales" o "otros documentos".
      - Si se detectó información del documento(nombre, etc.), úsala directamente y continúa con el siguiente paso del flujo.
      - Si se detectó el comprador → pregunta por estado civil.
      - Si se detectó el vendedor → continúa con el siguiente paso.
      - Si se detectó el cónyuge → continúa con el siguiente paso.
      - PROHIBIDO preguntar por apoderados, representantes legales, firmantes, administradores, socios o accionistas.
      - Para personas morales: SOLO captura el nombre de la sociedad(denominacion_social).NO preguntes quién firmará, quién es el representante legal, o cualquier información sobre firmantes.
      - Asume que el vendedor(persona física o moral) comparecerá directamente.NO preguntes por información adicional sobre firmantes o representantes.
      - PROHIBIDO preguntar por "documentos relacionados con el inmueble" o "otros documentos" después de procesar un documento de identificación.
      - PROHIBIDO preguntar por "hoja de inscripción", "documentos registrales", "revisar todos los documentos" o "falta alguna hoja" después de procesar un documento de identificación del comprador o vendedor.
      - Si ya se procesó una hoja de inscripción y se seleccionó el folio real, NO vuelvas a preguntar por documentos de inscripción.
      - Si ya se detectó un comprador o vendedor de un documento, continúa con el siguiente paso del flujo(estado civil, forma de pago, etc.).NO preguntes por más documentos.
      - Solo pregunta por documentos adicionales si es necesario para completar información faltante específica(ej: si falta el folio real, pregunta por la hoja de inscripción).
      - ORDEN DEL FLUJO: Hoja de inscripción → seleccionar folio → comprador → estado civil → cónyuge(si aplica) → forma de pago.NO vuelvas atrás a preguntar por documentos de inscripción.
      
      Genera UNA respuesta natural en español.`
    ]

    // Verificar si hay múltiples folios detectados que requieren selección
    // (hasMultipleFolios ya fue calculado arriba)
    // const results = context.folios?.candidates || []
    // const hasMultipleFolios = ...

    // Si es saludo, forzar al LLM a que solo salude y pregunte lo siguiente amablemente
    const userInstruction = isGreeting ?
      `El usuario acaba de saludar (${conversationHistory[conversationHistory.length - 1]?.content}).
        TU OBJETIVO: Devuelve el saludo con cortesía y profesionalismo, y LUEGO, de forma fluida, invita a continuar con el trámite preguntando por el dato faltante: ${missingNow[0] || 'lo siguiente'}.
        NO seas seco. Sé amable. Sugiere subir documento si aplica. NO uses negritas (**).`
      :
      `Último mensaje del usuario: "${conversationHistory[conversationHistory.length - 1]?.content || ''}"`

    const prompt = `
      Contexto actual:
      ${JSON.stringify(context, null, 2)}

      ${userInstruction}
      
      Historial reciente(últimos 10 mensajes):
      ${conversationHistory.slice(-10).map((m: any) => `${m.role}: ${m.content}`).join('\n')}
      
      ${hasMultipleFolios ? `
      IMPORTANTE: Se detectaron múltiples folios reales en el documento. Debes preguntar al usuario cuál folio va a utilizar.
      Folios detectados: ${folioCandidates.map((f: any) => typeof f === 'string' ? f : f.folio).join(', ')}
      ` : ''
      }
      
      INFORMACIÓN YA DETECTADA:
    - Folio real seleccionado: ${context.folios?.selection?.selected_folio || context.inmueble?.folio_real || 'No detectado'}
    - Hoja de inscripción procesada: ${context.documentosProcesados?.some((d: any) => d.tipo === 'inscripcion') ? 'Sí' : 'No'}
    - Vendedor: ${context.vendedores?.[0]?.persona_fisica?.nombre || context.vendedores?.[0]?.persona_moral?.denominacion_social || 'No detectado'}
    - Comprador: ${context.compradores?.[0]?.persona_fisica?.nombre || context.compradores?.[0]?.persona_moral?.denominacion_social || 'No detectado'}
    - Estado civil del comprador: ${context.compradores?.[0]?.persona_fisica?.estado_civil || 'No detectado'}
    - Cónyuge del comprador: ${context.compradores?.[0]?.persona_fisica?.conyuge?.nombre || 'No detectado'}
    - Forma de pago: ${context.creditos === undefined ? 'No confirmada' : (context.creditos?.length === 0 ? 'Contado' : 'Crédito')}
    - Institución de crédito: ${context.creditos?.[0]?.institucion || 'No detectada'}
      
      ⚠️ VERIFICACIÓN CRÍTICA DEL CÓNYUGE(OBLIGATORIA):
    - Cónyuge detectado: ${context.compradores?.[0]?.persona_fisica?.conyuge?.nombre ? 'SÍ - ' + context.compradores[0].persona_fisica.conyuge.nombre : 'NO'}
    - Estado civil del comprador: ${context.compradores?.[0]?.persona_fisica?.estado_civil || 'No detectado'}
    - Si el cónyuge YA ESTÁ DETECTADO(arriba dice "SÍ" con un nombre), NO preguntes por el cónyuge.NUNCA.
      - Si el cónyuge NO está detectado(arriba dice "NO"), entonces SÍ puedes preguntar por el cónyuge.
      - REGLA ABSOLUTA: Si context.compradores[0].persona_fisica.conyuge.nombre existe y no es null / undefined / vacío, el cónyuge YA ESTÁ DETECTADO.NO preguntes.
      - Si el usuario subió un documento del cónyuge y se procesó, el nombre DEBE estar en context.compradores[0].persona_fisica.conyuge.nombre.Si está ahí, NO preguntes.
      
      REGLAS CRÍTICAS(ABSOLUTAS):
    - Si el vendedor ya está detectado, NO preguntes por él.
      - Si el comprador ya está detectado, NO preguntes por él.
      - Si el cónyuge ya está detectado(context.compradores[0].persona_fisica.conyuge.nombre existe), NO preguntes por el cónyuge.NUNCA.
      - Si se procesó un documento de identificación del cónyuge y el nombre ya está en el contexto, NO preguntes por confirmación del nombre.
      - Si la forma de pago ya está confirmada(context.creditos está definido), NO vuelvas a preguntar por contado o crédito.
      - Si la institución de crédito ya está detectada(context.creditos[0].institucion existe), NO vuelvas a preguntar por la institución.
      - RFC y CURP son OPCIONALES: NO los pidas.Solo captúralos si el usuario los proporciona o si vienen en los documentos.
      - El valor del inmueble NO es obligatorio: NO lo pidas.Solo captúralo si el usuario lo proporciona.
      - Solo pregunta por información que REALMENTE falta.
      - INSTRUCCIÓN DE INTERACCIÓN HUMANA:
    1. Analiza el "Último mensaje del usuario".
        2. Si el usuario saludó("hola", "buenos días"), saluda de vuelta con calidez antes de pedir el dato.
        3. Si el usuario hizo una pregunta, respóndela primero usando la información de contexto o RAG, y luega conecta suavemente con la pregunta del dato faltante.
        4. Si el usuario solo dio el dato, confirma recibido brevemente y pide el siguiente.
 
      
      VERIFICACIÓN OBLIGATORIA ANTES DE PREGUNTAR POR CÓNYUGE:
    - ANTES de preguntar por el cónyuge, VERIFICA: context.compradores[0].persona_fisica.conyuge.nombre
      - Si existe(no es null, no es undefined, no es vacío), NO preguntes.El cónyuge ya está detectado.
      - Si el cónyuge ya está detectado, continúa con el siguiente paso(participantes del crédito, forma de pago, etc.).
      - NUNCA preguntes "¿me indicas el nombre completo del cónyuge?" si el nombre ya está en el contexto.
      
      TIPOS DE DOCUMENTOS ESPERADOS:
    - Si preguntas por datos del comprador → espera documento de identificación(INE, pasaporte, licencia, etc.)
      - Si preguntas por estado civil del comprador → acepta texto(soltero / casado / divorciado / viudo).El acta de matrimonio es OPCIONAL(si el usuario la sube, úsala; no la pidas).
    - Si preguntas por cónyuge → acepta texto(nombre completo) o documento de identificación del cónyuge.El acta de matrimonio es OPCIONAL(si el usuario la sube, úsala; no la pidas).
    - Si preguntas por vendedor → espera documento de identificación O hoja de inscripción(si es titular registral)
      - Si preguntas por folio real → espera hoja de inscripción
      
    PROHIBIDO(ABSOLUTO - NUNCA HACER ESTO):
    - ❌ NO preguntes por "documentos relacionados con el inmueble" o "otros documentos" después de procesar un documento.
      - ❌ NO preguntes por más documentos si ya se detectó información del documento procesado.
      - ❌ NO preguntes "¿ya lo revisamos?" o "¿corresponde al comprador?" después de procesar un documento de identificación.
      - ❌ NO preguntes "¿subiste algún otro documento adicional?" después de procesar un documento.
      - ❌ NO preguntes "¿también deba tomar en cuenta?" después de procesar un documento.
      - ❌ NO preguntes "¿El pasaporte de [nombre] ya lo revisamos y corresponde al comprador que me indicaste?" - ESTO ESTÁ PROHIBIDO.
      - ❌ NO preguntes por "hoja de inscripción", "documentos registrales", "revisar todos los documentos" o "falta alguna hoja" si ya se procesó una hoja de inscripción y se seleccionó el folio real.
      - ❌ NO preguntes por documentos de inscripción después de procesar un documento de identificación del comprador o vendedor.
      - ❌ Si ya se detectó un comprador o vendedor de un documento, continúa INMEDIATAMENTE con el siguiente paso del flujo(estado civil, forma de pago, etc.).NO preguntes por documentos adicionales.
      - ✅ Solo pregunta por documentos adicionales si es necesario para completar información faltante específica(ej: si falta el folio real, pregunta por la hoja de inscripción).
      
      REGLA CRÍTICA DESPUÉS DE PROCESAR DOCUMENTO:
    - Si se procesó un documento de identificación del comprador y se detectó el nombre → continúa INMEDIATAMENTE con estado civil del comprador.
      - Si se procesó un documento de identificación del vendedor y se detectó el nombre → continúa INMEDIATAMENTE con el siguiente paso(comprador o forma de pago).
      - Si se procesó un documento de identificación del cónyuge y se detectó el nombre → continúa INMEDIATAMENTE con el siguiente paso(forma de pago o participantes del crédito).
      - NUNCA preguntes si el documento "ya lo revisamos" o si "corresponde" a alguien.Si el documento fue procesado y se detectó información, úsala directamente y continúa.
      
      EJEMPLOS DE LO QUE NO DEBES HACER(PROHIBIDO):
    - ❌ "¿El pasaporte de Jinwei ya lo revisamos y corresponde al comprador que me indicaste, o subiste algún otro documento adicional que también deba tomar en cuenta?"
      - ❌ "¿Ya revisamos el documento que subiste?"
        - ❌ "¿Corresponde al comprador el documento que subiste?"
          - ❌ "¿Hay algún otro documento que también deba considerar?"
      
      EJEMPLOS DE LO QUE SÍ DEBES HACER(CORRECTO):
    - ✅ Si se detectó el comprador → "¿Cuál es el estado civil del comprador (soltero, casado, divorciado o viudo)?"
      - ✅ Si se detectó el vendedor → continúa con el siguiente paso del flujo
        - ✅ Si se detectó el cónyuge → continúa con el siguiente paso del flujo
      
      ORDEN DEL FLUJO:
    1. Hoja de inscripción → seleccionar folio → continuar
    2. Comprador → estado civil → cónyuge(si aplica) → forma de pago → créditos(si aplica)
    3. NO vuelvas a preguntar por documentos de inscripción después de avanzar al paso del comprador.
      
      Genera UNA pregunta natural, CORTES Y AMABLE en español.ra obtener la información faltante del estado "${state.name}".
    `

    try {
      const response = await this.llmService.call(prompt, systemPrompts)
      return response.trim()
    } catch (error: any) {
      console.error('[PreavisoPlugin] Error generando pregunta:', error)
      // Fallback a pregunta determinista, pasando los faltantes que ya calculamos
      return this.generateDeterministicQuestion(state, context, missingNow)
    }
  }

  /**
   * Genera pregunta determinista (fallback)
   */
  private generateDeterministicQuestion(state: StateDefinition, context: any, preComputedMissing?: string[]): string {
    // Si ya vienen calculados (desde generateQuestion), usarlos. Si no, calcularlos.
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
      // Verificar si hay múltiples folios candidatos
      const folios = context.folios?.candidates || []
      // O si el blocking reason es explícito
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

    // Fallback general para vendedores si falta algo específico
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
      // Verificar si ya hay institución, si falta, pedirla
      const creditos = context.creditos || []
      const credito0 = creditos[0]
      if (credito0 && !credito0.institucion) {
        return 'Por favor, indícame la institución de crédito.'
      }
      if (credito0?.institucion && (!credito0.participantes || credito0.participantes.length === 0)) {
        return 'Por favor, indícame quiénes participarán en el crédito (acreditado/coacreditado).'
      }
      // Genérico
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
   * Interpreta input del usuario (FLEXIBLE)
   */
  async interpretInput(
    input: string,
    context: any,
    lastAssistantMessage?: string
  ): Promise<InterpretationResult> {
    // 1. Intentar captura determinista
    const deterministic = await this.inputParser.interpret(input, context, lastAssistantMessage)

    if (deterministic.captured) {
      return deterministic
    }

    // 2. Si no hay captura determinista, usar LLM (FLEXIBLE)
    return {
      captured: false,
      needsLLM: true
    }
  }

  /**
   * Procesa documento (extensión)
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<{ commands: Command[]; extractedData?: any }> {
    return this.documentProcessor.processDocument(file, documentType, context)
  }
}
