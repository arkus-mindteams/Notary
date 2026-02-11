# Flujo: Batch de documentos → "Generame un preaviso"

**Objetivo:** Poder subir un batch de documentos, que la IA los analice y guarde contexto de cada uno, y luego decir "Generame un preaviso con esa información" para que un agente arme el documento con la información obtenida de los documentos.

---

## 1. ¿Es alcanzable?

**Sí.** Es un flujo de **RAG + orquestación**:

- Lo que ya tienes: chunks, embeddings y búsqueda por trámite.
- Lo que añades: un flujo de "batch" (procesar N documentos y guardar contexto) y un **orquestador** que sabe qué datos necesita un preaviso y va pidiendo al sistema de consulta cada pieza hasta armar el JSON/documento.

---

## 2. Los tres roles (y por qué tienen sentido)

Te dijeron:

1. **Un agente que guarde la información (embedding).**
2. **Uno que consulte esa información y la devuelva como respuesta.**
3. **Uno que sepa qué preguntarle al anterior y qué hacer con la información obtenida.**

Tiene sentido; se puede concretar así:

| Rol | Nombre | Qué hace | ¿Tiene que ser "agente" LLM? |
|-----|--------|----------|------------------------------|
| **1. Ingesta** | Indexer / Pipeline | Por cada documento: extraer texto (OCR), trocear, generar embedding, guardar. Opcional: extraer datos estructurados (nombre, folio, institución, etc.) y guardarlos. | **No necesariamente.** Puede ser un **pipeline** (código + LLM solo para extracción por documento). |
| **2. Consulta** | Retrieval / Query | Dado un "pedido" (ej. "vendedor", "folio real", "comprador", "institución de crédito"): buscar en el almacén (vector + extracciones) y devolver fragmentos o campos relevantes. | Puede ser un **servicio** (API que hace búsqueda). O un "agente" pequeño que formula la query y devuelve la respuesta consolidada. |
| **3. Orquestador** | Orchestrator / Builder | Sabe qué datos necesita un preaviso (inmueble, vendedores, compradores, créditos, gravámenes). Para cada uno **pregunta al rol 2** "qué tenemos de X". Con las respuestas arma el JSON canónico, detecta huecos y genera el documento o pide al usuario solo lo que falta. | **Sí.** Aquí encaja un **agente LLM**: decide "qué pedir ahora", "con esto ya puedo generar", "falta esto". |

Resumen:

- **Rol 1** → puede ser pipeline (no hace falta que sea un agente conversacional).
- **Rol 2** → puede ser servicio o agente ligero.
- **Rol 3** → es el que "sabe qué preguntar y qué hacer con la información"; es el que conviene que sea un agente.

---

## 3. Flujo paso a paso

```
[Usuario sube N documentos]
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  ROL 1 — INGESTA                                         │
│  Por cada documento:                                     │
│  • Extraer texto (OCR / ya lo tienes)                    │
│  • Chunkear → guardar en documento_text_chunks           │
│  • Embedding → guardar (ya lo tienes)                   │
│  • (Opcional) LLM extrae campos estructurados → guardar  │
│    en documento.metadata.extracted_data o tabla          │
└─────────────────────────────────────────────────────────┘
         │
         ▼
   [Almacén: chunks + embeddings + extracciones por trámite]
         │
[Usuario: "Generame un preaviso con esa información"]
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  ROL 3 — ORQUESTADOR                                     │
│  • Conoce el esquema del preaviso (inmueble, vendedores, │
│    compradores, créditos, gravámenes)                    │
│  • Para cada "slot" necesario:                           │
│    → Llama al ROL 2: "¿Qué tenemos de [vendedor|folio|   │
│      comprador|institución crédito|gravamen]?"           │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  ROL 2 — CONSULTA                                        │
│  • Recibe pregunta (ej. "vendedor", "folio real")        │
│  • Busca en vector store (match_document_chunks) y/o      │
│    en extracciones estructuradas por documento           │
│  • Devuelve fragmentos de texto y/o campos extraídos      │
└─────────────────────────────────────────────────────────┘
         │
         ▼
   [Orquestador recibe respuestas]
   • Junta la información
   • Rellena el JSON canónico
   • Detecta huecos → genera preaviso o pide al usuario lo que falta
```

---

## 4. Qué ya tienes vs qué falta

### Ya tienes

- **Almacén de chunks + embeddings:** `documento_text_chunks` con `embedding`, por `documento_id` y `tramite_id`.
- **Búsqueda vectorial:** `match_document_chunks` / `DocumentoService.searchSimilarChunks(query, tramiteId, threshold, count)`.
- **Procesamiento por documento:** subes un archivo → se procesa → `extractedData` (guardado en `documentos.metadata.extracted_data` o en contexto). `PreavisoDocumentProcessor` y lógica por tipo (inscripción, identificación, etc.).
- **Generador de preaviso:** a partir del JSON canónico (`PreavisoData`) generas el documento.

### Falta (o hay que unificar)

1. **Batch explícito**  
   Hoy procesas documento a documento en el chat. Para "batch" necesitas un flujo donde el usuario suba varios a la vez (o a una bandeja) y el **rol 1** los procese todos (chunk + embed + opcional extracción estructurada) asociados al mismo `tramite_id`.

2. **Rol 2 como API clara**  
   Una función o API que reciba "qué necesito" (ej. `vendedor`, `folio_real`, `comprador_0_nombre`) y devuelva:
   - chunks relevantes (ya lo tienes con `searchSimilarChunks`),
   - y/o datos de `extracted_data` de los documentos del trámite (hoy en `documentos.metadata` o contexto; se puede centralizar en una vista o tabla por trámite).

3. **Rol 3 (orquestador)**  
   Un agente que:
   - Tenga el "mapa" de campos del preaviso (inmueble, vendedores, compradores, créditos, gravámenes).
   - Para cada uno invoque al rol 2 con una pregunta adecuada (ej. "titular registral vendedor", "folio real partidas", "comprador nombre estado civil").
   - Con las respuestas construya el JSON canónico (o borrador) y decida: "ya tengo suficiente para generar" o "falta X, se lo pido al usuario".

---

## 5. Respuesta directa

- **¿Es alcanzable?** Sí: batch → ingesta (chunk + embed + opcional extracción) → usuario pide "generame el preaviso" → orquestador pide al consultor cada pieza → se arma el documento.

- **¿Los tres agentes (guardar, consultar, orquestar) tienen sentido?** Sí. El que "guarda" puede ser pipeline; el que "consulta" puede ser servicio; el que "sabe qué preguntar y qué hacer con la información" es el orquestador y es el que más conviene que sea un agente LLM.

- **Siguiente paso práctico:**
  1. Definir un endpoint o flujo **"procesar batch"** que use tu pipeline actual por documento y asegure que todos los chunks/extracciones queden bajo el mismo `tramite_id`.
  2. Exponer **"consulta por trámite"** (rol 2) que combine `searchSimilarChunks` + lecturas de `extracted_data` por documento del trámite.
  3. Implementar el **orquestador** (rol 3) con un prompt que liste los "slots" del preaviso, con herramienta `consultar(qué_necesito)` que llama al rol 2, y que arme el JSON y llame al generador de preaviso.
