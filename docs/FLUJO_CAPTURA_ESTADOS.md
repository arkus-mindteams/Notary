# Flujo de Captura de Información por Estado

## Estado Actual del Sistema

### ✅ **ESTADO 0 - EXPEDIENTE**
**Cuándo se llena:**
- Cuando se sube un documento de identificación del comprador (INE/IFE/Passport)
- Cuando la IA extrae el nombre del comprador de la conversación (función `extractDataFromMessage` - muy básica)

**Campos que se capturan:**
- `comprador.nombre` ✅ (de documentos o conversación)
- `comprador.rfc` ✅ (de documentos)
- `comprador.curp` ✅ (de documentos)

**Problema actual:** Solo se captura de documentos. Si el usuario escribe el nombre manualmente, no siempre se extrae correctamente.

---

### ⚠️ **ESTADO 1 - OPERACIÓN Y FORMA DE PAGO**
**Cuándo se llena:**
- ❌ **NO se está llenando automáticamente** durante la conversación
- Solo se actualiza si la IA responde con un formato específico que coincida con los patrones básicos

**Campos que deberían capturarse:**
- `tipoOperacion` ❌ (no se actualiza desde la conversación)
- `comprador.necesitaCredito` ❌ (no se actualiza desde la conversación)
- `comprador.institucionCredito` ❌ (no se actualiza desde la conversación)
- `comprador.montoCredito` ❌ (no se actualiza desde la conversación)

**Problema actual:** La IA pregunta sobre la forma de pago, pero la respuesta no se parsea para actualizar el estado.

---

### ✅ **ESTADO 2 - INMUEBLE Y REGISTRO**
**Cuándo se llena:**
- ✅ Cuando se sube una escritura o título de propiedad
- ✅ La IA extrae automáticamente: folio real, sección, partida, ubicación, superficie, valor
- ✅ También extrae información del propietario (vendedor) de la escritura

**Campos que se capturan:**
- `inmueble.folioReal` ✅ (de escritura)
- `inmueble.seccion` ✅ (de escritura)
- `inmueble.partida` ✅ (de escritura)
- `inmueble.direccion` ✅ (de escritura)
- `inmueble.superficie` ✅ (de escritura)
- `inmueble.valor` ✅ (de escritura)
- `vendedor.nombre` ✅ (de escritura - propietario)
- `vendedor.rfc` ✅ (de escritura - propietario)
- `vendedor.curp` ✅ (de escritura - propietario)

**Funciona bien:** Este estado se llena correctamente cuando se suben documentos.

---

### ✅ **ESTADO 3 - VENDEDOR(ES)**
**Cuándo se llena:**
- ✅ Cuando se sube un documento de identificación del vendedor (INE/IFE/Passport)
- ✅ Cuando se extrae de la escritura (como propietario)
- ⚠️ Parcialmente desde la conversación (función `extractDataFromMessage` - muy básica)

**Campos que se capturan:**
- `vendedor.nombre` ✅ (de documentos o escritura)
- `vendedor.rfc` ✅ (de documentos)
- `vendedor.curp` ✅ (de documentos)
- `vendedor.tieneCredito` ⚠️ (solo se detecta con patrones básicos)
- `vendedor.institucionCredito` ❌ (no se captura)
- `vendedor.numeroCredito` ❌ (no se captura)

**Problema actual:** La información de crédito del vendedor no se captura completamente.

---

### ✅ **ESTADO 4 - COMPRADOR(ES)**
**Cuándo se llena:**
- ✅ Cuando se sube un documento de identificación del comprador (INE/IFE/Passport)
- ⚠️ Parcialmente desde la conversación (función `extractDataFromMessage` - muy básica)

**Campos que se capturan:**
- `comprador.nombre` ✅ (de documentos)
- `comprador.rfc` ✅ (de documentos)
- `comprador.curp` ✅ (de documentos)

**Funciona bien:** Se llena correctamente cuando se suben documentos.

---

### ❌ **ESTADO 5 - CRÉDITO DEL COMPRADOR**
**Cuándo se llena:**
- ❌ **NO se está llenando automáticamente** durante la conversación
- Solo se actualiza manualmente si el usuario proporciona la información en un formato muy específico

**Campos que deberían capturarse:**
- `comprador.institucionCredito` ❌ (no se actualiza desde la conversación)
- `comprador.montoCredito` ❌ (no se actualiza desde la conversación)

**Problema actual:** La IA pregunta sobre el crédito, pero la respuesta no se parsea para actualizar el estado.

---

### ⚠️ **ESTADO 6 - CANCELACIÓN DE HIPOTECA**
**Cuándo se llena:**
- ⚠️ Solo se detecta si `vendedor.tieneCredito` es `true` (con patrones básicos)
- ❌ No se capturan detalles de la hipoteca (acreedor, deudor, número de crédito)

**Campos que deberían capturarse:**
- `vendedor.tieneCredito` ⚠️ (solo con patrones básicos)
- `vendedor.institucionCredito` ❌ (no se captura)
- `vendedor.numeroCredito` ❌ (no se captura)

**Problema actual:** La información de cancelación de hipoteca no se captura completamente.

---

### ⚠️ **ESTADO 7 - OBJETO DEL ACTO**
**Cuándo se llena:**
- ✅ Parcialmente cuando se sube una escritura (superficie, valor, dirección)
- ❌ No se capturan detalles adicionales del inmueble (unidad, módulo, condominio, lote, manzana, fraccionamiento, colonia)

**Campos que se capturan:**
- `inmueble.direccion` ✅ (de escritura)
- `inmueble.superficie` ✅ (de escritura)
- `inmueble.valor` ✅ (de escritura)

**Campos que faltan:**
- Unidad, módulo, condominio, conjunto habitacional, lote, manzana, fraccionamiento, colonia, tipo de predio

---

### ❌ **ESTADO 8 - REVISIÓN FINAL**
**Cuándo se llena:**
- ❌ No hay un mecanismo específico para este estado
- Solo se verifica si todos los datos están completos con `isDataComplete()`

---

## Problemas Principales

### 1. **Falta de Parsing de Respuestas de la IA**
La función `extractDataFromMessage()` es muy básica y solo usa patrones de regex simples. No parsea información estructurada de las respuestas de la IA.

**Ejemplo del problema:**
- La IA pregunta: "¿Se paga de contado o mediante crédito?"
- El usuario responde: "Se paga de contado"
- El sistema NO actualiza `comprador.necesitaCredito = false`

### 2. **No se Captura Información de la Conversación**
Mucha información se captura solo de documentos, pero no de las respuestas del usuario durante la conversación.

### 3. **Falta de Integración con el JSON Canónico**
El prompt maestro indica que la salida final debe ser un JSON canónico, pero durante el flujo conversacional, la información no se estructura en ese formato.

---

## Solución Propuesta

### 1. **Mejorar `extractDataFromMessage()`**
- Parsear respuestas estructuradas de la IA
- Detectar confirmaciones explícitas del usuario
- Extraer información de forma de pago, tipo de operación, créditos, etc.

### 2. **Solicitar a la IA que Responda con JSON Parcial**
- Modificar el prompt para que la IA incluya información estructurada en sus respuestas
- Parsear ese JSON parcial para actualizar el estado

### 3. **Agregar Campos Faltantes al Estado**
- Agregar campos para información del inmueble (unidad, módulo, condominio, etc.)
- Agregar campos para información de créditos (institución, monto, número)

### 4. **Implementar Actualización de Estado desde Respuestas de la IA**
- Cuando la IA confirma información, actualizar el estado automáticamente
- Validar que la información sea consistente

---

## Resumen por Estado

| Estado | Se Llena Automáticamente | Fuente Principal | Problemas |
|--------|-------------------------|------------------|-----------|
| ESTADO 0 | ✅ Parcialmente | Documentos | No siempre se extrae de conversación |
| ESTADO 1 | ❌ No | - | No se parsea de conversación |
| ESTADO 2 | ✅ Sí | Documentos (escritura) | Funciona bien |
| ESTADO 3 | ✅ Parcialmente | Documentos | Falta información de crédito |
| ESTADO 4 | ✅ Parcialmente | Documentos | Funciona bien |
| ESTADO 5 | ❌ No | - | No se parsea de conversación |
| ESTADO 6 | ⚠️ Muy básico | Patrones simples | Falta información detallada |
| ESTADO 7 | ✅ Parcialmente | Documentos | Faltan campos adicionales |
| ESTADO 8 | ❌ No | - | No hay mecanismo específico |



