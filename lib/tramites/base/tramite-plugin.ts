/**
 * Interface base para plugins de trámites
 * Cada trámite (preaviso, testamento, etc.) implementa esta interface
 */

import {
  StateDefinition,
  CaptureRule,
  ValidationResult,
  InterpretationResult,
  Command
} from './types'

export interface TramitePlugin {
  // Identificación
  id: string
  name: string
  description: string
  
  // Estados del trámite (definidos por el plugin)
  getStates(context: any): StateDefinition[]
  
  // Determinar estado actual (FLEXIBLE - no rígido)
  determineCurrentState(context: any): StateDefinition
  
  // Reglas de captura deterministas (casos claros)
  getCaptureRules(): CaptureRule[]
  
  // Validación específica del trámite
  validate(context: any): ValidationResult
  
  // Conversión a JSON final para generación de documento
  toFinalJSON(context: any): any
  
  // Generar pregunta (puede usar LLM para flexibilidad)
  generateQuestion(state: StateDefinition, context: any, conversationHistory?: any[]): Promise<string>
  
  // Interpretar input del usuario (FLEXIBLE - permite fuera de orden)
  interpretInput(input: string, context: any, lastAssistantMessage?: string): Promise<InterpretationResult>
  
  // Procesar documento (extensión para documentos)
  processDocument?(file: File, documentType: string, context: any): Promise<{ commands: Command[]; extractedData?: any }>
}
