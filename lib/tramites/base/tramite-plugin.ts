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

export interface PluginKnowledgeSnapshot {
  tramite: string
  scope: string
  prompt_version: string
  knowledge_version: string
  knowledge_hash: string
  knowledge_chunk_ids: string[]
  knowledge_chunk_keys: string[]
  document_chunk_ids?: string[]
  model?: string
  selected_at: string
  selection_reason: string
}

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

  // --- MÉTODOS DE ABSTRACCIÓN DE DOMINIO (Refactor Step 2) ---

  // Mensaje de guardrail para evitar bucles (loop guard)
  getLoopGuardMessage(stateId: string, context: any): string | null

  // Inferir la intención de la última pregunta del asistente (para respuestas cortas)
  inferLastQuestionIntent(context: any, stateId: string): string | null

  // Inferir intención de documento basado en el mensaje del asistente
  inferDocumentIntent(assistantMessage: string): any | null

  // Convertir datos extraídos por LLM a comandos específicos del trámite
  convertDataToCommands(data: any, context: any): Command[]

  // Obtener herramientas permitidas para un estado
  allowedToolsForState(stateId: string): string[]

  // Obtener registro de herramientas del trámite
  getToolRegistry(): any[]

  // Obtener tool por tipo de comando (para validación)
  getToolByCommandType?(commandType: string): any | null

  // Obtener información de transición entre estados
  getTransitionInfo(prevStateId: string | null, newStateId: string, context: any): any

  // Verificar si un campo existe en el contexto (manejo de tipos específicos como persona_fisica/moral)
  hasField(context: any, fieldPath: string): boolean

  // Merge de datos extraídos de documentos al contexto (opcional)
  mergeDocumentData?(context: any, extractedData: any, documentType: string): any

  // Block tools (OpenAI function calling): un tool por bloque de datos (opcional)
  getBlockToolsOpenAI?(): any[]

  // Convertir una llamada a block tool en comandos del trámite (opcional)
  convertBlockToolToCommands?(toolName: string, args: Record<string, unknown>, context: any): Command[]

  // Último snapshot de knowledge usado en generación IA (opcional, para auditoría/reproducibilidad)
  getLastKnowledgeSnapshot?(): PluginKnowledgeSnapshot | null
}
