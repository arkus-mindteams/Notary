import { ToolDefinition } from '../../base/tools'

const tools: ToolDefinition[] = [
  {
    id: 'payment_method',
    commandType: 'payment_method',
    description: 'Confirmar forma de pago (contado/crédito).',
    allowedStates: ['ESTADO_1'],
    inputSchema: { method: 'contado|credito' },
    outputSchema: { creditos: '[]|[credito]' }
  },
  {
    id: 'credit_institution',
    commandType: 'credit_institution',
    description: 'Capturar institución del crédito.',
    allowedStates: ['ESTADO_1', 'ESTADO_5'],
    inputSchema: { creditIndex: 'number', institution: 'string' },
    outputSchema: { creditos: '...institucion' }
  },
  {
    id: 'credit_participant',
    commandType: 'credit_participant',
    description: 'Capturar participantes del crédito.',
    allowedStates: ['ESTADO_5'],
    inputSchema: { creditIndex: 'number', participant: '{partyId|name, role}' },
    outputSchema: { creditos: '...participantes[]' }
  },
  {
    id: 'buyer_name',
    commandType: 'buyer_name',
    description: 'Capturar nombre del comprador.',
    allowedStates: ['ESTADO_4'],
    inputSchema: { buyerIndex: 'number', name: 'string' },
    outputSchema: { compradores: '...persona_fisica|persona_moral.nombre' }
  },
  {
    id: 'estado_civil',
    commandType: 'estado_civil',
    description: 'Capturar estado civil del comprador.',
    allowedStates: ['ESTADO_4'],
    inputSchema: { buyerIndex: 'number', estadoCivil: 'soltero|casado|divorciado|viudo' },
    outputSchema: { compradores: '...persona_fisica.estado_civil' }
  },
  {
    id: 'conyuge_name',
    commandType: 'conyuge_name',
    description: 'Capturar nombre del cónyuge.',
    allowedStates: ['ESTADO_4B'],
    inputSchema: { buyerIndex: 'number', name: 'string' },
    outputSchema: { compradores: '...persona_fisica.conyuge.nombre' }
  },
  {
    id: 'titular_registral',
    commandType: 'titular_registral',
    description: 'Capturar titular registral / vendedor.',
    allowedStates: ['ESTADO_3'],
    inputSchema: { name: 'string', inferredTipoPersona: 'persona_fisica|persona_moral' },
    outputSchema: { vendedores: '...persona_fisica|persona_moral.nombre' }
  },
  {
    id: 'inmueble_manual',
    commandType: 'inmueble_manual',
    description: 'Capturar datos de inmueble en texto libre.',
    allowedStates: ['ESTADO_2'],
    inputSchema: { folio_real: 'string', partidas: 'string[]', direccion: 'object' },
    outputSchema: { inmueble: 'folio_real/partidas/direccion' }
  },
  {
    id: 'folio_selection',
    commandType: 'folio_selection',
    description: 'Seleccionar folio real detectado.',
    allowedStates: ['ESTADO_2'],
    inputSchema: { selectedFolio: 'string', confirmedByUser: 'boolean' },
    outputSchema: { inmueble: 'folio_real_confirmed' }
  },
  {
    id: 'encumbrance',
    commandType: 'encumbrance',
    description: 'Confirmar gravamen/hipoteca.',
    allowedStates: ['ESTADO_6'],
    inputSchema: { exists: 'boolean' },
    outputSchema: { inmueble: 'existe_hipoteca' }
  },
  {
    id: 'gravamen_acreedor',
    commandType: 'gravamen_acreedor',
    description: 'Capturar institución acreedora del gravamen.',
    allowedStates: ['ESTADO_6'],
    inputSchema: { institucion: 'string' },
    outputSchema: { gravamenes: '...institucion' }
  },
  {
    id: 'encumbrance_cancellation',
    commandType: 'encumbrance_cancellation',
    description: 'Confirmar si se cancelará el gravamen.',
    allowedStates: ['ESTADO_6B'],
    inputSchema: { cancellationConfirmed: 'boolean' },
    outputSchema: { gravamenes: '...cancelacion_confirmada' }
  }
]

export const getPreavisoToolRegistry = (): ToolDefinition[] => tools

export const getPreavisoAllowedToolIdsForState = (stateId: string): string[] =>
  tools.filter((t) => t.allowedStates.includes(stateId)).map((t) => t.id)

export const getPreavisoToolByCommandType = (commandType: string): ToolDefinition | null =>
  tools.find((t) => t.commandType === commandType) || null
