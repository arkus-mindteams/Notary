# Recomendaciones para mejorar y reducir los prompts (ai-engineer)

Basado en la auditoría de prompts y en las prácticas del skill **ai-engineer** (prompt engineering, templates con variables, optimización de tokens, producción).

---

## 1. Principios aplicados (ai-engineer)

- **Prompt templates con inyección dinámica:** Solo inyectar lo que cambia por turno (estado, faltantes, RAG, último mensaje). El resto en bloques fijos y cortos.
- **Context compression:** No repetir las mismas reglas en system y user. El modelo tiene contexto; una instrucción del tipo "no preguntes por datos que ya estén en el contexto" sustituye decenas de líneas de "si vendedor ya está, no preguntes...".
- **Single source of truth:** Reglas de comportamiento en un solo lugar (system). User = datos + tarea, sin reglas.
- **Cost and latency:** Menos tokens por turno = menor costo y menor latencia. Objetivo: reducir ~40–50% en system+user del flujo generateQuestion.
- **Versioning / A/B:** Mantener versiones cortas identificables (ej. v2.0) para poder hacer A/B y rollback.

---

## 2. System prompt reducido (generateSystemPrompts)

### Idea

- **Identidad** en 2–3 líneas.
- **Fuente de verdad:** diagnóstico + faltantes (ya lo tienes; mantener).
- **Una sola regla de “no repetir”:** en lugar de listar “no preguntes vendedor si ya está”, “no preguntes cónyuge si ya está”, etc., una instrucción que remita al contexto.
- **Bloque PROHIBIDO** compacto (lista corta, sin ejemplos largos en el prompt).
- **Post-documento:** una frase que resuma “usa lo extraído y sigue al siguiente paso; no preguntes si ya lo revisamos”.
- **RAG:** mantener; ya es dinámico.
- **Formato:** texto plano, no negritas; una línea.

### Propuesta de texto (reemplazo del system actual)

```text
Eres un asistente notarial profesional y cercano para captura de datos de preaviso (${pluginName}). Guías al usuario, capturas solo lo que falte y sugieres subir documentos cuando ayude.

FUENTE DE VERDAD (respeta esto):
- Diagnóstico: ${systemDiagnostic}
- Faltantes a resolver: ${JSON.stringify(missingNow)}
Si el sistema marca algo como faltante, debes pedirlo. Si no está en faltantes y ya está en el contexto, no lo preguntes.

REGLA ÚNICA DE NO REPETIR: Revisa el contexto (vendedores, compradores, créditos, inmueble, etc.). Para cualquier dato que YA esté presente en el contexto, NO vuelvas a preguntar. Solo pide lo que figure en Faltantes.

PERSONALIDAD: Cálido, profesional, texto plano (sin **). Saluda si te saludan. Responde preguntas del usuario con la info del contexto antes de pedir el siguiente dato. Sugiere subir documento si aplica; si el usuario prefiere dictar, acepta.

PROHIBIDO (resumen): Preguntar si es cesión/permuta/dación; anexos/estacionamientos; si el crédito está aprobado; quién firma; tipo de crédito detallado; "¿otro vendedor?" si ya hay uno; preguntar "¿ya lo revisamos?" o "¿corresponde al comprador?" después de procesar un documento. Persona moral: solo denominación social, sin firmantes/representantes. Después de procesar un documento: usa los datos extraídos y continúa al siguiente paso; no pidas confirmación de "¿es correcto?".

ORDEN DEL FLUJO: Inmueble/folio → Vendedor → Forma de pago → Comprador(es) → Estado civil → Cónyuge (si casado) → Crédito(s) → Gravamen → Generación. No des saltos atrás innecesarios.

${ragContext}

Genera UNA respuesta en español, natural y breve.
```

- **Variables a inyectar:** `pluginName`, `systemDiagnostic`, `missingNow`, `ragContext` (el RAG que ya construyes).
- **Eliminado:** Toda la repetición de “si vendedor ya fue detectado…”, “si cónyuge ya está…”, “RFC y CURP opcionales”, “valor no obligatorio”, etc. La regla única (“no preguntes lo que ya está en contexto”) + la lista de faltantes cubren el comportamiento.
- **Opcional:** Si quieres ser aún más corto, el bloque PROHIBIDO puede vivir en RAG y sustituirse por: “Sigue las prohibiciones inyectadas a continuación: [RAG o 3–4 líneas mínimas].”

---

## 3. User prompt reducido (generateUserPrompt)

### Idea

- **Solo datos y tarea.** Cero repetición de reglas que ya están en el system.
- Mantener: contexto (JSON), último mensaje, historial reciente, y condicional de folios múltiples.
- Eliminar: “INFORMACIÓN YA DETECTADA”, “VERIFICACIÓN CRÍTICA DEL CÓNYUGE”, “REGLAS CRÍTICAS”, “PROHIBIDO”, “VERIFICACIÓN OBLIGATORIA”, “TIPOS DE DOCUMENTOS”, “REGLA CRÍTICA DESPUÉS DE PROCESAR”, “EJEMPLOS DE LO QUE NO/SÍ DEBES HACER”, “ORDEN DEL FLUJO”. Todo eso pertenece al system.

### Propuesta de texto

```text
CONTEXTO ACTUAL (JSON):
${JSON.stringify(context, null, 2)}

${userInstruction}

HISTORIAL (últimos 10 mensajes):
${conversationHistory.slice(-10).map((m: any) => `${m.role}: ${m.content}`).join('\n')}
${hasMultipleFolios ? `\nFolios detectados: pide al usuario que elija uno. Lista: ${folioCandidates.map((f: any) => typeof f === 'string' ? f : f.folio).join(', ')}` : ''}

Responde en una sola réplica natural en español.
```

- **userInstruction** sigue siendo condicional: si es saludo, el texto de “saluda y pide el dato faltante”; si no, “Último mensaje del usuario: …”.
- Con esto el user prompt pasa de ~2–3k tokens a ~0.5–1.5k (dependiendo del tamaño del `context`), y deja de pisar al system.

---

## 4. Prompt de interpretación (tramite-system.ts — interpretWithLLM)

### Estado actual

- Un solo bloque con contexto, tools, historial, input y “sé flexible” + “Emite <DATA_UPDATE>…”. Está bien de tamaño pero el modelo **no** recibe el contrato estricto (keys permitidos, prohibiciones de vacíos/inferencia).

### Recomendación (ai-engineer: structured outputs, safety)

- Mantener el prompt corto.
- Añadir **3–4 líneas fijas** de contrato para reducir errores de formato y contenido:
  - Top-level keys permitidos: meta, inmueble, vendedores, compradores, creditos, gravamenes, control_impresion, validaciones.
  - Prohibido: objetos vacíos, arrays vacíos no confirmados, inferir relaciones no dichas.
  - Solo emitir `<DATA_UPDATE>` si el usuario dio o confirmó información explícitamente.

Texto sugerido para añadir justo antes de “Emite <DATA_UPDATE>…”:

```text
CONTRATO DE SALIDA: Solo emite <DATA_UPDATE> si el usuario dio o confirmó información. Keys permitidos: meta, inmueble, vendedores, compradores, creditos, gravamenes, control_impresion, validaciones. Prohibido: objetos/arrays vacíos, inferir relaciones no dichas.
```

Así mejoras la calidad del JSON sin duplicar todo el PROMPT_TECHNICAL_OUTPUT de chat.ts.

---

## 5. Bloque de reglas “por paso” (opcional, para RAG o inyección condicional)

Si en el futuro quieres **inyectar solo las reglas del paso actual** (en lugar de un bloque PROHIBIDO fijo), puedes tener fragmentos cortos por paso, por ejemplo:

- **inmueble:** “Pide folio/partida/dirección. Acepta dictado o hoja de inscripción.”
- **vendedor:** “Un solo vendedor por defecto. Persona moral: solo denominación social.”
- **comprador/cónyuge:** “Si el cónyuge ya está en contexto, no preguntes nombre. Solo rol si falta.”
- **creditos:** “Institución + participantes. No preguntes tipo de crédito ni quién firma.”
- **gravamen:** “Pregunta una vez si hay gravamen a cancelar.”

Eso se puede recuperar por `state.id` o `missingNow` (RAG o mapa en código) e inyectar como 1–2 líneas en el system. Así el system base se mantiene corto y las reglas detalladas son condicionales.

---

## 6. Resumen de ahorro estimado (tokens)

| Componente | Antes (aprox.) | Después (aprox.) | Nota |
|------------|----------------|------------------|------|
| generateSystemPrompts | ~3–4k tokens | ~1–1.5k | Una regla “no repetir” + PROHIBIDO compacto + orden en 1 línea. |
| generateUserPrompt | ~2–3k tokens | ~0.5–1.5k | Solo contexto + historial + instrucción; sin reglas duplicadas. |
| interpretWithLLM | ~1k | ~1.1k | +3 líneas de contrato; resto igual. |

Por turno de chat (generateQuestion + interpret si aplica) se puede estar en **~40–50% menos tokens** en los prompts de conversación, con el mismo comportamiento si la “regla única” y el diagnóstico se respetan.

---

## 7. Versionado y validación (ai-engineer: prompt versioning, A/B)

- Añadir un comentario o constante de versión en el código, por ejemplo `PREAVISO_SYSTEM_PROMPT_V = '2.0'`, y opcionalmente incluirla en logs o en metadata de la llamada al LLM.
- Antes de sustituir en producción: guardar el system/user actual en un archivo o en la DB como “v1” y el nuevo como “v2”; lanzar unos 20–30 turnos de prueba (saludo, dar dato, subir documento, preguntar “en qué quedamos”) y comparar que no se pierdan capturas ni se repitan preguntas indebidas.
- Métricas útiles: longitud media del system prompt en tokens, tasa de “pregunta por dato ya presente” (revisión manual o heurística), latencia por turno.

---

## 8. Orden de implementación sugerido

1. **User prompt:** Aplicar la versión reducida de `generateUserPrompt` (quitar todas las reglas duplicadas). Validar en desarrollo que las respuestas sigan siendo correctas.
2. **System prompt:** Sustituir el system por la versión corta (identidad + fuente de verdad + regla única + PROHIBIDO compacto + orden + RAG). Validar igual.
3. **interpretWithLLM:** Añadir las 3–4 líneas de contrato de salida. Revisar que los `<DATA_UPDATE>` sigan siendo válidos y sin vacíos.
4. **(Opcional)** Introducir RAG o mapa de “reglas por paso” e inyectar solo el fragmento del paso actual para acortar aún más el system.

Si quieres, el siguiente paso puede ser aplicar estos cambios en `preaviso-prompts.ts` y en `tramite-system.ts` (parches concretos por función).
