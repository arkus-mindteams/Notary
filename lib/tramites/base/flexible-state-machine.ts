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
      if (this.isStateCompleted(state, context, plugin)) {
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
      if (this.hasPartialInfoForState(state, context, plugin)) {
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
  private isStateCompleted(state: StateDefinition, context: any, plugin: TramitePlugin): boolean {
    for (const field of state.fields) {
      if (!plugin.hasField(context, field)) {
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
    context: any,
    plugin: TramitePlugin
  ): boolean {
    // Si el usuario proporcionó ALGUNA información de este estado,
    // podemos aceptarlo aunque no esté completo
    for (const field of state.fields) {
      if (plugin.hasField(context, field)) {
        return true // Tiene al menos algo
      }
    }
    return false
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

      if (this.isStateCompleted(state, context, plugin)) {
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

      if (!this.isStateCompleted(state, context, plugin)) {
        missing.push(state.id)
      }
    }

    return missing
  }

  /**
   * Obtiene estados que no aplican
   */
  getNotApplicableStates(plugin: TramitePlugin, context: any): string[] {
    const states = plugin.getStates(context)
    const notApplicable: string[] = []

    for (const state of states) {
      if (state.id === 'ready') continue

      const isRequired = typeof state.required === 'function'
        ? state.required(context)
        : state.required === true

      const conditionMet = state.conditional && typeof state.conditional === 'function'
        ? state.conditional(context)
        : true

      if (!isRequired || !conditionMet) {
        // Si no es necesario O no cumple la condición, verificar si ya está "completado"
        // (a veces un estado no es requerido pero el usuario lo llenó igual)
        if (!this.isStateCompleted(state, context, plugin)) {
          notApplicable.push(state.id)
        }
      }
    }

    return notApplicable
  }

  /**
   * Verifica si puede transicionar a un estado (FLEXIBLE)
   */
  canTransitionTo(
    plugin: TramitePlugin,
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
    if (this.hasPartialInfoForState(toState, context, plugin)) {
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
