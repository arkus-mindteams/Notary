/**
 * Input Parser
 * Detecta comandos del usuario de forma determinista
 * Reemplaza la lógica dispersa de applyDeterministicUserInputUpdate
 */

import { CaptureRule, InterpretationResult } from '../base/types'
import { ValidationService } from './services/validation-service'
import { ConyugeService } from './services/conyuge-service'

export class InputParser {
  private rules: CaptureRule[] = []

  constructor() {
    this.initializeRules()
  }

  /**
   * Inicializa reglas de captura deterministas
   */
  private initializeRules(): void {
    // 1. Estado civil
    this.rules.push({
      name: 'estado_civil',
      pattern: /^(soltero|casado|divorciado|viudo)$/i,
      condition: (input, context) => {
        // Solo si estamos esperando estado civil
        const buyer = context.compradores?.[0]
        return !buyer?.persona_fisica?.estado_civil
      },
      extract: (input) => ({
        buyerIndex: 0,
        estadoCivil: ValidationService.normalizeEstadoCivil(input)
      }),
      handler: 'EstadoCivilHandler'
    })

    // 2. Tipo persona (moral/física)
    this.rules.push({
      name: 'tipo_persona',
      pattern: /^(moral|fisica|física|persona\s+moral|persona\s+fisica|persona\s+física)$/i,
      condition: (input, context) => {
        // Solo si estamos esperando tipo persona
        const buyer = context.compradores?.[0]
        const seller = context.vendedores?.[0]
        return !buyer?.tipo_persona && !seller?.tipo_persona
      },
      extract: (input) => {
        const tipo = /moral/i.test(input) ? 'persona_moral' : 'persona_fisica'
        return { tipoPersona: tipo }
      },
      handler: 'TipoPersonaHandler'
    })

    // 3. Método de pago
    // IMPORTANTE: En v1.4, la forma de pago se determina por creditos:
    // - creditos === undefined → no confirmado
    // - creditos === [] → contado confirmado
    // - creditos === [...] → crédito confirmado
    this.rules.push({
      name: 'payment_method',
      // Patrón más flexible: acepta "contado", "credito", "crédito", "será crédito", "con crédito", etc.
      pattern: /(?:^|\s)(contado|credito|crédito)(?:\s|$)/i,
      condition: (input, context) => {
        // Solo capturar si la forma de pago no está confirmada (creditos es undefined)
        if (context.creditos !== undefined) {
          return false // Ya está confirmado
        }
        // Verificar que realmente está hablando de forma de pago
        const inputLower = input.toLowerCase()
        const mentionsPayment = 
          inputLower.includes('pago') ||
          inputLower.includes('forma') ||
          inputLower.includes('será') ||
          inputLower.includes('sera') ||
          inputLower.includes('mediante') ||
          inputLower.includes('con') ||
          inputLower.includes('a través') ||
          inputLower.includes('por')
        // Si menciona palabras relacionadas con pago O es una respuesta simple (solo "credito" o "contado")
        return mentionsPayment || /^(contado|credito|crédito)$/i.test(input.trim())
      },
      extract: (input) => {
        const inputLower = input.toLowerCase()
        const isContado = /contado/i.test(inputLower)
        return {
          method: isContado ? 'contado' : 'credito'
        }
      },
      handler: 'PaymentMethodHandler'
    })

    // 4. Folio real (número)
    this.rules.push({
      name: 'folio_selection',
      pattern: /^\d{6,8}$/,
      condition: (input, context) => {
        const folios = context.folios?.candidates || []
        return folios.length > 0
      },
      extract: (input, context) => {
        const folios = context.folios?.candidates || []
        const selectedFolio = input.trim()
        
        // Verificar que el folio existe en candidatos
        const folioExists = folios.some((f: any) => {
          const folioValue = typeof f === 'string' ? f : f.folio
          return String(folioValue).replace(/\D/g, '') === selectedFolio.replace(/\D/g, '')
        })

        if (!folioExists) return null

        return {
          selectedFolio,
          confirmedByUser: true
        }
      },
      handler: 'FolioSelectionHandler'
    })

    // 6. Institución de crédito (nombres comunes)
    // IMPORTANTE: Esta regla solo se activa si isCreditInstitutionContext() retorna true
    // Esto asegura que solo capturamos instituciones cuando realmente estamos en contexto de crédito
    this.rules.push({
      name: 'credit_institution',
      // Patrón más flexible: acepta instituciones en cualquier formato (mayúsculas, minúsculas, con espacios)
      pattern: /\b(bbva|santander|banorte|hsbc|banamex|infonavit|fovissste|banco\s+azteca|banco\s+del\s+bienestar)\b/i,
      condition: (input, context) => {
        // Esta condición es una verificación adicional (la principal está en isCreditInstitutionContext)
        // Verificar que hay créditos confirmados
        const creditos = context.creditos || []
        if (creditos.length === 0) {
          return false // No hay créditos confirmados
        }
        
        // Verificar que el primer crédito no tiene institución
        const credito0 = creditos[0]
        if (credito0?.institucion) {
          return false // Ya tiene institución
        }
        
        return true // Falta institución y hay créditos confirmados
      },
      extract: (input) => {
        // Extraer la institución del texto (puede estar en cualquier parte)
        const match = input.match(/\b(bbva|santander|banorte|hsbc|banamex|infonavit|fovissste|banco\s+azteca|banco\s+del\s+bienestar)\b/i)
        if (!match) return null
        return {
          creditIndex: 0,
          institution: this.normalizeInstitution(match[1])
        }
      },
      handler: 'CreditInstitutionHandler'
    })

    // 7. Participantes de crédito (patrones comunes)
    // 7.1 Participantes duales en una sola frase (acreditado + coacreditado)
    // Ej: "el comprador como acreditado y su cónyuge como coacreditado"
    this.rules.push({
      name: 'credit_participants_dual',
      pattern: /(acreditad[oa]).*(coacreditad[oa])|(coacreditad[oa]).*(acreditad[oa])/i,
      condition: (input, context) => {
        return Array.isArray(context?.creditos) && context.creditos.length > 0
      },
      extract: (input, context) => {
        const t = String(input || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
        const mentionsBuyer = /\b(comprador|compradora)\b/.test(t)
        const mentionsConyuge = /\b(conyuge|conyugue|espos[oa])\b/.test(t)
        if (!mentionsBuyer || !mentionsConyuge) return null

        return {
          __commands: [
            {
              type: 'credit_participant',
              timestamp: new Date(),
              payload: {
                creditIndex: 0,
                participant: { partyId: 'comprador_1', role: 'acreditado', isConyuge: false }
              }
            },
            {
              type: 'credit_participant',
              timestamp: new Date(),
              payload: {
                creditIndex: 0,
                participant: { role: 'coacreditado', isConyuge: true }
              }
            }
          ]
        }
      },
      handler: 'CreditParticipantHandler'
    })

    this.rules.push({
      name: 'credit_participant',
      // Aceptar variantes: "será/sera", masculino/femenino: acreditado/acreditada, coacreditado/coacreditada
      pattern: /(?:como|es|ser[aá])\s+(acreditad[oa]|coacreditad[oa])/i,
      condition: (input, context) => {
        // v1.4: créditos confirmados si creditos es array con al menos 1
        return Array.isArray(context?.creditos) && context.creditos.length > 0
      },
      extract: (input, context) => {
        const match = input.match(/(?:como|es|ser[aá])\s+(acreditad[oa]|coacreditad[oa])/i)
        if (!match) return null

        const token = String(match[1] || '').toLowerCase()
        const role = token.includes('coacreditad') ? 'coacreditado' : 'acreditado'
        
        // Intentar extraer nombre
        const nameMatch = input.match(/^([^,]+?)(?:\s+como|\s+es|\s+ser[aá])/i)
        let name = nameMatch ? nameMatch[1].trim() : null

        // Si el usuario escribe "el comprador / la compradora / el cónyuge" (o con typos),
        // NO tomarlo como nombre literal. Mapear a party_id o cónyuge.
        const normalize = (s: string) =>
          String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        const nm = name ? normalize(name) : ''
        const looksLikeBuyerPlaceholder =
          nm === 'el comprador' ||
          nm === 'la compradora' ||
          nm === 'su comprador' ||
          nm.startsWith('el comprad') || // "el compradoy", "el comprador", etc.
          nm.startsWith('la comprad')
        const looksLikeConyugePlaceholder =
          nm === 'el conyuge' ||
          nm === 'la conyuge' ||
          nm === 'su conyuge' ||
          nm === 'su conyugue' ||
          nm.startsWith('el conyug') ||
          nm.startsWith('la conyug')
        if (name && (looksLikeBuyerPlaceholder || looksLikeConyugePlaceholder)) {
          name = null
        }

        // Si no hay nombre pero es coacreditado, puede ser el cónyuge
        let isConyuge = false
        if (role === 'coacreditado' && (!name || looksLikeConyugePlaceholder)) {
          const conyugeNombre = ConyugeService.getConyugeNombre(context)
          if (conyugeNombre) {
            isConyuge = true
          }
        }

        // Resolver partyId cuando el texto refiere al comprador/cónyuge en vez de un nombre explícito
        let partyId: string | null = null
        if (!name && role === 'acreditado') {
          // Default: el acreditado principal es el comprador_1
          partyId = 'comprador_1'
        }

        return {
          creditIndex: 0,
          participant: {
            name: name && ValidationService.isValidName(name) ? name : null,
            partyId: partyId || undefined,
            role,
            isConyuge
          }
        }
      },
      handler: 'CreditParticipantHandler'
    })

    // 8. Gravámenes / hipoteca (respuestas cortas y naturales)
    this.rules.push({
      name: 'encumbrance',
      // Capturar respuestas típicas: "no tiene", "no hay", "libre", "sin hipoteca", "confirmo", "sí"
      // Incluye variantes comunes:
      // - "es/esta/está libre de gravamen"
      // - "libre de gravamen"
      // - "sin hipoteca"
      // - "no tiene"
      pattern: /^(?:\s*(?:es|esta|está)\s+)?(?:sí|si|no|confirmo|confirmado|correcto|libre(?:\s+de\s+(?:gravamen(?:es)?|hipoteca))?|sin\s+(?:gravamen(?:es)?|hipoteca)|no\s+(?:tiene|hay)(?:\s+(?:gravamen(?:es)?|hipoteca))?)\s*$/i,
      condition: (input, context, lastAssistantMessage?: string) => {
        // Solo si aún no está contestado en el contexto
        const unanswered = context.inmueble?.existe_hipoteca === null || context.inmueble?.existe_hipoteca === undefined
        if (!unanswered) return false
        return this.isEncumbranceContext(context, lastAssistantMessage)
      },
      extract: (input, context, lastAssistantMessage?: string) => {
        const t = String(input || '').trim().toLowerCase()
          .replace(/\.+/g, ' ')
          .replace(/\s+/g, ' ')
        const last = String(lastAssistantMessage || '').toLowerCase()

        // Negaciones claras
        if (t === 'no' || t.startsWith('no ') || t.includes('sin ') || t.includes('libre')) {
          return { exists: false }
        }
        // Afirmación clara
        if (t === 'si' || t === 'sí') {
          return { exists: true }
        }
        // Confirmaciones: inferir según lo que el asistente acaba de afirmar/pedir confirmar
        if (t === 'confirmo' || t === 'confirmado' || t === 'correcto') {
          // Si el asistente menciona "libre/sin hipoteca/sin gravamen", es confirmación de NO gravamen
          if (/\b(libre|sin\s+hipoteca|sin\s+gravamen|libre\s+de)\b/.test(last)) {
            return { exists: false }
          }
          // Si el asistente está confirmando que "hay/existe/tiene hipoteca/gravamen", es confirmación de SÍ
          if (/\b(hay|existe|tiene)\b/.test(last) && /\b(hipoteca|gravamen|embargo)\b/.test(last)) {
            return { exists: true }
          }
          return null
        }
        return null
      },
      handler: 'EncumbranceHandler'
    })

    // 8B. Cancelación de hipoteca/gravamen (sí/no) — opción A
    // Se activa SOLO si el asistente acaba de preguntar si se cancelará y aún no está definido.
    this.rules.push({
      name: 'encumbrance_cancellation',
      pattern: /^(sí|si|no|confirmo|confirmado|correcto)$/i,
      condition: (input, context, lastAssistantMessage?: string) => {
        const hasHipoteca = context?.inmueble?.existe_hipoteca === true
        const g0 = Array.isArray(context?.gravamenes) ? context.gravamenes[0] : null
        const needsAnswer = !g0 || g0.cancelacion_confirmada === null || g0.cancelacion_confirmada === undefined
        if (!hasHipoteca || !needsAnswer) return false
        return this.isEncumbranceCancellationContext(lastAssistantMessage)
      },
      extract: (input) => {
        const t = String(input || '').trim().toLowerCase()
        const yes = t === 'si' || t === 'sí' || t === 'confirmo' || t === 'confirmado' || t === 'correcto'
        // Semántica actual del renderer:
        // - cancelacion_confirmada === false => cancelación PENDIENTE => IMPRIMIR acto de cancelación
        // - cancelacion_confirmada === true => NO imprimir acto de cancelación
        // Opción A:
        // - Si el usuario dice "sí se cancelará" => pendiente (false)
        // - Si dice "no se cancelará" => no aplica (true)
        return { exists: true, cancellationConfirmed: yes ? false : true }
      },
      handler: 'EncumbranceHandler'
    })

    // 9. Nombre de cónyuge (cuando se escribe manualmente)
    this.rules.push({
      name: 'conyuge_name',
      pattern: /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}$/, // Nombre completo (2-5 palabras)
      condition: (input, context) => {
        // Solo si estamos esperando nombre de cónyuge
        const buyer = context.compradores?.[0]
        const buyerNombre = buyer?.persona_fisica?.nombre
        const conyugeNombre = buyer?.persona_fisica?.conyuge?.nombre
        
        // Verificar que:
        // 1. Hay comprador
        // 2. El comprador está casado o se está preguntando por el cónyuge
        // 3. El nombre no es del comprador
        // 4. No hay cónyuge ya capturado
        if (!buyerNombre || conyugeNombre) return false
        
        // Verificar que el nombre no es del comprador
        const inputNormalized = ConyugeService.normalizeName(input)
        const buyerNormalized = ConyugeService.normalizeName(buyerNombre)
        
        if (inputNormalized === buyerNormalized) return false
        
        // Verificar que es un nombre válido
        if (!ValidationService.isValidName(input)) return false
        
        // Solo si la última pregunta del asistente menciona cónyuge o estado civil
        return true // Permitir siempre si es un nombre válido y no es del comprador
      },
      extract: (input, context) => {
        const buyer = context.compradores?.[0]
        const buyerNombre = buyer?.persona_fisica?.nombre
        const inputNormalized = ConyugeService.normalizeName(input)
        const buyerNormalized = ConyugeService.normalizeName(buyerNombre || '')
        
        // Si el nombre es del comprador, no es cónyuge
        if (inputNormalized === buyerNormalized) return null
        
        return {
          buyerIndex: 0,
          name: input.trim(),
          source: 'texto_manual'
        }
      },
      handler: 'ConyugeNameHandler'
    })
  }

  /**
   * Interpreta input del usuario
   */
  async interpret(
    input: string,
    context: any,
    lastAssistantMessage?: string
  ): Promise<InterpretationResult> {
    const normalizedInput = input.trim()

    // Filtrar mensajes auto-generados
    if (/\bhe\s+subido\s+el\s+siguiente\s+documento\b/i.test(normalizedInput)) {
      return { captured: false, needsLLM: false }
    }

    // Intentar captura determinista
    for (const rule of this.rules) {
      if (rule.pattern.test(normalizedInput)) {
        // Para reglas de crédito, verificar contexto adicional
        if (rule.name === 'credit_institution') {
          if (!this.isCreditInstitutionContext(context, lastAssistantMessage)) {
            continue // No estamos en contexto de crédito, saltar esta regla
          }
        }
        
        if (rule.condition(normalizedInput, context, lastAssistantMessage)) {
          const extracted = rule.extract(normalizedInput, context, lastAssistantMessage)
          
          if (extracted) {
            return {
              captured: true,
              captureRule: rule,
              data: extracted,
              needsLLM: false
          }
          }
        }
      }
    }

    // Si no hay captura determinista, usar LLM
    return {
      captured: false,
      needsLLM: true
    }
  }

  /**
   * Verifica si estamos en contexto de preguntar por institución de crédito
   */
  private isCreditInstitutionContext(context: any, lastAssistantMessage?: string): boolean {
    // 1. Verificar que hay créditos confirmados en el contexto
    const creditos = context.creditos || []
    if (creditos.length === 0) {
      // No hay créditos confirmados, no estamos en contexto de crédito
      return false
    }

    // 2. Verificar que el primer crédito no tiene institución ya
    const credito0 = creditos[0]
    if (credito0?.institucion) {
      // Ya tiene institución, no deberíamos estar preguntando por ella
      return false
    }

    // 3. Verificar que el último mensaje del asistente está preguntando por institución de crédito
    if (lastAssistantMessage) {
      const msg = lastAssistantMessage.toLowerCase()
      const isAskingForInstitution = 
        msg.includes('institución') || 
        msg.includes('institucion') ||
        msg.includes('banco') ||
        msg.includes('infonavit') ||
        msg.includes('fovissste') ||
        msg.includes('crédito') ||
        msg.includes('credito') ||
        msg.includes('qué institución') ||
        msg.includes('que institucion') ||
        msg.includes('con qué') ||
        msg.includes('con que') ||
        msg.includes('tipo de crédito') ||
        msg.includes('tipo de credito')
      
      if (!isAskingForInstitution) {
        // El asistente no está preguntando por institución, no capturar
        return false
      }
    } else {
      // Si no hay mensaje del asistente, ser conservador y no capturar
      return false
    }

    // 4. Verificar que la forma de pago está confirmada como crédito
    // Si creditos.length > 0, significa que se confirmó crédito (contado sería creditos = [])
    return true
  }

  /**
   * Verifica si estamos en contexto de preguntar por gravamen/hipoteca
   */
  private isEncumbranceContext(context: any, lastAssistantMessage?: string): boolean {
    if (!lastAssistantMessage) return false
    const msg = String(lastAssistantMessage || '').toLowerCase()
    const asksEncumbrance =
      msg.includes('gravamen') ||
      msg.includes('hipoteca') ||
      msg.includes('libre de') ||
      msg.includes('libre') ||
      msg.includes('inscrito') ||
      msg.includes('folio real')
    return asksEncumbrance
  }

  private isEncumbranceCancellationContext(lastAssistantMessage?: string): boolean {
    const msg = String(lastAssistantMessage || '').toLowerCase()
    return (
      msg.includes('se cancel') ||
      msg.includes('cancelacion') ||
      msg.includes('cancelación') ||
      (msg.includes('antes') && msg.includes('motivo')) ||
      (msg.includes('hipoteca') && msg.includes('cancel'))
    )
  }

  /**
   * Normaliza nombre de institución
   */
  private normalizeInstitution(input: string): string {
    const normalized = input.toLowerCase().trim()
    
    const mapping: Record<string, string> = {
      'bbva': 'BBVA',
      'santander': 'Santander',
      'banorte': 'Banorte',
      'hsbc': 'HSBC',
      'banamex': 'Banamex',
      'infonavit': 'INFONAVIT',
      'fovissste': 'FOVISSSTE',
      'banco azteca': 'Banco Azteca',
      'banco del bienestar': 'Banco del Bienestar'
    }

    // Si el input ya está en mayúsculas o tiene formato correcto, retornarlo tal cual
    if (mapping[normalized]) {
      return mapping[normalized]
    }
    
    // Si no está en el mapping pero parece una institución válida, retornar en mayúsculas
    if (normalized.length > 2 && /^[a-z\s]+$/i.test(input)) {
      return input.toUpperCase()
    }
    
    return input
  }
}
