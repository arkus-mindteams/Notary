# Análisis de Conflictos: Migración a Canonical JSON v1.4

## RESUMEN EJECUTIVO

El nuevo Canonical JSON v1.4 introduce cambios estructurales significativos:
- `comprador` (singular) → `compradores[]` (array)
- `vendedor` (singular) → `vendedores[]` (array)
- `creditos[]` (nuevo array con estructura compleja)
- `gravamenes[]` (nuevo array)

El código actual está diseñado para estructura singular y **NO es compatible** con v1.4 sin modificaciones.

---

## CONFLICTOS IDENTIFICADOS

### 🔴 CRÍTICO: Estructura de Datos

#### 1. Interface `PreavisoData` (components/preaviso-chat.tsx:42)
```typescript
export interface PreavisoData {
  comprador: { ... }  // ❌ SINGULAR
  vendedor: { ... }   // ❌ SINGULAR
}
```

**Problema**: v1.4 requiere arrays:
```typescript
compradores: []  // ✅ ARRAY
vendedores: []   // ✅ ARRAY
```

**Impacto**: 
- Todas las referencias a `data.comprador` y `data.vendedor` fallarán
- El generador de documentos espera estructura singular
- Los componentes de UI esperan estructura singular

---

#### 2. Función `extractDataFromMessage` (route.ts:787)
```typescript
if (parsed.comprador) {  // ❌ Espera singular
  result.comprador = { ... }
}
if (parsed.vendedor) {   // ❌ Espera singular
  result.vendedor = { ... }
}
```

**Problema**: v1.4 emite arrays:
```json
{
  "compradores": [{ ... }],  // ✅ ARRAY
  "vendedores": [{ ... }]    // ✅ ARRAY
}
```

**Impacto**: 
- Los datos de v1.4 no se extraerán correctamente
- Se perderá información de múltiples compradores/vendedores

---

#### 3. Función `extractDataFromMessage` (preaviso-chat.tsx:1003)
```typescript
if (jsonData.comprador) {  // ❌ Espera singular
  const compradorUpdates: Partial<PreavisoData['comprador']> = {}
  // ...
}
```

**Problema**: Mismo conflicto que #2

**Impacto**: 
- El componente de chat no procesará correctamente los arrays
- Los datos no se actualizarán en el estado

---

#### 4. Lógica de Estados (route.ts:340, 395-398)
```typescript
const necesitaCredito = context?.comprador?.necesitaCredito  // ❌ Singular
if (necesitaCredito === true) {
  const institucionCredito = context?.comprador?.institucionCredito  // ❌ Singular
  const montoCredito = context?.comprador?.montoCredito  // ❌ Singular
}
```

**Problema**: En v1.4, los créditos están en un array separado:
```json
{
  "compradores": [{ ... }],
  "creditos": [
    {
      "institucion": "...",
      "monto": "...",
      "participantes": [...]
    }
  ]
}
```

**Impacto**: 
- La lógica de estados no detectará créditos correctamente
- No se podrá determinar si ESTADO_5 está completo

---

#### 5. Referencias en `buildSystemPrompts` (route.ts:452-473)
```typescript
if (compradorNombre || compradorTipoPersona || necesitaCredito !== undefined) {
  capturedData.comprador = {  // ❌ Singular
    nombre: compradorNombre || null,
    necesitaCredito: necesitaCredito !== undefined ? necesitaCredito : null,
    institucionCredito: context?.comprador?.institucionCredito || null,  // ❌ Singular
    montoCredito: context?.comprador?.montoCredito || null  // ❌ Singular
  }
}
```

**Problema**: Debe construir arrays y extraer créditos del array `creditos[]`

**Impacto**: 
- PROMPT 3 mostrará datos incorrectos
- El snapshot de datos capturados no reflejará la realidad

---

#### 6. Referencias en UI (preaviso-chat.tsx: múltiples líneas)
```typescript
context?.comprador?.necesitaCredito  // ❌ Singular (1073+ líneas)
context?.vendedor?.nombre            // ❌ Singular (996+ líneas)
```

**Problema**: Hay más de 100 referencias a estructura singular

**Impacto**: 
- La UI no mostrará datos correctamente
- Los checks de completitud fallarán

---

#### 7. Generador de Documentos (PreavisoGenerator)
**Problema**: `PreavisoGenerator.generatePreavisoDocument(data: PreavisoData)` espera estructura singular

**Impacto**: 
- No podrá generar documentos con múltiples compradores
- No podrá manejar múltiples créditos
- No podrá manejar coacreditados

---

#### 8. Exportación (preaviso-export-options.tsx:31)
```typescript
const simplifiedData: PreavisoSimplifiedJSON = PreavisoTemplateRenderer.convertFromPreavisoData(data)
```

**Problema**: `PreavisoSimplifiedJSON` también usa estructura singular (lib/types/preaviso-simplified.ts)

**Impacto**: 
- La exportación fallará con datos v1.4

---

## SOLUCIONES PROPUESTAS

Tienes 3 opciones para resolver los conflictos:

---

### OPCIÓN A: Capa de Adaptación (Rápida, Temporal)

**¿Qué es?**
Crear funciones que conviertan entre v1.4 (arrays) y el formato actual (singular):
- Cuando la IA genera v1.4 → convertir a formato singular para que el código funcione
- Cuando el código genera datos → convertir a v1.4 para guardar

**¿Qué implica?**
- Crear archivo `lib/adapters/v14-adapter.ts` con funciones de conversión
- Modificar `extractDataFromMessage` para usar el adaptador
- El resto del código NO cambia

**Ventajas**:
- ✅ Implementación rápida (1-2 horas)
- ✅ Código existente sigue funcionando
- ✅ Permite usar v1.4 inmediatamente

**Desventajas**:
- ❌ Solo soporta 1 comprador/vendedor (toma el primero del array)
- ❌ No soporta múltiples créditos completamente
- ❌ Pérdida de información si hay múltiples compradores

**Cuándo usar**: Si necesitas activar v1.4 YA y solo manejas casos simples (1 comprador, 1 crédito)

---

### OPCIÓN B: Refactorización Completa (Lenta, Definitiva)

**¿Qué es?**
Cambiar TODO el código para usar arrays directamente:
- Actualizar `PreavisoData` interface para usar arrays
- Actualizar todas las funciones (100+ cambios)
- Actualizar generador de documentos
- Actualizar UI

**¿Qué implica?**
- Cambiar `comprador` → `compradores[]` en TODO el código
- Cambiar `vendedor` → `vendedores[]` en TODO el código
- Actualizar lógica de créditos para usar `creditos[]`
- Testing exhaustivo

**Ventajas**:
- ✅ Soporte completo para v1.4
- ✅ Múltiples compradores/vendedores
- ✅ Múltiples créditos
- ✅ Coacreditados
- ✅ Sin pérdida de información

**Desventajas**:
- ❌ Mucho trabajo (1-2 días)
- ❌ Alto riesgo de bugs
- ❌ Requiere testing exhaustivo
- ❌ Puede romper funcionalidad existente

**Cuándo usar**: Si necesitas soporte completo para múltiples compradores/créditos y tienes tiempo para testing

---

### OPCIÓN C: Híbrida (Recomendada - Por Fases)

**¿Qué es?**
Hacerlo en 3 fases:

**Fase 1 (Ahora)**: Implementar Opción A
- Activar v1.4 rápidamente con adaptador
- Sistema funciona con casos simples

**Fase 2 (Después)**: Refactorizar gradualmente (Opción B)
- Ir actualizando código poco a poco
- Probar cada cambio
- Sin presión de tiempo

**Fase 3 (Final)**: Eliminar adaptador
- Cuando todo esté refactorizado
- Usar v1.4 directamente

**Ventajas**:
- ✅ Activas v1.4 rápido (Fase 1)
- ✅ Migración gradual sin presión (Fase 2)
- ✅ Resultado final completo (Fase 3)
- ✅ Menor riesgo (cambios pequeños)

**Desventajas**:
- ⚠️ Requiere mantener adaptador temporalmente
- ⚠️ Dos transformaciones (adaptador + refactor)

**Cuándo usar**: Si quieres lo mejor de ambos mundos (rápido ahora, completo después)

---

## PLAN DE ACCIÓN INMEDIATO

### Paso 1: Crear funciones de adaptación
- [ ] Crear `lib/adapters/v14-adapter.ts`
- [ ] Implementar `v1.4ToPreavisoData()`
- [ ] Implementar `PreavisoDataToV14()`
- [ ] Manejar arrays (tomar primer elemento o mergear)

### Paso 2: Actualizar extractDataFromMessage
- [ ] Actualizar `extractDataFromMessage` en `route.ts` para aceptar arrays
- [ ] Convertir arrays a estructura singular usando adaptador
- [ ] Actualizar `extractDataFromMessage` en `preaviso-chat.tsx`

### Paso 3: Actualizar lógica de estados
- [ ] Modificar `buildSystemPrompts` para leer de arrays
- [ ] Actualizar checks de completitud para arrays
- [ ] Actualizar lógica de créditos para leer de `creditos[]`

### Paso 4: Testing
- [ ] Probar con un comprador
- [ ] Probar con múltiples compradores
- [ ] Probar con múltiples créditos
- [ ] Probar con coacreditados

---

## ARCHIVOS QUE REQUIEREN MODIFICACIÓN

### Alta Prioridad (Crítico)
1. `app/api/ai/preaviso-chat/route.ts` - extractDataFromMessage, buildSystemPrompts
2. `components/preaviso-chat.tsx` - extractDataFromMessage, PreavisoData interface
3. `lib/preaviso-generator.ts` - Generación de documentos
4. `lib/types/preaviso-simplified.ts` - Interface simplificada

### Media Prioridad
5. `components/preaviso-export-options.tsx` - Exportación
6. `app/dashboard/preaviso/page.tsx` - Manejo de datos
7. `lib/preaviso-template-renderer.ts` - Renderizado

### Baja Prioridad (Documentación)
8. `docs/*.md` - Actualizar documentación

---

## NOTAS IMPORTANTES

⚠️ **NO ejecutar migraciones SQL hasta resolver estos conflictos**

⚠️ **Los prompts están listos, pero el código NO puede procesar v1.4 aún**

⚠️ **Recomendación**: Implementar Opción C (Híbrida) para transición suave

---

## ESTADO ACTUAL

- ✅ Prompts actualizados (PROMPT 1, 2, 3, 4)
- ✅ Schema v1.4 definido
- ✅ Migraciones SQL creadas
- ❌ Código NO compatible con v1.4
- ❌ Funciones de extracción NO compatibles
- ❌ Generador de documentos NO compatible
- ❌ UI NO compatible

**CONCLUSIÓN**: Se requiere trabajo de adaptación antes de activar v1.4 en producción.

