import { createHash } from 'crypto'
import { createServerClient } from '@/lib/supabase'

export interface KnowledgeChunk {
  id: string
  tramite: string
  scope: string
  chunk_key: string
  title: string
  content: string
  version: string
  content_hash: string
  priority: number
  is_active: boolean
  metadata: Record<string, any>
}

export interface KnowledgeSnapshot {
  tramite: string
  scope: string
  prompt_version: string
  knowledge_version: string
  knowledge_hash: string
  knowledge_chunk_ids: string[]
  knowledge_chunk_keys: string[]
  document_chunk_ids?: string[]
  model?: string
  selected_at: string
  selection_reason: string
}

interface BuildKnowledgeOptions {
  tramite: string
  scope: string
  promptVersion: string
  missingFields?: string[]
}

interface BuildKnowledgeResult {
  promptContext: string
  snapshot: KnowledgeSnapshot
}

const FALLBACK_PREAVISO_CHAT_CHUNKS: KnowledgeChunk[] = [
  {
    id: 'fallback-persona-y-tono',
    tramite: 'preaviso',
    scope: 'chat_generation',
    chunk_key: 'persona_y_tono',
    title: 'Persona y tono del asistente',
    content:
      'Actúa como abogado notarial de confianza: profesional, claro y empático. Responde en texto plano. Si el usuario saluda, saluda de vuelta. Si pregunta algo, responde primero su duda y luego guía el siguiente dato faltante.',
    version: '2.0.0-fallback',
    content_hash: '',
    priority: 10,
    is_active: true,
    metadata: { tags: ['general', 'tono'], always_include: true }
  },
  {
    id: 'fallback-captura-inteligente',
    tramite: 'preaviso',
    scope: 'chat_generation',
    chunk_key: 'captura_inteligente',
    title: 'Reglas de captura inteligente',
    content:
      'Solo pide datos realmente faltantes según el estado del sistema. Si un dato ya existe en contexto o proviene de documento procesado, no lo vuelvas a pedir. Acepta datos fuera de orden y correcciones.',
    version: '2.0.0-fallback',
    content_hash: '',
    priority: 20,
    is_active: true,
    metadata: { tags: ['general', 'missing'], always_include: true }
  },
  {
    id: 'fallback-prohibiciones',
    tramite: 'preaviso',
    scope: 'chat_generation',
    chunk_key: 'prohibiciones',
    title: 'Preguntas prohibidas',
    content:
      'No preguntes por operación distinta de compraventa, firmantes/apoderados/representantes, estatus de autorización del crédito, tipo de crédito ni inmuebles adicionales fuera del folio seleccionado.',
    version: '2.0.0-fallback',
    content_hash: '',
    priority: 40,
    is_active: true,
    metadata: { tags: ['general', 'credito'], always_include: true }
  }
]

export class KnowledgeChunkService {
  private static inferTagsFromMissing(missingFields: string[] = []): string[] {
    const tags = new Set<string>(['general'])
    for (const field of missingFields) {
      const f = field.toLowerCase()
      if (f.includes('folio') || f.includes('partida') || f.includes('inmueble') || f.includes('direccion')) tags.add('inmueble')
      if (f.includes('vendedor')) tags.add('vendedores')
      if (f.includes('comprador') || f.includes('conyuge') || f.includes('estado_civil')) tags.add('compradores')
      if (f.includes('credito')) tags.add('credito')
      if (f.includes('gravamen') || f.includes('hipoteca')) tags.add('gravamen')
      if (f.includes('document')) tags.add('documentos')
    }
    return Array.from(tags)
  }

  private static computeHash(input: string): string {
    return createHash('sha256').update(input).digest('hex')
  }

  private static buildSnapshot(
    chunks: KnowledgeChunk[],
    options: BuildKnowledgeOptions,
    selectionReason: string
  ): KnowledgeSnapshot {
    const knowledgeVersion = Array.from(new Set(chunks.map((c) => c.version))).sort().join(',')
    const base = chunks
      .map((c) => `${c.id}|${c.chunk_key}|${c.version}|${c.content_hash || this.computeHash(c.content)}`)
      .join('||')

    return {
      tramite: options.tramite,
      scope: options.scope,
      prompt_version: options.promptVersion,
      knowledge_version: knowledgeVersion,
      knowledge_hash: this.computeHash(base),
      knowledge_chunk_ids: chunks.map((c) => c.id),
      knowledge_chunk_keys: chunks.map((c) => c.chunk_key),
      selected_at: new Date().toISOString(),
      selection_reason: selectionReason
    }
  }

  private static buildPromptContext(chunks: KnowledgeChunk[]): string {
    if (chunks.length === 0) {
      return ''
    }
    const lines = chunks.map((chunk, idx) => `${idx + 1}. [${chunk.chunk_key}] ${chunk.content}`)
    return [
      'KNOWLEDGE OFICIAL (fuente versionada):',
      ...lines
    ].join('\n')
  }

  private static selectChunks(chunks: KnowledgeChunk[], tags: string[]): KnowledgeChunk[] {
    if (chunks.length === 0) return []

    const always = chunks.filter((c) => c.metadata?.always_include === true)
    const tagged = chunks.filter((c) => {
      const chunkTags = Array.isArray(c.metadata?.tags) ? c.metadata.tags.map((t: string) => String(t).toLowerCase()) : []
      return chunkTags.some((tag: string) => tags.includes(tag))
    })

    const merged = [...always, ...tagged]
    const byId = new Map<string, KnowledgeChunk>()
    for (const chunk of merged) byId.set(chunk.id, chunk)

    const selected = Array.from(byId.values()).sort((a, b) => a.priority - b.priority)
    if (selected.length > 0) return selected.slice(0, 8)

    return chunks.sort((a, b) => a.priority - b.priority).slice(0, 5)
  }

  private static async getActiveChunks(tramite: string, scope: string): Promise<KnowledgeChunk[]> {
    try {
      const supabase = createServerClient()
      const { data, error } = await supabase
        .from('knowledge_chunks')
        .select('*')
        .eq('tramite', tramite)
        .eq('scope', scope)
        .eq('is_active', true)
        .order('priority', { ascending: true })

      if (error) {
        console.error('[KnowledgeChunkService] Error loading knowledge chunks:', error)
        return []
      }

      return (data || []) as KnowledgeChunk[]
    } catch (error) {
      console.error('[KnowledgeChunkService] Unexpected error loading knowledge chunks:', error)
      return []
    }
  }

  static async buildKnowledgeContext(options: BuildKnowledgeOptions): Promise<BuildKnowledgeResult> {
    const tags = this.inferTagsFromMissing(options.missingFields || [])
    const dbChunks = await this.getActiveChunks(options.tramite, options.scope)
    const sourceChunks =
      dbChunks.length > 0
        ? dbChunks
        : (options.tramite === 'preaviso' && options.scope === 'chat_generation'
          ? FALLBACK_PREAVISO_CHAT_CHUNKS
          : [])

    const selected = this.selectChunks(sourceChunks, tags)
    const selectionReason = `tags=${tags.join(',')};source=${dbChunks.length > 0 ? 'db' : 'fallback'}`
    const snapshot = this.buildSnapshot(selected, options, selectionReason)
    const promptContext = this.buildPromptContext(selected)

    return {
      promptContext,
      snapshot
    }
  }
}
