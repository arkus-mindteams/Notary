import { randomUUID } from 'crypto'

export interface DocumentGenerationInput {
  tramiteId: string
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
    const format = input.outputFormat || 'docx'
    const title = input.documentTitle || 'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO'

    return {
      trace_id: traceId,
      actions: [
        {
          type: 'prepare_document_generation',
          requires_domain_commit: true,
          commit_endpoint: '/api/expedientes/preaviso/finalize',
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

