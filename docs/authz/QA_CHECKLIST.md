# QA Checklist – Autorización (RBAC + ReBAC + Invitations)

Checklist de validación para el Paso 8. Ejecutar manualmente o usar como referencia para pruebas automatizadas. El backend es la fuente de verdad; el middleware y el frontend refuerzan la UX.

---

## 1. Middleware – Bloqueo de rutas admin

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 1.1 | Middleware bloquea `/dashboard/admin/*` a roles no admin | Con usuario **abogado** o **asistente** (cookie `sb-user-role` = abogado/asistente), acceder a `/dashboard/admin/usuarios`. Debe redirigir a `/dashboard`. | `middleware.ts` (matcher `/dashboard/admin/:path*`, solo permite `superadmin` y `notario`) |
| 1.2 | Superadmin y notario sí acceden | Con cookie `sb-user-role` = superadmin o notario, acceder a `/dashboard/admin/usuarios`. Debe cargar la página. | Mismo archivo |

**Nota:** La cookie se setea en login y en `/api/auth/me`. Sin cookie (p. ej. primera visita a admin), el middleware redirige a `/dashboard`.

---

## 2. Backend – 403 y forma de error uniforme

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 2.1 | Sin token → 401 con shape `{ ok: false, error: { code, message, details } }` | Llamar a `GET /api/admin/usuarios` o `POST /api/admin/usuarios/invite` sin header `Authorization`. Respuesta 401 y body con `ok: false`, `error.code`, `error.message`. | `requireCapability` en `lib/authz/requireCapability.ts` |
| 2.2 | Token válido pero sin capability → 403 mismo shape | Con token de usuario **abogado**, llamar a `POST /api/admin/usuarios/invite` o `GET /api/admin/notarias`. Respuesta 403 y body con `ok: false`, `error.code` (FORBIDDEN), `error.message`, `error.details.required_capability`. | Mismo |
| 2.3 | Superadmin sin LAWYER_SUPPORTS_EDIT → 403 en abogados/asistentes | Con token **superadmin**, llamar a `GET /api/admin/abogados/{id}/asistentes` o POST/DELETE. Debe devolver 403. | `lib/authz/capabilities.ts` (SUPERADMIN_CAPABILITIES sin LAWYER_SUPPORTS_EDIT) |

---

## 3. Estados de usuario – INVITED, SUSPENDED, DEACTIVATED

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 3.1 | Usuario con status distinto de ACTIVE no accede a endpoints protegidos | Si en BD el usuario tiene `status = 'SUSPENDED'` (o `activo = false` y status derivado), las llamadas a APIs protegidas con `requireCapability` deben devolver 403 “Usuario suspendido” / “Cuenta no activa”. | `requireCapability`: comprueba `ctx.status === 'ACTIVE'` |
| 3.2 | Usuario INVITED | El flujo de invitación crea solo registro en `user_invitations`; el usuario en `usuarios` se crea al **activar**. Hasta entonces no existe usuario con status INVITED en `usuarios`. Quien tenga token de invitación pero no haya activado no tiene sesión; por tanto no accede a endpoints que requieren auth. | Flujo invite → activate en Paso 4 |
| 3.3 | DEACTIVATED | Si el dominio define DEACTIVATED y se refleja en `status`, `requireCapability` ya bloquea cualquier status !== 'ACTIVE'. | Mismo que 3.1 |

---

## 4. Invitaciones – Resend invalida token anterior

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 4.1 | Resend genera nuevo token y actualiza hash en BD | Crear invitación, llamar a `POST /api/admin/usuarios/invite/resend` con `invitation_id`. En BD el registro debe tener nuevo `token` (hash) y `resent_at` actualizado. | `invitation-service.ts`: `resendInvitation` |
| 4.2 | Token anterior deja de funcionar en activate | Usar el token **antiguo** (antes del resend) en `POST /api/auth/activate`. Debe fallar (404 o CONFLICT). Usar el token **nuevo** (devuelto en la respuesta de resend) en activate; debe funcionar. | `findInvitationByPlainToken` busca por hash; el viejo ya no coincide |

---

## 5. ReBAC – Respeto a notaría (sin cruce de tenant)

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 5.1 | Notario solo ve trámites de su notaría | Con usuario **notario** (notaria_id = A), `GET /api/expedientes/tramites` con parámetros que devuelvan lista: solo deben aparecer trámites cuyo owner (`user_id`) pertenece a notaría A. | `lib/authz/rebac.ts`: `listVisibleCases` para notario |
| 5.2 | Abogado solo ve sus propios trámites | Con usuario **abogado**, la lista de trámites debe filtrar por `user_id = ctx.userId`. | Mismo: rol abogado |
| 5.3 | Asistente solo ve trámites **asignados explícitamente** | El asistente ve únicamente trámites que aparecen en `tramite_asignaciones` con `assistant_id = ctx.userId` y `notaria_id` de su notaría. Aunque esté en `usuarios_supports_lawyer` de un abogado, si no hay fila en `tramite_asignaciones` para ese trámite, no lo ve. | `lib/authz/rebac.ts`: asistente usa `listTramitesAsignadosAAsistente` |
| 5.4 | APIs de abogados/asistentes respetan notaría | Con **notario** de notaría A, no puede asignar asistentes a abogados de notaría B. Las rutas comprueban `lawyer.notaria_id === ctx.notaryOfficeId`. | `app/api/admin/abogados/[lawyerId]/asistentes/route.ts` |

---

## 6. Auditoría en eventos críticos

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 6.1 | Invitación creada → registro en audit_logs | Tras `POST /api/admin/usuarios/invite`, debe existir fila en `audit_logs` con `action = 'USER_INVITED'`, `entity_type = 'user_invitation'`, `entity_id` = id de la invitación. | `app/api/admin/usuarios/invite/route.ts` |
| 6.2 | Resend y revoke → audit | Tras resend y revoke, debe haber registros `USER_INVITATION_RESENT` y `USER_INVITATION_REVOKED`. | Rutas resend/revoke |
| 6.3 | Activate → audit | Tras `POST /api/auth/activate` correcto, debe haber registro `USER_ACTIVATED`. | `app/api/auth/activate/route.ts` |
| 6.4 | Asignar/quitar asistente → audit | Tras POST/DELETE en abogados/asistentes, debe haber `LAWYER_SUPPORT_ASSIGNED` y `LAWYER_SUPPORT_REMOVED`. | Rutas abogados/asistentes |
| 6.5 | Asignar/quitar trámite a asistente → audit | Tras `POST /api/expedientes/tramites/[id]/asignaciones` y `DELETE .../asignaciones/[assistantId]`, debe haber registros `TRAMITE_ASSIGNED_TO_ASSISTANT` y `TRAMITE_UNASSIGNED_FROM_ASSISTANT` en `audit_logs` (entity_type: tramites, entity_id: tramite_id, metadata: lawyer_id, assistant_id, notaria_id). | `app/api/expedientes/tramites/[id]/asignaciones/route.ts` y `[assistantId]/route.ts` |

---

## 7. Asignación de trámites a asistentes (ReBAC fino)

| # | Verificación | Cómo validar | Referencia |
|---|--------------|--------------|------------|
| 7.1 | Asistente sin asignaciones no ve trámites de ese abogado | Con un asistente vinculado a un abogado en `usuarios_supports_lawyer` pero **sin** ninguna fila en `tramite_asignaciones` para ese abogado, el asistente no debe ver trámites de ese abogado en `GET /api/expedientes/tramites` (ni en lista por comprador). | `lib/authz/rebac.ts`: `listVisibleCases` / `listTramitesAsignadosAAsistente` |
| 7.2 | Asistente con asignación ve solo los trámites asignados | Crear una o más filas en `tramite_asignaciones` (tramite_id, assistant_id, lawyer_id, notaria_id). El asistente debe ver solo esos trámites en lista y poder abrir su detalle; no debe ver otros trámites del mismo abogado no asignados. | Mismo + `canReadCase` |
| 7.3 | Abogado solo puede asignar sus propios trámites y solo a sus asistentes | Con token de **abogado A**, llamar a `POST /api/expedientes/tramites/{tramite_de_abogado_B}/asignaciones` con `{ assistant_id }`. Debe devolver 403. Con token de abogado A, asignar solo a asistentes que estén en `usuarios_supports_lawyer` con abogado A; intentar con assistant_id de un asistente de otro abogado debe fallar (403 o 422). | Rutas asignaciones: validación `tramites.user_id === ctx.userId` y servicio `asignarTramiteAAasistente` (findActiveRelation) |
| 7.4 | Notaría: no cruce de tenant | Asignaciones y visibilidad respetan `notaria_id`: un asistente de notaría A no debe ver trámites asignados de notaría B; las APIs de asignación validan que lawyer y assistant pertenezcan a la misma notaría. | `tramite-asignacion-service.ts`: `userBelongsToNotaria`, ReBAC por `notaria_id` |

---

## 8. Resumen de ejecución

- **Middleware:** Probar con abogado/asistente que no puedan abrir `/dashboard/admin/*` (redirección).
- **403 uniforme:** Probar al menos un endpoint protegido sin capability y comprobar body `{ ok: false, error: { code, message, details } }`.
- **Status no ACTIVE:** Comprobar que un usuario con status SUSPENDED reciba 403 en un endpoint protegido.
- **Resend:** Comprobar que el token viejo no sirva en activate tras un resend.
- **ReBAC:** Comprobar que notario/abogado/asistente solo vean los trámites esperados (por notaría y por asignaciones explícitas para asistentes).
- **Auditoría:** Comprobar en tabla `audit_logs` que existan registros para invite, resend, revoke, activate, supports_lawyer y asignación de trámites (TRAMITE_ASSIGNED_TO_ASSISTANT, TRAMITE_UNASSIGNED_FROM_ASSISTANT).
- **Asignación trámites:** Comprobar que el asistente sin asignaciones no vea trámites del abogado; con asignaciones vea solo los asignados; el abogado solo asigne sus trámites a sus asistentes; y no haya cruce de notaría.

Cuando todos los ítems relevantes estén validados, marcar el Paso 8 como completado en `IMPLEMENTATION_CHECKLIST.md`. Para el flujo de asignación de trámites, ver `IMPLEMENTATION_ASIGNACION_TRAMITES.md` Paso 4.
