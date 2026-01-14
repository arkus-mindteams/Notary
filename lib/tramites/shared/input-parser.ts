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
    // 0. Crédito + institución en una sola frase (muy común)
    // Ej: "credito de BBVA", "crédito BBVA", "será crédito con Banregio"
    // Objetivo: evitar que el sistema vuelva a preguntar por el banco si ya venía en la primera respuesta.
    this.rules.push({
      name: 'payment_method_with_institution',
      pattern: /\b(credito|cr[eé]dito)\b[\s\S]{0,40}\b([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.&'-]{1,40})\b/i,
      condition: (input, context) => {
        // Solo si aún no está confirmada la forma de pago o falta institución
        const creditos = context?.creditos
        const noConfirmedPayment = creditos === undefined
        const missingInstitution =
          Array.isArray(creditos) &&
          creditos.length > 0 &&
          !creditos[0]?.institucion
        return noConfirmedPayment || missingInstitution
      },
      extract: (input, context) => {
        const text = String(input || '')
        // Heurística: encontrar institución después de "credito/crédito" o "con"
        // Primero: match de instituciones comunes
        const common = text.match(/\b(bbva|santander|banorte|hsbc|banamex|infonavit|fovissste|banco\s+azteca|banco\s+del\s+bienestar)\b/i)
        let institution = common ? this.normalizeInstitution(common[1]) : null
        if (!institution) {
          const m =
            text.match(/\b(?:credito|cr[eé]dito)\b\s*(?:de|con)?\s*([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.&'\"()-]{1,40})/i) ||
            text.match(/\bcon\s+(?:el\s+)?(?:banco\s+)?([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.&'\"()-]{1,40})/i)
          if (m && m[1]) {
            institution = this.extractInstitutionFreeform(m[1])
          }
        }
        if (!institution) return null

        const cmds: any[] = []
        if (context?.creditos === undefined) {
          cmds.push({
            type: 'payment_method',
            timestamp: new Date(),
            payload: { method: 'credito' }
          })
        }
        cmds.push({
          type: 'credit_institution',
          timestamp: new Date(),
          payload: { creditIndex: 0, institution }
        })
        return { __commands: cmds }
      },
      handler: 'CreditInstitutionHandler'
    })

    // 1. Estado civil
    this.rules.push({
      name: 'estado_civil',
      pattern: /^(solter[oa]|casad[oa]|divorciad[oa]|viud[oa])$/i,
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

    // 1B. Nombre del comprador (texto libre) cuando falta en el contexto
    // Caso real: el usuario escribe el nombre (sin documento) y luego el sistema pregunta estado civil.
    // Si no capturamos el nombre en estructura, el asistente "pierde el contexto" y lo vuelve a pedir.
    this.rules.push({
      name: 'buyer_name_freeform',
      // Nombre completo 2-6 palabras (incluye acentos, mayúsculas).
      // Acepta entradas en MAYÚSCULAS como "FELIX GARCIA MIGUEL ANGEL".
      pattern: /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,6}$/,
      condition: (input, context, lastAssistantMessage?: string) => {
        const buyer0Name = context?.compradores?.[0]?.persona_fisica?.nombre || context?.compradores?.[0]?.persona_moral?.denominacion_social
        if (buyer0Name) return false
        if (!ValidationService.isValidName(input)) return false
        // Solo capturar si el asistente estaba pidiendo comprador (para no confundir con vendedor/cónyuge).
        if (context?._last_question_intent === 'buyer_name') return true
        const msg = String(lastAssistantMessage || '').toLowerCase()
        const asksBuyer =
          msg.includes('comprador') ||
          msg.includes('compradora') ||
          msg.includes('quién va a comprar') ||
          msg.includes('quien va a comprar') ||
          msg.includes('quiénes van a comprar') ||
          msg.includes('quienes van a comprar') ||
          msg.includes('nombre completo del comprador')
        return asksBuyer
      },
      extract: (input) => ({
        buyerIndex: 0,
        name: input.trim(),
        inferredTipoPersona: 'persona_fisica',
        source: 'texto_manual'
      }),
      handler: 'BuyerNameHandler'
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

    // 2B. Nombre del vendedor (texto libre) cuando falta en el contexto
    // Ej: "INMOBILIARIA Y FRACCIONADORA CADENA, S.A. PROMOTORA DE INVERSION DE C.V"
    this.rules.push({
      name: 'seller_name_freeform',
      pattern: /^[A-ZÁÉÍÓÚÑ0-9][A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s\.\,&'\-()]{5,}$/,
      condition: (input, context, lastAssistantMessage?: string) => {
        const seller0Name =
          context?.vendedores?.[0]?.persona_fisica?.nombre ||
          context?.vendedores?.[0]?.persona_moral?.denominacion_social
        if (seller0Name) return false
        if (!ValidationService.isValidName(input)) return false

        if (context?._last_question_intent === 'seller_name') return true
        const msg = String(lastAssistantMessage || '').toLowerCase()
        const asksSeller =
          msg.includes('vendedor') ||
          msg.includes('vendedora') ||
          msg.includes('titular registral') ||
          msg.includes('quién es el vendedor') ||
          msg.includes('quien es el vendedor') ||
          msg.includes('nombre completo del vendedor')
        return asksSeller
      },
      extract: (input) => ({
        name: input.trim(),
        inferredTipoPersona: ValidationService.inferTipoPersona(input) || 'persona_moral',
        confirmed: true,
        source: 'user_input'
      }),
      handler: 'TitularRegistralHandler'
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
      condition: (input, context, lastAssistantMessage?: string) => {
        // Solo capturar si la forma de pago no está confirmada (creditos es undefined)
        if (context.creditos !== undefined) {
          return false // Ya está confirmado
        }
        // Verificar que realmente está hablando de forma de pago
        const inputLower = input.toLowerCase()
        // Si el usuario está hablando de gravamen/hipoteca/cancelación, NO capturar forma de pago
        // a menos que el asistente esté preguntando explícitamente por contado vs crédito.
        const mentionsEncumbrance = /\b(gravamen|gravamenes|hipoteca|cancelaci[oó]n|cancelar|se\s+cancel)\b/i.test(inputLower)
        const isAskingPayment =
          context?._last_question_intent === 'payment_method' ||
          this.isPaymentMethodContext(lastAssistantMessage)
        if (mentionsEncumbrance && !isAskingPayment) {
          return false
        }

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
        // Guardrail adicional: si no es respuesta simple, exigir que el asistente haya preguntado por forma de pago.
        if (/^(contado|credito|crédito)$/i.test(input.trim())) return true
        return isAskingPayment && mentionsPayment
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
        // Permitir selección desde candidatos (cuando hay hoja de inscripción)
        // y también captura manual (cuando no hay candidatos aún).
        const folios = context.folios?.candidates || []
        const alreadyHasFolio = !!context?.inmueble?.folio_real
        return !alreadyHasFolio || folios.length > 0
      },
      extract: (input, context) => {
        const folios = context.folios?.candidates || []
        const selectedFolio = input.trim()
        
        // Si hay candidatos, exigir que exista en candidatos (para evitar capturas accidentales).
        if (folios.length > 0) {
          const folioExists = folios.some((f: any) => {
            const folioValue = typeof f === 'string' ? f : f.folio
            return String(folioValue).replace(/\D/g, '') === selectedFolio.replace(/\D/g, '')
          })
          if (!folioExists) return null
        }

        return {
          selectedFolio,
          confirmedByUser: true
        }
      },
      handler: 'FolioSelectionHandler'
    })

    // 4B. Folio real mencionado en frase (captura manual)
    this.rules.push({
      name: 'folio_selection_phrase',
      pattern: /folio\s+real\s*[:#]?\s*(\d{6,8})/i,
      condition: (input, context) => {
        // Solo si no hay folio ya capturado de forma efectiva
        return !context?.inmueble?.folio_real
      },
      extract: (input) => {
        const m = input.match(/folio\s+real\s*[:#]?\s*(\d{6,8})/i)
        if (!m) return null
        return {
          selectedFolio: m[1],
          confirmedByUser: true
        }
      },
      handler: 'FolioSelectionHandler'
    })

    // 4C. Captura manual de inmueble (texto libre con folio/dirección/partida)
    // Ej: "FOLIO REAL:1782481 UNIDAD:2D CONJ. HABITACIONAL: ... MUNICIPIO:TIJUANA"
    this.rules.push({
      name: 'inmueble_manual',
      pattern: /(folio\s+real|partida|municipio|manzana|lote|unidad|condominio|fraccionamiento)/i,
      condition: (input, context, lastAssistantMessage?: string) => {
        // Solo si estamos en estado de inmueble o el asistente pidió datos del inmueble
        if (context?._last_question_intent === 'folio_real' || context?._last_question_intent === 'partidas' || context?._last_question_intent === 'inmueble_direccion') {
          return true
        }
        const msg = String(lastAssistantMessage || '').toLowerCase()
        return msg.includes('inscripción') || msg.includes('folio real') || msg.includes('partida') || msg.includes('inmueble')
      },
      extract: (input) => {
        const text = String(input || '')

        const folioMatch = text.match(/folio\s*real\s*[:#]?\s*(\d{6,8})/i)
        const partidaMatch =
          text.match(/partida[s]?\s*(?:no\.?|nº|n°)?\s*[:#]?\s*([0-9,\s]+)/i) ||
          text.match(/\bpda\.?\s*(?:no\.?|nº|n°)?\s*[:#]?\s*([0-9,\s]+)/i)
        const seccionMatch = text.match(/secci[oó]n\s*[:#]?\s*([A-ZÁÉÍÓÚÑ]+)/i)
        const municipioMatch = text.match(/municipio\s*[:#]?\s*([A-ZÁÉÍÓÚÑ\s]+)/i)

        const unidadMatch = text.match(/unidad\s*[:#]?\s*([A-Z0-9\-]+)/i)
        const condominioMatch = text.match(/condominio\s*[:#]?\s*([A-Z0-9\-]+)/i)
        const fraccMatch = text.match(/fraccionamiento\s*[:#]?\s*([A-ZÁÉÍÓÚÑ\s]+)/i) ||
                           text.match(/desarrollo\s+habitacional\s*[:#]?\s*([A-ZÁÉÍÓÚÑ\s]+)/i) ||
                           text.match(/conj\.?\s*habitacional\s*[:#]?\s*([A-ZÁÉÍÓÚÑ0-9\s\-]+)/i)
        const loteMatch = text.match(/lote\s*[:#]?\s*(\d+)/i)
        const manzanaMatch = text.match(/manzana\s*[:#]?\s*(\d+)/i)

        const partidas = partidaMatch
          ? partidaMatch[1]
              .split(',')
              .map(p => p.trim())
              .filter(Boolean)
          : []

        // Dirección libre: quitar folio/partida/municipio para quedarnos con la descripción principal
        let direccionRaw = text
          .replace(/folio\s*real\s*[:#]?\s*\d{6,8}/ig, '')
          .replace(/partida[s]?\s*[:#]?\s*[0-9,\s]+/ig, '')
          .replace(/secci[oó]n\s*[:#]?\s*[A-ZÁÉÍÓÚÑ\s]+/ig, '')
          .replace(/municipio\s*[:#]?\s*[A-ZÁÉÍÓÚÑ\s]+/ig, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (direccionRaw.length < 5) direccionRaw = ''

        // Guardrail: evitar que "SECCION CIVIL" u otros metadatos se tomen como dirección
        const addrKeywords = /(calle|colonia|fraccionamiento|condominio|conj|habitacional|unidad|lote|manzana|domicilio|ubicaci[oó]n|municipio)/i
        if (direccionRaw && !addrKeywords.test(direccionRaw)) {
          direccionRaw = ''
        }

        return {
          folio_real: folioMatch ? folioMatch[1] : null,
          partidas,
          seccion: seccionMatch ? seccionMatch[1] : null,
          direccion: {
            calle: direccionRaw || null,
            municipio: municipioMatch ? municipioMatch[1].trim() : null,
          },
          datos_catastrales: {
            unidad: unidadMatch ? unidadMatch[1] : null,
            condominio: condominioMatch ? condominioMatch[1] : null,
            fraccionamiento: fraccMatch ? fraccMatch[1].trim() : null,
            lote: loteMatch ? loteMatch[1] : null,
            manzana: manzanaMatch ? manzanaMatch[1] : null,
          }
        }
      },
      handler: 'InmuebleManualHandler'
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

    // 6B. Institución de crédito (texto libre) cuando el asistente está preguntando por el banco/institución.
    // Ej: "Banregio", "Scotiabank", "banco banbajío", "sería con Banamex (Citibanamex)".
    // Esta regla NO debe capturar fuera de contexto; depende de isCreditInstitutionContext().
    this.rules.push({
      name: 'credit_institution_freeform',
      // Respuesta corta/mediana (evita capturar párrafos completos)
      pattern: /^[\p{L}\d\s.&'"\-(),]{2,80}$/u,
      condition: (input, context, lastAssistantMessage?: string) => {
        if (!this.isCreditInstitutionContext(context, lastAssistantMessage)) return false
        // Evitar yes/no o respuestas que claramente no son institución
        const t = String(input || '').trim().toLowerCase()
        if (/^(si|sí|no|confirmo|confirmado|ok|okay|correcto|afirmativo|de acuerdo)$/i.test(t)) return false
        // Si ya matcheó el patrón de instituciones comunes, no duplicar
        if (/\b(bbva|santander|banorte|hsbc|banamex|infonavit|fovissste)\b/i.test(t)) return false
        return true
      },
      extract: (input) => {
        const inst = this.extractInstitutionFreeform(input)
        if (!inst) return null
        return {
          creditIndex: 0,
          institution: inst
        }
      },
      handler: 'CreditInstitutionHandler'
    })

    // 7. Participantes de crédito (patrones comunes)
    // 7.0 Participantes etiquetados (más flexible, soporta frases mixtas)
    // Ej:
    // - "Acreditado: WU JINWEI, Coacreditada: QIAOZHEN ZHANG"
    // - "acreditado - el comprador; coacreditada - su cónyuge"
    // - "Acreditado: WU JINWEI y Coacreditada: su cónyuge"
    this.rules.push({
      name: 'credit_participants_labeled',
      pattern: /\b(acreditad[oa]s?|coacreditad[oa]s?)\s*[:\-]/i,
      condition: (input, context) => {
        // Permitimos incluso si creditos aún no está confirmado: la mención explícita de roles implica crédito.
        // Guardrail: no activar si no aparece ninguno de los roles.
        return /(acreditad[oa]|coacreditad[oa])/i.test(input)
      },
      extract: (input, context) => {
        const tRaw = String(input || '')
        const t = tRaw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()

        const grabAfterLabel = (label: string) => {
          // Captura texto después de "label:" o "label -" hasta el próximo label o fin
          const re = new RegExp(`\\b${label}\\b\\s*[:\\-]\\s*([^]+)$`, 'i')
          const m = tRaw.match(re)
          if (!m) return null
          let rest = String(m[1] || '').trim()
          // cortar en el siguiente label si aparece
          const cut = rest.match(/\b(coacreditad[oa]s?|acreditad[oa]s?)\b\s*[:\-]/i)
          if (cut && typeof cut.index === 'number') {
            rest = rest.slice(0, cut.index).trim()
          }
          // limpiar separadores típicos
          rest = rest.replace(/^[\s,;]+|[\s,;]+$/g, '').trim()
          return rest || null
        }

        const acreditadoChunk = grabAfterLabel('acreditad[oa]s?')
        const coacreditadoChunk = grabAfterLabel('coacreditad[oa]s?')

        // Si no hay chunk, no capturar
        if (!acreditadoChunk && !coacreditadoChunk) return null

        const normalize = (s: string) =>
          String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        const isBuyerPlaceholder = (s: string) => {
          const nm = normalize(s)
          return (
            nm === 'el comprador' ||
            nm === 'la compradora' ||
            nm === 'su comprador' ||
            nm.startsWith('el comprad') ||
            nm.startsWith('la comprad')
          )
        }
        const isConyugePlaceholder = (s: string) => {
          const nm = normalize(s)
          return (
            nm === 'el conyuge' ||
            nm === 'la conyuge' ||
            nm === 'su conyuge' ||
            nm === 'su conyugue' ||
            nm.startsWith('el conyug') ||
            nm.startsWith('la conyug') ||
            nm.includes('esposo') ||
            nm.includes('esposa')
          )
        }

        const cmds: any[] = []

        // Si aún no está confirmado crédito, inferirlo SOLO porque hay roles explícitos.
        if (context?.creditos === undefined) {
          cmds.push({
            type: 'payment_method',
            timestamp: new Date(),
            payload: { method: 'credito' }
          })
        }

        // acreditado
        if (acreditadoChunk) {
          const name = isBuyerPlaceholder(acreditadoChunk) ? null : acreditadoChunk
          cmds.push({
            type: 'credit_participant',
            timestamp: new Date(),
            payload: {
              creditIndex: 0,
              participant: {
                name: name && ValidationService.isValidName(name) ? name : null,
                partyId: !name ? 'comprador_1' : undefined,
                role: 'acreditado',
                isConyuge: false
              }
            }
          })
        }

        // coacreditado
        if (coacreditadoChunk) {
          const name = isConyugePlaceholder(coacreditadoChunk) ? null : coacreditadoChunk
          const hasConyuge = !!ConyugeService.getConyugeNombre(context)
          cmds.push({
            type: 'credit_participant',
            timestamp: new Date(),
            payload: {
              creditIndex: 0,
              participant: {
                name: name && ValidationService.isValidName(name) ? name : null,
                role: 'coacreditado',
                isConyuge: !name && hasConyuge
              }
            }
          })
        }

        return { __commands: cmds }
      },
      handler: 'CreditParticipantHandler'
    })

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

    // 7.2 Participante por sufijo (más natural)
    // Ej: "WU JINWEI acreditado", "su cónyuge coacreditada"
    this.rules.push({
      name: 'credit_participant_suffix',
      pattern: /^(.+?)\s+(acreditad[oa]|coacreditad[oa])\s*$/i,
      condition: (input, context) => {
        // Igual que el caso etiquetado: roles explícitos implican crédito.
        return /(acreditad[oa]|coacreditad[oa])/i.test(input)
      },
      extract: (input, context) => {
        const m = input.match(/^(.+?)\s+(acreditad[oa]|coacreditad[oa])\s*$/i)
        if (!m) return null
        const left = String(m[1] || '').trim()
        const roleTok = String(m[2] || '').toLowerCase()
        const role = roleTok.includes('coacreditad') ? 'coacreditado' : 'acreditado'

        const normalize = (s: string) =>
          String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        const nm = normalize(left)
        const looksLikeBuyerPlaceholder =
          nm === 'el comprador' ||
          nm === 'la compradora' ||
          nm === 'su comprador' ||
          nm.startsWith('el comprad') ||
          nm.startsWith('la comprad')
        const looksLikeConyugePlaceholder =
          nm === 'el conyuge' ||
          nm === 'la conyuge' ||
          nm === 'su conyuge' ||
          nm === 'su conyugue' ||
          nm.startsWith('el conyug') ||
          nm.startsWith('la conyug') ||
          nm.includes('esposo') ||
          nm.includes('esposa')

        const cmds: any[] = []
        if (context?.creditos === undefined) {
          cmds.push({
            type: 'payment_method',
            timestamp: new Date(),
            payload: { method: 'credito' }
          })
        }

        if (role === 'acreditado') {
          const name = looksLikeBuyerPlaceholder ? null : left
          cmds.push({
            type: 'credit_participant',
            timestamp: new Date(),
            payload: {
              creditIndex: 0,
              participant: {
                name: name && ValidationService.isValidName(name) ? name : null,
                partyId: !name ? 'comprador_1' : undefined,
                role,
                isConyuge: false
              }
            }
          })
        } else {
          const name = looksLikeConyugePlaceholder ? null : left
          const hasConyuge = !!ConyugeService.getConyugeNombre(context)
          cmds.push({
            type: 'credit_participant',
            timestamp: new Date(),
            payload: {
              creditIndex: 0,
              participant: {
                name: name && ValidationService.isValidName(name) ? name : null,
                role,
                isConyuge: !name && hasConyuge
              }
            }
          })
        }

        return { __commands: cmds }
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
        // Si la respuesta es ambigua (sí/no/confirmo), exigir contexto del asistente.
        const t = String(input || '').trim().toLowerCase()
        const isAmbiguous = /^(sí|si|no|confirmo|confirmado|correcto)$/i.test(t)
        if (isAmbiguous) {
          return this.isEncumbranceContext(context, lastAssistantMessage)
        }
        // Si la respuesta menciona gravamen/hipoteca/libre/sin, permitir aunque el asistente no lo haya preguntado literalmente.
        return /\b(gravamen|gravamenes|hipoteca|libre|sin)\b/i.test(t) || this.isEncumbranceContext(context, lastAssistantMessage)
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
        if (context?._last_question_intent === 'encumbrance_cancellation') return true
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

    // 8C. Cancelación de hipoteca/gravamen (frase) — evita ambigüedad cuando el usuario responde con contexto
    // Ej: "el gravamen se cancelará con el crédito", "se va a cancelar al firmar", "no se cancelará".
    this.rules.push({
      name: 'encumbrance_cancellation_phrase',
      pattern: /\bcancel(ar|ará|ara|acion|ación|ará)\b/i,
      condition: (input, context, lastAssistantMessage?: string) => {
        const hasHipoteca = context?.inmueble?.existe_hipoteca === true
        const g0 = Array.isArray(context?.gravamenes) ? context.gravamenes[0] : null
        const needsAnswer = !g0 || g0.cancelacion_confirmada === null || g0.cancelacion_confirmada === undefined
        if (!hasHipoteca || !needsAnswer) return false
        if (context?._last_question_intent === 'encumbrance_cancellation') return true
        return this.isEncumbranceCancellationContext(lastAssistantMessage)
      },
      extract: (input) => {
        const t = String(input || '').toLowerCase()
        const saysNoCancel = /\b(no)\b.*\bcancel/i.test(t) || /\bno\s+se\s+cancel/i.test(t)
        // Si dice que sí se cancelará => cancelación PENDIENTE (false)
        // Si dice que no se cancelará => no imprimir acto (true)
        return { exists: true, cancellationConfirmed: saysNoCancel ? true : false }
      },
      handler: 'EncumbranceHandler'
    })

    // 9. Nombre de cónyuge (cuando se escribe manualmente)
    this.rules.push({
      name: 'conyuge_name',
      // Nombre completo (2-7 palabras), acepta MAYÚSCULAS.
      pattern: /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,6}$/,
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
        
        // Si el sistema marcó explícitamente que está pidiendo cónyuge, aceptar.
        if (context?._last_question_intent === 'conyuge_name') return true
        // Por defecto, permitir siempre si es un nombre válido y no es del comprador
        return true
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

    // Intentar captura determinista (MULTI-INTENT):
    // Muchas respuestas del usuario mezclan varios datos en un solo mensaje (ej. gravamen + banco + roles).
    // En vez de regresar al primer match, acumulamos comandos deduplicados.
    const handlerToCommandType: Record<string, string> = {
      'EstadoCivilHandler': 'estado_civil',
      'FolioSelectionHandler': 'folio_selection',
      'BuyerNameHandler': 'buyer_name',
      'ConyugeNameHandler': 'conyuge_name',
      'TitularRegistralHandler': 'titular_registral',
      'PaymentMethodHandler': 'payment_method',
      'CreditInstitutionHandler': 'credit_institution',
      'CreditParticipantHandler': 'credit_participant',
      'EncumbranceHandler': 'encumbrance',
      'InmuebleManualHandler': 'inmueble_manual',
    }

    const commands: any[] = []
    const seen = new Set<string>()
    let firstRule: any = null

    const addCommand = (cmd: any) => {
      if (!cmd || !cmd.type) return
      const key = `${cmd.type}:${JSON.stringify(cmd.payload || {})}`
      if (seen.has(key)) return
      seen.add(key)
      commands.push(cmd)
    }

    for (const rule of this.rules) {
      if (!rule.pattern.test(normalizedInput)) continue

      // Para reglas de crédito, verificar contexto adicional
      if (rule.name === 'credit_institution') {
        if (!this.isCreditInstitutionContext(context, lastAssistantMessage)) {
          continue
        }
      }

      if (!rule.condition(normalizedInput, context, lastAssistantMessage)) continue

      const extracted = rule.extract(normalizedInput, context, lastAssistantMessage)
      if (!extracted) continue
      if (!firstRule) firstRule = rule

      // Si la regla ya genera múltiples comandos, agregarlos tal cual
      if (Array.isArray((extracted as any).__commands) && (extracted as any).__commands.length > 0) {
        for (const c of (extracted as any).__commands) {
          addCommand(c)
        }
        continue
      }

      // Convertir payload determinista a Command
      const commandType = handlerToCommandType[rule.handler] || rule.name
      addCommand({
        type: commandType,
        timestamp: new Date(),
        payload: extracted
      })
    }

    if (commands.length > 0) {
      return {
        captured: true,
        captureRule: firstRule || { name: 'multi_intent' },
        data: { __commands: commands },
        needsLLM: false
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
    // Si el sistema marcó explícitamente la intención de la última pregunta, usarla.
    if (context?._last_question_intent === 'credit_institution') {
      // Requiere que haya créditos confirmados y falte institución
      const creditos = context.creditos || []
      const credito0 = creditos[0]
      return Array.isArray(creditos) && creditos.length > 0 && !credito0?.institucion
    }
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
      // Guardrail: NO considerar "contexto de institución" solo por la palabra "crédito".
      // Debe haber señales claras de "banco/institución" para evitar triggerear desde gravamen u otras secciones.
      const isAskingForInstitution =
        msg.includes('institución') ||
        msg.includes('institucion') ||
        msg.includes('banco') ||
        msg.includes('con qué banco') ||
        msg.includes('con que banco') ||
        msg.includes('qué banco') ||
        msg.includes('que banco') ||
        msg.includes('qué institución') ||
        msg.includes('que institucion')
      
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

  private isPaymentMethodContext(lastAssistantMessage?: string): boolean {
    // Si el sistema marcó explícitamente la intención, respetarla.
    // Esto evita depender del texto literal del asistente.
    // Nota: context no se pasa aquí; se usa solo cuando el caller ya validó.
    if (!lastAssistantMessage) return false
    const msg = String(lastAssistantMessage || '').toLowerCase()
    // Debe estar preguntando explícitamente por contado vs crédito
    const asksPayment =
      msg.includes('contado') ||
      msg.includes('crédito') ||
      msg.includes('credito') ||
      msg.includes('forma de pago') ||
      msg.includes('cómo se va a pagar') ||
      msg.includes('como se va a pagar') ||
      msg.includes('se pagará') ||
      msg.includes('se pagara') ||
      msg.includes('pagar el inmueble')
    // Si el asistente está en tema gravamen/cancelación, no es contexto de forma de pago
    const isEncumbranceTopic =
      msg.includes('gravamen') ||
      msg.includes('hipoteca') ||
      msg.includes('cancel')
    return asksPayment && !isEncumbranceTopic
  }

  /**
   * Verifica si estamos en contexto de preguntar por gravamen/hipoteca
   */
  private isEncumbranceContext(context: any, lastAssistantMessage?: string): boolean {
    if (context?._last_question_intent === 'encumbrance') return true
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

  private extractInstitutionFreeform(input: string): string | null {
    const raw = String(input || '').trim()
    if (!raw) return null

    // Intentar extraer después de palabras guía
    // Ej: "será con Banregio", "con el banco Scotiabank", "institución: BanCoppel"
    const lowered = raw.toLowerCase()
    const cleaned = raw
      .replace(/\s+/g, ' ')
      .replace(/^[\s:,-]+|[\s:,-]+$/g, '')

    // Si el usuario escribió una frase, quedarnos con el fragmento más probable
    const m =
      cleaned.match(/(?:instituci[oó]n|banco)\s*[:\-]?\s*([^\n,;.]+)$/i) ||
      cleaned.match(/(?:con\s+(?:el\s+)?)?(?:banco\s+)?([^\n,;.]+)$/i)

    const candidate = (m && m[1]) ? String(m[1]).trim() : cleaned
    // Quitar palabras de relleno comunes al inicio
    const candidate2 = candidate
      .replace(/^(ser(a|á)|es|con|con el|con la|banco|instituci(o|ó)n)\s+/i, '')
      .trim()

    // Limitar tokens para evitar capturar “banregio pero aún no sé…” completo
    const tokens = candidate2.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return null
    const maxTokens = 4
    const short = tokens.slice(0, maxTokens).join(' ')

    // Debe parecer nombre de institución (no números solos, no una oración)
    if (/^\d+$/.test(short)) return null
    if (short.length < 2) return null
    // Normalizar con mapping si aplica; si no, title/upper conservador
    return this.normalizeInstitution(short)
  }
}
