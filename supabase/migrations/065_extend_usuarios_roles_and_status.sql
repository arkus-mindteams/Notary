-- Extender la columna rol existente con los nuevos valores (una sola variable, sin rol_logico).
-- Constraint notaria: superadmin sin notaría; notario, abogado, asistente con notaría.

-- Quitar el CHECK antiguo de rol (nombre típico en PostgreSQL)
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

-- Un solo rol con 4 valores
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadmin', 'notario', 'abogado', 'asistente'));

-- Actualizar constraint notaria: superadmin sin notaría; el resto con notaría
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_abogado_notaria;

ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_notaria_check
  CHECK (
    (rol = 'superadmin' AND notaria_id IS NULL) OR
    (rol IN ('notario', 'abogado', 'asistente') AND notaria_id IS NOT NULL)
  );

-- Estado de cuenta (ACTIVE | SUSPENDED); activo se mantiene para compatibilidad
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'
  CHECK (status IN ('ACTIVE', 'SUSPENDED'));

-- Backfill status desde activo
UPDATE usuarios SET status = CASE WHEN activo THEN 'ACTIVE' ELSE 'SUSPENDED' END;

CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);