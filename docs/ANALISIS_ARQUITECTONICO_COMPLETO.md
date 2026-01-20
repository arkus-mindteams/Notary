# Análisis Arquitectónico Completo del Sistema de Chat

## Resumen Ejecutivo

El sistema actual tiene **problemas arquitectónicos fundamentales** que causan:
- Duplicación de lógica entre código determinista y LLM
- Conflictos entre múltiples flujos de procesamiento
- Dificultad para mantener y debuggear
- Errores difíciles de reproducir y corregir

## Arquitectura Actual (Simplificada)

```
Usuario envía mensaje
    ↓
Frontend (preaviso-chat.tsx)
    ↓
POST /api/ai/preaviso-chat
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PRE-LLM Deterministic Update                                │
│ applyDeterministicUserInputUpdate()                         │
│ - Parsea el input del usuario                               │
│ - Aplica reglas deterministas                               │
│ - Actualiza contexto ANTES de llamar al LLM                 │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ RAG (OCR) - Document Evidence                               │
│ maybeAttachDocumentEvidence()                               │
│ - Busca documentos en Redis                                 │
│ - Adjunta evidencia al contexto                             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Build System Prompts                                        │
│ buildSystemPrompts()                                        │
│ - PROMPT 1: Identity & Cognition                            │
│ - PROMPT 2: Business Rules (desde DB)                       │
│ - PROMPT 3: Task/State (dinámico)                           │
│ - PROMPT 4: Technical Output                                │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ LLM Call (OpenAI)                                           │
│ - Genera respuesta                                          │
│ - Puede emitir <DATA_UPDATE>                                │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Extract Data from Message                                   │
│ extractDataFromMessage()                                    │
│ - Parsea <DATA_UPDATE> del LLM                              │
│ - Normaliza a estructura v1.4                               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Guards & Post-processing                                    │
│ - Guards para prevenir invención de datos                   │
│ - Validaciones adicionales                                  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ POST-LLM Deterministic Update                               │
│ applyDeterministicUserInputUpdate() (DE NUEVO)              │
│ - Parsea el mismo input OTRA VEZ                            │
│ - Aplica reglas deterministas                               │
│ - Puede sobrescribir lo que capturó el LLM                  │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Merge Context Updates                                       │
│ mergeContextUpdates() (múltiples veces)                     │
│ - merge(updatedData, deterministicUpdate)                   │
│ - merge(preDeterministicUpdate, postMerged)                 │
│ - merge(mergedUpdate, docIntentUpdate)                      │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Recompute State                                             │
│ computePreavisoState()                                      │
│ - Calcula estado actual                                     │
│ - Identifica campos faltantes                               │
│ - Determina bloqueos                                        │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Build Deterministic Follow-up                               │
│ buildDeterministicFollowUp()                                │
│ - Genera preguntas deterministas                            │
│ - Prioriza sobre respuesta del LLM                          │
└─────────────────────────────────────────────────────────────┘
    ↓
Response al Frontend
```

## Problemas Fundamentales

### 1. **Triple Procesamiento del Mismo Input**

El mismo input del usuario se procesa **3 veces**:
- **Pre-LLM**: `applyDeterministicUserInputUpdate()` antes de llamar al LLM
- **LLM**: El LLM también procesa el input y puede emitir `<DATA_UPDATE>`
- **Post-LLM**: `applyDeterministicUserInputUpdate()` **de nuevo** después del LLM

**Problema**: Pueden entrar en conflicto, duplicar lógica, o sobrescribirse entre sí.

**Ejemplo**: Si el usuario dice "casado", el código determinista lo captura ANTES del LLM, luego el LLM también lo captura, y luego el código determinista lo procesa OTRA VEZ después del LLM.

### 2. **Función Monolítica `applyDeterministicUserInputUpdate`**

La función tiene **más de 1100 líneas** y maneja **decenas de casos diferentes**:
- Folio selection
- Partida selection
- Titular registral capture
- Buyer name capture
- Spouse capture
- Credit institution capture
- Credit participants parsing
- Encumbrance handling
- Estado civil capture
- Tipo persona inference
- ... y muchos más

**Problema**:
- Violación del principio de responsabilidad única
- Extremadamente difícil de mantener
- Imposible de testear de forma unitaria
- Cada cambio afecta múltiples casos

### 3. **Múltiples Merges de Contexto**

El contexto se mergea **hasta 4 veces** en un solo request:
```typescript
// 1. Pre-LLM merge
contextForLLM = merge(context, preDeterministicUpdate)

// 2. Post-LLM merge
postMerged = merge(updatedData, deterministicUpdate)

// 3. Pre + Post merge
mergedUpdate = merge(preDeterministicUpdate, postMerged)

// 4. Final merge con intent
mergedUpdateWithIntent = merge(mergedUpdate, docIntentUpdate)
```

**Problema**:
- Pérdida de datos si se sobrescribe incorrectamente
- Dificultad para rastrear de dónde viene cada valor
- No hay rollback si algo sale mal

### 4. **Falta de Separación entre Parsing y Validación**

El parsing determinista **también valida**:
- Valida nombres (longitud, palabras inválidas)
- Valida instituciones de crédito
- Valida roles de participantes
- ... etc

El LLM **también valida** (implícitamente a través de los prompts).

**Problema**:
- Lógica de validación duplicada
- Inconsistencias entre validaciones
- No hay una capa de validación centralizada

### 5. **Estado Disperso**

El estado vive en **múltiples lugares**:
- `context` (estructura de datos)
- `computed.state` (resultado de `computePreavisoState()`)
- `computed.derived` (valores derivados)
- `prompts.state` (estado para los prompts)

**Problema**:
- No hay una fuente única de verdad
- Dificultad para sincronizar estado
- Puede haber inconsistencias

### 6. **Lógica de Negocio en Múltiples Lugares**

La lógica de negocio está en:
- **PROMPT 2** (DB): Reglas de negocio en lenguaje natural
- **Código determinista**: Reglas hardcodeadas en `applyDeterministicUserInputUpdate`
- **computePreavisoState**: Lógica de cálculo de estado
- **buildDeterministicFollowUp**: Lógica de generación de preguntas
- **LLM**: Reglas implícitas a través de prompts

**Problema**:
- Cambiar una regla requiere modificar múltiples lugares
- Inconsistencias entre implementaciones
- Difícil de mantener sincronizado

### 7. **Falta de Manejo de Errores Robusto**

Si algo falla en cualquier punto:
- No hay rollback
- El estado puede quedar inconsistente
- No hay logs estructurados para debugging

### 8. **Testing Imposible**

Con esta arquitectura:
- Imposible hacer unit tests
- Imposible hacer integration tests
- Solo se puede hacer manual testing (que es lo que estamos haciendo)

## Opciones de Solución

### Opción 1: **Refactor a Sistema de Eventos/Comandos** ⭐ RECOMENDADA

**Arquitectura**:
```
Usuario envía mensaje
    ↓
Parse Input → Genera Command(s)
    ↓
Command Handler → Actualiza State
    ↓
State Machine → Determina Next Action
    ↓
LLM (solo para generar preguntas) → Response
```

**Ventajas**:
- ✅ Separación clara de responsabilidades
- ✅ Cada handler maneja UN caso específico
- ✅ Fácil de testear
- ✅ Predecible y mantenible
- ✅ Puede implementarse incrementalmente

**Desventajas**:
- ⚠️ Requiere refactor grande inicial
- ⚠️ Puede perder flexibilidad del LLM

**Implementación**:
- Crear `Command` interface
- Crear handlers específicos: `HandleFolioSelection`, `HandleBuyerName`, etc.
- State machine centralizada
- LLM solo para generar preguntas, NO para capturar datos

### Opción 2: **Simplificar y Confiar Más en el LLM**

**Arquitectura**:
```
Usuario envía mensaje
    ↓
LLM procesa TODO → <DATA_UPDATE>
    ↓
Validación centralizada
    ↓
Merge único al contexto
    ↓
Response
```

**Ventajas**:
- ✅ Menos código complejo
- ✅ Más flexible
- ✅ LLM puede manejar casos edge

**Desventajas**:
- ❌ LLM puede ser impredecible
- ❌ Requiere prompts muy bien escritos
- ❌ Puede ser más costoso (más tokens)

### Opción 3: **Sistema Híbrido Mejorado**

**Arquitectura**:
```
Usuario envía mensaje
    ↓
Pre-Processor → Detecta tipo de input
    ↓
┌─────────────┬─────────────┐
│ Determinista│    LLM      │
│ (casos      │  (casos     │
│ claros)     │ complejos)  │
└─────────────┴─────────────┘
    ↓
Normalizador → Unifica formato
    ↓
Validador → Valida centralmente
    ↓
State Manager → Actualiza estado
    ↓
Response Generator → Genera respuesta
```

**Ventajas**:
- ✅ Balance entre determinismo y flexibilidad
- ✅ Puede implementarse incrementalmente
- ✅ Mantiene beneficios de ambos enfoques

**Desventajas**:
- ⚠️ Aún puede ser complejo
- ⚠️ Requiere buena coordinación entre capas

### Opción 4: **Arquitectura por Capas (Layered Architecture)**

**Arquitectura**:
```
┌─────────────────────────────────────┐
│ Presentation Layer                  │
│ - Frontend UI                       │
│ - Message Formatting                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Application Layer                   │
│ - Command Handlers                  │
│ - Use Cases                         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Domain Layer                        │
│ - Business Logic                    │
│ - State Machine                     │
│ - Validation Rules                  │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Infrastructure Layer                │
│ - LLM Service                       │
│ - State Repository                  │
│ - Document Service                  │
└─────────────────────────────────────┘
```

**Ventajas**:
- ✅ Separación clara de responsabilidades
- ✅ Fácil de testear cada capa
- ✅ Escalable y mantenible
- ✅ Sigue principios SOLID

**Desventajas**:
- ⚠️ Requiere refactor completo
- ⚠️ Puede ser over-engineering para este caso

## Recomendación Final

**Opción 1 (Sistema de Eventos/Comandos)** es la mejor opción porque:

1. **Resuelve los problemas fundamentales**:
   - Elimina triple procesamiento
   - Separa responsabilidades
   - Facilita testing

2. **Es implementable incrementalmente**:
   - Empezar con un caso (ej: folio selection)
   - Mover otros casos gradualmente
   - No requiere reescribir todo de una vez

3. **Mantiene el valor del LLM**:
   - LLM sigue generando preguntas naturales
   - LLM puede ayudar en casos complejos
   - Pero no depende de él para casos simples

4. **Mejora mantenibilidad**:
   - Cada handler es pequeño y enfocado
   - Fácil de testear
   - Fácil de debuggear

## Plan de Implementación (Opción 1)

### Fase 1: Fundación (1-2 semanas)
1. Crear `Command` interface y `CommandHandler` interface
2. Crear `StateManager` centralizado
3. Crear `ValidationService` centralizado
4. Crear sistema de logging estructurado

### Fase 2: Migración Incremental (2-4 semanas)
1. Migrar folio selection (caso más simple)
2. Migrar estado civil capture
3. Migrar tipo persona capture
4. Migrar buyer name capture
5. ... (uno por uno)

### Fase 3: Limpieza (1 semana)
1. Eliminar función monolítica `applyDeterministicUserInputUpdate`
2. Simplificar merge de contexto
3. Actualizar documentación
4. Tests completos

### Fase 4: Optimización (1 semana)
1. Optimizar LLM prompts (ya no necesitan capturar datos)
2. Mejorar manejo de errores
3. Performance tuning

**Total estimado: 5-8 semanas**

## Alternativa: Quick Win (Mejoras Incrementales)

Si el refactor completo no es viable ahora, podemos hacer **mejoras incrementales**:

1. **Dividir `applyDeterministicUserInputUpdate`** en funciones más pequeñas:
   - `handleFolioSelection()`
   - `handleBuyerCapture()`
   - `handleCreditCapture()`
   - etc.

2. **Reducir merges** a máximo 2:
   - Pre-LLM deterministic
   - Post-LLM (LLM + deterministic)

3. **Crear funciones helper centralizadas**:
   - `getConyugeNombre(context)`
   - `isValidName(name)`
   - `normalizeFolio(folio)`

4. **Mejorar logging** para debugging

**Esto puede mejorar el sistema en 1-2 semanas** sin requerir refactor completo.

## Decisión Requerida

**¿Cuál opción prefieres?**

A. **Refactor completo a Sistema de Eventos/Comandos** (5-8 semanas, mejor a largo plazo)
B. **Quick Win: Mejoras Incrementales** (1-2 semanas, mejora inmediata)
C. **Análisis más profundo** de algún aspecto específico antes de decidir
