# Opción A: Refactor Completo a Sistema de Eventos/Comandos

## ¿Qué es este Enfoque?

En lugar de tener una función monolítica que procesa todo, el sistema se organiza en **comandos pequeños y específicos** que manejan **un solo caso cada uno**.

Piensa en esto como una arquitectura de "micro-servicios" pero dentro de una sola aplicación:
- Cada comando es independiente
- Cada comando maneja UN caso específico
- Los comandos se ejecutan en secuencia
- Fácil de testear, mantener y extender

## Arquitectura Propuesta

```
Usuario envía mensaje: "casado"
    ↓
┌─────────────────────────────────────────────────────────────┐
│ INPUT PARSER                                                │
│ Detecta: "Estado civil del comprador"                      │
│ Genera: EstadoCivilCommand { value: "casado" }             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ COMMAND ROUTER                                              │
│ Identifica: EstadoCivilCommand → EstadoCivilHandler        │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ ESTADO CIVIL HANDLER                                        │
│ - Valida: "casado" es válido                                │
│ - Actualiza: compradores[0].estado_civil = "casado"        │
│ - Emite evento: BuyerEstadoCivilUpdated                     │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ STATE MANAGER                                               │
│ - Recibe evento: BuyerEstadoCivilUpdated                    │
│ - Recalcula estado: ESTADO_4 → puede avanzar                │
│ - Determina próximo paso: "¿El cónyuge participa?"          │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ RESPONSE GENERATOR                                          │
│ - Si necesita pregunta: LLM genera pregunta natural         │
│ - Si solo confirmación: "Información registrada"            │
└─────────────────────────────────────────────────────────────┘
    ↓
Response al Frontend
```

## Estructura de Código Propuesta

### 1. Definiciones de Comandos

```typescript
// lib/commands/types.ts

export interface Command {
  type: string
  timestamp: Date
  payload: Record<string, any>
}

// Comandos específicos
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
    scope?: 'unidades' | 'inmuebles_afectados'
  }
}

export interface BuyerNameCommand extends Command {
  type: 'buyer_name'
  payload: {
    buyerIndex: number
    name: string
    inferredTipoPersona?: 'persona_fisica' | 'persona_moral'
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
    }
  }
}

// ... más comandos
```

### 2. Input Parser (Reemplaza parte de applyDeterministicUserInputUpdate)

```typescript
// lib/parsers/input-parser.ts

import { Command } from '../commands/types'

export class InputParser {
  /**
   * Analiza el input del usuario y genera comandos específicos
   */
  static parse(userInput: string, context: any, lastAssistantMessage?: string): Command[] {
    const commands: Command[] = []
    const normalized = userInput.trim().toLowerCase()

    // Detectar estado civil
    const estadoCivilMatch = normalized.match(/\b(soltero|casado|divorciado|viudo)\b/i)
    if (estadoCivilMatch) {
      commands.push({
        type: 'estado_civil',
        timestamp: new Date(),
        payload: {
          buyerIndex: 0,
          estadoCivil: this.normalizeEstadoCivil(estadoCivilMatch[1])
        }
      })
    }

    // Detectar selección de folio
    const folioMatch = normalized.match(/\b(\d{6,})\b/)
    if (folioMatch && this.isFolioSelectionContext(context)) {
      commands.push({
        type: 'folio_selection',
        timestamp: new Date(),
        payload: {
          selectedFolio: folioMatch[1],
          scope: this.inferFolioScope(folioMatch[1], context)
        }
      })
    }

    // Detectar nombre del comprador
    if (this.isBuyerNameContext(context, lastAssistantMessage)) {
      const name = this.extractName(userInput)
      if (name && this.isValidName(name)) {
        commands.push({
          type: 'buyer_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name,
            inferredTipoPersona: this.inferTipoPersona(name)
          }
        })
      }
    }

    // ... más detecciones

    return commands
  }

  private static normalizeEstadoCivil(input: string): 'soltero' | 'casado' | 'divorciado' | 'viudo' {
    // Lógica de normalización
  }

  private static isFolioSelectionContext(context: any): boolean {
    // Verificar si estamos en contexto de selección de folio
  }

  private static inferFolioScope(folio: string, context: any): 'unidades' | 'inmuebles_afectados' | undefined {
    // Inferir scope del folio
  }

  // ... más helpers
}
```

### 3. Command Handlers (Cada uno maneja UN caso)

```typescript
// lib/handlers/estado-civil-handler.ts

import { EstadoCivilCommand } from '../commands/types'
import { ValidationService } from '../services/validation-service'
import { StateManager } from '../state/state-manager'

export class EstadoCivilHandler {
  static async handle(
    command: EstadoCivilCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    // 1. Validar
    const validation = ValidationService.validateEstadoCivil(command.payload.estadoCivil)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // 2. Actualizar contexto
    const updatedContext = { ...context }
    const buyerIndex = command.payload.buyerIndex
    const buyer = updatedContext.compradores[buyerIndex] || {
      party_id: null,
      tipo_persona: null,
      persona_fisica: {}
    }

    updatedContext.compradores[buyerIndex] = {
      ...buyer,
      tipo_persona: buyer.tipo_persona || 'persona_fisica',
      persona_fisica: {
        ...buyer.persona_fisica,
        estado_civil: command.payload.estadoCivil
      }
    }

    // 3. Emitir eventos
    const events = ['BuyerEstadoCivilUpdated']

    // Si es casado, emitir evento adicional
    if (command.payload.estadoCivil === 'casado') {
      events.push('BuyerCasadoDetected')
    }

    return { updatedContext, events }
  }
}
```

```typescript
// lib/handlers/folio-selection-handler.ts

import { FolioSelectionCommand } from '../commands/types'
import { ValidationService } from '../services/validation-service'
import { FolioService } from '../services/folio-service'

export class FolioSelectionHandler {
  static async handle(
    command: FolioSelectionCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    // 1. Validar que el folio existe en candidatos
    const validation = ValidationService.validateFolioSelection(
      command.payload.selectedFolio,
      context.folios?.candidates
    )
    if (!validation.valid) {
      throw new Error(`Folio ${command.payload.selectedFolio} no encontrado en candidatos`)
    }

    // 2. Obtener información asociada al folio
    const folioInfo = FolioService.getFolioInfo(
      command.payload.selectedFolio,
      context.folios?.candidates
    )

    // 3. Actualizar contexto
    const updatedContext = { ...context }
    updatedContext.inmueble = {
      ...updatedContext.inmueble,
      folio_real: command.payload.selectedFolio,
      folio_real_confirmed: true,
      folio_real_scope: command.payload.scope,
      // Auto-popular datos asociados
      ...(folioInfo && {
        superficie: folioInfo.superficie || updatedContext.inmueble?.superficie,
        direccion: {
          ...updatedContext.inmueble?.direccion,
          calle: folioInfo.ubicacion || updatedContext.inmueble?.direccion?.calle
        }
      })
    }

    // 4. Emitir eventos
    const events = ['FolioSelected', 'InmuebleUpdated']

    return { updatedContext, events }
  }
}
```

### 4. State Manager (Fuente Única de Verdad)

```typescript
// lib/state/state-manager.ts

import { computePreavisoState } from '../preaviso-state'

export class StateManager {
  private context: any
  private eventHistory: string[] = []

  constructor(initialContext: any) {
    this.context = initialContext
  }

  /**
   * Actualiza el contexto y recalcula el estado
   */
  update(updatedContext: any, events: string[]): void {
    this.context = { ...this.context, ...updatedContext }
    this.eventHistory.push(...events)
  }

  /**
   * Obtiene el estado actual (fuente única de verdad)
   */
  getState() {
    return computePreavisoState(this.context)
  }

  /**
   * Obtiene el contexto actual
   */
  getContext(): any {
    return this.context
  }

  /**
   * Determina qué acción tomar a continuación
   */
  getNextAction(): {
    type: 'ask' | 'confirm' | 'wait'
    question?: string
    blockingReasons?: string[]
  } {
    const state = this.getState()
    const missing = state.required_missing || []
    const blocking = state.blocking_reasons || []

    // Si hay bloqueos, resolver primero
    if (blocking.length > 0) {
      return this.resolveBlocking(blocking)
    }

    // Si falta información, preguntar
    if (missing.length > 0) {
      return {
        type: 'ask',
        question: this.generateQuestion(missing[0])
      }
    }

    // Si todo está completo, confirmar
    if (state.current_state === 'ESTADO_8') {
      return {
        type: 'confirm',
        question: 'Listo: ya quedó capturada la información necesaria...'
      }
    }

    return { type: 'wait' }
  }

  private resolveBlocking(blocking: string[]): any {
    // Lógica para resolver bloqueos (ej: múltiples folios)
    if (blocking.includes('multiple_folio_real_detected')) {
      return {
        type: 'ask',
        question: this.generateFolioSelectionQuestion(),
        blockingReasons: blocking
      }
    }
    // ... más casos
  }

  private generateQuestion(missingField: string): string {
    // Generar pregunta basada en campo faltante
    // Esto puede ser determinista O usar LLM solo para generar texto
  }
}
```

### 5. Command Router (Coordina todo)

```typescript
// lib/routers/command-router.ts

import { Command } from '../commands/types'
import { EstadoCivilHandler } from '../handlers/estado-civil-handler'
import { FolioSelectionHandler } from '../handlers/folio-selection-handler'
import { BuyerNameHandler } from '../handlers/buyer-name-handler'
// ... más handlers

export class CommandRouter {
  private handlers: Map<string, any> = new Map()

  constructor() {
    // Registrar handlers
    this.handlers.set('estado_civil', EstadoCivilHandler)
    this.handlers.set('folio_selection', FolioSelectionHandler)
    this.handlers.set('buyer_name', BuyerNameHandler)
    // ... más registros
  }

  async route(command: Command, context: any): Promise<{ updatedContext: any; events: string[] }> {
    const Handler = this.handlers.get(command.type)
    
    if (!Handler) {
      throw new Error(`No handler found for command type: ${command.type}`)
    }

    return Handler.handle(command, context)
  }
}
```

### 6. Servicio Principal (Reemplaza la función POST actual)

```typescript
// app/api/ai/preaviso-chat/route.ts (VERSIÓN NUEVA)

import { InputParser } from '@/lib/parsers/input-parser'
import { CommandRouter } from '@/lib/routers/command-router'
import { StateManager } from '@/lib/state/state-manager'
import { ResponseGenerator } from '@/lib/generators/response-generator'

export async function POST(req: Request) {
  const { messages, context } = await req.json()
  const lastUserMessage = messages[messages.length - 1]?.content || ''
  const lastAssistantMessage = messages[messages.length - 2]?.content || ''

  // 1. Parsear input del usuario → comandos
  const commands = InputParser.parse(lastUserMessage, context, lastAssistantMessage)

  // 2. Inicializar state manager
  const stateManager = new StateManager(context)

  // 3. Ejecutar comandos en secuencia
  const router = new CommandRouter()
  for (const command of commands) {
    try {
      const result = await router.route(command, stateManager.getContext())
      stateManager.update(result.updatedContext, result.events)
    } catch (error) {
      // Manejar errores de validación
      return NextResponse.json({
        error: 'validation_error',
        message: error.message
      }, { status: 400 })
    }
  }

  // 4. Determinar siguiente acción
  const nextAction = stateManager.getNextAction()

  // 5. Generar respuesta
  const responseGenerator = new ResponseGenerator(stateManager.getContext())
  const response = await responseGenerator.generate(
    nextAction,
    messages // Para contexto conversacional
  )

  return NextResponse.json({
    message: response.message,
    data: stateManager.getContext(), // Solo un merge, directo del state manager
    state: stateManager.getState()
  })
}
```

## Ventajas Detalladas

### 1. **Separación Clara de Responsabilidades**
- Cada handler hace **UNA cosa**
- Fácil de entender qué hace cada parte
- Fácil de modificar sin afectar otros casos

### 2. **Testeable**
```typescript
// test/handlers/estado-civil-handler.test.ts

describe('EstadoCivilHandler', () => {
  it('should update buyer estado civil correctly', async () => {
    const command: EstadoCivilCommand = {
      type: 'estado_civil',
      timestamp: new Date(),
      payload: { buyerIndex: 0, estadoCivil: 'casado' }
    }
    
    const context = {
      compradores: [{ tipo_persona: 'persona_fisica', persona_fisica: {} }]
    }

    const result = await EstadoCivilHandler.handle(command, context)

    expect(result.updatedContext.compradores[0].persona_fisica.estado_civil).toBe('casado')
    expect(result.events).toContain('BuyerEstadoCivilUpdated')
  })

  it('should emit BuyerCasadoDetected event when estado is casado', async () => {
    // ... test específico
  })
})
```

### 3. **Predecible**
- Cada comando tiene un comportamiento conocido
- No hay efectos secundarios inesperados
- Fácil de debuggear

### 4. **Extensible**
```typescript
// Agregar nuevo handler es fácil:

// 1. Definir comando
export interface NuevoComando extends Command {
  type: 'nuevo_comando'
  payload: { /* ... */ }
}

// 2. Crear handler
export class NuevoComandoHandler {
  static async handle(command: NuevoComando, context: any) {
    // Lógica específica
  }
}

// 3. Registrar en router
router.handlers.set('nuevo_comando', NuevoComandoHandler)

// ¡Listo! Sin tocar otros handlers
```

### 5. **Sin Conflictos**
- Solo se ejecuta un handler por comando
- No hay triple procesamiento
- Un solo merge (el state manager es la fuente de verdad)

## Comparación con Sistema Actual

### Sistema Actual:
```typescript
// Una función de 1100+ líneas
function applyDeterministicUserInputUpdate(...) {
  // 50+ if statements
  // Lógica mezclada
  // Difícil de testear
  // Imposible de mantener
}
```

### Sistema Propuesto:
```typescript
// Múltiples handlers pequeños
class EstadoCivilHandler { /* 50 líneas */ }
class FolioSelectionHandler { /* 60 líneas */ }
class BuyerNameHandler { /* 40 líneas */ }
// ... cada uno enfocado y testeable
```

## Desafíos y Cómo Resolverlos

### Desafío 1: **Migración Gradual**
**Solución**: Implementar handlers uno por uno, mantener el código viejo funcionando hasta migrar todo.

### Desafío 2: **Casos Edge Complejos**
**Solución**: 
- Handlers simples para casos simples (determinista)
- Handlers que usan LLM para casos complejos (cuando realmente se necesita)

### Desafío 3: **Coordinación entre Handlers**
**Solución**: 
- Sistema de eventos para comunicación
- State Manager centralizado
- No hay dependencias directas entre handlers

## Plan de Implementación Detallado

### Fase 1: Fundación (Semana 1-2)

1. **Crear estructura base**
   ```
   lib/
     commands/
       types.ts
     handlers/
       base-handler.ts
     parsers/
       input-parser.ts
     routers/
       command-router.ts
     state/
       state-manager.ts
     services/
       validation-service.ts
   ```

2. **Implementar StateManager**
   - Fuente única de verdad
   - Métodos para actualizar y obtener estado

3. **Implementar ValidationService**
   - Validaciones centralizadas
   - Reutilizable por todos los handlers

### Fase 2: Migración Incremental (Semana 3-6)

**Semana 3**: Folio Selection
- Crear `FolioSelectionCommand`
- Crear `FolioSelectionHandler`
- Migrar lógica de selección de folio

**Semana 4**: Estado Civil
- Crear `EstadoCivilCommand`
- Crear `EstadoCivilHandler`
- Migrar lógica de estado civil

**Semana 5**: Buyer Name & Tipo Persona
- Crear comandos y handlers
- Migrar lógica de captura de nombres

**Semana 6**: Credit Participants
- Crear `CreditParticipantCommand`
- Crear `CreditParticipantHandler`
- Migrar lógica compleja de participantes

### Fase 3: Limpieza (Semana 7)

1. Eliminar función monolítica `applyDeterministicUserInputUpdate`
2. Simplificar merge de contexto (ya no necesario)
3. Actualizar tests
4. Documentación

### Fase 4: Optimización (Semana 8)

1. Optimizar prompts LLM (ya no necesitan capturar datos)
2. Mejorar manejo de errores
3. Performance tuning
4. Logging estructurado

## Ejemplo Completo de Flujo

```typescript
// Usuario: "casado"

// 1. InputParser.parse()
// → Genera: [{ type: 'estado_civil', payload: { estadoCivil: 'casado' } }]

// 2. CommandRouter.route()
// → EstadoCivilHandler.handle()

// 3. EstadoCivilHandler
// → Valida: "casado" es válido ✓
// → Actualiza: compradores[0].estado_civil = 'casado'
// → Emite: ['BuyerEstadoCivilUpdated', 'BuyerCasadoDetected']

// 4. StateManager.update()
// → Actualiza contexto
// → Recalcula estado

// 5. StateManager.getNextAction()
// → Detecta: necesita preguntar si cónyuge participa
// → Retorna: { type: 'ask', question: '...' }

// 6. ResponseGenerator.generate()
// → Usa LLM solo para generar pregunta natural
// → No necesita capturar datos (ya está hecho)

// 7. Response
// → { message: "¿El cónyuge participa?", data: updatedContext, state: ... }
```

## Preguntas Frecuentes

**P: ¿El LLM sigue siendo necesario?**
R: Sí, pero solo para generar preguntas naturales. La captura de datos es determinista.

**P: ¿Qué pasa con casos complejos que requieren LLM?**
R: Puedes crear handlers que usen LLM cuando realmente sea necesario, pero son la excepción, no la regla.

**P: ¿Cuánto código tendremos?**
R: Más archivos, pero menos líneas por archivo. Más organizado y mantenible.

**P: ¿Es compatible con el sistema actual?**
R: Podemos hacer migración gradual, manteniendo ambos sistemas funcionando durante la transición.

¿Te parece bien este enfoque? ¿Hay algo específico que quieras que explique más a fondo?
