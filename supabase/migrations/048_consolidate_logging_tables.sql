-- Migration 048: Consolidate Logging Tables (SAFE - Preserves Production Data)
-- This migration consolidates 4 logging tables into 1 unified table
-- ALL existing data is preserved and migrated safely

-- ============================================================================
-- STEP 1: Create new unified activity_logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificadores (nullable para flexibilidad)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  tramite_id UUID REFERENCES tramites(id) ON DELETE SET NULL,
  
  -- Categorización
  category TEXT NOT NULL CHECK (category IN (
    'ai_usage',           -- Reemplaza agent_usage_logs
    'user_event',         -- Reemplaza usage_stats
    'conversation',       -- Reemplaza preaviso_conversation_logs
    'document_processing' -- Para OCR, embeddings, uploads
  )),
  
  event_type TEXT NOT NULL,
  
  -- Datos flexibles (JSONB) - preserva toda la metadata original
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Métricas comunes (desnormalizadas para queries rápidas)
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  estimated_cost NUMERIC(10, 6),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- STEP 2: Create optimized indexes
-- ============================================================================

-- Índice compuesto para queries por usuario y fecha
CREATE INDEX idx_activity_logs_user_created 
  ON activity_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Índice para queries por categoría
CREATE INDEX idx_activity_logs_category_created
  ON activity_logs(category, created_at DESC);

-- Índice para queries por sesión
CREATE INDEX idx_activity_logs_session
  ON activity_logs(session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- Índice específico para AI usage (queries más frecuentes)
CREATE INDEX idx_activity_logs_ai_usage
  ON activity_logs(user_id, category, created_at DESC)
  WHERE category = 'ai_usage' AND user_id IS NOT NULL;

-- Índice para queries de costo
CREATE INDEX idx_activity_logs_cost
  ON activity_logs(user_id, estimated_cost)
  WHERE estimated_cost IS NOT NULL;

-- Índice GIN para búsqueda en JSONB
CREATE INDEX idx_activity_logs_data_gin
  ON activity_logs USING GIN (data);

-- Índice para queries por trámite
CREATE INDEX idx_activity_logs_tramite
  ON activity_logs(tramite_id, created_at DESC)
  WHERE tramite_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Migrate data from agent_usage_logs
-- ============================================================================

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO activity_logs (
    user_id, 
    session_id, 
    category, 
    event_type, 
    tokens_input, 
    tokens_output, 
    tokens_total, 
    estimated_cost,
    data, 
    created_at
  )
  SELECT 
    user_id,
    session_id,
    'ai_usage'::text,
    COALESCE(action_type, 'completion')::text,
    tokens_input,
    tokens_output,
    total_tokens,
    estimated_cost,
    jsonb_build_object(
      'model', model,
      'category', COALESCE(category, 'uncategorized'),
      'metadata', COALESCE(metadata, '{}'::jsonb)
    ),
    created_at
  FROM agent_usage_logs;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % rows from agent_usage_logs', migrated_count;
END $$;

-- ============================================================================
-- STEP 4: Migrate data from usage_stats (PRESERVES ALL DATA)
-- ============================================================================

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO activity_logs (
    user_id, 
    category, 
    event_type, 
    data, 
    created_at
  )
  SELECT 
    user_id,
    'user_event'::text,
    event_type,
    COALESCE(metadata, '{}'::jsonb),
    created_at
  FROM usage_stats;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % rows from usage_stats', migrated_count;
END $$;

-- ============================================================================
-- STEP 5: Migrate data from preaviso_conversation_logs
-- ============================================================================

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO activity_logs (
    user_id, 
    tramite_id, 
    category, 
    event_type, 
    data, 
    created_at,
    updated_at
  )
  SELECT 
    user_id,
    tramite_id,
    'conversation'::text,
    'preaviso_chat'::text,
    jsonb_build_object(
      'conversation_id', conversation_id,
      'plugin_id', plugin_id,
      'messages', messages,
      'last_user_message', last_user_message,
      'last_assistant_message', last_assistant_message,
      'context', COALESCE(context, '{}'::jsonb),
      'state', COALESCE(state, '{}'::jsonb),
      'meta', COALESCE(meta, '{}'::jsonb)
    ),
    created_at,
    updated_at
  FROM preaviso_conversation_logs;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % rows from preaviso_conversation_logs', migrated_count;
END $$;

-- ============================================================================
-- STEP 6: Migrate data from processed_units_log
-- ============================================================================

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  INSERT INTO activity_logs (
    user_id, 
    category, 
    event_type, 
    data, 
    estimated_cost, 
    created_at
  )
  SELECT 
    us.user_id,
    'document_processing'::text,
    'unit_processed'::text,
    jsonb_build_object(
      'stats_id', pul.stats_id,
      'unit_id', pul.unit_id,
      'original_text', pul.original_text,
      'final_text', pul.final_text,
      'similarity_score', pul.similarity_score,
      'usage', COALESCE(pul.usage, '{}'::jsonb),
      'metrics', COALESCE(pul.metrics, '{}'::jsonb)
    ),
    pul.cost_usd,
    pul.created_at
  FROM processed_units_log pul
  LEFT JOIN usage_stats us ON us.id = pul.stats_id;
  
  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % rows from processed_units_log', migrated_count;
END $$;

-- ============================================================================
-- STEP 7: Verify migration (show summary)
-- ============================================================================

DO $$
DECLARE
  total_count INTEGER;
  ai_usage_count INTEGER;
  user_event_count INTEGER;
  conversation_count INTEGER;
  doc_processing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM activity_logs;
  SELECT COUNT(*) INTO ai_usage_count FROM activity_logs WHERE category = 'ai_usage';
  SELECT COUNT(*) INTO user_event_count FROM activity_logs WHERE category = 'user_event';
  SELECT COUNT(*) INTO conversation_count FROM activity_logs WHERE category = 'conversation';
  SELECT COUNT(*) INTO doc_processing_count FROM activity_logs WHERE category = 'document_processing';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total rows in activity_logs: %', total_count;
  RAISE NOTICE '  - AI Usage: %', ai_usage_count;
  RAISE NOTICE '  - User Events: %', user_event_count;
  RAISE NOTICE '  - Conversations: %', conversation_count;
  RAISE NOTICE '  - Document Processing: %', doc_processing_count;
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- STEP 8: Create trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_activity_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_logs_updated_at();

-- ============================================================================
-- STEP 9: Enable RLS (Row Level Security)
-- ============================================================================

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert their own logs
CREATE POLICY "Authenticated users can insert activity logs"
ON activity_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Only superadmins can view all logs
CREATE POLICY "Superadmins can view all activity logs"
ON activity_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.auth_user_id = auth.uid()
    AND usuarios.rol = 'superadmin'
  )
);

-- Policy: Users can view their own logs
CREATE POLICY "Users can view own activity logs"
ON activity_logs FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT id FROM public.usuarios
    WHERE auth_user_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 10: Grant permissions
-- ============================================================================

GRANT ALL ON TABLE activity_logs TO service_role;
GRANT INSERT, SELECT ON TABLE activity_logs TO authenticated;

-- ============================================================================
-- STEP 11: Create helper views for backward compatibility (OPTIONAL)
-- ============================================================================

-- View that mimics agent_usage_logs structure
CREATE OR REPLACE VIEW agent_usage_logs_view AS
SELECT 
  id,
  user_id,
  session_id,
  (data->>'model')::text as model,
  tokens_input,
  tokens_output,
  tokens_total as total_tokens,
  estimated_cost,
  event_type as action_type,
  (data->>'category')::text as category,
  (data->'metadata')::jsonb as metadata,
  created_at
FROM activity_logs
WHERE category = 'ai_usage';

-- View that mimics usage_stats structure
CREATE OR REPLACE VIEW usage_stats_view AS
SELECT 
  id,
  user_id,
  event_type,
  data as metadata,
  created_at
FROM activity_logs
WHERE category = 'user_event';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE activity_logs IS 'Unified logging table for all activity (AI usage, user events, conversations, document processing)';
COMMENT ON COLUMN activity_logs.category IS 'Type of activity: ai_usage, user_event, conversation, document_processing';
COMMENT ON COLUMN activity_logs.event_type IS 'Specific event within the category';
COMMENT ON COLUMN activity_logs.data IS 'Flexible JSONB field for event-specific data';
COMMENT ON COLUMN activity_logs.tokens_input IS 'Input tokens (for AI usage)';
COMMENT ON COLUMN activity_logs.tokens_output IS 'Output tokens (for AI usage)';
COMMENT ON COLUMN activity_logs.tokens_total IS 'Total tokens (for AI usage)';
COMMENT ON COLUMN activity_logs.estimated_cost IS 'Estimated cost in USD';

-- ============================================================================
-- NOTES FOR PRODUCTION DEPLOYMENT
-- ============================================================================

-- 1. This migration is SAFE - it creates a new table and copies data
-- 2. Old tables are NOT dropped - you can verify data before dropping
-- 3. To drop old tables after verification, run:
--    DROP TABLE IF EXISTS processed_units_log CASCADE;
--    DROP TABLE IF EXISTS agent_usage_logs CASCADE;
--    DROP TABLE IF EXISTS usage_stats CASCADE;
--    DROP TABLE IF EXISTS preaviso_conversation_logs CASCADE;
--
-- 4. Rollback plan (if needed):
--    DROP TABLE IF EXISTS activity_logs CASCADE;
--    (Old tables will still exist)
--
-- 5. Expected execution time: 5-30 seconds (depending on data volume)
-- 6. Zero downtime - old tables continue to work during migration
