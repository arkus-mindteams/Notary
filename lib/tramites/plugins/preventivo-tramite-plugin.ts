import { z } from 'zod'
import type { BuildExtractionPromptInput, TramitePlugin } from '@/lib/tramites/plugins/tramite-plugin'
import { getPathValue, hasMeaningfulValue, proposedUpdatesSchema } from '@/lib/tramites/plugins/shared-schemas'

const preventivoExtractionSchema = z
  .object({
    source_document_type: z.enum(['inscripcion', 'escritura', 'identificacion', 'otro']).default('otro'),
    solicitante: z
      .object({
        nombre: z.string().trim().min(1).nullable().optional(),
      })
      .strict()
      .optional(),
    inmueble: z
      .object({
        folio_real: z.string().trim().min(1).nullable().optional(),
      })
      .strict()
      .optional(),
    confidence: z.number().min(0).max(1).optional(),
    warnings: z.array(z.string()).default([]),
    source_refs: z
      .array(
        z
          .object({
            field: z.string().trim().min(1),
            evidence: z.string().trim().min(1),
          })
          .strict()
      )
      .default([]),
  })
  .strict()

const preventivoStateSchema = z
  .object({
    solicitante: z
      .object({
        nombre: z.string().trim().optional(),
      })
      .passthrough()
      .optional(),
    inmueble: z
      .object({
        folio_real: z.string().trim().optional(),
      })
      .passthrough()
      .optional(),
    preventivo: z
      .object({
        tipo: z.string().trim().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const PREVENTIVO_STEPS: Array<{ id: string; stateId: string; label: string; requiredPath: string }> = [
  { id: 'paso1', stateId: 'PREVENTIVO_1', label: 'Solicitante', requiredPath: 'solicitante.nombre' },
  { id: 'paso2', stateId: 'PREVENTIVO_2', label: 'Inmueble', requiredPath: 'inmueble.folio_real' },
  { id: 'paso3', stateId: 'PREVENTIVO_3', label: 'Tipo de preventivo', requiredPath: 'preventivo.tipo' },
]

function parseState(input: unknown): Record<string, unknown> {
  const parsed = preventivoStateSchema.safeParse(input)
  if (parsed.success) return parsed.data as Record<string, unknown>
  return (input as Record<string, unknown>) || {}
}

export class PreventivoTramitePlugin implements TramitePlugin {
  tramiteType: 'preventivo' = 'preventivo'

  schemas = {
    extractionSchema: preventivoExtractionSchema,
    stateSchema: preventivoStateSchema,
    proposedUpdateSchema: proposedUpdatesSchema,
  }

  stepsDefinition() {
    return PREVENTIVO_STEPS.map((step) => ({
      id: step.id,
      stateId: step.stateId,
      label: step.label,
      isComplete: (state: unknown) => {
        const parsed = parseState(state)
        return hasMeaningfulValue(getPathValue(parsed, step.requiredPath))
      },
    }))
  }

  knowledgeScope(args?: { tenantId?: string | null; scope?: string }) {
    return {
      tramite: this.tramiteType,
      scope: args?.scope || 'chat_generation',
      tenantId: args?.tenantId || null,
    }
  }

  retrievalConfig() {
    return {
      topKDoc: 4,
      topKKnowledge: 3,
      knowledgeScope: 'chat_generation',
      additionalFilters: {},
    }
  }

  docGenerationConfig() {
    return {
      commitEndpoint: '/api/expedientes/preventivo/finalize',
      defaultFormat: 'docx' as const,
      defaultTitle: 'SOLICITUD PREVENTIVO',
      templates: ['preventivo/stub'],
      baseMapping: {
        solicitante: 'solicitante',
        inmueble: 'inmueble',
        preventivo: 'preventivo',
      },
    }
  }

  requiredFieldsForFinalize() {
    return PREVENTIVO_STEPS.map((step) => step.requiredPath)
  }

  buildExtractionSystemPrompt(_input: BuildExtractionPromptInput): string {
    return [
      'Eres un extractor juridico para tramite PREVENTIVO.',
      'Responde solo JSON valido y no inventes informacion.',
    ].join(' ')
  }

  buildExtractionUserPrompt(input: BuildExtractionPromptInput): string {
    const fileMeta = JSON.stringify(input.fileMeta || {}, null, 2)
    return [
      'Extrae datos minimos para preventivo:',
      '{"source_document_type":"otro","solicitante":{"nombre":"string|null"},"inmueble":{"folio_real":"string|null"},"warnings":[],"source_refs":[]}',
      'Metadatos:',
      fileMeta,
      'Texto:',
      String(input.rawText || ''),
    ].join('\n\n')
  }

  buildExtractionRepairPrompt(args: {
    input: BuildExtractionPromptInput
    lastModelOutput: string
    validationErrors: string[]
  }): string {
    return [
      'La salida anterior fue invalida. Corrigela.',
      `Errores: ${args.validationErrors.join(' | ')}`,
      'Salida anterior:',
      args.lastModelOutput,
      'Texto fuente:',
      String(args.input.rawText || ''),
    ].join('\n\n')
  }
}
