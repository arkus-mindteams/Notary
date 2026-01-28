# Opciones para Generar el Archivo del Pre-Aviso

## SITUACIÓN ACTUAL

### Flujo Actual:
1. **Agente de IA** captura datos → Genera `<DATA_UPDATE>` con JSON (schema simplificado)
2. **Código** extrae JSON de `<DATA_UPDATE>` → Convierte a `PreavisoData` (interfaz TypeScript)
3. **PreavisoGenerator** genera documento desde `PreavisoData` → Word/HTML/Text

### Problemas Identificados:
1. **Desincronización de schemas:**
   - Schema en DB (v1.2): Completo, estructurado, con `parties`, `acts`, `property_object`, etc.
   - Schema en código (`PreavisoData`): Simplificado, plano, no coincide con v1.2
   - Schema en `<DATA_UPDATE>`: Simplificado, solo campos básicos

2. **Generador actual no usa estructura canónica:**
   - `PreavisoGenerator` usa `PreavisoData` (formato plano)
   - No usa el JSON canónico v1.2 de la DB
   - No respeta completamente la estructura definida en PROMPT 2

3. **Falta de validación:**
   - No valida contra schema v1.2 antes de generar
   - No verifica que todos los campos requeridos estén presentes

## OPCIONES PROPUESTAS

### OPCIÓN 1: Renderizado Directo desde JSON Canónico v1.2 (RECOMENDADA)

**Flujo:**
1. Agente de IA genera JSON canónico v1.2 completo en `<DATA_UPDATE>`
2. Código extrae y valida JSON contra schema v1.2
3. Nuevo generador renderiza documento directamente desde JSON v1.2
4. Sin transformaciones intermedias

**Ventajas:**
- ✅ Una sola fuente de verdad (JSON canónico v1.2)
- ✅ Validación estricta contra schema
- ✅ Estructura respeta exactamente las reglas de PROMPT 2
- ✅ Fácil de mantener (schema en DB, generador en código)
- ✅ Sin pérdida de información en transformaciones

**Desventajas:**
- ⚠️ Requiere refactorizar `PreavisoGenerator` completamente
- ⚠️ Requiere que el agente genere JSON v1.2 completo (no simplificado)

**Implementación:**
```typescript
// Nuevo generador
class PreavisoDocumentRenderer {
  static renderFromCanonicalJSON(canonicalJSON: CanonicalJSONv12): PreavisoDocument {
    // Renderizar directamente desde JSON canónico
    // Usar estructura definida en PROMPT 2
  }
}
```

---

### OPCIÓN 2: Transformación JSON v1.2 → PreavisoData (Actual Mejorado)

**Flujo:**
1. Agente de IA genera JSON canónico v1.2 completo en `<DATA_UPDATE>`
2. Código extrae y valida JSON contra schema v1.2
3. Transformador convierte JSON v1.2 → `PreavisoData`
4. `PreavisoGenerator` actual genera documento (sin cambios)

**Ventajas:**
- ✅ Reutiliza generador actual
- ✅ Validación contra schema v1.2
- ✅ Cambios mínimos en código existente

**Desventajas:**
- ⚠️ Transformación puede perder información
- ⚠️ Mantiene dos formatos (v1.2 y PreavisoData)
- ⚠️ Transformador puede ser complejo

**Implementación:**
```typescript
// Transformador
class CanonicalJSONToPreavisoData {
  static transform(canonicalJSON: CanonicalJSONv12): PreavisoData {
    // Mapear campos de v1.2 a PreavisoData
    // Manejar casos edge (persona moral, múltiples folios, etc.)
  }
}
```

---

### OPCIÓN 3: Generación Híbrida (IA + Template)

**Flujo:**
1. Agente de IA genera JSON canónico v1.2 completo
2. Código valida JSON contra schema v1.2
3. Template engine (Handlebars/Mustache) renderiza documento desde JSON
4. Template definido según estructura de PROMPT 2

**Ventajas:**
- ✅ Separación clara: datos (JSON) vs presentación (template)
- ✅ Templates editables sin cambiar código
- ✅ Fácil de mantener y actualizar
- ✅ Puede tener múltiples templates (Word, PDF, HTML)

**Desventajas:**
- ⚠️ Requiere agregar dependencia de template engine
- ⚠️ Templates pueden ser complejos para documentos legales
- ⚠️ Validación de templates puede ser difícil

**Implementación:**
```typescript
// Template-based renderer
class PreavisoTemplateRenderer {
  static render(canonicalJSON: CanonicalJSONv12, template: string): string {
    // Renderizar template con datos del JSON
  }
}
```

---

### OPCIÓN 4: Generación por IA (NO RECOMENDADA)

**Flujo:**
1. Agente de IA genera JSON canónico v1.2
2. Segundo prompt a IA: "Genera el texto del documento desde este JSON"
3. IA genera texto completo del pre-aviso
4. Renderizar texto a Word/PDF

**Ventajas:**
- ✅ IA puede generar texto natural
- ✅ Menos código de generación

**Desventajas:**
- ❌ Viola reglas establecidas (IA no debe generar documento final)
- ❌ No determinístico (puede variar entre ejecuciones)
- ❌ Costo adicional de API
- ❌ Riesgo de inferencia/hallucinación en documento legal
- ❌ No respeta estructura fija definida en PROMPT 2

**NO RECOMENDADA** - Viola principios establecidos en PROMPT 1 y PROMPT 2.

---

## RECOMENDACIÓN: OPCIÓN 1 (Renderizado Directo)

### Razones:
1. **Respeto a arquitectura:** JSON canónico v1.2 es la fuente de verdad
2. **Determinismo:** Renderizado mecánico, sin inferencia
3. **Validación:** Puede validar contra schema antes de renderizar
4. **Mantenibilidad:** Schema en DB, generador en código
5. **Estructura fija:** Respeta exactamente la estructura de PROMPT 2

### Implementación Propuesta:

#### Paso 1: Definir Interfaz TypeScript para JSON v1.2
```typescript
interface CanonicalJSONv12 {
  schema_version: "1.2"
  document: {
    document_type: "SOLICITUD_CERTIFICADO_EFECTO_PREAVISO"
    title_variant: "STANDARD"
    city: "TIJUANA"
    state: "B.C."
    // ... resto de campos
  }
  notary_header: { ... }
  legal_basis: { ... }
  registry_background: { ... }
  transaction: { ... }
  parties: {
    sellers: Party[]
    buyers: Party[]
    credit_parties: Party[]
  }
  acts: Act[]
  property_object: { ... }
  footer: { ... }
  output_controls: { ... }
  traceability: { ... }
}
```

#### Paso 2: Actualizar PROMPT 4 para Requerir JSON v1.2 Completo
- El agente debe generar JSON v1.2 completo cuando todos los datos estén listos
- No solo campos básicos, sino estructura completa

#### Paso 3: Crear Nuevo Generador
```typescript
class PreavisoDocumentRenderer {
  static renderFromCanonicalJSON(json: CanonicalJSONv12): PreavisoDocument {
    // Renderizar según estructura fija de PROMPT 2:
    // 1. Encabezado del notario
    // 2. Título del documento
    // 3. ANTECEDENTES REGISTRALES
    // 4. Destinatario
    // 5. Párrafo legal del art. 2885
    // 6. Frase obligatoria
    // 7. Actos jurídicos (romanos)
    // 8. OBJETO DE LA COMPRAVENTA
    // 9. Descripción del inmueble
    // 10. Cierre
    // 11. Firma del notario
  }
}
```

#### Paso 4: Validación Pre-Renderizado
```typescript
class PreavisoValidator {
  static validateCanonicalJSON(json: any): ValidationResult {
    // Validar contra schema v1.2
    // Verificar campos requeridos
    // Verificar tipos de datos
    // Verificar reglas de negocio
  }
}
```

## PREGUNTAS PARA DECIDIR

1. **¿El agente debe generar JSON v1.2 completo o solo campos básicos?**
   - Completo: Más trabajo para el agente, pero más determinístico
   - Básico: Menos trabajo, pero requiere transformación

2. **¿Dónde debe vivir la lógica de renderizado?**
   - Código: Determinístico, versionado
   - Template: Editable sin deploy

3. **¿Necesitas múltiples formatos de salida?**
   - Word, PDF, HTML: Requiere template engine o múltiples renderers
   - Solo Word: Puede ser más simple

4. **¿El documento debe ser editable después de generado?**
   - Sí: Word es mejor opción
   - No: PDF puede ser suficiente

## PRÓXIMOS PASOS

Una vez decidida la opción:
1. Definir interfaz TypeScript para JSON v1.2
2. Actualizar PROMPT 4 para requerir JSON completo
3. Crear validador de JSON v1.2
4. Crear generador/renderizador según opción elegida
5. Actualizar flujo de extracción de datos

