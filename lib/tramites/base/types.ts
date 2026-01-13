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

export interface EncumbranceCommand extends Command {
  type: 'encumbrance'
  payload: {
    exists: boolean
    cancellationConfirmed?: boolean | null
    tipo?: 'hipoteca' | 'embargo' | 'gravamen'
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
  condition: (input: string, context: any) => boolean
  extract: (input: string, context: any) => any
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
    validation: ValidationResult
  }
  commands?: string[] // Para debugging
}
