# Arquitectura de Prompts — Sistema de IA Notarial

Este documento define la arquitectura de prompts del chat asistente. **Todos los desarrolladores** (Cursor, VSCode u otro IDE) deben seguir estas reglas al modificar prompts.

> **Nota:** Tras el refactor multi-agente (ver `docs/PLAN_REFACTOR_AGENTE_MULTIAGENTE_RAG.md`), las ubicaciones de código pueden cambiar. La **arquitectura y responsabilidades** permanecen igual.

---

## Objetivo Crítico

Prevenir **fuga de responsabilidades** entre prompts. La mayoría de bugs pasados fueron causados por modificar el **prompt equivocado**. Antes de cualquier cambio, debes saber:

- **Qué** prompt puede cambiar
- **Qué** prompt está prohibido cambiar
- **Cuándo** la lógica va en código, no en prompts

---

## Los 4 Prompts — Responsabilidades Exclusivas

Hay **exactamente cuatro prompts**. Sus responsabilidades **no se solapan**.

### PROMPT 1 — Identidad y Cognición (System Core)

| Aspecto | Detalle |
|---------|---------|
| **Ubicación actual** | `lib/ai/prompts/chat.ts` — constante `PROMPT_SYSTEM_CORE` |
| **Tras refactor** | `lib/prompts/retrieval-response.ts` — PROMPT_1_IDENTITY |
| **Propósito** | Identidad del agente, tono, estilo de comunicación, orden de preguntas (alto nivel) |

**Puede cambiar si y solo si** el cambio afecta:
- Tono o estilo de lenguaje
- Etiqueta en conversación
- Reglas de redacción de preguntas
- Restricciones de identidad (ej. "no eres abogado")
- Orden del flujo en términos humanos

**Nunca puede cambiar para:** Reglas de negocio, validación legal, máquinas de estado, lógica de bloqueo, JSON schema, formato de salida, definiciones de terminología de dominio.

---

### PROMPT 2 — Reglas de Negocio (Domain & Legal)

| Aspecto | Detalle |
|---------|---------|
| **Ubicación actual** | Base de datos: `preaviso_config.prompt` |
| **Tras refactor** | Tabla `knowledge_chunks` — chunks recuperados por RAG (ver plan §5.3) |
| **Propósito** | Definiciones legales, terminología de dominio, reglas de bloqueo, persona moral, validación de registro, qué está permitido o prohibido legalmente |

**Puede cambiar si y solo si** el cambio afecta:
- Requisitos legales
- Reglas de dominio notarial
- Definiciones o transiciones de estado (conceptualmente)
- Condiciones de bloqueo
- Lógica de validación
- Restricciones de persona moral
- Reglas de registro/folio/hipoteca

**Nunca puede cambiar para:** Tono de conversación, redacción de preguntas, formato JSON de salida, restricciones técnicas de schema, contexto de sesión en runtime.

**Cómo actualizar:**
- **Hoy:** Crear migración SQL en `supabase/migrations/` y actualizar `preaviso_config.prompt` vía SQL.
- **Tras refactor:** Insertar o editar chunks en `knowledge_chunks`. Nunca modificar PROMPT 2 en archivos de código.

---

### PROMPT 3 — Estado / Tarea (Runtime Context)

| Aspecto | Detalle |
|---------|---------|
| **Ubicación actual** | `lib/ai/prompts/chat.ts` — función `buildPromptTaskState` |
| **Tras refactor** | `lib/prompts/retrieval-response.ts` — `buildPromptTaskState` |
| **Propósito** | Snapshot del estado actual, datos capturados, datos faltantes, razones de bloqueo, acciones permitidas en este turno |

**Puede cambiar si y solo si** el cambio afecta:
- Qué contexto de runtime se muestra al modelo
- Estructura del snapshot de estado
- Flags como completed / blocked / missing
- Representación autoritativa de los datos de sesión

**Nunca puede cambiar para:** Reglas de negocio, definiciones legales, identidad o tono, reglas de salida JSON, lógica de transiciones de estado (esa va en código).

**Importante:** PROMPT 3 es **descriptivo**, nunca **prescriptivo**. Describe la realidad; no decide qué pasa después. La lógica que determina el estado vive en **código**, no en el texto del prompt.

---

### PROMPT 4 — Contrato de Salida (Output Contract)

| Aspecto | Detalle |
|---------|---------|
| **Ubicación actual** | `lib/ai/prompts/chat.ts` — constante `PROMPT_TECHNICAL_OUTPUT` |
| **Tras refactor** | `lib/prompts/retrieval-response.ts` — PROMPT_4_OUTPUT_CONTRACT |
| **Propósito** | Hacer cumplir el contrato `<DATA_UPDATE>`, controlar la salida JSON, prevenir inferencia y carry-over, garantizar seguridad del schema |

**Puede cambiar si y solo si** el cambio afecta:
- Campos del JSON schema
- Reglas de validación de salida
- Restricciones de emisión
- Modos de fallo
- Seguridad de salida

**Nunca puede cambiar para:** Flujo de conversación, lógica de negocio, reglas legales, definiciones de estado, tono.

---

## Reglas Absolutas

1. **Nunca** mover reglas entre prompts.
2. **Nunca** duplicar lógica entre prompts.
3. **Nunca** "arreglar" un bug editando el prompt equivocado.
4. **Nunca** añadir lógica de máquina de estado a PROMPT 1 o PROMPT 3.
5. **Nunca** añadir reglas legales a PROMPT 4.
6. **Nunca** añadir reglas de formato de salida a PROMPT 1 o PROMPT 2.
7. **Nunca** añadir reglas de conversación a PROMPT 2 o PROMPT 4.
8. **Nunca** añadir contexto de runtime a PROMPT 1, PROMPT 2 o PROMPT 4.

---

## Matriz de Responsabilidad (Clasificación de Cambios)

Antes de modificar cualquier prompt, clasifica el cambio en **exactamente una** categoría:

| Categoría | Prompt correcto |
|-----------|-----------------|
| Identidad / Conversación | PROMPT 1 |
| Legal / Regla de negocio | PROMPT 2 |
| Contexto de estado en runtime | PROMPT 3 |
| Salida / Schema / JSON | PROMPT 4 |

Si el cambio abarca más de una categoría → **PARAR**. Pedir que se divida la solicitud y explicar qué partes van en cada prompt.

---

## Código vs Prompt

Si el cambio involucra:
- Transiciones de estado
- Avanzar pasos
- Determinar completitud
- Decidir cuándo generar salida
- Calcular el estado actual

→ **Pertenece al CÓDIGO**, no a ningún prompt.

Los prompts **describen restricciones**. El código **decide el comportamiento**. PROMPT 3 lo genera el código y describe el estado; PROMPT 3 no contiene la lógica para determinarlo.

---

## Errores Comunes a Evitar

| ❌ Incorrecto | ✅ Correcto |
|---------------|-------------|
| Añadir reglas de bloqueo a PROMPT 1 | Las reglas de bloqueo van en PROMPT 2 |
| Añadir JSON schema a PROMPT 2 | El JSON schema va en PROMPT 4 |
| Añadir reglas de conversación a PROMPT 2 | Las reglas de conversación van en PROMPT 1 |
| Añadir lógica de determinación de estado al texto de PROMPT 3 | La lógica va en el código que genera PROMPT 3 |
| Modificar PROMPT 2 directamente en código | PROMPT 2 se actualiza vía migración SQL (o chunks en DB) |
| Añadir definiciones legales a PROMPT 4 | Las definiciones legales van en PROMPT 2 |

---

## Checklist Antes de Commit

- [ ] El cambio afecta **solo un** prompt
- [ ] El cambio coincide con la responsabilidad del prompt
- [ ] No se movió lógica entre prompts
- [ ] No se introdujo duplicación
- [ ] Si PROMPT 2: se creó archivo de migración SQL (o se editaron chunks)
- [ ] Si PROMPT 3: solo cambió la lógica de generación, no reglas de negocio
- [ ] La lógica de código (determinación de estado) está separada del texto del prompt

---

## Directiva Final

**Estabilidad > ingenio.** **Determinismo > comodidad.** No optimizar colapsando responsabilidades.

En caso de duda: preguntar qué prompt debe cambiar, rechazar cambios ambiguos y preservar la separación de responsabilidades.
