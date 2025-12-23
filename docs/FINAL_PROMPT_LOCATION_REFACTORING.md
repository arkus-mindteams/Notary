# Refactorización Final: Ubicación de Prompts por Naturaleza

## PROBLEMA RESUELTO

El usuario identificó correctamente que tener todos los prompts en la DB podía crear conflictos y no era la mejor separación. La solución es separar por naturaleza:

- **Técnicos** → Código (versionado con git, no cambian frecuentemente)
- **Negocio** → DB (editable sin deploy, cambian frecuentemente)
- **Dinámicos** → Código (generados en tiempo de ejecución)

## ESTRUCTURA FINAL

### PROMPT 1: SYSTEM CORE → **EN CÓDIGO** ✅
**Ubicación:** `app/api/ai/preaviso-chat/route.ts` (constante `PROMPT_1_SYSTEM_CORE`)

**Razón:**
- Es técnico (identidad, cognición, comunicación)
- No cambia frecuentemente
- Es parte de la arquitectura del sistema
- No requiere actualización por usuarios de negocio

### PROMPT 2: BUSINESS RULES → **EN DB** ✅
**Ubicación:** `preaviso_config.prompt` (solo PROMPT 2)

**Razón:**
- Es de negocio (reglas notariales, estados, validaciones)
- Cambia frecuentemente (nuevas reglas, ajustes legales)
- Debe ser editable por usuarios de negocio
- Requiere versionado y auditoría

**Migración:** `009_keep_only_business_rules_in_db.sql`

### PROMPT 3: TASK/STATE → **EN CÓDIGO** ✅
**Ubicación:** `app/api/ai/preaviso-chat/route.ts` (función dinámica)

**Razón:**
- Es dinámico (contexto de sesión)
- Se genera en tiempo de ejecución
- Depende de datos de la sesión actual
- No puede estar en DB (es contexto)

### PROMPT 4: TECHNICAL OUTPUT → **EN CÓDIGO** ✅
**Ubicación:** `app/api/ai/preaviso-chat/route.ts` (constante `PROMPT_4_TECHNICAL_OUTPUT`)

**Razón:**
- Es técnico (formato JSON, schema, validación)
- No cambia frecuentemente
- Es parte de la implementación técnica
- Cambios requieren cambios en código de parsing

## CAMBIOS IMPLEMENTADOS

### 1. Migración 009: Solo PROMPT 2 en DB
- Elimina PROMPT 1 y PROMPT 4 de la DB
- Mantiene solo PROMPT 2 (Business Rules)
- Compatible hacia atrás (si no hay marcador, asume todo es PROMPT 2)

### 2. Código Refactorizado
- **Constantes agregadas:**
  - `PROMPT_1_SYSTEM_CORE`: Constante con identidad y cognición
  - `PROMPT_4_TECHNICAL_OUTPUT`: Constante con reglas de output

- **Función `extractBusinessRulesFromDB()`:**
  - Extrae solo PROMPT 2 de la DB
  - Maneja compatibilidad hacia atrás

- **Función `buildSystemPrompts()` actualizada:**
  - Lee solo PROMPT 2 de la DB
  - Usa constantes para PROMPT 1 y PROMPT 4
  - Genera PROMPT 3 dinámicamente

## VENTAJAS

1. **Sin conflictos:**
   - PROMPT 1 y 4 siempre en código (una sola fuente de verdad)
   - PROMPT 2 siempre en DB (una sola fuente de verdad)
   - PROMPT 3 siempre dinámico (no hay conflicto)

2. **Mantenibilidad:**
   - Cambios técnicos → Pull request, code review
   - Cambios de negocio → Migración SQL, sin tocar código

3. **Separación clara:**
   - Técnico → Código (versionado con git)
   - Negocio → DB (versionado con migraciones)

4. **Facilidad de actualización:**
   - Reglas de negocio → Actualizar DB sin deploy
   - Cambios técnicos → Deploy con código

## COMPATIBILIDAD HACIA ATRÁS

El código incluye fallbacks:
- Si no hay marcador en DB, asume que todo el prompt es PROMPT 2
- Si no hay prompt en DB, usa valores por defecto mínimos

Esto asegura que el sistema siga funcionando incluso si la migración 009 no se ha aplicado aún.

## PRÓXIMOS PASOS

1. **Aplicar la migración 009:**
   ```sql
   -- Ejecutar en Supabase Dashboard SQL Editor
   -- Contenido de: supabase/migrations/009_keep_only_business_rules_in_db.sql
   ```

2. **Validar el comportamiento:**
   - Probar que PROMPT 1 y 4 vienen del código
   - Probar que PROMPT 2 viene de la DB
   - Probar que PROMPT 3 se genera dinámicamente
   - Verificar que no hay conflictos

3. **Monitorear:**
   - Verificar logs para confirmar que los prompts se están usando correctamente
   - Validar que no hay errores en la extracción

## ARCHIVOS MODIFICADOS

1. `supabase/migrations/009_keep_only_business_rules_in_db.sql` - Nueva migración
2. `app/api/ai/preaviso-chat/route.ts` - Código refactorizado

## NOTAS

- La migración 008 sigue existiendo pero será reemplazada por la 009
- El código es compatible hacia atrás (funciona con prompts sin separación)
- Los prompts técnicos (1 y 4) ahora viven en código, no en DB
- Solo PROMPT 2 (negocio) vive en DB

