# Catálogo de Capabilities (RBAC + ReBAC)

Documento de referencia para el sistema de autorización. Las capabilities controlan el acceso a funcionalidades concretas; se asignan por rol y se validan en backend (fuente de verdad).

**Reglas globales:** No migraciones en este documento. Contratos y nombres son estables para implementación por fases.

---

## 1. Roles (RBAC)

| Rol           | Descripción breve                          |
|---------------|--------------------------------------------|
| `SUPER_ADMIN` | Administración global (multi-notaría)      |
| `NOTARIO`     | Responsable de la notaría, admin usuarios  |
| `ABOGADO`     | Titular de expedientes, puede tener asistentes |
| `ASISTENTE`   | Soporta uno o más abogados (N:M)           |

---

## 2. Capabilities (catálogo mínimo)

### Admin usuarios e invitaciones

| Capability               | Descripción |
|---------------------------|-------------|
| `ADMIN_USERS_VIEW`        | Ver listado de usuarios de la notaría y acceder a la vista `/dashboard/admin/usuarios`. |
| `ADMIN_USERS_INVITE`      | Enviar invitaciones (invite), reenviar (resend) y revocar (revoke). |
| `ADMIN_USERS_STATUS_CHANGE` | Cambiar estado de usuario (ACTIVE, SUSPENDED, etc.). |

### Admin notarías (solo superadmin)

| Capability       | Descripción |
|------------------|-------------|
| `ADMIN_NOTARIAS` | Listar, crear, editar y desactivar notarías. Solo rol superadmin. |

### Delegación asistente ↔ abogado (ReBAC N:M)

| Capability           | Descripción |
|----------------------|-------------|
| `LAWYER_SUPPORTS_EDIT` | Gestionar relación supports_lawyer: agregar o quitar asistentes de un abogado (list/add/remove). |

### Expedientes y casos

| Capability         | Descripción |
|--------------------|-------------|
| `CASE_CREATE`      | Crear expedientes/trámites. |
| `CASE_VIEW_ALL`    | Ver todos los expedientes de la notaría (NOTARIO/SUPER_ADMIN). |
| `CASE_VIEW_OWN`    | Ver expedientes de los que es owner (ABOGADO). |
| `CASE_VIEW_DELEGATED` | Ver expedientes delegados vía supports_lawyer o support. |

### Documentos y preaviso

| Capability          | Descripción |
|---------------------|-------------|
| `DOCUMENT_UPLOAD`   | Subir documentos a expedientes. |
| `PREAVISO_FINALIZE` | Finalizar flujo de preaviso (generar documento final). |

---

## 3. Mapeo Rol → Capabilities (por defecto)

Asignación inicial por rol. La implementación usará `getCapabilitiesForRole(role)` (por rol; sin migraciones, sin tabla de permisos aún).

| Rol           | Capabilities por defecto |
|---------------|---------------------------|
| `SUPER_ADMIN` | Todas (incl. ADMIN_NOTARIAS, admin usuarios, invites, status, lawyer supports, case view all, case create, document upload, preaviso finalize). |
| `NOTARIO`     | `ADMIN_USERS_VIEW`, `ADMIN_USERS_INVITE`, `ADMIN_USERS_STATUS_CHANGE`, `LAWYER_SUPPORTS_EDIT`, `CASE_CREATE`, `CASE_VIEW_ALL`, `DOCUMENT_UPLOAD`, `PREAVISO_FINALIZE`. |
| `ABOGADO`     | `CASE_CREATE`, `CASE_VIEW_OWN`, `CASE_VIEW_DELEGATED`, `DOCUMENT_UPLOAD`, `PREAVISO_FINALIZE`. |
| `ASISTENTE`   | `CASE_VIEW_DELEGATED`, `DOCUMENT_UPLOAD`, `PREAVISO_FINALIZE` (según relaciones supports_lawyer/support). |

**Nota:** El listado visible de expedientes se filtra en backend por ReBAC (owner, supports_lawyer, support), no solo por capability; las capabilities definen qué “tipos” de acceso tiene el rol.

---

## 4. Uso en implementación

- **Backend:** `requireCapability(ctx, cap)` antes de ejecutar la acción; si no tiene capability → 403 con error shape uniforme.
- **Frontend:** Ocultar UI (ej. enlace a admin usuarios) si el usuario no tiene la capability correspondiente; el backend sigue siendo la fuente de verdad.
- **Middleware:** Bloquear `/dashboard/admin/*` a roles sin acceso (p. ej. sin NOTARIO/SUPER_ADMIN o sin capability de admin); no sustituye la validación en API.

Este catálogo es la referencia para `lib/authz/capabilities.ts` y para `ENDPOINTS_TO_CAPABILITIES.md`.
