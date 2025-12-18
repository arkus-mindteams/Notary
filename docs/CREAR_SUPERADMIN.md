# Crear Usuario Superadmin

## Método 1: Script Automático (Recomendado)

Ejecuta el script desde la raíz del proyecto:

```bash
npx tsx scripts/create-superadmin.ts <email> <password> <nombre> [apellido_paterno] [apellido_materno] [telefono]
```

### Ejemplo:

```bash
npx tsx scripts/create-superadmin.ts admin@notaria.com Admin123! "Admin Principal" "García" "López" "5551234567"
```

### Requisitos:

- **Email**: Debe ser un email válido y único
- **Password**: Mínimo 6 caracteres (recomendado: usar una contraseña segura)
- **Nombre**: Nombre completo del administrador

### Variables de Entorno Necesarias:

Asegúrate de tener configuradas estas variables en tu `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

## Método 2: Manual (Supabase Dashboard)

Si prefieres crear el usuario manualmente:

### Paso 1: Crear usuario en Supabase Auth

1. Ve al dashboard de Supabase
2. Navega a **Authentication** > **Users**
3. Haz clic en **Add User** > **Create New User**
4. Completa:
   - Email: `admin@notaria.com`
   - Password: (elige una contraseña segura)
   - Auto Confirm User: ✅ (marcar)
5. Haz clic en **Create User**
6. **Copia el User ID** que se genera (lo necesitarás en el siguiente paso)

### Paso 2: Crear registro en tabla usuarios

Ejecuta este SQL en el SQL Editor de Supabase:

```sql
INSERT INTO usuarios (
  notaria_id,
  auth_user_id,
  email,
  nombre,
  apellido_paterno,
  apellido_materno,
  telefono,
  rol,
  activo
) VALUES (
  NULL, -- Superadmin no tiene notaría
  'AQUI_VA_EL_USER_ID_DE_SUPABASE_AUTH', -- Reemplaza con el User ID del paso 1
  'admin@notaria.com',
  'Admin',
  'Principal',
  NULL,
  NULL,
  'superadmin',
  true
);
```

**Importante**: Reemplaza `'AQUI_VA_EL_USER_ID_DE_SUPABASE_AUTH'` con el User ID que copiaste en el Paso 1.

## Verificación

Después de crear el superadmin, puedes verificar que se creó correctamente:

```sql
SELECT id, email, nombre, rol, activo 
FROM usuarios 
WHERE rol = 'superadmin';
```

## Iniciar Sesión

Una vez creado el superadmin, puedes iniciar sesión en la aplicación:

1. Ve a `/login`
2. Ingresa el email y contraseña del superadmin
3. Deberías ser redirigido al dashboard
4. Verás la sección "Administración" en el sidebar (solo visible para superadmin)

## Notas Importantes

- ⚠️ **Solo debe haber un superadmin** (o muy pocos) por seguridad
- 🔒 **Usa una contraseña segura** para el superadmin
- 📝 **Guarda las credenciales** en un lugar seguro
- 🚫 **No compartas** las credenciales del superadmin

