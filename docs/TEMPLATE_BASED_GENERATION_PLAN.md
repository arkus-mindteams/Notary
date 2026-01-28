# Plan: Generación de Pre-Aviso con Templates

## REQUERIMIENTOS

1. ✅ JSON solo con campos necesarios (no completo v1.2)
2. ✅ Renderizado en templates (editables sin cambiar código)
3. ✅ Opción de generar en PDF o Word

## ARQUITECTURA PROPUESTA

### 1. Schema Simplificado (JSON de Campos Necesarios)

```typescript
interface PreavisoSimplifiedJSON {
  // Información básica
  tipoOperacion: "compraventa" | null
  
  // Vendedor
  vendedor: {
    nombre: string | null
    rfc: string | null
    curp: string | null
    tipoPersona: "persona_fisica" | "persona_moral" | null
    denominacion_social?: string | null // solo si persona_moral
    estado_civil?: string | null // solo si persona_fisica
    tieneCredito: boolean | null
    institucionCredito?: string | null
    numeroCredito?: string | null
  } | null
  
  // Comprador
  comprador: {
    nombre: string | null
    rfc: string | null
    curp: string | null
    tipoPersona: "persona_fisica" | "persona_moral" | null
    denominacion_social?: string | null // solo si persona_moral
    estado_civil?: string | null // solo si persona_fisica
    necesitaCredito: boolean | null
    institucionCredito?: string | null
    montoCredito?: string | null
  } | null
  
  // Inmueble
  inmueble: {
    direccion: string | null
    folioReal: string | null
    seccion: string | null
    partida: string | null // o partidas: string[] si múltiples
    superficie: string | null
    valor: string | null
    unidad?: string | null
    modulo?: string | null
    condominio?: string | null
    lote?: string | null
    manzana?: string | null
    fraccionamiento?: string | null
    colonia?: string | null
  } | null
  
  // Actos notariales
  actos: {
    cancelacionCreditoVendedor: boolean
    compraventa: boolean
    aperturaCreditoComprador: boolean
  }
  
  // Metadata
  fecha: string // fecha actual formateada
  notaria: {
    numero: string
    nombre: string
    ciudad: string
    estado: string
  }
}
```

### 2. Estructura de Templates

```
templates/
├── preaviso/
│   ├── word.hbs (template para Word)
│   ├── pdf.hbs (template para PDF/HTML)
│   └── helpers.js (helpers de Handlebars)
```

### 3. Flujo de Generación

```
1. Agente IA → <DATA_UPDATE> con JSON simplificado
2. Validar JSON simplificado
3. Usuario elige formato (Word/PDF)
4. Template engine renderiza desde JSON
5. Generar archivo (Word usando docx, PDF usando jsPDF o puppeteer)
```

## IMPLEMENTACIÓN

### Paso 1: Actualizar PROMPT 4
- Requerir JSON simplificado (no completo v1.2)
- Definir campos necesarios explícitamente

### Paso 2: Agregar Handlebars
- `npm install handlebars @types/handlebars`

### Paso 3: Crear Templates
- Template Word (formato .docx compatible)
- Template PDF (HTML → PDF)

### Paso 4: Crear Generador Basado en Templates
- Clase `PreavisoTemplateRenderer`
- Métodos: `renderToWord()`, `renderToPDF()`

### Paso 5: Actualizar UI
- Botón para elegir formato (Word/PDF)
- Integrar con flujo actual

## VENTAJAS

1. ✅ Templates editables sin cambiar código
2. ✅ JSON simplificado (más fácil para el agente)
3. ✅ Múltiples formatos (Word/PDF)
4. ✅ Separación datos/presentación
5. ✅ Fácil de mantener y actualizar

