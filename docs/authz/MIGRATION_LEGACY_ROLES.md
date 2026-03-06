# Migración de roles: una sola columna `rol`

Objetivo: soportar los nuevos roles (notario, asistente) **extendiendo la columna `rol` existente** en BD y código, sin añadir una segunda variable de roles. Así se evita desincronización y confusión.

---

## 1. Enfoque elegido

- **Una sola columna en BD**: `usuarios.rol` con valores `'superadmin' | 'notario' | 'abogado' | 'asistente'`.
- **Tipos**: `UserRole = 'superadmin' | 'notario' | 'abogado' | 'asistente'`.
- **Constraint notaría**: `superadmin` → `notaria_id` NULL; `notario`, `abogado`, `asistente` → `notaria_id` NOT NULL.

No se usa columna `rol_logico`; la semántica de roles vive solo en `rol`.

---

## 2. Migración 065

- Se amplía el `CHECK` de `rol` para permitir `'notario'` y `'asistente'`.
- Se actualiza el constraint de notaría para que los tres roles de notaría exijan `notaria_id`.
- Se añade columna `status` (ACTIVE | SUSPENDED) y backfill desde `activo`.

---

## 3. Autorización en código

- **`canAccessAdmin(usuario)`**: `usuario.rol === 'superadmin' || usuario.rol === 'notario'`. Usar en rutas admin por notaría (usuarios, preaviso-config, etc.).
- **`canAccessGlobalAdmin(usuario)`**: `usuario.rol === 'superadmin'`. Usar en rutas globales (listar/crear notarías).
- En respuestas API (auth/me, login) se devuelve `role: usuario.rol` (los 4 valores). El frontend muestra “Administrador” para superadmin, “Notario”, “Abogado”, “Asistente” según corresponda.

---

## 4. Alcance por notaría

- Si el usuario es **notario** (`rol === 'notario'`), en listados y operaciones admin (ej. GET/PATCH/DELETE usuarios) filtrar por `usuario.notaria_id` para que solo vea y gestione usuarios de su notaría.

---

## 5. Validaciones al crear/actualizar usuario

- `superadmin` → `notaria_id` debe ser null.
- `notario`, `abogado`, `asistente` → `notaria_id` obligatorio.

Implementado en `lib/services/usuario-service.ts` y en el formulario de admin/usuarios.
