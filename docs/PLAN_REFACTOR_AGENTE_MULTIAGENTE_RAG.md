# Plan de Refactor: Agente Multi-Agente + RAG Robusto

**Versión:** 1.1  
**Objetivo:** Integrar la arquitectura POC de 3 agentes (extracción, embeddings, retrieval/respuesta) para hacer el chat más robusto, rápido y con menor consumo de tokens, preservando stats, costos, logging e interfaz.

**Referencias:** `docs/ARCHITECTURA_PROMPTS.md` (4 prompts), `docs/ANALISIS_RAG_MCP_MULTIAGENTE_CAPTURA.md`, skills: ai-engineer, ai-product, agent-orchestration-multi-agent-optimize, ai-agents-architect, architect-review.

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Decisiones Estratégicas](#2-decisiones-estratégicas)
3. [Procesador Genérico + Schema por Plugin](#3-procesador-genérico--schema-por-plugin)
4. [Arquitectura Objetivo](#4-arquitectura-objetivo)
5. [Metadata vs Chunks (Persistencia)](#5-metadata-vs-chunks-persistencia)
6. [Flujo de Llenado de Metadata](#6-flujo-de-llenado-de-metadata)
7. [Fases del Plan (Detalladas)](#7-fases-del-plan-detalladas)
8. [Consideraciones de No Regresión](#8-consideraciones-de-no-regresión)
9. [Riesgos y Mitigaciones](#9-riesgos-y-mitigaciones)
10. [Orden de Implementación](#10-orden-de-implementación)
11. [Checklist Pre-Merge](#11-checklist-pre-merge)
12. [Referencias](#12-referencias)
13. [Prompts por Agente y Ubicación](#13-prompts-por-agente-y-ubicación-guía-de-implementación)
14. [Resumen: Dónde Estamos, Qué Tenemos y Por Qué Cambiar](#14-resumen-dónde-estamos-qué-tenemos-y-por-qué-cambiar)

---

## 1. Resumen Ejecutivo

| Aspecto | Estado actual | Objetivo |
|---------|---------------|----------|
| **Arquitectura** | Monolito: `interpretWithLLM` + `generateQuestion` en cada turno | 3 agentes separados: Extracción → Embedding → Retrieval/Respuesta |
| **Extracción documentos** | PreavisoDocumentProcessor con handlers específicos por tipo; OCRProcessor (mock) en ai-processor | **Procesador genérico** que recibe schema del plugin; solo Vision API |
| **Datos extraídos** | Campos estructurados por tipo de documento (preaviso-específico) | **raw_content + structured** según schema del plugin; extensible para futuros trámites |
| **Prompts** | ~3–4k tokens system + ~2–3k user | Prompts mínimos funcionales (~40–50% reducción) |
| **JSON canónico** | v1.4 único, muy detallado | Schemas por trámite, simplificados, con reglas en RAG |
| **RAG** | Solo documentos del expediente | Documentos + conocimiento (reglas por paso) |
| **Stats/Costos/Logging** | ActivityLogService, activity_logs | **Preservar sin cambios** |
| **UI** | preaviso-chat.tsx | **Igual o cambios mínimos** |

---

## 2. Decisiones Estratégicas

### 2.1 Vision-Only, Sin OCR

- **Vision API** como única fuente de lectura de documentos (sin OCR tradicional ni simuladores).
- Eliminar `lib/ai-processor.ts` (OCRProcessor, AIProcessor, DocumentClassifier, FieldExtractor).
- **ExtractionAgent** (procesador genérico) llama Vision API con el schema que proporciona el plugin vía `getExtractionSchema(documentType)`. No hay lógica de extracción en PreavisoDocumentProcessor ni en otros plugins; solo en el ExtractionAgent.
- Migrar consumidores de `ExtractedFields` a `VisionExtractionResult` y schemas derivados de Vision.

**Razón:** Vision ya extrae texto y contexto; añadir OCR duplica coste y complejidad. El **ExtractionAgent** usa Vision; los plugins solo definen qué extraer (schema) y cómo mapearlo (mapToContext).

### 2.2 Información Completa (raw_content)

- Siempre guardar **raw_content** (texto completo visible) además de campos estructurados.
- No sabemos qué información será necesaria para el contexto o para futuros tipos de documento.

#### Persistencia

| Tabla | Columna / uso | Contenido |
|-------|---------------|-----------|
| **documentos** | `metadata.extracted_data` | `raw_content` + `structured` (resultado del ExtractionAgent) |
| **documento_text_chunks** | `text` + `embedding` | Chunks de raw_content con embeddings para RAG |

**Flujo:** ExtractionAgent devuelve `raw_content` → se guarda en `documentos.metadata.extracted_data` → EmbeddingAgent chunkea `raw_content` → genera embeddings → inserta en `documento_text_chunks`.

#### Embeddings

- **Modelo:** `text-embedding-3-small` (OpenAI). Configurable vía `EmbeddingsService` si se requiere otro modelo en el futuro.
- **Dimensiones:** 1536 (columna `embedding vector(1536)` en `documento_text_chunks`).
- **Índice:** HNSW para búsqueda por similitud coseno (`vector_cosine_ops`).
- **Agente responsable:** EmbeddingAgent, que usa `EmbeddingsService` para generar vectores y persiste en `documento_text_chunks`.

#### Condición para RAG

Para que el chat responda preguntas sobre datos no extraídos en el schema, `raw_content` debe chunkearse, convertirse en embeddings e indexarse en `documento_text_chunks`. Sin este paso, solo se puede responder a partir de metadata estructurada.

**Razón:** Hoy preaviso; mañana escrituras, actas, etc. Evitar pérdida de datos por esquemas rígidos.

### 2.3 Procesador Genérico + Schema por Plugin

Un solo **ExtractionAgent** para todos los trámites. El plugin define qué extraer y cómo mapearlo al contexto.

#### getExtractionSchema(documentType)

| Aspecto | Explicación |
|---------|-------------|
| **Parámetro documentType** | Cada tipo de documento (inscripción, identificación, acta_matrimonio, escritura, etc.) requiere campos distintos. El ExtractionAgent no conoce el dominio; el plugin sí. Por eso recibe `documentType` para devolver el schema adecuado. |
| **Qué devuelve** | Un `ExtractionSchema` con `raw_content: true` y `structured: { ... }` indicando qué campos extraer (folios, partidas, nombre, RFC, conyuges, etc.). El schema se convierte en prompt para Vision API. |
| **Razón** | Sin el schema, el ExtractionAgent no sabría qué pedirle a Vision. El plugin es dueño del dominio: sabe que para inscripción necesita folios y propietario; para identificación, nombre y CURP; para acta, conyuges. |

#### mapToContext(result, context, documentType)

| Aspecto | Explicación |
|---------|-------------|
| **Parámetro result** | Es el `VisionExtractionResult` (raw_content + structured) que devolvió el ExtractionAgent. Contiene los datos extraídos según el schema. |
| **Parámetro context** | Es el contexto actual del trámite (vendedores, compradores, inmueble, créditos, etc.). Hay que mergear los datos extraídos en este contexto sin sobrescribir datos válidos (merge defensivo). |
| **Parámetro documentType** | El mapeo depende del tipo: inscripción → inmueble + vendedores; identificación → comprador, vendedor o cónyuge según `_document_intent`; acta → cónyuge del comprador. |
| **Qué devuelve** | El contexto actualizado (nuevo objeto, no mutar el original). |
| **Razón** | El ExtractionAgent no conoce la estructura del contexto preaviso. Solo el plugin sabe que "propietario" de inscripción se mapea a vendedor, o que una identificación puede ir a comprador o cónyuge según la última pregunta del asistente. |

#### getCanonicalSchema()

| Aspecto | Explicación |
|---------|-------------|
| **Sin parámetros** | El schema de salida es fijo por trámite (preaviso tiene su estructura, testamento otra). No depende del tipo de documento ni del contexto; define qué keys puede emitir el LLM en `<DATA_UPDATE>`. |
| **Qué devuelve** | Un `Schema` (Zod o JSON) con los keys permitidos y estructura del JSON canónico (compradores, vendedores, inmueble, créditos, gravamenes, etc.). El PROMPT 4 y RetrievalResponseAgent usan este schema para instruir al LLM y validar la salida. |
| **Razón** | Cada trámite tiene su propio JSON canónico. Preaviso v1.5 tiene keys distintos a testamento. El plugin es dueño del dominio: define qué estructura emite el chat para su trámite. `getSchemaForTramite(tramiteId)` delega en `plugin.getCanonicalSchema()`. |

#### Nuevo trámite

Nuevo trámite = nuevo plugin con `getExtractionSchema`, `mapToContext` y `getCanonicalSchema`. No se toca el ExtractionAgent ni el TramiteSystem.

**Razón:** Evitar duplicación de lógica de extracción; extensibilidad sin modificar código común.

---

## 3. Procesador Genérico + Schema por Plugin

### 3.0 Plugins: Definición y Estructura

#### ¿Qué es un plugin?

Un **plugin** es el módulo que encapsula todo el dominio de un trámite (preaviso, escritura, testamento, etc.). Implementa la interfaz `TramitePlugin` y es registrado en el `TramiteSystem`. El sistema no conoce detalles de negocio; delega en el plugin: estados, reglas, validación, generación de preguntas, interpretación de input, procesamiento de documentos, herramientas permitidas y mapeo de datos extraídos.

#### Responsabilidades de un plugin

| Responsabilidad | Descripción | Método / artefacto |
|-----------------|-------------|--------------------|
| Identificación | id, name, description | `id`, `name`, `description` |
| Estados | Estados del trámite y completitud | `getStates`, `determineCurrentState` |
| Captura | Reglas deterministas (ej. respuestas cortas) | `getCaptureRules` |
| Validación | Validar contexto antes de generar documento | `validate` |
| Preguntas | Generar siguiente pregunta al usuario | `generateQuestion` |
| Interpretación | Interpretar input del usuario (LLM o determinista) | `interpretInput` |
| Documentos | Procesar documentos subidos | `processDocument` → usa ExtractionAgent + schema |
| **Extracción (nuevo)** | Schema de extracción por tipo de documento | `getExtractionSchema` |
| **Mapeo (nuevo)** | Mapear resultado Vision → contexto del trámite | `mapToContext` |
| Conversión | JSON extraído por LLM → comandos | `convertDataToCommands` |
| Herramientas | Tools permitidas por estado | `allowedToolsForState`, `getToolRegistry` |
| JSON final | Preparar datos para generación de documento | `toFinalJSON` |
| **JSON canónico (nuevo)** | Schema de salida DATA_UPDATE (keys permitidos, estructura) | `getCanonicalSchema` |

#### Estructura de directorios de un plugin

```
lib/tramites/plugins/
└── preaviso/                           # Un plugin = un directorio
    ├── preaviso-plugin.ts              # Implementación de TramitePlugin (punto de entrada)
    ├── preaviso-state-definitions.ts   # Estados del trámite
    ├── preaviso-prompts.ts             # Prompts para LLM (preguntas, interpretación)
    ├── preaviso-transitions.ts         # Info de transición entre estados
    ├── preaviso-tools.ts               # Registro de tools, allowedToolsForState
    ├── document-processor.ts           # Orquestador: llama ExtractionAgent + schema
    ├── document-processor/
    │   └── handlers/                   # Handlers por tipo (inscripcion, identificacion, acta...)
    │       ├── inscripcion-handler.ts
    │       ├── identificacion-handler.ts
    │       └── acta-matrimonio-handler.ts
    └── handlers/                       # Handlers de comandos (folio, vendedor, crédito...)
        ├── folio-selection-handler.ts
        ├── titular-registral-handler.ts
        └── ...
```

#### Ejemplo: estructura mínima de un plugin nuevo

Para añadir un nuevo trámite (ej. **testamento**), se crea un directorio `lib/tramites/plugins/testamento/` con:

```
lib/tramites/plugins/testamento/
├── testamento-plugin.ts        # Implementa TramitePlugin
├── testamento-state-definitions.ts
├── testamento-prompts.ts
├── testamento-tools.ts
└── document-processor.ts       # Opcional; usa ExtractionAgent + getExtractionSchema
```

**Contrato mínimo** en `testamento-plugin.ts`:

```typescript
export class TestamentoPlugin implements TramitePlugin {
  id = 'testamento'
  name = 'Testamento'
  description = 'Trámite de testamento'

  // Obligatorios
  getStates(context: any) { ... }
  determineCurrentState(context: any) { ... }
  getCaptureRules() { return [] }
  validate(context: any) { ... }
  toFinalJSON(context: any) { ... }
  generateQuestion(...) { ... }
  interpretInput(...) { ... }
  getLoopGuardMessage(...) { ... }
  inferLastQuestionIntent(...) { ... }
  inferDocumentIntent(...) { ... }
  convertDataToCommands(...) { ... }
  allowedToolsForState(...) { ... }
  getToolRegistry() { ... }
  getTransitionInfo(...) { ... }
  hasField(...) { ... }

  // Opcionales para extracción de documentos
  getExtractionSchema?(documentType: string): ExtractionSchema { ... }
  mapToContext?(result: VisionExtractionResult, context: any, documentType: string): any { ... }
  processDocument?(file: File, documentType: string, context: any) { ... }

  // JSON canónico: schema de salida DATA_UPDATE (emisión del LLM)
  getCanonicalSchema?(): Schema { ... }
}
```

**Registro:** en `tramite-system-instance.ts`:

```typescript
tramiteSystem.registerPlugin(new PreavisoPlugin())
tramiteSystem.registerPlugin(new TestamentoPlugin())  // Nuevo trámite
```

#### Resumen

- **Plugin** = módulo de dominio de un trámite, que implementa `TramitePlugin`.
- **Estructura** = un directorio bajo `lib/tramites/plugins/<tramite>/` con plugin, estados, prompts, tools, document-processor.
- **Schemas por trámite:** El plugin define tanto el schema de extracción (`getExtractionSchema`) como el schema del JSON canónico (`getCanonicalSchema`). El sistema delega: `getSchemaForTramite(tramiteId)` → `plugin.getCanonicalSchema()`.
- **Nuevo trámite** = crear directorio, implementar interfaz, registrar. No se modifica el `TramiteSystem` ni el `ExtractionAgent`.

---

### 3.1 ¿Qué es y por qué?

El **procesador genérico** es un solo componente (`ExtractionAgent`) que procesa **todos** los documentos de **todos** los trámites. No sabe nada de preaviso, escrituras o actas. Solo hace tres cosas:

1. Recibe el archivo + un **schema de extracción** que le pasa el plugin del trámite.
2. Llama a Vision API con ese schema (el prompt se genera a partir del schema).
3. Devuelve `raw_content` (texto completo del documento) + campos estructurados (los que pidió el schema).

**¿Quién define qué extraer?** El **plugin** de cada trámite. Cada plugin implementa:
- **getExtractionSchema(documentType):** devuelve qué campos quiere para cada tipo de documento (inscripción, identificación, acta, etc.).
- **mapToContext(result, context, documentType):** cómo mapear el resultado de Vision al contexto del trámite (vendedores, compradores, inmueble, etc.).

**Ventaja:** Para un nuevo trámite (escritura, acta, etc.) solo creas un nuevo plugin con su schema y su `mapToContext`. No tocas el ExtractionAgent ni el flujo común.

### 3.2 ¿Qué pasa si el usuario pregunta algo que NO está en el schema?

**Pregunta frecuente:** Si el schema de inscripción solo pide folios, partidas y propietario, ¿qué pasa si el usuario pregunta "¿cuál es el número de escritura?" o "¿en qué fecha se inscribió?" (datos que no pedimos en el schema)?

**Respuesta:** Esos datos **sí están guardados**, pero en `raw_content`, no en metadata estructurada. Y `raw_content` se usa para **RAG**.

**Flujo cuando el usuario pregunta algo no extraído en el schema:**

1. **RetrievalResponseAgent** recibe la pregunta del usuario.
2. Hace **búsqueda RAG** en `documento_text_chunks` usando la pregunta.
3. Los chunks vienen de **raw_content** (texto completo que Vision leyó), no solo de los campos estructurados.
4. RAG recupera los chunks relevantes (ej. el que contiene "número de escritura: 15,432").
5. Esos chunks se inyectan en el prompt del LLM.
6. El LLM responde usando ese contexto.

**Conclusión:** La respuesta viene de **RAG**, no de metadata estructurada. Por eso es crítico:
- Guardar **raw_content** siempre.
- Chunkear raw_content e indexarlo en `documento_text_chunks` para RAG.

| Caso | ¿De dónde sale la respuesta? |
|------|------------------------------|
| Usuario pregunta algo que SÍ está en el schema (folio, nombre, etc.) | Metadata estructurada (merge al contexto) o RAG, según el flujo |
| Usuario pregunta algo que NO está en el schema (número de escritura, fecha, etc.) | **RAG** (chunks derivados de raw_content) |

El schema define qué se usa para **merge programático** (llenar vendedores, compradores, etc.). El **raw_content + chunks** permiten responder **cualquier pregunta** sobre el documento.

### 3.3 Flujo de Datos

```
API Route
    → TramiteSystem.processDocument(pluginId, file, documentType, context)
        → Plugin.getExtractionSchema(documentType)
        → ExtractionAgent.extract(file, schema)
            → Vision API (prompt generado desde schema)
        → Plugin.mapToContext(result, context, documentType)
        → TramiteSystem ejecuta comandos y merge
    → API guarda en documentos.metadata
```

### 3.4 Interfaces y Ubicaciones

**ExtractionSchema** (nuevo archivo: `lib/agents/types/extraction-schema.ts`):

```typescript
interface ExtractionSchema {
  raw_content: boolean  // siempre true
  structured?: {
    [fieldKey: string]: FieldSpec
  }
}

type FieldSpec =
  | { type: 'string'; description?: string }
  | { type: 'number'; description?: string }
  | { type: 'array'; itemFields?: Record<string, string>; description?: string }
  | { type: 'object'; fields: Record<string, FieldSpec>; description?: string }
```

**VisionExtractionResult** (nuevo: `schemas/vision-extraction-result.ts`):

```typescript
interface VisionExtractionResult {
  raw_content: string
  structured?: Record<string, any>  // según schema
  document_type?: string
}
```

**Contrato TramitePlugin** (extender en `lib/tramites/base/tramite-plugin.ts`):

```typescript
// Métodos opcionales que el plugin puede implementar:
getExtractionSchema?(documentType: string): ExtractionSchema
mapToContext?(result: VisionExtractionResult, context: any, documentType: string): any
```

### 3.5 Ejemplo: Schema de Preaviso

```typescript
// PreavisoPlugin.getExtractionSchema
getExtractionSchema(documentType: string): ExtractionSchema {
  const schemas: Record<string, ExtractionSchema> = {
    inscripcion: {
      raw_content: true,
      structured: {
        folios: { type: 'array', itemFields: { numero: 'string' }, description: 'Folios reales' },
        partidas: { type: 'array', description: 'Partidas' },
        propietario: { type: 'object', fields: { nombre: 'string' }, description: 'Titular' },
        direccion: { type: 'object', fields: { calle: 'string', numero: 'string', colonia: 'string', municipio: 'string', estado: 'string', codigo_postal: 'string' } },
      }
    },
    identificacion: {
      raw_content: true,
      structured: {
        nombre: { type: 'string' },
        rfc: { type: 'string' },
        curp: { type: 'string' },
        estado_civil: { type: 'string' },
      }
    },
    acta_matrimonio: {
      raw_content: true,
      structured: {
        conyuges: { type: 'array', itemFields: { nombre: 'string' } },
      }
    }
  }
  return schemas[documentType] ?? { raw_content: true }
}
```

### 3.6 Ejemplo: mapToContext de Preaviso

```typescript
// PreavisoPlugin.mapToContext
mapToContext(result: VisionExtractionResult, context: any, documentType: string): any {
  if (documentType === 'inscripcion') {
    return {
      ...context,
      inmueble: { ...context.inmueble, folio_real: result.structured?.folios?.[0], partidas: result.structured?.partidas },
      vendedores: [/* mapear propietario a vendedor */]
    }
  }
  if (documentType === 'identificacion') {
    // Lógica para asignar a comprador, vendedor o cónyuge según _document_intent
  }
  return context
}
```

### 3.7 Ventajas del Modelo

| Aspecto | Beneficio |
|---------|-----------|
| Un solo procesador | Un solo lugar de extracción, sin duplicar lógica Vision |
| Extensibilidad | Nuevo trámite = nuevo plugin con schema + mapToContext |
| raw_content siempre | Nunca se pierde información |
| Plugin dueño del dominio | Cada trámite controla qué extraer y cómo usarlo |

### 3.8 Consideraciones

- El schema debe ser fácil de convertir en prompt para Vision (descripciones claras).
- Estructuras anidadas: el schema debe soportar `object` con `fields` recursivos.
- Si el plugin no implementa `getExtractionSchema`, usar schema por defecto: solo `raw_content`.
- **Condición para RAG:** Para que el chat pueda responder preguntas sobre datos no incluidos en el schema, `raw_content` debe chunkearse e indexarse en `documento_text_chunks`. Sin esto, solo se puede responder a partir de metadata estructurada.

---

## 4. Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENTE 1: EXTRACCIÓN (ExtractionAgent) — Vision API + Schema por Plugin      │
│ - Recibe file + schema del plugin                                            │
│ - Vision extrae raw_content + structured según schema                        │
│ - Salida: VisionExtractionResult                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENTE 2: EMBEDDING (EmbeddingAgent)                                         │
│ - Chunkear raw_content + structured (opcional)                               │
│ - Generar embeddings, almacenar en documento_text_chunks                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENTE 3: RETRIEVAL & RESPUESTA (RetrievalResponseAgent)                     │
│ - RAG documentos + RAG conocimiento                                          │
│ - Responde al usuario, emite DATA_UPDATE con JSON canónico                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Metadata vs Chunks (Persistencia)

### 5.1 ¿Por qué ambos?

Tenemos dos almacenes porque sirven a **casos de uso distintos**:

| Almacén | Qué guarda | Caso de uso |
|---------|------------|-------------|
| **documentos.metadata.extracted_data** | `raw_content` (texto completo) + `structured` (folios, partidas, nombre, etc.) | Merge al contexto del trámite, UI "qué se extrajo", validación, display del documento completo |
| **documento_text_chunks** | Fragmentos de texto + embeddings (vectores) | Búsqueda semántica: recuperar los trozos más relevantes para la pregunta del usuario e inyectarlos en el prompt del LLM |

- **metadata** = datos para uso programático (código lee `vendedores`, `folio_real`, etc.) y texto completo para mostrar o auditar.
- **chunks** = datos para RAG: no se usa el documento entero, sino los fragmentos más similares a la consulta. Inyectar un PDF de 10 páginas consumiría demasiados tokens; se inyectan solo los chunks relevantes.

### 5.2 ¿Por qué raw_content en metadata Y en chunks?

Parece redundante, pero cada uno cumple una función que el otro no puede:

| Ubicación | Función | Qué no puede hacer el otro |
|-----------|---------|----------------------------|
| **metadata.raw_content** | Texto completo. Una query lo recupera. Fuente para generar chunks. Display, auditoría, debug. | Los chunks son cortes; concatenarlos no reconstruye el original. Para "muéstrame el documento completo" se usa metadata. |
| **documento_text_chunks** | Fragmentos + embeddings para búsqueda semántica. RAG devuelve top-k chunks similares a la pregunta. | metadata no tiene embeddings; no sirve para búsqueda semántica. RAG necesita vectores. |

**Flujo:** `raw_content` en metadata → EmbeddingAgent chunkea → chunks + embeddings → `documento_text_chunks`. Metadata es la fuente; chunks son la versión optimizada para RAG.

**En código:** `metadata.extracted_data.vendedores` para merge; `metadata.extracted_data.raw_content` para display. DocumentoService.searchSimilarChunks para RAG.

### 5.3 RAG de Conocimiento: tabla knowledge_chunks

Una **sola tabla genérica** `knowledge_chunks` para reglas de negocio de **todos** los trámites. No hay tabla por trámite (preaviso_knowledge_chunks, testamento_knowledge_chunks, etc.).

#### Qué contiene

Chunks de texto con reglas que se inyectan en PROMPT 2. Cada fila puede ser:

| Tipo de chunk | state_id | topic | Ejemplo |
|---------------|----------|-------|---------|
| **Regla por estado** | ESTADO_4 | comprador | "En comprador: RFC y CURP opcionales. No los pidas." |
| **Regla por estado + topic** | ESTADO_4 | documentos | "No preguntes por más documentos si ya capturaste comprador." |
| **Regla por topic (varios estados)** | null | documentos | "Si ya procesaste inscripción, no vuelvas a pedir hoja de inscripción." |
| **Regla global** | null | null | "Nunca inventes datos. Solo usa lo que el usuario dice o los documentos." |
| **Múltiples chunks por estado** | ESTADO_4 | comprador | Chunk 1: RFC/CURP. Chunk 2: estado civil. Chunk 3: cónyuge. |

#### Columnas

| Columna | Uso |
|---------|-----|
| tramite_type | `preaviso`, `testamento`, etc. Filtro obligatorio en la búsqueda. |
| state_id | Estado al que aplica (ESTADO_4, ESTADO_2) o null si es global. |
| topic | comprador, vendedor, documentos, crédito, gravamen, inmueble — ayuda a filtrar. |
| text | El texto de la regla que se inyecta en el prompt. |
| embedding | Vector para búsqueda semántica (opcional; también se puede filtrar solo por state_id + topic). |

#### Recuperación

En cada turno, RetrievalResponseAgent llama:

```typescript
KnowledgeRAGService.searchKnowledge(query, tramiteType, stateId?, topic?, limit)
// Filtra: tramite_type = 'preaviso', state_id = 'ESTADO_4' (o null para globales)
// Devuelve 1–3 chunks relevantes
```

**Nuevo trámite:** Solo insertar filas con `tramite_type = 'testamento'`. No crear tablas nuevas.

---

## 6. Flujo de Llenado de Metadata

| Paso | Componente | Acción |
|------|------------|--------|
| 1 | TramiteSystem | Obtiene schema del plugin (`getExtractionSchema(documentType)`), invoca ExtractionAgent con schema, recibe VisionExtractionResult. |
| 2 | ExtractionAgent | Llama Vision API con el schema; devuelve raw_content + structured (extractedData). |
| 3 | TramiteSystem | Usa plugin.mapToContext si aplica; devuelve result.extractedData (para guardar en metadata). |
| 4 | API route de procesamiento de documentos | Recibe tramiteId (ej. `preaviso`), invoca TramiteSystem.processDocument(pluginId, file, documentType, context). INSERT en `documentos` con `metadata: { extracted_data: result.extractedData }` (incluye raw_content). |

**Archivo(s) clave:** API route que orquesta el procesamiento (actualmente `app/api/ai/preaviso-process-document/route.ts`; tras refactor podría ser `app/api/ai/process-document/route.ts` genérico con tramiteId en request). La zona de guardado en `documentos` es la que hace INSERT con metadata.

---

## 7. Fases del Plan (Detalladas)

### FASE 0: Preparación y Baseline (Crítica)

**Objetivo:** Medir estado actual para comparar después. No tocar funcionalidad.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 0.1 | Crear script de métricas baseline | Script que intercepte o lea activity_logs para tokens por turno, latencia, costo. Ejecutable: `pnpm run baseline-metrics` | `scripts/baseline-metrics.ts` | Script guarda `baseline-metrics-YYYYMMDD.json` |
| 0.2 | Ejecutar baseline en 5–10 conversaciones | Conversaciones de prueba (chat + documentos). Registrar métricas por conversación. | `baseline-metrics-YYYYMMDD.json` | Archivo con al menos 5 conversaciones |
| 0.3 | Documentar flujo actual | Diagrama: TramiteSystem.process → interpretWithLLM → generateQuestion. Incluir PreavisoDocumentProcessor. | `docs/FLUJO_ACTUAL_CHAT.md` | Doc con diagrama y descripción |
| 0.4 | Branch de trabajo | Crear y usar branch para todo el refactor. | `feature/multi-agent-rag-refactor` | Branch creado |

---

### FASE 1: RAG de Conocimiento + Prompts Mínimos

**Objetivo:** Reducir tokens sin cambiar la arquitectura de agentes.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 1.1 | Crear tabla knowledge_chunks (genérica) | Columnas: id, tramite_type, state_id, topic, text, embedding (vector), metadata, created_at. Índice HNSW para embedding. Una sola tabla para todos los trámites. Ver §5.3. | `supabase/migrations/XXX_create_knowledge_chunks.sql` | Migración aplicada |
| 1.2 | Poblar chunks de conocimiento para preaviso | Extraer reglas de PROMPT 2 y PreavisoPrompts. Crear chunks por estado, por topic y globales (state_id/topic null). Múltiples chunks por estado. Tramite_type = 'preaviso'. Ver §5.3. | `supabase/seeds/knowledge_chunks_preaviso.ts` o SQL | Al menos 15–20 chunks |
| 1.3 | Implementar KnowledgeRAGService | Función RPC `match_knowledge_chunks(query_embedding, tramite_type, state_id?, topic?, limit)`. Servicio: `searchKnowledge(query, tramiteType, stateId?, topic?, limit)`. Ver §5.3. | `lib/services/knowledge-rag-service.ts`, migración RPC | searchKnowledge funcional con filtro por tramite_type |
| 1.4 | Integrar RAG conocimiento en PreavisoPrompts | En generateSystemPrompts, llamar KnowledgeRAGService según estado + missing. Inyectar 1–3 chunks. | `lib/tramites/plugins/preaviso/preaviso-prompts.ts` | System prompt reducido; tests pasan |
| 1.5 | Reducir PROMPT 1 | Identidad del agente, ~200 tokens máx. Sin reglas de negocio. | `lib/prompts/retrieval-response.ts` (o migrar desde chat.ts) | Constante actualizada |
| 1.6 | Reducir PROMPT 3 | Snapshot compacto: estado, allowed_actions, blocking, required_missing, datos_capturados (resumen). | `lib/prompts/retrieval-response.ts` buildPromptTaskState | PROMPT 3 acortado |
| 1.7 | Reducir PROMPT 4 | Principios + keys permitidos + prohibiciones genéricas. Reglas por campo en RAG. | `lib/prompts/retrieval-response.ts` PROMPT_4 | PROMPT 4 < 500 tokens |
| 1.8 | Medir tokens post-Fase 1 | Ejecutar script de métricas. | `post-fase1-metrics.json` | Reducción ≥ 30% en system+user |
| 1.9 | Regresión preaviso | Flujo completo: chat + documentos. | - | Sin regresiones funcionales |

---

### FASE 2: Procesador Genérico + Vision-Only + Eliminación OCRProcessor

**Objetivo:** ExtractionAgent genérico con schema por plugin. Solo Vision API. Eliminar OCRProcessor/AIProcessor.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 2.1 | Definir ExtractionSchema y VisionExtractionResult | Interfaces TypeScript. Soporte para object anidado, array. | `lib/agents/types/extraction-schema.ts`, `schemas/vision-extraction-result.ts` | Tipos exportados |
| 2.2 | Crear ExtractionAgent | Clase genérica: `extract(file, schema): Promise<VisionExtractionResult>`. Construye prompt desde schema. Llama Vision API. | `lib/agents/extraction-agent.ts` | Clase con método extract |
| 2.3 | Implementar buildVisionPrompt(schema) | Función que genera prompt para Vision: "Extrae raw_content y estos campos: ..." | `lib/agents/extraction-agent.ts` | Prompt generado correctamente |
| 2.4 | Extender TramitePlugin con getExtractionSchema y mapToContext | Interfaces opcionales. TramiteSystem llama al plugin para obtener schema antes de ExtractionAgent. | `lib/tramites/base/tramite-plugin.ts` | Contrato extendido |
| 2.5 | Renombrar API route de procesamiento de documentos a genérico | Crear `app/api/ai/process-document/route.ts` que reciba tramiteId en request. Migrar lógica desde preaviso-process-document; actualizar frontend para usar la nueva ruta o mantener redirect temporal. | `app/api/ai/process-document/route.ts` | Ruta genérica funcional, tramiteId en request |
| 2.6 | Implementar PreavisoPlugin.getExtractionSchema | Schemas para inscripcion, identificacion, acta_matrimonio, escritura. | `lib/tramites/plugins/preaviso/preaviso-plugin.ts` | Método retorna schema por documentType |
| 2.7 | Implementar PreavisoPlugin.mapToContext | Mapeo de VisionExtractionResult a contexto preaviso (vendedores, compradores, inmueble, etc.). | `lib/tramites/plugins/preaviso/preaviso-plugin.ts` | Mismo merge que handlers actuales |
| 2.8 | Refactorizar TramiteSystem.processDocument | Obtener schema del plugin → llamar ExtractionAgent → plugin.mapToContext. Sustituir PreavisoDocumentProcessor.extractWithOpenAI. | `lib/tramites/base/tramite-system.ts`, `lib/tramites/plugins/preaviso/document-processor.ts` | Flujo usa ExtractionAgent + plugin |
| 2.9 | Persistir raw_content + structured en documentos.metadata | Incluir raw_content en metadata.extracted_data. API route genérico guarda extractedData. | `app/api/ai/process-document/route.ts` | metadata contiene raw_content |
| 2.10 | Eliminar OCRProcessor y AIProcessor | Borrar o reducir ai-processor.ts. Migrar document-generator, validation-interface, field-highlighter a tipos propios o VisionExtractionResult. | `lib/ai-processor.ts`, `lib/document-generator.ts`, `components/validation-interface.tsx`, `components/field-highlighter.tsx` | Sin referencias a ai-processor |
| 2.11 | Logging ExtractionAgent | ActivityLogService.logAIUsage con category document_processing. | `lib/agents/extraction-agent.ts` | Tokens y costo registrados |
| 2.12 | Tests de regresión | Subir inscripción, identificación, acta_matrimonio. Verificar extracción y raw_content. | - | Misma calidad que antes + raw_content |

---

### FASE 3: Agente de Embedding (Vector Indexer)

**Objetivo:** EmbeddingAgent que indexa en documento_text_chunks.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 3.1 | Crear EmbeddingAgent | `indexChunks(chunks: ChunkInput[]): Promise<void>`. Genera embeddings, upsert en documento_text_chunks. | `lib/agents/embedding-agent.ts` | Clase funcional |
| 3.2 | Integrar en flujo post-extracción | Tras guardar documento, chunkear raw_content (y opcional structured), llamar EmbeddingAgent. | `app/api/ai/process-document/route.ts` o TramiteSystem | Flujo extract → chunk → embed → store |
| 3.3 | Reutilizar DocumentoService/DocumentoTextChunkService | No duplicar lógica. EmbeddingAgent puede usar DocumentoService para persistir chunks. | `lib/services/documento-service.ts` | Chunks guardados con embeddings |
| 3.4 | Knowledge chunks | Usar EmbeddingAgent para `knowledge_chunks` si no se hace en migración. | `lib/agents/embedding-agent.ts` o script | Chunks de conocimiento con embeddings |
| 3.5 | Trazabilidad | Registrar operaciones de indexación en metadata si aplica. | - | Trazabilidad opcional |

---

### FASE 4: Agente de Retrieval y Respuesta

**Objetivo:** RetrievalResponseAgent que usa RAG y genera respuestas.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 4.1 | Crear RetrievalResponseAgent | `process(userQuery, context, history): Promise<AgentResponse>`. | `lib/agents/retrieval-response-agent.ts` | Clase con método process |
| 4.2 | Integrar RAG documentos + conocimiento | Llamar DocumentoService.searchSimilarChunks y KnowledgeRAGService.searchKnowledge. Combinar resultados. | `lib/agents/retrieval-response-agent.ts` | Búsqueda combinada |
| 4.3 | Decisión: 1 vs 2 llamadas LLM por turno | Unificar interpretación + generación en un flujo o mantener separados. Documentar en ADR. | `docs/architecture/ADR-retrieval-agent.md` | ADR creado |
| 4.4 | Implementar flujo completo | query → RAG retrieval → build prompts → LLM → parse DATA_UPDATE + respuesta. | `lib/agents/retrieval-response-agent.ts` | Mismo contrato de salida que hoy |
| 4.5 | Integrar en TramiteSystem.process | Sustituir interpretWithLLM + generateQuestion por llamada a RetrievalResponseAgent. | `lib/tramites/base/tramite-system.ts` | TramiteSystem delega en agente |
| 4.6 | Preservar ActivityLogService | Cada llamada LLM del agente loguea tokens y costo. | `lib/agents/retrieval-response-agent.ts` | activity_logs con category ai_usage |
| 4.7 | Preservar merge defensivo | preserveIfEmptyArray, créditos, inmueble. No vaciar arrays por accidente. | `lib/tramites/base/tramite-system.ts` | Sin regresiones de datos vaciados |
| 4.8 | Regresión completa | Chat, documentos, stats dashboard. | - | Stats y costos correctos en UI |

---

### FASE 5: JSON Canónico y Schemas por Trámite

**Objetivo:** Simplificar JSON canónico y soportar schemas por trámite. **Los schemas se definen en cada plugin** vía `getCanonicalSchema()`.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 5.1 | Auditar canonical-json-v1.4 | Lista de keys usados vs no usados en preaviso. | `docs/AUDITORIA_JSON_V1.4.md` | Doc con análisis |
| 5.2 | Definir schema v1.5 para preaviso | Solo keys necesarios. Archivo en el plugin o `lib/tramites/plugins/preaviso/schemas/`. | `lib/tramites/plugins/preaviso/preaviso-canonical-schema.ts` | Schema definido |
| 5.3 | Extender TramitePlugin con getCanonicalSchema | Método opcional. Plugin devuelve schema de salida DATA_UPDATE. | `lib/tramites/base/tramite-plugin.ts` | Contrato extendido |
| 5.4 | Implementar PreavisoPlugin.getCanonicalSchema | Devuelve preaviso schema v1.5. | `lib/tramites/plugins/preaviso/preaviso-plugin.ts` | Método retorna schema |
| 5.5 | Implementar getSchemaForTramite | `getSchemaForTramite(tramiteId): Schema` — delega en `plugin.getCanonicalSchema()`. | `lib/schemas/index.ts` | Función exportada, delega en plugin |
| 5.6 | Mover reglas por entidad a RAG | Reglas de vendedor, comprador, crédito, etc. en `knowledge_chunks` (tramite_type, state_id, topic). | - | PROMPT 4 solo principios |
| 5.7 | Usar schema dinámico en PROMPT 4 y RetrievalResponseAgent | Emisión de DATA_UPDATE según `plugin.getCanonicalSchema()`. | `lib/agents/retrieval-response-agent.ts` | Emisión correcta |
| 5.8 | Validación con Zod | Validar salida del LLM contra schema del plugin. | `lib/schemas/validate.ts` | Validación funcional |
| 5.9 | Tests preaviso v1.5 | Verificar persistencia de datos. | - | Sin pérdida de datos |

---

### FASE 6: Optimización, Métricas y Cierre

**Objetivo:** Validar mejoras, documentar y cerrar.

| ID | Tarea | Detalle | Archivos/Salidas | Criterio de aceptación |
|----|-------|---------|------------------|------------------------|
| 6.1 | Métricas post-refactor | Ejecutar script. | `post-refactor-metrics-YYYYMMDD.json` | Archivo generado |
| 6.2 | Comparar baseline vs post | Reducción tokens ≥ 40%, latencia igual o menor. | `docs/COMPARATIVA_METRICAS.md` | Doc con comparación |
| 6.3 | ADR arquitectura multi-agente | Decisión, contexto, consecuencias. | `docs/architecture/ADR-multi-agent-chat.md` | ADR creado |
| 6.4 | Actualizar ANALISIS_RAG_MCP_MULTIAGENTE_CAPTURA | Resultado final del refactor. | `docs/ANALISIS_RAG_MCP_MULTIAGENTE_CAPTURA.md` | Doc actualizado |
| 6.5 | Revisión de código y merge a qa | PR con todas las fases. | - | PR aprobado |
| 6.6 | Deploy QA y smoke test | - | - | App estable en QA |
| 6.7 | Monitoreo 1 semana | Errores, costos, feedback. | `docs/REPORTE_MONITOREO_REFACTOR.md` | Reporte creado |

---

## 8. Consideraciones de No Regresión

### Stats, Costos, Logging

- **ActivityLogService** no debe cambiar su firma ni contrato.
- Toda llamada LLM debe llamar `ActivityLogService.logAIUsage` con: userId, tokensInput, tokensOutput, model, sessionId, tramiteId, actionType.
- Dashboard de stats debe seguir mostrando costos y uso por usuario/trámite.

### UI

- `PreavisoChat` y `preaviso-chat.tsx`: sin cambios visuales relevantes.
- Contrato API `/api/ai/preaviso-chat`: misma estructura request/response.

### Arquitectura de 4 Prompts

- Respetar `docs/ARCHITECTURA_PROMPTS.md`: PROMPT 1 (identidad), PROMPT 2 (reglas, vía RAG), PROMPT 3 (estado), PROMPT 4 (salida).
- PROMPT 2 reducido a: "Las reglas se inyectan (RAG). Síguelas." + KnowledgeRAGService.

---

## 9. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Regresión en extracción | Media | Alto | Tests por tipo de documento; comparar antes/después |
| Procesador genérico menos preciso que handlers específicos | Media | Alto | Validar calidad de extracción en Fase 2; ajustar schemas y prompts |
| Aumento latencia por RAG | Baja | Medio | Medir; limitar chunks inyectados |
| Pérdida de datos en merge | Media | Alto | Mantener merge defensivo; tests específicos |
| Regresión document-generator/validation-interface | Media | Medio | Auditar flujos; migrar tipos a VisionExtractionResult |
| Incompatibilidad stats/costos | Baja | Alto | No modificar ActivityLogService |

---

## 10. Orden de Implementación

```
Fase 0 (Preparación)  →  Fase 1 (RAG + Prompts)  →  Fase 2 (Procesador Genérico + Extraction)
                                                              ↓
Fase 6 (Cierre)       ←  Fase 5 (JSON)            ←  Fase 4 (Retrieval)  ←  Fase 3 (Embedding)
```

**Entregas incrementales:**

1. **Entrega 1:** Fase 0 + Fase 1 → Reducción de tokens.
2. **Entrega 2:** Fase 2 + Fase 3 → Procesador genérico + embedding.
3. **Entrega 3:** Fase 4 + Fase 5 → Retrieval + schemas.
4. **Entrega 4:** Fase 6 → Cierre y monitoreo.

---

## 11. Checklist Pre-Merge

- [ ] Baseline ejecutado y guardado
- [ ] Todas las tareas de la fase completadas
- [ ] ActivityLogService preservado
- [ ] UI sin cambios relevantes o documentados
- [ ] Tests de regresión pasando
- [ ] ADR creado
- [ ] Documentación actualizada

---

## 12. Referencias

- `docs/ARCHITECTURA_PROMPTS.md` — arquitectura de 4 prompts (documento compartido para todo el equipo)
- `lib/ai-processor.ts` (a eliminar)
- `lib/document-generator.ts`, `components/validation-interface.tsx`, `components/field-highlighter.tsx` (migrar)
- `lib/tramites/plugins/preaviso/document-processor.ts` (refactorizar a usar ExtractionAgent)
- `lib/tramites/plugins/preaviso/preaviso-plugin.ts` (añadir getExtractionSchema, mapToContext)
- `app/api/ai/preaviso-process-document/route.ts` (llena metadata)
- `docs/ANALISIS_RAG_MCP_MULTIAGENTE_CAPTURA.md`
- `docs/AUDITORIA_PROMPTS.md`
- `schemas/canonical-json-v1.4.json`
- `docs/ARCHITECTURA_PROMPTS.md`

---

## 13. Prompts por Agente y Ubicación (Guía de Implementación)

Esta sección resume qué prompts necesita cada agente, en qué archivo van y si los plugins aportan prompts.

### 13.1 ExtractionAgent

| Aspecto | Detalle |
|---------|---------|
| **¿Usa prompts?** | Sí. Un prompt para Vision API que se **genera dinámicamente** desde el ExtractionSchema. |
| **Archivo** | `lib/agents/extraction-agent.ts` — función `buildVisionPrompt(schema)`. |
| **Fuente del contenido** | El schema viene del plugin (`getExtractionSchema`). El **template** del prompt es genérico en el agent. |

**Ejemplo de prompt (generado desde schema):**
```
Analiza este documento e extrae:

1. raw_content: El texto completo visible en el documento (transcripción literal).
2. structured: Los siguientes campos en JSON:
   - folios: [array de objetos con numero]
   - partidas: [array de strings]
   - propietario: { nombre: string }
   - direccion: { calle, numero, colonia, municipio, estado, codigo_postal }

Devuelve un JSON válido con keys raw_content y structured.
```

**Responsabilidad del agente:** Convertir ExtractionSchema → prompt legible para Vision. El plugin solo provee el schema (datos), no el texto del prompt.

---

### 13.2 EmbeddingAgent

| Aspecto | Detalle |
|---------|---------|
| **¿Usa prompts?** | No. Solo llama a la API de embeddings (`text-embedding-3-small`). No hay prompt de chat/completion. |
| **Archivo** | `lib/agents/embedding-agent.ts` — usa `EmbeddingsService.generateEmbedding(text)`. |

---

### 13.3 RetrievalResponseAgent

| Aspecto | Detalle |
|---------|---------|
| **¿Usa prompts?** | Sí. Sustituye a interpretWithLLM + generateQuestion. Necesita los 4 prompts (identidad, reglas, estado, salida). |
| **Archivos** | `lib/agents/retrieval-response-agent.ts` + `lib/prompts/retrieval-response.ts`. Ver §13.5. |

**Estructura sugerida de prompts:**

| Prompt | Contenido | Origen | Archivo sugerido |
|--------|-----------|--------|------------------|
| **PROMPT 1** (Identidad) | Quién eres, tono, no eres abogado. ~200 tokens. | Constante, común a todos los trámites | `lib/prompts/retrieval-response.ts` |
| **PROMPT 2** (Reglas) | Inyectado por RAG desde `knowledge_chunks`. El agente llama `KnowledgeRAGService.searchKnowledge(query, tramiteType, stateId?, topic?)` y concatena 1–3 chunks. Ver §5.3. | RAG (base de datos) | No es constante; se construye en runtime |
| **PROMPT 3** (Estado) | Snapshot: estado actual, datos capturados, faltantes, bloqueos. Generado por código. | `buildPromptTaskState(context, plugin)` | `lib/prompts/retrieval-response.ts` |
| **PROMPT 4** (Salida) | Contrato DATA_UPDATE, keys permitidos (del schema del plugin), prohibiciones (no inventar, no vaciar). | Constante + schema dinámico de `plugin.getCanonicalSchema()` | `lib/prompts/retrieval-response.ts` |

**Responsabilidad del agente:** Construir system prompt = PROMPT 1 + chunks RAG (PROMPT 2) + PROMPT 3 + PROMPT 4. Una (o dos) llamadas LLM: interpretar input + generar respuesta.

---

### 13.4 ¿Prompts en los plugins?

| Método / aspecto | ¿Lleva prompts? | Dónde va |
|------------------|-----------------|----------|
| **getExtractionSchema** | No. Devuelve estructura (schema). El ExtractionAgent genera el prompt. | Plugin |
| **mapToContext** | No. Lógica pura. | Plugin |
| **getCanonicalSchema** | No. Devuelve schema para validación/emisión. | Plugin |
| **getLoopGuardMessage** | Sí. Frases tipo "Para avanzar necesito…". Podrían estar en RAG o como constantes en el plugin. | Plugin (hoy) o `knowledge_chunks` (con tramite_type, state_id, topic) — ver §5.3 |
| **inferDocumentIntent** | No. Lógica de parsing. | Plugin |
| **Tono / personalidad** | Opcional. Si un trámite requiere un tono distinto, el plugin podría exponer `getPersonalityHints(): string` que se inyecta en PROMPT 1. | Plugin (opcional) |

**Recomendación:** Los plugins **no definen prompts de LLM** directamente. Proveen:
- Schemas (getExtractionSchema, getCanonicalSchema)
- Lógica (mapToContext, inferDocumentIntent)
- Mensajes deterministas (getLoopGuardMessage)

Las reglas de negocio van a RAG (`knowledge_chunks`). Si un plugin necesita frases específicas (ej. "En preaviso no preguntes por X"), se crean chunks con `tramite_type`, `state_id` y `topic` (ver §5.3) y RAG los recupera.

---

### 13.5 Consolidación de ubicación de prompts

**Objetivo:** Reducir lugares donde viven prompts sin mezclar responsabilidades.

| Ubicación | Contenido | Criterio |
|-----------|-----------|----------|
| **`lib/prompts/`** | PROMPT_1_IDENTITY, PROMPT_4_OUTPUT_CONTRACT, buildPromptTaskState, buildPromptWithRAG. Opcional: structure.ts, notarialize.ts para APIs específicas. | Prompts **estáticos** — constantes y funciones que arman texto |
| **`lib/agents/extraction-agent.ts`** | `buildVisionPrompt(schema)` — template que genera prompt desde schema. | Prompts **generados por lógica** — el plugin da datos, el agente los convierte en prompt |
| **`knowledge_chunks` (DB)** | Chunks de PROMPT 2 — reglas por estado, topic y globales. Ver §5.3. | Prompts **dinámicos** — RAG, editables sin deploy |

**No crear** `lib/ai/prompts/` y `lib/agents/prompts/` a la vez. Unificar en `lib/prompts/`. Los agentes importan desde ahí.

---

### 13.6 Resumen de archivos de prompts

| Archivo | Contenido |
|---------|-----------|
| `lib/prompts/retrieval-response.ts` | PROMPT_1_IDENTITY, PROMPT_4_OUTPUT_CONTRACT, buildPromptWithRAG(), buildPromptTaskState() |
| `lib/agents/extraction-agent.ts` | `buildVisionPrompt(schema)` — template que convierte schema en prompt para Vision |
| `lib/agents/retrieval-response-agent.ts` | Orquesta: RAG → build prompts → LLM → parse. Importa desde lib/prompts |
| `knowledge_chunks` (tabla genérica) | Chunks de PROMPT 2 — reglas por estado, topic y globales. Ver §5.3. |
| `lib/tramites/plugins/preaviso/preaviso-plugin.ts` | getLoopGuardMessage (strings), getExtractionSchema, getCanonicalSchema — sin prompts de LLM |

---

## 14. Resumen: Dónde Estamos, Qué Tenemos y Por Qué Cambiar

Esta sección sintetiza el punto de partida, los activos actuales y las razones que justifican el refactor.

### 14.1 Dónde Estamos

| Dimensión | Situación actual |
|-----------|------------------|
| **Arquitectura de chat** | Monolito: en cada turno se llama `interpretWithLLM` y `generateQuestion`. Todo en un mismo flujo, prompts pesados (~3–4k tokens system + ~2–3k user). |
| **Extracción de documentos** | PreavisoDocumentProcessor con handlers específicos por tipo (inscripción, identificación, acta_matrimonio, escritura). OCRProcessor/AIProcessor en `ai-processor.ts` (mock o simulador). Prompts duplicados en `lib/ai/prompts/documents.ts`. |
| **Datos extraídos** | Solo campos estructurados definidos por el schema de cada documento. No se guarda el texto completo (`raw_content`). Si el usuario pregunta algo fuera del schema, no hay de dónde responder. |
| **Reglas de negocio** | PROMPT 2 en base de datos (`preaviso_config.prompt`), pero inyectado entero en cada turno. No hay RAG de conocimiento: todas las reglas van en cada llamada. |
| **Prompts** | Dispersos: `lib/ai/prompts/chat.ts`, `lib/ai/prompts/documents.ts`, `preaviso-prompts.ts`, DB. Sin consolidación clara. |
| **Extensibilidad** | Añadir un nuevo trámite (ej. testamento) implica duplicar lógica de extracción, prompts y flujos. No hay procesador genérico. |

### 14.2 Qué Tenemos (Activos a Preservar)

| Activo | Descripción | Acción |
|--------|-------------|--------|
| **Plugin system** | TramiteSystem, TramitePlugin, PreavisoPlugin con estados, transiciones, validación. | Mantener. Extender con getExtractionSchema, mapToContext, getCanonicalSchema. |
| **4 prompts** | Arquitectura definida en `docs/ARCHITECTURA_PROMPTS.md`: identidad, reglas, estado, salida. | Preservar responsabilidades. Reducir tamaño y mover reglas a RAG. |
| **ActivityLogService** | Logging de tokens, costos, sesiones, tramites. | No modificar firma ni contrato. |
| **UI** | PreavisoChat, preaviso-chat.tsx. Contrato API estable. | Sin cambios visuales relevantes. |
| **documento_text_chunks** | Tabla con embeddings para RAG de documentos. | Usar. Completar flujo: raw_content → chunks → embeddings. |
| **documentos.metadata** | Estructura para guardar datos extraídos. | Extender con raw_content + structured. |
| **Schemas y validación** | canonical-json-v1.4, validación de salida. | Evolucionar a schemas por trámite (getCanonicalSchema). |

### 14.3 Por Qué Implementar Estos Cambios

| Problema | Impacto | Solución en el plan |
|----------|---------|---------------------|
| **Prompts demasiado grandes** | Mayor costo por turno, latencia, riesgo de perder contexto. | RAG de conocimiento: inyectar solo 1–3 chunks relevantes según estado/topic. Objetivo: ≥30% reducción de tokens. |
| **Sin raw_content** | No se puede responder preguntas sobre datos no extraídos (número de escritura, fecha, etc.). | Siempre guardar raw_content; chunkear e indexar en documento_text_chunks para RAG. |
| **Procesador de documentos acoplado** | Handlers específicos por tipo, prompts en documentos.ts. Nuevo trámite = duplicar todo. | ExtractionAgent genérico + schema por plugin. Un solo procesador; el plugin define qué extraer y cómo mapear. |
| **OCRProcessor/AIProcessor** | Código legacy, mock o simulador. Vision ya hace el trabajo. | Eliminar. Usar solo Vision API. |
| **Reglas inyectadas enteras** | PROMPT 2 completo en cada turno. No escala con más estados/reglas. | knowledge_chunks: tabla genérica con tramite_type, state_id, topic. Recuperar solo lo relevante. |
| **Prompts dispersos** | chat.ts, documents.ts, preaviso-prompts, DB. Difícil mantener. | Consolidar en lib/prompts/, ExtractionAgent, knowledge_chunks. Ver §13.5. |
| **No hay RAG de conocimiento** | Reglas de negocio van en PROMPT 2 fijo. Editar reglas = migración SQL. | RAG dinámico: editar chunks en DB sin deploy. Recuperar por estado y topic. |

### 14.4 Resumen en Una Frase

**Tenemos** un chat funcional con plugin system y logging, pero **prompts pesados**, **extracción acoplada** y **sin raw_content/RAG de documentos**. El refactor **reduce tokens**, **permite responder cualquier pregunta sobre documentos**, **unifica la extracción** en un procesador genérico y **hace las reglas editables** vía RAG, sin tocar stats, costos ni UI.
