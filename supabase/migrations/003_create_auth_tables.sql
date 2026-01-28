-- Migración: Sistema de Autenticación y Gestión de Usuarios
-- Roles: superadmin (global) y abogado (pertenece a notaría)

-- Tabla: notarias
CREATE TABLE IF NOT EXISTS notarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notarias_activo ON notarias(activo);

-- Crear notaría por defecto
INSERT INTO notarias (id, nombre, activo) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Notaría Pública #3', true)
ON CONFLICT (id) DO NOTHING;

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notaria_id UUID REFERENCES notarias(id) ON DELETE SET NULL, -- NULL para superadmin
  
  -- Información de autenticación (Supabase Auth)
  auth_user_id UUID UNIQUE, -- ID del usuario en Supabase Auth
  
  -- Información personal
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  apellido_paterno TEXT,
  apellido_materno TEXT,
  telefono TEXT,
  
  -- Rol del usuario
  rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'abogado')),
  
  -- Estado
  activo BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraint: abogados deben tener notaria_id
  CONSTRAINT usuarios_abogado_notaria CHECK (
    (rol = 'superadmin' AND notaria_id IS NULL) OR
    (rol = 'abogado' AND notaria_id IS NOT NULL)
  )
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_usuarios_notaria_id ON usuarios(notaria_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_notaria_rol ON usuarios(notaria_id, rol);

-- Trigger para updated_at en notarias
CREATE TRIGGER update_notarias_updated_at
  BEFORE UPDATE ON notarias
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at en usuarios
CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Actualizar tabla tramites para incluir usuario_id
ALTER TABLE tramites 
ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tramites_usuario_id ON tramites(usuario_id);

-- Actualizar tabla documentos para incluir usuario_id
ALTER TABLE documentos 
ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_usuario_id ON documentos(usuario_id);

-- Actualizar tabla compradores para incluir notaria_id (preparación multi-tenant)
ALTER TABLE compradores 
ADD COLUMN IF NOT EXISTS notaria_id UUID REFERENCES notarias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_compradores_notaria_id ON compradores(notaria_id);

-- Asignar notaría por defecto a registros existentes (si los hay)
UPDATE compradores SET notaria_id = '00000000-0000-0000-0000-000000000001' WHERE notaria_id IS NULL;

-- Hacer notaria_id NOT NULL después de asignar valores por defecto
ALTER TABLE compradores ALTER COLUMN notaria_id SET NOT NULL;

-- Comentarios para documentación
COMMENT ON TABLE notarias IS 'Notarías del sistema (preparación para multi-tenant)';
COMMENT ON TABLE usuarios IS 'Usuarios del sistema (superadmin y abogados). Vinculados a Supabase Auth.';
COMMENT ON COLUMN usuarios.auth_user_id IS 'ID del usuario en Supabase Auth (tabla auth.users)';
COMMENT ON COLUMN usuarios.notaria_id IS 'Notaría a la que pertenece el usuario. NULL para superadmin (es global)';
COMMENT ON COLUMN usuarios.rol IS 'Rol del usuario: superadmin (global) o abogado (pertenece a notaría)';
COMMENT ON COLUMN tramites.usuario_id IS 'Usuario que creó el trámite';
COMMENT ON COLUMN documentos.usuario_id IS 'Usuario que subió el documento';
COMMENT ON COLUMN compradores.notaria_id IS 'Notaría a la que pertenece el comprador (preparación multi-tenant)';
