# Mapeo Endpoints y Vistas → Capabilities

Referencia para proteger rutas API y vistas. Cada endpoint/vista requiere al menos una capability (o rol mínimo donde aplique). El backend valida con `requireCapability(ctx, cap)`; el middleware y el frontend usan este mapeo para bloqueo y ocultado de UI.

**Prefijo admin:** Las rutas bajo `/api/admin/*` y `/dashboard/admin/*` deben validar capabilities; sin capability adecuada → 403 (API) o redirect (vistas).

---

## 1. Vistas (páginas)

| Ruta (pathname) | Capability requerida | Notas |
|-----------------|----------------------|--------|
| `/dashboard/admin/usuarios` | `ADMIN_USERS_VIEW` | Listado y gestión de usuarios. Middleware debe bloquear si no tiene rol NOTARIO/SUPER_ADMIN o esta capability. |
| `/dashboard/admin/usage` | (admin en general) | Ver uso; puede requerir misma regla que admin o `ADMIN_USERS_VIEW` según producto. |
| `/dashboard/admin/preaviso-config` | (admin en general) | Config preaviso; mismo criterio que otras vistas admin. |
| `/dashboard/expedientes` | `CASE_VIEW_OWN` y/o `CASE_VIEW_DELEGATED` o `CASE_VIEW_ALL` | El listado real se filtra en GET /api/expedientes/tramites por ReBAC. |
| `/dashboard/preaviso`, `/dashboard/deslinde`, etc. | Según feature | CASE_*, DOCUMENT_UPLOAD, PREAVISO_FINALIZE según acción. |

---

## 2. API Auth

| Endpoint | Método | Capability / criterio | Notas |
|----------|--------|------------------------|--------|
| `/api/auth/me` | GET | Ninguna (usuario autenticado) | Debe devolver `capabilities: string[]` para que el frontend/middleware sepan qué mostrar/bloquear. |
| `/api/auth/login` | POST | Público | - |
| `/api/auth/logout` | POST | Usuario autenticado | - |
| `/api/auth/activate` | POST | Público con token válido | Valida invitación (token); no exige sesión. |

---

## 3. API Admin – Usuarios

| Endpoint | Método | Capability | Notas |
|----------|--------|------------|--------|
| `/api/admin/usuarios` | GET | `ADMIN_USERS_VIEW` | Listado usuarios de la notaría. |
| `/api/admin/usuarios` | POST | (crear usuario vía invite; ver invite) | Si se usa solo invite, no POST directo aquí. |
| `/api/admin/usuarios/:id` | GET, PATCH, DELETE | `ADMIN_USERS_VIEW` (GET), `ADMIN_USERS_STATUS_CHANGE` (PATCH status) | PATCH para cambio de status; DELETE según política (revoke/invite). |
| `/api/admin/usuarios/invite` | POST | `ADMIN_USERS_INVITE` | Crear invitación (email, role, preconfig para ASISTENTE). |
| `/api/admin/usuarios/invite/resend` | POST | `ADMIN_USERS_INVITE` | Reenviar invitación. |
| `/api/admin/usuarios/invite/revoke` | POST | `ADMIN_USERS_INVITE` | Revocar invitación. |

---

## 4. API Admin – Abogados / Asistentes (delegación N:M)

| Endpoint | Método | Capability | Notas |
|----------|--------|------------|--------|
| `/api/admin/abogados/:lawyerId/asistentes` | GET | `LAWYER_SUPPORTS_EDIT` | Listar asistentes del abogado. |
| `/api/admin/abogados/:lawyerId/asistentes` | POST | `LAWYER_SUPPORTS_EDIT` | Añadir asistente al abogado (supports_lawyer). |
| `/api/admin/abogados/:lawyerId/asistentes/:assistantId` | DELETE | `LAWYER_SUPPORTS_EDIT` | Quitar relación asistente–abogado. |

Validaciones de dominio: `lawyerId` debe ser usuario con rol ABOGADO; `assistantId` con rol ASISTENTE; misma notaría.

---

## 5. API Expedientes (ReBAC)

| Endpoint | Método | Capability + ReBAC | Notas |
|----------|--------|-------------------|--------|
| `/api/expedientes/tramites` | GET | `CASE_VIEW_OWN` y/o `CASE_VIEW_DELEGATED` o `CASE_VIEW_ALL` | Backend filtra por ReBAC: NOTARIO/SUPER_ADMIN todos; ABOGADO owner; ASISTENTE support o (supports_lawyer + owner). |
| `/api/expedientes/tramites` | POST | `CASE_CREATE` | Crear trámite. |
| `/api/expedientes/tramites/:id/*` | GET, POST, PATCH, etc. | Acceso al trámite según ReBAC (owner/support/delegated) | Ver `listVisibleCases` / `canReadCase` en ReBAC. |
| `/api/expedientes/preaviso/finalize` | POST | `PREAVISO_FINALIZE` + acceso al trámite | - |
| `/api/expedientes/documentos/upload` | POST | `DOCUMENT_UPLOAD` + acceso al expediente | - |

---

## 6. Resto de API Admin (existente)

| Endpoint | Capability sugerida | Notas |
|----------|---------------------|--------|
| `/api/admin/usage-stats` | Misma que vistas admin (NOTARIO/SUPER_ADMIN o admin) | - |
| `/api/admin/notarias` | SUPER_ADMIN o NOTARIO (según producto) | - |
| `/api/admin/preaviso-config` | Admin / NOTARIO | - |
| `/api/admin/conversations/*` | Admin usuarios o equivalente | - |
| `/api/admin/documents/:docId/download` | Admin o acceso al documento por ReBAC | - |

---

## 7. Resumen por capability

| Capability | Endpoints / vistas principales |
|------------|--------------------------------|
| `ADMIN_USERS_VIEW` | GET /api/admin/usuarios, GET /api/admin/usuarios/:id, /dashboard/admin/usuarios |
| `ADMIN_USERS_INVITE` | POST invite, resend, revoke |
| `ADMIN_USERS_STATUS_CHANGE` | PATCH /api/admin/usuarios/:id (status) |
| `LAWYER_SUPPORTS_EDIT` | GET/POST/DELETE /api/admin/abogados/:lawyerId/asistentes(*) |
| `CASE_CREATE` | POST /api/expedientes/tramites |
| `CASE_VIEW_ALL` | GET /api/expedientes/tramites (filtrado backend) |
| `CASE_VIEW_OWN` | GET /api/expedientes/tramites (filtrado backend) |
| `CASE_VIEW_DELEGATED` | GET /api/expedientes/tramites (filtrado backend) |
| `DOCUMENT_UPLOAD` | POST /api/expedientes/documentos/upload, etc. |
| `PREAVISO_FINALIZE` | POST /api/expedientes/preaviso/finalize |

(*) Rutas a crear en fase de APIs Delegación N:M.

Este mapeo es la referencia para implementar `requireCapability` en cada route y para el middleware que protege `/dashboard/admin/*`.
