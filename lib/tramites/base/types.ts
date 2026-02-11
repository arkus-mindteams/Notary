/**
 * Tipos base para el sistema de trámites con Plugin System
 */

// ============================================================================
// COMMANDS (Comandos que se generan del input del usuario o documentos)
// ============================================================================

export interface Command {
  type: string
  timestamp: Date
  payload: Record<string, any>
  source?: 'deterministic' | 'llm' | 'document'
}

// Comandos específicos de Preaviso
export interface EstadoCivilCommand extends Command {
  type: 'estado_civil'
  payload: {
    buyerIndex: number
    estadoCivil: 'soltero' | 'casado' | 'divorciado' | 'viudo'
  }
}

export interface FolioSelectionCommand extends Command {
  type: 'folio_selection'
  payload: {
    selectedFolio: string
    scope?: 'unidades' | 'inmuebles_afectados' | 'otros'
    confirmedByUser: boolean
    intent?: 'SELECT' | 'FOCUS' | 'CONFIRM'
    folioInfo?: any
  }
}

export interface BuyerNameCommand extends Command {
  type: 'buyer_name'
  payload: {
    buyerIndex: number
    name: string
    rfc?: string | null
    curp?: string | null
    inferredTipoPersona?: 'persona_fisica' | 'persona_moral'
    source?: 'documento_identificacion' | 'user_input'
  }
}

export interface ConyugeNameCommand extends Command {
  type: 'conyuge_name'
  payload: {
    buyerIndex: number
    name: string
    rfc?: string | null
    curp?: string | null
    source?: 'documento_identificacion' | 'documento_acta_matrimonio' | 'user_input'
  }
}

export interface TitularRegistralCommand extends Command {
  type: 'titular_registral'
  payload: {
    name: string
    rfc?: string | null
    curp?: string | null
    inferredTipoPersona?: 'persona_fisica' | 'persona_moral'
    confirmed: boolean
    source?: 'documento_inscripcion' | 'user_input'
  }
}

export interface PaymentMethodCommand extends Command {
  type: 'payment_method'
  payload: {
    method: 'contado' | 'credito'
  }
}

export interface CreditInstitutionCommand extends Command {
  type: 'credit_institution'
  payload: {
    creditIndex: number
    institution: string
  }
}

export interface CreditParticipantCommand extends Command {
  type: 'credit_participant'
  payload: {
    creditIndex: number
    participant: {
      name?: string
      partyId?: string
      role: 'acreditado' | 'coacreditado'
      isConyuge?: boolean
    }
  }
}

/** Deja solo al comprador como acreditado (quita coacreditados). */
export interface CreditParticipantsOnlyBuyerCommand extends Command {
  type: 'credit_participants_only_buyer'
  payload: { creditIndex: number }
}

export interface EncumbranceCommand extends Command {
  type: 'encumbrance'
  payload: {
    exists: boolean
    cancellationConfirmed?: boolean | null
    tipo?: 'hipoteca' | 'embargo' | 'gravamen'
  }
}

export type LastQuestionIntent =
  | 'payment_method'
  | 'credit_institution'
  | 'credit_participants'
  | 'buyer_name'
  | 'buyer_tipo_persona'
  | 'estado_civil'
  | 'conyuge_name'
  | 'folio_real'
  | 'partidas'
  | 'inmueble_direccion'
  | 'seller_name'
  | 'seller_tipo_persona'
  | 'encumbrance'
  | 'gravamen_acreedor'
  | 'encumbrance_cancellation'
  | 'document_people_select_buyer'
  | 'titular_registral'

export interface InmuebleManualCommand extends Command {
  type: 'inmueble_manual'
  payload: {
    folio_real?: string | null
    partidas?: string[]
    direccion?: {
      calle?: string | null
      municipio?: string | null
      estado?: string | null
      colonia?: string | null
    } | null
    datos_catastrales?: {
      unidad?: string | null
      condominio?: string | null
      fraccionamiento?: string | null
      lote?: string | null
      manzana?: string | null
    } | null
    seccion?: string | null
  }
}

export interface DocumentProcessedCommand extends Command {
  type: 'document_processed'
  payload: {
    documentType: string
    extractedData: any
    fileName: string
  }
}

// ============================================================================
// STATE DEFINITIONS (Definiciones de estados)
// ============================================================================

export interface StateDefinition {
  id: string
  name: string
  required: boolean | ((context: any) => boolean)
  fields: string[] // Campos que necesita este estado
  conditional?: (context: any) => boolean // Condición para que el estado aplique
  deterministicQuestion?: (context: any) => string | null // Pregunta determinista (opcional)
}

// ============================================================================
// CAPTURE RULES (Reglas de captura deterministas)
// ============================================================================

export interface CaptureRule {
  name: string
  pattern: RegExp
  condition: (input: string, context: any, lastAssistantMessage?: string) => boolean
  extract: (input: string, context: any, lastAssistantMessage?: string) => any
  handler: string // Nombre del handler
}

// ============================================================================
// INTERPRETATION RESULTS (Resultados de interpretación)
// ============================================================================

export interface InterpretationResult {
  captured: boolean
  captureRule?: CaptureRule | null
  data?: any
  needsLLM?: boolean
}

// ============================================================================
// VALIDATION RESULTS (Resultados de validación)
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  missing: string[]
}

// ============================================================================
// HANDLER RESULTS (Resultados de handlers)
// ============================================================================

export interface HandlerResult {
  updatedContext: any
  events: string[]
  nextState?: string | null
}

// ============================================================================
// TRAMITE RESPONSE (Respuesta del sistema)
// ============================================================================

export interface TramiteResponse {
  message: string
  data: any
  state: {
    current: string
    completed: string[]
    missing: string[]
    not_applicable?: string[] // Opcional para retrocompatibilidad
    validation: ValidationResult
  }
  commands?: string[] // Para debugging
  meta?: Record<string, any>
}
