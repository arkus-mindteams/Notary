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
    id: 'document_people_detected',
    commandType: 'document_people_detected',
    description: 'Registrar personas detectadas en documentos para confirmación.',
    allowedStates: ['ESTADO_1', 'ESTADO_2', 'ESTADO_3', 'ESTADO_4', 'ESTADO_4B', 'ESTADO_5', 'ESTADO_6', 'ESTADO_6B', 'ESTADO_8'],
    inputSchema: { persons: 'array', source: 'string?' },
    outputSchema: { _document_people_pending: '...persons[]' }
  },
  {
    id: 'document_people_selection',
    commandType: 'document_people_selection',
    description: 'Seleccionar comprador a partir de personas detectadas.',
    allowedStates: ['ESTADO_1', 'ESTADO_2', 'ESTADO_3', 'ESTADO_4', 'ESTADO_4B', 'ESTADO_5', 'ESTADO_6', 'ESTADO_6B', 'ESTADO_8'],
    inputSchema: { buyerIndex: 'number?', otherIndex: 'number?', buyerName: 'string?', otherName: 'string?', relation: 'string?', source: 'string?' },
    outputSchema: { compradores: '...persona_fisica.nombre', _document_people_pending: 'resolved' }
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
    id: 'buyer_conyuge_swap',
    commandType: 'buyer_conyuge_swap',
    description: 'Corregir comprador/cónyuge cuando están invertidos.',
    allowedStates: ['ESTADO_1', 'ESTADO_2', 'ESTADO_3', 'ESTADO_4', 'ESTADO_4B', 'ESTADO_5', 'ESTADO_6', 'ESTADO_6B', 'ESTADO_8'],
    inputSchema: { compradorNombre: 'string?', conyugeNombre: 'string?', swap: 'boolean?' },
    outputSchema: { compradores: '...persona_fisica.nombre/conyuge.nombre' }
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
    id: 'multiple_folios_detected',
    commandType: 'multiple_folios_detected',
    description: 'Registrar folios detectados desde documento para selección.',
    allowedStates: ['ESTADO_2'],
    inputSchema: { folios: 'string[]', foliosConInfo: 'array', scope: 'object' },
    outputSchema: { folios: '...candidates[]' }
  },
  {
    id: 'encumbrance',
    commandType: 'encumbrance',
    description: 'Confirmar gravamen/hipoteca.',
    allowedStates: ['ESTADO_6', 'ESTADO_6B'],
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
