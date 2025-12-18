-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Tabla: compradores
CREATE TABLE IF NOT EXISTS compradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rfc TEXT NOT NULL UNIQUE,
  curp TEXT NOT NULL UNIQUE,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compradores_rfc ON compradores(rfc);
CREATE INDEX IF NOT EXISTS idx_compradores_curp ON compradores(curp);
CREATE INDEX IF NOT EXISTS idx_compradores_nombre ON compradores(nombre);

-- Trigger para updated_at en compradores
CREATE TRIGGER update_compradores_updated_at
  BEFORE UPDATE ON compradores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: tramites
CREATE TABLE IF NOT EXISTS tramites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id UUID NOT NULL REFERENCES compradores(id) ON DELETE CASCADE,
  
  -- Tipo de trámite (discriminador)
  tipo TEXT NOT NULL CHECK (tipo IN ('preaviso', 'plano_arquitectonico', 'otro')),
  
  -- Datos específicos del trámite (JSONB para flexibilidad)
  datos JSONB NOT NULL,
  
  -- Estado del trámite
  estado TEXT NOT NULL DEFAULT 'en_proceso' 
    CHECK (estado IN ('en_proceso', 'completado', 'archivado')),
  
  -- Documento generado (si aplica)
  documento_generado JSONB,
  
  -- Metadatos adicionales
  notas TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tramites_comprador_id ON tramites(comprador_id);
CREATE INDEX IF NOT EXISTS idx_tramites_tipo ON tramites(tipo);
CREATE INDEX IF NOT EXISTS idx_tramites_estado ON tramites(estado);
CREATE INDEX IF NOT EXISTS idx_tramites_comprador_tipo ON tramites(comprador_id, tipo);

-- Índice GIN para búsquedas en JSONB
CREATE INDEX IF NOT EXISTS idx_tramites_datos_gin ON tramites USING GIN (datos);

-- Trigger para updated_at en tramites
CREATE TRIGGER update_tramites_updated_at
  BEFORE UPDATE ON tramites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Tabla: documentos
CREATE TABLE IF NOT EXISTS documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id UUID NOT NULL REFERENCES compradores(id) ON DELETE CASCADE,
  
  -- Tipo de documento
  tipo TEXT NOT NULL CHECK (tipo IN (
    'escritura', 
    'plano', 
    'ine_vendedor', 
    'ine_comprador', 
    'rfc', 
    'documento_generado',
    'plano_arquitectonico',
    'croquis_catastral'
  )),
  
  nombre TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  url TEXT,
  tamaño BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  
  -- Metadatos adicionales del documento
  metadata JSONB,
  
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_comprador_id ON documentos(comprador_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo);

-- Tabla: tramite_documentos (Many-to-Many para compartir)
CREATE TABLE IF NOT EXISTS tramite_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  documento_id UUID NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  
  -- Metadatos específicos de esta asociación
  notas TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tramite_id, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_tramite_documentos_tramite ON tramite_documentos(tramite_id);
CREATE INDEX IF NOT EXISTS idx_tramite_documentos_documento ON tramite_documentos(documento_id);

-- Comentarios para documentación
COMMENT ON TABLE compradores IS 'Información base de los compradores';
COMMENT ON TABLE tramites IS 'Trámites asociados a compradores (preavisos, planos, etc.)';
COMMENT ON TABLE documentos IS 'Metadatos de archivos almacenados en S3';
COMMENT ON TABLE tramite_documentos IS 'Relación many-to-many entre trámites y documentos para permitir compartir';

