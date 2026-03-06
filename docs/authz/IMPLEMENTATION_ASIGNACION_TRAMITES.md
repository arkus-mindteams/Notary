# Flujo de implementación – Asignación de expedientes/trámites a asistentes

Objetivo: que el **abogado** pueda **asignar expedientes (trámites) concretos** a sus **asistentes asignados**. La visibilidad del asistente pasa de “todos los trámites del abogado” a “solo los trámites que el abogado le ha asignado”.

Checklist de implementación paso a paso, alineado con el estilo de `IMPLEMENTATION_CHECKLIST.md`. **Estado:** Pasos 0–4 implementados; QA documentado en `QA_CHECKLIST.md` (sección 7 y ítem 6.5).

---

## Estado actual vs objetivo

| Aspecto | Hoy | Después |
|--------|-----|---------|
| Visibilidad asistente | Ve **todos** los trámites de los abogados a los que está vinculado en `usuarios_supports_lawyer`. | Verá **solo** los trámites que cada abogado le haya asignado explícitamente. |
| Asignación | No existe; la relación es solo abogado ↔ asistente (N:M). | Existirá asignación trámite ↔ asistente (por trámite, el abogado dueño asigna a uno o más asistentes). |
| Quién asigna | — | Solo el **abogado dueño** del trámite (`tramites.user_id`), y solo a asistentes que lo tienen en `usuarios_supports_lawyer`. |

---

## Paso 0 – Migración BD (tabla de asignaciones)

### 0.1 Tabla `tramite_asignaciones`

- [x] Crear migración (p. ej. `067_tramite_asignaciones.sql`).

**Campos:**

- `id` (uuid, PK)
- `tramite_id` (uuid, FK a `tramites`, ON DELETE CASCADE)
- `assistant_id` (uuid, FK a `usuarios`)
- `lawyer_id` (uuid, FK a `usuarios`) — dueño del trámite; redundante pero útil para índices y validaciones
- `notaria_id` (uuid, FK a `notarias`) — mismo fin
- `created_at` (timestamptz)
- Opcional: `removed_at` (timestamptz) para soft delete, o borrado físico

**Constraints / índices:**

- UNIQUE `(tramite_id, assistant_id)` — un asistente asignado una vez por trámite
- CHECK: solo se insertan asignaciones donde el trámite pertenece a `lawyer_id` y asistente está en `usuarios_supports_lawyer` con ese lawyer (validación en aplicación; opcional CHECK en BD si se quiere)
- Índices: `tramite_id`, `assistant_id`, `(lawyer_id, notaria_id)`, `created_at`

**Implementado:** Migración `067_tramite_asignaciones.sql`: tabla `tramite_asignaciones` con `tramite_id`, `assistant_id`, `lawyer_id`, `notaria_id`, `created_at`; UNIQUE `(tramite_id, assistant_id)`; índices en `tramite_id`, `assistant_id`, `(lawyer_id, notaria_id)`, `created_at DESC`. Validación lawyer–assistant (supports_lawyer) se hace en aplicación (Paso 1).

**DoD Paso 0:** La BD tiene la tabla de asignaciones sin romper consultas ni migraciones existentes.

---

## Paso 1 – Backend: servicio y ReBAC

### 1.1 Servicio de asignaciones

- [x] Crear `lib/services/tramite-asignacion-service.ts` (o nombre equivalente).

**Funciones:**

- `listAsignacionesPorTramite(tramiteId: string)` → asignaciones activas del trámite (assistant_id, created_at, datos mínimos del asistente si se desea).
- `listTramitesAsignadosAAsistente(assistantId: string, notariaId: string)` → trámites asignados a ese asistente en esa notaría (para ReBAC).
- `asignarTramiteAAasistente(tramiteId, assistantId, lawyerId, notariaId)` → crea asignación; lanza si ya existe (CONFLICT) o si no se cumple la relación lawyer–assistant (FORBIDDEN/NOT_FOUND).
- `quitarAsignacion(tramiteId: string, assistantId: string)` → borrado físico en `tramite_asignaciones`.

Validaciones en servicio:

- El trámite existe y `tramites.user_id = lawyerId`.
- El lawyer y el asistente pertenecen a `notariaId` (vía `usuarios.notaria_id`).
- Existe relación activa en `usuarios_supports_lawyer` entre `lawyerId` y `assistantId` (misma notaría).

**Implementado:** `lib/services/tramite-asignacion-service.ts` con `AsignacionItem`, `listAsignacionesPorTramite`, `listTramitesAsignadosAAsistente`, `asignarTramiteAAasistente`, `quitarAsignacion`. Usa `TramiteService.findTramiteById` y `findActiveRelation` de supports-lawyer-service.

### 1.2 Actualizar ReBAC

- [x] En `lib/authz/rebac.ts`:

**Rol ASISTENTE:**

- **`listVisibleCases(ctx)`:** Usa `listTramitesAsignadosAAsistente(ctx.userId, ctx.notaryOfficeId)` — solo trámites en `tramite_asignaciones` con `assistant_id = ctx.userId` y `notaria_id = ctx.notaryOfficeId`.
- **`canReadCase(ctx, caseId)`:** Consulta `tramite_asignaciones` por `tramite_id = caseId` y `assistant_id = ctx.userId`; devuelve true si existe fila y su `notaria_id` coincide con `ctx.notaryOfficeId`.

**DoD Paso 1:** El asistente solo ve trámites asignados; el servicio de asignaciones valida lawyer–assistant–notaría y evita duplicados.

---

## Paso 2 – APIs (abogado asigna / desasigna)

### 2.1 Contratos

- [x] Documentar en `docs/authz/API_CONTRACTS.md` (o en un anexo de este doc) los endpoints siguientes.

**GET** `/api/expedientes/tramites/[tramiteId]/asignaciones`

- **Quién:** Usuario con permiso de lectura sobre el trámite (`canReadCase`: dueño abogado o notario).
- **Respuesta:** Lista de asignaciones del trámite (assistant_id, email/nombre del asistente, created_at).
- **Errores:** 404 si el trámite no existe o el usuario no puede leerlo.

**POST** `/api/expedientes/tramites/[tramiteId]/asignaciones`

- **Body:** `{ "assistant_id": "uuid" }`
- **Quién:** Solo el **abogado dueño** del trámite (`tramites.user_id = ctx.userId`).
- **Validación:** El asistente debe estar en `usuarios_supports_lawyer` con ese abogado (y misma notaría).
- **Respuesta:** 201 y el registro de asignación creado.
- **Errores:** 403 si no es dueño; 400 si assistant_id falta; 404 si trámite no existe; 409 si ya asignado.

**DELETE** `/api/expedientes/tramites/[tramiteId]/asignaciones/[assistantId]`

- **Quién:** Solo el **abogado dueño** del trámite.
- **Efecto:** Quitar la asignación de ese asistente a ese trámite.
- **Errores:** 403 si no es dueño; 404 si no hay asignación o trámite.

**Implementado:** Contratos en `API_CONTRACTS.md` sección 6; rutas en `app/api/expedientes/tramites/[id]/asignaciones/route.ts` (GET, POST) y `[id]/asignaciones/[assistantId]/route.ts` (DELETE).

### 2.2 Capabilities

- [x] No se añade capability nueva; se valida en ruta: GET con `canReadCase`, POST/DELETE comprobando `tramites.user_id === ctx.userId`.

### 2.3 Auditoría

- [x] En `lib/services/audit-log-service.ts` se añadieron acciones `TRAMITE_ASSIGNED_TO_ASSISTANT` y `TRAMITE_UNASSIGNED_FROM_ASSISTANT`. POST y DELETE registran en `audit_logs` con entity_type `tramites`, entity_id tramite_id, metadata lawyer_id, assistant_id, notaria_id.

**DoD Paso 2:** Las tres operaciones (listar, asignar, quitar) están implementadas, validadas por dueño y relación supports, y auditadas.

---

## Paso 3 – Frontend (UI para el abogado)

- [x] **Vista desde la que se asigna:** Expedientes / detalle de trámite (o lista con acción por trámite). El abogado solo ve sus propios trámites (ya resuelto por ReBAC/rol).
- [x] **Listar asignaciones:** En la vista del trámite, sección “Asignado a” (o similar) que llame a `GET .../tramites/[id]/asignaciones` y muestre la lista de asistentes asignados.
- [x] **Asignar:** Control (p. ej. desplegable o modal) con lista de **asistentes** que el abogado tiene en `usuarios_supports_lawyer` (y que aún no estén asignados a este trámite). Al elegir uno, `POST .../tramites/[id]/asignaciones` con `{ assistant_id }`.
- [x] **Quitar asignación:** Junto a cada asistente asignado, botón “Quitar” que llame a `DELETE .../tramites/[id]/asignaciones/[assistantId]`.
- [x] Manejo de errores según `API_CONTRACTS` (403, 404, 422 con mensaje claro).

**Implementado:** Componente `components/tramite-asignaciones.tsx`; integrado en `components/tramites-list.tsx` dentro del bloque expandido de cada trámite. Solo se muestra a usuarios con rol `abogado` o `notario`; asignar/quitar solo cuando el usuario es el dueño del trámite. Endpoint auxiliar `GET /api/expedientes/tramites/[id]/asistentes-para-asignar` para el desplegable del dueño.

**DoD Paso 3:** El abogado puede, desde la UI de expedientes/trámite, asignar y desasignar asistentes; la lista de asignados se actualiza correctamente.

---

## Paso 4 – QA y documentación

- [x] Actualizar `docs/authz/QA_CHECKLIST.md` con ítems para:
  - Asistente sin asignaciones no ve trámites de ese abogado (ítem 7.1).
  - Asistente con asignación ve solo los trámites asignados (lista y detalle) (ítem 7.2).
  - Abogado solo puede asignar sus propios trámites y solo a sus asistentes (supports_lawyer) (ítem 7.3).
  - Notaría: no cruce de tenant (asignaciones y visibilidad respetan notaria_id) (ítem 7.4).
- [ ] Opcional: tests unitarios o de integración para el servicio de asignaciones y para ReBAC (asistente con/sin asignaciones).
- [x] Flujo documentado: sección 7 “Asignación de trámites a asistentes” en `QA_CHECKLIST.md`; ítem 6.5 para auditoría de asignaciones; referencia en resumen de ejecución (sección 8).

**DoD Paso 4:** QA documentado en `QA_CHECKLIST.md`; comportamiento alineado con este flujo. Ejecución manual según checklist cuando se valide en entorno.

---

## Resumen de orden recomendado

1. **Paso 0:** Migración con tabla `tramite_asignaciones`.
2. **Paso 1:** Servicio de asignaciones + cambio de ReBAC (asistente solo ve asignados).
3. **Paso 2:** APIs GET/POST/DELETE de asignaciones + auditoría.
4. **Paso 3:** UI para el abogado (listar, asignar, quitar).
5. **Paso 4:** QA y documentación.

---

## Referencias

- **ReBAC actual:** `lib/authz/rebac.ts` (visibilidad por rol y `usuarios_supports_lawyer`).
- **Supports lawyer:** `lib/services/supports-lawyer-service.ts`, `app/api/admin/abogados/[lawyerId]/asistentes`.
- **Contratos y errores:** `docs/authz/API_CONTRACTS.md`, `AGENTS.md` (error shape).
- **Expedientes/trámites:** `app/api/expedientes/tramites`, `lib/services/tramite-service.ts`.
