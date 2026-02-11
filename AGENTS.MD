# AGENTS.md — Notary (Backend-Driven + Multi-Agent RAG Refactor)

## Fuentes de verdad (leer antes de cambiar arquitectura)
- docs/PLAN_REFACTOR_AGENTE_MULTIAGENTE_RAG.md
- docs/PRD_PREAVISO.md

> Nota: si existe diferencia entre código actual y docs, priorizar:
> 1) PRD (reglas de negocio) 2) Plan refactor 3) Código actual (solo como “estado de implementación”).

---

## Objetivo general
Evolucionar el proyecto a una arquitectura donde:
- Backend es la fuente de verdad del dominio (expediente/preaviso/actos/roles/estado).
- La IA no se alimenta con prompts gigantes; usa RAG (document chunks + knowledge chunks) y contexto mínimo.
- El frontend queda como thin client: UI, navegación, validaciones UX y edición visual, pero SIN decisiones jurídicas ni prompt-building.

---

## Reglas no negociables del dominio (PRD)
1) Un Pre-Aviso NO puede existir sin Expediente del Comprador (aggregate root).
2) IA = asistente. Nada extraído o generado por IA se considera definitivo sin revisión humana.
3) Versionado/auditoría: cada documento generado debe guardar metadata (usuario/fecha/versión) y ser reproducible.

---

## Mandato de arquitectura: Backend as Source of Truth (migración gradual)
### Se mueve al backend (obligatorio)
- Dominio y reglas: state machine, actos/roles, validaciones de negocio.
- Persistencia del wizard: guardado incremental por paso.
- IA: extracción/generación, context building, retries, logs.
- Generación de documentos: JSON → plantilla (docx) y PDF + versionado.

### Se queda en frontend (obligatorio)
- UI: wizard, formularios, progreso, previews.
- Estado de pantalla/UX: loading, step actual, validaciones visuales.
- Edición final como UI (pero persistencia vía API).

### Prohibiciones
- El frontend NO construye prompts completos (no concatena documentos + chat history).
- El chat NO modifica el estado del trámite directamente sin pasar por el Domain Service.
- Evitar “big-bang refactor”: siempre PRs pequeños y verificables.

---

## Capas (target)
UI (Next) → API (routes) → Domain Service → AI Service → Data Layer (Supabase)
- Domain Service: única autoridad para mutar estado del trámite.
- AI Service: context-builder + agentes (extraction/embedding/retrieval).
- Data Layer: repositorios/migraciones; el estado del trámite vive en tablas, no “en el prompt”.

---

## Estrategia de trabajo (para no saturar la IA)
- PR por fase / slice pequeño.
- Evitar PRs “gigantes” con cambios cruzados de UI + dominio + IA.
- Cada PR debe incluir:
  - objetivo claro
  - criterio verificable (test, endpoint, métrica, migración, ejemplo)
  - notas de diseño si cambia contratos/DB

---

## Plan de ejecución (7 fases)
### Fase 0 — Baseline (observabilidad y documentación)
Objetivo:
- Medir tokens/latencia actuales.
- Documentar flujo actual de wizard/chat/generación docs.
Entregables:
- scripts/ o docs/ con métricas y cómo reproducir.

### Fase 1 — Backend Parity (NUEVA, obligatoria antes de RAG/Agentes)
Objetivo:
- Lograr “feature parity”: que el sistema funcione igual que hoy, pero con backend como fuente de verdad.
Alcance:
- Centralizar mutaciones del preaviso (state machine, actos/roles, validaciones).
- API endpoints para:
  - create/select expediente
  - create preaviso dentro de expediente
  - patch/save por paso del wizard
  - generate document + versionado
Criterio de éxito:
- UI se mantiene casi igual, pero deja de decidir reglas de negocio.
- No hay regressions visibles en wizard/doc generation.

### Fase 2 — Knowledge Chunks + Prompt Minimization
Objetivo:
- Reducir tokens moviendo reglas/guías a knowledge_chunks.
Reglas:
- prompts mínimos; reglas no hardcodeadas en código cuando aplican a negocio.
Requisito:
- Versionar/snapshot de knowledge usado al generar documentos (reproducibilidad).

### Fase 3 — Extraction Agent (schema + plugin)
Objetivo:
- Extraer `structured` desde documentos a través de un procesador genérico + schema por plugin.
Entregables:
- ExtractionAgent + contratos de salida JSON validados.

### Fase 4 — Embeddings + Document Text Chunks
Objetivo:
- Indexar `raw_content` en `documento_text_chunks` + embeddings para retrieval.
Reglas:
- Pipeline adaptativo: si PDF trae texto real, usar text-first; fallback a OCR/Vision si no.

### Fase 5 — RetrievalResponseAgent + Context Builder
Objetivo:
- Responder chat con RAG: estado del trámite + topK doc chunks + topK knowledge chunks + últimos N mensajes.
Reglas:
- El Context Builder es explícito y testeable (evitar prompts inflados otra vez).

### Fase 6 — Multi-Agent Routing (orquestación)
Objetivo:
- Router que decide qué agente usar (extract vs update-state vs Q&A vs doc generation).
Reglas:
- Registrar decisiones y outputs en logs/auditoría.

### Fase 7 — Plugin Abstraction (escalabilidad a nuevos trámites)
Objetivo:
- Formalizar plugins (Preaviso, Preventivo, Escritura, etc.) sin duplicar agentes.
Reglas:
- Reusar framework de extracción + retrieval; cambiar sólo schemas y reglas.

---

## Normas de BD / auditoría
- Todas las tablas nuevas deben venir con migración.
- Guardar:
  - progreso del wizard (estado estructurado del trámite)
  - documentos subidos (metadatos)
  - logs de IA (tipo operación, timestamp, éxito/error)
- Nunca persistir API keys/tokens.
- Snapshot/versionado de knowledge/rules usados al generar un documento.

---

## Guidelines de implementación
- Preferir “mover sin cambiar comportamiento” en Fase 1.
- Separar parser (estructura) vs reglas legales (decisión).
- Validar estrictamente JSON de IA; retries en caso inválido.
- Mantener UI contract estable mientras se migra al backend.

---

## PR Checklist (obligatorio)
- [ ] Objetivo del PR + fase a la que pertenece
- [ ] Cambios acotados (no mezclar fases)
- [ ] Migraciones incluidas si aplica
- [ ] Tests / verificación / ejemplo reproducible
- [ ] Nota breve si cambian contratos (API/DB)
