import { randomUUID } from 'crypto'
import { PluginRegistry } from '@/lib/tramites/plugins/plugin-registry'

export interface DocumentGenerationInput {
  tramiteId: string
  tramiteType?: string
  outputFormat?: 'docx' | 'pdf'
  documentTitle?: string
}

export interface DocumentGenerationResult {
  trace_id: string
  actions: Array<Record<string, unknown>>
  payload: Record<string, unknown>
  answer: string
}

export class DocumentGenerationAgent {
  async prepare(input: DocumentGenerationInput): Promise<DocumentGenerationResult> {
    const traceId = randomUUID()
    const plugin = PluginRegistry.getInstance().get(String(input.tramiteType || 'preaviso'))
    const config = plugin.docGenerationConfig()
    const format = input.outputFormat || config.defaultFormat
    const title = input.documentTitle || config.defaultTitle

    return {
      trace_id: traceId,
      actions: [
        {
          type: 'prepare_document_generation',
          requires_domain_commit: true,
          commit_endpoint: config.commitEndpoint,
        },
      ],
      payload: {
        tramiteId: input.tramiteId,
        generatedDocument: {
          formato: format,
          titulo: title,
        },
      },
      answer: 'Preparacion de generacion lista. Confirma para ejecutar el commit via Domain Service.',
    }
  }
}

