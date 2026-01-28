# Análisis del Flujo: Comprador y Cónyuge

## Problemas Identificados

### 1. **Múltiples Fuentes de Verdad para el Nombre del Cónyuge**
El nombre del cónyuge puede estar en:
- `compradores[0].persona_fisica.conyuge.nombre` (schema v1.4)
- `compradores[1].persona_fisica.nombre` (si se creó como segundo comprador)
- `documentosProcesados[]` (si se procesó un documento pero aún no se guardó)
- `creditos[0].participantes[].nombre` (si se mencionó en el crédito)

**Problema**: El sistema busca en múltiples lugares y puede no encontrar el nombre cuando se necesita.

### 2. **Captura Determinista vs LLM Output**
Hay dos flujos paralelos:
- **Captura determinista** (`applyDeterministicUserInputUpdate`): Parseo regex del input del usuario
- **LLM Output** (`extractDataFromMessage`): Extracción de `<DATA_UPDATE>` del mensaje del asistente

**Problema**: Pueden entrar en conflicto o duplicar lógica. Si el determinista captura algo, el LLM también puede intentar capturarlo.

### 3. **Procesamiento de Documentos vs Chat**
- Los documentos se procesan en `preaviso-process-document` y actualizan el contexto
- El chat procesa mensajes de texto y también actualiza el contexto
- **Problema**: Puede haber desincronización entre lo que se procesa en documentos y lo que se captura en chat.

### 4. **Filtros Anti-Basura Insuficientes**
El sistema intenta filtrar palabras inválidas como nombres, pero:
- Los filtros están dispersos en múltiples lugares
- No hay una validación centralizada
- Palabras como "coacreditada" pueden pasar los filtros en ciertos contextos

### 5. **Estado del Cónyuge**
El cónyuge puede existir en múltiples formas:
- Solo en `compradores[0].persona_fisica.conyuge.nombre` (no es comprador separado)
- Como `compradores[1]` (comprador separado)
- Como participante en `creditos[].participantes[]`

**Problema**: No hay una fuente única de verdad. El sistema tiene que buscar en múltiples lugares.

## Flujo Actual (Simplificado)

```
1. Usuario sube pasaporte del comprador
   → preaviso-process-document
   → Guarda en compradores[0].persona_fisica.nombre
   → Frontend actualiza workingData

2. Usuario responde "casado"
   → applyDeterministicUserInputUpdate detecta estado civil
   → Actualiza compradores[0].persona_fisica.estado_civil = 'casado'

3. Sistema pregunta si cónyuge participa
   → Usuario responde "sí"
   → applyDeterministicUserInputUpdate detecta y marca conyuge.participa = true

4. Usuario sube pasaporte del cónyuge
   → preaviso-process-document detecta que es cónyuge (nombre diferente al comprador)
   → Guarda en compradores[0].persona_fisica.conyuge.nombre
   → Frontend actualiza workingData

5. Usuario dice "el comprador como acreditado y su conyugue como coacreditado"
   → applyDeterministicUserInputUpdate parsea la frase
   → Busca conyugeNombre en compradores[0].persona_fisica.conyuge.nombre
   → Si no lo encuentra, busca en documentosProcesados
   → Crea participantes del crédito

6. LLM también puede emitir <DATA_UPDATE> con la misma información
   → extractDataFromMessage extrae el JSON
   → Puede duplicar o sobrescribir lo que ya capturó el determinista
```

## Problemas Fundamentales

### A. **Falta de Separación Clara de Responsabilidades**
- El código determinista intenta hacer demasiado (parseo, validación, creación de estructuras)
- El LLM también intenta hacer lo mismo
- No hay una clara separación de quién hace qué

### B. **Búsqueda del Nombre del Cónyuge es Frágil**
- Se busca en múltiples lugares
- Si el documento se procesa pero el contexto no se actualiza a tiempo, no se encuentra
- No hay un mecanismo de "esperar" a que el documento se procese antes de buscar el nombre

### C. **Validación de Nombres Dispersa**
- Filtros en `looksLikeFreeName`
- Filtros en `applyDeterministicUserInputUpdate`
- Filtros en el parser de participantes
- No hay una función centralizada de validación

### D. **Merge de Contexto Complejo**
- `preDeterministicUpdate` (antes del LLM)
- `updatedData` (del LLM)
- `deterministicUpdate` (después del LLM)
- `mergedUpdate` (merge final)
- Múltiples merges pueden causar pérdida de datos o sobrescritura incorrecta

## Opciones de Solución

### Opción 1: **Refactor a un Sistema de Eventos/Comandos**
- Cada acción del usuario genera un "comando" claro
- Cada comando tiene un "handler" específico
- Los handlers son deterministas y no dependen del LLM
- El LLM solo se usa para generar preguntas, no para capturar datos

**Ventajas**:
- Separación clara de responsabilidades
- Más fácil de debuggear
- Más predecible

**Desventajas**:
- Requiere refactor grande
- Puede perder flexibilidad del LLM

### Opción 2: **Fuente Única de Verdad para el Cónyuge**
- Crear una función `getConyugeNombre(context)` que busca en todos los lugares
- Usar esta función en todos los lugares donde se necesite el nombre
- Asegurar que cuando se procesa un documento del cónyuge, se guarde inmediatamente en el lugar correcto

**Ventajas**:
- Cambio más pequeño
- Soluciona el problema de búsqueda

**Desventajas**:
- No soluciona los otros problemas
- Sigue siendo frágil

### Opción 3: **Simplificar la Captura Determinista**
- Reducir la lógica determinista a casos muy específicos
- Dejar que el LLM haga más del trabajo
- Mejorar los prompts para que el LLM sea más confiable

**Ventajas**:
- Menos código complejo
- Más flexible

**Desventajas**:
- El LLM puede ser impredecible
- Puede requerir más ajustes de prompts

### Opción 4: **Sistema Híbrido Mejorado**
- Mantener captura determinista para casos claros (estado civil, confirmaciones simples)
- Usar LLM para casos complejos (parseo de frases naturales)
- Crear una capa de "normalización" que unifica los datos antes de guardarlos
- Validación centralizada de nombres

**Ventajas**:
- Balance entre determinismo y flexibilidad
- Puede implementarse incrementalmente

**Desventajas**:
- Sigue siendo complejo
- Requiere buena coordinación entre las capas

## Recomendación

**Opción 4 (Sistema Híbrido Mejorado)** con mejoras específicas:

1. **Crear función centralizada para obtener nombre del cónyuge**:
   ```typescript
   function getConyugeNombre(context: any): string | null {
     // Buscar en orden de prioridad:
     // 1. compradores[0].persona_fisica.conyuge.nombre
     // 2. compradores[1+] si nombre coincide
     // 3. documentosProcesados recientes (últimos 5 minutos)
     // 4. creditos[].participantes[] donde rol='coacreditado' y esConyuge=true
   }
   ```

2. **Validación centralizada de nombres**:
   ```typescript
   function isValidName(name: string, context?: any): boolean {
     // Validar longitud, caracteres, palabras inválidas, etc.
   }
   ```

3. **Simplificar merge de contexto**:
   - Reducir a máximo 2 merges: pre-LLM y post-LLM
   - Asegurar que el merge sea idempotente

4. **Mejorar detección de documentos del cónyuge**:
   - Cuando se procesa un documento, verificar inmediatamente si es del cónyuge
   - Guardar en el lugar correcto de inmediato
   - Notificar al frontend para que actualice el contexto

5. **Parser de participantes más robusto**:
   - Si menciona "su conyugue" y no encuentra el nombre, NO crear el participante
   - Dejar que el sistema pida el nombre explícitamente
   - Solo crear participantes cuando TODOS los datos estén disponibles
