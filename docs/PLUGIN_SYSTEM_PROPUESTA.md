# Propuesta: Plugin System para Trámites Flexibles y Extensibles

## Objetivos

1. ✅ **Flexibilidad conversacional**: El agente puede aceptar información fuera de orden
2. ✅ **Extensibilidad**: Agregar nuevo trámite = crear plugin nuevo (sin tocar código base)
3. ✅ **Mantenibilidad**: Cada trámite es independiente

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────┐
│                   SISTEMA BASE                              │
│  (No conoce detalles de trámites específicos)               │
│  - Plugin Manager                                           │
│  - Flexible State Machine                                   │
│  - LLM Orchestrator                                         │
│  - Context Manager                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PREAVISO     │  │ TESTAMENTO   │  │ PODER        │
│ Plugin       │  │ Plugin       │  │ Plugin       │
│              │  │              │  │              │
│ - Estados    │  │ - Estados    │  │ - Estados    │
│ - Handlers   │  │ - Handlers   │  │ - Handlers   │
│ - Validación │  │ - Validación │  │ - Validación │
│ - Schema     │  │ - Schema     │  │ - Schema     │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## Estructura del Sistema Base

```typescript
// lib/tramites/base/tramite-plugin.ts
export interface TramitePlugin {
  // Identificación
  id: string
  name: string
  description: string
  
  // Estados del trámite (flexibles, no rígidos)
  getStates(context: any): StateDefinition[]
  
  // Determinar estado actual (flexible)
  determineCurrentState(context: any): StateDefinition
  
  // Reglas de captura
  getCaptureRules(): CaptureRule[]
  
  // Validación
  validate(context: any): ValidationResult
  
  // Conversión a JSON final
  toFinalJSON(context: any): any
  
  // Generar pregunta (puede usar LLM para flexibilidad)
  generateQuestion(state: StateDefinition, context: any): Promise<string>
  
  // Interpretar input del usuario (flexible, permite fuera de orden)
  interpretInput(input: string, context: any): Promise<InterpretationResult>
}

// lib/tramites/base/tramite-system.ts
export class TramiteSystem {
  private plugins: Map<string, TramitePlugin> = new Map()
  private llmService: LLMService
  
  // Registrar plugin
  registerPlugin(plugin: TramitePlugin) {
    this.plugins.set(plugin.id, plugin)
  }
  
  // Procesar mensaje del usuario (FLEXIBLE)
  async process(
    tramiteId: string,
    userInput: string,
    context: any,
    conversationHistory: ChatMessage[]
  ): Promise<TramiteResponse> {
    // 1. Obtener plugin
    const plugin = this.plugins.get(tramiteId)
    if (!plugin) {
      throw new Error(`Trámite ${tramiteId} no encontrado`)
    }
    
    // 2. Interpretar input del usuario (FLEXIBLE - puede estar fuera de orden)
    const interpretation = await plugin.interpretInput(userInput, context)
    
    // 3. Intentar captura determinista (si aplica)
    let updatedContext = context
    if (interpretation.captureRule) {
      const handler = this.getHandler(interpretation.captureRule)
      const result = await handler.handle(interpretation, context)
      updatedContext = { ...updatedContext, ...result.updatedContext }
    }
    
    // 4. Si no hay captura determinista, usar LLM para interpretar (FLEXIBLE)
    if (!interpretation.captured) {
      const llmResult = await this.interpretWithLLM(
        userInput,
        updatedContext,
        plugin,
        conversationHistory
      )
      updatedContext = { ...updatedContext, ...llmResult.updatedContext }
    }
    
    // 5. Recalcular estado (FLEXIBLE - puede saltar estados)
    const newState = plugin.determineCurrentState(updatedContext)
    
    // 6. Validar
    const validation = plugin.validate(updatedContext)
    
    // 7. Generar respuesta (FLEXIBLE - LLM genera pregunta natural)
    const response = await plugin.generateQuestion(newState, updatedContext)
    
    return {
      message: response,
      data: updatedContext,
      state: {
        current: newState.id,
        completed: this.getCompletedStates(updatedContext, plugin),
        missing: validation.missing,
        validation
      }
    }
  }
  
  // Interpretar con LLM (para máxima flexibilidad)
  private async interpretWithLLM(
    input: string,
    context: any,
    plugin: TramitePlugin,
    history: ChatMessage[]
  ): Promise<any> {
    // LLM interpreta input incluso si está fuera de orden
    const prompt = `
      Eres un asistente notarial ayudando con un ${plugin.name}.
      
      Contexto actual: ${JSON.stringify(context, null, 2)}
      Historial de conversación: ${JSON.stringify(history, null, 2)}
      Input del usuario: "${input}"
      
      Interpreta el input del usuario y extrae TODA la información relevante.
      IMPORTANTE: 
      - Si el usuario proporciona información fuera de orden, acéptala y captúrala
      - Si el usuario proporciona información de múltiples campos, captura todo
      - Sé flexible con el lenguaje del usuario
      
      Emite <DATA_UPDATE> con la información extraída.
    `
    
    const response = await this.llmService.call(prompt)
    return this.extractDataFromLLMResponse(response)
  }
}
```

---

## Ejemplo: Plugin de Preaviso

```typescript
// lib/tramites/plugins/preaviso/preaviso-plugin.ts
export class PreavisoPlugin implements TramitePlugin {
  id = 'preaviso'
  name = 'Preaviso de Compraventa'
  description = 'Generación de preaviso de compraventa inmobiliaria'
  
  // Estados (FLEXIBLES - pueden completarse en cualquier orden)
  getStates(context: any): StateDefinition[] {
    return [
      {
        id: 'registry',
        name: 'Registro e Inmueble',
        required: true,
        fields: ['inmueble.folio_real'],
        // No es rígido: puede completarse si usuario da folio directamente
      },
      {
        id: 'seller',
        name: 'Vendedor',
        required: true,
        fields: ['vendedores[].nombre', 'vendedores[].tipo_persona'],
        // Flexible: puede completarse aunque falte registry si usuario lo proporciona
      },
      {
        id: 'payment',
        name: 'Forma de Pago',
        required: true,
        fields: ['creditos'], // undefined = no confirmado, [] = contado, [...] = crédito
      },
      {
        id: 'buyer',
        name: 'Comprador',
        required: true,
        fields: ['compradores[].nombre', 'compradores[].tipo_persona'],
      },
      {
        id: 'estado_civil',
        name: 'Estado Civil',
        required: (ctx) => ctx.compradores?.[0]?.tipo_persona === 'persona_fisica',
        fields: ['compradores[].persona_fisica.estado_civil'],
        // Flexible: puede completarse aunque falte buyer.name
      },
      {
        id: 'credit',
        name: 'Crédito',
        required: false,
        conditional: (ctx) => ctx.creditos && ctx.creditos.length > 0,
        fields: ['creditos[].institucion', 'creditos[].participantes'],
      },
      {
        id: 'encumbrance',
        name: 'Gravámenes',
        required: true,
        fields: ['inmueble.existe_hipoteca'],
      },
      {
        id: 'ready',
        name: 'Listo',
        required: true,
      }
    ]
  }
  
  // Determinar estado actual (FLEXIBLE - no es rígido)
  determineCurrentState(context: any): StateDefinition {
    const states = this.getStates(context)
    
    // Buscar primer estado no completado
    // PERO: si el usuario proporcionó información de un estado futuro, aceptarla
    
    for (const state of states) {
      if (state.id === 'ready') continue
      
      // Verificar si está completado
      if (this.isStateCompleted(state, context)) {
        continue
      }
      
      // Verificar condiciones condicionales
      if (state.conditional && typeof state.conditional === 'function') {
        if (!state.conditional(context)) {
          continue
        }
      }
      
      return state
    }
    
    return states.find(s => s.id === 'ready')!
  }
  
  // Interpretar input (FLEXIBLE - permite fuera de orden)
  async interpretInput(input: string, context: any): Promise<InterpretationResult> {
    // 1. Intentar captura determinista (casos claros)
    const captureRule = this.findMatchingCaptureRule(input, context)
    if (captureRule) {
      return {
        captured: true,
        captureRule,
        data: captureRule.extract(input, context)
      }
    }
    
    // 2. Si no hay captura determinista, dejar que LLM interprete
    // (Esto permite máxima flexibilidad)
    return {
      captured: false,
      needsLLM: true
    }
  }
  
  // Reglas de captura (casos claros y deterministas)
  getCaptureRules(): CaptureRule[] {
    return [
      {
        name: 'folio_selection',
        pattern: /^\d{6,}$/,
        condition: (input, ctx) => {
          // Está en contexto de selección de folio O usuario dice número de folio
          return ctx.state === 'registry' || 
                 /folio/i.test(input) ||
                 ctx.folios?.candidates?.length > 0
        },
        extract: (input, ctx) => ({ folio: input }),
        handler: 'FolioSelectionHandler'
      },
      {
        name: 'estado_civil',
        pattern: /\b(casado|soltero|divorciado|viudo)\b/i,
        condition: (input, ctx) => {
          // Flexible: acepta incluso si no estamos en estado "estado_civil"
          // El usuario puede decir "es casado" en cualquier momento
          return true // Siempre aceptar
        },
        extract: (input) => ({ estadoCivil: normalizeEstadoCivil(input) }),
        handler: 'EstadoCivilHandler'
      },
      {
        name: 'payment_method',
        pattern: /\b(contado|cr[eé]dito)\b/i,
        condition: (input, ctx) => {
          return ctx.state === 'payment' || 
                 /forma\s+de\s+pago|pagar/i.test(input)
        },
        extract: (input) => ({ method: extractPaymentMethod(input) }),
        handler: 'PaymentMethodHandler'
      },
      // ... más reglas
    ]
  }
  
  // Validación
  validate(context: any): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const missing: string[] = []
    
    const states = this.getStates(context)
    
    for (const state of states) {
      if (state.id === 'ready') continue
      
      // Verificar si es requerido
      const isRequired = typeof state.required === 'function' 
        ? state.required(context)
        : state.required === true
      
      if (!isRequired) continue
      
      // Verificar si está completado
      if (!this.isStateCompleted(state, context)) {
        missing.push(...state.fields)
      }
    }
    
    return {
      valid: errors.length === 0 && missing.length === 0,
      errors,
      warnings,
      missing
    }
  }
  
  // Generar pregunta (FLEXIBLE - usa LLM para naturalidad)
  async generateQuestion(
    state: StateDefinition,
    context: any
  ): Promise<string> {
    // Si hay pregunta determinista, usarla
    if (state.deterministicQuestion) {
      return state.deterministicQuestion(context)
    }
    
    // Si no, usar LLM para generar pregunta natural y flexible
    const prompt = `
      Eres un asistente notarial ayudando a capturar información para un Preaviso de Compraventa.
      
      Estado actual: ${state.name}
      Información ya capturada: ${JSON.stringify(context, null, 2)}
      Campos faltantes: ${state.fields.join(', ')}
      
      Genera una pregunta NATURAL y FLEXIBLE para solicitar la información faltante.
      
      IMPORTANTE:
      - Sé conversacional, no robótico
      - Si el usuario ya proporcionó información similar, no la pidas de nuevo
      - Si el usuario proporciona información fuera de orden, acéptala
      - Varía tu manera de preguntar (no siempre la misma pregunta)
      
      Solo la pregunta, sin explicaciones:
    `
    
    const response = await llmService.call(prompt)
    return response.trim()
  }
  
  // Conversión a JSON final
  toFinalJSON(context: any): PreavisoSimplifiedJSON {
    return {
      tipoOperacion: 'compraventa',
      vendedores: this.convertVendedores(context.vendedores),
      compradores: this.convertCompradores(context.compradores),
      creditos: this.convertCreditos(context.creditos),
      inmueble: this.convertInmueble(context.inmueble),
      gravamenes: this.convertGravamenes(context.gravamenes),
      actos: this.calculateActos(context),
      // ... conversión completa
    }
  }
}
```

---

## Ejemplo: Plugin de Testamento (Futuro)

```typescript
// lib/tramites/plugins/testamento/testamento-plugin.ts
export class TestamentoPlugin implements TramitePlugin {
  id = 'testamento'
  name = 'Testamento'
  description = 'Generación de testamento notarial'
  
  getStates(context: any): StateDefinition[] {
    return [
      {
        id: 'testator',
        name: 'Testador',
        required: true,
        fields: ['testator.nombre', 'testator.tipo_persona']
      },
      {
        id: 'beneficiaries',
        name: 'Beneficiarios',
        required: true,
        fields: ['beneficiaries[]']
      },
      {
        id: 'assets',
        name: 'Bienes',
        required: false,
        fields: ['assets[]']
      },
      {
        id: 'executor',
        name: 'Albacea',
        required: false,
        fields: ['executor.nombre']
      },
      {
        id: 'ready',
        name: 'Listo'
      }
    ]
  }
  
  // Mismos métodos: determineCurrentState, interpretInput, validate, etc.
  // Pero con lógica específica de testamento
}
```

---

## Cómo Agregar Nuevo Trámite

### Paso 1: Crear Plugin
```typescript
// lib/tramites/plugins/nuevo-tramite/nuevo-tramite-plugin.ts
export class NuevoTramitePlugin implements TramitePlugin {
  id = 'nuevo_tramite'
  name = 'Nuevo Trámite'
  
  // Definir estados
  getStates(context: any): StateDefinition[] {
    return [
      // Estados específicos del nuevo trámite
    ]
  }
  
  // Implementar métodos requeridos
  determineCurrentState(context: any): StateDefinition { /* ... */ }
  interpretInput(input: string, context: any): Promise<InterpretationResult> { /* ... */ }
  validate(context: any): ValidationResult { /* ... */ }
  toFinalJSON(context: any): any { /* ... */ }
  generateQuestion(state: StateDefinition, context: any): Promise<string> { /* ... */ }
  
  // Definir handlers específicos si los necesitas
  getCaptureRules(): CaptureRule[] {
    return [
      // Reglas específicas del nuevo trámite
    ]
  }
}
```

### Paso 2: Crear Handlers (si los necesitas)
```typescript
// lib/tramites/plugins/nuevo-tramite/handlers/nuevo-handler.ts
export class NuevoHandler {
  async handle(input: string, context: any) {
    // Lógica específica del nuevo trámite
  }
}
```

### Paso 3: Registrar Plugin
```typescript
// app/api/tramites/route.ts
import { NuevoTramitePlugin } from '@/lib/tramites/plugins/nuevo-tramite/nuevo-tramite-plugin'

const tramiteSystem = new TramiteSystem()

// Registrar plugins
tramiteSystem.registerPlugin(new PreavisoPlugin())
tramiteSystem.registerPlugin(new TestamentoPlugin())
tramiteSystem.registerPlugin(new NuevoTramitePlugin()) // ← Nuevo trámite

// ¡Listo! Sin tocar código base
```

---

## Flexibilidad Conversacional

### Ejemplo 1: Información fuera de orden

**Usuario**: "es casado" (antes de dar nombre)

**Sistema**:
1. `interpretInput()` detecta: "es casado"
2. `EstadoCivilHandler` captura estado civil
3. `determineCurrentState()` todavía está en "buyer" (porque falta nombre)
4. `generateQuestion()`: "Perfecto, WU, JINWEI es casado. ¿El cónyuge participará?"
   - Nota: LLM genera pregunta natural, no rígida

### Ejemplo 2: Información múltiple en un mensaje

**Usuario**: "el comprador es WU, JINWEI, es persona física, está casado y necesita crédito con BBVA"

**Sistema**:
1. `interpretInput()` detecta múltiples campos
2. Captura todo: nombre, tipo persona, estado civil, forma de pago, institución
3. Actualiza contexto con todo
4. `determineCurrentState()` avanza varios estados de una vez

### Ejemplo 3: Corrección posterior

**Usuario**: "no, el vendedor no es INMOBILIARIA ENCASA, es INMOBILIARIA Y DESARROLLADORA ENCASA"

**Sistema**:
1. `interpretInput()` detecta corrección
2. Actualiza vendedor con nombre correcto
3. `generateQuestion()`: "Corregido. ¿Confirmas que INMOBILIARIA Y DESARROLLADORA ENCASA es persona moral?"

---

## Ventajas de Esta Arquitectura

### 1. **Extensibilidad** ⭐⭐⭐⭐⭐
- Agregar nuevo trámite = crear plugin nuevo
- No tocar código base
- Cada trámite es independiente

### 2. **Flexibilidad** ⭐⭐⭐⭐⭐
- LLM maneja flexibilidad conversacional
- Acepta información fuera de orden
- Preguntas naturales y variadas

### 3. **Mantenibilidad** ⭐⭐⭐⭐⭐
- Código organizado por trámite
- Fácil encontrar y modificar lógica de cada trámite
- Tests independientes por trámite

### 4. **Reutilización** ⭐⭐⭐⭐
- Sistema base sirve para todos los trámites
- Handlers comunes pueden compartirse
- Servicios compartidos (validación, LLM, etc.)

---

## Estructura de Archivos Propuesta

```
lib/
  tramites/
    base/
      tramite-system.ts           # Sistema base (no conoce trámites específicos)
      tramite-plugin.ts           # Interface para plugins
      llm-service.ts              # Servicio LLM compartido
      validation-service.ts       # Validaciones compartidas
      state-manager.ts            # Gestión de estado flexible
    
    plugins/
      preaviso/
        preaviso-plugin.ts        # Plugin de preaviso
        handlers/
          folio-selection-handler.ts
          estado-civil-handler.ts
          credit-participant-handler.ts
          # ... handlers específicos de preaviso
        validators/
          preaviso-validator.ts
        schemas/
          preaviso-schema.ts
        types.ts                  # Tipos específicos de preaviso
      
      testamento/
        testamento-plugin.ts      # Plugin de testamento (futuro)
        handlers/
          testator-handler.ts
          beneficiary-handler.ts
        # ... estructura similar
      
      # Nuevos trámites aquí
    
    shared/
      handlers/                   # Handlers compartidos entre trámites
        name-handler.ts           # Captura de nombres (común)
        document-handler.ts       # Procesamiento de documentos (común)
      services/
        conyuge-service.ts        # Servicios compartidos
        validation-service.ts
```

---

## API Endpoint Unificado

```typescript
// app/api/tramites/chat/route.ts
export async function POST(req: Request) {
  const { tramiteId, messages, context } = await req.json()
  
  // Sistema base no conoce detalles de trámites específicos
  const tramiteSystem = getTramiteSystem()
  
  const lastUserMessage = messages[messages.length - 1]?.content || ''
  
  const result = await tramiteSystem.process(
    tramiteId,  // 'preaviso', 'testamento', etc.
    lastUserMessage,
    context,
    messages
  )
  
  return NextResponse.json(result)
}
```

**Ventajas**:
- ✅ Un solo endpoint para todos los trámites
- ✅ Sistema base maneja todo
- ✅ Fácil agregar nuevos trámites sin cambiar API

---

## Migración del Sistema Actual

### Fase 1: Crear Plugin de Preaviso (Semanas 1-4)
1. Crear estructura base
2. Migrar lógica actual de preaviso a plugin
3. Probar que funciona igual

### Fase 2: Sistema Base (Semanas 5-6)
1. Implementar sistema base
2. Integrar plugin de preaviso
3. Feature flag para activar/desactivar

### Fase 3: Flexibilidad (Semanas 7-8)
1. Mejorar flexibilidad conversacional
2. Permitir información fuera de orden
3. Mejorar preguntas con LLM

### Fase 4: Preparación para Extensión (Semana 9)
1. Documentar cómo agregar nuevos trámites
2. Crear template de plugin
3. Tests y validación

**Total: 9 semanas** (pero puede hacerse incrementalmente)

---

## Comparación con Sistema Actual

| Aspecto | Sistema Actual | Plugin System |
|---------|----------------|---------------|
| **Agregar trámite** | Reescribir código base | Crear plugin nuevo |
| **Flexibilidad** | Limitada | Alta (LLM + estructura) |
| **Mantenibilidad** | Difícil (código mezclado) | Fácil (por trámite) |
| **Testeable** | Difícil | Fácil (por plugin) |
| **Riesgo** | Alto (afecta todo) | Bajo (por plugin) |

---

## Conclusión

**Plugin System + Flexible State Machine + LLM** es la mejor opción porque:

1. ✅ **Extensible**: Agregar trámite = crear plugin
2. ✅ **Flexible**: LLM maneja conversación natural
3. ✅ **Mantenible**: Cada trámite es independiente
4. ✅ **Seguro**: Sistema base no conoce detalles específicos

¿Te parece bien esta arquitectura? ¿Quieres que implemente un prototipo del Plugin System?
