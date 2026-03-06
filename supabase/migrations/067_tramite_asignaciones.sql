-- Asignación de expedientes/trámites a asistentes (ReBAC fino).
-- El abogado dueño del trámite asigna a qué asistentes (de sus supports_lawyer) puede ver cada trámite.

CREATE TABLE IF NOT EXISTS tramite_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id uuid NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  assistant_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lawyer_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  notaria_id uuid NOT NULL REFERENCES notarias(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tramite_asignaciones_tramite_assistant_unique UNIQUE (tramite_id, assistant_id)
);

CREATE INDEX IF NOT EXISTS idx_tramite_asignaciones_tramite_id
  ON tramite_asignaciones (tramite_id);

CREATE INDEX IF NOT EXISTS idx_tramite_asignaciones_assistant_id
  ON tramite_asignaciones (assistant_id);

CREATE INDEX IF NOT EXISTS idx_tramite_asignaciones_lawyer_notaria
  ON tramite_asignaciones (lawyer_id, notaria_id);

CREATE INDEX IF NOT EXISTS idx_tramite_asignaciones_created_at
  ON tramite_asignaciones (created_at DESC);