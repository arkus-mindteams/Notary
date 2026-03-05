# Contratos API – Autorización (Invitations, Activate, Status, Supports_lawyer)

Contratos request/response y error shape uniforme para los endpoints de invitaciones, activación, cambio de estado y delegación asistente–abogado. Todos los endpoints protegidos por capabilities deben usar el mismo formato de éxito y error.

**Reglas:** No migraciones. Respuestas JSON uniformes en toda la API de autorización.

---

## 1. Formato de respuesta estándar

### Éxito

```json
{
  "ok": true,
  "data": { ... }
}
```

- `data` contiene el payload específico del endpoint (objeto o array).
- HTTP: 200 (GET, PATCH, POST cuando no es “creado”) o 201 (POST creación cuando se devuelve recurso creado).

### Error

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Descripción legible para el cliente",
    "details": {},
    "trace_id": "uuid-opcional"
  }
}
```

- `code`: ver tabla de códigos abajo.
- `message`: mensaje estable, no exponer secretos ni stack traces.
- `details`: objeto opcional con datos adicionales (ej. `field`, `allowed_roles`).
- `trace_id`: opcional, para soporte/logs.

### Códigos de error (alineados con AGENTS.md)

| code | HTTP | Uso |
|------|------|-----|
| `VALIDATION_ERROR` | 400 | Body/query/params inválidos. |
| `UNAUTHORIZED` | 401 | No autenticado o token inválido. |
| `FORBIDDEN` | 403 | Autenticado pero sin capability/rol para la acción. |
| `NOT_FOUND` | 404 | Recurso no encontrado (usuario, invitación, abogado, etc.). |
| `CONFLICT` | 409 | Conflicto (ej. invitación ya aceptada, relación ya existe). |
| `DOMAIN_RULE_VIOLATION` | 422 | Regla de negocio (ej. abogado de otra notaría). |
| `AI_OUTPUT_INVALID` | 422/502 | Solo si aplica a flujos IA. |
| `INTERNAL_ERROR` | 500 | Error interno; no exponer detalles en `message`. |

---

## 2. Invitaciones

### POST `/api/admin/usuarios/invite`

**Capability:** `ADMIN_USERS_INVITE`.

**Request (body):**

```json
{
  "email": "string (required, email format)",
  "role": "NOTARIO | ABOGADO | ASISTENTE",
  "preconfig_json": {
    "supports_lawyer_user_ids": ["uuid", "uuid"]
  }
}
```

- `supports_lawyer_user_ids`: requerido solo si `role === "ASISTENTE"`. Array de IDs de usuarios con rol ABOGADO de la misma notaría.
- Validar que todos los IDs existan, sean ABOGADO y pertenezcan a la misma notaría.

**Response 200/201 (éxito):**

```json
{
  "ok": true,
  "data": {
    "invitation_id": "uuid",
    "email": "string",
    "role": "string",
    "status": "pending",
    "expires_at": "ISO8601"
  }
}
```

**Errores típicos:** `VALIDATION_ERROR` (email/role/preconfig), `FORBIDDEN`, `CONFLICT` (invitación ya existente para ese email), `DOMAIN_RULE_VIOLATION` (abogado de otra notaría).

---

### POST `/api/admin/usuarios/invite/resend`

**Capability:** `ADMIN_USERS_INVITE`.

**Request (body):**

```json
{
  "invitation_id": "uuid"
}
```

o por email:

```json
{
  "email": "string"
}
```

(Definir uno como estándar; el otro opcional o en otro PR.)

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": {
    "invitation_id": "uuid",
    "email": "string",
    "resent_at": "ISO8601"
  }
}
```

**Errores:** `NOT_FOUND`, `CONFLICT` (ya activada), `VALIDATION_ERROR`, `FORBIDDEN`.

---

### POST `/api/admin/usuarios/invite/revoke`

**Capability:** `ADMIN_USERS_INVITE`.

**Request (body):**

```json
{
  "invitation_id": "uuid"
}
```

o `{ "email": "string" }` según mismo criterio que resend.

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": {
    "invitation_id": "uuid",
    "revoked_at": "ISO8601"
  }
}
```

**Errores:** `NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN`.

---

## 3. Activación de cuenta

### POST `/api/auth/activate`

**Autenticación:** No requiere sesión. Requiere token de invitación válido (body o query según implementación).

**Request (body):**

```json
{
  "token": "string (invitation/activation token)",
  "password": "string (optional, si se fija en activación)",
  "nombre": "string (optional)",
  "apellido_paterno": "string (optional)",
  "apellido_materno": "string (optional)"
}
```

(Solo `token` obligatorio si la activación solo “confirma”; si en este paso se fija contraseña y nombre, incluir los campos anteriores.)

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": {
    "user_id": "uuid",
    "email": "string",
    "status": "ACTIVE",
    "activated_at": "ISO8601"
  }
}
```

**Errores:** `VALIDATION_ERROR` (token faltante o inválido), `NOT_FOUND` (invitación no encontrada), `CONFLICT` (invitación ya aceptada o expirada). No usar 403 para token inválido; usar 400/404.

---

## 4. Cambio de estado de usuario

### PATCH `/api/admin/usuarios/:id`

**Capability:** `ADMIN_USERS_STATUS_CHANGE` (para cambiar status); `ADMIN_USERS_VIEW` si solo se permite GET.

**Request (body, solo campos permitidos):**

```json
{
  "status": "ACTIVE | SUSPENDED"
}
```

(O el conjunto de estados definido en dominio.)

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "status": "ACTIVE | SUSPENDED",
    "updated_at": "ISO8601"
  }
}
```

**Errores:** `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `DOMAIN_RULE_VIOLATION` (ej. no permitir suspender al último NOTARIO).

---

## 5. Delegación N:M (supports_lawyer)

### GET `/api/admin/abogados/:lawyerId/asistentes`

**Capability:** `LAWYER_SUPPORTS_EDIT`.

**Request:** Sin body. `lawyerId` en path.

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": [
    {
      "user_id": "uuid",
      "email": "string",
      "nombre": "string",
      "added_at": "ISO8601"
    }
  ]
}
```

**Errores:** `FORBIDDEN`, `NOT_FOUND` (lawyerId no existe o no es ABOGADO de la notaría).

---

### POST `/api/admin/abogados/:lawyerId/asistentes`

**Capability:** `LAWYER_SUPPORTS_EDIT`.

**Request (body):**

```json
{
  "assistant_user_id": "uuid"
}
```

**Response 201 (éxito):**

```json
{
  "ok": true,
  "data": {
    "lawyer_id": "uuid",
    "assistant_id": "uuid",
    "created_at": "ISO8601"
  }
}
```

**Errores:** `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND` (lawyer o assistant no existen/rol incorrecto), `CONFLICT` (relación ya existe), `DOMAIN_RULE_VIOLATION` (distinta notaría).

---

### DELETE `/api/admin/abogados/:lawyerId/asistentes/:assistantId`

**Capability:** `LAWYER_SUPPORTS_EDIT`.

**Request:** Sin body. `lawyerId` y `assistantId` en path.

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": {
    "lawyer_id": "uuid",
    "assistant_id": "uuid",
    "removed_at": "ISO8601"
  }
}
```

**Errores:** `FORBIDDEN`, `NOT_FOUND` (relación o usuario no existe).

---

## 6. Asignaciones de trámites a asistentes

Quién puede: **listar** quien tenga permiso de lectura sobre el trámite (dueño abogado o notario); **asignar/quitar** solo el **abogado dueño** del trámite (`tramites.user_id`). No se usa capability nueva; se valida en ruta que el usuario sea dueño o tenga acceso de lectura.

### GET `/api/expedientes/tramites/:tramiteId/asignaciones`

**Autorización:** Usuario autenticado con permiso de lectura sobre el trámite (`canReadCase`), p. ej. dueño (abogado) o notario de la notaría del trámite.

**Request:** Sin body. `tramiteId` en path.

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "tramite_id": "uuid",
      "assistant_id": "uuid",
      "lawyer_id": "uuid",
      "notaria_id": "uuid",
      "created_at": "ISO8601",
      "asistente_email": "string",
      "asistente_nombre": "string"
    }
  ]
}
```

**Errores:** `UNAUTHORIZED`, `NOT_FOUND` (trámite no existe o usuario no puede leerlo).

---

### POST `/api/expedientes/tramites/:tramiteId/asignaciones`

**Autorización:** Solo el **abogado dueño** del trámite (`tramites.user_id = ctx.userId`).

**Request (body):**

```json
{
  "assistant_id": "uuid"
}
```

**Validación:** El asistente debe estar en `usuarios_supports_lawyer` con ese abogado (misma notaría).

**Response 201 (éxito):**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "tramite_id": "uuid",
    "assistant_id": "uuid",
    "lawyer_id": "uuid",
    "notaria_id": "uuid",
    "created_at": "ISO8601"
  }
}
```

**Errores:** `FORBIDDEN` (no es dueño), `NOT_FOUND` (trámite no existe), `VALIDATION_ERROR` (assistant_id faltante o inválido), `CONFLICT` (asistente ya asignado a este trámite), `DOMAIN_RULE_VIOLATION` (asistente no vinculado al abogado o distinta notaría).

---

### DELETE `/api/expedientes/tramites/:tramiteId/asignaciones/:assistantId`

**Autorización:** Solo el **abogado dueño** del trámite.

**Request:** Sin body. `tramiteId` y `assistantId` en path.

**Response 200 (éxito):**

```json
{
  "ok": true,
  "data": { "deleted": true }
}
```

**Errores:** `FORBIDDEN` (no es dueño), `NOT_FOUND` (trámite o asignación no existe).

---

## 7. GET `/api/auth/me` (extensión)

**Contrato actual:** Devuelve `{ user: AuthUser }`.

**Extensión (Agente 2 – Backend Core):** Incluir en la respuesta un array de capabilities para que el frontend y el middleware puedan ocultar/bloquear por capability sin llamadas extra.

**Response 200 (ejemplo con capabilities):**

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "authUserId": "string",
      "email": "string",
      "name": "string",
      "role": "NOTARIO | ABOGADO | ASISTENTE | SUPER_ADMIN",
      "notariaId": "uuid"
    },
    "capabilities": ["ADMIN_USERS_VIEW", "ADMIN_USERS_INVITE", ...]
  }
}
```

O mantener `{ user: { ... }, capabilities: [] }` si se prefiere no envolver en `ok/data` por compatibilidad; en ese caso, documentar que los nuevos endpoints sí usan `ok`/`data`/`error` y que `/api/auth/me` puede migrarse al mismo shape en un PR posterior.

---

## 8. Resumen

| Endpoint | Método | Capability | Contrato |
|----------|--------|------------|----------|
| invite | POST | ADMIN_USERS_INVITE | Body: email, role, preconfig_json. Response: invitation. |
| resend | POST | ADMIN_USERS_INVITE | Body: invitation_id (o email). Response: resent_at. |
| revoke | POST | ADMIN_USERS_INVITE | Body: invitation_id (o email). Response: revoked_at. |
| activate | POST | — (token) | Body: token, opcional password/nombre. Response: user_id, status. |
| status | PATCH /api/admin/usuarios/:id | ADMIN_USERS_STATUS_CHANGE | Body: status. Response: user. |
| list asistentes | GET abogados/:id/asistentes | LAWYER_SUPPORTS_EDIT | Response: array asistentes. |
| add asistente | POST abogados/:id/asistentes | LAWYER_SUPPORTS_EDIT | Body: assistant_user_id. Response: relación. |
| remove asistente | DELETE abogados/:id/asistentes/:aid | LAWYER_SUPPORTS_EDIT | Response: removed_at. |
| list asignaciones | GET expedientes/tramites/:id/asignaciones | canReadCase (dueño/notario) | Response: array asignaciones. |
| add asignación | POST expedientes/tramites/:id/asignaciones | dueño del trámite (abogado) | Body: assistant_id. Response: asignación. |
| remove asignación | DELETE expedientes/tramites/:id/asignaciones/:aid | dueño del trámite | Response: deleted. |

Todos los errores usan el mismo `error` shape con `code`, `message`, `details`, `trace_id`. Implementaciones deben usar `requireCapability` (o validación de dueño/canReadCase para asignaciones) y este contrato para respuestas consistentes.
