# Refactorización: Separación de Responsabilidades en Prompts

## RESUMEN

Se ha refactorizado el sistema de prompts para respetar la separación de responsabilidades definida en el análisis de auditoría.

## CAMBIOS REALIZADOS

### 1. Migración 008: Separación de Prompts en la DB

**Archivo:** `supabase/migrations/008_separate_prompts_by_responsibility.sql`

El prompt en la base de datos ahora está estructurado con secciones claramente marcadas:

```
=== PROMPT 1: SYSTEM CORE ===
IDENTITY & COGNITION
[Contenido de identidad y principios cognitivos]

=== PROMPT 2: BUSINESS RULES ===
DOMAIN & LEGAL CONSTRAINTS
[Contenido de reglas de negocio y dominio legal]

=== PROMPT 4: TECHNICAL OUTPUT ===
OUTPUT RULES
[Contenido de reglas técnicas de output]
```

**Ventajas:**
- Separación conceptual clara
- Fácil de mantener y actualizar
- Cada sección tiene un propósito único

### 2. Modificación del Código: Extracción y Envío Separado

**Archivo:** `app/api/ai/preaviso-chat/route.ts`

**Cambios principales:**

1. **Nueva función `separatePromptsByResponsibility()`:**
   - Extrae las 3 secciones del prompt de la DB
   - Maneja fallbacks si los marcadores no están presentes
   - Retorna un objeto con los 3 prompts separados

2. **Función `buildSystemPrompts()` (renombrada de `buildSystemPrompt`):**
   - Obtiene el prompt de la DB
   - Separa las secciones usando `separatePromptsByResponsibility()`
   - Genera PROMPT 3 dinámicamente (Task/State)
   - Retorna los 4 prompts separados

3. **Modificación del endpoint POST:**
   - Envía 4 system messages separados a OpenAI:
     - System message 1: PROMPT 1 (System Core)
     - System message 2: PROMPT 2 (Business Rules)
     - System message 3: PROMPT 3 (Task/State - dinámico)
     - System message 4: PROMPT 4 (Technical Output)

## ESTRUCTURA FINAL

### PROMPT 1: SYSTEM CORE
**Responsabilidad:** Identity & Cognition

**Contiene:**
- Identidad del agente (quién es, quién NO es)
- Principios cognitivos (anti-inferencia, anti-asunción)
- Restricciones de comportamiento
- Fuentes válidas de datos
- Reglas de comunicación

**NO contiene:**
- Reglas de negocio específicas
- Estados del flujo
- Formato de output

### PROMPT 2: BUSINESS RULES
**Responsabilidad:** Domain & Legal Constraints

**Contiene:**
- Definiciones estrictas (terminology definitions)
- Modelo de estados (ESTADO 1-6)
- Reglas de bloqueo
- Reglas de validación (persona moral, titular registral, múltiples folios)
- Reglas de manejo de "no sé"
- Reglas de aclaración de conflictos
- Estructura del documento

**NO contiene:**
- Identidad del agente
- Principios cognitivos generales
- Formato técnico de output
- Estado actual dinámico

### PROMPT 3: TASK/STATE
**Responsabilidad:** Dynamic Context

**Contiene:**
- Estado actual (generado dinámicamente)
- Datos ya capturados (con fuente y estado de confirmación)
- Datos faltantes/por confirmar
- Documentos procesados disponibles
- Condiciones de bloqueo activas

**NO contiene:**
- Reglas globales de negocio
- Identidad del agente
- Formato de output

**Generación:** Dinámica en el código, no en la DB

### PROMPT 4: TECHNICAL OUTPUT
**Responsabilidad:** Output Rules

**Contiene:**
- Contrato estricto de <DATA_UPDATE>
- Schema JSON v1.2 completo
- Reglas de validación de output
- Ejemplos válidos e inválidos
- Modo de falla

**NO contiene:**
- Reglas de negocio
- Identidad del agente
- Estado actual

## BENEFICIOS

1. **Separación clara de responsabilidades:**
   - Cada prompt tiene un propósito único y bien definido
   - No hay mezcla de capas

2. **Mantenibilidad:**
   - Fácil actualizar una sección sin afectar las otras
   - Cambios en reglas de negocio no afectan identidad
   - Cambios en formato de output no afectan reglas de negocio

3. **Claridad para el LLM:**
   - OpenAI recibe prompts separados físicamente
   - Cada system message tiene un "rol" claro
   - Menos confusión sobre qué reglas aplicar

4. **Debugging:**
   - Fácil identificar qué prompt causó un comportamiento
   - Puede deshabilitar temporalmente un prompt para testing

## COMPATIBILIDAD HACIA ATRÁS

El código incluye fallbacks:
- Si los marcadores de separación no están presentes, usa el prompt completo como PROMPT 2
- Si no hay prompt en la DB, usa prompts por defecto mínimos

Esto asegura que el sistema siga funcionando incluso si la migración 008 no se ha aplicado aún.

## PRÓXIMOS PASOS

1. **Aplicar la migración 008:**
   ```bash
   supabase migration up
   ```

2. **Validar el comportamiento:**
   - Probar que los prompts se separan correctamente
   - Verificar que OpenAI recibe 4 system messages
   - Validar que el comportamiento del agente es correcto

3. **Monitorear:**
   - Verificar logs para confirmar que los prompts se están separando
   - Validar que no hay errores en la extracción

## ARCHIVOS MODIFICADOS

1. `supabase/migrations/008_separate_prompts_by_responsibility.sql` - Nueva migración
2. `app/api/ai/preaviso-chat/route.ts` - Código refactorizado

## NOTAS

- La migración 007 sigue existiendo pero será reemplazada por la 008
- El código es compatible hacia atrás (funciona con prompts sin separación)
- Los prompts se envían como system messages separados, no concatenados

