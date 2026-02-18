# Plugins de Tramite (Fase 7)

## Objetivo
Formalizar un contrato estable para agregar tramites (`preaviso`, `preventivo`, etc.) sin duplicar agentes core.

## Archivos clave
- `lib/tramites/plugins/tramite-plugin.ts`: contrato `TramitePlugin`.
- `lib/tramites/plugins/plugin-registry.ts`: `PluginRegistry.get()` y `PluginRegistry.list()`.
- `lib/tramites/plugins/preaviso-tramite-plugin.ts`: implementacion de `preaviso`.
- `lib/tramites/plugins/preventivo-tramite-plugin.ts`: plugin stub de ejemplo.
- `lib/services/tramite-plugin-state-service.ts`: calculo de wizard state por plugin.

## Contrato obligatorio del plugin
Cada plugin define:
- `tramiteType`
- `schemas.extractionSchema`
- `schemas.stateSchema`
- `schemas.proposedUpdateSchema`
- `stepsDefinition()`
- `knowledgeScope()`
- `retrievalConfig()`
- `docGenerationConfig()`
- `requiredFieldsForFinalize()`
- prompts de extraccion:
  - `buildExtractionSystemPrompt()`
  - `buildExtractionUserPrompt()`
  - `buildExtractionRepairPrompt()`

Hooks opcionales:
- `getRequiredMissingFields()`
- `getBlockingReasons()`

## Como agregar un nuevo tramite
1. Crear `lib/tramites/plugins/<tramite>-tramite-plugin.ts` implementando `TramitePlugin`.
2. Definir `schemas` (extraccion, estado y proposed updates).
3. Definir `stepsDefinition()` con `id` estables.
4. Definir `knowledgeScope()` y `retrievalConfig()`.
5. Definir `docGenerationConfig()` y `requiredFieldsForFinalize()`.
6. Registrar plugin en `PluginRegistry.getInstance()`.
7. Agregar test de compatibilidad (registry, steps, extraction, router/context).

## Que no se debe duplicar
No duplicar:
- `ExtractionAgent`
- `RetrievalResponseAgent`
- `ContextBuilder`
- `AgentRouter`
- servicios core de indexacion/chunking/embeddings

Solo parametrizar por plugin (schemas, reglas, knowledge y hooks de dominio).
