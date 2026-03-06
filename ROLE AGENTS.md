# Agentes para arrancar implementación en Cursor (RBAC + ReBAC + Invitations + supports_lawyer N:M + Capabilities + Middleware)

## Parámetros globales (OBLIGATORIOS para todos los agentes)

1. **No haga migraciones** (no crear ni modificar archivos en `supabase/migrations/*` ni SQL de schema).
2. **No cambie rutas existentes a menos que sea estrictamente necesario.** Si hay que tocar un archivo existente, hacerlo mínimo y justificado.
3. **Use helpers compartidos** (`authContext` + `requireCapability`) para evitar duplicación de lógica en endpoints.
4. **Mantenga respuestas JSON uniformes**: mismo “error shape” en toda la API.

   * Ejemplo recomendado:

     * `{"ok": true, "data": ...}`
     * `{"ok": false, "error": {"code": "FORBIDDEN", "message": "...", "details": {...}}}`

---

## Orden recomendado de ejecución (PRs pequeños, controlados)

1. Planner (capabilities + contratos)
2. Backend Core Auth Context + Capabilities
3. Middleware Guard (bloqueo /dashboard/admin)
4. APIs Invitations + Activate
5. APIs Delegación N:M (supports_lawyer)
6. ReBAC aplicado a Expedientes (GET)
7. Frontend Admin Usuarios + Activate UI
8. QA / Checklist + tests (si aplica)

---

## Agente 1: Arquitecto/Planner (Documentación y contratos)

**Misión:** Definir catálogo mínimo de capabilities, mapear endpoints/vistas → capabilities, y fijar contratos JSON para que todos implementen igual.

**Entradas:** estructura App Router actual + reglas RBAC/ReBAC ya acordadas.
**Salidas:**

* `docs/authz/CAPABILITIES.md`
* `docs/authz/ENDPOINTS_TO_CAPABILITIES.md`
* `docs/authz/API_CONTRACTS.md`
* Checklist de PRs (opcional: `docs/authz/IMPLEMENTATION_CHECKLIST.md`)

**Definition of Done (DoD):**

* Capabilities mínimas definidas (admin usuarios, invites, status, supports edit, expedientes)
* Tabla endpoint → capability(s)
* Contratos request/response para: invite/resend/revoke/activate/status + supports_lawyer add/remove/list

**PROMPT PARA CURSOR**
Actúa como arquitecto de autorización. Produce documentación y contratos para el repo Next.js App Router.
Entregables:

1. docs/authz/CAPABILITIES.md con listado de capabilities y descripción.
2. docs/authz/ENDPOINTS_TO_CAPABILITIES.md mapeando: /dashboard/admin/usuarios, /api/admin/usuarios, /api/admin/usuarios/invite/*, /api/admin/abogados/[lawyerId]/asistentes/*, /api/auth/activate, /api/expedientes/tramites a capabilities.
3. docs/authz/API_CONTRACTS.md con request/response JSON y error shape uniforme para: invite, resend, revoke, activate, change status, add/remove/list assistants for lawyer.
   Reglas globales: No migraciones. No cambiar rutas existentes. Usa un error shape uniforme.

---

## Agente 2: Backend Core Auth Context + Capabilities

**Misión:** Construir la base reusable para endpoints: ctx + requireCapability + catálogo de capabilities; actualizar /api/auth/me para exponer capabilities.

**Archivos a crear:**

* `lib/auth/authContext.ts`
* `lib/authz/capabilities.ts`
* `lib/authz/requireCapability.ts`

**Archivos a modificar (mínimo):**

* `app/api/auth/me/route.ts` (agregar `capabilities` al response)

**DoD:**

* `getAuthContext(req)` retorna `{ userId, role, status, notaryOfficeId, capabilities }`
* `requireCapability(ctx, cap)` bloquea con 403 uniforme
* `/api/auth/me` devuelve capabilities y usa el error shape uniforme

**PROMPT PARA CURSOR**
Implementa la capa base de autorización sin migraciones:

* Crea lib/auth/authContext.ts con getAuthContext(request) que valida sesión (Supabase o helper existente), carga perfil user, valida status ACTIVE y retorna ctx con role/notaryOfficeId/capabilities.
* Crea lib/authz/capabilities.ts con enum/lista de capabilities y getCapabilitiesForRole(role) (por rol, por ahora).
* Crea lib/authz/requireCapability.ts que valide y devuelva Response JSON uniforme (403 FORBIDDEN).
* Modifica app/api/auth/me/route.ts para incluir {capabilities} en la respuesta.
  Reglas globales: No migraciones. No cambiar rutas existentes salvo lo mínimo. Usar authContext + requireCapability. Error shape consistente.

---

## Agente 3: Middleware Guard (bloqueo por URL de vistas Admin)

**Misión:** Evitar que ASISTENTE/ABOGADO entren a `/dashboard/admin/*` escribiendo URL.

**Archivos a crear:**

* `middleware.ts`

**DoD:**

* Bloqueo/redirect si path inicia con `/dashboard/admin` y usuario no tiene permisos (rol admin o capability).
* Nota: middleware es “prevención”; backend es el candado real.

**PROMPT PARA CURSOR**
Crea middleware.ts para bloquear /dashboard/admin/* a ASISTENTE/ABOGADO.
Si no es posible leer capabilities de forma segura en middleware, usa rol (NOTARIO/SUPER_ADMIN) como criterio mínimo y redirige a /dashboard.
No migraciones. No modificar rutas existentes salvo lo mínimo. Error shape no aplica aquí, pero mantén redirects consistentes.

---

## Agente 4: APIs Invitations (Invite/Resend/Revoke) + Activation

**Misión:** Implementar onboarding: invitar → activar, con preconfig N:M para asistentes: `supports_lawyer_user_ids`.

**Archivos a crear:**

* `app/api/admin/usuarios/invite/route.ts`
* `app/api/admin/usuarios/invite/resend/route.ts`
* `app/api/admin/usuarios/invite/revoke/route.ts`
* `app/api/auth/activate/route.ts`

**Servicios (crear o stubs):**

* `lib/services/invitations.service.ts`
* `lib/services/users.service.ts`
* `lib/services/relationships.service.ts` (solo interfaces/stubs si aún no hay persistencia completa)

**DoD:**

* Validación por capability:

  * invite/resend/revoke: solo NOTARIO/SUPER_ADMIN
  * activate: público con token (pero valida invitación)
* Activate aplica relaciones `supports_lawyer` por cada abogado en preconfig.
* Respuestas JSON uniformes (ok/data, ok/error)

**PROMPT PARA CURSOR**
Implementa endpoints App Router:

* POST /api/admin/usuarios/invite
* POST /api/admin/usuarios/invite/resend
* POST /api/admin/usuarios/invite/revoke
* POST /api/auth/activate
  Usa getAuthContext + requireCapability en endpoints admin. Mantén error shape uniforme.
  Invite: acepta role y preconfig_json. Para ASISTENTE: supports_lawyer_user_ids: string[] (validar array, validar que IDs correspondan a usuarios ABOGADO de la misma notaría).
  Activate: recibe token, valida invitación (stub/repos si falta DB), activa usuario, y crea relaciones supports_lawyer por cada abogado del preconfig.
  No migraciones. No cambiar rutas existentes salvo lo mínimo. Usa helpers compartidos.

---

## Agente 5: APIs Delegación N:M (supports_lawyer)

**Misión:** Gestionar relación asistente↔abogado: listar, agregar, remover.

**Archivos a crear:**

* `app/api/admin/abogados/[lawyerId]/asistentes/route.ts` (GET/POST)
* `app/api/admin/abogados/[lawyerId]/asistentes/[assistantId]/route.ts` (DELETE)

**DoD:**

* POST crea `supports_lawyer(assistant, lawyer)`
* DELETE elimina esa relación
* GET lista asistentes del abogado
* Solo NOTARIO/SUPER_ADMIN con `LAWYER_SUPPORTS_EDIT`
* JSON uniforme

**PROMPT PARA CURSOR**
Implementa:

* GET/POST /api/admin/abogados/[lawyerId]/asistentes
* DELETE /api/admin/abogados/[lawyerId]/asistentes/[assistantId]
  Valida con getAuthContext + requireCapability(LAWYER_SUPPORTS_EDIT).
  Validaciones: lawyerId existe y role=ABOGADO; assistantId existe y role=ASISTENTE; misma notaría.
  Usa relationships.service para add/remove/list. Error shape uniforme.
  No migraciones. No cambiar rutas existentes salvo lo mínimo. Usa helpers compartidos.

---

## Agente 6: ReBAC aplicado a Expedientes (backend filtra)

**Misión:** Que el listado de expedientes venga filtrado por backend según rol + relaciones.

**Archivos a modificar (mínimo):**

* `app/api/expedientes/tramites/route.ts` (GET)

**Helpers (crear si faltan):**

* `lib/authz/rebac.ts` con `listVisibleCases(ctx)` y `canReadCase(...)`

**DoD:**

* NOTARIO/SUPER_ADMIN: todos
* ABOGADO: owner
* ASISTENTE: support OR (supports_lawyer + owner)
* JSON uniforme

**PROMPT PARA CURSOR**
Modifica GET /api/expedientes/tramites para aplicar ReBAC real.
Usa getAuthContext. Implementa listVisibleCases(ctx) en lib/authz/rebac.ts usando relaciones: owner, supports_lawyer, support.
No migraciones. No cambiar rutas existentes salvo lo mínimo. Usa helpers compartidos. Mantén error shape uniforme.

---

## Agente 7: Frontend Admin Usuarios + Activation UI

**Misión:** UI para operar invites, status, delegación supports_lawyer, y activar cuenta.

**Archivos a crear/modificar:**

* `app/dashboard/admin/usuarios/page.tsx` (modificar)
* `app/activate/page.tsx` (crear)

**Componentes sugeridos (ajustar a tu estructura real):**

* `components/admin/usuarios/UsersTable.tsx`
* `components/admin/usuarios/InviteUserModal.tsx` (multi-select de abogados)
* `components/admin/usuarios/ResendInviteButton.tsx`
* `components/admin/usuarios/UserStatusBadge.tsx`
* `components/admin/usuarios/LawyerAssistantsEditor.tsx`
* `components/auth/ActivateAccountForm.tsx`

**DoD:**

* Page admin consulta `/api/auth/me` y si no tiene capability `ADMIN_USERS_VIEW`, no renderiza (y el middleware igual bloquea).
* Invite modal permite seleccionar múltiples abogados al invitar ASISTENTE.
* UI para agregar/remover supports_lawyer (consume endpoints de Agente 5).
* Activate page consume POST `/api/auth/activate`.

**PROMPT PARA CURSOR**
Implementa UI admin usuarios y activación:

* /dashboard/admin/usuarios/page.tsx debe consumir /api/auth/me y bloquear UI si no ADMIN_USERS_VIEW.
* InviteUserModal: email, rol; si ASISTENTE, multi-select de abogados (supports_lawyer_user_ids) y llama /api/admin/usuarios/invite.
* Agrega acciones: resend invite, cambiar status, y editor de supports_lawyer por abogado (consume /api/admin/abogados/[lawyerId]/asistentes).
* Crea /activate/page.tsx + ActivateAccountForm para consumir POST /api/auth/activate.
  No migraciones. No cambiar rutas existentes salvo lo mínimo. Mantén manejo de errores uniforme en frontend (basado en error shape).

---

## Agente 8: QA / Checklist de seguridad y flujo

**Misión:** Validar que no hay escapes por URL ni por API, y que la delegación N:M funciona.

**Entregables:**

* Si hay framework de tests: `tests/authz/*.test.ts`
* Si no: `docs/authz/QA_CHECKLIST.md`

**DoD mínimo:**

* Middleware bloquea `/dashboard/admin/*` a ASISTENTE/ABOGADO.
* `/api/admin/*` devuelve 403 uniforme sin capability.
* Asistente con supports_lawyer=[A,B] ve expedientes de A y B; al remover B deja de verlos.
* Invite/activate: token revocado/expirado falla.
* Usuario SUSPENDED no accede a endpoints protegidos.

**PROMPT PARA CURSOR**
Crea QA checklist y/o tests automáticos para:

1. Bloqueo de /dashboard/admin/* por middleware.
2. 403 uniforme en /api/admin/* sin capability.
3. Delegación N:M supports_lawyer aplicada en listado de expedientes.
4. Flujos invite/activate con revoked/expired.
5. Usuario SUSPENDED no puede acceder.
   No migraciones. No cambiar rutas existentes salvo lo mínimo. Usa helpers compartidos.
