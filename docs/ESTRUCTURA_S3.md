# 📁 Estructura de Carpetas en S3

## Organización General

La estructura de S3 está diseñada para mantener los archivos organizados por comprador, trámite, tipo y fecha, facilitando la gestión y búsqueda de documentos.

## Estructura de Carpetas

```
notaria-documents/                    (Bucket raíz)
└── expedientes/                      (Todos los expedientes)
    └── {compradorId}/                (UUID del comprador)
        ├── tramites/                 (Documentos asociados a trámites)
        │   └── {tramiteId}/          (UUID del trámite)
        │       └── {tipoTramite}/    (preaviso, plano_arquitectonico, otro)
        │           └── {tipoDocumento}/  (escritura, ine_comprador, etc.)
        │               └── {año}/{mes}/
        │                   └── {timestamp}-{fileName}
        │
        ├── documentos/               (Documentos sin trámite específico)
        │   └── {tipoDocumento}/
        │       └── {año}/{mes}/
        │           └── {timestamp}-{fileName}
        │
        └── generados/                (Documentos generados por el sistema)
            └── {tipoTramite}/
                └── {año}/{mes}/
                    └── {timestamp}-{fileName}
```

## Ejemplos de Rutas

### Documento de Trámite (Pre-Aviso)
```
expedientes/
  abc-123-uuid/
    tramites/
      xyz-789-uuid/
        preaviso/
          escritura/
            2025/
              12/
                1733256000000-escritura_propiedad.pdf
```

### Documento del Comprador (sin trámite)
```
expedientes/
  abc-123-uuid/
    documentos/
      ine_comprador/
        2025/
          12/
            1733256000000-ine.pdf
```

### Documento Generado (Word/PDF)
```
expedientes/
  abc-123-uuid/
    generados/
      preaviso/
        2025/
          12/
            1733256000000-preaviso_compraventa.docx
```

## Tipos de Trámites

- `preaviso` - Pre-aviso de compraventa
- `plano_arquitectonico` - Planos arquitectónicos
- `otro` - Otros tipos de trámites

## Tipos de Documentos

- `escritura` - Escrituras públicas
- `plano` - Planos generales
- `plano_arquitectonico` - Planos arquitectónicos específicos
- `croquis_catastral` - Croquis catastrales
- `ine_vendedor` - INE del vendedor
- `ine_comprador` - INE del comprador
- `rfc` - Documentos RFC
- `documento_generado` - Documentos generados por el sistema

## Ventajas de esta Estructura

1. **Organización por Comprador**: Fácil encontrar todos los documentos de un comprador
2. **Separación por Trámites**: Documentos agrupados por trámite específico
3. **Organización Temporal**: Año/mes facilita limpieza y búsqueda por fecha
4. **Escalabilidad**: Estructura plana que evita problemas de profundidad en S3
5. **Mantenimiento**: Fácil identificar y eliminar documentos antiguos por fecha
6. **Búsqueda**: Patrones claros para búsquedas y filtros

## Convenciones de Nombres

- **IDs**: UUIDs para compradores y trámites (garantizan unicidad)
- **Nombres de archivo**: Sanitizados (solo letras, números, puntos, guiones y guiones bajos)
- **Timestamps**: Unix timestamp en milisegundos (garantiza orden cronológico)
- **Longitud máxima**: 255 caracteres para nombres de archivo

## Métodos Disponibles

### `S3Service.generateKey()`
Genera ruta para documentos de trámites:
```typescript
generateKey(compradorId, tramiteId, tipoTramite, tipoDocumento, fileName)
```

### `S3Service.generateKeyForComprador()`
Genera ruta para documentos del comprador (sin trámite):
```typescript
generateKeyForComprador(compradorId, tipoDocumento, fileName)
```

### `S3Service.generateKeyForGeneratedDocument()`
Genera ruta para documentos generados (Word, PDF):
```typescript
generateKeyForGeneratedDocument(compradorId, tipoTramite, fileName)
```

### `S3Service.generateKeyForTemp()`
Genera ruta para archivos temporales:
```typescript
generateKeyForTemp(tipo, fileName)
```

## Limpieza y Mantenimiento

### Eliminar documentos antiguos
Los documentos están organizados por año/mes, facilitando:
- Eliminar documentos de años anteriores
- Implementar políticas de retención
- Hacer backups por período

### Ejemplo de búsqueda por período
```
expedientes/{compradorId}/tramites/{tramiteId}/preaviso/escritura/2025/12/*
```

## Consideraciones de Seguridad

- **Acceso**: Solo mediante URLs firmadas (temporales)
- **Nombres**: Sanitizados para prevenir path traversal
- **Metadata**: Información sensible solo en Supabase, no en S3
- **Bucket**: Acceso privado, no público

