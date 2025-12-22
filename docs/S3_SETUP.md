# 🔧 Configuración de AWS S3

## Problema: "NoSuchBucket: The specified bucket does not exist"

Este error indica que el bucket de S3 especificado no existe en tu cuenta de AWS.

## Solución Rápida

### 1. Verificar la configuración actual

Ejecuta el script de verificación:

```bash
npx tsx scripts/verify-s3.ts
```

Este script te mostrará:
- Qué variables de entorno están configuradas
- Si las credenciales son válidas
- Si el bucket existe y es accesible

### 2. Crear el bucket en AWS S3

#### Opción A: Usando la Consola de AWS

1. Ve a [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Haz clic en "Create bucket"
3. Configura el bucket:
   - **Bucket name**: `notaria-expedientes` (o el nombre que prefieras)
   - **Region**: Selecciona la misma región que configuraste en `AWS_REGION` (por defecto: `us-east-1`)
   - **Block Public Access**: Mantén habilitado (el bucket debe ser privado)
4. Haz clic en "Create bucket"

#### Opción B: Usando AWS CLI

```bash
aws s3 mb s3://notaria-expedientes --region us-east-1
```

### 3. Configurar las variables de entorno

Asegúrate de tener estas variables en tu archivo `.env.local`:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=tu_access_key_id
AWS_SECRET_ACCESS_KEY=tu_secret_access_key
AWS_S3_BUCKET=notaria-expedientes
```

**Nota**: También puedes usar `OCR_S3_BUCKET` en lugar de `AWS_S3_BUCKET` si prefieres.

### 4. Verificar permisos IAM

El usuario de AWS necesita estos permisos mínimos:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::notaria-expedientes",
        "arn:aws:s3:::notaria-expedientes/*"
      ]
    }
  ]
}
```

### 5. Verificar nuevamente

Después de crear el bucket, ejecuta nuevamente:

```bash
npx tsx scripts/verify-s3.ts
```

Deberías ver:
```
✅ Bucket "notaria-expedientes" existe y es accesible
✅ Configuración de S3 verificada correctamente!
```

## Estructura del Bucket

El bucket se organizará automáticamente con esta estructura:

```
notaria-expedientes/
└── expedientes/
    └── {compradorId}/
        ├── tramites/
        │   └── {tramiteId}/
        │       └── {tipoTramite}/
        │           └── {tipoDocumento}/
        │               └── {año}/{mes}/
        │                   └── {timestamp}-{fileName}
        ├── documentos/
        │   └── {tipoDocumento}/
        │       └── {año}/{mes}/
        │           └── {timestamp}-{fileName}
        └── generados/
            └── {tipoTramite}/
                └── {año}/{mes}/
                    └── {timestamp}-{fileName}
```

Ver `docs/ESTRUCTURA_S3.md` para más detalles.

## Solución de Problemas

### Error: "AccessDenied"
- Verifica que las credenciales de AWS tengan permisos sobre el bucket
- Revisa las políticas IAM del usuario

### Error: "InvalidAccessKeyId" o "SignatureDoesNotMatch"
- Verifica que `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` sean correctos
- Asegúrate de que no haya espacios extra en las variables de entorno

### Error: "Bucket name already exists"
- Los nombres de bucket deben ser únicos globalmente en AWS
- Intenta con un nombre diferente, por ejemplo: `notaria-expedientes-tu-empresa`

### El bucket existe pero sigue dando error
- Verifica que la región del bucket coincida con `AWS_REGION`
- Reinicia el servidor de desarrollo después de cambiar las variables de entorno

## Próximos Pasos

1. ✅ Crea el bucket en AWS S3
2. ✅ Configura las variables de entorno
3. ✅ Verifica con `npx tsx scripts/verify-s3.ts`
4. ✅ Reinicia el servidor de desarrollo
5. ✅ Prueba subir un documento desde la aplicación

