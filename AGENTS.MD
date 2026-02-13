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
- NO introducir RAG/embeddings (Fase 4/5) antes de completar Fase 1 (Backend Parity).

---

## Capas (target)
UI (Next) → API (routes) → Domain Service → AI Service → Data Layer (Supabase)
- Domain Service: única autoridad para mutar estado del trámite.
- AI Service: context-builder + agentes (extraction/embedding/retrieval).
- Data Layer: repositorios/migraciones; el estado del trámite vive en tablas, no “en el prompt”.

---

## Ownership por carpeta (matriz rápida)
| Ruta / Capa | Dueño principal | Puede tocar | No debe decidir |
|---|---|---|---|
| `app/**`, `components/**` | FrontendAgent | UI, navegación, validaciones UX, wiring con API | Reglas legales, state machine, prompts completos |
| `app/api/**` o `src/api/**` | BackendAgent | Endpoints, validación de entrada/salida, authz | Lógica de pantalla/UX |
| `src/domain/**` | BackendAgent | Reglas de negocio, state machine, invariantes | Render/UI, detalles de proveedor IA |
| `src/ai/**` | BackendAgent | Orquestación IA, context builder, retries, parse/validate JSON, logs IA | Decisiones de negocio (usar Domain Service) |
| `supabase/migrations/**`, `src/data/**` | BackendAgent | Esquema, repositorios, auditoría/versionado | Reglas de UI o prompts |
| `tests/**` | TestAgent | Unit/integration/e2e, fixtures, regresiones | Cambios de arquitectura fuera de alcance |

> Si una tarea cruza varias rutas, dividir en commits/PRs por fase y mantener un único objetivo verificable.
> Compatibilidad de rutas: si el repositorio usa `lib/**` en lugar de `src/**`, aplicar la misma separación lógica en `lib/` sin crear una reestructuración masiva.

---

## Estrategia de trabajo (para no saturar la IA)
- PR por fase / slice pequeño.
- Evitar PRs “gigantes” con cambios cruzados de UI + dominio + IA.
- Cada PR debe incluir:
  - objetivo claro
  - criterio verificable (test, endpoint, métrica, migración, ejemplo)
  - notas de diseño si cambia contratos/DB

### Stop Condition (anti-refactor masivo)
Si una tarea requiere modificar más de 3 capas (UI + API + Domain + AI + Data),
el agente debe detenerse y proponer dividir el trabajo en múltiples PRs.

---

## Plan de ejecución (8 fases: 0–7)
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
- Parity: mismo output/UX (salvo diferencias no semánticas); solo cambia dónde vive la lógica.

Definición operativa de "Parity" (obligatoria):
- Mismos pasos del wizard, mismo orden y mismas validaciones visibles para usuario.
- Misma estructura de documento de salida (diferencias permitidas: metadata no visible, ids, timestamps).
- Mismos errores de negocio esperables para entradas inválidas (aunque cambie el origen FE→BE).
- Estado persistido por paso y recuperable tras refresh/reingreso.
- Sin lógica legal en frontend para mutaciones de trámite.

Suite mínima de parity tests (Fase 1):
- Caso feliz end-to-end: expediente → preaviso → guardado por pasos → generación documento versionado.
- Caso inválido de negocio: transición no permitida por state machine.
- Caso de persistencia: retomar wizard desde estado guardado.
- Caso de auditoría: documento generado con `usuario`, `timestamp`, `version`.

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

## Definition of Done por fase (obligatorio)
### Fase 0
- Métricas baseline de tokens/latencia documentadas con fecha y comando/script de reproducción.
- Diagrama o descripción de flujo actual wizard/chat/doc generation.
- Riesgos iniciales y gaps de observabilidad listados.

### Fase 1
- Todas las mutaciones de trámite pasan por Domain Service.
- Endpoints de create/select expediente, create preaviso, patch por paso, generate+version operativos.
- Parity tests mínimos implementados y pasando.
- Sin regressions visibles en UX del wizard.
- El cálculo de pasos/estado del wizard debe salir del backend (Domain Service) y ser consistente para chat + UI

### Fase 2
- Knowledge chunks versionados e integrados en context building.
- Prompts reducidos y sin reglas de negocio hardcodeadas innecesarias.
- Snapshot de knowledge utilizado persistido por generación.

### Fase 3
- ExtractionAgent implementado con contrato JSON validado por schema.
- Reintentos y manejo de salida inválida cubiertos.
- Logs de extracción con éxito/error y causa.

### Fase 4
- Pipeline de chunks de documento (`documento_text_chunks`) funcionando.
- Estrategia text-first con fallback OCR/Vision implementada.
- Embeddings persistidos y recuperables para retrieval.

### Fase 5
- RetrievalResponseAgent usa estado + topK doc chunks + topK knowledge + últimos N mensajes.
- Context Builder explícito y testeable.
- Evidencia de reducción de prompt bloat vs baseline.

### Fase 6
- Router multiagente decide agente por intención/caso y registra decisiones.
- Logs de routing + outputs disponibles para auditoría.
- Casos ambiguos con fallback definido y testeado.

### Fase 7
- Interfaz de plugin documentada (schemas, reglas, hooks).
- Nuevo trámite se integra sin duplicar core de agentes.
- Tests de compatibilidad entre plugins (contratos comunes).

---

## Normas de BD / auditoría
- Todas las tablas nuevas deben venir con migración.
- Guardar:
  - progreso del wizard (estado estructurado del trámite)
  - documentos subidos (metadatos)
  - logs de IA (tipo operación, timestamp, éxito/error)
- Nunca persistir API keys/tokens.
- Snapshot/versionado de knowledge/rules usados al generar un documento.
  - Guardar: knowledge_chunk_ids, document_chunk_ids (si aplica), model, prompt_version/hash, timestamp, usuario.

---

## Guidelines de implementación
- Preferir “mover sin cambiar comportamiento” en Fase 1.
- Separar parser (estructura) vs reglas legales (decisión).
- Validar estrictamente JSON de IA; retries en caso inválido.
- Mantener UI contract estable mientras se migra al backend.
- No reorganizar estructura física de carpetas en Fase 1.
- Si el repo usa `lib/**`, implementar Domain/AI/Data dentro de `lib/` respetando separación lógica.
- Posponer reorganización de rutas físicas (`src/*`, etc.) a un PR dedicado.

---

## Contrato de errores API (v1)
Formato de error estándar para todos los endpoints:

```json
{
  "error": {
    "code": "DOMAIN_RULE_VIOLATION",
    "message": "Descripción legible para UI/logs",
    "details": {},
    "trace_id": "uuid-opcional"
  }
}
```

Códigos mínimos sugeridos:
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `DOMAIN_RULE_VIOLATION` (422)
- `AI_OUTPUT_INVALID` (502/422 según origen)
- `INTERNAL_ERROR` (500)

Regla:
- No filtrar secretos ni stack traces en `message`/`details`.

---

## Execution Priority (obligatorio)
- DEFAULT ROLE: `BackendAgent`.
- Toda tarea inicia como `BackendAgent`.
- `FrontendAgent` solo actúa cuando existan endpoints backend definidos (o contrato API explícito).
- `TestAgent` y `ReviewAgent` siempre se ejecutan al final.

---

## Agent Roles (Simulation Mode — para trabajar como “equipo”)
Al ejecutar cualquier tarea, la IA debe dividir el trabajo en roles internos y reportar resultados por rol.
NO son procesos paralelos, pero se deben seguir estas responsabilidades para evitar mezclar capas.

### BackendAgent
Responsabilidades:
- Implementar Domain Service y API routes backend-driven.
- Mover lógica de negocio desde frontend al backend.
- Mantener contratos y persistencia (Supabase) + migraciones.
Prohibido:
- Cambiar estilos/UI salvo lo mínimo para consumir endpoints.
- Construir prompts completos desde frontend.

### FrontendAgent
Responsabilidades:
- Mantener UX/UI igual y adaptar la UI a consumir endpoints del backend.
- Validaciones visuales/UX, navegación wizard, previews.
Prohibido:
- Implementar reglas legales o state machine en UI.
- Concatenar documentos + chat history para prompts.

### TestAgent
Responsabilidades:
- Añadir/actualizar tests/regresiones.
- Ejecutar lint/build/tests (o documentar comandos y resultados).
- Proponer casos límite.
Prohibido:
- Refactor de arquitectura fuera del alcance del PR.

### ReviewAgent
Responsabilidades:
- Revisar el diff y detectar violaciones a este AGENTS.md.
- Detectar prompt bloat, acoplamiento chat→dominio, y leakage de lógica al frontend.
- Confirmar que el PR corresponde a una sola fase.
Prohibido:
- Introducir features nuevas no solicitadas.

---

## Workflow recomendado por PR (para evitar saturación)
En cada PR, seguir este orden:
1) BackendAgent: implementar cambios core de la fase (mínimos, backend-first).
2) FrontendAgent: adaptar UI a consumir backend sin cambiar comportamiento.
3) TestAgent: agregar verificación (tests o pasos reproducibles).
4) ReviewAgent: revisión final del diff + checklist.

---

## PR Checklist (obligatorio)
- [ ] Objetivo del PR + fase a la que pertenece
- [ ] Cambios acotados (no mezclar fases)
- [ ] Migraciones incluidas si aplica
- [ ] Tests / verificación / ejemplo reproducible
- [ ] Nota breve si cambian contratos (API/DB)

## Evidencia mínima por PR (obligatorio)
- Comandos ejecutados (`lint`, `test`, `build`, e2e o equivalente).
- Resultado esperado vs resultado obtenido (breve, 3-6 líneas).
- Si cambia API/DB: ejemplo de request/response o diff de migración.
- Si afecta paridad UX: capturas o pasos de reproducción.
