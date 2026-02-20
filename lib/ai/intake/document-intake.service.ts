import { randomUUID } from 'crypto'
import { applyRules } from '@/lib/ai/rules/rule-engine'
import { ProviderFactory } from '@/lib/ai/providers/provider.factory'
import { DocumentIntakePersistenceService } from '@/lib/ai/intake/document-intake-persistence.service'
import {
  documentIntakeFactSchema,
  documentIntakeProviderResponseSchema,
  type DocumentIntakeBatchResult,
  type DocumentDetectedType,
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
    pushFact(extractRegexFact(/\b(?:CORRESPONDE\s+AL\s+NUMERO|NUMERO\s+OFICIAL|NO\.?\s+OFICIAL|NUM\.?\s+OFICIAL)\s*[:\-]?\s*([0-9]{1,10})\b/i, 'numero_oficial', page.pageNumber, txt, 0.83))
    pushFact(extractRegexFact(/\b(?:INT\.?|UNIDAD|DEPTO|DEPARTAMENTO)\s*[:\-]?\s*([A-Z]?\d+[A-Z]?|\d+)\b/i, 'unidad', page.pageNumber, txt, 0.85))
    pushFact(extractRegexFact(/\bLETRA\s*[:\-]?\s*([A-Z])\b/i, 'letra_unidad', page.pageNumber, txt, 0.85))
    pushFact(extractRegexFact(/\bFOLIO(?:\s+REAL)?\s*[:#\-]?\s*([0-9]{5,})\b/i, 'folio_real', page.pageNumber, txt, 0.82))
  }

  return {
    ...doc,
    facts,
  }
}

function normalizeFilename(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferTypeFromFilename(filename: string): {
  suggestedType: DocumentDetectedType
  hintLabel: string
  strength: 'strong' | 'medium'
} | null {
  const name = normalizeFilename(filename)
  if (!name) return null

  if (/(acta.*matrimonio|matrimonio|contrayentes)/i.test(name)) {
    return { suggestedType: 'OTRO', hintLabel: 'ACTA_MATRIMONIO', strength: 'strong' }
  }
  if (/(acta.*nacimiento|nacimiento)/i.test(name)) {
    return { suggestedType: 'ACTA_NACIMIENTO', hintLabel: 'ACTA_NACIMIENTO', strength: 'strong' }
  }
  if (/(identificacion|credencial|ine)/i.test(name)) {
    return { suggestedType: 'INE', hintLabel: 'INE', strength: 'strong' }
  }
  if (/(estado.*cuenta|edo.*cuenta|cuenta.*banc)/i.test(name)) {
    return { suggestedType: 'ESTADO_CUENTA', hintLabel: 'ESTADO_CUENTA', strength: 'strong' }
  }
  if (/(comprobante|domicilio|boleta|predio|predial|agua|luz|cfe|telmex|servicios)/i.test(name)) {
    return { suggestedType: 'COMPROBANTE_DOMICILIO', hintLabel: 'COMPROBANTE_DOMICILIO', strength: 'medium' }
  }
  if (/(cedula.*fiscal|constancia.*fiscal|(^|[_. -])rfc([_. -]|$))/i.test(name)) {
    return { suggestedType: 'RFC', hintLabel: 'RFC', strength: 'strong' }
  }
  if (/(^|[_. -])curp([_. -]|$)/i.test(name)) {
    return { suggestedType: 'CURP', hintLabel: 'CURP', strength: 'strong' }
  }
  if (/(pasaporte)/i.test(name)) {
    return { suggestedType: 'PASAPORTE', hintLabel: 'PASAPORTE', strength: 'strong' }
  }
  if (/(licencia)/i.test(name)) {
    return { suggestedType: 'LICENCIA', hintLabel: 'LICENCIA', strength: 'strong' }
  }
  return null
}

function applyFilenameHint(doc: DocumentIntakeItem): DocumentIntakeItem {
  const hint = inferTypeFromFilename(doc.filename)
  if (!hint) return doc

  const issues = Array.isArray(doc.issues) ? [...doc.issues] : []
  const summary = Array.isArray(doc.summary) ? [...doc.summary] : []
  const keyFields = { ...(doc.keyFields || {}) }

  const pushIssue = (value: string) => {
    if (!issues.includes(value)) issues.push(value)
  }

  keyFields.filename_hint_type = hint.hintLabel
  keyFields.filename_hint_suggested_type = hint.suggestedType

  if (doc.detectedType === hint.suggestedType) {
    pushIssue(`filename_hint_match:${hint.hintLabel}`)
    return {
      ...doc,
      issues,
      keyFields,
    }
  }

  pushIssue(`filename_hint_conflict:model=${doc.detectedType},filename=${hint.hintLabel}`)

  // Regla conservadora:
  // - si la pista es fuerte, permitimos corregir con confianza <= 0.9
  // - si la pista es media, solo corregimos cuando el modelo esta en OTRO o confianza baja
  const shouldOverride =
    (hint.strength === 'strong' && doc.confidence <= 0.9) ||
    (hint.strength === 'medium' && (doc.detectedType === 'OTRO' || doc.confidence <= 0.75))

  if (!shouldOverride) {
    return {
      ...doc,
      issues,
      keyFields,
    }
  }

  if (summary.length < 6) {
    summary.push(`Pista por nombre de archivo: ${hint.hintLabel} (ajuste auxiliar).`)
  }

  return {
    ...doc,
    detectedType: hint.suggestedType,
    issues,
    summary,
    keyFields,
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

      const documents = parsed.data.documents
        .map((d) => addDerivedFacts(d))
        .map((d) => applyFilenameHint(d))
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

