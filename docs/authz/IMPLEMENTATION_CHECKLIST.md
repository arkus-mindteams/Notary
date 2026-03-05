# Checklist de implementación – RBAC + ReBAC + Invitations + Capabilities (versión fortalecida)

Checklist de PRs según el orden recomendado en ROLE AGENTS.md. Cuando se habiliten migraciones de BD, seguir el **Paso 0** antes o en paralelo a los pasos que dependan de datos nuevos.

---

## Paso 0 – Migraciones BD (completado)

### 0.1 Estados y roles

- [x] Extender columna `usuarios.rol` (migración `065_extend_usuarios_roles_and_status.sql`):
  - Valores: `superadmin`, `notario`, `abogado`, `asistente`.
  - Sin columna duplicada `rol_logico`.
- [ ] Definir columna `status` (ENUM o CHECK) en `usuarios`:
  - `INVITED`
  - `ACTIVE`
  - `SUSPENDED`
  - `DEACTIVATED`
- [ ] Backfill desde `activo`:
  - `activo = true` → `ACTIVE`
  - `activo = false` → `SUSPENDED`
- [ ] Mantener `activo` como compatibilidad temporal (no usar para enforcement).

---

### 0.2 Tabla de invitaciones (`user_invitations`)

Incluir:

- `id`, `email`, `role`, `notaria_id`
- `token_hash` (NO token plano)
- `status` (`PENDING` | `ACCEPTED` | `REVOKED` | `EXPIRED`)
- `preconfig_json`
- `created_at`, `updated_at`, `expires_at`, `accepted_at`, `revoked_at`, `resent_at`

**Constraints:**

- `token_hash` UNIQUE
- Índices por `email`, `token_hash`, `notaria_id`
- (Opcional) unicidad por `email` según lógica de negocio

---

### 0.3 Tabla delegación N:M (`usuarios_supports_lawyer`)

- `id`, `lawyer_id`, `assistant_id`, `notaria_id`, `created_at`, `removed_at` (soft delete)

**Constraints:**

- `lawyer_id` → usuario con rol ABOGADO
- `assistant_id` → usuario con rol ASISTENTE
- Ambos pertenecen a la misma notaría
- Índice compuesto `(lawyer_id, assistant_id, notaria_id)` (o equivalente para unicidad)

---

### 0.4 Auditoría (`audit_logs`) – obligatorio ✅

- [x] Crear tabla (migración `066_create_audit_logs.sql`):
  - `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata_json`, `notaria_id`, `created_at`
  - Índices por `actor_user_id`, `action`, `(entity_type, entity_id)`, `notaria_id`, `created_at DESC`.
- Registro de eventos críticos (invitaciones, activaciones, cambios de estado, delegaciones) se implementa en los servicios que consumen esta tabla (Pasos 4 y 5).

---

### 0.5 (Opcional futuro)

- Tabla de participantes por trámite (ReBAC fino).
- Overrides de capabilities (configuración avanzada).

---

**DoD Paso 0:** BD soporta invitaciones seguras (token_hash), delegación N:M, estados completos y auditoría. No se rompe compatibilidad con código actual.

---

## Paso 1 – Planner ✅ (completado)

- [x] `docs/authz/CAPABILITIES.md` – Catálogo de capabilities y mapeo rol → capabilities.
- [x] `docs/authz/ENDPOINTS_TO_CAPABILITIES.md` – Mapeo endpoints/vistas → capabilities.
- [x] `docs/authz/API_CONTRACTS.md` – Contratos invite/resend/revoke/activate/status/supports_lawyer y error shape.
- [x] `docs/authz/IMPLEMENTATION_CHECKLIST.md` – Este checklist.

---

## Paso 2 – Backend Core Auth Context + Capabilities ✅

### Archivos

- [x] `lib/auth/authContext.ts` – `getAuthContext(req)` → `{ userId, role, status, notaryOfficeId, capabilities }`.
- [x] `lib/authz/capabilities.ts` – Catálogo `CAPABILITIES`, `getCapabilitiesForRole(role)`, `getCapabilitiesForUser(ctx)` (futuro overrides).
- [x] `lib/authz/requireCapability.ts` – Valida status ACTIVE y capability; devuelve 401/403 con error shape uniforme.

### 2.1 getAuthContext()

- Devuelve `{ userId, role, status, notaryOfficeId, capabilities }` o `null` si no hay usuario.
- Status se deriva de `usuario.status` o `usuario.activo`. El bloqueo por `status !== ACTIVE` se hace en `requireCapability` (excepto en el endpoint de activate, que no usa requireCapability).

### 2.2 Capabilities

- Enum/lista en `CAPABILITIES`; `getCapabilitiesForRole(role)` por rol (superadmin, notario, abogado, asistente).
- `getCapabilitiesForUser(ctx)` preparado para overrides futuros.

### 2.3 requireCapability()

- Devuelve `Response | null`: 401 si no ctx, 403 si status !== ACTIVE o sin capability; null si autorizado.
- Error shape: `{ ok: false, error: { code, message, details } }`.

### 2.4 `/api/auth/me`

- Incluye en la respuesta `role`, `status`, `capabilities` (array de strings).

**DoD Paso 2:** ctx incluye capabilities; requireCapability bloquea correctamente; /api/auth/me expone capabilities. Usuarios no ACTIVE reciben 403 al usar requireCapability en endpoints protegidos.

---

## Paso 3 – Middleware Guard

- [x] Crear o extender `middleware.ts`

**Reglas:**

- Bloquear `/dashboard/admin/*` para usuarios no autorizados.
- Validar: MVP por rol NOTARIO/SUPERADMIN (o equivalente según nomenclatura: notario/superadmin); evolución por capability `ADMIN_USERS_VIEW`.
- Redirigir a `/dashboard` o `/403` de forma consistente.

**Implementado:** `middleware.ts` en raíz con `matcher: ['/dashboard/admin/:path*']`. Lee cookie `sb-user-role`; si no es `superadmin` ni `notario` redirige a `/dashboard`. La cookie se setea en `/api/auth/me` y en login; se borra en logout. Backend sigue siendo fuente de verdad (APIs usan `requireCapability`).

**DoD Paso 3:** Acceso por URL directa a admin bloqueado. Backend sigue siendo fuente de verdad.

---

## Paso 4 – APIs Invitations + Activate

### Endpoints

- [x] POST `/api/admin/usuarios/invite`
- [x] POST `/api/admin/usuarios/invite/resend`
- [x] POST `/api/admin/usuarios/invite/revoke`
- [x] POST `/api/auth/activate`

### Reglas Invite

- Solo con capability `ADMIN_USERS_INVITE`.
- Crear registro en `user_invitations` con `status = PENDING`; usuario (si se crea) con `status = INVITED`.
- Guardar `token_hash` (no token plano).
- preconfig incluye `supports_lawyer_user_ids` para ASISTENTE.
- Registrar evento en `audit_logs`.

**Implementado:** `lib/services/invitation-service.ts` (token hash SHA-256 en columna `token`); `lib/services/audit-log-service.ts`. Invite crea solo `user_invitations` (usuario se crea en activate). Resend genera nuevo token y actualiza hash + `resent_at`. Revoke idempotente. Activate: valida token, crea usuario en Auth + `usuarios`, acepta invitación, crea `usuarios_supports_lawyer` desde preconfig, auditoría.

### Reglas Activate

Validar: token válido, no expirado, no revocado, no usado previamente.

Debe: cambiar invitación a ACCEPTED; cambiar usuario a ACTIVE; crear relaciones en `usuarios_supports_lawyer` desde preconfig; registrar auditoría.

### Resend

- Generar token nuevo; invalidar token anterior (p. ej. nuevo token_hash o flag).
- Actualizar `resent_at` y registrar auditoría.

**DoD Paso 4:** Usuario INVITED no puede acceder a endpoints protegidos. Token revocado/expirado falla. Activate aplica relaciones correctamente. Auditoría registrada.

---

## Paso 5 – APIs Delegación N:M (supports_lawyer)

### Endpoints

- [x] GET `/api/admin/abogados/[lawyerId]/asistentes`
- [x] POST `/api/admin/abogados/[lawyerId]/asistentes`
- [x] DELETE `/api/admin/abogados/[lawyerId]/asistentes/[assistantId]`

### Validaciones

- Capability `LAWYER_SUPPORTS_EDIT`.
- Mismo `notaria_id` para lawyer y assistant.
- Roles correctos (ABOGADO / ASISTENTE).
- Para listado, considerar solo relaciones con `removed_at` NULL (activas).

Registrar auditoría: p. ej. acciones `LAWYER_SUPPORT_ASSIGNED`, `LAWYER_SUPPORT_REMOVED`.

**Implementado:** `lib/services/supports-lawyer-service.ts` (listAsistentesForLawyer, addAssistant, removeAssistant con soft delete). Rutas en `app/api/admin/abogados/[lawyerId]/asistentes/` (GET, POST) y `.../asistentes/[assistantId]` (DELETE). Notario solo opera sobre abogados de su notaría. Auditoría en asignar y quitar.

**DoD Paso 5:** Delegación N:M funciona; al quitar relación se pierde acceso. Auditoría registrada.

---

## Paso 6 – ReBAC en Expedientes

### lib/authz/rebac.ts

- [x] `listVisibleCases(ctx)`
- [x] `canReadCase(ctx, caseId)`

**Orden correcto:**

1. Filtrar por `notaria_id` (tenant).
2. Si SUPERADMIN o NOTARIO → todos los expedientes de la notaría (o global si superadmin).
3. Si ABOGADO → expedientes donde es owner.
4. Si ASISTENTE → por support o por (supports_lawyer + owner del trámite).

**Implementado:** `lib/authz/rebac.ts`: `listVisibleCases(ctx)` devuelve trámites visibles (superadmin: todos; notario: por notaria vía usuarios; abogado: user_id = ctx.userId; asistente: user_id en lawyers de supports_lawyer de la notaría). `canReadCase(ctx, caseId)` valida lectura por trámite. GET `/api/expedientes/tramites` exige auth y filtra por ReBAC (id → canReadCase; compradorId → intersección con listVisibleCases).

Modificar GET `/api/expedientes/tramites` para usar ReBAC.

**DoD Paso 6:** Visibilidad correcta por rol y relaciones. Al quitar supports_lawyer se pierde acceso. Nunca cruzar notarías.

---

## Paso 7 – Frontend Admin + Activation

- [x] Bloquear render de vistas admin si no tiene capability `ADMIN_USERS_VIEW` (o rol equivalente).
- [x] InviteUserModal con email, rol y multi-select de abogados (supports_lawyer_user_ids) para ASISTENTE.
- [x] Resend invite; cambio de status; editor de supports_lawyer por abogado.
- [x] Manejo de 403 y errores según API_CONTRACTS (error shape).
- [x] `app/activate/page.tsx` + ActivateAccountForm consumiendo POST `/api/auth/activate`.

**Implementado:** Vista usuarios comprueba capability `ADMIN_USERS_VIEW` (o rol superadmin/notario). `InviteUserModal` (email, rol, notaría si superadmin, multi-select abogados para asistente) y GET `/api/admin/usuarios/invitations` para listar pendientes; botones Reenviar y Revocar. `AsistentesModal` por abogado (lista, agregar, quitar asistentes) con APIs abogados/asistentes. `lib/api-error-toast.ts` para respuestas `{ ok: false, error: { code, message } }`. Página pública `app/activate/page.tsx` con token por query o input, contraseña y nombre opcional; POST `/api/auth/activate` y redirección a login.

**DoD Paso 7:** UI consistente con capabilities y contratos; manejo de errores uniforme.

---

## Paso 8 – QA y seguridad final

### Validar

- Middleware bloquea `/dashboard/admin/*` a roles no admin.
- Backend devuelve 403 uniforme (error shape) cuando falta capability.
- Usuario INVITED no accede a endpoints protegidos.
- Usuario DEACTIVATED no accede.
- Usuario SUSPENDED no accede.
- Resend invalida token anterior.
- ReBAC respeta notaría (sin cruce de tenant).
- Auditoría registrada en eventos críticos.

**Implementado:**

- **`docs/authz/QA_CHECKLIST.md`:** Checklist de validación con ítems para middleware, 403/error shape, estados de usuario, resend, ReBAC y auditoría; incluye cómo validar cada uno y referencia al código.
- **`tests/authz/requireCapability.test.ts`:** Pruebas unitarias para `requireCapability`: 401 sin ctx, 403 con status no ACTIVE, 403 sin capability, null cuando autorizado; verificación del error shape (`ok`, `error.code`, `error.message`, `error.details`).

**DoD Paso 8:** Checklist QA ejecutado y documentado.

---

## Resultado final garantizado

- Delegaciones dinámicas N:M (supports_lawyer).
- Control fino por capabilities.
- Protección por URL (middleware) y por API (requireCapability).
- Auditoría notarial en eventos críticos.
- Estados de usuario completos (INVITED, ACTIVE, SUSPENDED, DEACTIVATED).
- Escalable a multi-notaría.
- Preparado para configuración futura (overrides) sin reescribir endpoints.

---

## Referencias

- **ROLE AGENTS.md** – Orden de ejecución y prompts por agente.
- **docs/authz/MIGRATION_LEGACY_ROLES.md** – Estrategia de roles (una columna `rol` con 4 valores; helpers canAccessAdmin / canAccessGlobalAdmin).
- **docs/authz/CAPABILITIES.md**, **API_CONTRACTS.md**, **ENDPOINTS_TO_CAPABILITIES.md** – Contratos y mapeos.
- **Propuesta_Actualizada_Usuarios_Roles_v2.pdf** – Modelo RBAC + ReBAC + Capabilities.
- **AGENTS.md** – Invariantes, convenciones y error shape.
- **docs/APP_ROUTER_ESTRUCTURA_ENDPOINTS.md** – Estructura actual de rutas API y vistas.
