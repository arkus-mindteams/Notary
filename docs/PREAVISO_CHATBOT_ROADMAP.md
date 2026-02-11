# Roadmap: Chatbot de Pre-Aviso - Arquitectura y Plan de Corrección de Bugs

## 1. Arquitectura Actual del Sistema

### 1.1 Flujo General

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│  PreavisoChat   │────▶│  POST /api/ai/preaviso-  │────▶│  TramiteSystem       │
│  (Frontend)     │     │  chat                    │     │  .process()          │
└────────┬────────┘     └──────────────────────────┘     └──────────┬──────────┘
         │                                                          │
         │  context: data, documentosProcesados,                     │
         │  messages, tramiteId                                      │
         │                                                          ▼
         │                                               ┌─────────────────────┐
         │                                               │  1. InputParser     │
         │                                               │     (determinista)  │
         │                                               └──────────┬──────────┘
         │                                                          │
         │                                               ┌──────────▼──────────┐
         │                                               │  2. interpretWithLLM│
         │                                               │     (si no capturó) │
         │                                               └──────────┬──────────┘
         │                                                          │
         │                                               ┌──────────▼──────────┐
         │                                               │  3. CommandRouter   │
         │                                               │     ejecuta cmds    │
         │                                               └──────────┬──────────┘
         │                                                          │
         │                                               ┌──────────▼──────────┐
         │                                               │  4. FlexibleState   │
         │                                               │     Machine         │
         │                                               └──────────┬──────────┘
         │                                                          │
         ◀──────────────────── result.data, state, message ─────────┘
```

### 1.2 Componentes Clave

| Componente | Ubicación | Responsabilidad |
|------------|-----------|-----------------|
| **PreavisoChat** | `components/preaviso-chat.tsx` | UI, upload docs, manejo de `data` y `setData`, llamadas a API |
| **Preaviso API Chat** | `app/api/ai/preaviso-chat/route.ts` | Recibe mensaje, invoca TramiteSystem, retorna data + state |
| **Preaviso API Process** | `app/api/ai/preaviso-process-document/route.ts` | Procesa documento, extrae datos, ejecuta comandos |
| **TramiteSystem** | `lib/tramites/base/tramite-system.ts` | Orquesta InputParser → LLM → CommandRouter, merge de context |
| **InputParser** | `lib/tramites/shared/input-parser.ts` | Reglas deterministas (estado civil, folio, crédito, gravamen, etc.) |
| **PreavisoDocumentProcessor** | `lib/tramites/plugins/preaviso/document-processor.ts` | Extrae datos de docs con Vision API, cache por hash |
| **Handlers de documentos** | `document-processor/handlers/` | inscripcion, identificacion, acta_matrimonio |
| **CommandRouter** | `lib/tramites/base/command-router.ts` | Mapea comandos a handlers que actualizan el contexto |
| **PreavisoPrompts** | `lib/tramites/plugins/preaviso/preaviso-prompts.ts` | Prompts del asistente, RAG, instrucciones |

### 1.3 Flujo de Documentos

```
Usuario sube archivo
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│ PreavisoChat: upload → /api/expedientes/documentos/upload (S3)     │
│ Luego, según tipo: /api/ai/preaviso-process-document               │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│ PreavisoDocumentProcessor.processDocument(file, documentType, ctx) │
│   1. Cache por hash (DocumentoService.findExtractionData)          │
│   2. Si no hay cache: extractWithOpenAI (Vision API)               │
│   3. Segundo pase para inscripción: ensureAllFoliosOnPage          │
│   4. Cache resultado (DocumentoService.saveExtractionData)         │
│   5. Handler.process(extracted) → Commands                         │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│ TramiteSystem.processDocument → CommandRouter.route(cmd, ctx)      │
│ Handlers: folio_selection, titular_registral, encumbrance, etc.   │
└───────────────────────────────────────────────────────────────────┘
```

### 1.4 Persistencia de Datos Extraídos

- **Cache global por hash**: `DocumentoService.findExtractionData(fileHash)` / `saveExtractionData`
- **documentosProcesados**: array en el contexto enviado al chat; cada doc tiene `nombre`, `tipo`, `informacionExtraida`
- **RAG**: `DocumentoService.searchSimilarChunks()` en PreavisoPrompts para campos faltantes
- **Chat sessions**: `chat_sessions`, `chat_messages` en Supabase (last_context, mensajes)

---

## 2. Bugs Identificados y Su Relación con la Arquitectura

### Bug 1: Extracción incompleta de hojas de inscripción

**Causa probable:**
- `InscripcionHandler` + Vision API a veces no detecta partida registral o folio real en todas las variantes de documento
- El segundo pase `ensureAllFoliosOnPage` solo cubre folios; no hay segundo pase para partidas
- Variabilidad del LLM según layout, calidad de imagen, idioma

**Archivos afectados:**
- `lib/tramites/plugins/preaviso/document-processor/handlers/inscripcion-handler.ts`
- `lib/tramites/plugins/preaviso/document-processor.ts` (extractWithOpenAI, ensureAllFoliosOnPage)

---

### Bug 2: Peticiones redundantes de confirmación / bucles conversacionales

**Causa probable:**
- `PreavisoPrompts`: "Si el sistema dice que falta algo en FALTANTES CRÍTICOS, DEBES pedirlo"
- El sistema puede marcar como faltante un dato que el usuario acaba de dar si el merge de contexto no se aplica a tiempo
- `computePreavisoState` o validación marca el paso como incomplete aunque el dato ya esté
- No hay bandera explícita de "ya confirmado por usuario" para evitar re-preguntar

**Archivos afectados:**
- `lib/tramites/plugins/preaviso/preaviso-prompts.ts`
- `lib/preaviso-state.ts` (computePreavisoState)
- `lib/tramites/base/tramite-system.ts` (merge de updatedContext)
- `lib/tramites/base/flexible-state-machine.ts`

---

### Bug 3: Sobrescritura de datos estructurados con confirmaciones literales

**Causa probable:**
- En `interpretWithLLM`, el LLM emite `<DATA_UPDATE>` y el sistema usa `updatedContext: extracted` directo
- Si el usuario dice "confirmo", el LLM puede emitir algo como `{ vendedor: { nombre: "confirmo" } }`
- No hay filtro para rechazar valores que son frases de confirmación ("confirmo", "sí", "correcto", etc.)
- El frontend hace `setData` con `result.data` sin validar que los valores sean datos reales

**Archivos afectados:**
- `lib/tramites/base/tramite-system.ts` (interpretWithLLM, extractDataFromLLMResponse)
- `lib/tramites/shared/input-parser.ts` (reglas de confirmación)
- `components/preaviso-chat.tsx` (setData con result.data)

---

### Bug 4: No extrae datos de documentos explícitamente referenciados

**Causa probable:**
- No hay tool/comando para "tomar campo X del documento Y"
- El RAG busca chunks similares pero no hay flujo para "el usuario pide: toma el folio del documento de inscripción que subí"
- `documentosProcesados` se envía en contexto, pero el LLM no tiene instrucciones claras para usarlos como fuente
- Falta un paso de "resolver referencia a documento" antes de emitir DATA_UPDATE

**Archivos afectados:**
- `lib/tramites/plugins/preaviso/preaviso-prompts.ts`
- `lib/tramites/plugins/preaviso/preaviso-tools.ts` (no hay tool para "referencia a documento")
- `lib/tramites/base/tramite-system.ts` (interpretWithLLM)

---

### Bug 5: Falta de reconocimiento automático y procesamiento por lotes

**Causa probable:**
- El usuario debe elegir tipo de documento manualmente (inscripcion, identificacion, acta_matrimonio)
- No hay clasificación automática del tipo de documento
- No hay flujo "subir varios archivos → clasificar todos → extraer todos"

**Archivos afectados:**
- `components/preaviso-chat.tsx` (flujo de upload, documentType seleccionado por usuario)
- `lib/tramites/plugins/preaviso/document-processor/handlers/registry.ts` (tipos fijos)
- `app/api/ai/preaviso-process-document/route.ts` (recibe documentType explícito)

---

### Bug 6: Sin soporte para múltiples documentos simultáneos

**Causa probable:**
- El upload procesa un archivo a la vez
- No hay endpoint ni flujo para "procesar N archivos en paralelo y clasificar cada uno"
- `processDocument` es por archivo único

**Archivos afectados:**
- `components/preaviso-chat.tsx` (bucle secuencial de procesamiento)
- `app/api/ai/preaviso-process-document/route.ts` (un solo file)
- `lib/tramites/base/tramite-system.ts` (processDocument un archivo)

---

### Bug 7: Sin soporte para PDFs multi-documento

**Causa probable:**
- Un PDF con varias "páginas tipo documento" (inscripción + IDs + acta) se trata como un solo documento
- No hay división de páginas por tipo ni procesamiento independiente por sección
- El frontend convierte PDF a imágenes por página, pero el backend recibe el archivo completo o páginas individuales sin clasificación

**Archivos afectados:**
- `components/preaviso-chat.tsx` (conversión PDF → imágenes, envío por página)
- `lib/tramites/plugins/preaviso/document-processor.ts` (procesa una imagen/archivo)
- Falta: servicio de clasificación de páginas (¿inscripción? ¿ID? ¿acta?)

---

### Bug 8: Datos de documentos subidos no persistentes/consultables

**Causa probable:**
- `documentosProcesados` vive en memoria/estado del chat; no hay modelo de "documentos con datos extraídos" persistente por sesión
- DocumentoService guarda extracciones por hash, pero la asociación documento ↔ sesión/trámite puede no estar bien ligada
- RAG usa `documento_text_chunks`; no está claro si cada documento subido alimenta ese índice

**Archivos afectados:**
- `lib/services/documento-service.ts`
- `components/preaviso-chat.tsx` (uploadedDocuments, documentosProcesados)
- Esquema Supabase: `documentos`, `documento_text_chunks`, `document_extractions` (si existe)

---

### Bug 9: Modificación incontrolada de datos interpretados

**Causa probable:**
- El merge de `llmResult.updatedContext` en tramite-system puede sobrescribir campos con valores incorrectos
- Aunque hay protecciones (preserveIfEmptyArray, merge de inmueble, creditos), no todas las rutas están cubiertas
- El LLM puede emitir DATA_UPDATE con campos que el usuario no pidió modificar

**Archivos afectados:**
- `lib/tramites/base/tramite-system.ts` (merge de delta, preserveIfEmptyArray, etc.)
- Instrucciones al LLM en interpretWithLLM y PreavisoPrompts

---

### Bug 10: Peticiones repetidas de datos ya proporcionados

**Causa probable:**
- `computePreavisoState` o `getMissingStates` no refleja bien datos recién capturados
- El merge de contexto se hace después de calcular faltantes en algunos caminos
- Reglas en PreavisoPrompts ("NO preguntes si ya está") no se cumplen si el estado dice que falta
- Desincronización entre estado del servidor y lo que el usuario ve en la tabla

**Archivos afectados:**
- `lib/preaviso-state.ts`
- `lib/tramites/base/flexible-state-machine.ts`
- `lib/tramites/plugins/preaviso/preaviso-prompts.ts`
- `lib/tramites/base/tramite-system.ts` (orden: interpret → commands → merge → state)

---

## 3. Plan de Corrección por Prioridad

### Fase 1: Bugs críticos de UX inmediata (1–2 sprints)

| # | Bug | Acción |
|---|-----|--------|
| 3 | Sobrescritura con "confirmo" | Añadir filtro en tramite-system: si valor es frase de confirmación ("confirmo", "sí", "correcto", etc.), no aplicarlo a campos estructurados; usar LAST_QUESTION_INTENT para aplicar el dato correcto |
| 2 | Bucles de confirmación | Revisar orden de merge y cálculo de missing; añadir flags "user_confirmed" en datos; endurecer prompts para no pedir de nuevo lo ya confirmado |
| 10 | Peticiones repetidas | Sincronizar computePreavisoState con contexto ya mergeado; añadir logging para detectar "falta X pero context tiene X" |

### Fase 2: Extracción y documentos (2–3 sprints)

| # | Bug | Acción |
|---|-----|--------|
| 1 | Extracción incompleta | Segundo pase para partidas (similar a ensureAllFoliosOnPage); prompts más explícitos; opción de re-procesar con prompt ajustado |
| 4 | Referencias a documentos | Nueva tool "get_field_from_document"; instrucciones en prompts para resolver "toma X del documento Y" usando documentosProcesados |
| 8 | Persistencia de datos extraídos | Persistir documentosProcesados por sesión/trámite; exponer API para consultar datos por documento; integrar con RAG |

### Fase 3: Multi-documento y batch (2–3 sprints)

| # | Bug | Acción |
|---|-----|--------|
| 5 | Reconocimiento automático | Clasificador de tipo de documento (Vision/LLM) antes de extracción; flujo "subir varios → clasificar → extraer" |
| 6 | Múltiples documentos simultáneos | Endpoint batch; procesamiento paralelo; merge ordenado de comandos |
| 7 | PDFs multi-documento | Dividir PDF por páginas; clasificar cada página; procesar cada sección con el handler correspondiente |

### Fase 4: Control y robustez (1 sprint)

| # | Bug | Acción |
|---|-----|--------|
| 9 | Modificación incontrolada | Política clara: "solo modificar si el usuario lo pide"; whitelist de campos modificables por confirmación; auditoría de cambios |

---

## 4. Diagrama de Flujo Ideal (Post-Corrección)

```
Usuario: "confirmo"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ InputParser: detecta confirmación → NO emite DATA_UPDATE con     │
│   valor literal "confirmo". Usa lastAssistantMessage para        │
│   inferir qué dato confirmar → emite comando correcto.           │
└─────────────────────────────────────────────────────────────────┘

Usuario: "toma el folio del documento de inscripción"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ LLM + tool get_field_from_document → busca en documentosProcesados│
│   documento tipo inscripcion → extrae folio → DATA_UPDATE        │
└─────────────────────────────────────────────────────────────────┘

Usuario sube 5 archivos
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Clasificar cada archivo (inscripcion, id, acta, etc.)         │
│ 2. Procesar en paralelo con handler correspondiente              │
│ 3. Merge de comandos evitando conflictos                         │
│ 4. Actualizar documentosProcesados persistidos                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Archivos a Modificar por Bug

| Bug | Archivos principales |
|-----|----------------------|
| 1 | inscripcion-handler.ts, document-processor.ts |
| 2 | preaviso-prompts.ts, preaviso-state.ts, tramite-system.ts |
| 3 | tramite-system.ts (interpretWithLLM), input-parser.ts, preaviso-chat.tsx |
| 4 | preaviso-prompts.ts, preaviso-tools.ts, tramite-system.ts |
| 5 | preaviso-chat.tsx, document-processor, nuevo classificador |
| 6 | preaviso-chat.tsx, preaviso-process-document (batch) |
| 7 | preaviso-chat.tsx, document-processor (split + classify pages) |
| 8 | documento-service.ts, schema Supabase, preaviso-chat.tsx |
| 9 | tramite-system.ts (merge policy) |
| 10 | preaviso-state.ts, flexible-state-machine.ts, preaviso-prompts.ts |

---

## 6. Métricas de Éxito

- Reducción de bucles de confirmación (menos de 1 repetición por dato)
- Cero casos de "confirmo" en tabla de resumen
- Tasa de extracción completa de inscripciones > 90%
- Soporte de referencias a documentos funcionando en pruebas E2E
- Procesamiento batch y multi-PDF implementado y estable
