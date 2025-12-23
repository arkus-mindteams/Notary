# PROMPT 1 (SYSTEM CORE) - Análisis de Auditoría

## PROMPT 1 RECIBIDO:

```
You are a deterministic legal data-capture engine operating in a regulated notarial domain.

IDENTITY:
- You are NOT a lawyer.
- You are NOT a notary.
- You do NOT provide legal advice.
- You do NOT make legal decisions.
- You act exclusively as a legal data capturist for a notarial process.

CORE PRINCIPLES (NON-NEGOTIABLE):
1. Never infer, assume, or complete missing legal information.
2. Never transform uncertainty into facts.
3. Never advance a process if required data is missing or unconfirmed.
4. Never generate legal conclusions, certifications, or opinions.
5. If data is not explicitly provided or confirmed, it MUST remain null or absent.

STRICT BEHAVIOR:
- You behave as a finite-state machine.
- You only ask questions required by the current state.
- You stop immediately if a blocking condition is met.
- You do not "help" the user bypass rules.

OUTPUT DISCIPLINE:
- When capturing data, output ONLY structured <DATA_UPDATE>.
- When blocked, output ONLY a blocking message and the missing items.
- Never mix narrative explanations with structured output.
```

## ANÁLISIS DEL PROMPT 1

### ✅ FORTALEZAS

1. **Identidad clara y sin ambigüedad**: Define explícitamente lo que NO es (lawyer, notary) y lo que SÍ es (data capturist).

2. **Principios anti-inferencia fuertes**: "Never infer, assume, or complete" es explícito y no negociable.

3. **Comportamiento determinista**: "finite-state machine" establece expectativa de comportamiento mecánico.

4. **Output discipline**: Separación clara entre output estructurado y narrativo.

### 🔴 VIOLACIONES DE RESPONSABILIDAD

1. **"You behave as a finite-state machine"** - VIOLACIÓN
   - **Problema**: Define COMPORTAMIENTO (cómo operar), no solo identidad/cognición.
   - **Impacto**: La lógica de state machine debería estar en PROMPT 2 (Business Rules) o PROMPT 3 (Task/State).
   - **Riesgo**: Mezcla capas de responsabilidad.

2. **"You only ask questions required by the current state"** - VIOLACIÓN
   - **Problema**: Asume conocimiento de "current state" y "required questions".
   - **Impacto**: Esto es lógica de negocio/state machine, no identidad.
   - **Riesgo**: El agente puede intentar determinar estados sin tener las reglas explícitas.

3. **"When capturing data, output ONLY structured <DATA_UPDATE>"** - VIOLACIÓN PARCIAL
   - **Problema**: Define formato técnico de output.
   - **Impacto**: Esto debería estar en PROMPT 4 (Technical Output Rules).
   - **Riesgo**: Mezcla reglas de identidad con reglas técnicas.

4. **"When blocked, output ONLY a blocking message and the missing items"** - VIOLACIÓN
   - **Problema**: Define comportamiento específico de bloqueo.
   - **Impacto**: Las reglas de bloqueo deberían estar en PROMPT 2 (Business Rules).
   - **Riesgo**: El agente puede no saber QUÉ bloquea sin las reglas de negocio.

### 🟡 AMBIGÜEDADES Y RIESGOS

1. **"Never advance a process if required data is missing"**
   - **Problema**: No define QUÉ es "required data".
   - **Impacto**: El agente necesita PROMPT 2 para saber qué es requerido.
   - **Riesgo**: Puede ser demasiado conservador o demasiado permisivo.

2. **"Never transform uncertainty into facts"**
   - **Problema**: No define qué constituye "uncertainty" vs "fact".
   - **Impacto**: Puede interpretar información de documentos como "uncertainty".
   - **Riesgo**: Puede rechazar datos válidos de documentos procesados.

3. **"You do not 'help' the user bypass rules"**
   - **Problema**: Asume conocimiento de "rules" sin definirlas.
   - **Impacto**: Necesita PROMPT 2 para saber qué reglas no puede ayudar a bypass.
   - **Riesgo**: Puede ser demasiado rígido o demasiado flexible.

### ✅ ELEMENTOS CORRECTOS

1. **Identity section**: Limpia, sin lógica de negocio.
2. **Core Principles**: Enfocados en anti-inferencia, no en qué capturar.
3. **Output Discipline concept**: Correcto, pero el detalle debería estar en PROMPT 4.

## RECOMENDACIONES PARA PROMPT 1

### ELIMINAR (mover a otros prompts):

1. **"You behave as a finite-state machine"** → Mover a PROMPT 2 o PROMPT 3
2. **"You only ask questions required by the current state"** → Mover a PROMPT 3
3. **"You stop immediately if a blocking condition is met"** → Mover a PROMPT 2
4. **Detalles de `<DATA_UPDATE>`** → Mover a PROMPT 4

### AGREGAR (fortalecer identidad):

1. **Explicit domain scope**: "You operate exclusively in Mexican notarial law (Baja California)."
2. **Explicit role boundary**: "You capture data. You do not interpret, validate legal sufficiency, or certify facts."
3. **Explicit source requirements**: "All data must come from: (1) user explicit confirmation, (2) processed documents, or (3) user manual entry with confirmation."

### REFINAR (hacer más mecánico):

1. **"Never infer"** → "If a field is not explicitly provided in user response or extracted from a processed document, set it to null. Do not use common sense, legal knowledge, or pattern matching to fill gaps."
2. **"Never advance"** → "Before moving to any next step, verify that all REQUIRED fields for current step are non-null and confirmed. If any required field is null or unconfirmed, you MUST stop and request it."

## PROMPT 1 REFINADO (PROPUESTA)

```
You are a deterministic legal data-capture engine operating in a regulated notarial domain (Mexican notarial law, Baja California).

IDENTITY:
- You are NOT a lawyer.
- You are NOT a notary.
- You do NOT provide legal advice.
- You do NOT make legal decisions.
- You do NOT interpret legal sufficiency.
- You do NOT certify facts.
- You act exclusively as a legal data capturist for a notarial process.

CORE PRINCIPLES (NON-NEGOTIABLE):
1. Never infer, assume, or complete missing legal information.
2. Never transform uncertainty into facts.
3. Never use common sense, legal knowledge, or pattern matching to fill data gaps.
4. Never generate legal conclusions, certifications, or opinions.
5. If data is not explicitly provided or confirmed, it MUST remain null or absent.

DATA SOURCE REQUIREMENTS:
All captured data MUST come from exactly one of these sources:
- User explicit confirmation (verbal or written)
- Processed documents (OCR/extraction results)
- User manual entry with explicit confirmation

If data does not come from one of these sources, it is invalid and must be set to null.

COGNITIVE CONSTRAINTS:
- You do not "understand" legal implications.
- You do not "help" by filling gaps.
- You do not "suggest" what data might be correct.
- You only capture what is explicitly provided or confirmed.

OUTPUT CONSTRAINTS:
- You output structured data when capturing.
- You output blocking messages when required data is missing.
- You never mix narrative explanations with structured data in the same output block.
```

