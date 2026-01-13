# Arquitectura Flexible y Extensible para Múltiples Trámites

## Requisitos Clave

1. **Flexibilidad conversacional**: El agente debe ser flexible con el usuario
2. **Extensibilidad**: Fácil agregar nuevos tipos de trámites
3. **Mantenibilidad**: No reescribir código base al agregar trámites

---

## Opción 1: Plugin System (Recomendada) ⭐⭐⭐⭐⭐

**Concepto**: Sistema base con plugins para cada tipo de trámite.

**Cómo funcionaría**:
```typescript
// Sistema base
interface TramitePlugin {
  // Identificación del trámite
  id: string
  name: string
  
  // Estados del trámite (definidos por el plugin)
  states: StateDefinition[]
  
  // Reglas de captura (definidas por el plugin)
  captureRules: CaptureRule[]
  
  // Validación específica del trámite
  validate(context: any): ValidationResult
  
  // Conversión a JSON final del trámite
  toFinalJSON(context: any): any
}

// Plugin para Preaviso
class PreavisoPlugin implements TramitePlugin {
  id = 'preaviso'
  name = 'Preaviso de Compraventa'
  
  states = [
    { id: 'registry', name: 'Registro e Inmueble', required: true },
    { id: 'seller', name: 'Vendedor', required: true },
    { id: 'payment', name: 'Forma de Pago', required: true },
    { id: 'buyer', name: 'Comprador', required: true },
    { id: 'credit', name: 'Crédito', required: false, conditional: 'payment === credito' },
    { id: 'encumbrance', name: 'Gravámenes', required: true },
    { id: 'ready', name: 'Listo', required: true }
  ]
  
  captureRules = [
    {
      name: 'folio_selection',
      condition: (input: string, context: any) => {
        return context.state === 'registry' && /^\d{6,}$/.test(input)
      },
      handler: FolioSelectionHandler
    },
    {
      name: 'estado_civil',
      condition: (input: string, context: any) => {
        return /\b(casado|soltero|divorciado|viudo)\b/i.test(input) &&
               context.state === 'buyer'
      },
      handler: EstadoCivilHandler
    },
    // ... más reglas
  ]
  
  validate(context: any): ValidationResult {
    // Validación específica de preaviso
    const errors: string[] = []
    
    if (!context.inmueble?.folio_real) {
      errors.push('Folio real es requerido')
    }
    
    if (!context.vendedores?.length) {
      errors.push('Vendedor es requerido')
    }
    
    // ... más validaciones
    
    return { valid: errors.length === 0, errors }
  }
  
  toFinalJSON(context: any): PreavisoSimplifiedJSON {
    // Conversión específica de preaviso
    return {
      tipoOperacion: 'compraventa',
      vendedores: context.vendedores.map(/* ... */),
      // ... conversión completa
    }
  }
}

// Plugin para otro trámite (ej: Testamento)
class TestamentoPlugin implements TramitePlugin {
  id = 'testamento'
  name = 'Testamento'
  
  states = [
    { id: 'testator', name: 'Testador', required: true },
    { id: 'beneficiaries', name: 'Beneficiarios', required: true },
    { id: 'assets', name: 'Bienes', required: false },
    { id: 'executor', name: 'Albacea', required: false },
    { id: 'ready', name: 'Listo', required: true }
  ]
  
  captureRules = [
    {
      name: 'testator_name',
      condition: (input: string, context: any) => {
        return context.state === 'testator' && isValidName(input)
      },
      handler: TestatorNameHandler
    },
    // ... reglas específicas de testamento
  ]
  
  validate(context: any): ValidationResult {
    // Validación específica de testamento
    // ...
  }
  
  toFinalJSON(context: any): TestamentoJSON {
    // Conversión específica de testamento
    // ...
  }
}

// Sistema base (no conoce detalles de trámites específicos)
class TramiteSystem {
  private plugins: Map<string, TramitePlugin> = new Map()
  
  registerPlugin(plugin: TramitePlugin) {
    this.plugins.set(plugin.id, plugin)
  }
  
  async process(
    tramiteId: string,
    userInput: string,
    context: any
  ): Promise<{ updatedContext: any; response: string; state: any }> {
    // 1. Obtener plugin del trámite
    const plugin = this.plugins.get(tramiteId)
    if (!plugin) {
      throw new Error(`Trámite ${tramiteId} no encontrado`)
    }
    
    // 2. Determinar estado actual (flexible, no rígido)
    const currentState = this.determineCurrentState(context, plugin)
    
    // 3. Intentar procesar input con reglas del plugin
    let processed = false
    for (const rule of plugin.captureRules) {
      if (rule.condition(userInput, { ...context, state: currentState })) {
        const handler = new rule.handler()
        const result = await handler.handle(userInput, context)
        context = { ...context, ...result.updatedContext }
        processed = true
        break
      }
    }
    
    // 4. Si no se procesó con reglas, usar LLM para interpretar
    if (!processed) {
      const llmResult = await this.interpretWithLLM(userInput, context, plugin, currentState)
      context = { ...context, ...llmResult.updatedContext }
    }
    
    // 5. Recalcular estado (flexible, puede saltar estados)
    const newState = this.recalculateState(context, plugin)
    
    // 6. Validar según plugin
    const validation = plugin.validate(context)
    
    // 7. Generar respuesta
    const response = await this.generateResponse(
      context,
      newState,
      plugin,
      validation
    )
    
    return {
      updatedContext: context,
      response,
      state: {
        current: newState.id,
        completed: this.getCompletedStates(context, plugin),
        missing: this.getMissingStates(context, plugin),
        validation
      }
    }
  }
  
  // Determinar estado actual de forma flexible
  private determineCurrentState(context: any, plugin: TramitePlugin): StateDefinition {
    // No es rígido: puede estar en múltiples estados según el contexto
    // Ej: Si ya tiene comprador y vendedor pero falta crédito, está en 'credit'
    
    const completedStates = this.getCompletedStates(context, plugin)
    
    // Encontrar primer estado no completado
    for (const state of plugin.states) {
      if (!completedStates.includes(state.id)) {
        // Verificar condiciones condicionales
        if (state.conditional) {
          const conditionMet = this.evaluateCondition(state.conditional, context)
          if (!conditionMet) continue
        }
        return state
      }
    }
    
    // Si todos están completos, estado 'ready'
    return plugin.states.find(s => s.id === 'ready')!
  }
  
  // Recalcular estado de forma flexible (permite saltar estados)
  private recalculateState(context: any, plugin: TramitePlugin): StateDefinition {
    // Permite que el usuario proporcione información fuera de orden
    // Ej: Si usuario dice "es casado" antes de dar nombre, aceptarlo
    
    // Buscar qué estados pueden completarse con la información actual
    for (const state of plugin.states) {
      if (this.canCompleteState(state, context)) {
        return state
      }
    }
    
    return this.determineCurrentState(context, plugin)
  }
  
  // Generar respuesta usando LLM (para flexibilidad conversacional)
  private async generateResponse(
    context: any,
    state: StateDefinition,
    plugin: TramitePlugin,
    validation: ValidationResult
  ): Promise<string> {
    // Usar LLM para generar respuesta natural y flexible
    // No preguntar exactamente lo mismo siempre
    
    const prompt = `
      Eres un asistente notarial ayudando a capturar información para un ${plugin.name}.
      
      Estado actual: ${state.name}
      Información capturada: ${JSON.stringify(context, null, 2)}
      Validación: ${JSON.stringify(validation, null, 2)}
      
      Genera una pregunta natural y flexible para solicitar la información faltante.
      Sé flexible: si el usuario ya proporcionó información similar, no la pidas de nuevo.
      Si el usuario proporciona información fuera de orden, acéptala.
      
      Respuesta:
    `
    
    // Llamar a LLM
    const llmResponse = await callLLM(prompt)
    return llmResponse
  }
}
```

**Ventajas**:
- ✅ **Extensible**: Agregar nuevo trámite = crear nuevo plugin
- ✅ **Flexible**: LLM maneja flexibilidad conversacional
- ✅ **Mantenible**: Cada plugin es independiente
- ✅ **Reutilizable**: Sistema base sirve para todos los trámites
- ✅ **Testeable**: Cada plugin tiene sus propios tests

**Cómo agregar nuevo trámite**:
```typescript
// 1. Crear plugin nuevo
class NuevoTramitePlugin implements TramitePlugin {
  // Definir estados, reglas, validación, conversión
}

// 2. Registrar plugin
tramiteSystem.registerPlugin(new NuevoTramitePlugin())

// ¡Listo! Sin tocar código base
```

---

## Opción 2: Configuration-Driven System

**Concepto**: Estados y reglas definidos en configuración (DB o JSON).

**Cómo funcionaría**:
```typescript
// Configuración de Preaviso (en DB o JSON)
const preavisoConfig = {
  id: 'preaviso',
  name: 'Preaviso de Compraventa',
  states: [
    {
      id: 'registry',
      name: 'Registro e Inmueble',
      required: true,
      fields: ['inmueble.folio_real', 'inmueble.direccion'],
      questionTemplate: 'Para continuar necesito que subas la hoja de inscripción del inmueble.'
    },
    {
      id: 'seller',
      name: 'Vendedor',
      required: true,
      fields: ['vendedores[].nombre', 'vendedores[].tipo_persona'],
      questionTemplate: '¿Quién es el vendedor? Indica si es persona física o moral.'
    },
    // ... más estados
  ],
  captureRules: [
    {
      name: 'folio_selection',
      pattern: '^\\d{6,}$',
      condition: 'context.state === "registry"',
      handler: 'FolioSelectionHandler',
      updates: ['inmueble.folio_real']
    },
    {
      name: 'estado_civil',
      pattern: '\\b(casado|soltero|divorciado|viudo)\\b',
      condition: 'context.state === "buyer" || context.state === "seller"',
      handler: 'EstadoCivilHandler',
      updates: ['compradores[].persona_fisica.estado_civil']
    },
    // ... más reglas
  ],
  validation: {
    required: [
      'inmueble.folio_real',
      'vendedores[].nombre',
      'vendedores[].tipo_persona',
      'compradores[].nombre',
      'compradores[].tipo_persona'
    ],
    conditional: {
      'creditos': 'compradores[].necesitaCredito === true'
    }
  },
  finalJSONMapping: {
    'vendedor.nombre': 'vendedores[0].persona_fisica.nombre || vendedores[0].persona_moral.denominacion_social',
    'comprador.nombre': 'compradores[0].persona_fisica.nombre || compradores[0].persona_moral.denominacion_social',
    // ... mapeos
  }
}

// Sistema base (lee configuración)
class ConfigurationDrivenSystem {
  async process(
    tramiteConfig: any,
    userInput: string,
    context: any
  ): Promise<any> {
    // 1. Leer estados de configuración
    // 2. Aplicar reglas de configuración
    // 3. Validar según configuración
    // 4. Generar respuesta según templates
  }
}
```

**Ventajas**:
- ✅ **Sin código**: Nuevo trámite = nueva configuración
- ✅ **No-programadores**: Puede configurarse sin código
- ✅ **Flexible**: Configuración puede cambiar sin deploy

**Desventajas**:
- ⚠️ **Limitado**: Configuración puede no ser suficiente para lógica compleja
- ⚠️ **Menos flexible**: Difícil manejar casos edge

---

## Opción 3: Hybrid: Plugin System + Flexible State Machine

**Concepto**: Plugin System con State Machine flexible (lo mejor de ambos).

**Cómo funcionaría**:
```typescript
// Plugin con State Machine flexible
class PreavisoPlugin implements TramitePlugin {
  id = 'preaviso'
  
  // State Machine flexible (no rígido)
  stateMachine = new FlexibleStateMachine([
    {
      id: 'registry',
      transitions: [
        {
          to: 'seller',
          condition: (ctx) => !!ctx.inmueble?.folio_real,
          // Puede transicionar a seller si tiene folio
        },
        {
          to: 'buyer',
          condition: (ctx) => !!ctx.vendedores?.length && !!ctx.inmueble?.folio_real,
          // Puede saltar a buyer si tiene vendedor y folio
        }
      ]
    },
    {
      id: 'seller',
      transitions: [
        {
          to: 'payment',
          condition: (ctx) => !!ctx.vendedores?.[0]?.tipo_persona
        },
        {
          to: 'buyer',
          condition: (ctx) => !!ctx.compradores?.length,
          // Permite ir a buyer incluso si falta payment (flexible)
        }
      ]
    },
    // ... más estados
  ])
  
  // Handlers específicos
  handlers = [
    new FolioSelectionHandler(),
    new EstadoCivilHandler(),
    // ...
  ]
  
  // LLM para flexibilidad conversacional
  async interpretFlexible(userInput: string, context: any): Promise<any> {
    // LLM interpreta input incluso si está fuera de orden
    // Ej: Usuario dice "es casado" antes de dar nombre → aceptarlo
  }
}
```

**Ventajas**:
- ✅ **Flexible**: State Machine permite transiciones flexibles
- ✅ **Extensible**: Plugin System para nuevos trámites
- ✅ **Conversacional**: LLM maneja flexibilidad
- ✅ **Estructurado**: State Machine da estructura pero no rígida

---

## Opción 4: LLM-First con Post-Validation

**Concepto**: Confiar más en el LLM, validar después.

**Cómo funcionaría**:
```typescript
class LLMFirstSystem {
  async process(
    tramiteType: string,
    userInput: string,
    context: any
  ): Promise<any> {
    // 1. LLM interpreta TODO el input (máxima flexibilidad)
    const llmInterpretation = await llm.interpret({
      tramiteType,
      userInput,
      currentContext: context,
      schema: getSchemaForTramite(tramiteType) // Schema del trámite
    })
    
    // 2. Validar contra schema del trámite
    const validation = validateAgainstSchema(
      llmInterpretation,
      getSchemaForTramite(tramiteType)
    )
    
    // 3. Si válido, aplicar cambios
    if (validation.valid) {
      context = mergeContext(context, llmInterpretation)
    } else {
      // Preguntar por campos faltantes
      return askForMissing(validation.missing)
    }
    
    // 4. Generar respuesta flexible con LLM
    const response = await llm.generateResponse({
      tramiteType,
      context,
      validation,
      instructions: getInstructionsForTramite(tramiteType)
    })
    
    return { context, response, validation }
  }
}

// Schema por trámite (fácil agregar nuevos)
const tramiteSchemas = {
  preaviso: {
    required: ['inmueble.folio_real', 'vendedores', 'compradores'],
    optional: ['creditos', 'gravamenes'],
    structure: PreavisoData
  },
  testamento: {
    required: ['testator', 'beneficiaries'],
    optional: ['assets', 'executor'],
    structure: TestamentoData
  }
}
```

**Ventajas**:
- ✅ **Máxima flexibilidad**: LLM maneja todo
- ✅ **Fácil agregar trámites**: Solo definir schema
- ✅ **Conversacional**: Muy natural

**Desventajas**:
- ⚠️ **Menos control**: Depende mucho del LLM
- ⚠️ **Validación tardía**: Errores se detectan después
- ⚠️ **Costo**: Más llamadas a LLM

---

## Comparación de Opciones

| Aspecto | Plugin System | Config-Driven | Hybrid | LLM-First |
|---------|---------------|---------------|--------|-----------|
| **Flexibilidad** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Extensibilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Control** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Mantenibilidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Riesgo** | Bajo | Medio | Bajo | Alto |

---

## Recomendación Final: **Plugin System + Flexible State Machine** ⭐⭐⭐⭐⭐

**Por qué**:
1. **Extensible**: Agregar nuevo trámite = crear plugin nuevo (sin tocar código base)
2. **Flexible**: State Machine permite transiciones flexibles, LLM maneja conversación
3. **Controlado**: Validación y estructura pero sin ser rígido
4. **Mantenible**: Cada plugin es independiente

**Cómo funciona**:
```
Usuario: "es casado" (fuera de orden)
  ↓
Plugin determina: puede aceptar aunque estemos en estado "buyer_name"
  ↓
EstadoCivilHandler procesa
  ↓
State Machine actualiza estado (flexible, no rígido)
  ↓
LLM genera respuesta natural
```

**Para agregar nuevo trámite**:
```typescript
// 1. Crear plugin
class NuevoTramitePlugin implements TramitePlugin {
  // Definir estados, handlers, validación
}

// 2. Registrar
system.registerPlugin(new NuevoTramitePlugin())

// ¡Listo! Sistema base maneja todo
```

---

## Estructura Propuesta

```
lib/
  tramites/
    base/
      tramite-system.ts        # Sistema base (no conoce trámites específicos)
      tramite-plugin.ts        # Interface para plugins
      flexible-state-machine.ts # State Machine flexible
    plugins/
      preaviso/
        preaviso-plugin.ts     # Plugin de preaviso
        handlers/              # Handlers específicos de preaviso
        validators/
        schemas/
      testamento/
        testamento-plugin.ts   # Plugin de testamento (futuro)
        handlers/
        validators/
        schemas/
      # Nuevos trámites aquí
```

**Ventajas**:
- ✅ Sistema base reutilizable
- ✅ Cada trámite es independiente
- ✅ Fácil agregar nuevos trámites
- ✅ Flexibilidad conversacional con LLM

¿Te parece bien esta arquitectura? ¿Quieres que implemente un prototipo del Plugin System?
