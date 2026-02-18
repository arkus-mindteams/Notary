import { z } from 'zod'
import { computePreavisoState } from '@/lib/preaviso-state'
import { PreavisoExtractionPlugin, preavisoExtractionSchema } from '@/lib/ai/extraction/plugins/preaviso-extraction-plugin'
import type { BuildExtractionPromptInput, TramitePlugin } from '@/lib/tramites/plugins/tramite-plugin'
import { getPathValue, hasMeaningfulValue, proposedUpdatesSchema } from '@/lib/tramites/plugins/shared-schemas'

const extractionPromptDelegate = new PreavisoExtractionPlugin()

const preavisoStateSchema = z
  .object({
    tipoOperacion: z.string().trim().optional(),
    vendedores: z.array(z.record(z.unknown())).optional(),
    compradores: z.array(z.record(z.unknown())).optional(),
    creditos: z.array(z.record(z.unknown())).optional(),
    gravamenes: z.array(z.record(z.unknown())).optional(),
    inmueble: z.record(z.unknown()).optional(),
    actosNotariales: z.record(z.unknown()).optional(),
    documentosProcesados: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough()

const PREAVISO_STEPS: Array<{ id: string; stateId: string; label: string }> = [
  { id: 'paso1', stateId: 'ESTADO_1', label: 'Operacion y forma de pago' },
  { id: 'paso2', stateId: 'ESTADO_2', label: 'Datos del inmueble' },
  { id: 'paso3', stateId: 'ESTADO_3', label: 'Datos del vendedor' },
  { id: 'paso4', stateId: 'ESTADO_4', label: 'Datos del comprador' },
  { id: 'paso5', stateId: 'ESTADO_5', label: 'Credito del comprador' },
  { id: 'paso6', stateId: 'ESTADO_6', label: 'Gravamenes' },
]

function parseState(input: unknown): Record<string, unknown> {
  const parsed = preavisoStateSchema.safeParse(input)
  if (parsed.success) return parsed.data as Record<string, unknown>
  return (input as Record<string, unknown>) || {}
}

export class PreavisoTramitePlugin implements TramitePlugin {
  tramiteType: 'preaviso' = 'preaviso'

  schemas = {
    extractionSchema: preavisoExtractionSchema,
    stateSchema: preavisoStateSchema,
    proposedUpdateSchema: proposedUpdatesSchema,
  }

  stepsDefinition() {
    return PREAVISO_STEPS.map((step) => ({
      id: step.id,
      stateId: step.stateId,
      label: step.label,
      isComplete: (state: unknown) => {
        const computed = computePreavisoState(parseState(state))
        const status = computed.state.state_status[step.stateId]
        return status === 'completed' || status === 'not_applicable'
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
      topKDoc: 6,
      topKKnowledge: 4,
      knowledgeScope: 'chat_generation',
      additionalFilters: {},
    }
  }

  docGenerationConfig() {
    return {
      commitEndpoint: '/api/expedientes/preaviso/finalize',
      defaultFormat: 'docx' as const,
      defaultTitle: 'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO',
      templates: ['preaviso/default'],
      baseMapping: {
        tipoOperacion: 'tipoOperacion',
        vendedores: 'vendedores',
        compradores: 'compradores',
        inmueble: 'inmueble',
      },
    }
  }

  requiredFieldsForFinalize() {
    return [
      'tipoOperacion',
      'inmueble.folio_real',
      'inmueble.partidas',
      'inmueble.direccion',
      'vendedores[0].tipo_persona',
      'compradores[0].tipo_persona',
    ]
  }

  getRequiredMissingFields(state: unknown): string[] {
    const parsed = parseState(state)
    const computed = computePreavisoState(parsed)
    return Array.from(new Set(computed.state.required_missing || []))
  }

  getBlockingReasons(state: unknown): string[] {
    const parsed = parseState(state)
    const computed = computePreavisoState(parsed)
    return Array.from(new Set(computed.state.blocking_reasons || []))
  }

  buildExtractionSystemPrompt(input: BuildExtractionPromptInput): string {
    return extractionPromptDelegate.buildSystemPrompt(input as any)
  }

  buildExtractionUserPrompt(input: BuildExtractionPromptInput): string {
    return extractionPromptDelegate.buildUserPrompt(input as any)
  }

  buildExtractionRepairPrompt(args: {
    input: BuildExtractionPromptInput
    lastModelOutput: string
    validationErrors: string[]
  }): string {
    return extractionPromptDelegate.buildRepairPrompt(args as any)
  }
}

export function getPreavisoFinalizeMissingFields(state: unknown): string[] {
  const parsed = parseState(state)
  const plugin = new PreavisoTramitePlugin()
  const required = plugin.requiredFieldsForFinalize()
  return required.filter((path) => !hasMeaningfulValue(getPathValue(parsed, path)))
}
