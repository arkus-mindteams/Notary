-- Migración: Hacer RFC opcional en compradores
-- Motivo: el sistema trata RFC como opcional (se puede no tener aún),
-- pero la tabla `compradores` fue creada con `rfc TEXT NOT NULL UNIQUE`,
-- causando errores al crear compradores con rfc = null.

ALTER TABLE compradores
  ALTER COLUMN rfc DROP NOT NULL;

-- Nota: se conserva UNIQUE; en Postgres múltiples NULLs NO violan UNIQUE.


