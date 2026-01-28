# Plugin System + Flexible State Machine + LLM: Explicación Detallada

## Los Tres Componentes y Cómo Trabajan Juntos

### 1. **Plugin System** (Extensibilidad)
**Rol**: Define qué información necesita cada trámite y cómo procesarla.

### 2. **Flexible State Machine** (Estructura sin Rigidez)
**Rol**: Mantiene el orden lógico pero permite flexibilidad.

### 3. **LLM** (Flexibilidad Conversacional)
**Rol**: Interpreta lenguaje natural y genera respuestas naturales.

---

## Cómo Interactúan los Tres Componentes

```
Usuario envía mensaje
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PLUGIN SYSTEM                                               │
│ - Identifica qué trámite estamos procesando (preaviso)      │
│ - Obtiene reglas de captura del plugin                     │
│ - Obtiene estados del plugin                               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ FLEXIBLE STATE MACHINE                                      │
│ - Determina estado actual (pero flexible)                   │
│ - Valida transiciones (pero permite saltos)                │
│ - Recalcula estado después de procesar                     │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ LLM (Interpretación)                                        │
│ - Si no hay captura determinista → LLM interpreta          │
│ - Permite información fuera de orden                       │
│ - Extrae múltiples campos de un solo mensaje                │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ HANDLERS (Procesamiento)                                    │
│ - Procesan datos capturados (determinista o LLM)          │
│ - Actualizan contexto                                       │
│ - Emiten eventos                                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ FLEXIBLE STATE MACHINE (Recalcular)                         │
│ - Recalcula estado con nuevo contexto                       │
│ - Puede saltar estados si información está completa         │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ LLM (Generación de Respuesta)                              │
│ - Genera pregunta natural y flexible                        │
│ - Varía la manera de preguntar                             │
│ - No repite información ya capturada                        │
└─────────────────────────────────────────────────────────────┘
    ↓
Response al usuario
```

---

## Componente 1: Plugin System (Extensibilidad)

### ¿Qué es?
Un sistema donde cada trámite es un "plugin" independiente que define:
- Qué información necesita
- Cómo capturarla
- Cómo validarla
- Cómo convertirla a JSON final

### Estructura de un Plugin

```typescript
interface TramitePlugin {
  // Identificación
  id: string                    // 'preaviso', 'testamento', etc.
  name: string                  // 'Preaviso de Compraventa'
  
  // Estados (definidos por el plugin)
  getStates(context: any): StateDefinition[]
  
  // Determinar estado actual (FLEXIBLE)
  determineCurrentState(context: any): StateDefinition
  
  // Reglas de captura (casos deterministas)
  getCaptureRules(): CaptureRule[]
  
  // Validación específica del trámite
  validate(context: any): ValidationResult
  
  // Conversión a JSON final
  toFinalJSON(context: any): any
  
  // Generar pregunta (puede usar LLM)
  generateQuestion(state: StateDefinition, context: any): Promise<string>
  
  // Interpretar input (FLEXIBLE - permite fuera de orden)
  interpretInput(input: string, context: any): Promise<InterpretationResult>
}
```

### Ejemplo: Plugin de Preaviso

```typescript
class PreavisoPlugin implements TramitePlugin {
  id = 'preaviso'
  name = 'Preaviso de Compraventa'
  
  // Estados específicos de preaviso
  getStates(context: any): StateDefinition[] {
    return [
      {
        id: 'registry',
        name: 'Registro e Inmueble',
        required: true,
        fields: ['inmueble.folio_real'],
        // Este estado necesita: folio real
      },
      {
        id: 'seller',
        name: 'Vendedor',
        required: true,
        fields: ['vendedores[].nombre', 'vendedores[].tipo_persona'],
        // Este estado necesita: nombre y tipo de persona del vendedor
      },
      {
        id: 'payment',
        name: 'Forma de Pago',
        required: true,
        fields: ['creditos'], // undefined = no confirmado
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
        // Condicional: solo si es persona física
        fields: ['compradores[].persona_fisica.estado_civil'],
      },
      {
        id: 'credit',
        name: 'Crédito',
        required: false,
        conditional: (ctx) => ctx.creditos && ctx.creditos.length > 0,
        // Condicional: solo si hay crédito
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
        name: 'Listo para Generar',
        required: true,
      }
    ]
  }
  
  // Reglas de captura deterministas (casos claros)
  getCaptureRules(): CaptureRule[] {
    return [
      {
        name: 'folio_selection',
        // Patrón: número de 6+ dígitos
        pattern: /^\d{6,}$/,
        // Condición: está en contexto de folio O usuario menciona "folio"
        condition: (input, ctx) => {
          return ctx.state === 'registry' || 
                 /folio/i.test(input) ||
                 ctx.folios?.candidates?.length > 0
        },
        // Extraer: el número
        extract: (input) => ({ folio: input }),
        // Handler: procesador específico
        handler: 'FolioSelectionHandler'
      },
      {
        name: 'estado_civil',
        pattern: /\b(casado|soltero|divorciado|viudo)\b/i,
        // FLEXIBLE: siempre aceptar (incluso fuera de orden)
        condition: () => true,
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
}
```

### Ventajas del Plugin System

1. **Extensibilidad**: Agregar nuevo trámite = crear plugin nuevo
   ```typescript
   // Nuevo trámite: Testamento
   class TestamentoPlugin implements TramitePlugin {
     id = 'testamento'
     getStates() { /* estados de testamento */ }
     // ... implementación
   }
   
   // Registrar
   system.registerPlugin(new TestamentoPlugin())
   // ¡Listo! Sin tocar código base
   ```

2. **Independencia**: Cada trámite es independiente
   - Cambios en preaviso no afectan testamento
   - Tests independientes por trámite
   - Fácil mantener

3. **Reutilización**: Sistema base sirve para todos
   - No reescribir lógica común
   - Handlers compartidos cuando aplica

---

## Componente 2: Flexible State Machine (Estructura sin Rigidez)

### ¿Qué es?
Una máquina de estados que mantiene el orden lógico pero permite flexibilidad:
- **No es rígida**: Puede saltar estados si el usuario proporciona información fuera de orden
- **Valida transiciones**: Pero permite transiciones flexibles
- **Recalcula dinámicamente**: Estado actual se recalcula según contexto

### State Machine Rígida vs Flexible

**Rígida (NO queremos esto)**:
```
Estado 1 → Estado 2 → Estado 3 → Estado 4
  ↓         ↓         ↓         ↓
Debe      Debe      Debe      Debe
completar completar completar completar
en orden  en orden  en orden  en orden
```

**Flexible (LO QUE QUEREMOS)**:
```
Estado 1 → Estado 2 → Estado 3 → Estado 4
  ↓         ↓         ↓         ↓
Puede     Puede     Puede     Puede
saltar    saltar    saltar    saltar
si tiene  si tiene  si tiene  si tiene
info      info      info      info
```

### Implementación Flexible

```typescript
class FlexibleStateMachine {
  // Determinar estado actual (FLEXIBLE)
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
    return states.find(s => s.id === 'ready')!
  }
  
  // Verificar si estado está completado
  private isStateCompleted(state: StateDefinition, context: any): boolean {
    for (const field of state.fields) {
      if (!this.hasField(context, field)) {
        return false
      }
    }
    return true
  }
  
  // FLEXIBLE: Verificar si hay información parcial para el estado
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
  
  // Verificar si campo existe en contexto
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
        if (current[part] === undefined || current[part] === null) {
          return false
        }
        current = current[part]
      }
    }
    
    return true
  }
  
  // Transiciones flexibles (no rígidas)
  canTransitionTo(
    fromState: StateDefinition,
    toState: StateDefinition,
    context: any
  ): boolean {
    // FLEXIBLE: Permitir transición si:
    // 1. Es el siguiente estado lógico (normal)
    // 2. O si el usuario proporcionó información del estado destino (flexible)
    
    // Transición normal
    if (this.isNextLogicalState(fromState, toState)) {
      return true
    }
    
    // Transición flexible: usuario proporcionó info del estado destino
    if (this.hasPartialInfoForState(toState, context)) {
      return true // Permitir saltar
    }
    
    return false
  }
}
```

### Ejemplo de Flexibilidad

**Caso 1: Usuario proporciona información fuera de orden**

```
Estado actual: "buyer" (esperando nombre del comprador)
Usuario: "es casado"

Sistema:
1. FlexibleStateMachine detecta: usuario proporcionó info de estado "estado_civil"
2. Permite transición flexible: buyer → estado_civil
3. Captura estado civil
4. Recalcula: estado actual sigue siendo "buyer" (falta nombre)
5. Siguiente pregunta: "Perfecto, es casado. ¿Cuál es el nombre del comprador?"
```

**Caso 2: Usuario proporciona múltiple información**

```
Estado actual: "buyer"
Usuario: "el comprador es WU, JINWEI, es persona física, casado, necesita crédito con BBVA"

Sistema:
1. LLM extrae: nombre, tipo persona, estado civil, forma de pago, institución
2. FlexibleStateMachine permite múltiples transiciones:
   - buyer → completado (tiene nombre)
   - estado_civil → completado (tiene estado civil)
   - payment → completado (tiene forma de pago)
   - credit → parcial (tiene institución, falta participantes)
3. Recalcula: estado actual = "credit" (siguiente pendiente)
4. Siguiente pregunta: "Para el crédito con BBVA, ¿quiénes participarán?"
```

---

## Componente 3: LLM (Flexibilidad Conversacional)

### ¿Qué es?
El LLM maneja dos aspectos:

1. **Interpretación flexible**: Interpreta input del usuario incluso si está fuera de orden
2. **Generación natural**: Genera preguntas naturales y variadas

### LLM para Interpretación

```typescript
class LLMInterpreter {
  async interpret(
    userInput: string,
    context: any,
    plugin: TramitePlugin,
    conversationHistory: ChatMessage[]
  ): Promise<InterpretationResult> {
    // Prompt para LLM
    const prompt = `
      Eres un asistente notarial ayudando con un ${plugin.name}.
      
      Contexto actual:
      ${JSON.stringify(context, null, 2)}
      
      Historial de conversación:
      ${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}
      
      Input del usuario: "${userInput}"
      
      Tu tarea: Interpreta el input del usuario y extrae TODA la información relevante.
      
      IMPORTANTE - Sé FLEXIBLE:
      1. Si el usuario proporciona información fuera de orden, acéptala y captúrala
      2. Si el usuario proporciona información de múltiples campos, captura todo
      3. Si el usuario corrige información previa, actualízala
      4. Si el usuario proporciona información implícita, infiérela (pero sé conservador)
      
      Emite <DATA_UPDATE> con la información extraída en formato JSON v1.4.
      
      Si no hay información nueva para capturar, NO emitas <DATA_UPDATE>.
    `
    
    const response = await this.llmService.call(prompt)
    return this.extractDataFromLLMResponse(response)
  }
}
```

### LLM para Generación de Respuestas

```typescript
class LLMResponseGenerator {
  async generateQuestion(
    state: StateDefinition,
    context: any,
    plugin: TramitePlugin,
    conversationHistory: ChatMessage[]
  ): Promise<string> {
    // Prompt para LLM
    const prompt = `
      Eres un asistente notarial ayudando a capturar información para un ${plugin.name}.
      
      Estado actual: ${state.name}
      Información ya capturada:
      ${JSON.stringify(context, null, 2)}
      
      Campos faltantes para este estado:
      ${state.fields.join(', ')}
      
      Historial de conversación:
      ${conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}
      
      Tu tarea: Genera una pregunta NATURAL y FLEXIBLE para solicitar la información faltante.
      
      REGLAS IMPORTANTES:
      1. Sé conversacional, no robótico
      2. NO repitas información que el usuario ya proporcionó
      3. Varía tu manera de preguntar (no siempre la misma pregunta)
      4. Si el usuario proporcionó información similar, no la pidas de nuevo
      5. Sé flexible: acepta información incluso si está fuera de orden
      6. Si el usuario ya está proporcionando información, no interrumpas con preguntas
      
      Solo la pregunta, sin explicaciones ni <DATA_UPDATE>:
    `
    
    const response = await this.llmService.call(prompt)
    return response.trim()
  }
}
```

### Ejemplos de Flexibilidad del LLM

**Ejemplo 1: Interpretación fuera de orden**

```
Usuario: "es casado" (sin haber dado nombre primero)

LLM interpreta:
- Detecta: estado civil = "casado"
- Emite: <DATA_UPDATE> { "compradores": [{ "persona_fisica": { "estado_civil": "casado" } }] } </DATA_UPDATE>

Sistema acepta y captura, aunque no estemos en estado "estado_civil"
```

**Ejemplo 2: Múltiple información**

```
Usuario: "el comprador es WU, JINWEI, es persona física, casado, necesita crédito con BBVA"

LLM interpreta:
- Detecta: nombre, tipo persona, estado civil, forma de pago, institución
- Emite: <DATA_UPDATE> {
    "compradores": [{
      "persona_fisica": {
        "nombre": "WU, JINWEI",
        "estado_civil": "casado"
      },
      "tipo_persona": "persona_fisica"
    }],
    "creditos": [{
      "institucion": "BBVA"
    }]
  } </DATA_UPDATE>

Sistema captura todo de una vez
```

**Ejemplo 3: Corrección**

```
Usuario: "no, el vendedor no es INMOBILIARIA ENCASA, es INMOBILIARIA Y DESARROLLADORA ENCASA"

LLM interpreta:
- Detecta: corrección de nombre
- Emite: <DATA_UPDATE> {
    "vendedores": [{
      "persona_moral": {
        "denominacion_social": "INMOBILIARIA Y DESARROLLADORA ENCASA"
      }
    }]
  } </DATA_UPDATE>

Sistema corrige información
```

**Ejemplo 4: Preguntas variadas**

```
Primera vez:
LLM: "Para continuar necesito que subas la hoja de inscripción del inmueble."

Segunda vez (si usuario no subió):
LLM: "¿Tienes la hoja de inscripción? Es necesaria para continuar."

Tercera vez (si usuario pregunta qué es):
LLM: "La hoja de inscripción es el documento del registro público que muestra la información del inmueble. ¿La tienes disponible?"
```

---

## Flujo Completo: Los Tres Componentes Trabajando Juntos

### Ejemplo Real: Usuario dice "es casado" fuera de orden

```
1. Usuario: "es casado"
   (Estado actual: "buyer" - esperando nombre)

2. PLUGIN SYSTEM
   - Identifica: plugin = PreavisoPlugin
   - Obtiene reglas de captura
   - Busca regla que coincida con "es casado"
   - Encuentra: regla "estado_civil" (condition: siempre true - flexible)

3. HANDLER (si hay regla determinista)
   - EstadoCivilHandler procesa
   - Actualiza: compradores[0].persona_fisica.estado_civil = "casado"
   - Emite evento: 'BuyerEstadoCivilUpdated'

4. FLEXIBLE STATE MACHINE
   - Recalcula estado con nuevo contexto
   - Detecta: tiene estado civil pero falta nombre
   - Estado sigue siendo "buyer" (falta nombre)
   - PERO: permite que estado_civil esté "completado" aunque no estemos en ese estado

5. LLM (Generación de Respuesta)
   - Recibe: estado = "buyer", contexto = { compradores: [{ estado_civil: "casado" }] }
   - Genera: "Perfecto, el comprador es casado. ¿Cuál es el nombre completo del comprador?"
   - (Nota: LLM no pregunta de nuevo el estado civil porque ya lo tiene)

6. Response al usuario
   "Perfecto, el comprador es casado. ¿Cuál es el nombre completo del comprador?"
```

### Ejemplo Real: Usuario proporciona múltiple información

```
1. Usuario: "el comprador es WU, JINWEI, es persona física, casado, necesita crédito con BBVA"

2. PLUGIN SYSTEM
   - Identifica: plugin = PreavisoPlugin
   - Busca reglas de captura
   - Encuentra múltiples coincidencias parciales pero ninguna completa

3. LLM (Interpretación - porque no hay regla determinista completa)
   - LLM interpreta el input completo
   - Extrae: nombre, tipo persona, estado civil, forma de pago, institución
   - Emite: <DATA_UPDATE> con toda la información

4. HANDLERS (múltiples)
   - BuyerNameHandler: procesa nombre
   - TipoPersonaHandler: procesa tipo persona
   - EstadoCivilHandler: procesa estado civil
   - PaymentMethodHandler: procesa forma de pago
   - CreditInstitutionHandler: procesa institución
   - Todos actualizan contexto

5. FLEXIBLE STATE MACHINE
   - Recalcula estado con nuevo contexto
   - Detecta: buyer completado, estado_civil completado, payment completado
   - Estado actual: "credit" (siguiente pendiente: participantes del crédito)

6. LLM (Generación de Respuesta)
   - Genera: "Para el crédito con BBVA, ¿quiénes participarán específicamente en ese crédito y con qué carácter? (acreditado o coacreditado)"

7. Response al usuario
   "Para el crédito con BBVA, ¿quiénes participarán específicamente en ese crédito y con qué carácter?"
```

---

## Ventajas de Esta Combinación

### 1. **Extensibilidad** (Plugin System)
- ✅ Agregar nuevo trámite = crear plugin nuevo
- ✅ No tocar código base
- ✅ Cada trámite es independiente

### 2. **Estructura** (Flexible State Machine)
- ✅ Mantiene orden lógico
- ✅ Pero permite flexibilidad
- ✅ Fácil ver en qué punto está el sistema

### 3. **Flexibilidad** (LLM)
- ✅ Acepta información fuera de orden
- ✅ Interpreta lenguaje natural
- ✅ Genera preguntas naturales y variadas

### 4. **Mantenibilidad**
- ✅ Código organizado por trámite
- ✅ Fácil encontrar y modificar
- ✅ Tests independientes

---

## Comparación: Sistema Actual vs Sistema Propuesto

### Sistema Actual:
```
Usuario: "es casado"
  ↓
applyDeterministicUserInputUpdate() (1100+ líneas)
  - Busca en 50+ if statements
  - Encuentra coincidencia
  - Actualiza contexto
  - Pero: puede entrar en conflicto con LLM
  - Pero: difícil de mantener
```

### Sistema Propuesto:
```
Usuario: "es casado"
  ↓
Plugin System: Identifica regla "estado_civil"
  ↓
EstadoCivilHandler: Procesa (50 líneas, enfocado)
  ↓
Flexible State Machine: Recalcula estado (flexible)
  ↓
LLM: Genera pregunta natural
  ↓
Response
```

**Ventajas**:
- ✅ Más claro: cada componente tiene su rol
- ✅ Más mantenible: handlers pequeños y enfocados
- ✅ Más flexible: LLM maneja casos complejos
- ✅ Más extensible: fácil agregar nuevos trámites

---

## Preguntas Frecuentes

**P: ¿El LLM reemplaza a los handlers?**
R: No. LLM complementa:
- Handlers: casos claros y deterministas (más rápido, más confiable)
- LLM: casos complejos y flexibles (más natural, más flexible)

**P: ¿Qué pasa si el LLM se equivoca?**
R: Validación después:
- LLM extrae información
- Validación verifica que sea correcta
- Si no es válida, se rechaza y se pide de nuevo

**P: ¿El State Machine es realmente flexible?**
R: Sí, porque:
- Permite saltar estados si usuario proporciona información
- Recalcula dinámicamente según contexto
- No es rígido: puede estar en múltiples estados simultáneamente

**P: ¿Cómo se agrega un nuevo trámite?**
R: 3 pasos:
1. Crear plugin nuevo (implementar TramitePlugin)
2. Definir estados, handlers, validación
3. Registrar plugin en sistema

**P: ¿Qué tan riesgoso es?**
R: Bajo riesgo porque:
- Migración incremental (un plugin a la vez)
- Feature flags (activar/desactivar)
- Sistema viejo sigue funcionando como fallback
- Tests exhaustivos antes de migrar

---

## Conclusión

**Plugin System + Flexible State Machine + LLM** es la mejor combinación porque:

1. **Plugin System**: Extensibilidad (fácil agregar trámites)
2. **Flexible State Machine**: Estructura sin rigidez (orden lógico pero flexible)
3. **LLM**: Flexibilidad conversacional (natural y adaptable)

**Resultado**: Sistema extensible, flexible, mantenible y conversacional.

¿Quieres que implemente un prototipo para que veas cómo funciona en la práctica?
