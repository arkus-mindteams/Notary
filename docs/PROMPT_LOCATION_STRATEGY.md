# Estrategia de Ubicación de Prompts

## ANÁLISIS ACTUAL

### Estado Actual (después de migración 008):
- **PROMPT 1 (System Core)**: En DB ✅
- **PROMPT 2 (Business Rules)**: En DB ✅
- **PROMPT 3 (Task/State)**: En código (dinámico) ✅
- **PROMPT 4 (Technical Output)**: En DB ✅

### Problema Identificado:
1. **PROMPT 1 y PROMPT 4 son técnicos** → No deberían cambiar frecuentemente
2. **PROMPT 2 es de negocio** → Debe cambiar con frecuencia
3. **Duplicación potencial**: Si cambiamos PROMPT 4 en código, puede conflictuar con DB

## PROPUESTA: Separación por Naturaleza

### PROMPT 1: SYSTEM CORE → **EN CÓDIGO**
**Razón:**
- Es técnico (identidad, cognición)
- No cambia frecuentemente
- Es parte de la arquitectura del sistema
- No requiere actualización por usuarios de negocio

**Ubicación:** `app/api/ai/preaviso-chat/route.ts` (constante)

### PROMPT 2: BUSINESS RULES → **EN DB** ✅
**Razón:**
- Es de negocio (reglas notariales, estados, validaciones)
- Cambia frecuentemente (nuevas reglas, ajustes legales)
- Debe ser editable por usuarios de negocio
- Requiere versionado y auditoría

**Ubicación:** `preaviso_config.prompt` (solo PROMPT 2)

### PROMPT 3: TASK/STATE → **EN CÓDIGO** ✅
**Razón:**
- Es dinámico (contexto de sesión)
- Se genera en tiempo de ejecución
- Depende de datos de la sesión actual
- No puede estar en DB (es contexto)

**Ubicación:** `app/api/ai/preaviso-chat/route.ts` (función dinámica)

### PROMPT 4: TECHNICAL OUTPUT → **EN CÓDIGO**
**Razón:**
- Es técnico (formato JSON, schema, validación)
- No cambia frecuentemente
- Es parte de la implementación técnica
- Cambios requieren cambios en código de parsing

**Ubicación:** `app/api/ai/preaviso-chat/route.ts` (constante)

## VENTAJAS DE ESTA ESTRATEGIA

1. **Separación clara:**
   - Técnico → Código (versionado con git)
   - Negocio → DB (versionado con migraciones)

2. **Mantenibilidad:**
   - Cambios técnicos → Pull request, code review
   - Cambios de negocio → Migración SQL, sin tocar código

3. **Sin conflictos:**
   - PROMPT 1 y 4 siempre en código (una sola fuente de verdad)
   - PROMPT 2 siempre en DB (una sola fuente de verdad)
   - PROMPT 3 siempre dinámico (no hay conflicto)

4. **Facilidad de actualización:**
   - Reglas de negocio → Actualizar DB sin deploy
   - Cambios técnicos → Deploy con código

## IMPLEMENTACIÓN

### Cambios Requeridos:

1. **Mover PROMPT 1 a código:**
   - Extraer de DB
   - Definir como constante en código

2. **Mover PROMPT 4 a código:**
   - Extraer de DB
   - Definir como constante en código

3. **Actualizar DB para tener solo PROMPT 2:**
   - Nueva migración que solo guarde PROMPT 2
   - Eliminar PROMPT 1 y PROMPT 4 de DB

4. **Actualizar código:**
   - Leer solo PROMPT 2 de DB
   - PROMPT 1 y PROMPT 4 como constantes en código
   - PROMPT 3 sigue siendo dinámico

## ESTRUCTURA FINAL

```
CÓDIGO:
├── PROMPT 1: System Core (constante)
├── PROMPT 3: Task/State (dinámico)
└── PROMPT 4: Technical Output (constante)

DB:
└── PROMPT 2: Business Rules (editable)
```

