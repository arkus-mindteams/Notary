# Sistema de Interpretación y Redacción Notarial de Deslindes

## Control de Versiones

| Versión | Fecha | Descripción | Autor |
|---------|-------|-------------|-------|
| 1.0 | Enero 2025 | Versión inicial con funcionalidades básicas | v0 by Vercel |
| 2.0 | Enero 2025 | Actualización completa con todas las funcionalidades implementadas | Sistema de Desarrollo Notarial |

## Control de Versiones del Roadmap

| Versión | Fecha | Descripción | Autor |
|---------|-------|-------------|-------|
| 1.0 | Enero 2025 | Roadmap inicial basado en funcionalidades implementadas | Sistema de Desarrollo Notarial |

## Descripción General

Sistema web frontend para abogados y notarios que permite procesar documentos de deslindes (medidas y colindancias de propiedades) y generar solicitudes de pre-aviso, extraer información mediante OCR simulado, convertir a lenguaje notarial formal, validar visualmente, y exportar documentos notariales en formato .docx.

**Módulos Principales:**
- **Lectura de Deslinde**: Procesamiento de documentos de deslindes con OCR y validación visual
- **Pre-aviso**: Generación automática de solicitudes de certificado con efecto de pre-aviso

---

## Arquitectura del Sistema

### Stack Tecnológico
- **Framework**: Next.js 15 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Manejo de Estado**: React hooks (useState, useEffect), Context API
- **Almacenamiento**: localStorage (simulación de sesiones)
- **Procesamiento IA**: Simulación de OCR y clasificación de documentos
- **Validación**: Sistema robusto de validación de datos

### Estructura de Archivos

\`\`\`
app/
├── page.tsx                          # Página principal con flujo completo
├── layout.tsx                        # Layout raíz
├── globals.css                       # Estilos globales y tokens de diseño
├── login/
│   └── page.tsx                      # Página de autenticación
└── dashboard/
    ├── page.tsx                      # Dashboard principal
    ├── deslinde/
    │   └── page.tsx                  # Módulo de Lectura de Deslinde
    └── preaviso/
        └── page.tsx                  # Módulo de Pre-aviso

components/
├── upload-zone.tsx                   # Zona de carga de archivos (drag & drop)
├── processing-screen.tsx             # Pantalla de procesamiento OCR
├── ai-processing-screen.tsx          # Pantalla de procesamiento con IA
├── validation-wizard.tsx             # Wizard paso a paso para validación
├── validation-view.tsx               # Vista de validación completa
├── validation-interface.tsx          # Interfaz de validación de campos
├── validation-alerts.tsx             # Sistema de alertas de validación
├── validation-progress.tsx           # Barra de progreso de validación
├── document-viewer.tsx               # Visor de documentos con resaltado
├── document-preview.tsx              # Vista previa de documentos
├── document-with-verification.tsx    # Documento con verificación de fuente
├── field-highlighter.tsx             # Resaltador de campos extraídos
├── source-verification-panel.tsx     # Panel de verificación de fuentes
├── pdf-viewer.tsx                    # Visor de PDF con todas las funcionalidades
├── text-segment-panel.tsx            # Panel de texto notarial por direcciones
├── text-panel.tsx                    # Panel de texto general
├── editable-segment.tsx              # Componente editable individual
├── unit-tabs.tsx                     # Tabs de navegación entre unidades
├── export-dialog.tsx                 # Diálogo de exportación con metadatos
├── session-history.tsx               # Historial de sesiones
├── dashboard-layout.tsx              # Layout del dashboard
├── sidebar.tsx                       # Barra lateral de navegación
├── protected-route.tsx               # Componente de ruta protegida
├── theme-provider.tsx                # Proveedor de temas
└── ui/                               # Componentes de UI base (shadcn/ui)

lib/
├── ocr-simulator.ts                  # Simulación de extracción OCR
├── ai-processor.ts                   # Procesador de IA para documentos
├── text-transformer.ts               # Conversión a lenguaje notarial
├── document-exporter.ts              # Generación de archivos .docx
├── document-generator.ts             # Generador de documentos notariales
├── data-validator.ts                 # Validador de datos extraídos
├── session-manager.ts                # Gestor de sesiones
├── file-type-detector.ts             # Detector de tipos de archivo
├── pdf-exporter.ts                   # Exportador específico de PDF
├── word-exporter.ts                  # Exportador específico de Word
├── auth-context.tsx                  # Contexto de autenticación
└── utils.ts                          # Utilidades generales

data/
├── mock-properties.json              # Datos de ejemplo de propiedades
├── document-regions.json             # Coordenadas de regiones en documento
└── abbreviations.json                # Diccionario de abreviaturas notariales

hooks/
├── use-file-upload.ts                # Hook para carga de archivos
├── use-mobile.ts                     # Hook para detección móvil
└── use-toast.ts                      # Hook para notificaciones

public/
├── images/                           # Imágenes del sistema
├── placeholder-document.png          # Documento placeholder
├── placeholder-logo.png              # Logo placeholder
├── placeholder-logo.svg              # Logo SVG placeholder
├── placeholder-user.jpg              # Usuario placeholder
├── placeholder.jpg                   # Imagen placeholder
├── placeholder.svg                   # SVG placeholder
└── testdeslinde.png                  # Documento de ejemplo
\`\`\`

---

## Funcionalidades Implementadas

### 1. Carga de Documentos
**Archivo**: `components/upload-zone.tsx`

**Características**:
- Drag & drop de archivos
- Soporte para PDF, Word (.docx), e imágenes (PNG, JPG)
- Validación de tipo de archivo
- Preview visual del archivo cargado
- Límite de tamaño: 10MB

**Flujo**:
1. Usuario arrastra archivo o hace clic para seleccionar
2. Sistema valida tipo y tamaño
3. Crea URL de objeto para preview
4. Almacena archivo en estado para procesamiento

---

### 2. Procesamiento OCR Simulado
**Archivo**: `lib/ocr-simulator.ts`

**Características**:
- Simula extracción de texto de documentos (2-3 segundos)
- Extrae múltiples unidades del documento
- Identifica 4 direcciones cardinales por unidad (Norte, Sur, Este, Oeste)
- Extrae medidas, colindancias y superficies

**Estructura de Datos Extraídos**:
\`\`\`typescript
interface ExtractedUnit {
  id: string                    // Ej: "unit_b2"
  name: string                  // Ej: "UNIDAD B-2"
  surface: string               // Ej: "55.980 m2"
  boundaries: {
    west: Segment[]             // Medidas al oeste
    north: Segment[]            // Medidas al norte
    east: Segment[]             // Medidas al este
    south: Segment[]            // Medidas al sur
  }
}

interface Segment {
  texto1: string                // Texto original extraído
  texto2: string                // Texto notarial generado
  regionId: string              // ID de región en documento
}
\`\`\`

**Ejemplo de Texto Extraído (Texto 1)**:
\`\`\`
UNIDAD B-2
OESTE: 6.750 MTS. CON UNIDAD B-4
       1.750 MTS. CON CUBO DE ILUMINACION
NORTE: 2.550 MTS. CON CUBO DE ILUMINACION
       4.720 MTS. CON JUNTA CONSTRUCTIVA 1
...
\`\`\`

---

### 3. Transformación a Lenguaje Notarial
**Archivo**: `lib/text-transformer.ts`

**Características**:
- Convierte números a palabras (6.750 → seis punto siete cinco cero)
- Expande abreviaturas (MTS → metros, milímetros según contexto)
- Formatea según reglas notariales mexicanas
- Estructura en párrafos por dirección cardinal
- Maneja múltiples tramos por dirección

**Reglas de Transformación**:
1. **Números**: 
   - Enteros: 6 → seis
   - Decimales: 6.750 → seis punto siete cinco cero
   - Mantiene precisión de milímetros

2. **Abreviaturas**:
   - MTS → metros/milímetros (según magnitud)
   - AC → área común
   - ACS → área común de servicio
   - Guiones: B-2 → B guion dos

3. **Formato Notarial**:
   - Inicia con nombre de unidad
   - Cada dirección: "Al [dirección], en [n] tramos, el primero de..."
   - Conectores: "y" para último tramo, "," para intermedios
   - Paréntesis para referencias: (AC-12) → (AC guion doce)

**Ejemplo de Texto Notarial (Texto 2)**:
\`\`\`
UNIDAD B guion dos: Al oeste, en dos tramos, el primero de seis metros 
setecientos cincuenta milímetros, colinda con unidad B guion cuatro, y el 
segundo de un metro setecientos cincuenta milímetros, colinda con cubo de 
iluminánea comunión; al norte, en dos tramos...
\`\`\`

---

### 4. Validación Visual con Wizard
**Archivo**: `components/validation-wizard.tsx`

**Características**:
- Interfaz paso a paso (una unidad a la vez)
- Barra de progreso visual con pills clicables
- Resaltado persistente de unidad actual en documento
- Navegación con botones Anterior/Siguiente
- Autorización obligatoria por unidad
- Indicadores de color por estado:
  - **Verde**: Unidad autorizada (con checkmark)
  - **Azul**: Unidad actual en validación
  - **Gris**: Unidad pendiente

**Flujo de Validación**:
1. Usuario revisa documento original (izquierda)
2. Compara con texto notarial generado (derecha)
3. Puede editar texto si es necesario
4. Hace clic en "Autorizar" para aprobar unidad
5. Navega a siguiente unidad
6. Repite hasta completar todas las unidades
7. Botón "Exportar" se habilita al autorizar todas

**Responsive Design**:
- **Desktop**: Split-screen 50/50
- **Tablet**: Split-screen 45/55
- **Mobile**: Stack vertical, botones con solo iconos

---

### 5. Visor de Documentos con Resaltado Sincronizado
**Archivo**: `components/document-viewer.tsx`

**Características**:
- Soporte para imágenes (PNG, JPG) y PDFs
- Controles de zoom (50% - 200%)
- Botón de pantalla completa
- Resaltado amarillo de regiones al hacer clic en texto
- Overlay semitransparente sobre documento original

**Sistema de Regiones**:
- Cada unidad tiene región completa definida
- Cada dirección cardinal tiene región específica
- Coordenadas en porcentajes (responsive)
- Archivo de configuración: `data/document-regions.json`

**Estructura de Regiones**:
\`\`\`json
{
  "b2_west": {
    "x": 65,      // Posición X en %
    "y": 15,      // Posición Y en %
    "width": 30,  // Ancho en %
    "height": 8   // Alto en %
  }
}
\`\`\`

**Mapeo de Unidades a Prefijos**:
- `unit_b2` → `b2`
- `unit_cubo_iluminacion` → `cubo`
- `unit_junta_constructiva_1` → `junta1`
- `unit_junta_constructiva_2` → `junta2`
- `unit_cajon_estacionamiento` → `cajon`

**Interacción**:
1. Usuario hace clic en dirección del texto notarial (ej: "AL OESTE")
2. Sistema identifica regionId correspondiente (ej: `b2_west`)
3. DocumentViewer busca coordenadas en document-regions.json
4. Renderiza overlay amarillo en esa posición
5. Resaltado persiste hasta que se selecciona otra región

---

### 6. Edición en Tiempo Real
**Archivos**: `components/text-segment-panel.tsx`, `components/editable-segment.tsx`

**Características**:
- Modo bloqueado/desbloqueado (toggle)
- Edición inline por dirección cardinal
- Auto-guardado cada 3 segundos
- Indicador visual de cambios sin guardar
- Atajos de teclado:
  - `Ctrl + Enter`: Guardar cambios
  - `Esc`: Cancelar edición

**Estructura de Edición**:
- Cada dirección cardinal es un bloque editable
- Al hacer clic en "Desbloquear", se habilita edición
- Textarea con auto-resize según contenido
- Botones de Guardar/Cancelar por bloque
- Cambios se reflejan inmediatamente en estado

**Estados de Edición**:
1. **Bloqueado**: Solo lectura, fondo gris claro
2. **Desbloqueado**: Editable, fondo blanco
3. **Editando**: Borde azul, botones visibles
4. **Guardando**: Indicador de carga
5. **Guardado**: Checkmark verde temporal

---

### 7. Exportación a .docx
**Archivos**: `components/export-dialog.tsx`, `lib/document-exporter.ts`

**Características**:
- Requiere autorización de todas las unidades
- Diálogo con formulario de metadatos
- Generación de documento Word con formato notarial
- Descarga automática del archivo

**Metadatos Requeridos**:
- Nombre de la propiedad
- Superficie total
- Ubicación
- Fecha de elaboración

**Estructura del Documento Exportado**:
\`\`\`
ESCRITURA DE DESLINDE

Propiedad: [Nombre]
Superficie: [X] metros cuadrados
Ubicación: [Ubicación]

MEDIDAS Y COLINDANCIAS:

UNIDAD B guion dos: Al oeste, en dos tramos...

CUBO DE ILUMINACION: Al oeste, en un tramo...

[... todas las unidades en texto corrido ...]

---
Fecha de elaboración: [Fecha]
\`\`\`

**Formato**:
- Encabezado centrado en negrita
- Metadatos en párrafos separados
- Cada unidad como párrafo continuo
- Pie de página con fecha
- Fuente: Arial 12pt
- Interlineado: 1.5

---

### 8. Sistema de Autenticación
**Archivos**: `components/protected-route.tsx`, `lib/auth-context.tsx`

**Características**:
- Rutas protegidas con autenticación
- Contexto de autenticación global
- Redirección automática a login
- Gestión de sesiones de usuario
- Protección de módulos del dashboard

**Flujo de Autenticación**:
1. Usuario accede a ruta protegida
2. Sistema verifica autenticación
3. Si no está autenticado, redirige a login
4. Si está autenticado, permite acceso
5. Contexto global mantiene estado de usuario

---

### 9. Dashboard Principal
**Archivo**: `app/dashboard/page.tsx`

**Características**:
- Vista general del sistema
- Acceso a módulos principales (Deslinde y Pre-aviso)
- Estadísticas de sesiones
- Navegación entre módulos
- Resumen de actividades recientes

**Módulos Disponibles**:
- **Lectura de Deslinde**: Procesamiento de documentos de deslindes
- **Pre-aviso**: Generación de solicitudes de certificado

---

### 10. Módulo de Lectura de Deslinde
**Archivo**: `app/dashboard/deslinde/page.tsx`

**Características**:
- Procesamiento de documentos de deslindes
- Extracción automática de medidas y colindancias
- Conversión a lenguaje notarial
- Validación visual con resaltado sincronizado
- Exportación a formato notarial
- Interfaz paso a paso para validación

**Estados del Flujo**:
1. **Upload**: Carga de documento
2. **Processing**: Procesamiento OCR
3. **Validation**: Validación visual y edición

---

### 11. Módulo de Pre-aviso
**Archivo**: `app/dashboard/preaviso/page.tsx`

**Características**:
- Carga múltiple de documentos (escritura, plano, identificación, RFC/CURP)
- Detección automática de tipo de documento
- Procesamiento con IA para extracción de campos
- Validación de datos extraídos
- Generación automática de solicitud de pre-aviso
- Verificación de fuentes con resaltado

**Tipos de Documentos Soportados**:
- **Escritura o título de propiedad**
- **Plano o croquis catastral**
- **Identificación del propietario**
- **RFC / CURP de las partes**

---

### 12. Sistema de Procesamiento con IA
**Archivo**: `lib/ai-processor.ts`

**Características**:
- OCR avanzado con clasificación de documentos
- Extracción de campos con NER (Named Entity Recognition)
- Consolidación de datos de múltiples fuentes
- Validación de confianza de extracción
- Soporte para múltiples tipos de documento

**Clases Principales**:
- **OCRProcessor**: Procesamiento de documentos
- **DocumentClassifier**: Clasificación automática
- **FieldExtractor**: Extracción de campos específicos
- **AIProcessor**: Orquestador principal

---

### 13. Sistema de Validación Avanzado
**Archivos**: `components/validation-interface.tsx`, `lib/data-validator.ts`

**Características**:
- Validación de RFC y CURP con patrones específicos
- Validación de fechas con rangos lógicos
- Validación de direcciones con elementos típicos
- Sistema de alertas por severidad (error, warning, info)
- Puntuación de calidad de datos (0-100%)
- Edición en tiempo real de campos

**Tipos de Validación**:
- **Estructural**: Campos requeridos presentes
- **Formato**: Patrones de datos correctos
- **Lógica**: Coherencia entre campos
- **Completitud**: Todos los campos llenos

---

### 14. Generador de Documentos Notariales
**Archivo**: `lib/document-generator.ts`

**Características**:
- Generación automática de solicitudes de pre-aviso
- Formato notarial completo con fundamento legal
- Metadatos de generación y confianza
- Exportación en HTML y texto plano
- Consolidación de datos de múltiples fuentes

**Estructura del Documento**:
- Encabezado notarial
- Antecedentes registrales
- Actos jurídicos
- Identificación del inmueble
- Fundamento legal
- Solicitud específica
- Firma y autorización

---

### 15. Sistema de Gestión de Sesiones
**Archivo**: `lib/session-manager.ts`

**Características**:
- Creación y gestión de sesiones
- Persistencia en localStorage
- Historial de documentos procesados
- Estadísticas de uso
- Exportación/importación de sesiones
- Limpieza automática de sesiones antiguas

**Estructura de Sesión**:
```typescript
interface DocumentSession {
  id: string
  title: string
  type: 'preaviso' | 'escritura' | 'testamento' | 'poder'
  status: 'draft' | 'processing' | 'completed' | 'exported'
  createdAt: Date
  updatedAt: Date
  document?: GeneratedDocument
  metadata: {
    notaria: string
    folio: string
    confidence: number
  }
  files: Array<{
    name: string
    type: string
    size: number
    uploadedAt: Date
  }>
  progress: {
    uploaded: number
    processed: number
    validated: number
    generated: number
  }
}
```

---

### 16. Visores de Documentos Avanzados
**Archivos**: `components/pdf-viewer-*.tsx`

**Características**:
- Múltiples visores de PDF (nativo, iframe, enhanced)
- Controles de zoom y navegación
- Resaltado de regiones específicas
- Soporte para imágenes y documentos Word
- Verificación de fuentes con overlay
- Manejo de errores de carga

**Tipos de Visores**:
- **Native PDF Viewer**: Visor nativo del navegador
- **Iframe PDF Viewer**: Visor con iframe
- **Enhanced PDF Viewer**: Visor mejorado con controles
- **Direct PDF Viewer**: Visor directo sin iframe

---

### 17. Sistema de Resaltado de Campos
**Archivo**: `components/field-highlighter.tsx`

**Características**:
- Resaltado visual de campos extraídos
- Categorización por tipo de campo
- Indicadores de confianza
- Interacción con campos resaltados
- Resumen por categorías

**Categorías de Campos**:
- **Notario**: Nombre, número, ubicación
- **Partes**: Vendedor, comprador
- **Acto Jurídico**: Tipo, descripción
- **Folio Real**: Número, sección, partida
- **Inmueble**: Ubicación, características

---

### 18. Sistema de Alertas de Validación
**Archivo**: `components/validation-alerts.tsx`

**Características**:
- Alertas por severidad (error, warning, info)
- Indicadores visuales de calidad
- Sistema de puntuación (0-100%)
- Alertas desplegables/colapsables
- Acciones de corrección sugeridas

**Niveles de Severidad**:
- **Error**: Problemas críticos que impiden el procesamiento
- **Warning**: Advertencias que requieren atención
- **Info**: Información adicional para el usuario

---

### 19. Detección Automática de Documentos
**Archivo**: `lib/file-type-detector.ts`

**Características**:
- Clasificación inteligente por nombre de archivo
- Patrones de reconocimiento para cada tipo
- Selección manual como fallback
- Resultados de detección en tiempo real
- Confianza de clasificación

**Patrones de Detección**:
- **Escritura**: 'escritura', 'titulo', 'compraventa', 'propiedad'
- **Plano**: 'plano', 'croquis', 'catastral', 'medidas'
- **Identificación**: 'ine', 'identificacion', 'credencial', 'pasaporte'
- **RFC/CURP**: 'rfc', 'curp', 'registro', 'clave'

---

### 20. Verificación de Fuentes
**Archivo**: `components/source-verification-panel.tsx`

**Características**:
- Panel de documentos originales subidos
- Vista previa de archivos con zoom
- Resaltado de regiones en documentos
- Verificación cruzada con datos extraídos
- Indicadores de confianza por documento

**Funcionalidades**:
- Preview de imágenes y PDFs
- Controles de zoom (50% - 200%)
- Resaltado de regiones específicas
- Información de metadatos del archivo
- Acciones de verificación

---

## Patrones de Diseño Utilizados

### 1. Sistema de Colores
**Archivo**: `app/globals.css`

\`\`\`css
--primary: 210 100% 50%        /* Azul profesional */
--success: 142 76% 36%         /* Verde para autorizadas */
--warning: 48 96% 53%          /* Amarillo para resaltado */
--muted: 210 40% 96%           /* Gris claro para fondos */
\`\`\`

### 2. Componentes Reutilizables
- Todos los componentes son modulares y reutilizables
- Props tipadas con TypeScript
- Separación de lógica y presentación
- Hooks personalizados para lógica compartida

### 3. Gestión de Estado
- Estado local con `useState` para UI
- `useEffect` para efectos secundarios (auto-guardado)
- Context API para autenticación global
- Props drilling para comunicación padre-hijo
- Callbacks para comunicación hijo-padre
- Hooks personalizados para lógica compartida

### 4. Responsive Design
- Mobile-first approach
- Breakpoints: `sm:` (640px), `lg:` (1024px)
- Flexbox para layouts
- Grid solo para estructuras complejas

---

## Datos de Ejemplo

### Archivo: `data/mock-properties.json`

Contiene 5 unidades de ejemplo:
1. **UNIDAD B-2**: Departamento con 4 direcciones, 10 segmentos
2. **CUBO DE ILUMINACION**: Espacio común, 4 direcciones
3. **JUNTA CONSTRUCTIVA 1**: Elemento estructural, 4 direcciones
4. **JUNTA CONSTRUCTIVA 2**: Elemento estructural, 4 direcciones
5. **CAJON DE ESTACIONAMIENTO**: Espacio de estacionamiento, 4 direcciones

Cada unidad incluye:
- ID único
- Nombre completo
- Superficie en m²
- Medidas por dirección cardinal (oeste, norte, este, sur)
- Texto original (texto1) y texto notarial (texto2) por segmento
- RegionIds para mapeo con documento

---

## Funcionalidades Implementadas Recientemente

### ✅ Gestión de Sesiones (IMPLEMENTADA)
**Archivo**: `lib/session-manager.ts`

**Funcionalidades Implementadas**:
- ✅ Auto-guardado de progreso en localStorage
- ✅ Recuperación automática al recargar página
- ✅ Historial de documentos procesados
- ✅ Múltiples sesiones simultáneas
- ✅ Eliminar sesiones antiguas
- ✅ Estadísticas de uso
- ✅ Exportación/importación de sesiones

### ✅ Validaciones y Advertencias (IMPLEMENTADA)
**Archivos**: `components/validation-alerts.tsx`, `lib/data-validator.ts`

**Funcionalidades Implementadas**:
- ✅ Detectar medidas inconsistentes
- ✅ Validar que las 4 direcciones estén presentes
- ✅ Advertir sobre abreviaturas no reconocidas
- ✅ Verificar coherencia en colindancias
- ✅ Alertas visuales en tiempo real
- ✅ Sistema de puntuación de calidad
- ✅ Validación de RFC y CURP
- ✅ Validación de fechas y direcciones

### ✅ Soporte Multi-documento (IMPLEMENTADA)
**Archivo**: `app/dashboard/preaviso/page.tsx`

**Funcionalidades Implementadas**:
- ✅ Procesar múltiples documentos en lote
- ✅ Detección automática de tipos de documento
- ✅ Consolidación de información de múltiples fuentes
- ✅ Exportación de documentos generados

## Funcionalidades Pendientes (Futuras Mejoras)

### 1. Mejoras de UX Adicionales
**Prioridad**: Baja

**Descripción**:
- Atajos de teclado globales
- Búsqueda dentro del documento
- Comparación entre versiones
- Deshacer/rehacer cambios (Ctrl+Z)
- Copiar texto seleccionado
- Comentarios/notas por unidad

### 2. Integración con Servicios Externos
**Prioridad**: Media

**Descripción**:
- Integración con servicios OCR reales (Google Vision, AWS Textract)
- Integración con bases de datos notariales
- Integración con sistemas de registro público
- APIs de validación de documentos oficiales

### 3. Funcionalidades Avanzadas
**Prioridad**: Baja

**Descripción**:
- Plantillas personalizables de documentos
- Workflows de aprobación
- Notificaciones por email
- Integración con sistemas de firma digital
- Auditoría de cambios

---

## Consideraciones Técnicas

### 1. Simulación de API
Todas las operaciones que normalmente requerirían backend están simuladas:
- **OCR**: `lib/ocr-simulator.ts` con delay de 2-3 segundos
- **Guardado**: localStorage con simulación de latencia
- **Exportación**: Generación client-side con descarga directa

### 2. Manejo de Archivos
- Archivos se convierten a `Blob` URLs para preview
- No se suben a servidor (solo frontend)
- Limpieza de URLs al desmontar componentes
- Límite de 10MB por archivo

### 3. Performance
- Lazy loading de componentes pesados
- Debounce en auto-guardado (3 segundos)
- Memoización de cálculos costosos
- Optimización de re-renders con React.memo

### 4. Accesibilidad
- Roles ARIA en componentes interactivos
- Navegación por teclado
- Contraste de colores WCAG AA
- Labels descriptivos en formularios

### 5. Responsive
- Breakpoints estándar de Tailwind
- Touch targets de 44x44px mínimo
- Scroll horizontal en pills para móvil
- Stack vertical en pantallas pequeñas

---

## Guía de Integración con Backend

### Endpoints Necesarios

#### 1. POST `/api/ocr/extract`
**Request**:
\`\`\`typescript
{
  file: File,
  documentType: 'pdf' | 'image' | 'docx'
}
\`\`\`

**Response**:
\`\`\`typescript
{
  units: ExtractedUnit[],
  processingTime: number,
  confidence: number
}
\`\`\`

#### 2. POST `/api/transform/notarial`
**Request**:
\`\`\`typescript
{
  extractedText: string,
  unitId: string,
  direction: 'west' | 'north' | 'east' | 'south'
}
\`\`\`

**Response**:
\`\`\`typescript
{
  notarialText: string,
  transformations: Array<{
    original: string,
    transformed: string,
    rule: string
  }>
}
\`\`\`

#### 3. POST `/api/sessions/save`
**Request**:
\`\`\`typescript
{
  sessionId: string,
  data: Session
}
\`\`\`

**Response**:
\`\`\`typescript
{
  success: boolean,
  sessionId: string,
  savedAt: Date
}
\`\`\`

#### 4. GET `/api/sessions/:id`
**Response**:
\`\`\`typescript
{
  session: Session
}
\`\`\`

#### 5. POST `/api/export/docx`
**Request**:
\`\`\`typescript
{
  units: ExtractedUnit[],
  metadata: {
    propertyName: string,
    surface: string,
    location: string,
    date: string
  }
}
\`\`\`

**Response**:
\`\`\`typescript
{
  fileUrl: string,
  fileName: string,
  expiresAt: Date
}
\`\`\`

### Variables de Entorno Necesarias

\`\`\`env
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_OCR_ENDPOINT=/api/ocr/extract
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_SUPPORTED_FORMATS=pdf,docx,png,jpg,jpeg
\`\`\`

---

## Testing Recomendado

### 1. Unit Tests
- Transformación de texto (text-transformer.ts)
- Validación de formatos
- Cálculos de coordenadas de regiones
- Generación de regionIds

### 2. Integration Tests
- Flujo completo de carga → validación → exportación
- Edición y guardado de cambios
- Navegación entre unidades
- Autorización de unidades

### 3. E2E Tests
- Carga de diferentes tipos de archivo
- Validación de todas las unidades
- Exportación de documento final
- Recuperación de sesión

### 4. Visual Regression Tests
- Resaltado de regiones en documento
- Estados de componentes (hover, active, disabled)
- Responsive en diferentes dispositivos

---

## Comandos Útiles

\`\`\`bash
# Desarrollo
npm run dev

# Build
npm run build

# Lint
npm run lint

# Type check
npx tsc --noEmit
\`\`\`

---

## Notas Importantes

1. **Coordenadas de Regiones**: Las coordenadas en `document-regions.json` son específicas para el documento de ejemplo (`testdeslinde.png`). Para otros documentos, necesitarás recalcular estas coordenadas.

2. **Formato Notarial**: Las reglas de transformación están basadas en el formato notarial mexicano. Pueden requerir ajustes para otras jurisdicciones.

3. **Simulación OCR**: El OCR actual es completamente simulado. La integración con un servicio real (Tesseract, Google Vision, AWS Textract) requerirá ajustes en `lib/ocr-simulator.ts`.

4. **Exportación .docx**: La generación de documentos Word es básica. Para formatos más complejos, considera usar librerías como `docx` o `mammoth`.

5. **Estado Global**: Actualmente usa props drilling. Para aplicaciones más grandes, considera Context API, Zustand, o Redux.

---

## Contacto y Soporte

Para preguntas sobre la implementación o para reportar issues, contactar al equipo de desarrollo.

**Versión del Documento**: 2.0  
**Última Actualización**: Enero 2025  
**Autor**: Sistema de Desarrollo Notarial

---

## Resumen de Cambios - Versión 2.0

### Nuevas Funcionalidades Agregadas:
- ✅ Sistema de autenticación completo
- ✅ Dashboard principal con navegación
- ✅ Módulo de Pre-aviso con IA
- ✅ Sistema de validación avanzado
- ✅ Gestión de sesiones robusta
- ✅ Visores de documentos múltiples
- ✅ Resaltado de campos extraídos
- ✅ Sistema de alertas de validación
- ✅ Detección automática de documentos
- ✅ Verificación de fuentes
- ✅ Generador de documentos notariales

### Mejoras Técnicas:
- ✅ Arquitectura modular mejorada
- ✅ Context API para estado global
- ✅ Hooks personalizados
- ✅ Sistema de validación robusto
- ✅ Manejo de errores mejorado
- ✅ Performance optimizada

### Documentación Actualizada:
- ✅ Control de versiones
- ✅ Estructura de archivos completa
- ✅ Funcionalidades detalladas
- ✅ Patrones de diseño actualizados

---

## Roadmap de Desarrollo

Para consultar el plan de desarrollo detallado, incluyendo cronograma, recursos, métricas de éxito y gestión de riesgos, consultar el documento:

**📋 [ROADMAP_DESARROLLO.md](./ROADMAP_DESARROLLO.md)**

### Resumen del Roadmap:
- **Duración**: 6 semanas
- **Equipo**: 2 desarrolladores (Senior Full-Stack + Frontend/UX)
- **Objetivo**: Optimización, integración con backend real y despliegue en producción
- **Estado Actual**: 20 funcionalidades completamente implementadas
- **Inversión Total**: $14,750 USD
- **ROI Esperado**: 300% en el primer año
