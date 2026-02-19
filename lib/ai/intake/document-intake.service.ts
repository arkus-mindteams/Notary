import { randomUUID } from 'crypto'
import { applyRules } from '@/lib/ai/rules/rule-engine'
import { ProviderFactory } from '@/lib/ai/providers/provider.factory'
import { DocumentIntakePersistenceService } from '@/lib/ai/intake/document-intake-persistence.service'
import {
  documentIntakeFactSchema,
  documentIntakeProviderResponseSchema,
  type DocumentIntakeBatchResult,
  type DocumentIntakeFact,
  type DocumentIntakeItem,
  type DocumentIntakeOptions,
  type FileInput,
} from '@/lib/ai/intake/document-intake.types'
import {
  buildDocumentIntakeRepairPrompt,
  buildDocumentIntakeSystemPrompt,
  buildDocumentIntakeUserPrompt,
} from '@/lib/ai/intake/document-intake.prompts'

const MAX_ATTEMPTS = 3

function sanitizeSnippet(text: string, max: number = 160): string {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max)
}

function extractRegexFact(
  pattern: RegExp,
  key: string,
  pageNumber: number,
  text: string,
  confidence: number
): DocumentIntakeFact | null {
  const match = text.match(pattern)
  if (!match?.[1]) return null
  const value = String(match[1]).trim()
  if (!value) return null
  const snippetSource = match[0] || value
  return {
    key,
    value,
    confidence,
    evidence: {
      pageNumber,
      snippet: sanitizeSnippet(snippetSource),
    },
  }
}

function addDerivedFacts(doc: DocumentIntakeItem): DocumentIntakeItem {
  const facts: DocumentIntakeFact[] = Array.isArray(doc.facts) ? [...doc.facts] : []
  const seen = new Set(facts.map((f) => `${f.key}:${f.value}:${f.evidence.pageNumber}`))

  const pushFact = (fact: DocumentIntakeFact | null) => {
    if (!fact) return
    const validated = documentIntakeFactSchema.safeParse(fact)
    if (!validated.success) return
    const dedupeKey = `${validated.data.key}:${validated.data.value}:${validated.data.evidence.pageNumber}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    facts.push(validated.data)
  }

  for (const page of doc.pages || []) {
    const txt = String(page.text || '')
    pushFact(extractRegexFact(/\b(?:INT\.?|UNIDAD|DEPTO|DEPARTAMENTO)\s*[:\-]?\s*([A-Z]?\d+[A-Z]?|\d+)\b/i, 'unidad', page.pageNumber, txt, 0.85))
    pushFact(extractRegexFact(/\bLETRA\s*[:\-]?\s*([A-Z])\b/i, 'letra_unidad', page.pageNumber, txt, 0.85))
    pushFact(extractRegexFact(/\bFOLIO(?:\s+REAL)?\s*[:#\-]?\s*([0-9]{5,})\b/i, 'folio_real', page.pageNumber, txt, 0.82))
  }

  return {
    ...doc,
    facts,
  }
}

export class DocumentIntakeService {
  async processBatch(args: {
    documents: FileInput[]
    traceId?: string | null
    options?: DocumentIntakeOptions
  }): Promise<DocumentIntakeBatchResult> {
    const traceId = String(args.traceId || randomUUID())
    const options = args.options || {}
    const provider = ProviderFactory.get(process.env.AI_PROVIDER || 'openai')

    let validationErrors: string[] = []
    let lastRawText = ''
    let providerResult: any = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const systemPrompt = buildDocumentIntakeSystemPrompt()
      const userPrompt =
        attempt === 1
          ? buildDocumentIntakeUserPrompt({
              traceId,
              files: args.documents,
              maxPages: options.maxPages,
            })
          : buildDocumentIntakeRepairPrompt({
              traceId,
              validationErrors,
              lastModelOutput: lastRawText,
            })

      try {
        providerResult = await provider.processDocuments({
          files: args.documents,
          traceId,
          systemPrompt,
          userPrompt,
        })
      } catch (error: any) {
        validationErrors = [String(error?.message || 'provider_error')]
        if (attempt < MAX_ATTEMPTS) continue
        throw error
      }

      lastRawText = String(providerResult?.rawText || '')

      const parsed = documentIntakeProviderResponseSchema.safeParse(providerResult?.result)
      if (!parsed.success) {
        validationErrors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
        if (attempt < MAX_ATTEMPTS) continue
        throw new Error(`AI_OUTPUT_INVALID: ${validationErrors.join(' | ')}`)
      }

      const documents = parsed.data.documents.map((d) => addDerivedFacts(d))
      const rules = applyRules(documents)
      const finalResult: DocumentIntakeBatchResult = {
        traceId,
        documents,
        rules,
      }

      await DocumentIntakePersistenceService.persistBatch({
        result: finalResult,
        storeChunks: options.storeChunks !== false,
        tramiteId: options.tramiteId || null,
        sessionId: options.sessionId || null,
      })

      return finalResult
    }

    throw new Error('AI_OUTPUT_INVALID: no se pudo obtener salida valida de intake')
  }
}

