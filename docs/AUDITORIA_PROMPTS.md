# Auditoría de prompts — Preaviso y flujos IA

**Conclusión:** Hay demasiados prompts, varios **no se usan** en runtime, y los que sí se usan **se pisan** por duplicar las mismas reglas en system y user. La arquitectura documentada (4 prompts: chat.ts + DB) **no es la que corre** en producción.

---

## 1. Mapa de todos los prompts

### 1.1 Flujo de chat Preaviso (lo que realmente se ejecuta)

| Origen | Qué es | Cuándo se usa | Tamaño aprox. |
|--------|--------|----------------|----------------|
| **tramite-system.ts** (líneas 561-595) | Prompt **inline** para interpretar el mensaje del usuario y extraer `<DATA_UPDATE>` | En cada turno del chat, cuando no hay captura determinista (interpretWithLLM) | ~1k tokens |
| **PreavisoPrompts.generateSystemPrompts()** (preaviso-prompts.ts) | Un **solo** system prompt enorme: identidad + RAG documentos + diagnóstico + faltantes + personalidad + **todas** las reglas (NO preguntes, PROHIBIDO, cónyuge, vendedor, comprador, documentos, etc.) | En cada turno, para generar la siguiente pregunta/respuesta (generateQuestion) | ~3–4k+ tokens |
| **PreavisoPrompts.generateUserPrompt()** (preaviso-prompts.ts) | User prompt: contexto JSON + último mensaje + historial + **repetición de las mismas reglas** (cónyuge, vendedor, comprador, PROHIBIDO, etc.) | Mismo turno, como "user" en la llamada a LLM | ~2–3k+ tokens |

**Problema:** Las mismas reglas aparecen en **generateSystemPrompts** y **generateUserPrompt** (ej. "no preguntes por cónyuge si ya está detectado", "no preguntes por vendedor si ya está", PROHIBIDO, orden del flujo). El modelo recibe todo dos veces y puede priorizar mal o contradecirse.

---

### 1.2 Prompts definidos pero **NO usados** en el flujo de chat

| Origen | Qué es | ¿Quién lo usa? |
|--------|--------|----------------|
| **lib/ai/prompts/chat.ts** — `PROMPT_SYSTEM_CORE` | PROMPT 1 (identidad y principios) | **Nadie.** No hay ningún `import` de este módulo en el flujo de preaviso. |
| **lib/ai/prompts/chat.ts** — `PROMPT_TECHNICAL_OUTPUT` | PROMPT 4 (reglas de `<DATA_UPDATE>` y JSON v1.4) | **Nadie.** |
| **lib/ai/prompts/chat.ts** — `buildPromptTaskState()` | PROMPT 3 (estado, pasos, snapshot de datos) | **Nadie.** |
| **preaviso_config.prompt** (tabla `preaviso_config` en DB) | PROMPT 2 (reglas de negocio). Se edita desde el admin. | **Nadie en el chat.** `PreavisoConfigService.getConfig()` solo se llama desde `/api/admin/preaviso-config` para mostrar/editar; el plugin de preaviso **no** inyecta este prompt en ninguna llamada LLM. |

**Problema:** La documentación y `.cursorrules` hablan de "PROMPT 1 en route.ts", "PROMPT 2 en DB", "PROMPT 3 en buildSystemPrompts", "PROMPT 4 en route.ts". En la práctica, **ninguno de esos cuatro se usa** en el chat. El flujo real usa solo PreavisoPrompts + el prompt inline de tramite-system.

---

### 1.3 Prompts de extracción de documentos

| Origen | Qué es | ¿Quién lo usa? |
|--------|--------|----------------|
| **lib/ai/prompts/documents.ts** | PROMPT_DOC_ESCRITURA, PROMPT_DOC_PLANO, PROMPT_DOC_IDENTIFICACION, PROMPT_DOC_ACTA_MATRIMONIO, PROMPT_DOC_INSCRIPCION, PROMPT_DOC_DEFAULT, PROMPT_OCR_SYSTEM, PROMPT_FOLIO_SCAN | **Nadie en el plugin preaviso.** Los handlers de documento (`identificacion-handler.ts`, `inscripcion-handler.ts`, `acta-matrimonio-handler.ts`) definen sus **propios** prompts en `getPrompts()` (systemPrompt + userPrompt inline). No importan `documents.ts`. |
| **Handlers** (document-processor/handlers/*.ts) | Cada handler tiene `getPrompts()` con systemPrompt y userPrompt **inline** | **Sí.** El document-processor llama a `handler.getPrompts()` y usa eso para la extracción por Vision. |

**Problema:** Duplicación de intención: `documents.ts` tiene prompts muy detallados por tipo de documento (inscripción, identificación, acta, etc.) pero el código que realmente corre usa versiones distintas (y a veces más cortas) en los handlers. Riesgo de que alguien edite `documents.ts` pensando que afecta el flujo y no cambie nada.

---

### 1.4 Otros flujos IA (no preaviso chat)

| Origen | Qué es | Uso |
|--------|--------|-----|
| **app/api/ai/structure/route.ts** | `getColindanciasRules()` | Extracción de colindancias. |
| **app/api/ai/notarialize/route.ts** | `buildNotarialPrompt()` | Notarización. |
| **app/api/ai/combine-notarial/route.ts** | `buildCombinePrompt()` | Combinar unidades. |
| **app/api/ai/stats-analysis/route.ts** | Prompt inline | Análisis de estadísticas. |

Estos están aislados y no se pisan con el preaviso.

---

## 2. Resumen de solapamientos y duplicación

### 2.1 Identidad / rol del asistente

- **chat.ts** (no usado): "NOTARIAL DATA CAPTURE ASSISTANT", "You are NOT a lawyer", etc.
- **PreavisoPrompts.generateSystemPrompts** (usado): "Eres un ABOGADO NOTARIAL DE CONFIANZA", "TU MISIÓN: Guiar al cliente...", "Actúa como un abogado notarial experto".

**Conflicto:** En un sitio dice "you are NOT a lawyer"; en el que corre dice "abogado notarial". Son dos identidades distintas y solo una está activa.

### 2.2 Reglas de "no preguntes si ya está capturado"

Aparecen en:

1. **PreavisoPrompts.generateSystemPrompts** (vendedor, comprador, cónyuge, forma de pago, institución, gravamen, RFC/CURP opcionales, valor opcional, etc.).
2. **PreavisoPrompts.generateUserPrompt** (mismo listado: "Si el vendedor ya está detectado, NO preguntes", "Si el cónyuge YA ESTÁ DETECTADO...", "REGLAS CRÍTICAS(ABSOLUTAS)", "VERIFICACIÓN OBLIGATORIA ANTES DE PREGUNTAR POR CÓNYUGE", etc.).

El mismo bloque conceptual está **duplicado** en system y user, con redacción ligeramente distinta. Aumenta tokens y puede generar contradicciones.

### 2.3 Reglas PROHIBIDO / después de procesar documento

- En **generateSystemPrompts**: "PROHIBIDO preguntar...", "REGLA CRÍTICA: DESPUÉS DE PROCESAR UN DOCUMENTO...", "PROHIBIDO preguntar por apoderados...".
- En **generateUserPrompt**: "PROHIBIDO(ABSOLUTO - NUNCA HACER ESTO)", "REGLA CRÍTICA DESPUÉS DE PROCESAR DOCUMENTO", "EJEMPLOS DE LO QUE NO DEBES HACER", "EJEMPLOS DE LO QUE SÍ DEBES HACER".

De nuevo la misma intención en ambos prompts.

### 2.4 Contrato `<DATA_UPDATE>` / JSON v1.4

- **chat.ts PROMPT_TECHNICAL_OUTPUT** (no usado): reglas largas de cuándo emitir `<DATA_UPDATE>`, campos permitidos, prohibiciones por entidad.
- **tramite-system.ts** (usado): un párrafo breve ("Emite <DATA_UPDATE> con la información extraída en formato JSON v1.4. Si no hay información nueva para capturar, NO emitas <DATA_UPDATE>.").

El flujo real no ve las reglas detalladas de PROMPT 4; solo esa instrucción corta. Si quieres que el modelo respete el contrato estricto, hoy no está recibiendo la mayoría de esas reglas.

### 2.5 Reglas de negocio (persona moral, gravámenes, créditos, etc.)

- **preaviso_config.prompt** (DB): contenido largo de PROMPT 2 según migraciones (reglas de negocio, bloqueos, definiciones). **No se inyecta en ninguna llamada LLM del chat.**
- **PreavisoPrompts**: muchas de esas reglas están **replicadas** en texto fijo (persona moral solo denominación, no preguntar firmantes, gravámenes, créditos, etc.).

Resultado: las reglas "oficiales" están en la DB pero el modelo solo ve la versión embebida en PreavisoPrompts. Si cambias la DB desde el admin, el comportamiento del chat no cambia.

---

## 3. Qué hacer (recomendaciones)

### 3.1 Decidir una sola arquitectura de prompts para el chat

- **Opción A — Usar la de 4 capas:** Que el flujo real construya el system con PROMPT 1 (chat.ts) + PROMPT 2 (leer de `preaviso_config.prompt`) + PROMPT 3 (buildPromptTaskState con snapshot) + PROMPT 4 (chat.ts), y **eliminar** el uso de PreavisoPrompts.generateSystemPrompts/generateUserPrompt para esa llamada. Así la documentación y el código coinciden y puedes acortar PROMPT 2/3/4 por separado (y mover detalle a RAG).
- **Opción B — Consolidar en PreavisoPrompts:** Admitir que la "fuente de verdad" del chat es PreavisoPrompts, borrar o marcar como obsoletos PROMPT 1/3/4 de chat.ts y no usar preaviso_config.prompt en el chat. Luego **reducir** PreavisoPrompts a un solo system corto + user con solo contexto/historial (sin repetir reglas en ambos).

En ambos casos hace falta **una** fuente de verdad; hoy hay dos arquitecturas y solo una corre.

### 3.2 Eliminar duplicación system vs user (PreavisoPrompts)

- Poner **todas** las reglas de comportamiento (no preguntes si ya está, PROHIBIDO, después de documento, cónyuge, etc.) **solo en el system** (o en una capa única).
- En el **user** dejar solo: contexto actual (JSON), último mensaje, historial reciente y, si acaso, una línea del estilo "Genera UNA respuesta natural en español. No repitas preguntas para datos ya capturados." Sin repetir listas de PROHIBIDO ni verificaciones de cónyuge/vendedor/comprador.

Así reduces tokens y evitas que el modelo reciba la misma regla dos veces con redacción distinta.

### 3.3 Reintegrar o retirar PROMPT 2 (DB)

- Si quieres que el admin pueda cambiar reglas de negocio sin tocar código: que el flujo de chat **lea** `PreavisoConfigService.getConfig()` y **inyecte** `config.prompt` como parte del system (por ejemplo como PROMPT 2). Hoy no se usa.
- Si no: dejar la DB solo para otro uso (ej. export/auditoría) y tener las reglas solo en código (PreavisoPrompts o RAG). En ese caso, documentar que "preaviso_config.prompt no afecta el chat".

### 3.4 Unificar prompts de documentos

- **Opción A:** Que los handlers importen y usen los `PROMPT_DOC_*` de `lib/ai/prompts/documents.ts` (adaptando si hace falta el formato system/user) para no mantener dos sitios (documents.ts + getPrompts() en cada handler).
- **Opción B:** Borrar o deprecar `documents.ts` y dejar solo los prompts en los handlers; documentar que la fuente de verdad son los handlers.

### 3.5 Contrato `<DATA_UPDATE>` en el flujo real

- Si quieres que interpretWithLLM respete el contrato estricto de PROMPT 4: inyectar **PROMPT_TECHNICAL_OUTPUT** (o una versión acortada) en la llamada de `interpretWithLLM`, o pasar al modelo un system que incluya esas reglas. Hoy el modelo solo recibe la frase breve de tramite-system.

---

## 4. Tabla resumen

| Prompt / Origen | ¿Se usa en chat preaviso? | ¿Se pisa con otro? |
|-----------------|---------------------------|---------------------|
| tramite-system.ts (interpretWithLLM) | Sí | Con chat.ts PROMPT 4 (que no se usa): mismo objetivo, reglas más cortas en el que corre. |
| PreavisoPrompts.generateSystemPrompts | Sí | Con generateUserPrompt (mismas reglas repetidas). Con chat.ts PROMPT 1 (identidad distinta, no usada). Con preaviso_config.prompt (reglas similares, no usada). |
| PreavisoPrompts.generateUserPrompt | Sí | Con generateSystemPrompts (duplicación masiva de reglas). |
| chat.ts PROMPT_SYSTEM_CORE | No | Con generateSystemPrompts (identidad diferente). |
| chat.ts PROMPT_TECHNICAL_OUTPUT | No | Con tramite-system (mismo objetivo, no se inyecta el largo). |
| chat.ts buildPromptTaskState | No | Con generateSystemPrompts (estado/faltantes/pasos duplicados en otro formato). |
| preaviso_config.prompt (DB) | No | Con PreavisoPrompts (reglas similares en código). |
| lib/ai/prompts/documents.ts | No (en preaviso) | Con handlers (cada uno tiene su propio prompt inline). |

---

## 5. Siguiente paso sugerido

1. **Decidir** si la arquitectura oficial es la de 4 prompts (chat.ts + DB) o la de PreavisoPrompts.
2. **Unificar:** una sola construcción del system para generateQuestion (sin duplicar reglas en user).
3. **Conectar o retirar:** o bien el chat usa PROMPT 2 de la DB y PROMPT 4 de chat.ts, o bien se documenta que no se usan y se deja de mantenerlos para el flujo actual.
4. **Documentos:** unificar prompts de extracción en `documents.ts` o en handlers, no en ambos.

Con eso se reduce el número de prompts activos, se evita que se pisen y se puede acortar y mantener una sola fuente de verdad por responsabilidad.
