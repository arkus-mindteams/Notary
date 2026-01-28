# Alternativas Arquitectónicas al Sistema de Handlers

## Opciones Disponibles

### 1. **State Machine Pattern (Máquina de Estados Finita)** ⭐ RECOMENDADA

**Concepto**: El sistema tiene estados definidos y transiciones entre ellos. Cada estado tiene acciones asociadas.

**Cómo funcionaría**:
```typescript
// Definición de estados
enum PreavisoState {
  WAITING_FOR_REGISTRY = 'waiting_for_registry',
  WAITING_FOR_FOLIO_SELECTION = 'waiting_for_folio_selection',
  WAITING_FOR_SELLER = 'waiting_for_seller',
  WAITING_FOR_PAYMENT_METHOD = 'waiting_for_payment_method',
  WAITING_FOR_BUYER = 'waiting_for_buyer',
  WAITING_FOR_ESTADO_CIVIL = 'waiting_for_estado_civil',
  WAITING_FOR_CREDIT = 'waiting_for_credit',
  WAITING_FOR_ENCUMBRANCE = 'waiting_for_encumbrance',
  READY = 'ready'
}

// Transiciones definidas
const transitions = {
  [PreavisoState.WAITING_FOR_REGISTRY]: {
    onRegistryUploaded: PreavisoState.WAITING_FOR_FOLIO_SELECTION,
    onFolioSelected: PreavisoState.WAITING_FOR_SELLER
  },
  [PreavisoState.WAITING_FOR_SELLER]: {
    onSellerConfirmed: PreavisoState.WAITING_FOR_PAYMENT_METHOD
  },
  // ... más transiciones
}

// Acciones por estado
const stateActions = {
  [PreavisoState.WAITING_FOR_FOLIO_SELECTION]: {
    process: (input: string, context: any) => {
      // Procesar selección de folio
      return { updatedContext: {...}, nextState: PreavisoState.WAITING_FOR_SELLER }
    },
    generateQuestion: (context: any) => {
      return "Por favor selecciona el folio..."
    }
  }
}
```

**Ventajas**:
- ✅ Visual: Fácil ver todos los estados y transiciones
- ✅ Predecible: Flujo explícito y claro
- ✅ Validación: Solo permite transiciones válidas
- ✅ Debugging: Fácil ver en qué estado está el sistema

**Desventajas**:
- ⚠️ Puede ser rígido para casos complejos
- ⚠️ Requiere definir todas las transiciones

**Ejemplo de uso**:
```typescript
// Usuario: "1782483"
const currentState = stateMachine.getCurrentState() // WAITING_FOR_FOLIO_SELECTION
const action = stateActions[currentState]
const result = action.process("1782483", context)
stateMachine.transition(result.nextState)
```

---

### 2. **Rule Engine (Motor de Reglas)** 

**Concepto**: Sistema basado en reglas que se evalúan y ejecutan.

**Cómo funcionaría**:
```typescript
// Definición de reglas
const rules = [
  {
    name: 'folio_selection_rule',
    condition: (input: string, context: any) => {
      return context.state === 'WAITING_FOR_FOLIO' && /^\d{6,}$/.test(input)
    },
    action: (input: string, context: any) => {
      return {
        updatedContext: { inmueble: { folio_real: input } },
        events: ['FolioSelected']
      }
    }
  },
  {
    name: 'estado_civil_rule',
    condition: (input: string, context: any) => {
      return /\b(casado|soltero|divorciado|viudo)\b/i.test(input) &&
             context.state === 'WAITING_FOR_ESTADO_CIVIL'
    },
    action: (input: string, context: any) => {
      const estadoCivil = normalizeEstadoCivil(input)
      return {
        updatedContext: { compradores: [{ estado_civil: estadoCivil }] },
        events: ['EstadoCivilUpdated']
      }
    }
  },
  // ... más reglas
]

// Motor de reglas
class RuleEngine {
  execute(input: string, context: any) {
    for (const rule of rules) {
      if (rule.condition(input, context)) {
        return rule.action(input, context)
      }
    }
    return null // No hay regla que aplique
  }
}
```

**Ventajas**:
- ✅ Declarativo: Reglas son fáciles de leer
- ✅ Extensible: Agregar nueva regla = agregar objeto
- ✅ Flexible: Reglas pueden ser complejas

**Desventajas**:
- ⚠️ Orden importa: Primera regla que coincida se ejecuta
- ⚠️ Puede ser difícil debuggear qué regla se ejecutó
- ⚠️ Conflictos entre reglas

---

### 3. **Pipeline Pattern (Patrón de Tubería)**

**Concepto**: El input pasa por una serie de procesadores en secuencia.

**Cómo funcionaría**:
```typescript
// Procesadores en secuencia
const processors = [
  new InputNormalizer(),      // Normaliza input
  new ContextEnricher(),       // Enriquece con contexto
  new FolioProcessor(),        // Procesa folios
  new BuyerProcessor(),        // Procesa compradores
  new CreditProcessor(),       // Procesa créditos
  new EncumbranceProcessor(),  // Procesa gravámenes
  new StateUpdater()           // Actualiza estado
]

// Pipeline
class Pipeline {
  async process(input: string, context: any) {
    let result = { input, context }
    
    for (const processor of processors) {
      if (processor.canHandle(result)) {
        result = await processor.process(result)
        if (result.stop) break // Si algún procesador dice "stop", parar
      }
    }
    
    return result
  }
}
```

**Ventajas**:
- ✅ Orden claro: Procesadores en secuencia
- ✅ Modular: Cada procesador es independiente
- ✅ Flexible: Fácil agregar/quitar procesadores

**Desventajas**:
- ⚠️ Todos los procesadores se evalúan (puede ser ineficiente)
- ⚠️ Difícil saltar procesadores según contexto

---

### 4. **Strategy Pattern (Patrón de Estrategia)**

**Concepto**: Diferentes estrategias para procesar diferentes tipos de input.

**Cómo funcionaría**:
```typescript
// Estrategias
interface ProcessingStrategy {
  canHandle(input: string, context: any): boolean
  process(input: string, context: any): ProcessingResult
}

class FolioSelectionStrategy implements ProcessingStrategy {
  canHandle(input: string, context: any): boolean {
    return context.state === 'WAITING_FOR_FOLIO' && /^\d{6,}$/.test(input)
  }
  
  process(input: string, context: any): ProcessingResult {
    // Lógica de selección de folio
  }
}

class EstadoCivilStrategy implements ProcessingStrategy {
  canHandle(input: string, context: any): boolean {
    return /\b(casado|soltero|divorciado|viudo)\b/i.test(input)
  }
  
  process(input: string, context: any): ProcessingResult {
    // Lógica de estado civil
  }
}

// Contexto que usa estrategias
class ProcessingContext {
  private strategies: ProcessingStrategy[] = [
    new FolioSelectionStrategy(),
    new EstadoCivilStrategy(),
    // ... más estrategias
  ]
  
  process(input: string, context: any) {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(input, context)) {
        return strategy.process(input, context)
      }
    }
    return null
  }
}
```

**Ventajas**:
- ✅ Similar a handlers pero más formal
- ✅ Fácil intercambiar estrategias
- ✅ Testeable: Cada estrategia es independiente

**Desventajas**:
- ⚠️ Básicamente igual que handlers con otro nombre
- ⚠️ Mismo nivel de complejidad

---

### 5. **Event Sourcing (Fuente de Eventos)**

**Concepto**: En lugar de guardar estado, guardamos eventos. El estado se reconstruye aplicando eventos.

**Cómo funcionaría**:
```typescript
// Eventos
interface Event {
  type: string
  timestamp: Date
  payload: any
}

// Eventos específicos
class FolioSelectedEvent implements Event {
  type = 'folio_selected'
  timestamp = new Date()
  payload: { folio: string, scope: string }
}

class EstadoCivilUpdatedEvent implements Event {
  type = 'estado_civil_updated'
  timestamp = new Date()
  payload: { buyerIndex: number, estadoCivil: string }
}

// Event Store
class EventStore {
  private events: Event[] = []
  
  append(event: Event) {
    this.events.push(event)
  }
  
  // Reconstruir estado aplicando eventos
  getCurrentState(): any {
    let state = initialState
    for (const event of this.events) {
      state = this.applyEvent(state, event)
    }
    return state
  }
  
  private applyEvent(state: any, event: Event): any {
    switch (event.type) {
      case 'folio_selected':
        return { ...state, inmueble: { ...state.inmueble, folio_real: event.payload.folio } }
      case 'estado_civil_updated':
        return { ...state, compradores: /* actualizar */ }
      // ... más casos
    }
  }
}
```

**Ventajas**:
- ✅ Historial completo: Todos los eventos están guardados
- ✅ Debugging: Fácil ver qué pasó
- ✅ Time travel: Puedes reconstruir estado en cualquier punto
- ✅ Audit trail: Perfecto para auditorías

**Desventajas**:
- ⚠️ Complejidad: Requiere reconstruir estado
- ⚠️ Performance: Puede ser lento si hay muchos eventos
- ⚠️ Overkill para este caso: Probablemente más de lo que necesitamos

---

### 6. **Workflow Engine (Motor de Flujos de Trabajo)**

**Concepto**: Sistema que ejecuta un flujo de trabajo definido (como BPMN).

**Cómo funcionaría**:
```typescript
// Definición de workflow
const workflow = {
  start: 'registry_upload',
  steps: [
    {
      id: 'registry_upload',
      type: 'user_action',
      next: 'folio_selection'
    },
    {
      id: 'folio_selection',
      type: 'user_input',
      validator: (input) => /^\d{6,}$/.test(input),
      processor: 'FolioSelectionProcessor',
      next: 'seller_confirmation'
    },
    {
      id: 'seller_confirmation',
      type: 'user_input',
      processor: 'SellerConfirmationProcessor',
      next: 'payment_method'
    },
    // ... más pasos
  ]
}

// Motor de workflow
class WorkflowEngine {
  private currentStep: string
  
  async executeStep(input: string, context: any) {
    const step = workflow.steps.find(s => s.id === this.currentStep)
    
    if (step.validator && !step.validator(input)) {
      throw new Error('Input inválido')
    }
    
    const processor = this.getProcessor(step.processor)
    const result = await processor.process(input, context)
    
    this.currentStep = step.next
    return result
  }
}
```

**Ventajas**:
- ✅ Visual: Flujo es claro y explícito
- ✅ Validación: Cada paso puede tener validadores
- ✅ Flexible: Fácil modificar flujo

**Desventajas**:
- ⚠️ Complejidad: Requiere motor de workflow
- ⚠️ Overkill: Probablemente más de lo que necesitamos

---

### 7. **Chain of Responsibility (Cadena de Responsabilidad)**

**Concepto**: Cada procesador intenta manejar el input. Si no puede, pasa al siguiente.

**Cómo funcionaría**:
```typescript
abstract class Processor {
  protected next?: Processor
  
  setNext(processor: Processor): Processor {
    this.next = processor
    return processor
  }
  
  abstract canHandle(input: string, context: any): boolean
  abstract process(input: string, context: any): any
  
  handle(input: string, context: any): any {
    if (this.canHandle(input, context)) {
      return this.process(input, context)
    }
    
    if (this.next) {
      return this.next.handle(input, context)
    }
    
    return null // Ningún procesador pudo manejar
  }
}

class FolioProcessor extends Processor {
  canHandle(input: string, context: any): boolean {
    return context.state === 'WAITING_FOR_FOLIO' && /^\d{6,}$/.test(input)
  }
  
  process(input: string, context: any): any {
    // Procesar folio
  }
}

class EstadoCivilProcessor extends Processor {
  canHandle(input: string, context: any): boolean {
    return /\b(casado|soltero|divorciado|viudo)\b/i.test(input)
  }
  
  process(input: string, context: any): any {
    // Procesar estado civil
  }
}

// Construir cadena
const chain = new FolioProcessor()
  .setNext(new EstadoCivilProcessor())
  .setNext(new CreditProcessor())
  // ... más procesadores

// Usar
const result = chain.handle(userInput, context)
```

**Ventajas**:
- ✅ Flexible: Fácil agregar/quitar procesadores
- ✅ Desacoplado: Cada procesador no conoce a los demás
- ✅ Orden dinámico: Puedes cambiar el orden fácilmente

**Desventajas**:
- ⚠️ Puede ser ineficiente: Todos se evalúan hasta encontrar uno
- ⚠️ Difícil debuggear qué procesador se ejecutó

---

### 8. **Middleware Pattern (Como Express.js)**

**Concepto**: Serie de middlewares que procesan el request en secuencia.

**Cómo funcionaría**:
```typescript
type Middleware = (input: string, context: any, next: () => any) => any

const middlewares: Middleware[] = [
  // Middleware 1: Normalizar input
  (input, context, next) => {
    const normalized = input.trim().toLowerCase()
    return next(normalized, context)
  },
  
  // Middleware 2: Procesar folio
  (input, context, next) => {
    if (context.state === 'WAITING_FOR_FOLIO' && /^\d{6,}$/.test(input)) {
      // Procesar folio
      const updatedContext = { ...context, inmueble: { folio_real: input } }
      return { updatedContext, events: ['FolioSelected'] }
    }
    return next(input, context)
  },
  
  // Middleware 3: Procesar estado civil
  (input, context, next) => {
    const match = input.match(/\b(casado|soltero|divorciado|viudo)\b/i)
    if (match) {
      // Procesar estado civil
      return { updatedContext: {...}, events: ['EstadoCivilUpdated'] }
    }
    return next(input, context)
  },
  
  // ... más middlewares
]

// Ejecutar middlewares
function executeMiddlewares(input: string, context: any) {
  let index = 0
  
  function next(modifiedInput?: string, modifiedContext?: any) {
    if (index >= middlewares.length) {
      return null // Ningún middleware pudo procesar
    }
    
    const middleware = middlewares[index++]
    return middleware(modifiedInput || input, modifiedContext || context, next)
  }
  
  return next()
}
```

**Ventajas**:
- ✅ Familiar: Similar a Express.js (si conoces Express)
- ✅ Flexible: Fácil agregar/quitar middlewares
- ✅ Orden claro: Middlewares en secuencia

**Desventajas**:
- ⚠️ Todos se ejecutan hasta encontrar uno que procese
- ⚠️ Puede ser confuso el flujo de `next()`

---

## Comparación de Opciones

| Opción | Complejidad | Flexibilidad | Testeable | Mantenible | Recomendado |
|--------|-------------|--------------|-----------|------------|-------------|
| **Handlers** | Media | Alta | Alta | Alta | ⭐⭐⭐ |
| **State Machine** | Media | Media | Alta | Alta | ⭐⭐⭐⭐ |
| **Rule Engine** | Baja | Alta | Media | Media | ⭐⭐ |
| **Pipeline** | Media | Media | Alta | Alta | ⭐⭐⭐ |
| **Strategy** | Media | Alta | Alta | Alta | ⭐⭐⭐ |
| **Event Sourcing** | Alta | Alta | Alta | Alta | ⭐⭐ |
| **Workflow Engine** | Alta | Alta | Media | Media | ⭐ |
| **Chain of Responsibility** | Media | Alta | Alta | Media | ⭐⭐ |
| **Middleware** | Media | Alta | Media | Media | ⭐⭐ |

---

## Mi Recomendación: **State Machine Pattern** ⭐

**Por qué**:
1. **Visual y claro**: Fácil ver todos los estados y transiciones
2. **Predecible**: Flujo explícito, no hay sorpresas
3. **Validación**: Solo permite transiciones válidas
4. **Debugging**: Fácil ver en qué estado está el sistema
5. **Menos riesgoso**: Estados son explícitos, difícil perder funcionalidad

**Cómo se vería**:
```typescript
// Estados claramente definidos
enum PreavisoState {
  WAITING_FOR_REGISTRY,
  WAITING_FOR_FOLIO_SELECTION,
  WAITING_FOR_SELLER,
  WAITING_FOR_PAYMENT_METHOD,
  WAITING_FOR_BUYER,
  WAITING_FOR_ESTADO_CIVIL,
  WAITING_FOR_CREDIT,
  WAITING_FOR_ENCUMBRANCE,
  READY
}

// Cada estado tiene su procesador
class StateMachine {
  private state: PreavisoState = PreavisoState.WAITING_FOR_REGISTRY
  
  process(input: string, context: any) {
    const processor = this.getProcessorForState(this.state)
    const result = processor.process(input, context)
    
    if (result.nextState) {
      this.transition(result.nextState)
    }
    
    return result
  }
}
```

**Ventajas sobre Handlers**:
- ✅ Estados explícitos (más claro que comandos)
- ✅ Transiciones validadas (no puedes ir a estado inválido)
- ✅ Visualización fácil (diagrama de estados)
- ✅ Menos riesgo de perder funcionalidad (estados son explícitos)

---

## Opción Híbrida: **State Machine + Handlers**

**Lo mejor de ambos mundos**:
- State Machine para control de flujo
- Handlers para procesamiento específico

```typescript
class StateMachine {
  private state: PreavisoState
  
  process(input: string, context: any) {
    // State machine decide qué handler usar
    const handler = this.getHandlerForState(this.state)
    
    // Handler procesa el input
    const result = handler.handle(input, context)
    
    // State machine valida transición
    if (this.canTransitionTo(result.nextState)) {
      this.transition(result.nextState)
    }
    
    return result
  }
}
```

**Ventajas**:
- ✅ Control de flujo explícito (State Machine)
- ✅ Procesamiento modular (Handlers)
- ✅ Validación de transiciones
- ✅ Fácil de entender y mantener

---

## Recomendación Final

**Opción 1: State Machine Pattern** (Más recomendada)
- Más visual y predecible
- Menos riesgo de perder funcionalidad
- Estados explícitos

**Opción 2: State Machine + Handlers** (Híbrida)
- Lo mejor de ambos mundos
- Control de flujo + procesamiento modular

**Opción 3: Handlers** (Original)
- También funciona bien
- Más flexible pero menos estructurado

¿Cuál prefieres? ¿Quieres que implemente un ejemplo de State Machine para que veas cómo funcionaría?
