/**
 * Flexible State Machine
 * Mantiene orden lógico pero permite flexibilidad (saltar estados, información fuera de orden)
 */

import { StateDefinition } from './types'
import { TramitePlugin } from './tramite-plugin'

export class FlexibleStateMachine {
  /**
   * Determina el estado actual de forma flexible
   * No es rígido: puede saltar estados si el usuario proporciona información fuera de orden
   */
  determineCurrentState(
    plugin: TramitePlugin,
    context: any
  ): StateDefinition {
    const states = plugin.getStates(context)
    
    // Buscar primer estado no completado
    // PERO: si el usuario ya proporcionó información de estados futuros, aceptarla
    
    for (const state of states) {
      if (state.id === 'ready') continue
      
      // Verificar si está completado
      if (this.isStateCompleted(state, context)) {
        continue
      }
      
      // Verificar condiciones condicionales
      if (state.conditional && typeof state.conditional === 'function') {
        if (!state.conditional(context)) {
          continue // Estado condicional no aplica
        }
      }
      
      // FLEXIBLE: Si el usuario proporcionó información de este estado
      // aunque no estemos "oficialmente" en él, podemos aceptarlo
      if (this.hasPartialInfoForState(state, context)) {
        return state // Aceptar estado aunque no esté "completo"
      }
      
      return state
    }
    
    // Si todos están completos, estado 'ready'
    return states.find(s => s.id === 'ready') || states[states.length - 1]
  }
  
  /**
   * Verifica si un estado está completado
   */
  private isStateCompleted(state: StateDefinition, context: any): boolean {
    for (const field of state.fields) {
      if (!this.hasField(context, field)) {
        return false
      }
    }
    return true
  }
  
  /**
   * FLEXIBLE: Verifica si hay información parcial para el estado
   * Permite que el usuario proporcione información fuera de orden
   */
  private hasPartialInfoForState(
    state: StateDefinition,
    context: any
  ): boolean {
    // Si el usuario proporcionó ALGUNA información de este estado,
    // podemos aceptarlo aunque no esté completo
    for (const field of state.fields) {
      if (this.hasField(context, field)) {
        return true // Tiene al menos algo
      }
    }
    return false
  }
  
  /**
   * Verifica si un campo existe en el contexto
   */
  private hasField(context: any, fieldPath: string): boolean {
    // Ejemplo: 'compradores[].nombre'
    // Buscar en context.compradores[].nombre
    const parts = fieldPath.split('.')
    let current = context
    
    for (const part of parts) {
      if (part.includes('[]')) {
        // Array: verificar si tiene elementos
        const arrayName = part.replace('[]', '')
        if (!Array.isArray(current[arrayName]) || current[arrayName].length === 0) {
          return false
        }
        current = current[arrayName][0] // Tomar primer elemento
      } else {
        // Si el campo es "nombre" y estamos en vendedores o compradores,
        // buscar también en persona_fisica.nombre y persona_moral.denominacion_social
        if (part === 'nombre' && (current.persona_fisica || current.persona_moral)) {
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
   * Obtiene estados completados
   */
  getCompletedStates(plugin: TramitePlugin, context: any): string[] {
    const states = plugin.getStates(context)
    const completed: string[] = []
    
    for (const state of states) {
      if (state.id === 'ready') continue
      
      const isRequired = typeof state.required === 'function'
        ? state.required(context)
        : state.required === true
      
      if (!isRequired) continue
      
      if (this.isStateCompleted(state, context)) {
        completed.push(state.id)
      }
    }
    
    return completed
  }
  
  /**
   * Obtiene estados faltantes
   */
  getMissingStates(plugin: TramitePlugin, context: any): string[] {
    const states = plugin.getStates(context)
    const missing: string[] = []
    
    for (const state of states) {
      if (state.id === 'ready') continue
      
      const isRequired = typeof state.required === 'function'
        ? state.required(context)
        : state.required === true
      
      if (!isRequired) continue
      
      if (!this.isStateCompleted(state, context)) {
        missing.push(state.id)
      }
    }
    
    return missing
  }
  
  /**
   * Verifica si puede transicionar a un estado (FLEXIBLE)
   */
  canTransitionTo(
    fromState: StateDefinition,
    toState: StateDefinition,
    context: any
  ): boolean {
    // FLEXIBLE: Permitir transición si:
    // 1. Es el siguiente estado lógico (normal)
    // 2. O si el usuario proporcionó información del estado destino (flexible)
    
    // Transición normal (estados consecutivos)
    if (this.isNextLogicalState(fromState, toState)) {
      return true
    }
    
    // Transición flexible: usuario proporcionó info del estado destino
    if (this.hasPartialInfoForState(toState, context)) {
      return true // Permitir saltar
    }
    
    return false
  }
  
  /**
   * Verifica si es el siguiente estado lógico
   */
  private isNextLogicalState(
    fromState: StateDefinition,
    toState: StateDefinition
  ): boolean {
    // Por ahora, permitir cualquier transición
    // En el futuro, podemos definir orden lógico si es necesario
    return true
  }
}
