/**
 * Block tools para Preaviso: un tool por bloque de información.
 * Formato OpenAI (function calling) para interpretación robusta del mensaje del usuario.
 */
import type { OpenAIChatTool } from '../../shared/services/llm-service'
import type { Command } from '../../base/types'

function makeCommand(type: string, payload: Record<string, unknown>): Command {
  return {
    type,
    timestamp: new Date(),
    source: 'llm',
    payload: payload as Record<string, any>
  }
}

const BLOCK_TOOLS: OpenAIChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'set_inmueble',
      description: 'Registrar o actualizar datos del inmueble y registro: folio real, partidas, dirección, datos catastrales (unidad, condominio, lote), superficie, valor. Usar cuando el usuario proporcione o confirme datos del inmueble, o pida "cargar la información del inmueble al paso 2" (en ese caso enviar todos los datos que tengas en contexto: folio_real, partidas, colonia/municipio/estado, unidad, condominio, lote, etc.).',
      parameters: {
        type: 'object',
        properties: {
          folio_real: { type: 'string', description: 'Folio real del inmueble' },
          partidas: { type: 'array', description: 'Partidas registrales', items: { type: 'string' } },
          seccion: { type: 'string', description: 'Sección registral (ej. Civil)' },
          calle: { type: 'string', description: 'Calle o vía del inmueble' },
          numero: { type: 'string', description: 'Número exterior/interior' },
          colonia: { type: 'string', description: 'Colonia o desarrollo (ej. Vista Bugambilias)' },
          municipio: { type: 'string', description: 'Municipio o delegación (ej. Tijuana)' },
          estado: { type: 'string', description: 'Estado (ej. Baja California)' },
          codigo_postal: { type: 'string', description: 'Código postal' },
          unidad: { type: 'string', description: 'Unidad o número de departamento (ej. 7D)' },
          condominio: { type: 'string', description: 'Condominio o conjunto (ej. D-2)' },
          lote: { type: 'string', description: 'Lote (ej. 43)' },
          manzana: { type: 'string', description: 'Manzana (ej. 831)' },
          fraccionamiento: { type: 'string', description: 'Fraccionamiento o desarrollo' },
          superficie: { type: 'string', description: 'Superficie (ej. m²)' },
          valor: { type: 'string', description: 'Valor del inmueble si se menciona' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_vendedor',
      description: 'Registrar o actualizar el vendedor (titular registral). Usar cuando el usuario diga el nombre del vendedor o confirme quién es el titular.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre completo del vendedor o denominación social si es persona moral' },
          tipo_persona: { type: 'string', description: 'persona_fisica o persona_moral', enum: ['persona_fisica', 'persona_moral'] },
          rfc: { type: 'string', description: 'RFC si se proporciona' },
          curp: { type: 'string', description: 'CURP si se proporciona' }
        },
        required: ['nombre']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_forma_pago',
      description: 'Registrar si la operación es al contado o con crédito. Usar cuando el usuario diga "contado", "crédito", "financiado", "INFONAVIT", etc.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'contado o credito', enum: ['contado', 'credito'] }
        },
        required: ['method']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_comprador',
      description: 'Registrar o actualizar el comprador: nombre y estado civil. Usar cuando el usuario proporcione el nombre del comprador o estado civil (soltero, casado, etc.).',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre completo del comprador' },
          estado_civil: { type: 'string', description: 'Estado civil', enum: ['soltero', 'casado', 'divorciado', 'viudo', 'union_libre'] },
          rfc: { type: 'string', description: 'RFC si se proporciona' },
          curp: { type: 'string', description: 'CURP si se proporciona' }
        },
        required: ['nombre']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_conyuge',
      description: 'Registrar el nombre del cónyuge del comprador. Usar cuando el comprador esté casado y el usuario proporcione el nombre del cónyuge.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre completo del cónyuge' }
        },
        required: ['nombre']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_credito',
      description: 'Registrar o actualizar el NUEVO CRÉDITO DE ADQUISICIÓN DEL COMPRADOR (Paso 5). REGLAS: 1) Extrae ÚNICAMENTE el nombre limpio de la institución (ej. "BANJICO", "SANTANDER"), ignorando frases como "perdon", "era con", etc. 2) Por defecto se asume comprador + cónyuge. 3) Usar solo_comprador: true si el usuario indica que el cónyuge no participa. NOTA: Si el usuario se refiere a una hipoteca previa del vendedor que debe cancelarse, usa set_gravamen.',
      parameters: {
        type: 'object',
        properties: {
          institucion: { type: 'string', description: 'Nombre limpio del banco o institución que otorga el NUEVO crédito (ej. INFONAVIT, BBVA, BANJICO).' },
          participante_nombre: { type: 'string', description: 'Nombre del acreditado/participante principal si se menciona' },
          solo_comprador: { type: 'boolean', description: 'true si el usuario indica que solo el comprador participa en el crédito' }
        },
        required: ['institucion']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_gravamen',
      description: 'Registrar datos sobre gravámenes o HIPOTECAS ACTUALES DEL VENDEDOR que deben cancelarse (Paso 6). REGLAS: 1) Si existe hipoteca, marcar existe_hipoteca: true. 2) Indicar la institución acreedora (ej. Infonavit, BBVA, etc.). 3) Indicar si se cancelará con motivo de esta operación o antes. NOTA: Si el usuario se refiere al NUEVO crédito del comprador, usa set_credito.',
      parameters: {
        type: 'object',
        properties: {
          existe_hipoteca: { type: 'boolean', description: 'true si el inmueble tiene gravamen/hipoteca actual' },
          cancelacion_con_operacion: { type: 'boolean', description: 'Solo si el usuario lo dice: true = se cancelará con esta operación/venta, false = se cancelará antes de la firma. No inferir.' },
          institucion: { type: 'string', description: 'Nombre del banco o institución de la HIPOTECA ACTUAL DEL VENDEDOR (acreedor).' }
        },
        required: ['existe_hipoteca']
      }
    }
  }
]

/**
 * Devuelve los 7 block tools en formato OpenAI para pasarlos a callWithTools.
 */
export function getPreavisoBlockToolsOpenAI(): OpenAIChatTool[] {
  return [...BLOCK_TOOLS]
}

/**
 * Convierte una llamada a un block tool (nombre + argumentos) en los comandos
 * que el sistema ya conoce. context se usa para índices (buyerIndex, creditIndex).
 */
export function blockToolCallToCommands(
  toolName: string,
  args: Record<string, unknown>,
  _context: any
): Command[] {
  const commands: Command[] = []
  const has = (k: string) => args[k] !== undefined && args[k] !== null && args[k] !== ''

  switch (toolName) {
    case 'set_inmueble': {
      const direccion: Record<string, string | null> = {}
      if (has('calle')) direccion.calle = String(args.calle)
      if (has('numero')) direccion.numero = String(args.numero)
      if (has('colonia')) direccion.colonia = String(args.colonia)
      if (has('municipio')) direccion.municipio = String(args.municipio)
      if (has('estado')) direccion.estado = String(args.estado)
      if (has('codigo_postal')) direccion.codigo_postal = String(args.codigo_postal)
      const datosCatastrales: Record<string, string | null> = {}
      if (has('unidad')) datosCatastrales.unidad = String(args.unidad)
      if (has('condominio')) datosCatastrales.condominio = String(args.condominio)
      if (has('lote')) datosCatastrales.lote = String(args.lote)
      if (has('manzana')) datosCatastrales.manzana = String(args.manzana)
      if (has('fraccionamiento')) datosCatastrales.fraccionamiento = String(args.fraccionamiento)
      const payload: Record<string, unknown> = {}
      if (has('folio_real')) payload.folio_real = String(args.folio_real)
      if (has('partidas')) payload.partidas = Array.isArray(args.partidas) ? args.partidas.map(String) : [String(args.partidas)].filter(Boolean)
      if (has('seccion')) payload.seccion = String(args.seccion)
      if (Object.keys(direccion).length > 0) payload.direccion = direccion
      if (Object.keys(datosCatastrales).length > 0) payload.datos_catastrales = datosCatastrales
      if (Object.keys(payload).length > 0) {
        commands.push(makeCommand('inmueble_manual', payload))
      }
      break
    }

    case 'set_vendedor': {
      if (has('nombre')) {
        commands.push(makeCommand('titular_registral', {
          name: String(args.nombre),
          rfc: has('rfc') ? String(args.rfc) : null,
          curp: has('curp') ? String(args.curp) : null,
          inferredTipoPersona: args.tipo_persona === 'persona_moral' ? 'persona_moral' : 'persona_fisica',
          confirmed: true
        }))
      }
      break
    }

    case 'set_forma_pago': {
      const method = args.method === 'credito' ? 'credito' : 'contado'
      commands.push(makeCommand('payment_method', { method }))
      break
    }

    case 'set_comprador': {
      if (has('nombre')) {
        commands.push(makeCommand('buyer_name', {
          buyerIndex: 0,
          name: String(args.nombre),
          rfc: has('rfc') ? String(args.rfc) : null,
          curp: has('curp') ? String(args.curp) : null,
          inferredTipoPersona: 'persona_fisica',
          source: 'user_input'
        }))
      }
      if (has('estado_civil')) {
        const ec = String(args.estado_civil).toLowerCase()
        const valid: Array<'soltero' | 'casado' | 'divorciado' | 'viudo'> = ['soltero', 'casado', 'divorciado', 'viudo']
        const estadoCivil = valid.includes(ec as any) ? ec : 'soltero'
        commands.push(makeCommand('estado_civil', { buyerIndex: 0, estadoCivil }))
      }
      break
    }

    case 'set_conyuge': {
      if (has('nombre')) {
        commands.push(makeCommand('conyuge_name', {
          buyerIndex: 0,
          name: String(args.nombre),
          source: 'user_input'
        }))
      }
      break
    }

    case 'set_credito': {
      if (has('institucion')) {
        commands.push(makeCommand('credit_institution', {
          creditIndex: 0,
          institution: String(args.institucion)
        }))
      }
      if (has('solo_comprador') && args.solo_comprador === true) {
        commands.push(makeCommand('credit_participants_only_buyer', { creditIndex: 0 }))
      } else if (has('participante_nombre')) {
        commands.push(makeCommand('credit_participant', {
          creditIndex: 0,
          participant: {
            name: String(args.participante_nombre),
            role: 'acreditado'
          }
        }))
      }
      break
    }

    case 'set_gravamen': {
      if (args.existe_hipoteca === true || args.existe_hipoteca === false) {
        // cancelacion_con_operacion true = "se cancelará con esta operación" => en UI es "se cancelará en la escritura" = cancelacion_confirmada: false
        let cancellationConfirmed: boolean | undefined
        if (has('cancelacion_con_operacion')) {
          cancellationConfirmed = args.cancelacion_con_operacion === true ? false : true
        }
        commands.push(makeCommand('encumbrance', {
          exists: Boolean(args.existe_hipoteca),
          cancellationConfirmed,
          tipo: 'hipoteca'
        }))
      }
      if (has('institucion') && args.existe_hipoteca === true) {
        commands.push(makeCommand('gravamen_acreedor', {
          institucion: String(args.institucion)
        }))
      }
      break
    }

    default:
      break
  }

  return commands
}
