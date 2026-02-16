import { z } from 'zod'
import type { ClassifyIntentInput, Intent } from '@/lib/ai/routing/types'

const intentSchema = z.object({
  intent: z.enum(['QNA', 'EXTRACT_DOCUMENT', 'UPDATE_STATE', 'GENERATE_DOCUMENT', 'UNKNOWN']),
})

type LLMClassifierClient = {
  classifyAmbiguous: (input: ClassifyIntentInput) => Promise<Intent>
}

class OpenAIIntentClassifierClient implements LLMClassifierClient {
  private readonly apiKey: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_ROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }

  async classifyAmbiguous(input: ClassifyIntentInput): Promise<Intent> {
    if (!this.apiKey) return 'UNKNOWN'

    const systemPrompt =
      'Clasifica intencion para orquestar agentes notariales. Responde solo JSON: {"intent":"QNA|EXTRACT_DOCUMENT|UPDATE_STATE|GENERATE_DOCUMENT|UNKNOWN"}'
    const userPrompt = JSON.stringify({
      message: input.message,
      hasDocument: !!input.hasDocument,
      uiAction: input.uiAction || null,
      currentStep: input.currentStep || null,
      rules: {
        QNA: 'pregunta o consulta',
        EXTRACT_DOCUMENT: 'subir/procesar/extraer documento',
        UPDATE_STATE: 'corregir/actualizar datos del tramite',
        GENERATE_DOCUMENT: 'generar/finalizar documento',
        UNKNOWN: 'ambiguo o insuficiente',
      },
    })

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...(this.model.includes('o1') || this.model.includes('o3')
        ? {}
        : { response_format: { type: 'json_object' }, temperature: 0 }),
      ...(this.model.includes('gpt-4') || this.model.includes('gpt-5') || this.model.includes('o1') || this.model.includes('o3')
        ? { max_completion_tokens: 120 }
        : { max_tokens: 120 }),
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) return 'UNKNOWN'
    const data = await response.json().catch(() => ({}))
    let content = String(data?.choices?.[0]?.message?.content || '').trim()
    if (content.startsWith('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) content = match[1]
    }

    try {
      const parsed = intentSchema.safeParse(JSON.parse(content || '{}'))
      return parsed.success ? parsed.data.intent : 'UNKNOWN'
    } catch {
      return 'UNKNOWN'
    }
  }
}

type IntentClassifierDeps = {
  llmClient: LLMClassifierClient
}

const defaultDeps: IntentClassifierDeps = {
  llmClient: new OpenAIIntentClassifierClient(),
}

export class IntentClassifier {
  constructor(private readonly deps: IntentClassifierDeps = defaultDeps) {}

  async classify(input: ClassifyIntentInput): Promise<Intent> {
    const message = String(input.message || '').trim()
    const normalized = normalize(message)
    const uiAction = normalize(String(input.uiAction || ''))
    const hits = new Set<Intent>()

    const wantsExtraction =
      input.hasDocument === true ||
      includesAny(uiAction, ['upload_document', 'document_uploaded', 'extract_document', 'process_document']) ||
      /\b(subo|adjunto|subi|subí|extrae|extraer|procesa|procesar|lee)\b/.test(normalized) && /\b(documento|pdf|archivo|escritura|acta|identificacion|identificación)\b/.test(normalized)
    if (wantsExtraction) hits.add('EXTRACT_DOCUMENT')

    const wantsGeneration =
      includesAny(uiAction, ['generate_document', 'finalize', 'finalize_preaviso']) ||
      /\b(genera|generar|finaliza|finalizar|emitir|crear)\b/.test(normalized) &&
        /\b(documento|preaviso|pdf|docx|version|versi[oó]n)\b/.test(normalized)
    if (wantsGeneration) hits.add('GENERATE_DOCUMENT')

    const asksQuestion =
      message.includes('?') ||
      /^\s*(que|qué|como|cómo|cual|cuál|cuando|cuándo|donde|dónde|por que|por qué|puedes|me puedes)\b/.test(normalized)
    if (asksQuestion) hits.add('QNA')

    const wantsStateUpdate =
      includesAny(uiAction, ['save_step', 'patch_step', 'update_state', 'update_field']) ||
      /\b(actualiza|actualizar|cambia|cambiar|corrige|corregir|modifica|modificar|agrega|agregar|quita|elimina|guardar)\b/.test(normalized) ||
      /\b(mi rfc es|mi curp es|mi nombre es|folio real es|domicilio es|direccion es|dirección es)\b/.test(normalized)
    if (wantsStateUpdate) hits.add('UPDATE_STATE')

    if (hits.size === 1) return [...hits][0]
    if (hits.size > 1 && hits.has('EXTRACT_DOCUMENT') && input.hasDocument) return 'EXTRACT_DOCUMENT'
    if (hits.size > 1 && hits.has('GENERATE_DOCUMENT') && includesAny(uiAction, ['generate_document', 'finalize'])) {
      return 'GENERATE_DOCUMENT'
    }

    if (hits.size === 0 || hits.size > 1) {
      try {
        return await this.deps.llmClient.classifyAmbiguous(input)
      } catch {
        return 'UNKNOWN'
      }
    }

    return 'UNKNOWN'
  }
}

function includesAny(source: string, values: string[]): boolean {
  return values.some((value) => source.includes(value))
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}
