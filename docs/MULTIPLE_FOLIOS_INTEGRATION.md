# Integración de Reglas para Múltiples Folios Reales

## REGLAS RECIBIDAS

```
MULTIPLE FOLIOS RULE:

- Each folio must be captured as a separate registry entry.
- Shared data must NOT be inferred across folios.
- Missing data in any folio → BLOCK entire process.
```

## INTEGRACIÓN EN PROMPTS

### PROMPT 2 (BUSINESS RULES) - Agregar Sección

**AGREGAR en "TERMINOLOGY DEFINITIONS":**

```
"partidas" (registry entries):
- Definition: Array of registry entry identifiers (partidas) associated with a property.
- Structure: Each partida is a separate registry entry with its own data.
- Requirement: MUST capture each folio as a separate registry entry.
- Validation: All partidas must have complete data (see MULTIPLE FOLIOS RULE).

"folio_real":
- Definition: The registry folio number identifying the property.
- Note: A single property transaction may involve multiple folios reales.
- If multiple folios detected: Each must be captured separately (see MULTIPLE FOLIOS RULE).
```

**AGREGAR nueva sección después de ESTADO 2:**

```
========================
MULTIPLE FOLIOS RULE (STRICT, NON-NEGOTIABLE)
========================

REQUIREMENT:
- Each folio must be captured as a separate registry entry.
- Shared data must NOT be inferred across folios.
- Missing data in any folio → BLOCK entire process.

DETECTION:
- If processed documento (escritura) contains multiple folioReal values:
  1. List all folios found: "Found folios: [folio1, folio2, ...]"
  2. Request user confirmation: "Which folio(s) correspond to this transaction?"
  3. Wait for explicit user response.
  4. DO NOT assume or choose automatically.

CAPTURE PROCESS:
For each folio confirmed by user:
1. Create separate registry entry object.
2. Capture folio-specific data:
   - folioReal (specific to this entry)
   - partida (specific to this entry)
   - seccion (specific to this entry)
   - direccion (if different per folio)
   - superficie (if different per folio)
   - valor (if different per folio)
3. DO NOT infer shared data:
   - If folio1 has direccion but folio2 does not → Request direccion for folio2 explicitly.
   - DO NOT copy direccion from folio1 to folio2.
   - DO NOT assume they share the same address.
4. Validate completeness for EACH folio:
   - Each folio must have: folioReal, partida, seccion, direccion, superficie, valor.
   - If ANY folio is missing ANY required field → BLOCK entire process.

DATA STRUCTURE:
partidas: [
  {
    folioReal: "123456",
    partida: "A-12",
    seccion: "CIVIL",
    direccion: "Calle Principal 123",
    superficie: "150 m²",
    valor: "$500,000"
  },
  {
    folioReal: "123457",
    partida: "A-13",
    seccion: "CIVIL",
    direccion: "Calle Principal 125",  // Must be captured separately, not inferred
    superficie: "200 m²",  // Must be captured separately, not inferred
    valor: "$600,000"  // Must be captured separately, not inferred
  }
]

BLOCKING CONDITIONS:
- Multiple folios detected but user has not confirmed which ones apply → BLOCK
- Any folio in partidas array is missing required fields → BLOCK entire process
- Any shared data is inferred (not explicitly captured) → BLOCK

VALIDATION EXAMPLES:

VALID (explicit capture):
- Folio 1: direccion = "Calle A 123" (explicitly captured)
- Folio 2: direccion = "Calle B 456" (explicitly captured)
- Result: Both have explicit data → Proceed

INVALID (inferred data):
- Folio 1: direccion = "Calle A 123" (explicitly captured)
- Folio 2: direccion = "Calle A 123" (inferred from Folio 1) → PROHIBITED
- Result: BLOCK → Request explicit direccion for Folio 2

INVALID (missing data):
- Folio 1: All fields complete
- Folio 2: direccion missing
- Result: BLOCK → Request missing direccion for Folio 2
```

### PROMPT 2 - Actualizar ESTADO 2

**ACTUALIZAR la sección ESTADO 2:**

```
ESTADO 2 – INMUEBLE Y REGISTRO (BLOQUEANTE – CONSOLIDADO)
Required:
- folioReal (if single folio) OR partidas array (if multiple folios, see MULTIPLE FOLIOS RULE)
- partidas (array, >=1 items, each with complete data)
- all_registry_pages_confirmed == true (see TERMINOLOGY DEFINITIONS: must be explicit user confirmation)
- For EACH folio in partidas: direccion, superficie, valor (see MULTIPLE FOLIOS RULE)

MULTIPLE FOLIOS HANDLING:
- If processed documento contains multiple folioReal values:
  1. List all folios: "Found folios: [list]"
  2. Request: "Which folio(s) correspond to this transaction?"
  3. Wait for user confirmation.
  4. For each confirmed folio, capture data separately (see MULTIPLE FOLIOS RULE).
  5. DO NOT infer shared data across folios.
  6. If ANY folio is missing ANY required field → BLOCK entire process.

CONFIRMATION OF REGISTRY PAGES:
- You MUST ask: "¿Confirmas que estas son TODAS las hojas registrales vigentes?"
- all_registry_pages_confirmed == true ONLY if user gives explicit confirmation (see TERMINOLOGY DEFINITIONS).
- DO NOT infer from user uploading documents.
- DO NOT assume from context.
- If user response is not explicit confirmation → all_registry_pages_confirmed = false → BLOCK advancement.
```

### PROMPT 2 - Actualizar Blocking Rules

**ACTUALIZAR la sección "BLOCKING RULES":**

```
BLOCKING RULES (ENFORCE STRICTLY):
These are boolean conditions. If ANY condition is true, STOP and request missing data.

TRANSITION BLOCKS:
- ESTADO 1 → 2: tipoOperacion == null OR necesitaCredito == undefined
- ESTADO 2 → 3: folioReal == null AND partidas.length == 0 OR partidas.length > 0 AND (any partida missing required fields OR all_registry_pages_confirmed != true OR any partida missing direccion OR any partida missing superficie OR any partida missing valor)
- ESTADO 3 → 4: vendedor.nombre == null OR vendedor.tipoPersona == null OR (vendedor.tipoPersona == persona_fisica AND estado_civil == null) OR (vendedor.tipoPersona == persona_moral AND (denominacion_social == null OR denominacion_social != CSF_match OR denominacion_social_not_confirmed)) OR vendedor_titular_match == false OR titular_registral == null
- ESTADO 4 → 5: comprador.tipoPersona == null OR (comprador.tipoPersona == persona_fisica AND comprador.nombre == null) OR (comprador.tipoPersona == persona_moral AND (denominacion_social == null OR denominacion_social != CSF_match OR denominacion_social_not_confirmed))
- ESTADO 5 → 6: necesitaCredito == true AND (institucionCredito == null OR montoCredito == null)
- ESTADO 6 → 8: existeHipoteca == true AND cancelacionConfirmada != true

MULTIPLE FOLIOS SPECIFIC BLOCKS:
- Multiple folios detected but user has not confirmed which ones apply → BLOCK
- partidas.length > 0 AND any partida.folioReal == null → BLOCK
- partidas.length > 0 AND any partida.partida == null → BLOCK
- partidas.length > 0 AND any partida.seccion == null → BLOCK
- partidas.length > 0 AND any partida.direccion == null → BLOCK
- partidas.length > 0 AND any partida.superficie == null → BLOCK
- partidas.length > 0 AND any partida.valor == null → BLOCK
- Any shared data inferred (not explicitly captured) → BLOCK
```

### PROMPT 3 - Actualizar Formato

**AGREGAR sección cuando hay múltiples folios:**

```
CURRENT STATE: ESTADO 2 – INMUEBLE Y REGISTRO

MULTIPLE FOLIOS DETECTED:
- Processed documento (escritura.pdf) contains multiple folioReal values:
  - Folio 1: "123456"
  - Folio 2: "123457"
  - Folio 3: "123458"
- User confirmation status: [pending | confirmed: [list of confirmed folios]]

Data already captured (per folio):
- Folio "123456":
  - partida: "A-12" (SOURCE: documento procesado, CONFIRMED: yes)
  - seccion: "CIVIL" (SOURCE: documento procesado, CONFIRMED: yes)
  - direccion: "Calle Principal 123" (SOURCE: documento procesado, CONFIRMED: yes)
  - superficie: "150 m²" (SOURCE: documento procesado, CONFIRMED: yes)
  - valor: "$500,000" (SOURCE: documento procesado, CONFIRMED: yes)

- Folio "123457":
  - partida: "A-13" (SOURCE: documento procesado, CONFIRMED: yes)
  - seccion: "CIVIL" (SOURCE: documento procesado, CONFIRMED: yes)
  - direccion: null (MISSING - must be captured explicitly, DO NOT infer from Folio 1)
  - superficie: null (MISSING - must be captured explicitly, DO NOT infer from Folio 1)
  - valor: null (MISSING - must be captured explicitly, DO NOT infer from Folio 1)

Missing / Unconfirmed (REQUIRED for current state):
- Folio "123457": direccion, superficie, valor (REQUIRED - must be captured explicitly, not inferred)

BLOCKING CONDITIONS ACTIVE:
- Folio "123457" missing direccion → BLOCKED: Cannot advance to ESTADO 3
- Folio "123457" missing superficie → BLOCKED: Cannot advance to ESTADO 3
- Folio "123457" missing valor → BLOCKED: Cannot advance to ESTADO 3

INSTRUCTION:
- Request data for Folio "123457" explicitly.
- DO NOT infer direccion, superficie, or valor from Folio "123456".
- DO NOT assume they share the same data.
- Each folio must have complete data before proceeding.
```

**O si hay un solo folio:**

```
CURRENT STATE: ESTADO 2 – INMUEBLE Y REGISTRO

SINGLE FOLIO:
- folioReal: "123456" (SOURCE: documento procesado, CONFIRMED: yes)
- partidas: ["A-12"] (SOURCE: documento procesado, CONFIRMED: yes)

Data already captured:
- folioReal: "123456" (SOURCE: documento procesado, CONFIRMED: yes)
- partidas: ["A-12"] (SOURCE: documento procesado, CONFIRMED: yes)
- seccion: "CIVIL" (SOURCE: documento procesado, CONFIRMED: yes)
- direccion: "Calle Principal 123" (SOURCE: documento procesado, CONFIRMED: yes)
- superficie: "150 m²" (SOURCE: documento procesado, CONFIRMED: yes)
- valor: "$500,000" (SOURCE: documento procesado, CONFIRMED: yes)
```

### PROMPT 4 - Actualizar Reglas de Validación

**AGREGAR en la sección de validación:**

```
MULTIPLE FOLIOS VALIDATION RULES:

When partidas.length > 1:
- Each partida object in the array MUST have complete data:
  - folioReal (required)
  - partida (required)
  - seccion (required)
  - direccion (required)
  - superficie (required)
  - valor (required)
- DO NOT include partida objects with missing required fields.
- DO NOT infer shared data across partidas.

INVALID <DATA_UPDATE> EXAMPLES:

Example 1 - Missing data in one folio:
<DATA_UPDATE>
{
  "inmueble": {
    "partidas": [
      {
        "folioReal": "123456",
        "partida": "A-12",
        "direccion": "Calle A 123",
        "superficie": "150 m²",
        "valor": "$500,000"
      },
      {
        "folioReal": "123457",
        "partida": "A-13",
        "direccion": null,  // INVALID: Missing required field
        "superficie": null,  // INVALID: Missing required field
        "valor": null  // INVALID: Missing required field
      }
    ]
  }
}
</DATA_UPDATE>

Example 2 - Inferred data:
<DATA_UPDATE>
{
  "inmueble": {
    "partidas": [
      {
        "folioReal": "123456",
        "partida": "A-12",
        "direccion": "Calle A 123",
        "superficie": "150 m²",
        "valor": "$500,000"
      },
      {
        "folioReal": "123457",
        "partida": "A-13",
        "direccion": "Calle A 123",  // INVALID: Inferred from Folio 1, not explicitly captured
        "superficie": "150 m²",  // INVALID: Inferred from Folio 1, not explicitly captured
        "valor": "$500,000"  // INVALID: Inferred from Folio 1, not explicitly captured
      }
    ]
  }
}
</DATA_UPDATE>

VALID EXAMPLE:
<DATA_UPDATE>
{
  "inmueble": {
    "partidas": [
      {
        "folioReal": "123456",
        "partida": "A-12",
        "direccion": "Calle A 123",
        "superficie": "150 m²",
        "valor": "$500,000"
      },
      {
        "folioReal": "123457",
        "partida": "A-13",
        "direccion": "Calle B 456",  // VALID: Explicitly captured
        "superficie": "200 m²",  // VALID: Explicitly captured
        "valor": "$600,000"  // VALID: Explicitly captured
      }
    ]
  }
}
</DATA_UPDATE>
```

## IMPACTO EN EL ANÁLISIS

### ✅ RESUELTO:

- **Pregunta 5**: "¿Cómo manejar múltiples folios reales en un documento?" → **RESUELTA**:
  - Cada folio debe capturarse como entrada registral separada.
  - Datos compartidos NO deben inferirse entre folios.
  - Datos faltantes en cualquier folio → BLOQUEAR todo el proceso.

### REGLAS CRÍTICAS AÑADIDAS:

1. **Separación estricta**: Cada folio es una entrada registral independiente.
2. **Prohibición de inferencia**: No se puede inferir datos compartidos entre folios.
3. **Bloqueo completo**: Si cualquier folio tiene datos faltantes, se bloquea todo el proceso.
4. **Estructura de datos**: Definición clara de cómo estructurar el array de partidas.

### ACTUALIZACIONES REQUERIDAS:

1. **PROMPT 2**: Agregar sección "MULTIPLE FOLIOS RULE" completa.
2. **PROMPT 2**: Actualizar ESTADO 2 para incluir manejo de múltiples folios.
3. **PROMPT 2**: Actualizar blocking rules para incluir validación por folio.
4. **PROMPT 3**: Agregar sección de estado cuando hay múltiples folios.
5. **PROMPT 4**: Agregar ejemplos de validación para múltiples folios.

## PREGUNTAS BLOQUEANTES ACTUALIZADAS

### ✅ RESUELTAS:

- ✅ Pregunta 2: "¿Cómo se determina 'existeHipoteca'?" → RESUELTA
- ✅ Pregunta 3: "¿Es CSF obligatorio para persona moral?" → RESUELTA
- ✅ Pregunta 4: "¿Qué hacer cuando vendedor.nombre != titular_registral?" → RESUELTA
- ✅ Pregunta 5: "¿Cómo manejar múltiples folios reales?" → RESUELTA
- ✅ Pregunta 6: "¿Qué constituye 'all_registry_pages_confirmed'?" → RESUELTA
- ✅ Pregunta 7: "¿Debe PROMPT 3 incluir información de documentos procesados?" → RESUELTA

### ⚠️ PENDIENTES:

- ⚠️ Pregunta 1: Modelo de estados (0-8 vs 1-6)
- ⚠️ Pregunta 8: Manejo de "no sé"
- ⚠️ Pregunta 9: Validación de schema v1.2
- ⚠️ Pregunta 10: Datos conflictivos

## VALIDACIÓN POST-IMPLEMENTACIÓN

Después de integrar estas reglas, validar:

1. ✅ El agente NO infiere datos compartidos entre folios.
2. ✅ El agente BLOQUEA si cualquier folio tiene datos faltantes.
3. ✅ El agente captura cada folio como entrada registral separada.
4. ✅ El agente solicita confirmación explícita cuando detecta múltiples folios.

