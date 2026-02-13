-- Verificación del Paso 1: Consolidación de Base de Datos
-- Ejecuta estos queries en Supabase SQL Editor para verificar que todo funcionó

-- ============================================================================
-- 1. Verificar que activity_logs tiene datos migrados
-- ============================================================================

SELECT 
  category,
  COUNT(*) as count,
  SUM(tokens_total) as total_tokens,
  SUM(estimated_cost) as total_cost
FROM activity_logs
GROUP BY category
ORDER BY count DESC;

-- Resultado esperado:
-- category              | count | total_tokens | total_cost
-- ----------------------|-------|--------------|------------
-- ai_usage              | X     | XXXXX        | X.XXXX
-- user_event            | X     | NULL         | NULL
-- conversation          | X     | NULL         | NULL
-- document_processing   | X     | NULL         | X.XXXX


-- ============================================================================
-- 2. Verificar que chat_session_documents está lista
-- ============================================================================

SELECT COUNT(*) as total_rows FROM chat_session_documents;

-- Resultado esperado: 0 (tabla vacía, se llenará cuando subas documentos)


-- ============================================================================
-- 3. Comparar datos: Antes vs Después
-- ============================================================================

-- Contar registros en tablas antiguas
SELECT 
  'agent_usage_logs' as tabla,
  COUNT(*) as count
FROM agent_usage_logs
UNION ALL
SELECT 
  'usage_stats' as tabla,
  COUNT(*) as count
FROM usage_stats
UNION ALL
SELECT 
  'preaviso_conversation_logs' as tabla,
  COUNT(*) as count
FROM preaviso_conversation_logs
UNION ALL
SELECT 
  'processed_units_log' as tabla,
  COUNT(*) as count
FROM processed_units_log
UNION ALL
SELECT 
  'activity_logs (TOTAL)' as tabla,
  COUNT(*) as count
FROM activity_logs;

-- Verificar que la suma de las primeras 4 = activity_logs total


-- ============================================================================
-- 4. Ver ejemplos de datos migrados
-- ============================================================================

-- Ver últimos 5 logs de AI usage
SELECT 
  id,
  user_id,
  session_id,
  event_type,
  tokens_total,
  estimated_cost,
  data->>'model' as model,
  created_at
FROM activity_logs
WHERE category = 'ai_usage'
ORDER BY created_at DESC
LIMIT 5;


-- ============================================================================
-- 5. Verificar índices creados
-- ============================================================================

SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'activity_logs'
ORDER BY indexname;

-- Deberías ver ~7 índices creados


-- ============================================================================
-- 6. Verificar RLS policies
-- ============================================================================

SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('activity_logs', 'chat_session_documents')
ORDER BY tablename, policyname;
