# Arquitectura GMI Chat Híbrida (Estado + Captura Oportunista)

## 1) Objetivo
Documentar la arquitectura actual del chat de preaviso con Gemini para que nuevas AI/agentes entiendan rápido:
- qué componentes orquestan el flujo,
- dónde vive la autoridad de reglas,
- cómo se resuelven respuestas cortas y mensajes multi-campo,
- y cómo se evita romper la state machine.

---

## 2) Componentes clave
- `app/api/ai/chat-gmi/route.ts`
  - Orquestador HTTP del chat GMI.
  - Carga contexto (`tramiteData`, `stateSnapshot`, historial reciente).
  - Ejecuta Short Answer Router y/o captura general.
  - Hace commit vía dominio y construye respuesta UX.

- `lib/ai/routing/gmi-independent-capture-flow.ts`
  - Motor de captura GMI.
  - Tiene:
    - extracción dirigida por `required_missing`,
    - captura oportunista multi-campo,
    - short-answer routing semántico + camino determinista.

- `PreavisoProposedUpdateService.commit` (dominio)
  - Autoridad final para aplicar cambios.
  - Valida paths permitidos, reglas de negocio y consistencia.

- `computePreavisoState` (vía snapshot/plugin state service)
  - Recalcula `required_missing`, `blocking_reasons`, `wizard_state`.
  - Define prioridad de UX (qué preguntar después).

---

## 3) Principio operativo
`required_missing` **no bloquea extracción global**; guía prioridad UX.

Modelo híbrido:
1. **Targeted capture**: responde a preguntas activas (short answers o dato puntual).
2. **Opportunistic capture**: aprovecha mensajes/documentos con 1..N datos en cualquier orden.
3. **Commit de dominio**: valida/aplica.
4. **Recalibración de estado**: determina lo siguiente del wizard.

---

## 4) Flujo por turno (chat GMI)
1. `route.ts` valida request y permisos.
2. Carga:
   - `tramiteData`
   - `stateSnapshot` (incluye `required_missing`)
   - últimos mensajes de chat (`chat_messages`, con `metadata` y `created_at`).
3. Construye `candidate_slots`:
   - preguntas abiertas recientes (`actions.request_missing_field`),
   - `required_missing` actuales,
   - slots globales cortos permitidos (estado civil, tipo_persona, crédito/contado, hipoteca sí/no).
4. Si el mensaje parece short-answer y hay slots:
   - ejecuta `routeShortAnswer`.
   - outcomes: `applied`, `clarify`, o `fallback`.
5. Si `fallback`, ejecuta `gmiCapture.process(...)` (captura general).
6. Si hay `proposed_updates`, hace commit en dominio.
7. Recalcula estado y genera guidance UX (`next_questions`) con lenguaje humano.
8. Persiste mensajes user/assistant con metadata y `trace_id`.

---

## 5) Short Answer Router (actual)
### Entrada
- mensaje usuario
- `candidate_slots` acotados por allowlist de paths

### Salida
- `applied`: un update concreto (1 slot)
- `clarify`: pregunta enfocada (máx 1-2 opciones)
- `fallback`: pasa al flujo general

### Comportamientos importantes
- Camino determinista si:
  - hay un solo slot abierto compatible, o
  - entre varios abiertos solo uno normaliza correctamente.
- Evita heurísticas rígidas por palabra como estrategia principal.
- Nunca inventa paths fuera de la allowlist.

---

## 6) Captura oportunista
`inferHeuristicUpdates(...)` y extracción estructurada permiten tomar varios campos cuando el mensaje trae paquete completo (folio, comprador, gravamen, etc.).

Regla:
- Se captura cualquier campo permitido por dominio con señal suficiente.
- El commit decide si aplica.

---

## 7) Autoridad de dominio y estado
- **Domain commit**:
  - filtra paths no permitidos,
  - evita commits inválidos,
  - protege invariantes.
- **State machine**:
  - mantiene orden canónico del wizard,
  - aunque los datos lleguen en orden arbitrario.

---

## 8) UX y lenguaje de usuario final
Se evita exponer paths técnicos (`compradores[]`, `vendedores[]`, etc.) en:
- preguntas de faltantes,
- mensajes de error de extracción.

Se usa mapeo a etiquetas de negocio:
- “Indica quién es el comprador”
- “Indica el nombre completo del cónyuge del comprador”
- etc.

---

## 9) Observabilidad
Logs de short-router (en `route.ts`):
- `short_answer_detected`
- `candidate_slots_count`
- slots resumidos (`slot_id/path/source`)
- `router_outcome`
- `router_selected_slot_id`
- `router_confidence`
- `alternatives` (si ambigüedad)

Esto permite depurar por `trace_id` sin revisar prompts completos.

---

## 10) Reglas para futuras AI/agents
Si se extiende el sistema:
1. No saltarse `PreavisoProposedUpdateService.commit`.
2. No mutar estado directo desde frontend/chat.
3. Mantener `required_missing` como prioridad UX, no como filtro duro de extracción.
4. Mantener textos de UX sin paths internos.
5. Agregar tests cuando se introduzca nuevo slot corto o nueva semántica documental.

---

## 11) Pruebas base recomendadas (mínimas)
- Respuesta corta inequívoca (ej. `casado`) con pregunta abierta activa.
- Respuesta corta ambigua (ej. `sí`) con dos preguntas sí/no abiertas.
- Mensaje sin slots abiertos (debe ir al flujo general).
- Caso de nombre con acentos para comprador/cónyuge.
- Verificación de que UX no muestra `compradores[]`/`vendedores[]`.


---

## 12) Sectioner determinista (nuevo)
Se agrega una etapa determinista para mensajes largos/multi-campo:

`normalizeForDetection(raw) -> sectionizeMessage(raw) -> extractores por seccion -> eventos -> compiler -> proposed_updates`

### 12.1 Objetivo
- Evitar perdida de entidades cuando el usuario pega un bloque completo.
- Evitar que `inmueble.direccion.calle` se vuelva un catch-all.
- Permitir extraer comprador/vendedor/credito/gravamen/inmueble sin depender de LLM.

### 12.2 Normalizacion de deteccion
`normalizeForDetection(raw)` se usa solo para detectar patrones:
- lowercase
- sin acentos
- espacios colapsados

Los valores persistidos se toman del `raw` (no del texto normalizado).

### 12.3 Algoritmo de `sectionizeMessage(raw)`
1. Detecta marcadores semanticos por regex (comprador, vendedor, credito, gravamen, hipoteca, folio real, partida, direccion, etc.).
2. Ordena los marcadores por offset de aparicion.
3. Corta spans `[start,end)` y tipa cada span:
   - `buyer`
   - `seller`
   - `credito`
   - `gravamen`
   - `inmueble`
   - `unknown`
4. Si no hay marcadores, devuelve una sola seccion `unknown`.

Salida canonica:
`Array<{ type, start, end, raw, norm }>`

### 12.4 Extractores deterministas por seccion
- `buyer`: `ANSWER_BUYER_TEXT`, `ANSWER_BUYER_TYPE`, `ANSWER_SPOUSE_TEXT`
- `seller`: `ANSWER_SELLER_TEXT`, `ANSWER_SELLER_TYPE`
- `inmueble`: `ANSWER_FOLIO_REAL`, `ANSWER_PARTIDA`, `ANSWER_ADDRESS_TEXT`
- `credito`: `ANSWER_PAYMENT_MODE`, `ANSWER_CREDIT_INSTITUTION_TEXT`
- `gravamen`: `ANSWER_GRAVAMEN_EXISTS`, `ANSWER_GRAVAMEN_INSTITUTION_TEXT`, `ANSWER_GRAVAMEN_CANCELACION_CONFIRMADA`

Los eventos se deduplican por tipo + payload normalizado.

### 12.5 Anti-greedy de direccion
- Se bloquea mapear calle con input completo cuando:
  - hay marcadores semanticos de otros campos, o
  - texto muy largo.
- Si hay marcador de corte, se usa solo el prefijo de direccion seguro.
- Se limpia cola de transicion (ej. `se tiene un`) antes de persistir.

### 12.6 Integracion en `route.ts`
- El event router puede forzarse por:
  - `required_missing` relevante, o
  - marcadores semanticos.
- Si hay eventos compilados (`updates_compiled_count > 0`), se intentan antes del fallback heuristico.
- Si el usuario pregunta faltantes (`ASK_MISSING`), no se intenta commit y se devuelve guidance.

### 12.7 Observabilidad minima por turno
`routing_diagnostics` incluye:
- `router_ran`
- `sections_detected` (solo type/start/end/length, sin texto)
- `events_detected`
- `updates_compiled_count`
- `blocked_calle_reason`
- `credito_events_count`
- `gravamen_events_count`
- `yesno_events_count`
- `commit_result` (`applied|rejected|skipped_no_updates`)
- `commit_reject_reason`

### 12.8 Invariante de seguridad
El sectioner y el compiler proponen cambios, pero la autoridad final sigue siendo:
`PreavisoProposedUpdateService.commit`.
