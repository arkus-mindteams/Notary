import { OpenAIDocumentProvider } from '@/lib/ai/providers/openai.provider'
import type { VisionDocumentProvider } from '@/lib/ai/providers/vision-provider.interface'

export class ProviderFactory {
  static get(providerName: string | null | undefined): VisionDocumentProvider {
    const normalized = String(providerName || 'openai').trim().toLowerCase()
    switch (normalized) {
      case 'openai':
        return new OpenAIDocumentProvider()
      case 'gemini':
        throw new Error('GeminiDocumentProvider TODO')
      case 'opus':
        throw new Error('OpusDocumentProvider TODO')
      default:
        throw new Error(`AI provider no soportado: ${normalized}`)
    }
  }
}

