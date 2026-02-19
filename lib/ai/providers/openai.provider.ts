import { documentIntakeProviderResponseSchema } from '@/lib/ai/intake/document-intake.types'
import type {
  VisionDocumentProvider,
  VisionDocumentProviderInput,
  VisionDocumentProviderOutput,
} from '@/lib/ai/providers/vision-provider.interface'

type UploadedOpenAIFile = {
  documentId: string
  fileId: string
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text
  }
  const outputs = Array.isArray(payload?.output) ? payload.output : []
  const parts: string[] = []
  for (const output of outputs) {
    const content = Array.isArray(output?.content) ? output.content : []
    for (const item of content) {
      if (typeof item?.text === 'string') parts.push(item.text)
      if (typeof item?.content === 'string') parts.push(item.content)
    }
  }
  return parts.join('\n').trim()
}

export class OpenAIDocumentProvider implements VisionDocumentProvider {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model =
      process.env.OPENAI_DOCUMENT_INTAKE_MODEL ||
      process.env.OPENAI_EXTRACTION_MODEL ||
      process.env.OPENAI_MODEL ||
      'gpt-4.1'
  }

  async processDocuments(input: VisionDocumentProviderInput): Promise<VisionDocumentProviderOutput> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }
    if (!Array.isArray(input.files) || input.files.length === 0) {
      throw new Error('No files provided')
    }

    const uploadedFiles: UploadedOpenAIFile[] = []
    try {
      for (const doc of input.files) {
        const fileId = await this.uploadFile(doc.file, doc.filename)
        uploadedFiles.push({ documentId: doc.documentId, fileId })
      }

      const responseBody = {
        model: this.model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: input.systemPrompt }],
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: input.userPrompt },
              ...uploadedFiles.map((f) => ({ type: 'input_file', file_id: f.fileId })),
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'document_intake_batch',
            // Strict=true exige additionalProperties=false en todos los objetos del schema,
            // lo que choca con keyFields flexible. Validamos estrictamente luego con Zod.
            strict: false,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['traceId', 'documents'],
              properties: {
                traceId: { type: 'string' },
                documents: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['documentId', 'filename', 'detectedType', 'confidence', 'summary', 'pages'],
                    properties: {
                      documentId: { type: 'string' },
                      filename: { type: 'string' },
                      detectedType: { type: 'string' },
                      confidence: { type: 'number' },
                      issues: { type: 'array', items: { type: 'string' } },
                      summary: { type: 'array', items: { type: 'string' } },
                      pages: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: true,
                          required: ['pageNumber', 'text', 'evidence'],
                          properties: {
                            pageNumber: { type: 'number' },
                            text: { type: 'string' },
                            evidence: {
                              type: 'array',
                              items: {
                                type: 'object',
                                additionalProperties: true,
                                required: ['label', 'snippet', 'pageNumber'],
                                properties: {
                                  label: { type: 'string' },
                                  snippet: { type: 'string' },
                                  pageNumber: { type: 'number' },
                                  bbox: { type: 'object' },
                                },
                              },
                            },
                          },
                        },
                      },
                      keyFields: { type: 'object' },
                      facts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: true,
                          required: ['key', 'value', 'confidence', 'evidence'],
                          properties: {
                            key: { type: 'string' },
                            value: { type: 'string' },
                            confidence: { type: 'number' },
                            evidence: {
                              type: 'object',
                              required: ['pageNumber', 'snippet'],
                              properties: {
                                pageNumber: { type: 'number' },
                                snippet: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        max_output_tokens: Number(process.env.OPENAI_DOCUMENT_INTAKE_MAX_OUTPUT_TOKENS || 12000),
      }

      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(responseBody),
      })

      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        const message = String(data?.error?.message || 'OpenAI responses API error')
        throw new Error(message)
      }

      const rawText = extractResponseText(data)
      const parsed = JSON.parse(rawText || '{}')
      const validated = documentIntakeProviderResponseSchema.parse(parsed)

      return {
        result: validated,
        rawText,
        rawResponse: data,
        model: String(data?.model || this.model),
        usage: {
          input_tokens: Number(data?.usage?.input_tokens || 0) || undefined,
          output_tokens: Number(data?.usage?.output_tokens || 0) || undefined,
          total_tokens: Number(data?.usage?.total_tokens || 0) || undefined,
        },
      }
    } finally {
      await Promise.all(
        uploadedFiles.map((f) =>
          fetch(`https://api.openai.com/v1/files/${f.fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.apiKey}` },
          }).catch(() => null)
        )
      )
    }
  }

  private async uploadFile(file: File, filename: string): Promise<string> {
    const uploadForm = new FormData()
    uploadForm.append('purpose', 'assistants')
    uploadForm.append('file', file, filename)

    const resp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: uploadForm,
    })

    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      const message = String(data?.error?.message || 'OpenAI file upload failed')
      throw new Error(message)
    }

    const fileId = String(data?.id || '')
    if (!fileId) {
      throw new Error('OpenAI file upload without file id')
    }
    return fileId
  }
}
