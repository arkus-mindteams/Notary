import { ActivityLogService } from '@/lib/services/activity-log-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { computePreavisoState } from '@/lib/preaviso-state'
import { PreavisoWizardStateService } from '@/lib/services/preaviso-wizard-state-service'

type ProposedUpdate = {
  op?: string
  path?: string
  value?: unknown
  reason?: string
}

const ALLOWED_PATHS = [
  /^compradores\[\d+\]\.persona_fisica\.nombre$/,
  /^compradores\[\d+\]\.persona_fisica\.rfc$/,
  /^compradores\[\d+\]\.persona_fisica\.curp$/,
  /^compradores\[\d+\]\.persona_moral\.rfc$/,
  /^compradores\[\d+\]\.persona_fisica\.estado_civil$/,
  /^compradores\[\d+\]\.tipo_persona$/,
  /^compradores\[\d+\]\.persona_fisica\.conyuge\.nombre$/,
  /^compradores\[\d+\]\.persona_moral\.denominacion_social$/,
  /^vendedores\[\d+\]\.tipo_persona$/,
  /^vendedores\[\d+\]\.persona_fisica\.nombre$/,
  /^vendedores\[\d+\]\.persona_fisica\.rfc$/,
  /^vendedores\[\d+\]\.persona_fisica\.curp$/,
  /^vendedores\[\d+\]\.persona_moral\.rfc$/,
  /^vendedores\[\d+\]\.persona_moral\.denominacion_social$/,
  /^creditos$/,
  /^creditos\[\d+\]\.institucion$/,
  /^creditos\[\d+\]\.participantes$/,
  /^inmueble\.folio_real$/,
  /^inmueble\.existe_hipoteca$/,
  /^inmueble\.partidas$/,
  /^inmueble\.direccion$/,
  /^inmueble\.direccion\.(calle|numero|colonia|municipio|estado|codigo_postal)$/,
  /^gravamenes$/,
  /^gravamenes\[\d+\]\.institucion$/,
  /^gravamenes\[\d+\]\.cancelacion_confirmada$/,
  /^actosNotariales\.aperturaCreditoComprador$/,
  /^actosNotariales\.cancelacionCreditoVendedor$/,
]

export class ProposedUpdateDomainViolationError extends Error {
  code = 'DOMAIN_RULE_VIOLATION'
}

export class PreavisoProposedUpdateService {
  static inspectCommitPaths(proposedUpdates: ProposedUpdate[]): {
    attempted_paths: string[]
    path_checks: Array<{ path: string; normalized_path: string; allowlist_match: boolean }>
    rejected_path: string | null
  } {
    const checks = (Array.isArray(proposedUpdates) ? proposedUpdates : []).map((raw) => {
      const path = String(raw?.path || '')
      const normalized_path = normalizeCommitPath(path)
      const allowlist_match = Boolean(normalized_path) && isAllowedPath(normalized_path)
      return { path, normalized_path, allowlist_match }
    })
    const rejected = checks.find((c) => c.normalized_path && !c.allowlist_match) || null
    return {
      attempted_paths: checks.map((c) => c.normalized_path || c.path).filter(Boolean),
      path_checks: checks,
      rejected_path: rejected?.normalized_path || null,
    }
  }

  static async commit(args: {
    tramiteId: string
    userId: string
    traceId: string
    proposedUpdates: ProposedUpdate[]
    source?: 'manual' | 'auto' | string
  }): Promise<{
    applied_updates: number
    data: any
    state: {
      current_state: string
      state_status: Record<string, string>
      required_missing: string[]
      blocking_reasons: string[]
      allowed_actions: string[]
      wizard_state: ReturnType<typeof PreavisoWizardStateService.fromSnapshot>
    }
  }> {
    if (!Array.isArray(args.proposedUpdates) || args.proposedUpdates.length === 0) {
      throw new ProposedUpdateDomainViolationError('No hay proposed_updates para aplicar')
    }

    const tramite = await TramiteService.findTramiteById(args.tramiteId)
    if (!tramite) {
      throw new ProposedUpdateDomainViolationError('Tramite no encontrado')
    }
    if (tramite.tipo !== 'preaviso') {
      throw new ProposedUpdateDomainViolationError('Solo se permite commit de propuestas para tramite preaviso')
    }

    const currentData = isPlainObject(tramite.datos) ? deepClone(tramite.datos) : {}
    let applied = 0
    const appliedEntries: Array<{ path: string; previous_value: unknown; new_value: unknown }> = []
    const institutionValidationCache = new Map<string, { valid: boolean; canonical_name: string | null; confidence: number }>()

    for (const raw of args.proposedUpdates) {
      const op = String(raw?.op || '').trim().toLowerCase()
      const path = normalizeCommitPath(String(raw?.path || '').trim())
      if (op !== 'set') continue
      if (!path) continue
      if (!isAllowedPath(path)) {
        throw new ProposedUpdateDomainViolationError(`Path no permitido para commit: ${path}`)
      }
      let candidateValue: unknown = raw?.value
      if (/^creditos\[\d+\]\.institucion$/.test(path)) {
        const rawInstitution = String(candidateValue || '').trim()
        const cacheKey = rawInstitution.toLowerCase()
        const verdict =
          institutionValidationCache.get(cacheKey) ||
          (await classifyCreditInstitutionForCommit(rawInstitution))
        institutionValidationCache.set(cacheKey, verdict)
        if (!verdict.valid) {
          continue
        }
        candidateValue = verdict.canonical_name || rawInstitution
      }
      if (!isMeaningfulValueForPath(path, candidateValue)) {
        continue
      }
      const previousValue = deepCloneSafe(getByPath(currentData, path))
      setByPath(currentData, path, candidateValue)
      applied += 1
      appliedEntries.push({
        path,
        previous_value: previousValue,
        new_value: deepCloneSafe(candidateValue),
      })
    }

    if (applied === 0) {
      throw new ProposedUpdateDomainViolationError('No hubo updates aplicables en proposed_updates')
    }

    normalizeDerivedPreavisoData(currentData, args.proposedUpdates)

    const updated = await TramiteService.updateTramite(args.tramiteId, {
      datos: currentData,
    })

    const computed = computePreavisoState(updated.datos || {})
    const wizardState = PreavisoWizardStateService.fromSnapshot(
      computed.state.current_state,
      computed.state.state_status,
      computed.state.required_missing,
      computed.state.blocking_reasons
    )

    await ActivityLogService.logUserEvent({
      userId: args.userId,
      tramiteId: args.tramiteId,
      eventType: 'proposed_updates_commit',
      metadata: {
        trace_id: args.traceId,
        source: String(args.source || 'auto'),
        updated_at: new Date().toISOString(),
        applied_updates: applied,
        paths: args.proposedUpdates.map((x) => String(x.path || '')).filter(Boolean),
        applied_entries: appliedEntries,
      },
    })

    return {
      applied_updates: applied,
      data: updated.datos || {},
      state: {
        current_state: computed.state.current_state,
        state_status: computed.state.state_status,
        required_missing: computed.state.required_missing,
        blocking_reasons: computed.state.blocking_reasons,
        allowed_actions: computed.state.allowed_actions,
        wizard_state: wizardState,
      },
    }
  }
}

function getByPath(target: Record<string, any>, path: string): unknown {
  const segments = parsePath(path)
  let node: any = target
  for (const segment of segments) {
    if (node === null || node === undefined) return undefined
    if (typeof segment === 'number') {
      if (!Array.isArray(node)) return undefined
      node = node[segment]
      continue
    }
    node = node[segment]
  }
  return node
}

function deepCloneSafe<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function setByPath(target: Record<string, any>, path: string, value: unknown) {
  const segments = parsePath(path)
  if (segments.length === 0) return

  let node: any = target
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    const nextKey = segments[i + 1]
    if (typeof key === 'number') {
      if (!Array.isArray(node)) {
        throw new ProposedUpdateDomainViolationError(`Path invalido: ${path}`)
      }
      if (node[key] === undefined || node[key] === null) {
        node[key] = typeof nextKey === 'number' ? [] : {}
      } else if (typeof nextKey !== 'number' && !isPlainObject(node[key])) {
        if (typeof node[key] === 'string') {
          const institucion = String(node[key] || '').trim() || null
          node[key] = { institucion, cancelacion_confirmada: null }
        } else {
          node[key] = {}
        }
      }
      node = node[key]
      continue
    }

    if (typeof nextKey === 'number') {
      if (!Array.isArray(node[key])) {
        node[key] = []
      }
    } else if (!isPlainObject(node[key])) {
      node[key] = {}
    }
    node = node[key]
  }

  const last = segments[segments.length - 1]
  if (typeof last === 'number') {
    if (!Array.isArray(node)) {
      throw new ProposedUpdateDomainViolationError(`Path invalido: ${path}`)
    }
    node[last] = value
    return
  }

  node[last] = value
}

function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = []
  const regex = /([^[.\]]+)|\[(\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(path)) !== null) {
    if (match[1]) out.push(match[1])
    if (match[2]) out.push(Number(match[2]))
  }
  return out
}

function isMeaningfulValueForPath(path: string, value: unknown): boolean {
  if (value === null || value === undefined) return false

  if (path === 'creditos') {
    return Array.isArray(value)
  }

  if (/^creditos\[\d+\]\.participantes$/.test(path)) {
    return Array.isArray(value) && value.length > 0
  }

  if (path === 'inmueble.partidas') {
    return Array.isArray(value) && value.some((item) => String(item ?? '').trim().length > 0)
  }

  if (path === 'inmueble.direccion') {
    return isPlainObject(value)
  }

  if (path === 'gravamenes') {
    return Array.isArray(value)
  }
  if (/^gravamenes\[\d+\]\.cancelacion_confirmada$/.test(path)) {
    return typeof value === 'boolean'
  }
  if (/^gravamenes\[\d+\]\.institucion$/.test(path)) {
    return typeof value === 'string' && value.trim().length > 2
  }

  const str = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (!str) return false

  if (path === 'inmueble.folio_real') {
    const digits = str.replace(/\D/g, '')
    return digits.length >= 5
  }

  if (/\.persona_fisica\.nombre$/.test(path)) {
    const letters = (str.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length
    return letters >= 4
  }

  if (/^(compradores|vendedores)\[\d+\]\.persona_moral\.denominacion_social$/.test(path)) {
    return str.length >= 4
  }

  if (/\.persona_fisica\.rfc$/.test(path)) {
    const normalized = str.toUpperCase().replace(/\s+/g, '')
    return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(normalized)
  }

  if (/\.persona_fisica\.curp$/.test(path)) {
    const normalized = str.toUpperCase().replace(/\s+/g, '')
    return /^[A-Z][AEIOU][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(normalized)
  }

  if (/^creditos\[\d+\]\.institucion$/.test(path)) {
    const normalized = str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (normalized.length < 3) return false
    if (/(?:inciso|articulo|noveno|terminos del|el cual se otorga|de la presente)/.test(normalized)) return false
    if (/^(institucion|institucion financiera|entidad|banco|credito|financiamiento)$/.test(normalized)) return false
    if (/^(por confirmar|desconocido|pendiente|n\/a|na|null)$/.test(normalized)) return false
    return true
  }

  return true
}

async function classifyCreditInstitutionForCommit(
  value: string
): Promise<{ valid: boolean; canonical_name: string | null; confidence: number }> {
  const fallback = basicCreditInstitutionHeuristic(value)
  const apiKey =
    process.env.GMI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  if (!apiKey) {
    return {
      valid: fallback,
      canonical_name: fallback ? value.trim() : null,
      confidence: fallback ? 0.55 : 0,
    }
  }

  const model = process.env.GMI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const payload = {
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 140,
      responseSchema: {
        type: 'OBJECT',
        additionalProperties: false,
        properties: {
          is_financial_institution: { type: 'BOOLEAN' },
          canonical_name: { type: 'STRING', nullable: true },
          confidence: { type: 'NUMBER' },
        },
        required: ['is_financial_institution'],
      },
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              'SYSTEM:',
              'Eres un clasificador de instituciones financieras para tramites notariales en Mexico. Responde SOLO JSON.',
              '',
              'PAYLOAD:',
              JSON.stringify({
                candidate_text: value,
                locale: 'mx',
                domain: 'preaviso_notarial_credito',
                rules: [
                  'Valida si el texto representa una institucion financiera real.',
                  'Rechaza frases legales/genericas y texto narrativo.',
                  'Si es valida, regresa canonical_name limpio.',
                ],
              }),
            ].join('\n'),
          },
        ],
      },
    ],
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error(`gmi_status_${resp.status}`)
    const data = await resp.json().catch(() => ({}))
    let text = extractGeminiText(data).trim()
    if (!text) throw new Error('empty_response')
    if (text.startsWith('```')) {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (match?.[1]) text = match[1]
    }
    const parsed = JSON.parse(text)
    const valid = parsed?.is_financial_institution === true
    const confidence = Number(parsed?.confidence ?? 0)
    const canonicalName = String(parsed?.canonical_name || '').trim() || null
    if (!valid || confidence < Number(process.env.GMI_INSTITUTION_CONFIDENCE || 0.6)) {
      return { valid: false, canonical_name: null, confidence }
    }
    return { valid: true, canonical_name: canonicalName || value.trim(), confidence }
  } catch {
    return {
      valid: fallback,
      canonical_name: fallback ? value.trim() : null,
      confidence: fallback ? 0.55 : 0,
    }
  }
}

function basicCreditInstitutionHeuristic(value: string): boolean {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || normalized.length < 3) return false
  if (/(?:inciso|articulo|noveno|terminos del|el cual se otorga|de la presente)/.test(normalized)) return false
  if (/^(institucion|institucion financiera|entidad|banco|credito|financiamiento)$/.test(normalized)) return false
  if (/^(por confirmar|desconocido|pendiente|n\/a|na|null)$/.test(normalized)) return false
  return true
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) {
    const text = parts
      .map((part: any) => String(part?.text || ''))
      .join('\n')
      .trim()
    if (text) return text
  }
  return ''
}

function normalizeCommitPath(path: string): string {
  const raw = String(path || '').trim()
  if (!raw) return raw
  if (raw === 'compradores[].nombre') return 'compradores[0].persona_fisica.nombre'
  if (raw === 'compradores[].tipo_persona') return 'compradores[0].tipo_persona'
  if (raw === 'compradores[].persona_moral.denominacion_social') return 'compradores[0].persona_moral.denominacion_social'
  if (raw === 'vendedores[].nombre') return 'vendedores[0].persona_fisica.nombre'
  if (raw === 'vendedores[].tipo_persona') return 'vendedores[0].tipo_persona'
  if (raw === 'vendedores[].persona_moral.denominacion_social') return 'vendedores[0].persona_moral.denominacion_social'
  if (raw === 'compradores[].persona_fisica.conyuge.nombre') return 'compradores[0].persona_fisica.conyuge.nombre'
  if (raw === 'creditos[].institucion') return 'creditos[0].institucion'
  if (raw === 'creditos[].participantes[]') return 'creditos[0].participantes'
  if (raw === 'creditos[].participantes') return 'creditos[0].participantes'
  if (raw === 'creditos[]') return 'creditos'
  if (raw === 'existencia_credito') return 'actosNotariales.aperturaCreditoComprador'
  if (raw === 'gravamenes[]') return 'gravamenes'
  if (raw === 'inmueble.hipoteca') return 'inmueble.existe_hipoteca'
  if (raw === 'inmueble.partidas[]') return 'inmueble.partidas'
  return raw
}

function normalizeDerivedPreavisoData(data: Record<string, any>, updates: ProposedUpdate[]) {
  const touchedPaths = new Set(
    (updates || [])
      .map((u) => normalizeCommitPath(String(u?.path || '').trim()))
      .filter(Boolean)
  )

  normalizeBuyerNameAliases(data, touchedPaths)
  normalizeCreditosConsistency(data, touchedPaths)
  normalizeGravamenesConsistency(data, touchedPaths)

  if (!touchedPaths.has('inmueble.folio_real')) return

  const inmueble = isPlainObject(data.inmueble) ? { ...(data.inmueble as Record<string, unknown>) } : {}
  const folioRaw = String((inmueble as any).folio_real || '').trim()
  const folioDigits = folioRaw.replace(/\D/g, '')
  const selectedFolio = folioDigits || folioRaw
  if (!selectedFolio) return

  ;(inmueble as any).folio_real = selectedFolio
  ;(inmueble as any).folio_real_confirmed = true
  data.inmueble = inmueble

  const prevFolios = isPlainObject(data.folios) ? (data.folios as Record<string, unknown>) : {}
  const prevSelection = isPlainObject((prevFolios as any).selection)
    ? ((prevFolios as any).selection as Record<string, unknown>)
    : {}

  data.folios = {
    ...prevFolios,
    selection: {
      ...prevSelection,
      selected_folio: selectedFolio,
      confirmed_by_user: true,
    },
  }

  enrichInmuebleFromSelectedFolioCandidate(data, selectedFolio)
}

function normalizeGravamenesConsistency(data: Record<string, any>, touchedPaths: Set<string>) {
  const touchedGravamenes =
    touchedPaths.has('gravamenes') ||
    Array.from(touchedPaths).some((path) => path.startsWith('gravamenes['))
  if (!touchedGravamenes) return
  if (!Array.isArray(data.gravamenes)) {
    data.gravamenes = []
    return
  }
  data.gravamenes = (data.gravamenes as any[])
    .map((item) => {
      if (typeof item === 'string') {
        const institucion = item.trim()
        if (!institucion) return null
        return { institucion, cancelacion_confirmada: null }
      }
      if (isPlainObject(item)) {
        const institucionRaw = (item as any).institucion
        const institucion = typeof institucionRaw === 'string' ? institucionRaw.trim() : null
        const cancelacion =
          typeof (item as any).cancelacion_confirmada === 'boolean'
            ? (item as any).cancelacion_confirmada
            : null
        if (!institucion && cancelacion === null) return null
        return { ...item, institucion, cancelacion_confirmada: cancelacion }
      }
      return null
    })
    .filter(Boolean)
}

function normalizeCreditosConsistency(data: Record<string, any>, touchedPaths: Set<string>) {
  const touchedCreditos =
    touchedPaths.has('creditos') ||
    Array.from(touchedPaths).some((path) => path.startsWith('creditos['))
  if (!touchedCreditos) return

  if (!Array.isArray(data.creditos)) {
    data.creditos = []
  }

  data.actosNotariales = {
    ...(isPlainObject(data.actosNotariales) ? data.actosNotariales : {}),
    aperturaCreditoComprador: data.creditos.length > 0,
  }
}

function normalizeBuyerNameAliases(data: Record<string, any>, touchedPaths: Set<string>) {
  for (const path of touchedPaths) {
    const match = path.match(/^compradores\[(\d+)\]\.persona_fisica\.nombre$/)
    if (!match) continue
    const index = Number(match[1])
    if (!Number.isFinite(index) || index < 0) continue

    const buyers = Array.isArray(data.compradores) ? data.compradores : []
    const buyer = isPlainObject(buyers[index]) ? { ...buyers[index] } : {}
    const persona = isPlainObject((buyer as any).persona_fisica) ? { ...((buyer as any).persona_fisica as Record<string, any>) } : {}
    const rawName = String(persona.nombre || '').trim()
    if (!rawName) continue

    const resolved = resolveRoleAliasToDetectedParty(rawName, data)
    if (resolved) {
      persona.nombre = resolved.buyerName
      persona.estado_civil = persona.estado_civil || 'casado'
      if (resolved.spouseName) {
        const prevConyuge = isPlainObject(persona.conyuge) ? (persona.conyuge as Record<string, any>) : {}
        persona.conyuge = {
          ...prevConyuge,
          nombre: resolved.spouseName,
          rfc: prevConyuge.rfc ?? null,
          curp: prevConyuge.curp ?? null,
          participa: prevConyuge.participa ?? false,
        }
      }
      removeUnclassifiedDetectedNames(data, [resolved.buyerName, resolved.spouseName || null])
    } else if (isRoleAliasInsteadOfName(rawName)) {
      delete persona.nombre
    }

    ;(buyer as any).tipo_persona = (buyer as any).tipo_persona || 'persona_fisica'
    ;(buyer as any).persona_fisica = persona
    buyers[index] = buyer
    data.compradores = buyers
  }
}

function resolveRoleAliasToDetectedParty(
  inputName: string,
  data: Record<string, any>
): { buyerName: string; spouseName: string | null } | null {
  if (!isRoleAliasInsteadOfName(inputName)) return null
  const normalized = normalizeText(inputName)
  const spouses = normalizeDetectedSpouses(data)
  if (spouses.length === 0) return null

  const male = spouses.find((p) => p.sexo === 'hombre') || null
  const female = spouses.find((p) => p.sexo === 'mujer') || null

  if (/\b(esposo|hombre)\b/.test(normalized)) {
    const buyer = male || spouses[0]
    const spouse = spouses.find((p) => p.nombre !== buyer.nombre) || null
    return { buyerName: buyer.nombre, spouseName: spouse?.nombre || null }
  }

  if (/\b(esposa|mujer)\b/.test(normalized)) {
    const buyer = female || spouses[0]
    const spouse = spouses.find((p) => p.nombre !== buyer.nombre) || null
    return { buyerName: buyer.nombre, spouseName: spouse?.nombre || null }
  }

  if (/\bconyuge\b/.test(normalized)) {
    if (spouses.length === 1) return { buyerName: spouses[0].nombre, spouseName: null }
    const buyer = spouses[0]
    const spouse = spouses[1]
    return { buyerName: buyer.nombre, spouseName: spouse?.nombre || null }
  }

  return null
}

function normalizeDetectedSpouses(data: Record<string, any>): Array<{ nombre: string; sexo: 'hombre' | 'mujer' | null }> {
  const raw = Array.isArray(data?.conyuges_detectados) ? data.conyuges_detectados : []
  return raw
    .map((item: any) => {
      const nombre = String(item?.nombre || item?.name || '').trim()
      if (!nombre) return null
      const sexoRaw = normalizeText(String(item?.sexo || ''))
      const sexo =
        sexoRaw === 'hombre' || sexoRaw === 'masculino'
          ? 'hombre'
          : sexoRaw === 'mujer' || sexoRaw === 'femenino'
            ? 'mujer'
            : null
      return { nombre, sexo }
    })
    .filter(Boolean) as Array<{ nombre: string; sexo: 'hombre' | 'mujer' | null }>
}

function removeUnclassifiedDetectedNames(data: Record<string, any>, names: Array<string | null>) {
  if (!Array.isArray(data?.personas_detectadas_no_clasificadas)) return
  const toRemove = new Set(
    names
      .map((n) => normalizeText(String(n || '')))
      .filter(Boolean)
  )
  if (toRemove.size === 0) return
  data.personas_detectadas_no_clasificadas = (data.personas_detectadas_no_clasificadas as any[]).filter((p: any) => {
    const n = normalizeText(String(p?.nombre || p?.name || ''))
    return !toRemove.has(n)
  })
}

function enrichInmuebleFromSelectedFolioCandidate(data: Record<string, any>, selectedFolio: string) {
  const folios = isPlainObject(data.folios) ? (data.folios as Record<string, any>) : {}
  const candidates = Array.isArray(folios.candidates) ? folios.candidates : []
  if (candidates.length === 0) return

  const selectedScope = String(folios?.selection?.selected_scope || '').trim().toLowerCase()
  const selectedDigits = String(selectedFolio || '').replace(/\D/g, '')
  if (!selectedDigits) return

  const sameFolio = candidates.filter(
    (c: any) => String(c?.folio || '').replace(/\D/g, '') === selectedDigits
  )
  if (sameFolio.length === 0) return

  const scoped = selectedScope
    ? sameFolio.filter((c: any) => String(c?.scope || '').toLowerCase() === selectedScope)
    : []
  const pool = scoped.length > 0 ? scoped : sameFolio
  pool.sort((a: any, b: any) => countCandidateAttrs(b) - countCandidateAttrs(a))
  const target = pool[0]
  if (!target || !isPlainObject(target.attrs)) return

  const attrs = target.attrs as Record<string, any>
  const attrsDireccion = isPlainObject(attrs.direccion) ? (attrs.direccion as Record<string, any>) : {}

  const inmueble = isPlainObject(data.inmueble) ? { ...(data.inmueble as Record<string, any>) } : {}
  const direccion = isPlainObject(inmueble.direccion) ? { ...(inmueble.direccion as Record<string, any>) } : {}
  const catastrales = isPlainObject(inmueble.datos_catastrales)
    ? { ...(inmueble.datos_catastrales as Record<string, any>) }
    : {}

  const fromCalle = String(attrsDireccion.calle || '').trim()
  const fromUbicacion = String(attrs.ubicacion || '').trim()
  if (fromCalle || fromUbicacion) direccion.calle = fromCalle || fromUbicacion
  if (hasValue(attrsDireccion.numero)) direccion.numero = attrsDireccion.numero
  if (hasValue(attrsDireccion.colonia)) direccion.colonia = attrsDireccion.colonia
  if (hasValue(attrsDireccion.municipio)) direccion.municipio = attrsDireccion.municipio
  if (hasValue(attrsDireccion.estado)) direccion.estado = attrsDireccion.estado
  if (hasValue(attrsDireccion.codigo_postal)) direccion.codigo_postal = attrsDireccion.codigo_postal

  if (hasValue(attrs.superficie)) inmueble.superficie = attrs.superficie
  if (hasValue(attrs.partida) && (!Array.isArray(inmueble.partidas) || inmueble.partidas.length === 0)) {
    inmueble.partidas = [String(attrs.partida)]
  }

  if (hasValue(attrs.lote)) catastrales.lote = String(attrs.lote)
  if (hasValue(attrs.manzana)) catastrales.manzana = String(attrs.manzana)
  if (hasValue(attrs.fraccionamiento)) catastrales.fraccionamiento = String(attrs.fraccionamiento)
  if (hasValue(attrs.condominio)) catastrales.condominio = String(attrs.condominio)
  if (hasValue(attrs.unidad)) catastrales.unidad = String(attrs.unidad)
  if (hasValue(attrs.modulo)) catastrales.modulo = String(attrs.modulo)

  inmueble.direccion = direccion
  inmueble.datos_catastrales = catastrales
  data.inmueble = inmueble
}

function countCandidateAttrs(candidate: Record<string, any>): number {
  const attrs = isPlainObject(candidate?.attrs) ? (candidate.attrs as Record<string, unknown>) : {}
  const keys = ['unidad', 'condominio', 'lote', 'manzana', 'fraccionamiento', 'colonia', 'superficie', 'ubicacion', 'partida']
  return keys.reduce((acc, key) => (hasValue(attrs[key]) ? acc + 1 : acc), 0)
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRoleAliasInsteadOfName(value: string): boolean {
  const normalized = normalizeText(value)
  if (!normalized) return false
  if (/^(el|la)\s+(esposo|esposa|conyuge|comprador|compradora|vendedor|vendedora)$/.test(normalized)) return true
  if (/^(esposo|esposa|conyuge|comprador|compradora|vendedor|vendedora)$/.test(normalized)) return true
  if (/^(el|la)\s+(esposo|esposa|conyuge)\s+es\s+(el|la)\s+(comprador|compradora|vendedor|vendedora)$/.test(normalized)) return true
  if (/^(el|la)\s+(comprador|compradora|vendedor|vendedora)\s+es\s+(el|la)\s+(esposo|esposa|conyuge)$/.test(normalized)) return true
  if (/\b(esposo|esposa|conyuge)\b/.test(normalized) && /\b(comprador|compradora|vendedor|vendedora)\b/.test(normalized)) return true
  return false
}

