# AGENTS.md - Notary (Guia Tecnica Operativa)

## 1) Proposito
Este archivo define como trabajar el repositorio sin romper producto, evitando refactors grandes y manteniendo trazabilidad.

## 2) Fuentes de verdad
Orden de prioridad cuando hay conflicto:
1. Reglas de negocio productivas (PRD vigente + comportamiento esperado por usuarios)
2. Contratos tecnicos ya desplegados (API/DB)
3. Plan de refactor
4. Codigo actual como estado de implementacion (puede contener deuda tecnica)

Documentos de referencia:
- `docs/PRD_PREAVISO.md`
- `docs/PLAN_REFACTOR_AGENTE_MULTIAGENTE_RAG.md`

## 3) Invariantes de dominio (no negociables)
1. Un preaviso pertenece a un expediente/tramite; no debe existir estado huerfano.
2. La IA asiste: ninguna salida de IA se considera definitiva sin revision humana.
3. Todo documento generado o extraido debe ser auditable y reproducible (usuario, timestamp, version, modelo/prompt cuando aplique).

## 4) Arquitectura objetivo (sin big-bang)
Flujo objetivo:
`UI (Next) -> API routes -> Domain services -> AI services -> Data layer (Supabase)`

Reglas:
- Mutaciones del tramite: solo backend/domain service.
- Frontend: UX, captura, visualizacion, progreso, validaciones visuales.
- Persistencia de estado de wizard: backend por paso.
- RAG/embeddings: capa AI/Data, sin mezclar reglas legales en prompts.
- En chat y consultas sobre documentos, priorizar respuesta con contexto recuperado por RAG (estado + evidencia documental + knowledge chunks), no con historial crudo completo.

## 5) Convenciones por capas/rutas
- `app/**`, `components/**`: UI y wiring. No reglas legales.
- `app/api/**`: contratos HTTP, auth, validacion de entrada/salida, orchestration ligera.
- `lib/**` (o `src/**` equivalente):
  - `domain/` o servicios de negocio: reglas, invariantes, state machine.
  - `ai/`: extraccion, retries, parse/validate JSON, retrieval, logs IA.
  - `services/` y `data/`: acceso a Supabase/almacenamiento, repositorios, auditoria.
- `supabase/migrations/**`: cambios de esquema (siempre con migracion).
- `tests/**`: pruebas unitarias/integracion/e2e.

Nota: el repo usa mucho `lib/**`; no hacer reestructuracion fisica masiva salvo PR dedicado.

## 6) Politica de cambios (PR small-slice)
Cada PR debe tener un unico objetivo verificable.

Este repositorio ya no usa ejecucion por fases. El trabajo se organiza por scope funcional (incidentes, mejoras puntuales y nuevos features), siempre en slices pequenos y verificables.

Checklist minimo por PR:
- Objetivo y alcance claros
- Riesgo de regresion declarado
- Evidencia (test/build/lint o pasos reproducibles)
- Si cambia API/DB: ejemplo request/response o diff de migracion

Stop condition:
Si un cambio requiere tocar mas de 3 capas (UI/API/Domain/AI/Data), dividir en multiples PRs.

## 7) Pipeline IA recomendado para documentos escaneados
Problema esperado: PDFs imagen (sin text layer).

Pipeline recomendado:
1. Ingesta/OCR por documento (idealmente por pagina cuando haga falta evidencia)
2. Clasificacion de documento (`ine`, `comprobante_domicilio`, `estado_cuenta`, etc.)
3. Extraccion estructurada a schema del tramite (JSON validado)
4. Persistencia de evidencia y metadatos de extraccion
5. Indexado de chunks/resumen para retrieval (si aplica al scope del PR)

Reglas:
- No depender de un "resumen global" como unica fuente para decisiones legales.
- Mantener salida por documento con trazabilidad.
- `rawText` y/o resumen pueden indexarse para RAG, pero la mutacion de estado sigue en Domain Service.

## 7.1) Politica RAG (obligatoria)
- Objetivo: minimizar prompt bloat y mejorar trazabilidad de respuestas.
- Fuente de contexto para chat: `estado_tramite + topK documento_text_chunks + topK knowledge_chunks + ultimos N mensajes`.
- Todo chunk indexado debe conservar metadatos minimos: `documento_id`, `page_number` (si aplica), `chunk_index`, `trace_id/timestamp`.
- Respuestas del asistente deben basarse en evidencia recuperada; si no hay evidencia suficiente, pedir aclaracion o documento adicional.
- No permitir que RAG muta estado de tramite directamente: cualquier cambio estructural pasa por Domain Service.

## 8) Contrato de errores API (estandar)
Responder errores en formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Descripcion legible",
    "details": {},
    "trace_id": "uuid-opcional"
  }
}
```

Codigos sugeridos:
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `DOMAIN_RULE_VIOLATION` (422)
- `AI_OUTPUT_INVALID` (422/502)
- `INTERNAL_ERROR` (500)

Nunca exponer secretos, keys o stack traces en `message/details`.

## 9) Auditoria y seguridad de datos
Persistir al menos:
- estado/progreso del wizard
- metadatos de documentos
- logs de IA (operacion, modelo, status, timestamp)
- snapshot de conocimiento/contexto usado para generar documentos cuando aplique

Prohibido:
- persistir API keys/tokens
- mutar estado del tramite directamente desde chat/frontend sin servicio de dominio

## 10) Definicion de listo (DoD) transversal
Un cambio esta listo cuando:
1. Cumple objetivo funcional sin regresion visible
2. Tiene trazabilidad (logs y/o auditoria minima)
3. Contratos API/DB estan claros y versionados
4. Pruebas o verificacion reproducible ejecutadas

## 11) Roles internos (modo colaborativo)
- BackendAgent: dominio/API/AI/Data
- FrontendAgent: UX/wiring
- TestAgent: pruebas y regresion
- ReviewAgent: compliance con este AGENTS y riesgos

Orden recomendado: Backend -> Frontend -> Test -> Review.

## 12) Regla pragmatica final
Si hay conflicto entre "plan ideal" y "incidente/bug de produccion", se prioriza resolver el problema real del usuario sin romper invariantes de dominio ni auditoria.
