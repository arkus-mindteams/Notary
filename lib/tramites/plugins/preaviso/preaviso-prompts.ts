import { StateDefinition } from '../../base/types'
import { DocumentoService } from '@/lib/services/documento-service'
import { KnowledgeChunkService, KnowledgeSnapshot } from '@/lib/services/knowledge-chunk-service'

export interface GeneratedPromptPackage {
  systemPrompts: string[]
  knowledgeSnapshot: KnowledgeSnapshot | null
}

export class PreavisoPrompts {
  static readonly CHAT_PROMPT_VERSION = 'preaviso.chat.v2.0.0'

  /**
   * Genera prompts de sistema para el asistente de Preaviso
   * usando knowledge chunks versionados + contexto dinámico mínimo.
   */
  static async generateSystemPrompts(
    context: any,
    pluginName: string,
    state: StateDefinition,
    missingNow: string[],
    systemDiagnostic: string
  ): Promise<GeneratedPromptPackage> {
    let ragContext = ''
    let ragChunkIds: string[] = []

    try {
      if (state.id !== 'ESTADO_8') {
        let query = ''
        const missing = missingNow

        if (missing.some(f => f.includes('folio_real') || f.includes('partidas') || f.includes('direccion'))) {
          query = 'antecedentes propiedad folio real partidas direccion ubicacion inmueble'
        } else if (missing.some(f => f.includes('vendedores'))) {
          query = 'vendedor titular registral propietario'
        } else if (missing.some(f => f.includes('compradores'))) {
          query = 'comprador adquirente generales identificacion'
        } else if (missing.some(f => f.includes('estado_civil'))) {
          query = 'estado civil matrimonio soltero casado'
        } else if (missing.some(f => f.includes('creditos'))) {
          query = 'precio forma de pago credito institucion bancaria'
        } else if (missing.some(f => f.includes('hipoteca') || f.includes('gravamen'))) {
          query = 'gravamen hipoteca certificado libertad gravamen'
        }

        if (query) {
          const sessionId = context.conversation_id || null
          const tramiteId = context.tramiteId || null
          const chunks = await DocumentoService.searchSimilarChunks(query, tramiteId, 0.5, 3, sessionId)
          if (chunks && chunks.length > 0) {
            const textFrom = (c: { text?: string; content?: string }) => c.text ?? c.content ?? ''
            ragChunkIds = chunks
              .map((c: any) => (typeof c?.id === 'string' ? c.id : null))
              .filter((id: string | null): id is string => Boolean(id))
            ragContext = [
              'RAG DOCUMENTAL (fragmentos de apoyo, no inventar):',
              ...chunks.map((c) => `- "${textFrom(c)}"`)
            ].join('\n')
          }
        }
      }
    } catch (err) {
      console.error('[PreavisoPrompts] RAG Error:', err)
    }

    const knowledge = await KnowledgeChunkService.buildKnowledgeContext({
      tramite: 'preaviso',
      scope: 'chat_generation',
      promptVersion: this.CHAT_PROMPT_VERSION,
      missingFields: missingNow
    })

    const systemPrompt = [
      `Eres un asistente legal notarial para ${pluginName}.`,
      '',
      'OBJETIVO: resolver faltantes críticos del trámite sin repetir preguntas innecesarias.',
      '',
      'DIAGNÓSTICO DEL SISTEMA (fuente de verdad):',
      systemDiagnostic,
      '',
      `ESTADO ACTUAL: ${state.name}`,
      `FALTANTES CRÍTICOS: ${JSON.stringify(missingNow)}`,
      '',
      'SINCRONIZACIÓN OBLIGATORIA:',
      '- Si el sistema marca un faltante crítico, debes pedirlo.',
      '- Si el sistema marca un campo como completo, no lo pidas de nuevo.',
      '',
      knowledge.promptContext,
      '',
      ragContext,
      '',
      'Responde en español, texto plano, con una sola respuesta útil por turno.'
    ].filter(Boolean).join('\n')

    return {
      systemPrompts: [systemPrompt],
      knowledgeSnapshot: {
        ...knowledge.snapshot,
        document_chunk_ids: ragChunkIds,
        model: process.env.OPENAI_MODEL || 'gpt-4o'
      }
    }
  }

  /**
   * Genera prompt del usuario (contexto mínimo + última intención)
   */
  static generateUserPrompt(
    context: any,
    conversationHistory: any[],
    missingNow: string[],
    isGreeting: boolean,
    hasMultipleFolios: boolean,
    folioCandidates: any[]
  ): string {
    const userInstruction = isGreeting
      ? `El usuario saludó (${conversationHistory[conversationHistory.length - 1]?.content}). Saluda de vuelta y continúa con el siguiente faltante.`
      : `Último mensaje del usuario: "${conversationHistory[conversationHistory.length - 1]?.content || ''}"`

    const folioHint = hasMultipleFolios
      ? `Hay múltiples folios detectados. Pregunta cuál folio usar de: ${folioCandidates.map((f: any) => typeof f === 'string' ? f : f.folio).join(', ')}.`
      : ''

    return [
      'Contexto actual:',
      JSON.stringify(context, null, 2),
      '',
      userInstruction,
      '',
      'Historial reciente (últimos 10 mensajes):',
      conversationHistory.slice(-10).map((m: any) => `${m.role}: ${m.content}`).join('\n'),
      '',
      folioHint,
      '',
      'Resumen de datos detectados:',
      `- Folio real: ${context.folios?.selection?.selected_folio || context.inmueble?.folio_real || 'No detectado'}`,
      `- Vendedor: ${context.vendedores?.[0]?.persona_fisica?.nombre || context.vendedores?.[0]?.persona_moral?.denominacion_social || 'No detectado'}`,
      `- Comprador: ${context.compradores?.[0]?.persona_fisica?.nombre || context.compradores?.[0]?.persona_moral?.denominacion_social || 'No detectado'}`,
      `- Estado civil comprador: ${context.compradores?.[0]?.persona_fisica?.estado_civil || 'No detectado'}`,
      `- Cónyuge comprador: ${context.compradores?.[0]?.persona_fisica?.conyuge?.nombre || 'No detectado'}`,
      `- Forma de pago: ${context.creditos === undefined ? 'No confirmada' : (context.creditos?.length === 0 ? 'Contado' : 'Crédito')}`,
      `- Institución de crédito: ${context.creditos?.[0]?.institucion || 'No detectada'}`,
      '',
      `Dato prioritario a resolver: ${missingNow[0] || 'ninguno'}`,
      '',
      'Instrucción de respuesta:',
      '- Responde la duda del usuario si existe.',
      '- Luego guía al siguiente dato faltante crítico.',
      '- Si no hay faltantes, confirma que puede generar el preaviso.'
    ].filter(Boolean).join('\n')
  }
}
