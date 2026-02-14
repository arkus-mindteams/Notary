# Plan de Performance: Pipeline de Documentos Preaviso (2026-02-13)

## 1) Problema actual (evidencia)
- El frontend hace trabajo pesado antes de responder: convierte PDF completo a imagen por pagina en browser y solo despues inicia procesamiento IA (`components/preaviso-chat.tsx:1873`, `components/preaviso-chat.tsx:1885`, `lib/ocr-client.ts:79`, `lib/ocr-client.ts:134`).
- Cada pagina espera un endpoint bloqueante de hasta 120s (`components/preaviso-chat.tsx:2725`, `components/preaviso-chat.tsx:2729`), y luego dispara mas llamadas por pagina (upload, extract, OCR cache) (`components/preaviso-chat.tsx:2497`, `components/preaviso-chat.tsx:2526`, `components/preaviso-chat.tsx:2604`).
- En backend, `preaviso-process-document` hace en la misma request: extraccion Vision, mutacion contexto, guardado documento, link session, logging y ademas indexacion chunks+embeddings (`app/api/ai/preaviso-process-document/route.ts:140`, `app/api/ai/preaviso-process-document/route.ts:161`, `app/api/ai/preaviso-process-document/route.ts:210`, `app/api/ai/preaviso-process-document/route.ts:232`).
- La indexacion es secuencial por chunk: 1 llamada de embeddings por chunk + insert por chunk (`lib/services/documento-service.ts:437`, `lib/services/documento-service.ts:439`, `lib/services/documento-service.ts:454`).
- Para inscripcion hay doble pase LLM (extract + folios), incrementando latencia por pagina (`lib/tramites/plugins/preaviso/document-processor.ts:53`, `lib/tramites/plugins/preaviso/document-processor.ts:82`).
- No hay metricas de duracion por etapa persistidas; `activity_logs` registra evento pero no `duration_ms` estandar (`supabase/migrations/048_consolidate_logging_tables.sql:25`, `supabase/migrations/048_consolidate_logging_tables.sql:28`).

## 2) Decision recomendada (sin big-bang)
- Mantener extraccion juridica en backend (Fase 3), pero desacoplar indexacion pesada a procesamiento diferido.
- Introducir cola server-side de `document_processing_jobs` por documento/pagina con estado:
  - `queued`, `processing_extract`, `processed_extract`, `processing_index`, `completed`, `failed`, `canceled`.
- Definir sincronia:
  - Sincrono (respuesta inicial <5s): validar request, registrar job, devolver `job_id`, estado inicial y `trace_id`.
  - Asincrono: Vision extraction, second pass folios, embeddings/chunks, escrituras auxiliares.
  - Semisincrono opcional: para docs pequenos, devolver `preview` minima (`documentType`, flags) sin esperar indexacion.
- Mantener contratos actuales inicialmente; agregar endpoint batch/status y luego migrar FE a no bloquear.

## 3) Flujo objetivo
1. FE sube archivo (o lote) y recibe `job_id` inmediato.
2. Worker backend procesa extraccion (Fase 3), persiste resultado y comandos.
3. Worker actualiza estado de job y emite logs por etapa con `duration_ms`.
4. Indexacion embeddings/chunks corre como sub-etapa diferida del mismo job.
5. FE consulta `/status` (polling corto) y actualiza progreso por documento/pagina sin bloquear chat.

## 4) Concurrencia y backpressure
- Limite por usuario/sesion: max N jobs activos (ej. 2 docs y 1 inscripcion en paralelo).
- Limite global worker para OpenAI/Textract.
- Reintentos con jitter solo para errores transitorios (429/5xx/red), no para validaciones.
- Timeouts por etapa:
  - extract vision: 45s
  - second pass folios: 20s
  - embeddings por chunk: 10s
- Cancelacion: endpoint `POST /jobs/:id/cancel`; worker respeta bandera antes de cada etapa.

## 5) Plan por PRs pequenos

| PR | Objetivo | Capas | Validacion | Rollback |
|---|---|---|---|---|
| PR-0 | Baseline de latencia por etapa (sin cambiar flujo) | API + Data | script con P50/P95 de logs por etapa | desactivar nuevo logging |
| PR-1 | Tabla `document_processing_jobs` + repositorio + estados | Data + Service | tests unitarios de transiciones estado | migracion down + feature flag off |
| PR-2 | Endpoint async submit/status/cancel (sin tocar pipeline legacy) | API + Service | tests API contrato/error v1 + auth | mantener endpoint legacy como default |
| PR-3 | Worker interno para extraer (Fase 3) y persistir resultado | API + AI + Service | test integration: queued->completed + trace_id | feature flag vuelve a sync legacy |
| PR-4 | Mover indexacion embeddings a sub-etapa diferida | AI + Data | test: extraction disponible antes de index final | fallback a index sync en flag |
| PR-5 | FE minimo: usar submit/status y progreso por documento | UI + API | e2e upload lote, chat no bloqueado | toggle a flujo viejo |
| PR-6 | Hardening: limites, retries, cancelacion real, metricas dashboard | API + Service + Data | carga concurrente reproducible + sin timeouts masivos | flags de concurrencia a valores previos |

Regla stop condition: si un PR toca >3 capas, dividir.

## 6) Metricas objetivo
- Tiempo a primer feedback UI: < 5s.
- Tiempo de request bloqueante principal: de 30-40s a < 3s (submit async).
- Throughput de lote (10 docs/paginas mixtas): mejora >= 35% tiempo total.
- Error rate por timeout en procesamiento: < 2%.
- Chat usable durante procesamiento: sin bloqueo de input/UI.

## 7) Riesgos y mitigaciones
- Riesgo precision juridica por asincronia.
  - Mitigacion: estado explicito `processed_extract` antes de usar datos en dominio; revision humana obligatoria.
- Riesgo inconsistencias estado tramite.
  - Mitigacion: mutaciones pasan por Domain Service; idempotencia por `job_id + file_hash`.
- Riesgo costo IA por reintentos.
  - Mitigacion: politicas de retry solo transitorias + budget por usuario/sesion.
- Riesgo ruptura contratos actuales.
  - Mitigacion: dual-run con feature flag y endpoints legacy intactos hasta paridad.

## 8) Decisiones pendientes
- Tecnologia de cola (Supabase table polling vs Upstash/Redis queue).
- Modelo de update en FE (polling corto vs SSE).
- Politica exacta de concurrencia por tipo de documento (inscripcion mas estricta).
- Si embeddings diferidos deben bloquear o no ciertas respuestas RAG en chat.
