import type { DocumentIntakeItem, RuleConflict, RuleMergedFactValue, RuleSuggestion } from '@/lib/ai/intake/document-intake.types'

export type RuleAccumulator = {
  mergedFacts: Record<string, RuleMergedFactValue>
  conflicts: RuleConflict[]
  suggestions: RuleSuggestion[]
}

export type IntakeRule = (documents: DocumentIntakeItem[], acc: RuleAccumulator) => void

function normalizeValue(value: string): string {
  return String(value || '').trim().toUpperCase()
}

function normalizePersonName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function similarityByTokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizePersonName(a).split(' ').filter((t) => t.length >= 2))
  const tb = new Set(normalizePersonName(b).split(' ').filter((t) => t.length >= 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) {
    if (tb.has(t)) inter += 1
  }
  const denom = Math.max(ta.size, tb.size)
  return denom > 0 ? inter / denom : 0
}

export const unitLetterRule: IntakeRule = (documents, acc) => {
  const values = new Map<string, { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[]>()
  for (const doc of documents) {
    for (const fact of doc.facts || []) {
      if (fact.key !== 'unidad' && fact.key !== 'letra_unidad') continue
      const k = fact.key
      const list = values.get(k) || []
      list.push({
        value: fact.value,
        source: doc.documentId,
        pageNumber: fact.evidence.pageNumber,
        snippet: fact.evidence.snippet,
        confidence: fact.confidence,
      })
      values.set(k, list)
    }
  }

  for (const [key, sourceValues] of values.entries()) {
    if (sourceValues.length === 0) continue
    const unique = Array.from(new Set(sourceValues.map((x) => normalizeValue(x.value))))
    const dominant = sourceValues.sort((a, b) => b.confidence - a.confidence)[0]
    acc.mergedFacts[key] = {
      value: dominant.value,
      sources: sourceValues.map((x) => ({
        documentId: x.source,
        pageNumber: x.pageNumber,
        snippet: x.snippet,
        confidence: x.confidence,
      })),
    }
    if (unique.length > 1) {
      acc.conflicts.push({
        key,
        values: Array.from(new Set(sourceValues.map((x) => x.value))),
        sources: sourceValues.map((x) => ({
          documentId: x.source,
          value: x.value,
          pageNumber: x.pageNumber,
          snippet: x.snippet,
        })),
      })
      acc.suggestions.push({
        message: `Conflicto detectado en ${key}. Validar con usuario antes de mutar estado.`,
        sources: Array.from(new Set(sourceValues.map((x) => x.source))),
      })
    }
  }
}

export const folioRealRule: IntakeRule = (documents, acc) => {
  const folioFacts: { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[] = []
  for (const doc of documents) {
    for (const fact of doc.facts || []) {
      if (fact.key !== 'folio_real') continue
      folioFacts.push({
        value: fact.value,
        source: doc.documentId,
        pageNumber: fact.evidence.pageNumber,
        snippet: fact.evidence.snippet,
        confidence: fact.confidence,
      })
    }
  }

  if (folioFacts.length === 0) return

  const unique = Array.from(new Set(folioFacts.map((x) => normalizeValue(x.value))))
  const folioSources = folioFacts.map((x) => ({
    documentId: x.source,
    pageNumber: x.pageNumber,
    snippet: x.snippet,
    confidence: x.confidence,
  }))

  // Siempre listar candidatos detectados para que el usuario pueda confirmar.
  acc.mergedFacts.folio_real_candidates = {
    value: unique.join(','),
    sources: folioSources,
  }

  if (unique.length === 1) {
    const dominant = [...folioFacts].sort((a, b) => b.confidence - a.confidence)[0]
    acc.mergedFacts.folio_real = {
      value: dominant.value,
      sources: folioSources,
    }
    return
  }

  if (unique.length > 1) {
    acc.conflicts.push({
      key: 'folio_real',
      values: Array.from(new Set(folioFacts.map((x) => x.value))),
      sources: folioFacts.map((x) => ({
        documentId: x.source,
        value: x.value,
        pageNumber: x.pageNumber,
        snippet: x.snippet,
      })),
    })
    acc.suggestions.push({
      message: 'Se detectaron varios folios reales. Listar candidatos y pedir confirmacion del usuario antes de asignar folio_real.',
      sources: Array.from(new Set(folioFacts.map((x) => x.source))),
    })
  }
}

export const officialNumberUnitLetterRule: IntakeRule = (documents, acc) => {
  const numeroOficial = new Map<string, { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[]>()
  const unidadValues = new Map<string, { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[]>()
  const letraValues = new Map<string, { value: string; source: string; pageNumber: number; snippet: string; confidence: number }[]>()

  for (const doc of documents) {
    for (const fact of doc.facts || []) {
      const item = {
        value: fact.value,
        source: doc.documentId,
        pageNumber: fact.evidence.pageNumber,
        snippet: fact.evidence.snippet,
        confidence: fact.confidence,
      }
      if (fact.key === 'numero_oficial') {
        const list = numeroOficial.get('numero_oficial') || []
        list.push(item)
        numeroOficial.set('numero_oficial', list)
      } else if (fact.key === 'unidad') {
        const list = unidadValues.get('unidad') || []
        list.push(item)
        unidadValues.set('unidad', list)
      } else if (fact.key === 'letra_unidad') {
        const list = letraValues.get('letra_unidad') || []
        list.push(item)
        letraValues.set('letra_unidad', list)
      }
    }
  }

  const numeros = numeroOficial.get('numero_oficial') || []
  if (numeros.length > 0) {
    const dominant = [...numeros].sort((a, b) => b.confidence - a.confidence)[0]
    acc.mergedFacts.numero_oficial = {
      value: dominant.value,
      sources: numeros.map((x) => ({
        documentId: x.source,
        pageNumber: x.pageNumber,
        snippet: x.snippet,
        confidence: x.confidence,
      })),
    }
  }

  const hasUnidad = (unidadValues.get('unidad') || []).length > 0
  const hasLetra = (letraValues.get('letra_unidad') || []).length > 0
  const folioConflict = acc.conflicts.some((c) => c.key === 'folio_real')
  if (numeros.length > 0 && hasUnidad && hasLetra && folioConflict) {
    acc.suggestions.push({
      message: 'Se detecto huella de inmueble (numero_oficial + unidad + letra). Usar esta huella para elegir folio_real con confirmacion del usuario.',
      sources: Array.from(new Set([
        ...numeros.map((x) => x.source),
        ...(unidadValues.get('unidad') || []).map((x) => x.source),
        ...(letraValues.get('letra_unidad') || []).map((x) => x.source),
      ])),
    })
  }
}

export const ownerVsIdentificationRule: IntakeRule = (documents, acc) => {
  const ownerCandidates: Array<{
    value: string
    source: string
    pageNumber: number
    snippet: string
    confidence: number
  }> = []
  const idCandidates: Array<{
    value: string
    source: string
    pageNumber: number
    snippet: string
    confidence: number
  }> = []

  for (const doc of documents) {
    const detected = String(doc.detectedType || '').toUpperCase()
    // Para PoC usamos facts y keyFields; el intake puede etiquetar inscripcion como OTRO.
    for (const fact of doc.facts || []) {
      const key = String(fact.key || '').toLowerCase()
      if (['propietario', 'titular_registral', 'nombre_propietario', 'vendedor_nombre'].includes(key)) {
        ownerCandidates.push({
          value: fact.value,
          source: doc.documentId,
          pageNumber: fact.evidence.pageNumber,
          snippet: fact.evidence.snippet,
          confidence: fact.confidence,
        })
      }
      if (['nombre', 'nombre_identificacion', 'titular', 'persona_nombre'].includes(key)) {
        idCandidates.push({
          value: fact.value,
          source: doc.documentId,
          pageNumber: fact.evidence.pageNumber,
          snippet: fact.evidence.snippet,
          confidence: fact.confidence,
        })
      }
    }

    const keyFields = (doc.keyFields && typeof doc.keyFields === 'object') ? (doc.keyFields as Record<string, any>) : {}
    const ownerFromKeyFields = String(
      keyFields.propietario || keyFields.titular_registral || keyFields.nombre_propietario || ''
    ).trim()
    if (ownerFromKeyFields) {
      ownerCandidates.push({
        value: ownerFromKeyFields,
        source: doc.documentId,
        pageNumber: 1,
        snippet: ownerFromKeyFields,
        confidence: doc.confidence || 0.7,
      })
    }

    const isIdentificationType = ['INE', 'PASAPORTE', 'LICENCIA', 'CURP', 'RFC'].includes(detected)
    const nameFromKeyFields = String(keyFields.nombre || '').trim()
    if (isIdentificationType && nameFromKeyFields) {
      idCandidates.push({
        value: nameFromKeyFields,
        source: doc.documentId,
        pageNumber: 1,
        snippet: nameFromKeyFields,
        confidence: doc.confidence || 0.7,
      })
    }
  }

  if (ownerCandidates.length === 0) return

  const owner = [...ownerCandidates].sort((a, b) => b.confidence - a.confidence)[0]
  acc.mergedFacts.vendedor_nombre = {
    value: owner.value,
    sources: ownerCandidates.map((x) => ({
      documentId: x.source,
      pageNumber: x.pageNumber,
      snippet: x.snippet,
      confidence: x.confidence,
    })),
  }

  if (idCandidates.length === 0) {
    acc.suggestions.push({
      message: 'No se detecto identificacion para validar coincidencia con propietario (vendedor).',
      sources: Array.from(new Set(ownerCandidates.map((x) => x.source))),
    })
    return
  }

  const matches = idCandidates.filter((idc) => {
    const sim = similarityByTokenOverlap(owner.value, idc.value)
    return sim >= 0.6
  })

  if (matches.length === 0) {
    acc.conflicts.push({
      key: 'vendedor_identidad',
      values: Array.from(new Set([owner.value, ...idCandidates.map((x) => x.value)])),
      sources: [
        ...ownerCandidates.map((x) => ({
          documentId: x.source,
          value: x.value,
          pageNumber: x.pageNumber,
          snippet: x.snippet,
        })),
        ...idCandidates.map((x) => ({
          documentId: x.source,
          value: x.value,
          pageNumber: x.pageNumber,
          snippet: x.snippet,
        })),
      ],
    })
    acc.suggestions.push({
      message: 'El propietario de inscripcion no coincide con nombres de identificacion. Confirmar vendedor.',
      sources: Array.from(new Set([...ownerCandidates.map((x) => x.source), ...idCandidates.map((x) => x.source)])),
    })
  } else {
    acc.suggestions.push({
      message: 'Coincidencia detectada entre propietario de inscripcion e identificacion del vendedor.',
      sources: Array.from(new Set([...ownerCandidates.map((x) => x.source), ...matches.map((x) => x.source)])),
    })
  }
}

export const rulesRegistry: IntakeRule[] = [
  unitLetterRule,
  folioRealRule,
  officialNumberUnitLetterRule,
  ownerVsIdentificationRule,
]

