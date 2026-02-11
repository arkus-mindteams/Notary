# Análisis: RAG, MCP, multiagentes y simplificación de la captura

**Objetivo:** Evaluar si conviene rehacer la lógica de captura del asistente de chat usando RAG, MCP y multiagentes, con prompts más cortos y decisión sobre el JSON canónico.

**Referencias:** Skills agent-orchestration-multi-agent-optimize, ai-agents-architect, agent-memory-mcp, agent-orchestration-improve-agent, ai-engineer.

---

## 1. Situación actual (resumen)

### 1.1 Flujo de captura

- **Una llamada LLM de interpretación** (`interpretWithLLM` en `tramite-system.ts`): el usuario escribe → el modelo recibe contexto + historial reciente + “tools permitidas” y debe emitir `<DATA_UPDATE>` con JSON v1.4.
- **Una llamada LLM de respuesta** (`generateQuestion` en `preaviso-plugin.ts`): usa `PreavisoPrompts.generateSystemPrompts` + `generateUserPrompt` para generar la siguiente pregunta/respuesta natural al usuario.
- **RAG ya existe** pero solo sobre **documentos del expediente**: `DocumentoService.searchSimilarChunks` (vector sobre `documento_text_chunks`) se usa en `PreavisoPrompts.generateSystemPrompts` para inyectar fragmentos de documentos subidos. No se usa para “conocimiento” (reglas legales, definiciones, flujo).
- **JSON canónico v1.4**: contrato estricto en PROMPT 4 (`lib/ai/prompts/chat.ts`). El modelo solo puede emitir `<DATA_UPDATE>` cuando se cumplen todas las condiciones; el código parsea, valida y hace merge con el contexto (con lógica defensiva para no vaciar arrays/objetos).

### 1.2 Dolor actual

- **Prompts muy largos**: PROMPT 3 (`buildPromptTaskState`) y los prompts en `PreavisoPrompts` son extensos y repetitivos (muchas reglas “NO preguntes…”, “PROHIBIDO…”).
- **Dos mundos de prompts**: existe la arquitectura de 4 prompts en `lib/ai/prompts/chat.ts` (PROMPT 1–4) pero el plugin de preaviso usa `PreavisoPrompts` (otro sistema), lo que duplica conceptos y dificulta mantener “prompts cortos y claros”.
- **Costo y ventana de contexto**: tanto la interpretación como la generación de pregunta envían mucho texto fijo; cualquier reducción sin perder calidad es deseable.

---

## 2. ¿Rehacer la lógica de captura? Sí, pero por fases

**Conclusión:** Sí tiene sentido **evolucionar** la lógica (no tirar todo). Las sugerencias que te dieron (RAG, MCP, multiagentes, prompts más cortos) encajan bien si se aplican en orden y con alcance acotado.

- **RAG:** ya lo usas para documentos; el siguiente paso natural es usarlo para **conocimiento** (reglas de negocio, definiciones legales) y así acortar PROMPT 2 y partes de los system prompts.
- **MCP:** útil para exponer herramientas (por ejemplo “reglas para el paso X”, “buscar en memoria de decisiones”) sin meter todo en el prompt; se puede introducir en una segunda fase.
- **Multiagentes:** solo si hay un problema concreto que un solo agente no resuelve bien (por ejemplo separar “extracción” vs “validación” vs “siguiente pregunta”). No es obligatorio desde el día uno.
- **Prompts más cortos:** es el objetivo más directo; RAG + buena estructura (y opcionalmente MCP) permiten acortar sin perder control.

---

## 3. RAG: dónde y para qué

### 3.1 RAG que ya tienes

- **Documentos del expediente:** `documento_text_chunks` + `match_document_chunks` + `DocumentoService.searchSimilarChunks`. Se usa en `PreavisoPrompts.generateSystemPrompts` para inyectar fragmentos relevantes. **Mantener y seguir usando.**

### 3.2 RAG de conocimiento (nuevo)

- **Objetivo:** No cargar en cada turno todo el bloque de “reglas de negocio” (hoy en PROMPT 2 desde DB y repetido en PreavisoPrompts). En su lugar:
  - Tener **chunks de conocimiento** (reglas por paso, definiciones legales, qué preguntar en cada estado, prohibiciones por paso).
  - En cada turno, según **estado actual** y **faltantes**, hacer una o dos búsquedas vectoriales (o keyword) y **inyectar solo los fragmentos relevantes** en el system prompt.
- **Efecto:** PROMPT 2 (y las secciones equivalentes en PreavisoPrompts) se pueden acortar a algo del estilo: “Sigue las reglas que se te inyectan en contexto. No inventes reglas que no aparezcan ahí.”
- **Implementación sugerida:**
  - Crear una tabla o contenido (por ejemplo `preaviso_knowledge_chunks`) con fragmentos etiquetados por estado/paso/tema (ej. `estado: vendedor`, `tema: persona_moral`, `tema: gravamen`).
  - Indexar con el mismo esquema de embeddings que usas (o full-text en español).
  - En `generateSystemPrompts` / donde construyas el system, además del RAG de documentos, llamar a “RAG de conocimiento” con query derivada de `state.id` + `missingNow` y concatenar solo 1–3 fragmentos cortos.
- **Skills (ai-engineer, rag-engineer):** producción RAG con retrieval en dos capas (documentos + conocimiento), chunking por “paso” o “tema”, sin duplicar todo el texto en el prompt.

---

## 4. MCP: dónde encaja

- **Idea:** Exponer **herramientas** que el agente pueda usar para “consultar” en lugar de llevar todo en el prompt.
- **Ejemplos útiles para tu caso:**
  - `get_rules_for_step(step_id)`: devuelve las reglas aplicables a un paso (vendedor, comprador, crédito, gravamen, etc.). El modelo recibe menos texto fijo y “pide” reglas cuando las necesita.
  - `search_preaviso_rules(query)`: búsqueda semántica o por keywords sobre reglas/definiciones (podría apoyarse en el mismo índice que el RAG de conocimiento).
  - Si más adelante quieres memoria persistente entre sesiones (por ejemplo “cómo decidimos tratar persona moral en este notario”), algo tipo `memory_search` / `memory_write` (agent-memory-mcp) puede vivir detrás de MCP.
- **Prioridad:** Después de tener RAG de conocimiento y prompts más cortos. MCP es una capa de “tools” sobre ese conocimiento; no sustituye el hecho de tener el conocimiento bien chunkado e indexado.
- **Skills (mcp-builder, ai-agents-architect):** herramientas bien descritas, esquema claro, manejo de errores; evitar “tool overload” (solo unas pocas herramientas muy claras).

---

## 5. Multiagentes: cuándo y cómo

- **Principio (ai-agents-architect):** “Using multiple agents when one would work” es un anti-patrón. Multiagente se justifica cuando:
  - Hay tareas claramente separables (por ejemplo: extraer datos vs validar vs generar pregunta).
  - Un solo agente ya no escala (latencia, tokens, o mezcla de responsabilidades que degrada la calidad).

### 5.1 Opción conservadora (recomendada al inicio)

- **Un solo agente** que hace interpretación + generación de respuesta, pero con:
  - Prompts más cortos (vía RAG de conocimiento).
  - Un solo contrato de salida estructurada (ver sección 6).
- Ventaja: menos puntos de fallo, más fácil de medir y comparar (baseline vs mejoras).

### 5.2 Opción multiagente (solo si lo necesitas)

Si más adelante quieres separar:

- **Agente A – Extracción:** solo recibe el mensaje del usuario + contexto mínimo; su única tarea es devolver “qué datos se mencionan/confirman” en un formato fijo (puede ser el mismo JSON canónico o un subconjunto).
- **Agente B – Orquestador / Pregunta:** recibe el contexto ya actualizado (por código, tras aplicar la extracción), más un “resumen de estado” y reglas inyectadas por RAG; su tarea es generar la siguiente pregunta o mensaje natural y no emitir datos estructurados.

Ventaja: responsabilidades claras. Desventaja: dos llamadas LLM por turno, más latencia y costo. Solo tiene sentido si en A/B el “agente único” se queda corto en extracción o en claridad de la pregunta.

- **Skills (agent-orchestration-multi-agent-optimize):** medir antes/después, repartir carga, control de coste; no desplegar sin pruebas de regresión.

---

## 6. JSON canónico: ¿seguir usándolo?

### 6.1 Rol actual del JSON canónico

- Define **qué** puede salir en `<DATA_UPDATE>` (campos, estructura, prohibiciones).
- El **código** hace merge con el contexto, preserva arrays/objetos y evita que el modelo “borre” datos con updates parciales.
- **PROMPT 4** es largo porque enumera reglas por campo (inmueble, vendedores, compradores, créditos, gravámenes, etc.).

### 6.2 ¿Es necesario?

- **Sí, en esencia:** necesitas **algún** contrato estructurado para que el frontend y el backend sepan qué se capturó y cómo se persiste. La alternativa sería “el modelo solo habla y otro sistema extrae con NER/LLM aparte”, lo que duplica complejidad y posibles inconsistencias.
- Lo que sí se puede **simplificar**:
  1. **Schema único y estable:** un solo JSON canónico (v1.4 o una v1.5 simplificada) como contrato. Evitar tener “schema en DB”, “schema en front” y “schema en prompt” distintos; un solo esquema de referencia.
  2. **Prompts más cortos:** no poner en PROMPT 4 toda la lista de reglas campo a campo. Mover “reglas por entidad” a RAG de conocimiento (o a MCP) y en PROMPT 4 dejar solo:
     - “Solo puedes emitir `<DATA_UPDATE>` cuando el usuario haya dado o confirmado información explícitamente.”
     - “El JSON debe ser válido y solo puede contener estos top-level keys: meta, inmueble, vendedores, compradores, creditos, gravamenes, control_impresion, validaciones.”
     - “Prohibido: objetos vacíos, arrays vacíos no confirmados, inferir relaciones no dichas, rellenar por defecto.”
     - Enlace o referencia a “schema v1.4” (o documento externo / herramienta MCP que devuelva el schema o las reglas por entidad).
  3. **Structured Output (OpenAI/Anthropic):** si tu proveedor lo soporta, puedes pedir al modelo que responda con un objeto JSON tipado en lugar de texto con `<DATA_UPDATE>`. Eso reduce errores de parseo y permite acortar aún más las instrucciones de “formato”.

### 6.3 Resumen JSON

- **Mantener** un JSON canónico como contrato único entre agente(s) y aplicación.
- **Reducir** la longitud de PROMPT 4 moviendo reglas detalladas a RAG (o MCP) y dejando en el prompt solo principios y lista de keys.
- **Opcional:** usar Structured Output si está disponible para eliminar el parsing de `<DATA_UPDATE>`.

---

## 7. Prompts más cortos: plan concreto

### 7.1 Unificar y acortar

- **Objetivo:** Un solo “system” conceptual para el flujo de preaviso (aunque se construya por partes), sin duplicar la arquitectura de 4 prompts en un archivo y otro sistema en PreavisoPrompts.
- **Pasos sugeridos:**
  1. **Definir un “system” mínimo** (equivalente a PROMPT 1):
     - Identidad: asistente notarial, guía al usuario, captura datos, no inventa.
     - Principios: una sola pregunta relevante cuando falte algo; no mencionar estados ni JSON al usuario; confirmar antes de dar por capturado.
  2. **PROMPT 2 (reglas de negocio):** sustituir el bloque largo por: “Las reglas aplicables a este paso se inyectan a continuación (RAG). Síguelas. No añadas reglas que no aparezcan.” + resultado del RAG de conocimiento para el paso actual.
  3. **PROMPT 3 (estado):** reducir a un “snapshot” corto:
     - Estado actual, allowed_actions, blocking_reasons, required_missing (lista breve).
     - “Datos capturados” como JSON compacto (o resumen de 1–2 líneas por entidad).
     - Orden de pasos en 1 lista numerada, sin repetir todas las reglas de cada paso (esas van en RAG).
  4. **PROMPT 4 (salida):** como arriba: condiciones para emitir `<DATA_UPDATE>`, lista de keys permitidos, prohibiciones genéricas, referencia a schema/reglas vía RAG o MCP.

### 7.2 Métricas (agent-orchestration-improve-agent)

- Medir **antes:** longitud media del system prompt (tokens), tasa de cumplimiento del contrato `<DATA_UPDATE>`, tasa de “no preguntes X cuando ya está capturado”.
- Medir **después** de cada cambio (RAG conocimiento, recorte de PROMPT 3/4): mismos indicadores + latencia y costo por turno.
- Hacer A/B si introduces multiagente; no desplegar sin baseline.

---

## 8. Orden de implementación sugerido

| Fase | Acción | Resultado esperado |
|------|--------|--------------------|
| **1** | RAG de conocimiento: chunks por paso/tema, índice (vector o full-text), inyección en system según estado/faltantes | Prompts 2 y PreavisoPrompts más cortos; mismo comportamiento |
| **2** | Acortar PROMPT 3 a “snapshot” + lista de pasos; mover detalle de reglas a RAG | Menos tokens por turno, mismo flujo |
| **3** | Acortar PROMPT 4 a principios + keys + prohibiciones; reglas por campo en RAG (o doc) | Menos tokens, mismo contrato de datos |
| **4** | Unificar: que el flujo de preaviso use una sola “construcción” de system (p. ej. la de `chat.ts` o una derivada) en lugar de PreavisoPrompts largos | Un solo lugar donde mantener prompts |
| **5** | (Opcional) MCP: herramienta `get_rules_for_step` o `search_preaviso_rules` que consuma el mismo conocimiento que el RAG | Flexibilidad para futuros agentes o UIs |
| **6** | (Solo si hay necesidad medida) Evaluar multiagente (extracción vs pregunta) con métricas y A/B | Mejora de calidad o costo, justificada por datos |

---

## 9. Respuesta directa a tus preguntas

- **¿Es buena opción rehacer la lógica de captura?**  
  Sí, como **evolución por fases**: RAG de conocimiento + prompts más cortos primero; luego MCP si aporta; multiagente solo si un agente único se queda corto.

- **RAG:**  
  Ya lo usas para documentos; añade RAG de **conocimiento** (reglas, definiciones por paso) para acortar prompts sin perder control.

- **MCP:**  
  Útil para exponer “reglas para paso X” o “buscar en conocimiento” como herramientas; recomendable después de tener el conocimiento bien indexado (RAG).

- **Multiagentes:**  
  No es obligatorio al inicio. Úsalo solo si tras medir ves que separar “extracción” y “pregunta” mejora calidad o coste.

- **Prompts más cortos:**  
  Sí, y es el objetivo más directo: RAG de conocimiento + PROMPT 3/4 reducidos a snapshot + principios; el detalle va en chunks recuperados o en MCP.

- **JSON canónico:**  
  Sí es necesario como contrato único; lo que puedes hacer es **simplificar** su presentación en el prompt (principios + keys + referencia a schema/reglas) y mover las reglas detalladas a RAG o MCP.

Si quieres, el siguiente paso puede ser (flujo chat): (1) diseño de la tabla/contenido de `preaviso_knowledge_chunks` y queries de RAG por paso, o (2) borrador de los “prompts cortos” (PROMPT 1–4) con placeholders para RAG.
