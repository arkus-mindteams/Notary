-- =============================================================================
-- Migración PRODUCCIÓN: usage_stats → activity_logs (Release 2.1.2)
-- =============================================================================
-- Uso: ejecutar en la base de datos de producción donde existe usage_stats
--      y se quiere adoptar la nueva tabla unificada activity_logs para logging.
--
-- Requisitos:
--   - Tabla usage_stats existente (creada por 020_create_usage_stats.sql).
--   - Tabla public.usuarios con columnas id y auth_user_id.
--   - Opcional: chat_sessions, tramites si quieres FKs; si no, se pueden omitir.
--
-- Ejecutar UNA SOLA VEZ. Si activity_logs ya existe y tiene datos, revisar
-- antes de volver a ejecutar (evitar duplicados).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Crear tabla activity_logs si no existe
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID NULL,
  tramite_id UUID NULL,

  category TEXT NOT NULL CHECK (category IN (
    'ai_usage',
    'user_event',
    'conversation',
    'document_processing'
  )),

  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,

  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  estimated_cost NUMERIC(10, 6),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices (IF NOT EXISTS para re-ejecución segura)
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
  ON activity_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_category_created
  ON activity_logs(category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_session
  ON activity_logs(session_id, created_at DESC) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_ai_usage
  ON activity_logs(user_id, category, created_at DESC)
  WHERE category = 'ai_usage' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_cost
  ON activity_logs(user_id, estimated_cost) WHERE estimated_cost IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_data_gin
  ON activity_logs USING GIN (data);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tramite
  ON activity_logs(tramite_id, created_at DESC) WHERE tramite_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_activity_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_activity_logs_updated_at ON activity_logs;
CREATE TRIGGER trigger_activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_logs_updated_at();

-- -----------------------------------------------------------------------------
-- 2. RLS y políticas (solo superadmins pueden leer)
-- -----------------------------------------------------------------------------

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON activity_logs;
CREATE POLICY "Authenticated users can insert activity logs"
  ON activity_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Superadmins can view all activity logs" ON activity_logs;
CREATE POLICY "Superadmins can view all activity logs"
  ON activity_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE usuarios.auth_user_id = auth.uid() AND usuarios.rol = 'superadmin'
    )
  );

GRANT ALL ON TABLE activity_logs TO service_role;
GRANT INSERT, SELECT ON TABLE activity_logs TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Migrar datos de usage_stats → activity_logs
--    usage_stats.user_id es public.usuarios.id; activity_logs.user_id debe ser
--    auth.users.id (usuarios.auth_user_id). Se hace JOIN con usuarios.
-- -----------------------------------------------------------------------------

INSERT INTO activity_logs (
  user_id,
  category,
  event_type,
  data,
  created_at,
  updated_at
)
SELECT
  u.auth_user_id,
  'user_event'::text,
  us.event_type,
  COALESCE(us.metadata, '{}'::jsonb) || jsonb_build_object('_migrated_from_usage_stats_id', us.id),
  us.created_at,
  COALESCE(us.created_at, NOW())
FROM usage_stats us
LEFT JOIN public.usuarios u ON u.id = us.user_id
WHERE NOT EXISTS (
  -- Evitar duplicados si se re-ejecuta: solo insertar si no hay ya un log
  -- con el mismo event_type y created_at para este usuario
  SELECT 1 FROM activity_logs al
  WHERE al.category = 'user_event'
    AND al.event_type = us.event_type
    AND al.created_at = us.created_at
    AND al.user_id IS NOT DISTINCT FROM u.auth_user_id
);

-- -----------------------------------------------------------------------------
-- 4. (Opcional) FK a usuarios para joins en PostgREST
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_activity_logs_usuarios'
  ) THEN
    ALTER TABLE activity_logs
      ADD CONSTRAINT fk_activity_logs_usuarios
      FOREIGN KEY (user_id) REFERENCES public.usuarios(auth_user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Vista de compatibilidad usage_stats_view (opcional)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW usage_stats_view AS
SELECT
  id,
  user_id,
  event_type,
  data AS metadata,
  created_at
FROM activity_logs
WHERE category = 'user_event';

-- -----------------------------------------------------------------------------
-- 6. Resumen
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  n_usage_stats BIGINT;
  n_user_events BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_usage_stats FROM usage_stats;
  SELECT COUNT(*) INTO n_user_events FROM activity_logs WHERE category = 'user_event';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migración usage_stats → activity_logs';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Filas en usage_stats:        %', n_usage_stats;
  RAISE NOTICE 'Filas en activity_logs (user_event): %', n_user_events;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'No se elimina usage_stats. Tras verificar, puedes:';
  RAISE NOTICE '  - Dejar usage_stats como respaldo, o';
  RAISE NOTICE '  - DROP TABLE usage_stats CASCADE; (cuando lo decida el equipo)';
END $$;

NOTIFY pgrst, 'reload schema';
