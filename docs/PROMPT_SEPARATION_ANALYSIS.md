# Análisis de Separación de Responsabilidades en el Prompt Generado

## PROBLEMA IDENTIFICADO

El prompt generado en la migración 007 **NO respeta la separación de responsabilidades** que definimos. Es un prompt monolítico que mezcla todas las capas.

## ANÁLISIS DEL PROMPT ACTUAL

### Lo que está en la DB (migración 007):

```
ROL DEL CHATBOT                    → PROMPT 1 (Identity)
PRINCIPIOS OBLIGATORIOS            → PROMPT 1 (Cognition)
CONTROL DE INFORMACIÓN IMPRESA     → PROMPT 2 (Business Rules)
PERSONA MORAL                      → PROMPT 2 (Business Rules)
REGLAS DE COMUNICACIÓN             → PROMPT 1 (Identity/Behavior)
MANEJO DE "NO SÉ"                  → PROMPT 2 (Business Rules)
ACLARACIÓN DE CONFLICTOS           → PROMPT 2 (Business Rules)
REGLAS DE ESTRUCTURA Y FORMATO     → PROMPT 2 (Business Rules)
ESTRUCTURA FIJA DEL PRE-AVISO       → PROMPT 2 (Business Rules)
FLUJO CONVERSACIONAL (ESTADO 1-6)  → PROMPT 2 (Business Rules)
REGLAS DE BLOQUEO                  → PROMPT 2 (Business Rules)
SALIDA OBLIGATORIA                 → PROMPT 4 (Technical Output)
```

### Lo que agrega el código (`buildSystemPrompt`):

```typescript
// PROMPT 3 (Task/State)
- Estado actual del flujo conversacional
- Información capturada según estados
- Documentos procesados y información extraída
- Expediente existente

// PROMPT 4 (Technical Output)
- Formato de respuesta obligatorio (<DATA_UPDATE>)
- Reglas técnicas de implementación
- Schema JSON v1.2
```

## VIOLACIONES DE SEPARACIÓN

### ❌ VIOLACIÓN 1: PROMPT 1 mezclado con PROMPT 2

**En la DB:**
- "ROL DEL CHATBOT" (PROMPT 1) está junto con "FLUJO CONVERSACIONAL" (PROMPT 2)
- "PRINCIPIOS OBLIGATORIOS" (PROMPT 1) está junto con "REGLAS DE BLOQUEO" (PROMPT 2)

**Problema:** No hay separación clara entre identidad/cognición y reglas de negocio.

### ❌ VIOLACIÓN 2: PROMPT 2 mezclado con PROMPT 4

**En la DB:**
- "SALIDA OBLIGATORIA" (PROMPT 4) está en el mismo prompt que "REGLAS DE BLOQUEO" (PROMPT 2)

**Problema:** No hay separación entre reglas de negocio y reglas técnicas de output.

### ❌ VIOLACIÓN 3: PROMPT 3 generado dinámicamente pero mezclado

**En el código:**
- PROMPT 3 (estado actual, datos capturados) se genera dinámicamente
- Pero se concatena con el prompt completo de la DB que ya tiene PROMPT 1, 2, y 4 mezclados

**Problema:** No hay separación clara de capas, todo se mezcla en un solo system prompt.

### ❌ VIOLACIÓN 4: PROMPT 4 duplicado

**En la DB:**
- "SALIDA OBLIGATORIA" menciona JSON canónico

**En el código:**
- Se agrega "FORMATO DE RESPUESTA OBLIGATORIO" con <DATA_UPDATE>

**Problema:** Reglas de output duplicadas y posiblemente contradictorias.

## ESTRUCTURA CORRECTA (según separación de responsabilidades)

### PROMPT 1 (SYSTEM CORE) - Identity & Cognition
**Debe contener SOLO:**
- Identidad del agente (quién es, quién NO es)
- Principios cognitivos (anti-inferencia, anti-asunción)
- Restricciones de comportamiento (no ayudar a bypass, no sugerir)
- Fuentes válidas de datos

**NO debe contener:**
- Reglas de negocio específicas del dominio
- Estados del flujo
- Reglas de bloqueo
- Formato de output

### PROMPT 2 (BUSINESS RULES) - Domain & Legal Constraints
**Debe contener SOLO:**
- Modelo de estados (ESTADO 1-6)
- Reglas de bloqueo por estado
- Reglas de validación (persona moral, titular registral, múltiples folios)
- Definiciones estrictas (existeHipoteca, all_registry_pages_confirmed, etc.)
- Reglas de manejo de "no sé"
- Reglas de aclaración de conflictos
- Estructura del documento (pre-aviso)

**NO debe contener:**
- Identidad del agente
- Principios cognitivos generales
- Formato técnico de output (<DATA_UPDATE>)
- Estado actual dinámico

### PROMPT 3 (TASK/STATE) - Dynamic Context
**Debe contener SOLO:**
- Estado actual (generado dinámicamente)
- Datos ya capturados (con fuente y estado de confirmación)
- Datos faltantes/por confirmar
- Documentos procesados disponibles
- Condiciones de bloqueo activas

**NO debe contener:**
- Reglas globales de negocio
- Identidad del agente
- Formato de output

### PROMPT 4 (TECHNICAL OUTPUT) - Output Rules
**Debe contener SOLO:**
- Contrato estricto de <DATA_UPDATE>
- Schema JSON v1.2 completo
- Reglas de validación de output
- Ejemplos válidos e inválidos
- Modo de falla (qué hacer cuando viola condiciones)

**NO debe contener:**
- Reglas de negocio
- Identidad del agente
- Estado actual

## PROPUESTA DE REFACTORIZACIÓN

### Opción 1: Separar en 4 prompts distintos en la DB

```sql
-- Tabla: preaviso_config
-- Campos:
-- - prompt_system_core (PROMPT 1)
-- - prompt_business_rules (PROMPT 2)
-- - prompt_technical_output (PROMPT 4)
-- - prompt_task_state se genera dinámicamente (PROMPT 3)
```

**Ventajas:**
- Separación clara de responsabilidades
- Fácil de mantener y actualizar
- Cada prompt tiene un propósito único

**Desventajas:**
- Requiere cambio en schema de DB
- Requiere cambio en código que lee los prompts

### Opción 2: Mantener un solo prompt pero con secciones claramente marcadas

```sql
-- Mantener prompt único pero con delimitadores claros:
-- === PROMPT 1: SYSTEM CORE ===
-- === PROMPT 2: BUSINESS RULES ===
-- === PROMPT 4: TECHNICAL OUTPUT ===
-- PROMPT 3 se genera dinámicamente en el código
```

**Ventajas:**
- No requiere cambio en schema
- Separación conceptual clara
- Fácil de leer y mantener

**Desventajas:**
- Sigue siendo un prompt monolítico
- Puede ser confuso para el LLM

### Opción 3: Usar múltiples system messages en OpenAI

```typescript
const messages = [
  { role: 'system', content: prompt1_system_core },
  { role: 'system', content: prompt2_business_rules },
  { role: 'system', content: prompt3_task_state }, // dinámico
  { role: 'system', content: prompt4_technical_output },
  ...userMessages
]
```

**Ventajas:**
- Separación física real
- OpenAI puede procesar múltiples system messages
- Cada prompt tiene su propio "rol" en la conversación

**Desventajas:**
- Requiere cambio en código
- OpenAI puede mezclar los system messages internamente

## RECOMENDACIÓN

**Opción 2 (secciones marcadas) + Opción 3 (múltiples system messages)** es la mejor solución:

1. Separar el prompt en la DB en secciones claramente marcadas
2. En el código, extraer cada sección y enviarla como system message separado
3. PROMPT 3 se genera dinámicamente como siempre

Esto da:
- ✅ Separación clara de responsabilidades
- ✅ Fácil mantenimiento
- ✅ No requiere cambio en schema (solo estructura del prompt)
- ✅ Separación física en los mensajes a OpenAI

## PREGUNTA PARA EL PRODUCT OWNER

¿Prefieres:
1. **Refactorizar ahora** para separar correctamente los prompts (requiere cambios en código y estructura del prompt)?
2. **Mantener como está** pero documentar las violaciones (más rápido, pero menos limpio)?
3. **Separar gradualmente** (empezar con secciones marcadas, luego separar físicamente)?

