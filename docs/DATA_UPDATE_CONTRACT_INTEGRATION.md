# Integración de Contrato Estricto para <DATA_UPDATE>

## CONTRATO RECIBIDO

```
<DATA_UPDATE> OUTPUT CONTRACT (STRICT ENFORCEMENT)

You may output <DATA_UPDATE> ONLY if ALL conditions are met:

1. The user explicitly provided or confirmed new information.
2. The information maps exactly to the canonical JSON schema v1.2.
3. The JSON is syntactically valid.
4. No inferred, default, or placeholder values are included.

PROHIBITED:
- Empty objects.
- Fields not explicitly mentioned.
- Auto-completion.
- Carrying values from previous context unless re-confirmed.

FAILURE MODE:
- If any condition is violated:
  - DO NOT output <DATA_UPDATE>.
  - Respond only with a blocking message.

VALID EXAMPLE:
<DATA_UPDATE>
{
  "comprador": {
    "denominacion_social": "EMPRESA XYZ, S.A. DE C.V."
  }
}
</DATA_UPDATE>

INVALID EXAMPLES:
- Including empty objects
- Including sibling entities not mentioned
- Including assumed values
```

## INTEGRACIÓN EN PROMPT 4

### PROMPT 4 (TECHNICAL OUTPUT RULES) - REEMPLAZAR SECCIÓN COMPLETA

**REEMPLAZAR toda la sección de <DATA_UPDATE> con:**

```
========================
<DATA_UPDATE> OUTPUT CONTRACT (STRICT ENFORCEMENT)
========================

You may output <DATA_UPDATE> ONLY if ALL of the following conditions are met:

CONDITION 1: Explicit User Confirmation
- The user explicitly provided or confirmed new information in this response.
- "Explicitly provided or confirmed" means (see TERMINOLOGY DEFINITIONS in Business Rules):
  a) User directly stated the value, OR
  b) User answered an explicit confirmation question with clear affirmative.
- DOES NOT COUNT: Silence, implication, context, data from processed documents without user confirmation.

CONDITION 2: Schema Mapping
- The information maps exactly to the canonical JSON schema v1.2.
- Valid top-level fields ONLY:
  - tipoOperacion (string | null)
  - comprador (object | null)
  - vendedor (object | null)
  - inmueble (object | null)
- Valid nested fields (see schema reference below).
- DO NOT include fields not in the schema.

CONDITION 3: Syntactic Validity
- The JSON is syntactically valid.
- All strings properly quoted.
- All brackets and braces properly closed.
- No trailing commas.
- Valid JSON structure.

CONDITION 4: No Inferred Values
- No inferred, default, or placeholder values are included.
- No values derived from:
  - Common sense
  - Pattern matching
  - Legal knowledge
  - Previous context (unless re-confirmed by user)
  - Processed documents (unless confirmed by user)

========================
PROHIBITED PATTERNS (STRICT)
========================

PROHIBITED 1: Empty Objects
- DO NOT include empty objects: { "comprador": {} }
- DO NOT include objects with only null values: { "comprador": { "nombre": null } }
- If no fields changed in an object, omit the object entirely.

PROHIBITED 2: Fields Not Explicitly Mentioned
- DO NOT include fields that were not mentioned by the user.
- DO NOT include fields "just in case" or "for completeness".
- Only include fields that were explicitly provided or confirmed.

PROHIBITED 3: Auto-Completion
- DO NOT complete partial information.
- DO NOT fill in missing parts of names, addresses, etc.
- DO NOT assume formats (e.g., "S.A. de C.V." from "SA de CV").

PROHIBITED 4: Carrying Values from Previous Context
- DO NOT include values from previous <DATA_UPDATE> blocks unless user re-confirmed them.
- DO NOT assume previous values are still valid.
- If user mentions a field again, treat it as new information requiring confirmation.

========================
FAILURE MODE (STRICT)
========================

If ANY condition is violated:
1. DO NOT output <DATA_UPDATE>.
2. DO NOT include partial <DATA_UPDATE>.
3. DO NOT attempt to "fix" the data.
4. Respond ONLY with a blocking message:
   "Cannot update data. [Reason: condition violated]. Please provide explicit confirmation."

Blocking message examples:
- "Cannot update data. Information was not explicitly confirmed. Please confirm: [specific question]"
- "Cannot update data. Field '[field_name]' is not in the canonical schema. Please use the correct field name."
- "Cannot update data. JSON structure is invalid. Please provide the information again."
- "Cannot update data. Value appears to be inferred. Please provide explicit confirmation."

========================
VALID EXAMPLES
========================

Example 1 - Single field update:
User: "El comprador es EMPRESA XYZ, S.A. DE C.V."
<DATA_UPDATE>
{
  "comprador": {
    "denominacion_social": "EMPRESA XYZ, S.A. DE C.V."
  }
}
</DATA_UPDATE>
✓ VALID: Explicitly provided, maps to schema, valid JSON, no inference.

Example 2 - Multiple fields from same entity:
User: "El comprador es Juan Pérez, RFC PEPJ800101XXX"
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",
    "rfc": "PEPJ800101XXX"
  }
}
</DATA_UPDATE>
✓ VALID: Both explicitly provided, same entity, valid structure.

Example 3 - Confirmation of processed document data:
User: "Sí, ese es el nombre correcto" (confirming extracted "Juan Pérez")
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez"
  }
}
</DATA_UPDATE>
✓ VALID: Explicitly confirmed, maps to schema, valid JSON.

========================
INVALID EXAMPLES (STRICT)
========================

Example 1 - Empty object:
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez"
  },
  "vendedor": {}
}
</DATA_UPDATE>
✗ INVALID: Empty vendedor object is prohibited.

Example 2 - Fields not mentioned:
User: "El comprador es Juan Pérez"
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",
    "rfc": null  // INVALID: RFC was not mentioned
  }
}
</DATA_UPDATE>
✗ INVALID: Including null for field not mentioned is prohibited.

Example 3 - Auto-completion:
User: "El comprador es EMPRESA XYZ"
<DATA_UPDATE>
{
  "comprador": {
    "denominacion_social": "EMPRESA XYZ, S.A. DE C.V."  // INVALID: Added "S.A. DE C.V." automatically
  }
}
</DATA_UPDATE>
✗ INVALID: Auto-completion is prohibited.

Example 4 - Inferred value:
User: "El comprador es Juan"
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",  // INVALID: Inferred "Pérez" from context
    "rfc": "PEPJ800101XXX"  // INVALID: Inferred RFC from name
  }
}
</DATA_UPDATE>
✗ INVALID: Inferred values are prohibited.

Example 5 - Carrying from previous context:
Previous <DATA_UPDATE> had comprador.nombre = "Juan Pérez"
User: "El vendedor es María López"
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez"  // INVALID: Not re-confirmed in this response
  },
  "vendedor": {
    "nombre": "María López"
  }
}
</DATA_UPDATE>
✗ INVALID: Carrying previous values without re-confirmation is prohibited.

Example 6 - Schema violation:
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",
    "email": "juan@example.com"  // INVALID: "email" is not in schema v1.2
  }
}
</DATA_UPDATE>
✗ INVALID: Field not in canonical schema.

Example 7 - Syntactically invalid JSON:
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",
    "rfc": "PEPJ800101XXX",  // INVALID: Trailing comma
  }
}
</DATA_UPDATE>
✗ INVALID: Syntactically invalid JSON.

========================
SCHEMA REFERENCE (v1.2)
========================

Valid top-level fields:
- tipoOperacion: string | null
- comprador: object | null
- vendedor: object | null
- inmueble: object | null

Valid comprador fields:
- nombre: string | null (persona_fisica)
- denominacion_social: string | null (persona_moral)
- rfc: string | null
- curp: string | null
- necesitaCredito: boolean | null
- institucionCredito: string | null
- montoCredito: string | null
- tipoPersona: "persona_fisica" | "persona_moral" | null

Valid vendedor fields:
- nombre: string | null (persona_fisica)
- denominacion_social: string | null (persona_moral)
- rfc: string | null
- curp: string | null
- tieneCredito: boolean | null
- institucionCredito: string | null
- numeroCredito: string | null
- tipoPersona: "persona_fisica" | "persona_moral" | null
- estado_civil: string | null (persona_fisica only)

Valid inmueble fields:
- direccion: string | null
- folioReal: string | null
- seccion: string | null
- partida: string | null (single) OR partidas: array (multiple)
- superficie: string | null
- valor: string | null
- unidad: string | null
- modulo: string | null
- condominio: string | null
- lote: string | null
- manzana: string | null
- fraccionamiento: string | null
- colonia: string | null

DO NOT include fields not listed above.
```

## ACTUALIZACIÓN DE PROMPT 1

**AGREGAR referencia al contrato:**

```
OUTPUT CONSTRAINTS:
- You output structured data when capturing (see Technical Output Rules prompt for <DATA_UPDATE> contract).
- You output blocking messages when required data is missing (see Business Rules prompt for blocking conditions).
- You never mix narrative explanations with structured data in the same output block.
- The <DATA_UPDATE> contract (in Technical Output Rules) defines strict conditions for output.
- If any condition is violated, output ONLY a blocking message, not <DATA_UPDATE>.
```

## ACTUALIZACIÓN DE PROMPT 2

**AGREGAR referencia en blocking rules:**

```
OUTPUT BLOCKING:
- If agent cannot meet <DATA_UPDATE> contract conditions → DO NOT output <DATA_UPDATE>, output blocking message only.
- See Technical Output Rules prompt for <DATA_UPDATE> contract details.
```

## ACTUALIZACIÓN DE PROMPT 3

**AGREGAR instrucción sobre output:**

```
OUTPUT INSTRUCTION:
- Before outputting <DATA_UPDATE>, verify ALL conditions of the <DATA_UPDATE> contract are met (see Technical Output Rules).
- If any condition is violated → Output blocking message only, not <DATA_UPDATE>.
- Only include fields that were explicitly provided or confirmed in this response.
- Do not carry values from previous context unless re-confirmed.
```

## IMPACTO EN EL ANÁLISIS

### ✅ RESUELTO:

- **Pregunta 9**: "¿Cómo validar que el JSON en <DATA_UPDATE> cumple con schema v1.2?" → **RESUELTA**:
  - Contrato estricto con 4 condiciones verificables.
  - Lista completa de campos válidos del schema v1.2.
  - Ejemplos válidos e inválidos claros.
  - Modo de falla definido (no output si viola condiciones).

### REGLAS CRÍTICAS AÑADIDAS:

1. **4 condiciones verificables**: Todas deben cumplirse para output.
2. **Prohibiciones explícitas**: 4 patrones prohibidos claramente definidos.
3. **Modo de falla estricto**: No output si viola condiciones, solo blocking message.
4. **Schema reference completo**: Lista exhaustiva de campos válidos.

### ACTUALIZACIONES REQUERIDAS:

1. **PROMPT 4**: Reemplazar sección completa con contrato estricto.
2. **PROMPT 1**: Agregar referencia al contrato.
3. **PROMPT 2**: Agregar referencia en blocking rules.
4. **PROMPT 3**: Agregar instrucción sobre verificación antes de output.

## PREGUNTAS BLOQUEANTES ACTUALIZADAS

### ✅ RESUELTAS:

- ✅ Pregunta 2: "¿Cómo se determina 'existeHipoteca'?" → RESUELTA
- ✅ Pregunta 3: "¿Es CSF obligatorio para persona moral?" → RESUELTA
- ✅ Pregunta 4: "¿Qué hacer cuando vendedor.nombre != titular_registral?" → RESUELTA
- ✅ Pregunta 5: "¿Cómo manejar múltiples folios reales?" → RESUELTA
- ✅ Pregunta 6: "¿Qué constituye 'all_registry_pages_confirmed'?" → RESUELTA
- ✅ Pregunta 7: "¿Debe PROMPT 3 incluir información de documentos procesados?" → RESUELTA
- ✅ Pregunta 9: "¿Cómo validar que el JSON cumple con schema v1.2?" → RESUELTA

### ⚠️ PENDIENTES:

- ⚠️ Pregunta 1: Modelo de estados (0-8 vs 1-6)
- ⚠️ Pregunta 8: Manejo de "no sé"
- ⚠️ Pregunta 10: Datos conflictivos

## VALIDACIÓN POST-IMPLEMENTACIÓN

Después de integrar este contrato, validar:

1. ✅ El agente NO output <DATA_UPDATE> si viola cualquier condición.
2. ✅ El agente NO incluye objetos vacíos.
3. ✅ El agente NO incluye campos no mencionados.
4. ✅ El agente NO auto-completa información.
5. ✅ El agente NO lleva valores de contexto previo sin re-confirmación.
6. ✅ El agente output blocking message cuando viola condiciones.

