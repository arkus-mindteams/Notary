# Auditoría Completa de Prompts - Agente Notarial Pre-Aviso

## A) Per-Prompt Issues

### PROMPT 1 (SYSTEM CORE)

**VIOLACIONES DE RESPONSABILIDAD:**

1. **"You behave as a finite-state machine"** - ❌ VIOLACIÓN CRÍTICA
   - **Problema**: Define comportamiento operacional, no solo identidad/cognición.
   - **Impacto**: La lógica de state machine pertenece a PROMPT 2 (Business Rules) o PROMPT 3 (Task/State).
   - **Riesgo**: Mezcla capas de responsabilidad. El agente puede intentar determinar estados sin tener las reglas explícitas.

2. **"You only ask questions required by the current state"** - ❌ VIOLACIÓN CRÍTICA
   - **Problema**: Asume conocimiento de "current state" y "required questions".
   - **Impacto**: Esto es lógica de negocio/state machine, no identidad.
   - **Riesgo**: El agente puede intentar determinar qué preguntar sin tener las reglas explícitas de PROMPT 2.

3. **"You stop immediately if a blocking condition is met"** - ❌ VIOLACIÓN
   - **Problema**: Define comportamiento específico de bloqueo.
   - **Impacto**: Las reglas de bloqueo deberían estar en PROMPT 2 (Business Rules).
   - **Riesgo**: El agente puede no saber QUÉ bloquea sin las reglas de negocio explícitas.

4. **"When capturing data, output ONLY structured <DATA_UPDATE>"** - ❌ VIOLACIÓN PARCIAL
   - **Problema**: Define formato técnico de output.
   - **Impacto**: Esto debería estar completamente en PROMPT 4 (Technical Output Rules).
   - **Riesgo**: Duplicación de responsabilidades entre PROMPT 1 y PROMPT 4.

5. **"When blocked, output ONLY a blocking message and the missing items"** - ❌ VIOLACIÓN
   - **Problema**: Define comportamiento específico de output cuando está bloqueado.
   - **Impacto**: Esto debería estar en PROMPT 4 o PROMPT 2.
   - **Riesgo**: Mezcla reglas de identidad con reglas de output.

**AMBIGÜEDADES:**

1. **"Never advance a process if required data is missing"**
   - **Problema**: No define QUÉ es "required data".
   - **Impacto**: El agente necesita PROMPT 2 para saber qué es requerido.
   - **Riesgo**: Puede ser demasiado conservador o demasiado permisivo.

2. **"Never transform uncertainty into facts"**
   - **Problema**: No define qué constituye "uncertainty" vs "fact".
   - **Impacto**: Puede interpretar información de documentos procesados como "uncertainty".
   - **Riesgo**: Puede rechazar datos válidos de documentos procesados.

3. **"You do not 'help' the user bypass rules"**
   - **Problema**: Asume conocimiento de "rules" sin definirlas.
   - **Impacto**: Necesita PROMPT 2 para saber qué reglas no puede ayudar a bypass.
   - **Riesgo**: Puede ser demasiado rígido o demasiado flexible.

**ELEMENTOS CORRECTOS:**
- ✅ Identity section: Limpia, sin lógica de negocio.
- ✅ Core Principles: Enfocados en anti-inferencia.
- ✅ Domain scope: "regulated notarial domain" es apropiado.

---

### PROMPT 2 (BUSINESS RULES)

**VIOLACIONES DE RESPONSABILIDAD:**

1. **"ROLE LIMITS" section** - ❌ VIOLACIÓN
   - **Problema**: Define identidad ("You prepare", "You NEVER certify").
   - **Impacto**: Esto debería estar en PROMPT 1 (System Core).
   - **Riesgo**: Duplicación y posible conflicto con PROMPT 1.

2. **"You NEVER render the final document text"** - ❌ VIOLACIÓN
   - **Problema**: Define comportamiento de output, no regla de negocio.
   - **Impacto**: Esto debería estar en PROMPT 4 o PROMPT 1.
   - **Riesgo**: Mezcla reglas de negocio con reglas de output.

**AMBIGÜEDADES Y RIESGOS:**

1. **ESTADO 0: "If an expediente exists: continue automatically"**
   - **Problema**: No define cómo determinar si existe.
   - **Impacto**: Requiere contexto dinámico de PROMPT 3.
   - **Riesgo**: El agente puede intentar determinar esto sin información.

2. **ESTADO 2: "all_registry_pages_confirmed == true"**
   - **Problema**: No define QUÉ constituye "confirmed".
   - **Impacto**: ¿Es confirmación explícita del usuario? ¿Automática?
   - **Riesgo**: El agente puede inferir confirmación o requerir confirmación innecesaria.

3. **ESTADO 3: "estado_civil (capture only, print conditionally)"**
   - **Problema**: Mezcla regla de captura con regla de output.
   - **Impacto**: La regla de "print conditionally" debería estar en PROMPT 4 o en reglas de formato.
   - **Riesgo**: Confusión sobre cuándo capturar vs cuándo imprimir.

4. **ESTADO 4: "comprador.nombre OR denominacion_social"**
   - **Problema**: No define cuándo usar uno u otro.
   - **Impacto**: ¿Depende de tipoPersona? ¿Se debe preguntar tipoPersona primero?
   - **Riesgo**: El agente puede capturar nombre cuando debería capturar denominación social.

5. **ESTADO 6: "Required if existeHipoteca == true"**
   - **Problema**: No define cómo determinar "existeHipoteca".
   - **Impacto**: ¿Viene de documento procesado? ¿Confirmación del usuario?
   - **Riesgo**: El agente puede inferir existencia de hipoteca o no detectarla.

6. **ESTADO 8: "If ANY blocking condition exists → STOP"**
   - **Problema**: No define lista exhaustiva de condiciones de bloqueo.
   - **Impacto**: El agente puede no detectar todas las condiciones.
   - **Riesgo**: Puede avanzar cuando debería bloquear.

**FALTANTES CRÍTICOS:**

1. **No hay reglas explícitas para PERSONA MORAL:**
   - PROMPT 2 menciona "denominacion_social" pero no define:
     - ¿Cuándo solicitar CSF?
     - ¿Es CSF obligatorio o recomendado?
     - ¿Qué hacer si no hay CSF?

2. **No hay reglas explícitas para validación de titular registral:**
   - PROMPT 2 menciona validación pero no define:
     - ¿Qué hacer si vendedor.nombre != titular_registral?
     - ¿Es bloqueante o solo advertencia?

3. **No hay reglas explícitas para múltiples folios reales:**
   - ¿Qué hacer si hay múltiples folios en el documento?
   - ¿Es bloqueante o requiere confirmación?

**ELEMENTOS CORRECTOS:**
- ✅ State model explícito con estados numerados.
- ✅ Blocking rules con condiciones booleanas claras.
- ✅ Required fields por estado.

---

### PROMPT 3 (TASK / STATE)

**VIOLACIONES DE RESPONSABILIDAD:**

1. **"Do NOT advance state"** - ❌ VIOLACIÓN
   - **Problema**: Define comportamiento de transición de estado.
   - **Impacto**: Esto debería estar en PROMPT 2 (Business Rules) como regla de bloqueo.
   - **Riesgo**: Duplicación de lógica entre PROMPT 2 y PROMPT 3.

**AMBIGÜEDADES Y RIESGOS:**

1. **"Data already captured"**
   - **Problema**: No define fuente de datos (¿documento procesado? ¿confirmación usuario?).
   - **Impacto**: El agente puede no saber si puede usar estos datos o necesita confirmación.
   - **Riesgo**: Puede usar datos sin confirmación o pedir confirmación innecesaria.

2. **"Missing / Unconfirmed"**
   - **Problema**: No diferencia entre "missing" (nunca capturado) y "unconfirmed" (capturado pero no confirmado).
   - **Impacto**: El agente puede tratar ambos casos igual.
   - **Riesgo**: Puede pedir datos que ya están capturados o no pedir confirmación cuando es necesaria.

3. **"Ask ONLY for missing fields"**
   - **Problema**: No define orden de preguntas.
   - **Impacto**: ¿Debe preguntar todos a la vez? ¿Uno por uno?
   - **Riesgo**: Puede hacer múltiples preguntas o preguntar en orden incorrecto.

**FALTANTES CRÍTICOS:**

1. **No hay información sobre documentos procesados:**
   - PROMPT 3 no menciona si hay documentos procesados disponibles.
   - **Impacto**: El agente puede no saber que puede usar datos de documentos.
   - **Riesgo**: Puede pedir información que ya está en documentos procesados.

2. **No hay información sobre estado de confirmación:**
   - PROMPT 3 no indica qué campos están "capturados pero no confirmados".
   - **Impacto**: El agente puede no saber qué necesita confirmación explícita.
   - **Riesgo**: Puede avanzar sin confirmación requerida.

**ELEMENTOS CORRECTOS:**
- ✅ Estado actual explícito.
- ✅ Lista de datos capturados.
- ✅ Lista de datos faltantes.
- ✅ No repite reglas globales.

---

### PROMPT 4 (TECHNICAL OUTPUT RULES)

**VIOLACIONES DE RESPONSABILIDAD:**

1. **"Include <DATA_UPDATE> ONLY if: New information was explicitly provided or confirmed"** - ⚠️ AMBIGÜEDAD
   - **Problema**: No define qué constituye "explicitly provided" vs "confirmed".
   - **Impacto**: ¿Datos de documentos procesados son "explicitly provided"?
   - **Riesgo**: El agente puede incluir datos sin confirmación o excluir datos válidos.

**FALTANTES CRÍTICOS:**

1. **No hay validación de schema:**
   - PROMPT 4 menciona "canonical schema v1.2" pero no define qué campos son válidos.
   - **Impacto**: El agente puede incluir campos no válidos.
   - **Riesgo**: JSON inválido o campos incorrectos.

2. **No hay reglas para campos null:**
   - PROMPT 4 dice "DO NOT include fields not mentioned" pero no define qué hacer con campos mencionados pero con valor null.
   - **Impacto**: ¿Debe incluir `"rfc": null` o omitir el campo?
   - **Riesgo**: Inconsistencia en el formato JSON.

3. **No hay reglas para objetos anidados:**
   - PROMPT 4 muestra ejemplo con `"comprador": { "nombre": "Juan Pérez", "rfc": null }` pero no define:
     - ¿Debe incluir objeto completo si solo un campo cambió?
     - ¿Debe incluir objeto vacío si ningún campo cambió?
   - **Riesgo**: Estructura JSON inconsistente.

4. **No hay reglas para cuando está bloqueado:**
   - PROMPT 4 no define qué output cuando el agente está bloqueado.
   - **Impacto**: PROMPT 1 dice "output ONLY a blocking message" pero PROMPT 4 no lo refuerza.
   - **Riesgo**: El agente puede incluir <DATA_UPDATE> cuando está bloqueado.

5. **No hay ejemplos de casos edge:**
   - ¿Qué hacer si el usuario corrige un dato?
   - ¿Qué hacer si el usuario dice "no sé"?
   - ¿Qué hacer si hay datos conflictivos?

**ELEMENTOS CORRECTOS:**
- ✅ Ejemplos válidos e inválidos.
- ✅ Reglas mecánicas (no interpretación).
- ✅ Enfoque en formato, no en contenido.

---

## B) Cross-Prompt Conflicts

### CONFLICTOS EXPLÍCITOS:

1. **PROMPT 1 vs PROMPT 2: "ROLE LIMITS"**
   - **PROMPT 1**: Define identidad completa.
   - **PROMPT 2**: Tiene sección "ROLE LIMITS" que duplica PROMPT 1.
   - **Conflicto**: Duplicación y posible inconsistencia.
   - **Riesgo**: Si se actualiza uno y no el otro, hay contradicción.

2. **PROMPT 1 vs PROMPT 4: Output cuando bloqueado**
   - **PROMPT 1**: "When blocked, output ONLY a blocking message and the missing items."
   - **PROMPT 4**: No menciona qué hacer cuando está bloqueado.
   - **Conflicto**: PROMPT 4 no refuerza la regla de PROMPT 1.
   - **Riesgo**: El agente puede incluir <DATA_UPDATE> cuando está bloqueado.

3. **PROMPT 2 vs PROMPT 3: Transiciones de estado**
   - **PROMPT 2**: Define blocking rules para transiciones.
   - **PROMPT 3**: Dice "Do NOT advance state" sin definir condiciones.
   - **Conflicto**: Lógica duplicada pero no sincronizada.
   - **Riesgo**: PROMPT 3 puede contradecir PROMPT 2.

4. **PROMPT 2 vs PROMPT 3: Estado actual**
   - **PROMPT 2**: Define ESTADO 0-8.
   - **PROMPT 3**: Muestra "ESTADO 2" pero el código genera ESTADO 1-6.
   - **Conflicto**: Desincronización entre modelo de estados.
   - **Riesgo**: El agente puede estar en un estado que no existe en PROMPT 2.

### RIESGOS IMPLÍCITOS:

1. **Inferencia de datos faltantes:**
   - PROMPT 1 prohíbe inferir.
   - PROMPT 3 muestra "Data already captured" pero no define fuente.
   - **Riesgo**: El agente puede inferir que datos "already captured" son válidos sin confirmación.

2. **Avance prematuro:**
   - PROMPT 2 define blocking rules pero PROMPT 3 puede no reflejar todas las condiciones.
   - **Riesgo**: El agente puede avanzar si PROMPT 3 no muestra todas las condiciones de bloqueo.

3. **Completado silencioso:**
   - PROMPT 4 dice "DO NOT include inferred values" pero no define qué es "inferred".
   - PROMPT 3 muestra datos "already captured" que pueden ser inferidos.
   - **Riesgo**: El agente puede incluir datos inferidos como "already captured".

4. **Comportamiento de persona moral:**
   - PROMPT 2 menciona "denominacion_social" pero no define reglas completas.
   - PROMPT 3 no muestra información sobre persona moral.
   - **Riesgo**: El agente puede no saber cómo manejar persona moral correctamente.

---

## C) Missing Guardrails

### GUARDRAILS FALTANTES EN PROMPT 1:

1. **Explicit domain scope:**
   - Falta: "You operate exclusively in Mexican notarial law (Baja California, Código Civil art. 2885)."
   - **Por qué**: Limita el dominio legal y previene aplicación incorrecta de leyes.

2. **Explicit source requirements:**
   - Falta: "All data must come from: (1) user explicit confirmation, (2) processed documents, or (3) user manual entry with confirmation."
   - **Por qué**: Define fuentes válidas y previene inferencia.

3. **Explicit null handling:**
   - Falta: "If a field is not explicitly provided or confirmed, set it to null. Do not use common sense, legal knowledge, or pattern matching to fill gaps."
   - **Por qué**: Hace explícito el manejo de null y previene completado silencioso.

### GUARDRAILS FALTANTES EN PROMPT 2:

1. **Explicit validation rules for persona moral:**
   - Falta: "If tipoPersona == persona_moral: (1) denominacion_social is REQUIRED, (2) CSF is RECOMMENDED but not mandatory if denominacion_social is explicitly confirmed by user, (3) name_confirmed_exact must be true before advancing."
   - **Por qué**: Define reglas explícitas para persona moral y previene ambigüedad.

2. **Explicit rules for titular registral validation:**
   - Falta: "If vendedor.nombre != titular_registral from escritura: (1) STOP, (2) Request explicit confirmation from user, (3) Do not advance until confirmed."
   - **Por qué**: Define qué hacer cuando hay discrepancia y previene avance con datos incorrectos.

3. **Explicit rules for multiple folios reales:**
   - Falta: "If documento procesado contains multiple folioReal values: (1) List all folios found, (2) Request user to confirm which folio is correct for this transaction, (3) Do not assume or choose automatically."
   - **Por qué**: Previene selección automática incorrecta de folio real.

4. **Explicit definition of "confirmed":**
   - Falta: "all_registry_pages_confirmed == true ONLY if: (1) User explicitly confirms 'yes, these are all pages', OR (2) User provides written confirmation."
   - **Por qué**: Define qué constituye confirmación y previene inferencia.

5. **Explicit rules for estado_civil:**
   - Falta: "estado_civil is REQUIRED for persona_fisica. If not provided: (1) Ask explicitly, (2) Do not infer from name, age, or other data, (3) Do not advance to next state until provided."
   - **Por qué**: Previene inferencia de estado civil.

6. **Explicit rules for existeHipoteca:**
   - Falta: "existeHipoteca == true ONLY if: (1) Documento procesado (escritura) explicitly shows hipoteca/gravamen, OR (2) User explicitly confirms existence. Do not infer from absence of mention."
   - **Por qué**: Previene inferencia incorrecta de existencia de hipoteca.

### GUARDRAILS FALTANTES EN PROMPT 3:

1. **Explicit source annotation:**
   - Falta: Para cada dato "already captured", indicar fuente: "(from documento procesado)", "(from user confirmation)", "(from user manual entry)".
   - **Por qué**: El agente sabe si necesita confirmación o no.

2. **Explicit confirmation status:**
   - Falta: Para cada dato, indicar si está "captured" vs "captured and confirmed".
   - **Por qué**: El agente sabe qué necesita confirmación explícita.

3. **Explicit document availability:**
   - Falta: Lista de documentos procesados disponibles y qué información contienen.
   - **Por qué**: El agente puede usar datos de documentos sin pedirlos de nuevo.

4. **Explicit blocking conditions:**
   - Falta: Lista explícita de condiciones de bloqueo activas para el estado actual.
   - **Por qué**: El agente sabe exactamente qué le impide avanzar.

### GUARDRAILS FALTANTES EN PROMPT 4:

1. **Explicit schema validation:**
   - Falta: Lista completa de campos válidos del schema v1.2.
   - **Por qué**: Previene campos inválidos en JSON.

2. **Explicit null handling:**
   - Falta: "If a field is mentioned but value is null: (1) Include field with null value, (2) Do not omit the field."
   - **Por qué**: Consistencia en formato JSON.

3. **Explicit rules for nested objects:**
   - Falta: "If updating a nested object (e.g., comprador): (1) Include only fields that changed, (2) Include null for unchanged fields that were mentioned, (3) Do not include empty objects."
   - **Por qué**: Previene objetos vacíos o estructuras inconsistentes.

4. **Explicit rules for blocked state:**
   - Falta: "If agent is in blocked state: (1) Do NOT include <DATA_UPDATE>, (2) Output ONLY blocking message with list of missing items, (3) Do not mix narrative with structured output."
   - **Por qué**: Refuerza PROMPT 1 y previene output incorrecto cuando está bloqueado.

5. **Explicit rules for data correction:**
   - Falta: "If user corrects previously captured data: (1) Include corrected value in <DATA_UPDATE>, (2) Set previous value to null or omit, (3) Indicate in narrative that correction was made."
   - **Por qué**: Manejo correcto de correcciones.

6. **Explicit rules for "no sé" responses:**
   - Falta: "If user responds 'no sé' or 'no tengo': (1) Do NOT infer value, (2) Set field to null, (3) Ask if they can provide it later or if it's truly unavailable."
   - **Por qué**: Previene inferencia cuando el usuario no sabe.

---

## D) Concrete Improvement Proposals

### PROMPT 1 - Cambios Específicos:

**ELIMINAR:**
```
- "You behave as a finite-state machine."
- "You only ask questions required by the current state."
- "You stop immediately if a blocking condition is met."
- "When capturing data, output ONLY structured <DATA_UPDATE>."
- "When blocked, output ONLY a blocking message and the missing items."
- "Never mix narrative explanations with structured output."
```

**AGREGAR después de "CORE PRINCIPLES":**
```
DATA SOURCE REQUIREMENTS:
All captured data MUST come from exactly one of these sources:
- User explicit confirmation (verbal or written)
- Processed documents (OCR/extraction results from uploaded files)
- User manual entry with explicit confirmation

If data does not come from one of these sources, it is invalid and must be set to null.

COGNITIVE CONSTRAINTS:
- You do not "understand" legal implications.
- You do not "help" by filling gaps.
- You do not "suggest" what data might be correct.
- You only capture what is explicitly provided or confirmed.
- You do not use common sense, legal knowledge, or pattern matching to fill data gaps.
```

**REFINAR "Never advance a process":**
```
PROCESS ADVANCEMENT CONSTRAINT:
Before moving to any next step, verify that all REQUIRED fields for current step are non-null and confirmed. 
If any required field is null or unconfirmed, you MUST stop and request it.
Required fields are defined in the Business Rules prompt, not here.
```

### PROMPT 2 - Cambios Específicos:

**ELIMINAR sección "ROLE LIMITS":**
```
(Esta sección debe estar solo en PROMPT 1)
```

**AGREGAR después de "ESTADO 0":**
```
ESTADO 0 – EXPEDIENTE (AUTOMÁTICO)
- Determination logic: Provided by dynamic context (PROMPT 3).
- If expediente exists: Continue automatically (DO NOT ask).
- If new expediente: Create automatically (DO NOT ask).
- Request: ONLY official identification (INE/IFE/Passport) of main buyer.
- PROHIBITED: Asking "Is this new or existing?" or asking buyer name before identification.
```

**AGREGAR después de "ESTADO 2":**
```
ESTADO 2 – INMUEBLE Y REGISTRO (BLOQUEANTE – CONSOLIDADO)
Required:
- folioReal (from escritura or user confirmation)
- partidas (array, >=1 items, from escritura or user confirmation)
- all_registry_pages_confirmed == true (ONLY if user explicitly confirms "yes, these are all pages")
- inmueble.direccion (from escritura, plano, or user confirmation)
- inmueble.superficie (from escritura, plano, or user confirmation)
- inmueble.valor (from escritura or user confirmation)

MULTIPLE FOLIOS REALES:
If documento procesado contains multiple folioReal values:
1. List all folios found: "Found folios: [list]"
2. Request: "Which folio corresponds to this transaction?"
3. DO NOT assume or choose automatically.
4. Block advancement until user confirms.

VALIDATION OF TITULAR REGISTRAL:
If vendedor.nombre != titular_registral from escritura:
1. STOP immediately.
2. Request explicit confirmation: "The registered owner in the escritura is [name]. Is this the same as the seller [vendedor.nombre]?"
3. Do not advance until user confirms.
```

**AGREGAR después de "ESTADO 3":**
```
ESTADO 3 – TRANSMITENTES
Required:
- vendedor.nombre (REQUIRED, from identification or user confirmation)
- vendedor.tipoPersona (REQUIRED, "persona_fisica" or "persona_moral")
- If persona_fisica: estado_civil (REQUIRED, ask explicitly, do not infer)
- If persona_moral: denominacion_social (REQUIRED, must be explicitly confirmed)

ESTADO CIVIL RULES:
- estado_civil is REQUIRED for persona_fisica.
- Ask explicitly: "What is the civil status?"
- DO NOT infer from name, age, or other data.
- Valid values: "soltero", "casado", "divorciado", "viudo", "union_libre".
- Do not advance until provided.
```

**AGREGAR después de "ESTADO 4":**
```
ESTADO 4 – ADQUIRENTES
Required:
- comprador.tipoPersona (REQUIRED, ask first: "Is the buyer a natural person or legal entity?")
- If persona_fisica: comprador.nombre (REQUIRED, from identification or user confirmation)
- If persona_moral: denominacion_social (REQUIRED, must be explicitly confirmed)

PERSONA MORAL RULES:
If tipoPersona == persona_moral:
1. denominacion_social is REQUIRED (must be explicitly confirmed by user).
2. CSF (Constancia de Situación Fiscal) is RECOMMENDED but not mandatory.
3. If CSF is provided: Use it to validate denominacion_social.
4. If CSF is not provided: Request explicit confirmation: "Please confirm the exact legal name as it should appear in the document."
5. name_confirmed_exact must be true before advancing.
6. DO NOT print: RFC, fiscal address, fiscal regime, "represented by", representative data, or powers.
```

**AGREGAR después de "ESTADO 6":**
```
ESTADO 6 – GRAVÁMENES / HIPOTECA
DETERMINATION OF existeHipoteca:
existeHipoteca == true ONLY if:
1. Documento procesado (escritura) explicitly shows hipoteca/gravamen in extracted data, OR
2. User explicitly confirms existence: "Yes, there is a mortgage."

DO NOT infer from:
- Absence of mention in documento
- Common patterns
- Assumptions

If existeHipoteca == true:
Required:
- cancelacionConfirmada == true (ONLY if user explicitly confirms cancellation)
- If multiple hipotecas detected: Warn user that legal review is mandatory.
```

**REFINAR "BLOCKING RULES":**
```
BLOCKING RULES (ENFORCE STRICTLY):
These are boolean conditions. If ANY condition is true, STOP and request missing data.

TRANSITION BLOCKS:
- ESTADO 1 → 2: tipoOperacion == null OR necesitaCredito == undefined
- ESTADO 2 → 3: folioReal == null OR partidas.length == 0 OR all_registry_pages_confirmed != true OR inmueble.direccion == null OR inmueble.superficie == null OR inmueble.valor == null
- ESTADO 3 → 4: vendedor.nombre == null OR vendedor.tipoPersona == null OR (vendedor.tipoPersona == persona_fisica AND estado_civil == null) OR (vendedor.tipoPersona == persona_moral AND denominacion_social == null)
- ESTADO 4 → 5: comprador.tipoPersona == null OR (comprador.tipoPersona == persona_fisica AND comprador.nombre == null) OR (comprador.tipoPersona == persona_moral AND denominacion_social == null OR name_confirmed_exact != true)
- ESTADO 5 → 6: necesitaCredito == true AND (institucionCredito == null OR montoCredito == null)
- ESTADO 6 → 8: existeHipoteca == true AND cancelacionConfirmada != true

FINAL BLOCK (ESTADO 8):
Block JSON generation if ANY of the above conditions are true OR if:
- Any required field for current state is null
- Any confirmation required is not explicitly confirmed
```

### PROMPT 3 - Cambios Específicos:

**AGREGAR al inicio:**
```
DOCUMENTOS PROCESADOS DISPONIBLES:
[Lista de documentos con información extraída]

INSTRUCCIÓN: You may use data from processed documents without asking again, but you MUST confirm with user if the data is correct before including it in <DATA_UPDATE>.
```

**REFINAR "Data already captured":**
```
Data already captured (SOURCE: [documento procesado | user confirmation | user manual entry]):
- folioReal: "123456" (SOURCE: documento procesado - escritura.pdf)
- partidas: ["A-12", "A-13"] (SOURCE: documento procesado - escritura.pdf)

Data captured but NOT confirmed:
- [ninguno en este ejemplo]

Missing / Unconfirmed (REQUIRED for current state):
- all_registry_pages_confirmed (REQUIRED: user must explicitly confirm "yes, these are all pages")
- inmueble.direccion (REQUIRED: can come from documento or user confirmation)
- inmueble.superficie (REQUIRED: can come from documento or user confirmation)
- inmueble.valor (REQUIRED: can come from documento or user confirmation)
```

**AGREGAR al final:**
```
BLOCKING CONDITIONS ACTIVE:
- all_registry_pages_confirmed != true → BLOCKED: Cannot advance to ESTADO 3
- inmueble.direccion == null → BLOCKED: Cannot advance to ESTADO 3
- inmueble.superficie == null → BLOCKED: Cannot advance to ESTADO 3
- inmueble.valor == null → BLOCKED: Cannot advance to ESTADO 3

INSTRUCTION:
- Ask ONLY for missing/unconfirmed fields listed above.
- Use data from processed documents but confirm with user first.
- Do NOT advance state until ALL blocking conditions are resolved.
- Ask ONE question at a time, wait for response before next question.
```

### PROMPT 4 - Cambios Específicos:

**AGREGAR al inicio:**
```
<DATA_UPDATE> SCHEMA VALIDATION:
Valid top-level fields (schema v1.2):
- tipoOperacion (string | null)
- comprador (object | null)
- vendedor (object | null)
- inmueble (object | null)

Valid nested fields:
- comprador: { nombre, rfc, curp, necesitaCredito, institucionCredito, montoCredito, tipoPersona, denominacion_social }
- vendedor: { nombre, rfc, curp, tieneCredito, institucionCredito, numeroCredito, tipoPersona, denominacion_social, estado_civil }
- inmueble: { direccion, folioReal, seccion, partida, superficie, valor, unidad, modulo, condominio, lote, manzana, fraccionamiento, colonia }

DO NOT include fields not in this list.
```

**AGREGAR después de "DO NOT":**
```
NULL HANDLING RULES:
- If a field is mentioned by user but value is null: Include field with null value.
- If a field is not mentioned: Omit the field entirely (do not include with null).
- If updating nested object: Include only fields that changed, include null for unchanged fields that were mentioned.

NESTED OBJECT RULES:
- If updating comprador: Include comprador object with only changed fields.
- Do NOT include empty objects: { "comprador": {} } is INVALID.
- Do NOT include unchanged nested objects if no fields changed.

BLOCKED STATE RULES:
- If agent is in blocked state (any blocking condition from PROMPT 2 is true):
  - Do NOT include <DATA_UPDATE>.
  - Output ONLY blocking message: "Cannot proceed. Missing required data: [list of missing items]."
  - Do not mix narrative with structured output when blocked.
```

**AGREGAR ejemplos adicionales:**
```
VALID EXAMPLES:

Example 1 - New capture:
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",
    "rfc": null
  }
}
</DATA_UPDATE>

Example 2 - Correction:
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez García",
    "rfc": null
  }
}
</DATA_UPDATE>
(Previous value "Juan Pérez" is replaced, not set to null)

Example 3 - Multiple fields:
<DATA_UPDATE>
{
  "inmueble": {
    "direccion": "Calle Principal 123",
    "superficie": "150 m²",
    "valor": null
  }
}
</DATA_UPDATE>

INVALID EXAMPLES:

Example 1 - Empty object:
<DATA_UPDATE>
{
  "comprador": { "nombre": "Juan Pérez" },
  "vendedor": {}
}
</DATA_UPDATE>
(Empty vendedor object is invalid)

Example 2 - Inferred value:
<DATA_UPDATE>
{
  "comprador": {
    "nombre": "Juan Pérez",
    "rfc": "PEPJ800101XXX"  // INVALID if not explicitly provided
  }
}
</DATA_UPDATE>

Example 3 - Blocked state with DATA_UPDATE:
<DATA_UPDATE>
{
  "inmueble": {
    "direccion": "Calle Principal 123"
  }
}
</DATA_UPDATE>
Cannot proceed. Missing: superficie, valor.
(INVALID: Should not include <DATA_UPDATE> when blocked)
```

---

## E) Questions That Block Production

1. **¿Cuál es la fuente de verdad para el modelo de estados?**
   - PROMPT 2 define ESTADO 0-8.
   - El código genera ESTADO 1-6.
   - PROMPT 3 muestra ESTADO 2.
   - **Pregunta**: ¿Cuántos estados hay realmente? ¿Cuál es el modelo correcto?
   - **Impacto**: Desincronización puede causar que el agente esté en un estado inválido.

2. **¿Cómo se determina "existeHipoteca"?**
   - PROMPT 2 dice "Required if existeHipoteca == true" pero no define cómo determinar esto.
   - **Pregunta**: ¿Viene de documento procesado? ¿Confirmación del usuario? ¿Ambos?
   - **Impacto**: El agente puede inferir incorrectamente o no detectar hipoteca.

3. **¿Es CSF obligatorio para persona moral?**
   - PROMPT 2 menciona "denominacion_social must be explicitly confirmed" pero no define si CSF es obligatorio.
   - **Pregunta**: ¿Se puede avanzar sin CSF si denominacion_social está confirmada?
   - **Impacto**: Puede bloquear incorrectamente o avanzar sin validación suficiente.

4. **¿Qué hacer cuando vendedor.nombre != titular_registral?**
   - PROMPT 2 no define explícitamente qué hacer en este caso.
   - **Pregunta**: ¿Es bloqueante? ¿Solo advertencia? ¿Requiere confirmación?
   - **Impacto**: Puede avanzar con datos incorrectos o bloquear incorrectamente.

5. **¿Cómo manejar múltiples folios reales en un documento?**
   - PROMPT 2 no define explícitamente este caso.
   - **Pregunta**: ¿Es bloqueante hasta confirmación? ¿Se puede elegir automáticamente?
   - **Impacto**: Puede seleccionar folio incorrecto o bloquear innecesariamente.

6. **¿Qué constituye "all_registry_pages_confirmed"?**
   - PROMPT 2 requiere `all_registry_pages_confirmed == true` pero no define qué constituye confirmación.
   - **Pregunta**: ¿Es confirmación explícita del usuario? ¿Automática si hay documento?
   - **Impacto**: Puede inferir confirmación o requerir confirmación innecesaria.

7. **¿Debe PROMPT 3 incluir información de documentos procesados?**
   - PROMPT 3 actual no menciona documentos procesados.
   - **Pregunta**: ¿El agente debe saber qué documentos están disponibles y qué información contienen?
   - **Impacto**: Puede pedir información que ya está en documentos o no usar datos disponibles.

8. **¿Qué hacer cuando el usuario dice "no sé" o "no tengo"?**
   - Ningún prompt define este caso.
   - **Pregunta**: ¿Es bloqueante? ¿Se puede avanzar con null? ¿Se debe preguntar si pueden proporcionarlo después?
   - **Impacto**: Puede bloquear incorrectamente o avanzar con datos faltantes.

9. **¿Cómo validar que el JSON en <DATA_UPDATE> cumple con schema v1.2?**
   - PROMPT 4 menciona "canonical schema v1.2" pero no define los campos válidos.
   - **Pregunta**: ¿Hay validación programática? ¿Solo confiar en el prompt?
   - **Impacto**: Puede generar JSON inválido que rompa el sistema.

10. **¿Qué hacer cuando hay datos conflictivos (ej: nombre en documento vs nombre confirmado por usuario)?**
    - Ningún prompt define este caso.
    - **Pregunta**: ¿Cuál tiene prioridad? ¿Se debe pedir confirmación?
    - **Impacto**: Puede usar datos incorrectos o crear confusión.

---

## RESUMEN EJECUTIVO

**RIESGOS CRÍTICOS IDENTIFICADOS:**
1. Violaciones de responsabilidad entre prompts (lógica de state machine en PROMPT 1, identidad en PROMPT 2).
2. Ambigüedades que permiten inferencia (definición de "confirmed", "existeHipoteca", etc.).
3. Desincronización de modelo de estados (PROMPT 2: 0-8, código: 1-6).
4. Falta de guardrails explícitos para casos edge (múltiples folios, persona moral, conflictos de datos).
5. Falta de validación explícita de schema en PROMPT 4.

**ACCIONES REQUERIDAS ANTES DE PRODUCCIÓN:**
1. Resolver conflictos de responsabilidad (mover lógica a prompts correctos).
2. Definir explícitamente todas las ambigüedades identificadas.
3. Sincronizar modelo de estados entre PROMPT 2 y código.
4. Agregar guardrails faltantes en cada prompt.
5. Responder las 10 preguntas bloqueantes.

**ESTIMACIÓN DE RIESGO ACTUAL:**
- **Alto**: Sistema puede generar documentos inválidos o avanzar con datos faltantes.
- **Medio**: Sistema puede inferir datos o usar datos incorrectos.
- **Bajo**: Sistema puede tener comportamiento inconsistente entre sesiones.

