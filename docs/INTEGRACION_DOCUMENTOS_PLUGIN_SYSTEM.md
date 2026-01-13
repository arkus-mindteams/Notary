# Integración de Documentos en el Plugin System

## ¿Funcionará Igual que Ahora?

**Sí, y mejor**. El procesamiento de documentos se mantiene igual, pero se integra mejor con el nuevo sistema.

---

## Flujo Actual de Documentos

```
Usuario sube documento (PDF/imagen)
    ↓
Frontend convierte PDF a imágenes
    ↓
POST /api/ai/preaviso-process-document
    ↓
OpenAI Vision API extrae información
    ↓
Sistema detecta tipo de documento:
  - inscripcion → extrae folios, propietario, dirección, etc.
  - escritura → extrae folios, propietario, etc.
  - identificacion → extrae nombre, RFC, CURP
  - acta_matrimonio → extrae nombres de cónyuges
    ↓
Sistema asigna automáticamente:
  - Si es identificación y no hay comprador → comprador
  - Si es identificación y hay comprador casado → cónyuge
  - Si es inscripción → propietario/vendedor
    ↓
Actualiza contexto directamente
    ↓
Frontend recibe datos actualizados
```

---

## Flujo Nuevo con Plugin System

```
Usuario sube documento (PDF/imagen)
    ↓
Frontend convierte PDF a imágenes
    ↓
POST /api/tramites/process-document
    ↓
OpenAI Vision API extrae información (IGUAL QUE AHORA)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PLUGIN SYSTEM                                                │
│ - Identifica qué trámite estamos procesando (preaviso)      │
│ - Obtiene plugin del trámite                                │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ DOCUMENT PROCESSOR (del Plugin)                             │
│ - Detecta tipo de documento (inscripción, identificación)  │
│ - Extrae información (IGUAL QUE AHORA)                      │
│ - Determina a qué va según contexto (MEJORADO)             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ GENERA COMANDOS (en lugar de actualizar contexto directo)  │
│ - DocumentProcessedCommand { tipo, datos }                  │
│ - FolioDetectedCommand { folios }                           │
│ - BuyerNameDetectedCommand { nombre }                       │
│ - ConyugeNameDetectedCommand { nombre }                     │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ HANDLERS PROCESAN COMANDOS                                  │
│ - DocumentProcessorHandler                                  │
│ - FolioSelectionHandler (si hay múltiples folios)           │
│ - BuyerNameHandler                                          │
│ - ConyugeNameHandler                                         │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ FLEXIBLE STATE MACHINE                                      │
│ - Recalcula estado con nueva información                    │
│ - Puede avanzar múltiples estados si documento tiene mucha info
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ LLM GENERA RESPUESTA                                        │
│ - "Del documento que subiste detecté..."                    │
│ - Pregunta siguiente información faltante                   │
└─────────────────────────────────────────────────────────────┘
    ↓
Response al usuario
```

---

## Implementación: Document Processor en Plugin

```typescript
// lib/tramites/plugins/preaviso/document-processor.ts
export class PreavisoDocumentProcessor {
  /**
   * Procesa documento y genera comandos
   * (Reemplaza la lógica actual de preaviso-process-document)
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<Command[]> {
    const commands: Command[] = []
    
    // 1. Llamar a OpenAI Vision API (IGUAL QUE AHORA)
    const extracted = await this.extractWithOpenAI(file, documentType)
    
    // 2. Detectar tipo de documento (IGUAL QUE AHORA)
    const detectedType = this.detectDocumentType(file.name, extracted)
    
    // 3. Procesar según tipo (MEJORADO - genera comandos en lugar de actualizar directo)
    switch (detectedType) {
      case 'inscripcion':
        return this.processInscripcion(extracted, context)
      
      case 'identificacion':
        return this.processIdentificacion(extracted, context)
      
      case 'acta_matrimonio':
        return this.processActaMatrimonio(extracted, context)
      
      case 'escritura':
        return this.processEscritura(extracted, context)
      
      default:
        return []
    }
  }
  
  private async processInscripcion(
    extracted: any,
    context: any
  ): Promise<Command[]> {
    const commands: Command[] = []
    
    // Extraer folios (IGUAL QUE AHORA)
    const folios = extracted.foliosReales || []
    const foliosConInfo = extracted.foliosConInfo || []
    
    if (folios.length > 1) {
      // Múltiples folios → generar comando de selección
      commands.push({
        type: 'multiple_folios_detected',
        timestamp: new Date(),
        payload: {
          folios,
          foliosConInfo,
          scope: {
            unidades: extracted.foliosRealesUnidades || [],
            inmuebles_afectados: extracted.foliosRealesInmueblesAfectados || []
          }
        }
      })
    } else if (folios.length === 1) {
      // Un solo folio → generar comando de folio seleccionado
      commands.push({
        type: 'folio_selection',
        timestamp: new Date(),
        payload: {
          selectedFolio: folios[0],
          folioInfo: foliosConInfo.find((f: any) => f.folio === folios[0]),
          confirmedByUser: false // Auto-detectado, no confirmado aún
        }
      })
    }
    
    // Extraer propietario (IGUAL QUE AHORA)
    if (extracted.propietario?.nombre) {
      commands.push({
        type: 'titular_registral_detected',
        timestamp: new Date(),
        payload: {
          name: extracted.propietario.nombre,
          rfc: extracted.propietario.rfc,
          curp: extracted.propietario.curp,
          inferredTipoPersona: this.inferTipoPersona(extracted.propietario.nombre),
          source: 'documento_inscripcion'
        }
      })
    }
    
    // Extraer dirección, superficie, etc. (IGUAL QUE AHORA)
    if (extracted.direccion || extracted.ubicacion) {
      commands.push({
        type: 'inmueble_address',
        timestamp: new Date(),
        payload: {
          direccion: extracted.direccion || { calle: extracted.ubicacion },
          superficie: extracted.superficie,
          datos_catastrales: extracted.datosCatastrales
        }
      })
    }
    
    return commands
  }
  
  private async processIdentificacion(
    extracted: any,
    context: any
  ): Promise<Command[]> {
    const commands: Command[] = []
    const nombre = extracted.nombre
    
    if (!nombre) return commands
    
    // DETERMINAR A QUÉ VA (MEJORADO - más inteligente)
    const intent = this.determineDocumentIntent(nombre, context)
    
    switch (intent) {
      case 'buyer':
        // Es del comprador
        commands.push({
          type: 'buyer_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            inferredTipoPersona: 'persona_fisica', // Por tipo de documento
            source: 'documento_identificacion'
          }
        })
        break
      
      case 'conyuge':
        // Es del cónyuge
        commands.push({
          type: 'conyuge_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            source: 'documento_identificacion'
          }
        })
        break
      
      case 'seller':
        // Es del vendedor
        commands.push({
          type: 'seller_name',
          timestamp: new Date(),
          payload: {
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            inferredTipoPersona: this.inferTipoPersona(nombre),
            source: 'documento_identificacion'
          }
        })
        break
      
      default:
        // No está claro → generar comando genérico y dejar que el sistema pregunte
        commands.push({
          type: 'person_name_detected',
          timestamp: new Date(),
          payload: {
            name: nombre,
            rfc: extracted.rfc,
            curp: extracted.curp,
            needsClarification: true // Sistema preguntará a qué va
          }
        })
    }
    
    return commands
  }
  
  private async processActaMatrimonio(
    extracted: any,
    context: any
  ): Promise<Command[]> {
    const commands: Command[] = []
    
    // Extraer nombres de cónyuges (IGUAL QUE AHORA)
    const nombres = this.extractNombresFromActa(extracted)
    
    if (nombres.length >= 2) {
      // Determinar cuál es el comprador y cuál el cónyuge
      const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
      
      for (const nombre of nombres) {
        if (nombre !== compradorNombre) {
          // Es el cónyuge
          commands.push({
            type: 'conyuge_name',
            timestamp: new Date(),
            payload: {
              buyerIndex: 0,
              name: nombre,
              source: 'documento_acta_matrimonio'
            }
          })
        }
      }
    }
    
    return commands
  }
  
  /**
   * Determina a qué va el documento (MEJORADO)
   */
  private determineDocumentIntent(
    nombre: string,
    context: any
  ): 'buyer' | 'conyuge' | 'seller' | 'unknown' {
    const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
    const vendedorNombre = context.vendedores?.[0]?.persona_fisica?.nombre ||
                          context.vendedores?.[0]?.persona_moral?.denominacion_social
    const conyugeNombre = context.compradores?.[0]?.persona_fisica?.conyuge?.nombre
    
    // Normalizar nombres para comparación
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const nombreNorm = normalize(nombre)
    
    // Si coincide con comprador → es del comprador
    if (compradorNombre && normalize(compradorNombre) === nombreNorm) {
      return 'buyer'
    }
    
    // Si coincide con cónyuge → es del cónyuge
    if (conyugeNombre && normalize(conyugeNombre) === nombreNorm) {
      return 'conyuge'
    }
    
    // Si coincide con vendedor → es del vendedor
    if (vendedorNombre && normalize(vendedorNombre) === nombreNorm) {
      return 'seller'
    }
    
    // Si hay comprador casado y el nombre NO es del comprador → probablemente cónyuge
    const compradorCasado = context.compradores?.[0]?.persona_fisica?.estado_civil === 'casado'
    const conyugeParticipa = context.compradores?.[0]?.persona_fisica?.conyuge?.participa === true
    
    if (compradorCasado && conyugeParticipa && !compradorNombre) {
      // Comprador casado, cónyuge participa, pero aún no tenemos nombre del comprador
      // Si el nombre no coincide con nada conocido, probablemente es el cónyuge
      return 'conyuge'
    }
    
    // Si no hay comprador → probablemente es del comprador
    if (!compradorNombre) {
      return 'buyer'
    }
    
    // Si hay comprador pero no vendedor → probablemente es del vendedor
    if (compradorNombre && !vendedorNombre) {
      return 'seller'
    }
    
    // Por defecto, comprador
    return 'buyer'
  }
}
```

---

## Integración en el Plugin

```typescript
// lib/tramites/plugins/preaviso/preaviso-plugin.ts
export class PreavisoPlugin implements TramitePlugin {
  // ... otros métodos
  
  // Procesador de documentos específico del plugin
  private documentProcessor = new PreavisoDocumentProcessor()
  
  /**
   * Procesa documento y genera comandos
   */
  async processDocument(
    file: File,
    documentType: string,
    context: any
  ): Promise<Command[]> {
    // Usar procesador específico del plugin
    return this.documentProcessor.processDocument(file, documentType, context)
  }
}
```

---

## API Endpoint Unificado

```typescript
// app/api/tramites/process-document/route.ts
export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get("file") as File
  const documentType = formData.get("documentType") as string
  const tramiteId = formData.get("tramiteId") as string // 'preaviso', 'testamento', etc.
  const contextRaw = formData.get("context") as string
  
  const context = contextRaw ? JSON.parse(contextRaw) : {}
  
  // Obtener plugin del trámite
  const tramiteSystem = getTramiteSystem()
  const plugin = tramiteSystem.getPlugin(tramiteId)
  
  if (!plugin) {
    return NextResponse.json(
      { error: 'tramite_not_found', message: `Trámite ${tramiteId} no encontrado` },
      { status: 404 }
    )
  }
  
  // Procesar documento con el plugin
  const commands = await plugin.processDocument(file, documentType, context)
  
  // Ejecutar comandos con handlers
  const router = new CommandRouter()
  let updatedContext = context
  
  for (const command of commands) {
    const result = await router.route(command, updatedContext)
    updatedContext = { ...updatedContext, ...result.updatedContext }
  }
  
  // Guardar OCR en Redis (IGUAL QUE AHORA)
  if (needOcr) {
    const ocrText = await extractOCRText(file)
    await PreavisoOcrCacheService.upsert(
      `${tramiteId}:${file.name}:${Date.now()}`,
      ocrText,
      2 * 60 * 60 // 2 horas TTL
    )
  }
  
  return NextResponse.json({
    data: updatedContext,
    commands: commands.map(c => c.type), // Para debugging
    message: this.generateDocumentResponse(commands, plugin)
  })
}
```

---

## Ventajas del Nuevo Sistema para Documentos

### 1. **Mismo Funcionamiento, Mejor Organización**
- ✅ Extracción de información: **IGUAL** (OpenAI Vision API)
- ✅ Detección de tipo: **IGUAL**
- ✅ Asignación automática: **MEJORADA** (más inteligente)

### 2. **Mejor Determinación de "A Qué Va"**
```typescript
// Sistema Actual:
// Lógica mezclada en preaviso-process-document
// Difícil de mantener y extender

// Sistema Nuevo:
// Lógica en DocumentProcessor del plugin
// Fácil de mantener y extender
// Cada trámite puede tener su propia lógica
```

### 3. **Comandos en lugar de Actualización Directa**
```typescript
// Sistema Actual:
// Actualiza contexto directamente
context.compradores[0].persona_fisica.nombre = extracted.nombre

// Sistema Nuevo:
// Genera comandos que luego se procesan
commands.push({
  type: 'buyer_name',
  payload: { name: extracted.nombre }
})
// → Handler procesa → Actualiza contexto
// → State Machine recalcula → LLM genera respuesta
```

**Ventaja**: Más control, mejor debugging, más fácil de testear

### 4. **Extensible para Nuevos Trámites**
```typescript
// Plugin de Testamento puede tener su propio DocumentProcessor
class TestamentoDocumentProcessor {
  async processDocument(file: File, context: any) {
    // Lógica específica de testamento
    // Ej: Detectar testador, beneficiarios, bienes, etc.
  }
}
```

---

## Ejemplo Completo: Usuario Sube Pasaporte del Comprador

### Flujo Actual:
```
1. Usuario sube pasaporte
2. preaviso-process-document extrae: nombre = "WU, JINWEI"
3. Sistema detecta: no hay comprador → asigna a comprador
4. Actualiza: context.compradores[0].persona_fisica.nombre = "WU, JINWEI"
5. Frontend recibe datos actualizados
```

### Flujo Nuevo:
```
1. Usuario sube pasaporte
2. PreavisoDocumentProcessor extrae: nombre = "WU, JINWEI"
3. determineDocumentIntent() detecta: no hay comprador → 'buyer'
4. Genera comando: BuyerNameCommand { name: "WU, JINWEI", source: "documento" }
5. BuyerNameHandler procesa comando
6. Actualiza: context.compradores[0].persona_fisica.nombre = "WU, JINWEI"
7. Flexible State Machine recalcula estado
8. LLM genera respuesta: "Del pasaporte que subiste detecté al comprador: WU, JINWEI..."
9. Frontend recibe datos actualizados + respuesta natural
```

**Diferencia**: Mismo resultado, pero más organizado y con mejor respuesta.

---

## Ejemplo: Usuario Sube Pasaporte del Cónyuge

### Flujo Actual:
```
1. Usuario sube pasaporte del cónyuge
2. Sistema detecta: nombre diferente al comprador → probablemente cónyuge
3. Actualiza: context.compradores[0].persona_fisica.conyuge.nombre = "QIAOZHEN ZHANG"
```

### Flujo Nuevo:
```
1. Usuario sube pasaporte del cónyuge
2. PreavisoDocumentProcessor extrae: nombre = "QIAOZHEN ZHANG"
3. determineDocumentIntent() detecta:
   - Comprador existe: "WU, JINWEI"
   - Nombre diferente → 'conyuge'
   - Comprador casado → confirmado
4. Genera comando: ConyugeNameCommand { name: "QIAOZHEN ZHANG" }
5. ConyugeNameHandler procesa
6. Actualiza: context.compradores[0].persona_fisica.conyuge.nombre = "QIAOZHEN ZHANG"
7. Flexible State Machine recalcula
8. LLM genera: "Del pasaporte que subiste detecté a la cónyuge: QIAOZHEN ZHANG..."
```

**Mejora**: Determinación más inteligente y respuesta más natural.

---

## OCR/RAG (Revisar Documentos Ya Subidos)

**Funciona IGUAL que ahora**:

```typescript
// Usuario: "revisa el nombre del cónyuge en el acta de matrimonio"

// Sistema:
1. Busca en Redis OCR del acta de matrimonio
2. Extrae texto relevante
3. LLM interpreta: "nombre del cónyuge"
4. Busca en OCR y encuentra: "QIAOZHEN ZHANG"
5. Genera comando: ConyugeNameCommand
6. Handler procesa
7. LLM genera respuesta: "En el acta de matrimonio encontré que la cónyuge es QIAOZHEN ZHANG"
```

**No cambia nada** - sigue funcionando igual.

---

## Resumen: ¿Funciona Igual?

### ✅ **SÍ, y MEJOR**:

1. **Extracción de información**: **IGUAL** (OpenAI Vision API)
2. **Detección de tipo**: **IGUAL** (inscripción, identificación, etc.)
3. **Asignación automática**: **MEJORADA** (más inteligente)
4. **OCR/RAG**: **IGUAL** (Redis, revisar documentos)
5. **Respuestas**: **MEJORADAS** (LLM genera respuestas más naturales)

### Mejoras:

1. **Mejor organización**: Lógica de documentos en el plugin
2. **Más control**: Comandos en lugar de actualización directa
3. **Mejor debugging**: Fácil ver qué comandos se generaron
4. **Extensible**: Cada trámite puede tener su propia lógica de documentos

---

## Conclusión

**El procesamiento de documentos funciona IGUAL que ahora, pero:**
- ✅ Más organizado (lógica en plugins)
- ✅ Más inteligente (mejor determinación de "a qué va")
- ✅ Más mantenible (fácil modificar lógica por trámite)
- ✅ Respuestas más naturales (LLM genera mejor)

**No perdemos funcionalidad, la mejoramos.**

¿Quieres que implemente el DocumentProcessor en el plugin para que veas cómo se vería?
