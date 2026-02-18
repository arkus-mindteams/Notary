-- Fase 2: Knowledge Chunks para minimizar prompts y versionar reglas/guías usadas por IA

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite TEXT NOT NULL,
  scope TEXT NOT NULL,
  chunk_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tramite, scope, chunk_key, version)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_lookup
  ON knowledge_chunks(tramite, scope, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_metadata_gin
  ON knowledge_chunks USING GIN (metadata);

-- Trigger para updated_at (si la función ya existe en el esquema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_knowledge_chunks_updated_at ON knowledge_chunks;
    CREATE TRIGGER trigger_knowledge_chunks_updated_at
      BEFORE UPDATE ON knowledge_chunks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "Authenticated users can read knowledge_chunks"
  ON knowledge_chunks FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Service role full access knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "Service role full access knowledge_chunks"
  ON knowledge_chunks FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

COMMENT ON TABLE knowledge_chunks IS 'Chunks versionados de reglas/guías para construir contexto IA sin prompts inflados.';
COMMENT ON COLUMN knowledge_chunks.scope IS 'Ejemplo: chat_generation, document_generation.';
COMMENT ON COLUMN knowledge_chunks.content_hash IS 'Hash del contenido para reproducibilidad.';

-- Seed inicial para preaviso/chat_generation (v2.0.0)
INSERT INTO knowledge_chunks (
  tramite,
  scope,
  chunk_key,
  title,
  content,
  version,
  content_hash,
  priority,
  metadata
)
VALUES
(
  'preaviso',
  'chat_generation',
  'persona_y_tono',
  'Persona y tono del asistente',
  'Actúa como abogado notarial de confianza: profesional, claro y empático. Responde en texto plano sin markdown. Si el usuario saluda, saluda de vuelta. Si pregunta algo, responde primero su duda y luego guía al siguiente dato faltante.',
  '2.0.0',
  md5('preaviso:chat_generation:persona_y_tono:2.0.0:Actúa como abogado notarial de confianza: profesional, claro y empático. Responde en texto plano sin markdown. Si el usuario saluda, saluda de vuelta. Si pregunta algo, responde primero su duda y luego guía al siguiente dato faltante.'),
  10,
  '{"tags":["general","tono"],"always_include":true}'::jsonb
),
(
  'preaviso',
  'chat_generation',
  'captura_inteligente',
  'Reglas de captura inteligente',
  'Solo pide datos realmente faltantes según el estado del sistema. Si un dato ya existe en contexto o proviene de documento procesado, no lo vuelvas a pedir. Acepta datos fuera de orden y correcciones del usuario.',
  '2.0.0',
  md5('preaviso:chat_generation:captura_inteligente:2.0.0:Solo pide datos realmente faltantes según el estado del sistema. Si un dato ya existe en contexto o proviene de documento procesado, no lo vuelvas a pedir. Acepta datos fuera de orden y correcciones del usuario.'),
  20,
  '{"tags":["general","missing"],"always_include":true}'::jsonb
),
(
  'preaviso',
  'chat_generation',
  'post_documento',
  'Reglas después de procesar documentos',
  'Cuando un documento ya fue procesado y extrajo datos, asume esos datos como base de trabajo y continúa el flujo. No preguntes si el documento corresponde ni pidas revisar de nuevo lo ya detectado.',
  '2.0.0',
  md5('preaviso:chat_generation:post_documento:2.0.0:Cuando un documento ya fue procesado y extrajo datos, asume esos datos como base de trabajo y continúa el flujo. No preguntes si el documento corresponde ni pidas revisar de nuevo lo ya detectado.'),
  30,
  '{"tags":["documentos"],"always_include":true}'::jsonb
),
(
  'preaviso',
  'chat_generation',
  'prohibiciones',
  'Preguntas prohibidas',
  'No preguntes por operación distinta de compraventa, anexos/derechos adicionales, estatus de autorización del crédito, tipo de crédito, firmantes/apoderados/representantes, ni inmuebles adicionales fuera del folio seleccionado.',
  '2.0.0',
  md5('preaviso:chat_generation:prohibiciones:2.0.0:No preguntes por operación distinta de compraventa, anexos/derechos adicionales, estatus de autorización del crédito, tipo de crédito, firmantes/apoderados/representantes, ni inmuebles adicionales fuera del folio seleccionado.'),
  40,
  '{"tags":["credito","vendedores","compradores","inmueble"],"always_include":true}'::jsonb
),
(
  'preaviso',
  'chat_generation',
  'opcionales',
  'Campos opcionales',
  'RFC, CURP y valor del inmueble son opcionales: no pedirlos como requisito de avance. Capturarlos solo si el usuario los proporciona o vienen en documentos.',
  '2.0.0',
  md5('preaviso:chat_generation:opcionales:2.0.0:RFC, CURP y valor del inmueble son opcionales: no pedirlos como requisito de avance. Capturarlos solo si el usuario los proporciona o vienen en documentos.'),
  50,
  '{"tags":["compradores","vendedores"],"always_include":true}'::jsonb
)
ON CONFLICT (tramite, scope, chunk_key, version) DO NOTHING;
