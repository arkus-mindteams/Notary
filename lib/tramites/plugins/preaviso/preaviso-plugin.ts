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
import { prepareTemplateData } from '../../../preaviso-template-renderer'

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
    const vendedores = context.vendedores || []
    if (vendedores.length === 0) {
      missing.push('vendedores[]')
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
  toFinalJSON(context: any): PreavisoSimplifiedJSON {
    return prepareTemplateData(context)
  }

  /**
   * Genera pregunta usando LLM (FLEXIBLE)
   */
  async generateQuestion(
    state: StateDefinition,
    context: any,
    conversationHistory: any[] = []
  ): Promise<string> {
    // Si ya está todo completo (listo para generar), NO hacer más preguntas.
    // Responder de forma determinista para evitar que el LLM invente "condiciones especiales", "más compradores", etc.
    const missingNow = this.getMissingFields(state, context)
    const validationNow = this.validate(context)
    const g0 = Array.isArray(context?.gravamenes) ? context.gravamenes[0] : null
    const missingAcreedor = context?.inmueble?.existe_hipoteca === true && !g0?.institucion
    if ((state.id === 'ESTADO_8' || (missingNow.length === 0 && validationNow.valid)) && !missingAcreedor) {
      return 'Listo: con la información capturada ya puedes generar el Preaviso. Puedes ver el documento en los botones de arriba del chat.'
    }

    // Guardrail global: si faltan datos mínimos del inmueble, pedirlos ANTES de avanzar a otras secciones.
    // Esto evita que salte a vendedores cuando aún falta dirección/partida/folio.
    const inmueble = context?.inmueble
    const folio = inmueble?.folio_real
    const partidas = inmueble?.partidas || []
    const direccionCalle = inmueble?.direccion?.calle
    if (!folio) {
      // Si hay candidatos detectados (hoja de inscripción), pedir selección explícita.
      const candidates = Array.isArray(context?.folios?.candidates) ? context.folios.candidates : []
      const selection = context?.folios?.selection
      const confirmed = selection?.confirmed_by_user === true && selection?.selected_folio
      if (!confirmed && candidates.length > 0) {
        const items = candidates
          .map((c: any) => {
            const folio = String(c?.folio || '').trim()
            if (!folio) return null
            const attrs = c?.attrs || {}
            const unidad = attrs?.unidad ? `Unidad: ${attrs.unidad}` : null
            const condominio = attrs?.condominio ? `Condominio: ${attrs.condominio}` : null
            const parts = [unidad, condominio].filter(Boolean)
            return parts.length > 0 ? `${folio} (${parts.join(' • ')})` : folio
          })
          .filter(Boolean) as string[]
        if (items.length > 0) {
          return `Detecté los siguientes folios reales:\n- ${items.join('\n- ')}\n¿Cuál debemos usar? Responde con el número del folio.`
        }
      }
      return '¿Cuál es el folio real del inmueble?'
    }
    if (!Array.isArray(partidas) || partidas.length === 0) {
      return '¿Cuál es el número de partida registral del inmueble?'
    }
    if (!direccionCalle) {
      return '¿Cuál es la dirección del inmueble (calle y municipio)?'
    }

    // Guardrail: si hay gravamen y falta acreedor, preguntar ANTES de cancelación
    if (context?.inmueble?.existe_hipoteca === true && !g0?.institucion) {
      return '¿Cuál es la institución acreedora del gravamen/hipoteca? (la institución a la que se le debe)'
    }

    // Determinismo para evitar preguntas irrelevantes/repetidas sobre crédito:
    // - NO preguntar si es 100% crédito, "recursos propios", "otro crédito", etc.
    // - Solo preguntar lo estrictamente necesario para avanzar.
    if (state.id === 'ESTADO_1') {
      // Confirmar forma de pago exactamente una vez
      if (context?.creditos === undefined) {
        return '¿La compraventa se va a pagar de contado o con crédito?'
      }
      // Si ya se confirmó contado, avanzar a lo siguiente (el state machine debería cambiar, pero por seguridad)
      if (Array.isArray(context?.creditos) && context.creditos.length === 0) {
        return 'Perfecto. ¿Me indicas el nombre completo del comprador o compradores que van a adquirir el inmueble?'
      }
      // Si ya se confirmó crédito, NO preguntar “si es el único pago/otro crédito”.
      if (Array.isArray(context?.creditos) && context.creditos.length > 0) {
        const inst = context.creditos[0]?.institucion
        if (!inst) {
          return 'Perfecto, será con crédito. ¿Con qué banco o institución se va a tramitar el crédito?'
        }
        // Ya hay institución, avanzar (roles se preguntan en ESTADO_5)
        return 'Perfecto. ¿Me indicas el nombre completo del comprador o compradores que van a adquirir el inmueble?'
      }
    }

    if (state.id === 'ESTADO_5') {
      // Crédito aplica: si falta institución, pedirla; si falta participantes, pedir roles.
      const inst = context?.creditos?.[0]?.institucion
      if (!inst) {
        return '¿Con qué banco o institución se va a tramitar el crédito?'
      }
      const parts = context?.creditos?.[0]?.participantes
      const hasParts = Array.isArray(parts) && parts.length > 0
      if (!hasParts) {
        const buyer0 = context?.compradores?.[0]
        const estadoCivil = buyer0?.persona_fisica?.estado_civil
        if (estadoCivil && estadoCivil !== 'casado') {
          return '¿El comprador será el único acreditado o habrá otro acreditado/coacreditado?'
        }
        return '¿Quiénes serán los participantes del crédito? Por ejemplo: “el comprador como acreditado” (y coacreditado solo si aplica).'
      }
    }

    if (state.id === 'ESTADO_6') {
      const hasHipoteca = context?.inmueble?.existe_hipoteca === true
      const g0 = Array.isArray(context?.gravamenes) ? context.gravamenes[0] : null
      if (hasHipoteca && !g0?.institucion) {
        return '¿Cuál es la institución acreedora del gravamen/hipoteca? (la institución a la que se le debe)'
      }
    }

    if (state.id === 'ESTADO_6B') {
      // Pregunta clara y neutral, sin inferir institución del crédito del comprador.
      return '¿La hipoteca/gravamen se va a cancelar antes de la compraventa o se cancelará con motivo de esta operación en la misma escritura?'
    }

    if (state.id === 'ESTADO_2') {
      // (cubierto por el guardrail global)
    }

    if (state.id === 'ESTADO_4') {
      const buyer0 = context?.compradores?.[0]
      const buyerName = buyer0?.persona_fisica?.nombre || buyer0?.persona_moral?.denominacion_social || null
      const tipo = buyer0?.tipo_persona || null
      if (!buyerName) {
        return '¿Quién o quiénes van a comprar el inmueble? Indícame el nombre completo del comprador o compradores.'
      }
      if (!tipo) {
        return '¿El comprador es persona física o persona moral?'
      }
      if (tipo === 'persona_fisica' && !buyer0?.persona_fisica?.estado_civil) {
        return `¿Me indicas cuál es el estado civil de ${buyerName} (soltero/a, casado/a, divorciado/a o viudo/a)?`
      }
    }

    if (state.id === 'ESTADO_4B') {
      const buyer0 = context?.compradores?.[0]
      const buyerName = buyer0?.persona_fisica?.nombre || null
      const conyuge = buyer0?.persona_fisica?.conyuge?.nombre || null
      if (buyer0?.persona_fisica?.estado_civil === 'casado' && buyerName && !conyuge) {
        return `Como ${buyerName} está casado/a, ¿me indicas el nombre completo de su cónyuge tal como aparecerá en la escritura?`
      }
    }

    // Usar LLM para generar pregunta natural y flexible
    const systemPrompts = [
      `Eres un asistente notarial ayudando con un ${this.name}.
      
      Tu tarea es generar UNA pregunta natural y clara para obtener la información faltante.
      
      IMPORTANTE:
      - Sé natural y conversacional
      - Haz UNA pregunta a la vez
      - No menciones estados, pasos, o lógica interna
      - Si el usuario ya proporcionó información, no la pidas de nuevo
      - Sé flexible: acepta información fuera de orden
      
      Estado actual: ${state.name}
      Información faltante: ${JSON.stringify(missingNow)}
      
      IMPORTANTE:
      - Si el vendedor ya fue detectado del documento (context.vendedores[0] tiene nombre), NO preguntes por el vendedor.
      - Si el comprador ya fue detectado del documento (context.compradores[0] tiene nombre), NO preguntes por el comprador.
      - Si el cónyuge ya fue detectado del documento (context.compradores[0].persona_fisica.conyuge.nombre existe), NO preguntes por el cónyuge.
      - Si se procesó un documento de identificación y el nombre ya está en el contexto, NO preguntes por confirmación del nombre.
      - Si la forma de pago ya está confirmada (context.creditos está definido), NO vuelvas a preguntar por contado o crédito.
      - Si la institución de crédito ya está detectada (context.creditos[0].institucion existe), NO vuelvas a preguntar por la institución.
      - Si ya se capturó gravamen/hipoteca (context.inmueble.existe_hipoteca es true/false), NO vuelvas a pedir confirmaciones repetidas. Una sola respuesta basta.
      - RFC y CURP son OPCIONALES: NO los pidas. Solo captúralos si el usuario los proporciona o si vienen en los documentos.
      - El valor del inmueble NO es obligatorio: NO lo pidas. Solo captúralo si el usuario lo proporciona.
      - Solo pregunta por información que REALMENTE falta.
      - En este trámite la operación es SIEMPRE una compraventa. PROHIBIDO preguntar si es cesión de derechos, permuta, dación en pago u otra.
      - PROHIBIDO preguntar si incluye anexos/derechos adicionales (estacionamientos, bodegas, etc.). El folio real seleccionado define el inmueble del trámite.
      - PROHIBIDO preguntar si el crédito ya está autorizado, en trámite, aprobado, o estatus similar (NO es dato requerido).
      - PROHIBIDO preguntar quién va a firmar el crédito o "quién firma como acreditado" (NO es dato requerido).
      - PROHIBIDO preguntar si hay otros inmuebles adicionales en la operación (NO es parte de este flujo).
      - PROHIBIDO preguntar por complementos en efectivo / "parte en contado" / "una parte en efectivo" si ya se confirmó que será únicamente con crédito.
      - PROHIBIDO preguntar por tipo de crédito (p. ej. "hipotecario tradicional", "crédito vivienda", etc.). NO es dato requerido; con saber que es crédito y la institución es suficiente.
      - Si ya se capturó gravamen/hipoteca (context.inmueble.existe_hipoteca es true/false), NO vuelvas a preguntar por gravamen/hipoteca.
      - Si existe hipoteca/gravamen (existe_hipoteca=true) y falta definir cancelación, pregunta SOLO UNA VEZ: si se cancelará antes o con motivo de la operación. No repitas.
      - Si ya están completos compradores/vendedor/crédito/gravamen, NO preguntes por "otro comprador", "condiciones especiales" o "¿procedemos?".
      
      REGLA CRÍTICA: DESPUÉS DE PROCESAR UN DOCUMENTO:
      - Si el usuario subió un documento y se procesó, ASUME que la información extraída es correcta.
      - NO preguntes "¿ya lo revisamos?" o "¿corresponde al comprador/vendedor?".
      - NO preguntes por "documentos adicionales" o "otros documentos".
      - Si se detectó información del documento (nombre, etc.), úsala directamente y continúa con el siguiente paso del flujo.
      - Si se detectó el comprador → pregunta por estado civil.
      - Si se detectó el vendedor → continúa con el siguiente paso.
      - Si se detectó el cónyuge → continúa con el siguiente paso.
      - PROHIBIDO preguntar por apoderados, representantes legales, firmantes, administradores, socios o accionistas.
      - Para personas morales: SOLO captura el nombre de la sociedad (denominacion_social). NO preguntes quién firmará, quién es el representante legal, o cualquier información sobre firmantes.
      - Asume que el vendedor (persona física o moral) comparecerá directamente. NO preguntes por información adicional sobre firmantes o representantes.
      - PROHIBIDO preguntar por "documentos relacionados con el inmueble" o "otros documentos" después de procesar un documento de identificación.
      - PROHIBIDO preguntar por "hoja de inscripción", "documentos registrales", "revisar todos los documentos" o "falta alguna hoja" después de procesar un documento de identificación del comprador o vendedor.
      - Si ya se procesó una hoja de inscripción y se seleccionó el folio real, NO vuelvas a preguntar por documentos de inscripción.
      - Si ya se detectó un comprador o vendedor de un documento, continúa con el siguiente paso del flujo (estado civil, forma de pago, etc.). NO preguntes por más documentos.
      - Solo pregunta por documentos adicionales si es necesario para completar información faltante específica (ej: si falta el folio real, pregunta por la hoja de inscripción).
      - ORDEN DEL FLUJO: Hoja de inscripción → seleccionar folio → comprador → estado civil → cónyuge (si aplica) → forma de pago. NO vuelvas atrás a preguntar por documentos de inscripción.
      
      Genera UNA pregunta natural en español.`
    ]

    // Verificar si hay múltiples folios detectados que requieren selección
    const folios = context.folios?.candidates || []
    const hasMultipleFolios = folios.length > 1 && !context.folios?.selection?.selected_folio

    const prompt = `
      Contexto actual:
      ${JSON.stringify(context, null, 2)}
      
      Historial (últimos 3 mensajes):
      ${conversationHistory.slice(-3).map((m: any) => `${m.role}: ${m.content}`).join('\n')}
      
      ${hasMultipleFolios ? `
      IMPORTANTE: Se detectaron múltiples folios reales en el documento. Debes preguntar al usuario cuál folio va a utilizar.
      Folios detectados: ${folios.map((f: any) => typeof f === 'string' ? f : f.folio).join(', ')}
      ` : ''}
      
      INFORMACIÓN YA DETECTADA:
      - Folio real seleccionado: ${context.folios?.selection?.selected_folio || context.inmueble?.folio_real || 'No detectado'}
      - Hoja de inscripción procesada: ${context.documentosProcesados?.some((d: any) => d.tipo === 'inscripcion') ? 'Sí' : 'No'}
      - Vendedor: ${context.vendedores?.[0]?.persona_fisica?.nombre || context.vendedores?.[0]?.persona_moral?.denominacion_social || 'No detectado'}
      - Comprador: ${context.compradores?.[0]?.persona_fisica?.nombre || context.compradores?.[0]?.persona_moral?.denominacion_social || 'No detectado'}
      - Estado civil del comprador: ${context.compradores?.[0]?.persona_fisica?.estado_civil || 'No detectado'}
      - Cónyuge del comprador: ${context.compradores?.[0]?.persona_fisica?.conyuge?.nombre || 'No detectado'}
      - Forma de pago: ${context.creditos === undefined ? 'No confirmada' : (context.creditos?.length === 0 ? 'Contado' : 'Crédito')}
      - Institución de crédito: ${context.creditos?.[0]?.institucion || 'No detectada'}
      
      ⚠️ VERIFICACIÓN CRÍTICA DEL CÓNYUGE (OBLIGATORIA):
      - Cónyuge detectado: ${context.compradores?.[0]?.persona_fisica?.conyuge?.nombre ? 'SÍ - ' + context.compradores[0].persona_fisica.conyuge.nombre : 'NO'}
      - Estado civil del comprador: ${context.compradores?.[0]?.persona_fisica?.estado_civil || 'No detectado'}
      - Si el cónyuge YA ESTÁ DETECTADO (arriba dice "SÍ" con un nombre), NO preguntes por el cónyuge. NUNCA.
      - Si el cónyuge NO está detectado (arriba dice "NO"), entonces SÍ puedes preguntar por el cónyuge.
      - REGLA ABSOLUTA: Si context.compradores[0].persona_fisica.conyuge.nombre existe y no es null/undefined/vacío, el cónyuge YA ESTÁ DETECTADO. NO preguntes.
      - Si el usuario subió un documento del cónyuge y se procesó, el nombre DEBE estar en context.compradores[0].persona_fisica.conyuge.nombre. Si está ahí, NO preguntes.
      
      REGLAS CRÍTICAS (ABSOLUTAS):
      - Si el vendedor ya está detectado, NO preguntes por él.
      - Si el comprador ya está detectado, NO preguntes por él.
      - Si el cónyuge ya está detectado (context.compradores[0].persona_fisica.conyuge.nombre existe), NO preguntes por el cónyuge. NUNCA.
      - Si se procesó un documento de identificación del cónyuge y el nombre ya está en el contexto, NO preguntes por confirmación del nombre.
      - Si la forma de pago ya está confirmada (context.creditos está definido), NO vuelvas a preguntar por contado o crédito.
      - Si la institución de crédito ya está detectada (context.creditos[0].institucion existe), NO vuelvas a preguntar por la institución.
      - RFC y CURP son OPCIONALES: NO los pidas. Solo captúralos si el usuario los proporciona o si vienen en los documentos.
      - El valor del inmueble NO es obligatorio: NO lo pidas. Solo captúralo si el usuario lo proporciona.
      - Solo pregunta por información que REALMENTE falta.
      
      VERIFICACIÓN OBLIGATORIA ANTES DE PREGUNTAR POR CÓNYUGE:
      - ANTES de preguntar por el cónyuge, VERIFICA: context.compradores[0].persona_fisica.conyuge.nombre
      - Si existe (no es null, no es undefined, no es vacío), NO preguntes. El cónyuge ya está detectado.
      - Si el cónyuge ya está detectado, continúa con el siguiente paso (participantes del crédito, forma de pago, etc.).
      - NUNCA preguntes "¿me indicas el nombre completo del cónyuge?" si el nombre ya está en el contexto.
      
      TIPOS DE DOCUMENTOS ESPERADOS:
      - Si preguntas por datos del comprador → espera documento de identificación (INE, pasaporte, licencia, etc.)
      - Si preguntas por estado civil del comprador → acepta texto (soltero/casado/divorciado/viudo). El acta de matrimonio es OPCIONAL (si el usuario la sube, úsala; no la pidas).
      - Si preguntas por cónyuge → acepta texto (nombre completo) o documento de identificación del cónyuge. El acta de matrimonio es OPCIONAL (si el usuario la sube, úsala; no la pidas).
      - Si preguntas por vendedor → espera documento de identificación O hoja de inscripción (si es titular registral)
      - Si preguntas por folio real → espera hoja de inscripción
      
      PROHIBIDO (ABSOLUTO - NUNCA HACER ESTO):
      - ❌ NO preguntes por "documentos relacionados con el inmueble" o "otros documentos" después de procesar un documento.
      - ❌ NO preguntes por más documentos si ya se detectó información del documento procesado.
      - ❌ NO preguntes "¿ya lo revisamos?" o "¿corresponde al comprador?" después de procesar un documento de identificación.
      - ❌ NO preguntes "¿subiste algún otro documento adicional?" después de procesar un documento.
      - ❌ NO preguntes "¿también deba tomar en cuenta?" después de procesar un documento.
      - ❌ NO preguntes "¿El pasaporte de [nombre] ya lo revisamos y corresponde al comprador que me indicaste?" - ESTO ESTÁ PROHIBIDO.
      - ❌ NO preguntes por "hoja de inscripción", "documentos registrales", "revisar todos los documentos" o "falta alguna hoja" si ya se procesó una hoja de inscripción y se seleccionó el folio real.
      - ❌ NO preguntes por documentos de inscripción después de procesar un documento de identificación del comprador o vendedor.
      - ❌ Si ya se detectó un comprador o vendedor de un documento, continúa INMEDIATAMENTE con el siguiente paso del flujo (estado civil, forma de pago, etc.). NO preguntes por documentos adicionales.
      - ✅ Solo pregunta por documentos adicionales si es necesario para completar información faltante específica (ej: si falta el folio real, pregunta por la hoja de inscripción).
      
      REGLA CRÍTICA DESPUÉS DE PROCESAR DOCUMENTO:
      - Si se procesó un documento de identificación del comprador y se detectó el nombre → continúa INMEDIATAMENTE con estado civil del comprador.
      - Si se procesó un documento de identificación del vendedor y se detectó el nombre → continúa INMEDIATAMENTE con el siguiente paso (comprador o forma de pago).
      - Si se procesó un documento de identificación del cónyuge y se detectó el nombre → continúa INMEDIATAMENTE con el siguiente paso (forma de pago o participantes del crédito).
      - NUNCA preguntes si el documento "ya lo revisamos" o si "corresponde" a alguien. Si el documento fue procesado y se detectó información, úsala directamente y continúa.
      
      EJEMPLOS DE LO QUE NO DEBES HACER (PROHIBIDO):
      - ❌ "¿El pasaporte de Jinwei ya lo revisamos y corresponde al comprador que me indicaste, o subiste algún otro documento adicional que también deba tomar en cuenta?"
      - ❌ "¿Ya revisamos el documento que subiste?"
      - ❌ "¿Corresponde al comprador el documento que subiste?"
      - ❌ "¿Hay algún otro documento que también deba considerar?"
      
      EJEMPLOS DE LO QUE SÍ DEBES HACER (CORRECTO):
      - ✅ Si se detectó el comprador → "¿Cuál es el estado civil del comprador (soltero, casado, divorciado o viudo)?"
      - ✅ Si se detectó el vendedor → continúa con el siguiente paso del flujo
      - ✅ Si se detectó el cónyuge → continúa con el siguiente paso del flujo
      
      ORDEN DEL FLUJO:
      1. Hoja de inscripción → seleccionar folio → continuar
      2. Comprador → estado civil → cónyuge (si aplica) → forma de pago → créditos (si aplica)
      3. NO vuelvas a preguntar por documentos de inscripción después de avanzar al paso del comprador.
      
      Genera UNA pregunta natural para obtener la información faltante del estado "${state.name}".
    `

    try {
      const response = await this.llmService.call(prompt, systemPrompts)
      return response.trim()
    } catch (error: any) {
      console.error('[PreavisoPlugin] Error generando pregunta:', error)
      // Fallback a pregunta determinista
      return this.generateDeterministicQuestion(state, context)
    }
  }

  /**
   * Genera pregunta determinista (fallback)
   */
  private generateDeterministicQuestion(state: StateDefinition, context: any): string {
    const missing = this.getMissingFields(state, context)
    
    if (missing.length === 0) {
      return 'Listo: con la información capturada ya puedes generar el Preaviso. Puedes ver el documento en los botones de arriba del chat.'
    }

    const firstMissing = missing[0]
    
    if (firstMissing.includes('folio_real')) {
      // Verificar si hay múltiples folios candidatos
      const folios = context.folios?.candidates || []
      if (folios.length > 1) {
        const folioList = folios.map((f: any) => {
          const folio = typeof f === 'string' ? f : f.folio
          return `- Folio ${folio}`
        }).join('\n')
        return `En la hoja de inscripción detecté más de un folio real. Por favor, indícame exactamente cuál es el folio real que vamos a utilizar para este trámite:\n\n${folioList}\n\n(responde con el número del folio exactamente)`
      }
      return 'Por favor, indícame el folio real del inmueble.'
    }
    
    if (firstMissing.includes('compradores')) {
      return 'Por favor, indícame el nombre completo del comprador y si es persona física o persona moral.'
    }
    
    if (firstMissing.includes('vendedores')) {
      // Verificar si ya tenemos el nombre pero falta tipo_persona o confirmación
      const vendedor = context.vendedores?.[0]
      const nombre = vendedor?.persona_fisica?.nombre || vendedor?.persona_moral?.denominacion_social
      const isConfirmed = vendedor?.titular_registral_confirmado === true
      
      // Si ya está confirmado y tiene nombre y tipo_persona, no debería estar aquí
      // Pero por si acaso, verificar
      if (nombre && vendedor?.tipo_persona && isConfirmed) {
        // Ya está completo, no debería preguntar - esto no debería pasar
        console.warn('[PreavisoPlugin] Vendedor completo pero aparece en missing:', { nombre, tipo_persona: vendedor.tipo_persona, isConfirmed })
        return '¿Hay algo más que necesites agregar o modificar?'
      }
      
      if (nombre && !vendedor?.tipo_persona) {
        return `Tengo capturado como posible vendedor: ${nombre}. ¿Confirmas que es el titular registral y me indicas si es persona física o persona moral?`
      }
      
      if (nombre && vendedor?.tipo_persona && !isConfirmed) {
        return `Tengo capturado como posible vendedor: ${nombre} (${vendedor.tipo_persona === 'persona_fisica' ? 'persona física' : 'persona moral'}). ¿Confirmas que es el titular registral?`
      }
      
      return 'Por favor, confirma el nombre del titular registral (vendedor) y si es persona física o persona moral.'
    }
    
    if (firstMissing.includes('tipo_pago')) {
      // Verificar si ya está confirmado
      if (context.creditos !== undefined) {
        // Ya está confirmado, no debería estar aquí
        return '¿Hay algo más que necesites agregar o modificar?'
      }
      return '¿La compraventa será de contado o con crédito?'
    }
    
    if (firstMissing.includes('creditos')) {
      // Verificar si ya hay institución
      const creditos = context.creditos || []
      const credito0 = creditos[0]
      if (credito0?.institucion) {
        // Ya tiene institución, preguntar por participantes
        return 'Por favor, indícame quiénes participarán en el crédito (acreditado/coacreditado).'
      }
      return 'Por favor, indícame la institución de crédito (banco, INFONAVIT, FOVISSSTE, etc.).'
    }
    
    if (firstMissing.includes('existe_hipoteca')) {
      return '¿Hay algún gravamen o hipoteca vigente o pendiente por cancelar?'
    }

    // Cancelación de gravamen/hipoteca (opción A): si existe, preguntar una sola vez si se cancelará
    if (firstMissing.includes('cancelacion_confirmada')) {
      const folio = context?.inmueble?.folio_real || context?.folios?.selection?.selected_folio || null
      const folioTxt = folio ? ` (folio real ${folio})` : ''
      return `Como el inmueble${folioTxt} tiene hipoteca/gravamen, ¿esa hipoteca/gravamen se cancelará antes o con motivo de la operación? (responde sí/no)`
    }

    return 'Por favor, proporciona la información faltante.'
  }

  /**
   * Obtiene campos faltantes de un estado
   */
  private getMissingFields(state: StateDefinition, context: any): string[] {
    const missing: string[] = []
    
    for (const field of state.fields) {
      if (!this.hasField(context, field)) {
        missing.push(field)
      }
    }
    
    // Verificar campos especiales que pueden estar en múltiples lugares
    // Si falta persona_fisica.nombre pero existe persona_moral.denominacion_social (o viceversa), no es faltante
    const vendedorFields = missing.filter(f => f.includes('vendedores'))
    const compradorFields = missing.filter(f => f.includes('compradores'))
    
    // Para vendedores: si tiene nombre en persona_fisica O persona_moral, y tiene tipo_persona, está completo
    if (vendedorFields.some(f => f.includes('persona_fisica.nombre') || f.includes('persona_moral.denominacion_social'))) {
      const vendedor = context.vendedores?.[0]
      const hasNombre = vendedor?.persona_fisica?.nombre || vendedor?.persona_moral?.denominacion_social
      const hasTipoPersona = vendedor?.tipo_persona
      const isConfirmed = vendedor?.titular_registral_confirmado === true
      
      // Si tiene nombre, tipo_persona y está confirmado, está completo
      // Si viene del documento (tiene persona_moral o persona_fisica con nombre), también está completo
      if (hasNombre && hasTipoPersona) {
        // Si está confirmado O viene del documento (tiene estructura completa), está completo
        if (isConfirmed || (vendedor?.persona_moral?.denominacion_social || vendedor?.persona_fisica?.nombre)) {
          // Remover TODOS los campos de vendedor de missing si ya está completo
          const toRemove = vendedorFields.filter(f => 
            f.includes('nombre') || 
            f.includes('denominacion_social') || 
            f.includes('tipo_persona') ||
            f.includes('titular_registral_confirmado')
          )
          toRemove.forEach(f => {
            const idx = missing.indexOf(f)
            if (idx >= 0) missing.splice(idx, 1)
          })
        }
      }
    }
    
    // Similar para compradores
    if (compradorFields.some(f => f.includes('persona_fisica.nombre'))) {
      const comprador = context.compradores?.[0]
      const hasNombre = comprador?.persona_fisica?.nombre || comprador?.persona_moral?.denominacion_social
      const hasTipoPersona = comprador?.tipo_persona
      if (hasNombre && hasTipoPersona) {
        const toRemove = compradorFields.filter(f => f.includes('nombre') || f.includes('denominacion_social'))
        toRemove.forEach(f => {
          const idx = missing.indexOf(f)
          if (idx >= 0) missing.splice(idx, 1)
        })
      }
    }
    
    return missing
  }

  /**
   * Verifica si un campo existe
   */
  private hasField(context: any, fieldPath: string): boolean {
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
        // Si estamos buscando "nombre" o "denominacion_social" en vendedores/compradores,
        // verificar en persona_fisica O persona_moral
        if ((part === 'nombre' || part === 'denominacion_social') && 
            (current.persona_fisica || current.persona_moral)) {
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
