# Plan Short Term — Chatbot Preaviso a Producción (1–2 días)

**Objetivo:** Tener el chatbot de preaviso funcional, responsivo y capaz de completar el preaviso en **máximo 1–2 días**, sin esperar al refactor multi-agente completo.

**Scope (según necesidad):**
1. Chatbot: retención de contexto y lógica de confirmación
2. Extracción fiable de datos de documentos subidos
3. Procesamiento multi-documento y batch
4. Protección de datos estructurados e interpretados por el sistema
5. Acceso persistente a datos extraídos de documentos previos
6. Contexto de todo el chat para detectar información que el usuario escribe a mano (historial ampliado en interpretación)

**Referencias:** `docs/PLAN_REFACTOR_AGENTE_MULTIAGENTE_RAG.md`, `docs/FLUJO_ACTUAL_CHAT.md`, código actual en `lib/tramites/`, `app/api/ai/preaviso-*`.

---

## 1. Estado actual (resumen)

| Área | Estado | Gap para producción |
|------|--------|----------------------|
| **Chat** | TramiteSystem.process → interpretWithLLM + generateQuestion. Contexto se envía/recibe en cada request. | Contexto ya se retiene en frontend; confirmación explícita opcional. |
| **Extracción** | PreavisoDocumentProcessor + Vision por tipo (inscripción, identificación, acta…). extractedData guardado en `documentos.metadata.extracted_data`. | Estable; solo asegurar que no se pierdan datos en merge. |
| **RAG documentos** | `DocumentoService.searchSimilarChunks` usado en PreavisoPrompts. Tabla `documento_text_chunks` existe. | **Sí se vectoriza en un flujo, pero no en el de preaviso chat:** `DocumentoService.processAndSaveText` solo se llama desde `/api/expedientes/documentos/upload` cuando el cliente envía `ocrText` y `tramiteId`. El flujo de chat usa `/api/ai/preaviso-process-document`, que **no** llama a `processAndSaveText`, por lo que los documentos extraídos por Vision en el chat no se indexan en `documento_text_chunks`. |
| **Protección datos** | Merge defensivo en TramiteSystem (preserveIfEmptyArray, créditos, inmueble). | Mantener; no tocar. |
| **Multi-documento / batch** | Frontend sube varios archivos y envía resumen al chat. | Funcional; validar flujo batch de principio a fin. |
| **Persistencia extraídos** | Se guarda en `documentos` y se pasa `documentosProcesados` en context. | Asegurar que el chat “vea” siempre los documentos de la sesión (tramiteId/conversationId). |

**Dónde se vectoriza hoy:** La única ruta que escribe en `documento_text_chunks` es **`/api/expedientes/documentos/upload`** (líneas 153–166): si el request trae `ocrText` y `tramiteId`, llama a `DocumentoService.processAndSaveText(documento.id, tramiteId, ocrText)`. En el chat de preaviso el flujo de **extracción** usa **`/api/ai/preaviso-process-document`**, que guarda en `documentos` y en `chat_session_documents` pero **no** llama a `processAndSaveText`. Además, cuando el frontend llama a expedientes/upload desde el batch de preaviso, no envía `ocrText` en el FormData, así que en la práctica los documentos del chat de preaviso no se vectorizan.

Conclusión: el **cuello de botella** para que el chat “complete el preaviso” con documentos es que **en el flujo de preaviso-process-document no se indexa** lo extraído en `documento_text_chunks`, por lo que RAG suele devolver vacío para esas conversaciones.

---

## 1.1 ¿Evitamos bucles infinitos y se generan correctamente los preavisos?

**Bucles infinitos**

- **Causa principal hoy:** El agente no “ve” lo que ya se extrajo de los documentos (RAG vacío) y sigue pidiendo lo mismo. El usuario repite o no sabe qué decir → misma pregunta una y otra vez.
- **Qué ya existe:** En `TramiteSystem` hay un **loop guard**: si el usuario lleva 3 respuestas seguidas en el mismo estado (`reask_counts[stateId] >= 3`), se fuerza un mensaje guiado concreto vía `getLoopGuardMessage` (ej.: “Para avanzar necesito datos del inmueble: folio real, partida(s) y dirección…”). Eso **rompe el bucle** dando una salida clara.
- **Qué aporta el plan short term:**
  - **ST-1 (indexar en RAG):** El agente pasa a “ver” el contenido de los documentos en `generateQuestion`. Deja de pedir datos que ya están en los docs y el estado puede avanzar → **menos repeticiones y menos disparos del loop guard**.
  - **ST-3 (contexto bien aplicado):** El frontend no pierde datos; el backend y el estado local coinciden. Evita que el agente crea que falta algo cuando ya se capturó.
- **Conclusión:** Con el plan se **reduce mucho** el riesgo de bucles (menos causas) y, si aun así el usuario se queda atascado, el **loop guard ya existente** sigue cortando el bucle a los 3 intentos.

**Generación correcta de preavisos**

- Para que se pueda **generar** el preaviso, el flujo debe llegar a **ESTADO_8** (“listo para generar”). Entonces la UI llama `onDataComplete(data)` y se habilita la generación con `onGenerateDocument(data, uploadedDocuments, activeTramiteId)`.
- Eso solo ocurre si:
  1. Los datos requeridos están completos (vendedores, compradores, inmueble, créditos, etc.).
  2. El contexto no se pierde (merge defensivo + frontend aplicando la respuesta).
  3. El agente “ve” lo extraído de documentos (RAG) para no seguir pidiendo algo que ya está en un PDF.
- **Qué aporta el plan:** ST-1 + ST-3 + ST-4 aseguran que (1) el agente use los documentos (RAG), (2) el contexto se mantenga y (3) no se vacíen datos por merge. Con eso se puede llegar a ESTADO_8 y **generar correctamente el preaviso** con los datos capturados.

**Resumen:** Sí: con este plan se **reduce fuertemente** la probabilidad de bucles (RAG + contexto) y se **permite** que el flujo llegue a ESTADO_8 y se generen bien los preavisos. El loop guard actual sigue siendo la red de seguridad si el usuario se atasca.

---

## 1.2 ¿El mismo approach sirve para cuando el usuario escribe a mano?

No del mismo modo. Son **dos canales** distintos:

| Origen del dato | Cómo lo “ve” el agente hoy | Qué aporta el plan (ST-1) |
|-----------------|----------------------------|----------------------------|
| **Documentos subidos** | Se extrae con Vision → se guarda en `documentos` y se mergea al contexto. Para que el LLM use ese contenido al generar la siguiente pregunta se usa **RAG** sobre `documento_text_chunks`. Hoy ese índice no se llena en el flujo de preaviso, por eso ST-1 (indexar tras procesar). | **Sí:** con ST-1 el agente “ve” lo que salió de los PDFs vía RAG y no repite preguntas sobre eso. |
| **Texto que el usuario escribe en el chat** | Lo interpreta **interpretWithLLM**: recibe el mensaje actual del usuario + **últimos 3 mensajes** del historial + contexto. Extrae datos y emite `<DATA_UPDATE>`. Lo que se extrae se mergea al contexto. No se usa RAG de documentos para esto. | **No directo:** el RAG de documentos es sobre contenido de **archivos**, no sobre el historial de chat. La detección de lo que el usuario escribe a mano sigue siendo tarea de **interpretWithLLM** + historial que se le pasa. |

Por tanto: **indexar documentos (ST-1) no hace que el agente “detecte” mejor lo que el usuario escribe a mano**. Eso ya se hace con el mensaje actual y el historial en `interpretWithLLM`. Si se quiere mejorar la detección de **información manual**:

- **Opción A (implementada):** Ampliar la ventana de historial que recibe `interpretWithLLM` para que el agente tenga contexto de **todo el chat**. Implementado con **20 mensajes** (≈10 intercambios) en API y en interpretWithLLM — ver **ST-4b**.
- **Opción B (más trabajo):** Mantener un resumen corto “datos que el usuario ya mencionó en este chat” (a partir del contexto actual) e inyectarlo en el prompt de interpretación para que el modelo no pida de nuevo algo que ya se capturó por escrito.

En resumen: el approach de vectorizar documentos **sí** sirve para que el agente use bien la información de los **documentos**. Para la información que el usuario **ingresa manualmente** en el chat, se mejoró la ventana de historial a 20 mensajes (ST-4b).

---

## 2. Plan Short Term (orden de ejecución)

### Día 1 — RAG funcional y contexto estable

#### ST-1 — Indexar documentos en RAG tras procesar (crítico)

**Problema:** Al procesar un documento se guarda en `documentos.metadata.extracted_data` pero no se escribe nada en `documento_text_chunks`, por lo que `searchSimilarChunks` no devuelve resultados.

**Acción:**

1. En `app/api/ai/preaviso-process-document/route.ts`, **después** de insertar en `documentos` y en `chat_session_documents`:
   - Construir un texto indexable a partir de `result.extractedData` (p. ej. resumen legible: “Propietario: X. Folios: … Dirección: …” o `JSON.stringify` si se prefiere).
   - Si existe `context.tramiteId` (UUID del trámite):
     - Llamar `DocumentoService.processAndSaveText(documento.id, context.tramiteId, textToIndex, 1)`.
   - Si no hay `tramiteId`, no indexar (log opcional) o definir política (p. ej. tramite por defecto desde env).

2. Crear helper en `lib/services/documento-service.ts` o en la route:
   - `buildTextFromExtractedData(extractedData: any): string` que convierta el objeto extraído en un único string (para no duplicar lógica en varios sitios).

**Criterio de aceptación:** Tras subir un documento de preaviso, exista al menos un registro en `documento_text_chunks` para ese documento y ese tramite_id; las preguntas del usuario que toquen esos datos mejoren la respuesta gracias a RAG.

**Nota:** `documento_text_chunks.tramite_id` es FK a `tramites(id)`. El frontend ya envía `activeTramiteId` (UUID) en context; asegurar que en el flujo de chat siempre se cree o se tenga un tramite y se pase su id.

---

#### ST-2 — Asegurar tramiteId en el flujo de documentos

**Problema:** Si `context.tramiteId` no llega, no podemos indexar (y RAG por trámite no funciona).

**Acción:**

1. En el frontend (`PreavisoChat`): garantizar que antes de subir documentos exista un `activeTramiteId` (crear trámite al abrir/crear conversación si hace falta).
2. En `preaviso-process-document`: si llega `tramiteId` en context, usarlo para RAG; si no, log y no indexar (o usar tramite por defecto si se define).

**Criterio de aceptación:** En una conversación normal de preaviso, cada documento subido tenga `tramiteId` en context y se indexe.

---

#### ST-3 — Contexto: devolver y usar siempre el contexto actualizado

**Problema:** Evitar que el frontend pierda datos si en algún path no se actualiza el estado con la respuesta del backend.

**Acción:**

1. Revisar en `preaviso-chat/route.ts` que la respuesta incluya siempre el contexto completo actualizado (ya se hace con `result.data`).
2. Revisar en `PreavisoChat` que tras cada respuesta exitosa se haga `setData(result.data)` (o equivalente) con el contexto devuelto, sin sobrescribir con estado local antiguo.

**Criterio de aceptación:** Tras cada mensaje, el estado local del chat refleja exactamente el contexto que devolvió el backend (vendedores, compradores, inmueble, créditos, documentos procesados, etc.).

---

#### ST-4 — Protección de datos estructurados (no regresión)

**Problema:** El merge defensivo en `TramiteSystem.process` (preserveIfEmptyArray, créditos, inmueble) ya protege los datos. Hay que evitar regresiones.

**Acción:**

1. No modificar la lógica de merge en `tramite-system.ts` en este short term.
2. Si se toca esa zona, ejecutar una prueba manual: completar comprador, crédito, inmueble, subir documento, enviar mensajes; comprobar que no se vacíen arrays ni se pierdan crédito/inmueble.

**Criterio de aceptación:** Sin regresiones en datos ya capturados.

---

#### ST-4b — Historial completo del chat para interpretación (información manual) — **IMPLEMENTADO**

**Objetivo:** Que el agente tenga contexto de **todo el chat** y detecte correctamente lo que el usuario escribió a mano hace varios mensajes (no solo los últimos 3).

**Acción (ya aplicada):**

1. **API preaviso-chat** (`app/api/ai/preaviso-chat/route.ts`): enviar los últimos **20 mensajes** al backend en lugar de 10: `messages.slice(-20)`.
2. **interpretWithLLM** (`lib/tramites/base/tramite-system.ts`): usar los últimos **20 mensajes** del historial en el prompt de interpretación: `history.slice(-20)` en lugar de `history.slice(-3)`.

**Recomendación:** 20 mensajes es un buen equilibrio (contexto de todo el chat típico de un preaviso sin disparar tokens). Si se necesitan conversaciones más largas, se puede subir a 24–30 en ambos sitios; por encima de 40, vigilar uso de tokens.

**Criterio de aceptación:** El agente considera hasta ~10 intercambios previos al interpretar el mensaje del usuario, reduciendo “olvidos” de datos escritos a mano.

---

### Día 2 — Confirmación, batch y persistencia

#### ST-5a — (Opcional) Reforzar loop guard con sugerencia de subir documento

Cuando se dispare el loop guard (3 repeticiones en el mismo estado), los mensajes en `getLoopGuardMessage` ya son concretos. Se puede añadir en cada mensaje una línea tipo: *"Si tienes un documento donde aparezca este dato (inscripción, identificación, etc.), súbelo y lo leo por ti."* para dar una salida clara al usuario. No es obligatorio para el día 2.

---

#### ST-5 — Confirmación de datos extraídos (opcional pero recomendable)

**Problema:** El usuario no ve de forma clara “qué se leyó” del documento antes de que se merge al contexto.

**Acción (mínima):**

1. Mostrar en la UI, tras procesar un documento, un resumen corto de lo extraído (por ejemplo: “Se leyó: Propietario X, Folios 123, 124”) usando `extractedData` que ya devuelve la API.
2. No bloquear el flujo: el usuario puede seguir hablando o corregir; no es obligatorio un “Confirmar” explícito para el día 2 si priorizamos tiempo.

**Criterio de aceptación:** El usuario ve qué se extrajo del documento después de subirlo.

---

#### ST-6 — Batch de documentos de principio a fin

**Problema:** Validar que subir varios documentos (inscripción + identificación + acta, etc.) en una misma sesión funcione y que el contexto acumule todo.

**Acción:**

1. Prueba E2E manual: nueva conversación, subir 2–3 documentos (p. ej. inscripción, identificación, acta), luego enviar mensaje.
2. Comprobar: cada documento en `documentos` con `extracted_data`; cada uno con chunk en `documento_text_chunks` si hay tramiteId; contexto con vendedores/compradores/inmueble/documentosProcesados coherentes; siguiente pregunta del chat alineada con lo faltante.

**Criterio de aceptación:** Flujo batch completo sin errores y con RAG y contexto correctos.

---

#### ST-7 — Acceso persistente a documentos ya extraídos

**Problema:** Que el chat pueda “recordar” documentos de la sesión y no pedir de nuevo lo que ya se subió.

**Acción:**

1. El backend ya recibe `documentosProcesados` y `documentos` en context; el plugin y los prompts ya usan esto para no repetir preguntas. Verificar que en generateQuestion / PreavisoPrompts se consideren bien.
2. Asegurar que al cargar una conversación existente (si aplica) se recuperen los documentos de la sesión y se reinyecten en context (p. ej. desde `chat_session_documents` + `documentos.metadata.extracted_data`).

**Criterio de aceptación:** En una conversación con documentos ya subidos, el asistente no pide de nuevo datos que ya están en documentos procesados y usa esa información en sus respuestas.

---

## 3. Qué NO hacer en este short term (evitar scope creep)

- **No** implementar ExtractionAgent genérico ni Vision-Only refactor (Fase 2 del plan grande).
- **No** implementar EmbeddingAgent ni RetrievalResponseAgent (Fases 3–4).
- **No** tocar PROMPT 1/2/3/4 más allá de correcciones mínimas si algo falla.
- **No** eliminar OCRProcessor/ai-processor ni cambiar flujo de extracción; dejar PreavisoDocumentProcessor como está.
- **No** añadir `raw_content` a la extracción todavía; basta con indexar un texto derivado de `extractedData` para RAG.

---

## 4. Checklist de salida a producción (1–2 días)

- [x] **ST-1** Indexar documento en `documento_text_chunks` tras procesar (con texto desde extractedData). ✅ **IMPLEMENTADO**: Helper `DocumentExtractionTextBuilder` creado e integrado en `preaviso-process-document`. Falta validar en producción.
- [ ] **ST-2** tramiteId siempre disponible en context al subir documentos (crear tramite si hace falta).
- [ ] **ST-3** Contexto actualizado siempre devuelto y aplicado en el frontend.
- [ ] **ST-4** Sin regresiones en merge defensivo (compradores, vendedores, créditos, inmueble).
- [x] **ST-4b** Historial de 20 mensajes en API y en interpretWithLLM para contexto de todo el chat (información manual).
- [ ] **ST-5** (Opcional) Mostrar resumen de lo extraído tras subir documento.
- [ ] **ST-6** Prueba batch: varios documentos en una sesión, RAG y contexto correctos.
- [ ] **ST-7** Acceso persistente a documentos de la sesión (documentosProcesados + carga de conversación si aplica).
- [ ] Prueba E2E: flujo completo de preaviso (chat + documentos) hasta “listo para generar” o equivalente.
- [ ] UI responsiva y estable (sin cambios grandes; solo lo necesario para ST-5 si se hace).

**Validación:** Ver guía paso a paso en **`docs/VALIDACION_PLAN_SHORT_TERM.md`** (ST-1 con SQL, ST-2 a E2E).

---

## 5. Siguiente paso inmediato

**Implementar ST-1** en `app/api/ai/preaviso-process-document/route.ts`:

1. Añadir helper para construir `textToIndex` desde `result.extractedData`.
2. Tras insertar en `documentos` y tener `documento.id` y `context.tramiteId` (UUID), llamar `DocumentoService.processAndSaveText(documento.id, context.tramiteId, textToIndex, 1)`.
3. Manejar el caso sin tramiteId (no indexar, log) para no romper flujos existentes.

Con eso, RAG tendrá contenido y el chatbot podrá apoyarse en los documentos subidos para completar el preaviso. Luego seguir con ST-2 y ST-3 en el mismo día si el tiempo lo permite.
