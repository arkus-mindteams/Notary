# Plan: Sistema de Autenticación y Gestión de Usuarios

## Objetivo
Crear un sistema de autenticación donde:
- Solo hay 2 roles: `superadmin` y `abogado`
- Los usuarios son creados únicamente por superadmin (no auto-registro)
- Los trámites y documentos se asocian al usuario que los crea
- Preparado para multi-tenant (solo nombre de notaría por ahora)

## Estructura de Base de Datos

### Tabla: `notarias`
```sql
- id (UUID, PK)
- nombre (TEXT, NOT NULL)
- activo (BOOLEAN, DEFAULT true)
- created_at, updated_at
```

### Tabla: `usuarios`
```sql
- id (UUID, PK)
- notaria_id (UUID, FK → notarias.id, NULL para superadmin)
- auth_user_id (UUID, UNIQUE) -- ID en Supabase Auth
- email (TEXT, UNIQUE, NOT NULL)
- nombre (TEXT, NOT NULL)
- apellido_paterno (TEXT)
- apellido_materno (TEXT)
- telefono (TEXT)
- rol (TEXT, CHECK: 'superadmin' | 'abogado')
- activo (BOOLEAN, DEFAULT true)
- created_at, updated_at, last_login_at
```

**Notas:**
- `notaria_id` es NULL para superadmin (es global)
- `notaria_id` es requerido para abogados

### Actualizaciones a tablas existentes:
- `tramites`: Agregar `usuario_id` (UUID, FK → usuarios.id)
- `documentos`: Agregar `usuario_id` (UUID, FK → usuarios.id)
- `compradores`: Agregar `notaria_id` (UUID, FK → notarias.id) -- preparación multi-tenant

## Flujo de Autenticación

1. **Login**: Usuario ingresa email/password → Supabase Auth valida → Busca usuario en tabla `usuarios` → Retorna info del usuario
2. **Crear Usuario** (solo superadmin):
   - Superadmin completa formulario (email, password, nombre, apellido, rol, notaría)
   - Sistema crea usuario en Supabase Auth
   - Sistema crea registro en tabla `usuarios`
   - Usuario puede iniciar sesión inmediatamente

## API Routes Necesarias

### Autenticación:
- `POST /api/auth/login` - Login con Supabase
- `GET /api/auth/me` - Obtener usuario actual
- `POST /api/auth/logout` - Cerrar sesión

### Administración (solo superadmin):
- `GET /api/admin/usuarios` - Listar usuarios
- `POST /api/admin/usuarios` - Crear usuario
- `PUT /api/admin/usuarios/[id]` - Actualizar usuario
- `DELETE /api/admin/usuarios/[id]` - Eliminar/desactivar usuario
- `GET /api/admin/notarias` - Listar notarías
- `POST /api/admin/notarias` - Crear notaría

## Componentes UI

1. **Panel de Administración** (`/dashboard/admin/usuarios`):
   - Lista de usuarios con filtros
   - Formulario para crear usuario
   - Editar usuario (modal o página)
   - Desactivar usuario

2. **Sidebar**: Agregar sección "Administración" solo para superadmin

## Servicios

- `lib/services/auth-service.ts` - Operaciones de autenticación
- `lib/services/usuario-service.ts` - CRUD de usuarios
- `lib/services/notaria-service.ts` - CRUD de notarías

## Integración con Sistema Actual

- Al crear trámite: Asociar `usuario_id` del usuario logueado
- Al subir documento: Asociar `usuario_id` del usuario logueado
- Al crear comprador: Asociar `notaria_id` del usuario logueado

## Migraciones SQL

1. Crear tabla `notarias`
2. Crear tabla `usuarios`
3. Agregar `usuario_id` a `tramites`
4. Agregar `usuario_id` a `documentos`
5. Agregar `notaria_id` a `compradores` (preparación multi-tenant)

## Respuestas Confirmadas

1. **Superadmin es global** - `notaria_id` será NULL para superadmin
2. **Abogados ven solo datos de su notaría** - Filtros por `notaria_id` en queries
3. **Campo teléfono** - Agregado a tabla usuarios
4. **Notaría por defecto** - Se crea "Notaría Pública #3" en migración

## Reglas de Acceso

- **Superadmin**: Ve todo (sin filtros)
- **Abogado**: Solo ve trámites/documentos/compradores de su `notaria_id`

