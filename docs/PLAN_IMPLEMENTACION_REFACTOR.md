# Plan de Implementación — Refactor Multi-Agente + RAG

**Referencia:** Este documento implementa el diseño definido en `docs/PLAN_REFACTOR_AGENTE_MULTIAGENTE_RAG.md`. El plan de refactor describe el **qué**; este documento describe el **cómo** ejecutarlo por fases, con dependencias y paralelización para 2–3 desarrolladores.

---

## 1. ¿Es lógico el orden de las fases?

Sí. El orden del plan original es coherente:

| Fase | Depende de | Motivo |
|------|------------|--------|
| **0** | Nada | Baseline y branch; sin medición no hay comparación después. |
| **1** | 0 | Necesitas branch y métricas previas para medir reducción de tokens. |
| **2** | 0 | Procesador genérico y extracción son independientes del RAG de conocimiento (Fase 1). |
| **3** | 2 | Embedding indexa lo que ya guarda el procesador (raw_content en documentos). Sin 2 no hay flujo unificado de extracción → guardado. |
| **4** | 1 y 3 | RetrievalResponseAgent usa KnowledgeRAGService (Fase 1) y chunks de documentos (Fase 3). |
| **5** | 4 | Schemas por trámite y PROMPT 4 dinámico se integran en el agente de respuesta (Fase 4). |
| **6** | 0–5 | Cierre, métricas y monitoreo requieren todo lo anterior. |

**Posible paralelismo:** Las **Fases 1 y 2** no dependen entre sí; solo de Fase 0. Se pueden repartir entre dos devs desde el inicio.

---

## 2. Grafo de dependencias (resumen)

```
                    Fase 0 (Preparación)
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
       Fase 1 (RAG conocimiento   Fase 2 (ExtractionAgent
        + prompts mínimos)          + processDocument)
            │                         │
            │                         ▼
            │                    Fase 3 (EmbeddingAgent)
            │                         │
            └────────────┬────────────┘
                         ▼
                  Fase 4 (RetrievalResponseAgent)
                         │
                         ▼
                  Fase 5 (JSON canónico / schemas)
                         │
                         ▼
                  Fase 6 (Cierre y monitoreo)
```

---

## 3. Fases con dependencias internas y paralelización

Cada fase se desglosa en: **dependencias internas** (entre tareas de la misma fase), **quién puede hacerla** y **qué puede ir en paralelo** con otras fases o tareas.

---

### FASE 0: Preparación y Baseline

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 0.1 | Script métricas baseline | — | — | 1 dev. Base para 0.2 y 6.1. |
| 0.2 | Ejecutar baseline 5–10 conversaciones | 0.1 | — | 1 dev. Usa script de 0.1. |
| 0.3 | Documentar flujo actual (FLUJO_ACTUAL_CHAT.md) | — | 0.1, 0.2 | Puede hacerlo otro dev en paralelo. |
| 0.4 | Branch de trabajo | — | 0.1, 0.2, 0.3 | Crear branch; todo el mundo trabaja desde aquí. |

**Sugerencia:** Un dev lidera 0.1 + 0.2; otro puede hacer 0.3. 0.4 se hace cuando se empieza a codear (consensuado).

**Entrega:** Branch creado + baseline guardado + doc de flujo. **Bloqueante** para Fase 1 y 2.

---

### FASE 1: RAG de Conocimiento + Prompts Mínimos

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 1.1 | Tabla knowledge_chunks | 0.4 | — | Migración. 1 dev. |
| 1.2 | Poblar chunks preaviso (seed) | 1.1 | 1.3 | Depende de tabla. Puede ir en paralelo con 1.3. |
| 1.3 | KnowledgeRAGService + RPC | 1.1 | 1.2 | Depende de tabla. Mismo archivo/DB que 1.2, coordinar. |
| 1.4 | Integrar RAG en PreavisoPrompts | 1.3 | — | Necesita searchKnowledge. |
| 1.5 | Reducir PROMPT 1 | — | 1.6, 1.7 | Mismo archivo lib/prompts: repartir o secuencial. |
| 1.6 | Reducir PROMPT 3 | — | 1.5, 1.7 | Idem. |
| 1.7 | Reducir PROMPT 4 | — | 1.5, 1.6 | Idem. |
| 1.8 | Medir tokens post-Fase 1 | 1.4, 1.5–1.7 | — | Script de 0.1. |
| 1.9 | Regresión preaviso | 1.8 | — | Pruebas E2E. |

**Dependencias internas:** 1.1 → (1.2, 1.3); 1.3 → 1.4. Las tareas 1.5, 1.6, 1.7 tocan el mismo módulo (prompts); mejor un dev o muy buena coordinación.

**Paralelización con otras fases:** Toda la Fase 1 puede ir en paralelo con la Fase 2 (otro dev).

**Sugerencia:** Dev A: 1.1 → 1.2 + 1.3 (coordinar) → 1.4 → 1.5–1.7 → 1.8 → 1.9.

---

### FASE 2: Procesador Genérico + Vision-Only

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 2.1 | ExtractionSchema + VisionExtractionResult | 0.4 | 2.4 | Tipos. Puede ir en paralelo con 2.4. |
| 2.2 | ExtractionAgent (clase + extract) | 2.1 | — | 1 dev. |
| 2.3 | buildVisionPrompt(schema) | 2.2 | — | Dentro de ExtractionAgent. |
| 2.4 | TramitePlugin: getExtractionSchema, mapToContext | 0.4 | 2.1 | Interfaz. No depende de 2.2. |
| 2.5 | API route process-document genérico | — | 2.6, 2.7 | Ruta; puede prepararse antes de 2.8. |
| 2.6 | PreavisoPlugin.getExtractionSchema | 2.4 | 2.7 | Plugin. |
| 2.7 | PreavisoPlugin.mapToContext | 2.4 | 2.6 | Plugin. |
| 2.8 | TramiteSystem.processDocument refactor | 2.2, 2.4, 2.6, 2.7 | — | Orquesta todo. |
| 2.9 | Persistir raw_content en metadata | 2.8 | — | Parte del flujo 2.8. |
| 2.10 | Eliminar OCRProcessor / AIProcessor | 2.8, 2.9 | — | Tras migrar consumidores. |
| 2.11 | Logging ExtractionAgent | 2.2 | — | Puede hacerse con 2.2. |
| 2.12 | Tests regresión documentos | 2.9 | — | 1 dev. |

**Dependencias internas:** 2.1 y 2.4 en paralelo → 2.2 (y 2.3) → 2.6, 2.7 (en paralelo) → 2.8 → 2.9 → 2.10. 2.5 puede hacerse pronto (solo ruta genérica).

**Paralelización con otras fases:** Fase 2 completa en paralelo con Fase 1.

**Sugerencia:** Dev B: 2.1 + 2.4 → 2.2 + 2.3 → 2.6 + 2.7 (o repartir) → 2.5 → 2.8 → 2.9 → 2.10 → 2.11, 2.12.

---

### FASE 3: EmbeddingAgent

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 3.1 | EmbeddingAgent (indexChunks) | 0.4 | — | Usa documento_text_chunks (tabla existente). |
| 3.2 | Integrar post-extracción (chunk → embed → store) | 3.1, **2.8/2.9** | — | Depende de Fase 2. |
| 3.3 | Reutilizar DocumentoService | 3.1 | — | No duplicar lógica. |
| 3.4 | Embeddings para knowledge_chunks | 3.1, **1.1** | — | Opcional; puede ser script. |
| 3.5 | Trazabilidad indexación | 3.2 | — | Opcional. |

**Dependencias entre fases:** Fase 3 **depende de Fase 2** (flujo de processDocument que guarda raw_content). No depende de Fase 1 para el flujo de documentos; 3.4 sí usa tabla de Fase 1.

**Sugerencia:** El mismo dev que cerró Fase 2 puede hacer Fase 3, o un tercer dev cuando 2 esté listo.

---

### FASE 4: RetrievalResponseAgent

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 4.1 | Clase RetrievalResponseAgent + process() | **1.3**, **3.2** | — | Necesita RAG conocimiento y chunks documentos. |
| 4.2 | RAG documentos + conocimiento | 4.1 | — | DocumentoService + KnowledgeRAGService. |
| 4.3 | ADR 1 vs 2 llamadas LLM | — | 4.1 | Documentación; puede hacerse en paralelo. |
| 4.4 | Flujo completo (query → RAG → prompts → LLM → parse) | 4.2 | — | Integra todo. |
| 4.5 | Sustituir en TramiteSystem.process | 4.4 | — | interpretWithLLM + generateQuestion → agente. |
| 4.6 | ActivityLogService en agente | 4.1 | — | Desde el primer LLM del agente. |
| 4.7 | Preservar merge defensivo | 4.5 | — | Revisar al integrar. |
| 4.8 | Regresión completa | 4.5–4.7 | — | Chat + docs + stats. |

**Dependencias entre fases:** Fase 4 **depende de Fase 1** (KnowledgeRAGService) y **Fase 3** (chunks indexados). No puede empezar hasta que 1 y 3 estén listas.

**Sugerencia:** 1 dev (o 2 si uno hace 4.1–4.4 y otro 4.5–4.8 con cuidado de no pisarse en TramiteSystem).

---

### FASE 5: JSON Canónico y Schemas por Trámite

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 5.1 | Auditar canonical-json-v1.4 | 0.4 | Cualquier momento | Doc; puede hacerse **early** (incluso en Fase 0/1). |
| 5.2 | Schema v1.5 preaviso | 5.1 | 5.3 | Definición. |
| 5.3 | TramitePlugin.getCanonicalSchema | 0.4 | 5.1 | Interfaz. |
| 5.4 | PreavisoPlugin.getCanonicalSchema | 5.3, 5.2 | — | Implementación. |
| 5.5 | getSchemaForTramite(tramiteId) | 5.3 | — | Delega en plugin. |
| 5.6 | Reglas por entidad en knowledge_chunks | **1.2** | — | Contenido; puede ampliarse en Fase 1. |
| 5.7 | Schema dinámico en PROMPT 4 y agente | **4.4**, 5.4, 5.5 | — | Depende de Fase 4. |
| 5.8 | Validación Zod salida LLM | 5.7 | — | Tras 5.7. |
| 5.9 | Tests preaviso v1.5 | 5.7, 5.8 | — | Regresión. |

**Dependencias entre fases:** 5.1, 5.2, 5.3 pueden adelantarse. 5.7–5.9 **dependen de Fase 4**. 5.6 es contenido de RAG (Fase 1); puede hacerse en Fase 1 o después.

**Sugerencia:** 5.1 (y si acaso 5.2, 5.3) en paralelo con otras fases. El resto cuando Fase 4 esté estable.

---

### FASE 6: Cierre y Monitoreo

| ID | Tarea | Depende de | Paralelizable con | Notas |
|----|-------|------------|-------------------|-------|
| 6.1 | Métricas post-refactor | **0.1**, 4.8, 5.9 | — | Mismo script que 0.1. |
| 6.2 | Comparar baseline vs post | 0.2, 6.1 | — | Doc comparativo. |
| 6.3 | ADR arquitectura multi-agente | 4.4 | — | Documentación. |
| 6.4 | Actualizar ANALISIS_RAG... | 6.2 | — | Doc. |
| 6.5 | Revisión código y merge | Todas las fases | — | PR único o por entregas. |
| 6.6 | Deploy QA + smoke | 6.5 | — | Ops. |
| 6.7 | Monitoreo 1 semana | 6.6 | — | Todos. |

**Dependencias:** Fase 6 depende de haber cerrado 0–5. 6.1–6.4 pueden repartirse; 6.5–6.7 suelen ser coordinados.

---

## 4. Reparto sugerido para 2–3 desarrolladores

### Opción A: 2 desarrolladores

| Ventana | Dev 1 | Dev 2 |
|---------|-------|-------|
| Tras Fase 0 | **Fase 1** (RAG conocimiento + prompts) | **Fase 2** (ExtractionAgent + processDocument) |
| Tras Fase 1 y 2 | — | **Fase 3** (EmbeddingAgent) |
| Tras Fase 3 | **Fase 4** (RetrievalResponseAgent) con apoyo de Dev 2 si hace falta | Soporte Fase 4 o **Fase 5.1–5.5** (audit, schema, getCanonicalSchema) |
| Tras Fase 4 | **Fase 5.7–5.9** (schema en agente, validación, tests) | **Fase 5** restante / **Fase 6** (métricas, ADR, docs) |
| Cierre | **Fase 6** (revisión, merge, deploy, monitoreo) | Idem |

### Opción B: 3 desarrolladores

| Ventana | Dev 1 | Dev 2 | Dev 3 |
|---------|-------|-------|-------|
| Fase 0 | 0.1 + 0.2 | 0.3 | 0.4 (branch) |
| Tras Fase 0 | **Fase 1** | **Fase 2** | **Fase 5.1, 5.2, 5.3** (audit + interfaces schema) |
| Tras Fase 2 | — | **Fase 3** | Sigue con 5.4, 5.5 cuando tenga 5.3 |
| Tras Fase 1 y 3 | **Fase 4** (lead) | Soporte Fase 4 o tareas 4.3, 4.6, 4.7 | **Fase 5.6** (chunks) o preparar 5.7 |
| Tras Fase 4 | **Fase 5.7–5.9** | **Fase 6** (métricas, ADR) | **Fase 6** (docs, comparativa) |
| Cierre | Revisión + merge | Deploy + smoke | Monitoreo + reporte |

---

## 5. Resumen: qué depende de qué

| Si quieres hacer... | Necesitas antes... |
|--------------------|--------------------|
| Fase 1 | Solo Fase 0. |
| Fase 2 | Solo Fase 0. |
| Fase 3 | Fase 2 (processDocument con raw_content). |
| Fase 4 | Fase 1 (KnowledgeRAGService) y Fase 3 (chunks indexados). |
| Fase 5 (audit, schema, getCanonicalSchema) | Nada crítico; 5.1–5.5 pueden adelantarse. |
| Fase 5 (schema en agente, validación) | Fase 4. |
| Fase 6 | Fases 0–5. |

**Trabajo independiente desde el inicio:**
- **Fase 1** (un dev).
- **Fase 2** (otro dev).
- **Fase 5.1** (auditoría JSON) e incluso **5.2, 5.3** (definición schema + interfaz plugin) por un tercer dev.

**Puntos de sincronización:**
- Al terminar Fase 0: todos comparten branch y baseline.
- Al terminar Fase 2: quien haga Fase 3 puede empezar.
- Al terminar Fase 1 y Fase 3: se puede empezar Fase 4.
- Al terminar Fase 4: se pueden cerrar Fase 5.7–5.9 y Fase 6.

---

## 6. Referencia cruzada

- **Diseño y fases detalladas:** `docs/PLAN_REFACTOR_AGENTE_MULTIAGENTE_RAG.md` (§7 y §10).
- **Arquitectura de prompts:** `docs/ARCHITECTURA_PROMPTS.md`.
- **Este documento:** plan de implementación y reparto para 2–3 devs; no sustituye el plan de refactor, lo complementa.
