# Implementación del Plugin System

## ✅ Estado de Implementación

### Completado

1. **Estructura Base** ✅
   - `lib/tramites/base/types.ts` - Tipos base
   - `lib/tramites/base/tramite-plugin.ts` - Interface de plugin
   - `lib/tramites/base/flexible-state-machine.ts` - State machine flexible
   - `lib/tramites/base/tramite-system.ts` - Sistema base
   - `lib/tramites/base/command-router.ts` - Router de comandos

2. **Servicios Compartidos** ✅
   - `lib/tramites/shared/services/llm-service.ts` - Servicio LLM
   - `lib/tramites/shared/services/validation-service.ts` - Validaciones
   - `lib/tramites/shared/services/conyuge-service.ts` - Servicio de cónyuge
   - `lib/tramites/shared/input-parser.ts` - Parser de input

3. **Plugin de Preaviso** ✅
   - `lib/tramites/plugins/preaviso/preaviso-plugin.ts` - Plugin principal
   - `lib/tramites/plugins/preaviso/document-processor.ts` - Procesador de documentos

4. **Handlers** ✅
   - `estado-civil-handler.ts`
   - `folio-selection-handler.ts`
   - `buyer-name-handler.ts`
   - `conyuge-name-handler.ts`
   - `titular-registral-handler.ts`
   - `payment-method-handler.ts`
   - `credit-institution-handler.ts`
   - `credit-participant-handler.ts`
   - `encumbrance-handler.ts`

5. **Endpoints Alternativos** ✅
   - `app/api/ai/preaviso-chat-v2/route.ts` - Chat con Plugin System
   - `app/api/ai/preaviso-process-document-v2/route.ts` - Procesamiento de documentos

6. **Inicialización** ✅
   - `lib/tramites/tramite-system-instance.ts` - Singleton del sistema

---

## 🚀 Cómo Usar

### Opción 1: Usar Endpoints V2 (Nuevo Sistema)

Los endpoints V2 están listos para usar:

```typescript
// Chat
POST /api/ai/preaviso-chat-v2
{
  "messages": [...],
  "context": {...},
  "tramiteId": "preaviso"
}

// Procesamiento de documentos
POST /api/ai/preaviso-process-document-v2
FormData:
  - file: File
  - documentType: string
  - context: string (JSON)
  - tramiteId: string (default: "preaviso")
  - needOcr: string (opcional)
```

### Opción 2: Integrar en Frontend

Para probar el nuevo sistema en el frontend, modifica `components/preaviso-chat.tsx`:

```typescript
// Cambiar de:
const response = await fetch('/api/ai/preaviso-chat', { ... })

// A:
const response = await fetch('/api/ai/preaviso-chat-v2', { ... })
```

---

## 📋 Próximos Pasos

### Pendiente

1. **Migrar Handlers Restantes** (si aplica)
   - Handlers adicionales que puedan faltar

2. **Integración Completa**
   - Modificar frontend para usar endpoints V2
   - O crear feature flag para alternar entre sistemas

3. **Tests**
   - Unit tests para handlers
   - Integration tests para flujo completo
   - Tests de regresión

4. **Mejoras**
   - Completar prompts de DocumentProcessor (usar prompts completos de preaviso-process-document)
   - Mejorar manejo de errores
   - Agregar logging más detallado

---

## 🔄 Migración Gradual

### Estrategia Recomendada

1. **Fase 1: Testing Paralelo** (Actual)
   - Endpoints V2 funcionando en paralelo
   - Probar con casos reales
   - Comparar resultados

2. **Fase 2: Feature Flag**
   - Agregar flag `USE_PLUGIN_SYSTEM` en `.env`
   - Frontend alterna entre sistemas según flag

3. **Fase 3: Migración Completa**
   - Una vez validado, reemplazar endpoints originales
   - Eliminar código legacy

---

## 🐛 Debugging

### Ver Comandos Generados

Los endpoints V2 incluyen `commands` en la respuesta para debugging:

```json
{
  "message": "...",
  "data": {...},
  "state": {...},
  "commands": ["buyer_name", "estado_civil"]  // ← Para debugging
}
```

### Logs

El sistema genera logs en:
- `[TramiteSystem]` - Sistema base
- `[PreavisoPlugin]` - Plugin de preaviso
- `[DocumentProcessor]` - Procesador de documentos
- `[CommandRouter]` - Router de comandos

---

## 📚 Documentación Adicional

- `/docs/PLUGIN_SYSTEM_PROPUESTA.md` - Propuesta original
- `/docs/INTEGRACION_DOCUMENTOS_PLUGIN_SYSTEM.md` - Integración de documentos
- `/docs/ARQUITECTURA_FLEXIBLE_EXTENSIBLE.md` - Arquitectura flexible

---

## ⚠️ Notas Importantes

1. **Compatibilidad**: Los endpoints V2 son compatibles con el formato de datos actual
2. **Estado**: El sistema usa `computePreavisoState` existente para mantener compatibilidad
3. **Extensibilidad**: Fácil agregar nuevos trámites (solo crear nuevo plugin)
4. **Flexibilidad**: El sistema acepta información fuera de orden

---

## 🎯 Ventajas del Nuevo Sistema

1. ✅ **Más Organizado**: Lógica separada en plugins y handlers
2. ✅ **Más Testeable**: Handlers pequeños y enfocados
3. ✅ **Más Extensible**: Fácil agregar nuevos trámites
4. ✅ **Más Flexible**: Acepta información fuera de orden
5. ✅ **Mejor Debugging**: Comandos visibles en respuesta
