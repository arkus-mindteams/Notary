/**
 * Endpoint de procesamiento de documentos usando Plugin System
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  TextractClient,
  DetectDocumentTextCommand,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { ActivityLogService } from '@/lib/services/activity-log-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentoService } from '@/lib/services/documento-service'
import { DocumentIndexingService } from '@/lib/services/document-indexing-service'
import { ExtractionAgent } from '@/lib/ai/extraction/extraction-agent'
import { DocumentIntakeService } from '@/lib/ai/intake/document-intake.service'

type DeferredPostProcessInput = {
  traceId: string
  authUserId: string | null
  conversationId: string | null
  tramiteId: string | null
  documentoId?: string | null
  documentType: string
  file: File
  extractedData: any
}

function toSafeError(error: unknown): { message: string; code?: string } {
  if (!error || typeof error !== 'object') {
    return { message: 'unknown_error' }
  }
  const err = error as { message?: string; code?: string }
  return {
    message: err.message || 'processing_error',
    code: err.code
  }
}

function buildProcessingFingerprint(params: {
  sessionId: string | null
  tramiteId: string | null
  documentType: string
  fileName: string
  fileSize: number
  extractedData: any
}): string {
  const extractedHash = createHash('sha256')
    .update(JSON.stringify(params.extractedData || {}))
    .digest('hex')

  return createHash('sha256')
    .update([
      params.sessionId || 'no-session',
      params.tramiteId || 'no-tramite',
      params.documentType,
      params.fileName,
      String(params.fileSize),
      extractedHash
    ].join('|'))
    .digest('hex')
}

function normalizeFileNameForMatch(name: string | null | undefined): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

async function findExistingDocumentoInSessionByFile(
  supabase: any,
  sessionId: string,
  file: File
): Promise<any | null> {
  const { data: links, error: linksError } = await supabase
    .from('chat_session_documents')
    .select('documento_id, uploaded_at')
    .eq('session_id', sessionId)
    .order('uploaded_at', { ascending: false })
    .limit(30)

  if (linksError || !Array.isArray(links) || links.length === 0) {
    return null
  }

  const docIds = Array.from(
    new Set(
      links
        .map((l: any) => String(l?.documento_id || '').trim())
        .filter(Boolean)
    )
  )
  if (docIds.length === 0) return null

  const { data: docs, error: docsError } = await supabase
    .from('documentos')
    .select('id, nombre, mime_type, metadata, uploaded_at')
    .in('id', docIds)

  if (docsError || !Array.isArray(docs) || docs.length === 0) {
    return null
  }

  const targetName = normalizeFileNameForMatch(file.name)
  const targetMime = String(file.type || '').trim().toLowerCase()

  const linkedAtMap = new Map<string, string>()
  for (const l of links) {
    const id = String(l?.documento_id || '')
    const ts = String(l?.uploaded_at || '')
    if (!id) continue
    if (!linkedAtMap.has(id)) linkedAtMap.set(id, ts)
  }

  const getDocOriginalName = (doc: any): string => {
    const metadata = doc?.metadata && typeof doc.metadata === 'object' ? doc.metadata : {}
    return normalizeFileNameForMatch(
      metadata?.original_name ||
      metadata?.fileName ||
      metadata?.filename ||
      metadata?.name ||
      ''
    )
  }

  const candidates = docs.filter((doc: any) => {
    const docName = normalizeFileNameForMatch(doc?.nombre)
    const originalName = getDocOriginalName(doc)
    const nameMatches = targetName && (docName === targetName || originalName === targetName)
    if (!nameMatches) return false
    const docMime = String(doc?.mime_type || '').trim().toLowerCase()
    if (targetMime && docMime && targetMime !== docMime) return false
    return true
  })

  if (candidates.length === 0) return null

  candidates.sort((a: any, b: any) => {
    const aLinked = Date.parse(linkedAtMap.get(String(a?.id || '')) || String(a?.uploaded_at || '0')) || 0
    const bLinked = Date.parse(linkedAtMap.get(String(b?.id || '')) || String(b?.uploaded_at || '0')) || 0
    return bLinked - aLinked
  })

  return candidates[0] || null
}

function mergeExtractedIntoContext(context: any, structured: any): any {
  const next = { ...(context || {}) }
  const inmueble = structured?.inmueble || {}
  const derivedFolioCandidates = Array.isArray(structured?.__derived?.folio_real_candidates)
    ? structured.__derived.folio_real_candidates
    : []
  const hasAmbiguousFolioCandidates = derivedFolioCandidates.length > 1
  const direccion = inmueble?.direccion || {}
  const datosCatastrales = inmueble?.datos_catastrales || {}

  next.inmueble = {
    ...(next.inmueble || {}),
    folio_real: hasAmbiguousFolioCandidates
      ? (next?.inmueble?.folio_real ?? null)
      : (inmueble?.folio_real ?? next?.inmueble?.folio_real ?? null),
    partidas: Array.isArray(inmueble?.partidas) && inmueble.partidas.length > 0
      ? inmueble.partidas
      : (next?.inmueble?.partidas || []),
    seccion: inmueble?.seccion ?? next?.inmueble?.seccion ?? null,
    numero_expediente: inmueble?.numero_expediente ?? next?.inmueble?.numero_expediente ?? null,
    direccion: {
      ...(next?.inmueble?.direccion || {}),
      calle: direccion?.calle ?? next?.inmueble?.direccion?.calle ?? null,
      numero: direccion?.numero ?? next?.inmueble?.direccion?.numero ?? null,
      colonia: direccion?.colonia ?? next?.inmueble?.direccion?.colonia ?? null,
      municipio: direccion?.municipio ?? next?.inmueble?.direccion?.municipio ?? null,
      estado: direccion?.estado ?? next?.inmueble?.direccion?.estado ?? null,
      codigo_postal: direccion?.codigo_postal ?? next?.inmueble?.direccion?.codigo_postal ?? null,
    },
    superficie: inmueble?.superficie ?? next?.inmueble?.superficie ?? null,
    valor: inmueble?.valor ?? next?.inmueble?.valor ?? null,
    datos_catastrales: {
      ...(next?.inmueble?.datos_catastrales || {}),
      lote: datosCatastrales?.lote ?? next?.inmueble?.datos_catastrales?.lote ?? null,
      manzana: datosCatastrales?.manzana ?? next?.inmueble?.datos_catastrales?.manzana ?? null,
      fraccionamiento: datosCatastrales?.fraccionamiento ?? next?.inmueble?.datos_catastrales?.fraccionamiento ?? null,
      condominio: datosCatastrales?.condominio ?? next?.inmueble?.datos_catastrales?.condominio ?? null,
      unidad: datosCatastrales?.unidad ?? next?.inmueble?.datos_catastrales?.unidad ?? null,
      modulo: datosCatastrales?.modulo ?? next?.inmueble?.datos_catastrales?.modulo ?? null,
    }
  }

  if (derivedFolioCandidates.length > 0) {
    const folioContextMap =
      structured?.__derived?.folio_context_map && typeof structured.__derived.folio_context_map === 'object'
        ? structured.__derived.folio_context_map
        : {}
    const prevFolios = next?.folios || {
      candidates: [],
      selection: { selected_folio: null, selected_scope: null, confirmed_by_user: false },
    }
    const map = new Map<string, any>()
    for (const c of [...(prevFolios.candidates || []), ...derivedFolioCandidates.map((folio: string) => {
      const normalizedFolio = String(folio || '').replace(/\D/g, '')
      const ctx = folioContextMap?.[normalizedFolio] || {}
      const ctxAttrs = ctx?.attrs && typeof ctx.attrs === 'object' ? ctx.attrs : {}
      const scope = String(ctx?.scope || 'unidades').toLowerCase()
      return {
        folio: normalizedFolio,
        scope: scope === 'inmuebles_afectados' || scope === 'otros' ? scope : 'unidades',
        attrs: {
          unidad: ctxAttrs?.unidad ?? structured?.__derived?.unidad_detectada ?? structured?.inmueble?.datos_catastrales?.unidad ?? null,
          condominio: ctxAttrs?.condominio ?? structured?.inmueble?.datos_catastrales?.condominio ?? null,
          lote: ctxAttrs?.lote ?? structured?.inmueble?.datos_catastrales?.lote ?? null,
          manzana: ctxAttrs?.manzana ?? structured?.inmueble?.datos_catastrales?.manzana ?? null,
          fraccionamiento: ctxAttrs?.fraccionamiento ?? structured?.inmueble?.datos_catastrales?.fraccionamiento ?? null,
          superficie: ctxAttrs?.superficie ?? structured?.inmueble?.superficie ?? null,
          direccion: ctxAttrs?.direccion ?? {},
        },
        sources: [{ docName: structured?.__derived?.source_file_name || null, docType: structured?.source_document_type || null }],
      }
    })]) {
      const folio = String(c?.folio || '').replace(/\D/g, '')
      const scope = c?.scope || 'otros'
      if (!folio) continue
      map.set(`${scope}:${folio}`, {
        ...c,
        folio,
        scope,
      })
    }
    next.folios = {
      candidates: Array.from(map.values()),
      selection: prevFolios.selection || { selected_folio: null, selected_scope: null, confirmed_by_user: false },
    }
  }

  const derivedSellerName = String(structured?.__derived?.vendedor_nombre || '').trim()
  const sellerNameForContext = derivedSellerName || String(structured?.titular_registral?.nombre || '').trim()
  if (sellerNameForContext) {
    const sellerLooksMoral = looksLikePersonaMoralName(sellerNameForContext)
    const vendedor = {
      party_id: 'vendedor_1',
      tipo_persona: sellerLooksMoral ? 'persona_moral' : 'persona_fisica',
      persona_fisica: sellerLooksMoral
        ? undefined
        : {
            nombre: sellerNameForContext,
            rfc: structured?.titular_registral?.rfc ?? null,
            curp: structured?.titular_registral?.curp ?? null,
          },
      persona_moral: sellerLooksMoral
        ? {
            denominacion_social: sellerNameForContext,
            rfc: structured?.titular_registral?.rfc ?? null,
          }
        : undefined,
      titular_registral_confirmado: true,
    }
    const existing = Array.isArray(next.vendedores) ? next.vendedores : []
    next.vendedores = existing.length > 0 ? [{ ...existing[0], ...vendedor }] : [vendedor]
  }

  const compradoresDetectados = Array.isArray(structured?.compradores_detectados)
    ? structured.compradores_detectados.filter((p: any) => p?.nombre)
    : []
  const compradoresDerivados = Array.isArray(structured?.__derived?.compradores_nombres)
    ? structured.__derived.compradores_nombres
        .map((nombre: unknown) => String(nombre || '').trim())
        .filter((nombre: string) => Boolean(nombre))
        .map((nombre: string) => ({ nombre, rfc: null, curp: null }))
    : []
  const compradoresInput =
    compradoresDerivados.length > 0 ? compradoresDerivados : compradoresDetectados
  if (compradoresInput.length > 0) {
    const existing = Array.isArray(next.compradores) ? next.compradores : []
    const merged = [...existing]
    for (let i = 0; i < compradoresInput.length; i++) {
      const buyer = compradoresInput[i]
      const prev = merged[i] || {}
      merged[i] = {
        ...prev,
        party_id: prev.party_id || `comprador_${i + 1}`,
        persona_fisica: {
          ...(prev.persona_fisica || {}),
          nombre: buyer?.nombre ?? prev?.persona_fisica?.nombre ?? null,
          rfc: buyer?.rfc ?? prev?.persona_fisica?.rfc ?? null,
          curp: buyer?.curp ?? prev?.persona_fisica?.curp ?? null,
        }
      }
    }
    next.compradores = merged
  }

  // Inferencia deductiva: si el ultimo dato faltante era comprador y se sube identificacion,
  // usar un candidato unico de persona detectada para poblar compradores[0].
  const lastQuestionIntent = String(context?._last_question_intent || next?._last_question_intent || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  const looksIdentification =
    String(structured?.source_document_type || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase() === 'identificacion'
  const buyersMissing =
    !Array.isArray(next?.compradores) ||
    next.compradores.length === 0 ||
    !String(next?.compradores?.[0]?.persona_fisica?.nombre || next?.compradores?.[0]?.persona_moral?.denominacion_social || '').trim()

  if (looksIdentification && buyersMissing && lastQuestionIntent.includes('comprador')) {
    const normalizePerson = (value: unknown): string =>
      String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
    const candidates = new Map<string, string>()
    const addCandidate = (value: unknown) => {
      const name = normalizePerson(value)
      if (!name) return
      const key = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
      if (!candidates.has(key)) candidates.set(key, name)
    }

    for (const p of Array.isArray(structured?.compradores_detectados) ? structured.compradores_detectados : []) {
      addCandidate(p?.nombre)
    }
    for (const p of Array.isArray(structured?.personas_detectadas_no_clasificadas) ? structured.personas_detectadas_no_clasificadas : []) {
      addCandidate(p?.nombre)
    }
    addCandidate(structured?.titular_registral?.nombre)

    if (candidates.size === 1) {
      const inferredName = Array.from(candidates.values())[0]
      const inferredLooksMoral = looksLikePersonaMoralName(inferredName)
      next.compradores = [
        {
          party_id: 'comprador_1',
          tipo_persona: inferredLooksMoral ? 'persona_moral' : 'persona_fisica',
          persona_fisica: inferredLooksMoral
            ? undefined
            : { nombre: inferredName, rfc: null, curp: null },
          persona_moral: inferredLooksMoral
            ? { denominacion_social: inferredName, rfc: null }
            : undefined,
        },
      ]
    }
  }

  const derivedBuyerName = String(structured?.__derived?.acreditado_nombre || '').trim()
  const derivedCoBuyerName = String(structured?.__derived?.coacreditado_nombre || '').trim()
  const derivedBuyerEstadoCivil = String(structured?.__derived?.buyer_estado_civil || '').trim()
  const derivedCreditInstitution = String(structured?.__derived?.credit_institucion || '').trim()

  if (derivedBuyerName) {
    const compradores = Array.isArray(next.compradores) ? [...next.compradores] : []
    const c0 = { ...(compradores[0] || {}) }
    const derivedLooksMoral = looksLikePersonaMoralName(derivedBuyerName)
    c0.party_id = c0.party_id || 'comprador_1'
    if (derivedLooksMoral) {
      c0.tipo_persona = 'persona_moral'
      c0.persona_moral = {
        ...(c0.persona_moral || {}),
        denominacion_social: c0.persona_moral?.denominacion_social || derivedBuyerName,
        rfc: c0.persona_moral?.rfc || null,
      }
      c0.persona_fisica = undefined
    } else {
      c0.tipo_persona = c0.tipo_persona || 'persona_fisica'
      c0.persona_fisica = {
        ...(c0.persona_fisica || {}),
        nombre: c0.persona_fisica?.nombre || derivedBuyerName,
        rfc: c0.persona_fisica?.rfc || null,
        curp: c0.persona_fisica?.curp || null,
        estado_civil: c0.persona_fisica?.estado_civil || null,
      }
    }
    compradores[0] = c0
    next.compradores = compradores
  }

  if (derivedBuyerEstadoCivil) {
    const compradores = Array.isArray(next.compradores) ? [...next.compradores] : []
    const c0 = { ...(compradores[0] || {}) }
    const currentBuyerName =
      c0?.persona_fisica?.nombre ||
      c0?.persona_moral?.denominacion_social ||
      null
    const buyerIsMoral =
      c0?.tipo_persona === 'persona_moral' ||
      looksLikePersonaMoralName(currentBuyerName)
    if (buyerIsMoral) {
      compradores[0] = {
        ...c0,
        tipo_persona: 'persona_moral',
        persona_fisica: undefined,
      }
      next.compradores = compradores
    } else {
    c0.party_id = c0.party_id || 'comprador_1'
    c0.tipo_persona = c0.tipo_persona || 'persona_fisica'
    c0.persona_fisica = {
      ...(c0.persona_fisica || {}),
      nombre: c0.persona_fisica?.nombre || null,
      rfc: c0.persona_fisica?.rfc || null,
      curp: c0.persona_fisica?.curp || null,
      estado_civil: c0.persona_fisica?.estado_civil || derivedBuyerEstadoCivil,
    }
    compradores[0] = c0
    next.compradores = compradores
    }
  }

  if (derivedCreditInstitution) {
    const creditos = Array.isArray(next.creditos) ? [...next.creditos] : []
    const c0 = { ...(creditos[0] || {}) }
    const participantesExistentes = Array.isArray(c0.participantes) ? c0.participantes : []
    let participantes = participantesExistentes
    if (participantes.length === 0) {
      const buyerName =
        next?.compradores?.[0]?.persona_fisica?.nombre ||
        next?.compradores?.[0]?.persona_moral?.denominacion_social ||
        null
      if (buyerName) {
        participantes = [
          {
            party_id: 'comprador_1',
            nombre: buyerName,
            rol: 'acreditado'
          }
        ]
      }
    }
    if (derivedBuyerName) {
      const hasAcreditado = participantes.some(
        (p: any) => String(p?.rol || '').toLowerCase() === 'acreditado'
      )
      if (!hasAcreditado) {
        participantes = [
          ...participantes,
          {
            party_id: 'comprador_1',
            nombre: derivedBuyerName,
            rol: 'acreditado',
          },
        ]
      }
    }
    if (derivedCoBuyerName) {
      const normalizedCoBuyer = derivedCoBuyerName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim()
      const alreadyExists = participantes.some((p: any) => {
        const n = String(p?.nombre || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
        return n && n === normalizedCoBuyer
      })
      if (!alreadyExists) {
        participantes = [
          ...participantes,
          {
            party_id: 'comprador_2',
            nombre: derivedCoBuyerName,
            rol: 'coacreditado',
          },
        ]
      }
    }
    creditos[0] = {
      credito_id: c0.credito_id ?? null,
      institucion: c0.institucion || derivedCreditInstitution,
      monto: c0.monto ?? null,
      participantes,
      tipo_credito: c0.tipo_credito ?? null,
    }
    next.creditos = creditos
    next.actosNotariales = {
      ...(next.actosNotariales || {}),
      aperturaCreditoComprador: true,
    }
  }

  const extractedDocType = normalizeExtractionDocumentType(structured?.source_document_type)
  const canOverrideEncumbrance =
    extractedDocType === 'inscripcion' ||
    extractedDocType === 'escritura' ||
    extractedDocType === 'otro'
  if (canOverrideEncumbrance && structured?.gravamenes === 'LIBRE') {
    next.gravamenes = []
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: false }
  } else if (canOverrideEncumbrance && Array.isArray(structured?.gravamenes) && structured.gravamenes.length > 0) {
    next.gravamenes = structured.gravamenes
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: true }
  }

  // Regla notarial pragmatica:
  // Si ya existe acreedor de gravamen y también crédito del comprador,
  // asumimos que el gravamen se cancelará con la operación actual.
  // En este sistema: cancelacion_confirmada=false => "se cancelará en la escritura/trámite".
  if (next?.inmueble?.existe_hipoteca === true && Array.isArray(next?.gravamenes) && next.gravamenes.length > 0) {
    const gravamenes = [...next.gravamenes]
    const g0 = { ...(gravamenes[0] || {}) }
    const hasAcreedor = Boolean(String(g0?.institucion || '').trim())
    const hasBuyerCredit =
      (Array.isArray(next?.creditos) && next.creditos.length > 0) ||
      next?.actosNotariales?.aperturaCreditoComprador === true
    if (hasAcreedor && hasBuyerCredit && (g0?.cancelacion_confirmada === null || g0?.cancelacion_confirmada === undefined)) {
      g0.cancelacion_confirmada = false
      gravamenes[0] = g0
      next.gravamenes = gravamenes
    }
  }

  const normalizeName = (value: unknown): string =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
  const excludedNames = new Set<string>(
    (Array.isArray(structured?.__derived?.excluded_person_names) ? structured.__derived.excluded_person_names : [])
      .map((n: unknown) => normalizeName(n))
      .filter(Boolean)
  )

  const classifiedNames = new Set<string>()
  const titularName = structured?.titular_registral?.nombre
  if (titularName) classifiedNames.add(normalizeName(titularName))

  const compradoresDetectadosRaw = Array.isArray(structured?.compradores_detectados)
    ? structured.compradores_detectados
    : []
  for (const p of compradoresDetectadosRaw) {
    const n = normalizeName(p?.nombre)
    if (n) classifiedNames.add(n)
  }

  const conyugesDetectadosRaw = Array.isArray(structured?.conyuges_detectados)
    ? structured.conyuges_detectados
    : []
  if (conyugesDetectadosRaw.length > 0) {
    const dedupConyuges = new Map<string, any>()
    for (const p of conyugesDetectadosRaw) {
      const nombre = String(p?.nombre || '').trim()
      const n = normalizeName(nombre)
      if (!n) continue
      const sexoRaw = String(p?.sexo || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
      const sexo =
        sexoRaw === 'hombre' || sexoRaw === 'masculino'
          ? 'hombre'
          : sexoRaw === 'mujer' || sexoRaw === 'femenino'
            ? 'mujer'
            : null
      const prev = dedupConyuges.get(n)
      if (!prev) {
        dedupConyuges.set(n, { nombre, sexo })
      } else if (!prev.sexo && sexo) {
        dedupConyuges.set(n, { ...prev, sexo })
      }
    }
    next.conyuges_detectados = Array.from(dedupConyuges.values())
  }
  for (const p of conyugesDetectadosRaw) {
    const n = normalizeName(p?.nombre)
    if (n) classifiedNames.add(n)
  }
  for (const n of excludedNames) {
    classifiedNames.add(n)
  }

  const noClasificadasRaw = Array.isArray(structured?.personas_detectadas_no_clasificadas)
    ? structured.personas_detectadas_no_clasificadas
    : []
  if (noClasificadasRaw.length > 0) {
    const dedup = new Map<string, any>()
    for (const person of noClasificadasRaw) {
      const n = normalizeName(person?.nombre)
      if (!n) continue
      if (classifiedNames.has(n)) continue
      if (!dedup.has(n)) {
        dedup.set(n, {
          nombre: String(person?.nombre || '').trim(),
          rfc: person?.rfc ?? null,
          curp: person?.curp ?? null,
        })
      }
    }
    next.personas_detectadas_no_clasificadas = Array.from(dedup.values())
  }

  return next
}

function isImageLikeFile(file: File): boolean {
  const mime = String(file.type || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const name = String(file.name || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)
}

async function extractPdfTextWithAsyncOcr(
  file: File,
  traceId: string,
  providedBytes?: Uint8Array
): Promise<{
  text: string | null
  source: 'async_textract' | 'sync_textract' | 'none'
  reason: string | null
  elapsed_ms: number
}> {
  const FIXED_OCR_TIMEOUT_MS = 300000
  const startedAt = Date.now()
  const awsRegion = process.env.AWS_REGION
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const bucket = process.env.AWS_S3_BUCKET || process.env.OCR_S3_BUCKET
  if (!awsRegion || !awsAccessKeyId || !awsSecretAccessKey) {
    return {
      text: null,
      source: 'none',
      reason: 'missing_aws_credentials_or_region',
      elapsed_ms: Date.now() - startedAt,
    }
  }

  const credentials = {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  }

  const s3 = new S3Client({ region: awsRegion, credentials })
  const textract = new TextractClient({ region: awsRegion, credentials })
  const key = bucket
    ? (process.env.OCR_S3_PREFIX || 'uploads/') +
      `${Date.now()}-${String(file.name || 'document').replace(/\s+/g, '_').toLowerCase()}`
    : null

  try {
    const bytes = providedBytes && providedBytes.length > 0
      ? providedBytes
      : new Uint8Array(await file.arrayBuffer())

    if (bucket && key) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: file.type || 'application/pdf',
        })
      )
      const startResp = await textract.send(
        new StartDocumentTextDetectionCommand({
          DocumentLocation: {
            S3Object: { Bucket: bucket, Name: key },
          },
        })
      )
      const jobId = startResp.JobId
      if (jobId) {
        const timeoutMs = FIXED_OCR_TIMEOUT_MS
        for (;;) {
          const resp = await textract.send(new GetDocumentTextDetectionCommand({ JobId: jobId }))
          const status = String(resp.JobStatus || '')
          if (status === 'SUCCEEDED') {
            let nextToken = resp.NextToken
            const allBlocks = [...(resp.Blocks || [])]
            while (nextToken) {
              const pageResp = await textract.send(
                new GetDocumentTextDetectionCommand({
                  JobId: jobId,
                  NextToken: nextToken,
                })
              )
              allBlocks.push(...(pageResp.Blocks || []))
              nextToken = pageResp.NextToken
            }
            const text = allBlocks
              .filter((b) => b.BlockType === 'LINE' && b.Text)
              .map((b) => String(b.Text))
              .join('\n')
              .trim()
            if (text) {
              return {
                text,
                source: 'async_textract',
                reason: null,
                elapsed_ms: Date.now() - startedAt,
              }
            }
            break
          }
          if (status === 'FAILED' || status === 'PARTIAL_SUCCESS') {
            break
          }
          if (Date.now() - startedAt > timeoutMs) {
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    }

    // Fallback: intento síncrono con bytes para evitar vacío silencioso.
    try {
      const syncResp = await textract.send(
        new DetectDocumentTextCommand({
          Document: { Bytes: bytes },
        })
      )
      const syncText = (syncResp.Blocks || [])
        .filter((b) => b.BlockType === 'LINE' && b.Text)
        .map((b) => String(b.Text))
        .join('\n')
        .trim()
      if (syncText) {
        return {
          text: syncText,
          source: 'sync_textract',
          reason: null,
          elapsed_ms: Date.now() - startedAt,
        }
      }
    } catch (syncError) {
      console.error('[preaviso-process-document] sync_ocr_fallback_failed', {
        trace_id: traceId,
        file_name: file.name,
        ...toSafeError(syncError),
      })
      return {
        text: null,
        source: 'none',
        reason: 'sync_ocr_fallback_failed',
        elapsed_ms: Date.now() - startedAt,
      }
    }
    return {
      text: null,
      source: 'none',
      reason: 'no_text_from_ocr',
      elapsed_ms: Date.now() - startedAt,
    }
  } catch (error) {
    console.error('[preaviso-process-document] async_ocr_error', {
      trace_id: traceId,
      file_name: file.name,
      ...toSafeError(error),
    })
    return {
      text: null,
      source: 'none',
      reason: 'async_ocr_error',
      elapsed_ms: Date.now() - startedAt,
    }
  }
}

function detectFoliosFromText(rawText: string): string[] {
  const text = String(rawText || '')
  if (!text) return []
  const folioMinDigits = Number(process.env.FOLIO_REAL_MIN_DIGITS || 7)
  const patterns = [new RegExp(`\\bfolio\\s*real\\s*[:#-]?\\s*([0-9]{${Math.max(6, folioMinDigits)},})\\b`, 'gi')]
  const found = new Set<string>()
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const folio = String(match?.[1] || '').trim()
      if (folio) found.add(folio)
    }
  }
  return Array.from(found)
}

const STATE_FOLIO_REAL_RULES: Record<string, number[]> = {
  'BAJA CALIFORNIA': [7],
}

function detectStateFromText(rawText: string): string | null {
  const normalized = String(rawText || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (normalized.includes('BAJA CALIFORNIA')) return 'BAJA CALIFORNIA'
  return null
}

function isFolioAllowedByState(state: string | null, folio: string): boolean {
  const digits = String(folio || '').replace(/\D/g, '')
  if (!digits) return false
  if (!state) return true
  const allowed = STATE_FOLIO_REAL_RULES[state]
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(digits.length)
}

function extractFolioRealCandidatesNearUnidad(rawText: string): string[] {
  const text = String(rawText || '')
  if (!text) return []
  const folioMinDigits = Number(process.env.FOLIO_REAL_MIN_DIGITS || 7)
  const re = new RegExp(`\\bFOLIO\\s+REAL\\s*[:#\\-]?\\s*([0-9]{${Math.max(6, folioMinDigits)},})\\b`, 'gi')
  const out = new Set<string>()
  for (const match of text.matchAll(re)) {
    const value = String(match?.[1] || '').replace(/\D/g, '')
    if (!value) continue
    const idx = Number(match.index || 0)
    const start = Math.max(0, idx - 80)
    const end = Math.min(text.length, idx + String(match[0] || '').length + 220)
    const window = text.slice(start, end)
    if (/\bUNIDAD\s*[:\-]?\s*[A-Z0-9]/i.test(window)) {
      out.add(value)
    }
  }
  return Array.from(out.values())
}

function extractFolioContextByBlocks(rawText: string): Record<string, {
  scope: 'unidades' | 'inmuebles_afectados' | 'otros'
  attrs: Record<string, any>
}> {
  const text = String(rawText || '')
  if (!text) return {}
  const folioMinDigits = Number(process.env.FOLIO_REAL_MIN_DIGITS || 7)
  const re = new RegExp(`\\bFOLIO\\s+REAL\\s*[:#\\-]?\\s*([0-9]{${Math.max(6, folioMinDigits)},})\\b`, 'gi')
  const matches = Array.from(text.matchAll(re))
  if (matches.length === 0) return {}

  const out: Record<string, {
    scope: 'unidades' | 'inmuebles_afectados' | 'otros'
    attrs: Record<string, any>
  }> = {}

  const getMatchStart = (m: RegExpMatchArray) => Number(m.index || 0)
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const folio = String(m?.[1] || '').replace(/\D/g, '')
    if (!folio) continue
    const start = getMatchStart(m)
    const nextStart = i + 1 < matches.length ? getMatchStart(matches[i + 1]) : text.length
    const block = text.slice(start, Math.min(nextStart, start + 1600))
    const headerContext = text.slice(Math.max(0, start - 400), start)

    const unidad = (block.match(/\bUNIDAD\s*[:\-]?\s*([A-Z]?\d+[A-Z]?)/i)?.[1] || '').trim() || null
    const condominio =
      (block.match(/\bCONJ\.?\s*HABITACIONAL\s*[:\-]?\s*([^\n\r]+)/i)?.[1] || '').trim() ||
      (block.match(/\bCONDOMINIO\s+([A-Z0-9\-]+)/i)?.[1] || '').trim() ||
      null
    const lote = (block.match(/\bLOTE\s*[:\-]?\s*([^\n\r]+)/i)?.[1] || '').trim() || null
    const manzana = (block.match(/\bMANZANA\s*[:\-]?\s*([A-Z0-9]+)/i)?.[1] || '').trim() || null
    const municipio = (block.match(/\bMUNICIPIO\s*[:\-]?\s*([A-Z\s]+)\b/i)?.[1] || '').trim() || null
    const superficie =
      (block.match(/\bSUPERFICIE\s*[:\-]?\s*([0-9.,]+\s*M2)\b/i)?.[1] || '').trim() ||
      (block.match(/\bTOTAL\s+PRIVATIVA\s*([0-9.,]+\s*M2)\b/i)?.[1] || '').trim() ||
      null

    const fraccFromLabel =
      (block.match(/\bFRACCIONAMIENTO\s*[:\-]?\s*([^\n\r]+)/i)?.[1] || '').trim() || null
    const fraccFromPhrase =
      (block.match(/\bDESARROLLO\s+HABITACIONAL\s+([A-Z0-9\s\-]+)/i)?.[1] || '').trim() || null
    const fraccionamiento = fraccFromLabel || fraccFromPhrase

    const hasInmueblesAfectadosHeader = /\bINMUEBLE\(S\)\s+AFECTADO\(S\)\b/i.test(headerContext)
    const scope: 'unidades' | 'inmuebles_afectados' | 'otros' =
      hasInmueblesAfectadosHeader ? 'inmuebles_afectados' : (unidad ? 'unidades' : 'otros')

    out[folio] = {
      scope,
      attrs: {
        unidad,
        condominio,
        lote,
        manzana,
        fraccionamiento,
        superficie,
        direccion: {
          municipio,
          estado: detectStateFromText(text),
        },
      },
    }
  }
  return out
}

function normalizeExtractionDocumentType(documentType: string | null | undefined): 'inscripcion' | 'escritura' | 'identificacion' | 'acta_matrimonio' | 'otro' {
  const normalized = String(documentType || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (normalized.includes('inscrip')) return 'inscripcion'
  if (normalized.includes('escritur')) return 'escritura'
  if (normalized.includes('ident')) return 'identificacion'
  if (normalized.includes('matrimonio') || normalized.includes('acta_matrimonio')) return 'acta_matrimonio'
  return 'otro'
}

function normalizeInstitutionName(rawInstitution: string | null | undefined): string | null {
  const input = String(rawInstitution || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!input) return null

  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // Evitar tomar montos/moneda como "institución".
  if (
    /\$\s*\d/.test(input) ||
    /\b(pesos?|moneda nacional|m\.?\s*n\.?|mxn|usd|dolares?)\b/i.test(normalized)
  ) {
    return null
  }

  const letters = (input.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length
  const digits = (input.match(/\d/g) || []).length
  if (letters < 4 || (digits >= 3 && letters <= 2)) {
    return null
  }

  const hasLegalDenomination =
    /\b(s\.?\s*a\.?|sapi|sociedad|anonima|institucion\s+de\s+banca\s+multiple|grupo\s+financiero|de\s+c\.?\s*v\.?)\b/i.test(input)
  if (hasLegalDenomination) {
    return input
  }

  if (normalized.includes('infonavit')) return 'INFONAVIT'
  if (normalized.includes('fovissste')) return 'FOVISSSTE'
  if (normalized.includes('banco mercantil del norte') || /\bbanorte\b/.test(normalized)) return 'Banco Mercantil del Norte'
  if (normalized.includes('bbva')) return 'BBVA'
  if (normalized.includes('hsbc')) return 'HSBC'
  if (normalized.includes('santander')) return 'Santander'
  if (normalized.includes('banamex') || normalized.includes('citibanamex')) return 'Banamex'
  if (normalized.includes('banco inmobiliario mexicano')) return 'Banco Inmobiliario Mexicano'

  return input
}

function detectInstitutionFromText(rawText: string): string | null {
  const legalLineMatch = String(rawText || '').match(
    /\b(?:credito|cr[eé]dito|acreditante|acreedor(?:es)?)\b\s*[:\-]\s*([^\n\r]+)/i
  )
  const legalLineInstitution = normalizeInstitutionName(legalLineMatch ? legalLineMatch[1] : null)
  if (legalLineInstitution) return legalLineInstitution

  const normalized = String(rawText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized.includes('infonavit')) return 'INFONAVIT'
  if (normalized.includes('fovissste')) return 'FOVISSSTE'
  if (normalized.includes('banco mercantil del norte') || /\bbanorte\b/.test(normalized)) return 'Banco Mercantil del Norte'
  if (normalized.includes('bbva')) return 'BBVA'
  if (normalized.includes('hsbc')) return 'HSBC'
  if (normalized.includes('santander')) return 'Santander'
  if (normalized.includes('banamex') || normalized.includes('citibanamex')) return 'Banamex'
  if (normalized.includes('banco inmobiliario mexicano')) return 'Banco Inmobiliario Mexicano'

  return null
}

function looksLikePersonaMoralName(name: string | null | undefined): boolean {
  const upper = String(name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /\b(SA|S\.A\.|SAPI|SOCIEDAD|CV|C\.V\.|S DE RL|S\. DE R\.L\.)\b/.test(upper)
}

function extractAdministrativePeopleFromText(rawText: string): string[] {
  const text = String(rawText || '')
  if (!text) return []
  const roles = [
    'ANALISTA',
    'ASALTA',
    'SUBREGISTRADOR',
    'SUBREGISTRADORA',
    'DIRECTOR',
    'DIRECTORA',
    'NOTARIO',
    'NOTARIA',
    'APODERADO',
    'APODERADA',
    'OFICIAL DEL REGISTRO CIVIL',
    'OFICIALIA',
  ]
  const people = new Set<string>()
  for (const role of roles) {
    const re = new RegExp(`\\b${role.replace(/\s+/g, '\\s+')}\\s*[:\\-]\\s*([^\\n\\r]+)`, 'gi')
    for (const match of text.matchAll(re)) {
      const value = String(match?.[1] || '')
        .replace(/\s+/g, ' ')
        .replace(/[.,;:]+$/, '')
        .trim()
      if (!value) continue
      if (value.length < 5) continue
      if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(value)) continue
      people.add(value)
    }
  }
  return Array.from(people.values())
}

function cleanInlineValue(value: string | null | undefined): string | null {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim()
  return cleaned || null
}

function extractFirstLineValue(rawText: string, labelRegex: RegExp): string | null {
  const match = String(rawText || '').match(labelRegex)
  if (!match) return null
  return cleanInlineValue(match[1])
}

function extractLabeledValue(rawText: string, label: string): string | null {
  const text = String(rawText || '')
  if (!text) return null
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const inline = text.match(new RegExp(`\\b${escapedLabel}\\b\\s*[:\\-]\\s*([^\\n\\r]+)`, 'i'))
  if (inline) return cleanInlineValue(inline[1])
  const multiline = text.match(new RegExp(`\\b${escapedLabel}\\b\\s*(?:\\n|\\r\\n)+\\s*([^\\n\\r]{4,})`, 'i'))
  if (multiline) return cleanInlineValue(multiline[1])
  return null
}

function collectIntakeFactValues(intakeFacts: any[] | null | undefined, keys: string[]): string[] {
  if (!Array.isArray(intakeFacts) || intakeFacts.length === 0) return []
  const keySet = new Set(keys.map((k) => String(k || '').trim().toLowerCase()))
  const out = new Set<string>()
  for (const fact of intakeFacts) {
    const k = String(fact?.key || '').trim().toLowerCase()
    if (!keySet.has(k)) continue
    const value = String(fact?.value || '').replace(/\D/g, '')
    if (value) out.add(value)
  }
  return Array.from(out.values())
}

function splitBuyerNamesFromInlineValue(value: string | null | undefined): string[] {
  const input = cleanInlineValue(value)
  if (!input) return []
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  if (!/\s+Y\s+/.test(normalized)) return [input]
  const parts = input
    .split(/\s+Y\s+/i)
    .map((p) => cleanInlineValue(p))
    .filter((p): p is string => Boolean(p))

  if (parts.length < 2) return [input]
  const allLookLikePersonaFisica = parts.every((p) => !looksLikePersonaMoralName(p) && p.split(' ').length >= 2)
  return allLookLikePersonaFisica ? parts : [input]
}

function buildRawTextFromIntakePages(
  pages: Array<{ pageNumber: number; text: string }> | null | undefined
): string {
  if (!Array.isArray(pages) || pages.length === 0) return ''
  return pages
    .slice()
    .sort((a, b) => Number(a.pageNumber || 0) - Number(b.pageNumber || 0))
    .map((p) => `--- PAGINA ${p.pageNumber} ---\n${String(p.text || '').trim()}`)
    .join('\n\n')
    .trim()
}

function enrichStructuredExtractionFromText(args: {
  structured: any
  rawText: string
  documentType: string | null
  intakeFacts?: any[]
  traceId?: string
}): any {
  const sourceDocumentType = normalizeExtractionDocumentType(args.documentType)
  const rawText = String(args.rawText || '')
  const detectedState = detectStateFromText(rawText)
  const folioContextMap = extractFolioContextByBlocks(rawText)
  const next = { ...(args.structured || {}) } as any
  const isFinalPreavisoSource =
    /\bSOLICITUD\s+DE\s+CERTIFICADO\s+CON\s+EFECTO\s+DE\s+PRE[\s-]*AVISO\b/i.test(rawText) ||
    /\bCONTRATO\s+DE\s+COMPRAVENTA\b/i.test(rawText)
  const strictFolioRealCandidates = Array.from(
    new Set(
      Array.from(rawText.matchAll(new RegExp(`\\bFOLIO\\s+REAL\\s*[:#\\-]?\\s*([0-9]{${Math.max(6, Number(process.env.FOLIO_REAL_MIN_DIGITS || 7))},})\\b`, 'gi')))
        .map((m) => String(m?.[1] || '').replace(/\D/g, ''))
        .filter(Boolean)
    )
  )
  const partidaSet = new Set(
    Array.from(rawText.matchAll(/\bPARTIDA\s*[:#\-]?\s*([0-9]{5,})\b/gi))
      .map((m) => String(m?.[1] || '').replace(/\D/g, ''))
      .filter(Boolean)
  )
  const normalizedFolioCandidates = strictFolioRealCandidates
    .filter((folio) => !partidaSet.has(folio))
    .filter((folio) => isFolioAllowedByState(detectedState, folio))
  const folioCandidatesNearUnidad = extractFolioRealCandidatesNearUnidad(rawText)
    .filter((folio) => !partidaSet.has(folio))
    .filter((folio) => isFolioAllowedByState(detectedState, folio))
  const excludedAdministrativePeople = extractAdministrativePeopleFromText(rawText)
  const intakeFacts = Array.isArray(args.intakeFacts) ? args.intakeFacts : []
  const intakeFolioCandidates = collectIntakeFactValues(intakeFacts, [
    'folio_real',
    'folio_real_principal',
    'folio_real_secundario_1',
    'folio_real_secundario_2',
    'foliorealprincipal',
    'foliorealsecundario1',
    'foliorealsecundario2',
  ])
    .filter((folio) => !partidaSet.has(folio))
    .filter((folio) => isFolioAllowedByState(detectedState, folio))
  const allPartidas = Array.from(
    new Set(
      Array.from(rawText.matchAll(/\bPARTIDA\s*[:#\-]?\s*([0-9]{5,})\b/gi))
        .map((m) => String(m?.[1] || '').replace(/\D/g, ''))
        .filter(Boolean)
    )
  )
  const anotacionesText = rawText.split(/\bANOTACIONES\b/i)[1] || ''
  const anotacionesPartidas = new Set(
    Array.from(anotacionesText.matchAll(/\bPARTIDA\s*[:#\-]?\s*([0-9]{5,})\b/gi))
      .map((m) => String(m?.[1] || '').replace(/\D/g, ''))
      .filter(Boolean)
  )
  const headerPartidas = allPartidas.filter((p) => !anotacionesPartidas.has(p))
  const primaryPartida = headerPartidas[0] || allPartidas[0] || null
  let canonicalFolioCandidates = normalizedFolioCandidates
  if (folioCandidatesNearUnidad.length > 0) {
    if (intakeFolioCandidates.length > 0) {
      const intakeSet = new Set(intakeFolioCandidates)
      const intersection = folioCandidatesNearUnidad.filter((f) => intakeSet.has(f))
      canonicalFolioCandidates = intersection.length > 0 ? intersection : folioCandidatesNearUnidad
    } else {
      canonicalFolioCandidates = folioCandidatesNearUnidad
    }
  } else if (intakeFolioCandidates.length > 0) {
    canonicalFolioCandidates = intakeFolioCandidates
  }
  canonicalFolioCandidates = Array.from(new Set(canonicalFolioCandidates))

  // El backend ya conoce el tipo real del archivo; evitar deriva del modelo.
  next.source_document_type = sourceDocumentType

  // Derivaciones deterministas de certificados/correos operativos
  const vendedorNombre = extractLabeledValue(rawText, 'VENDEDOR') || extractLabeledValue(rawText, 'VENDEDORES')
  const propietarioNombre = extractLabeledValue(rawText, 'PROPIETARIO(S)') || extractLabeledValue(rawText, 'PROPIETARIO')
  const compradorInline = extractLabeledValue(rawText, 'COMPRADOR') || extractLabeledValue(rawText, 'COMPRADORES')
  const compradoresDesdeLinea = splitBuyerNamesFromInlineValue(compradorInline)
  const acreditadoNombre = extractFirstLineValue(rawText, /\bACREDITADO\s*[:\-]\s*([^\n\r]+)/i)
  const coacreditadoNombre = extractFirstLineValue(rawText, /\bCOACREDITADO\s*[:\-]\s*([^\n\r]+)/i)
  const acreditanteNombre = extractFirstLineValue(rawText, /\bACREDITANTE\s*[:\-]\s*([^\n\r]+)/i)
  const acreedorCancelacion = extractFirstLineValue(rawText, /\bACREEDOR(?:ES)?\s*[:\-]\s*([^\n\r]+)/i)

  if ((!Array.isArray(next.compradores_detectados) || next.compradores_detectados.length === 0) && compradoresDesdeLinea.length > 0) {
    next.compradores_detectados = compradoresDesdeLinea.map((nombre) => ({ nombre, rfc: null, curp: null }))
  }

  if ((!Array.isArray(next.compradores_detectados) || next.compradores_detectados.length === 0) && acreditadoNombre) {
    next.compradores_detectados = [{ nombre: acreditadoNombre, rfc: null, curp: null }]
  }
  if (
    Array.isArray(next.compradores_detectados) &&
    next.compradores_detectados.length > 0 &&
    coacreditadoNombre
  ) {
    const normalizedExisting = new Set(
      next.compradores_detectados.map((b: any) =>
        String(b?.nombre || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim()
      )
    )
    const normalizedCoacreditado = coacreditadoNombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim()
    if (normalizedCoacreditado && !normalizedExisting.has(normalizedCoacreditado)) {
      next.compradores_detectados = [
        ...next.compradores_detectados,
        { nombre: coacreditadoNombre, rfc: null, curp: null },
      ]
    }
  }

  const sellerLikeName = vendedorNombre || propietarioNombre
  if (!next?.titular_registral?.nombre && sellerLikeName) {
    next.titular_registral = {
      ...(next.titular_registral || {}),
      nombre: sellerLikeName,
      rfc: next?.titular_registral?.rfc ?? null,
      curp: next?.titular_registral?.curp ?? null,
    }
  }

  const creditMatch = rawText.match(/\bCREDITO\s*[:\-]\s*([^\n\r]+)/i)
  const creditoInstitucion =
    normalizeInstitutionName(acreditanteNombre) ||
    normalizeInstitutionName(creditMatch ? creditMatch[1] : null) ||
    detectInstitutionFromText(rawText)

  const rawNormalized = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const isCasadoSociedadConyugal = /\bcasad[oa]\s+en\s+sociedad\s+conyugal\b/.test(rawNormalized)
  const buyerEstadoCivil = isCasadoSociedadConyugal ? 'casado' : null

  next.__derived = {
    ...(next.__derived || {}),
    is_final_preaviso_source: isFinalPreavisoSource,
    vendedor_nombre: vendedorNombre,
    propietario_nombre: propietarioNombre,
    compradores_nombres: compradoresDesdeLinea,
    acreditado_nombre: acreditadoNombre,
    coacreditado_nombre: coacreditadoNombre,
    acreedor_cancelacion: acreedorCancelacion,
    credit_institucion: creditoInstitucion,
    buyer_estado_civil: buyerEstadoCivil,
    folio_real_candidates: canonicalFolioCandidates,
    folio_context_map: folioContextMap,
    excluded_person_names: excludedAdministrativePeople,
  }

  const hasCancellationSection = /\bCANCELACION\s+DE\s+HIPOTECA\b/i.test(rawText)
  const shouldForceEncumbranceFromPreaviso =
    isFinalPreavisoSource && (hasCancellationSection || Boolean(acreedorCancelacion))

  if (shouldForceEncumbranceFromPreaviso) {
    const currentGravamenes = Array.isArray(next?.gravamenes) ? [...next.gravamenes] : []
    const g0 = { ...(currentGravamenes[0] || {}) }
    const institucion = cleanInlineValue(acreedorCancelacion) || cleanInlineValue(g0?.institucion)
    currentGravamenes[0] = {
      gravamen_id: g0?.gravamen_id ?? null,
      tipo: g0?.tipo || 'hipoteca',
      institucion: institucion || null,
      numero_credito: g0?.numero_credito ?? null,
      monto: g0?.monto ?? null,
      moneda: g0?.moneda ?? null,
      cancelacion_confirmada:
        g0?.cancelacion_confirmada === true || g0?.cancelacion_confirmada === false
          ? g0.cancelacion_confirmada
          : false,
    }
    next.gravamenes = currentGravamenes
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: true }
  }

  if (canonicalFolioCandidates.length > 0) {
    next.inmueble = {
      ...(next.inmueble || {}),
      folio_real:
        canonicalFolioCandidates.length > 1
          ? null
          : (next?.inmueble?.folio_real || canonicalFolioCandidates[0] || null),
    }
    if (canonicalFolioCandidates.length > 1) {
      const warnings = Array.isArray(next.warnings) ? [...next.warnings] : []
      const msg = `Se detectaron multiples folios reales en el documento (${canonicalFolioCandidates.join(', ')}). Requiere confirmacion humana.`
      if (!warnings.includes(msg)) warnings.push(msg)
      next.warnings = warnings
    }
  }

  if (sourceDocumentType === 'inscripcion') {
    const existingPartidas = Array.isArray(next?.inmueble?.partidas) ? next.inmueble.partidas : []
    const existingNormalized = existingPartidas
      .map((p: unknown) => String(p || '').replace(/\D/g, ''))
      .filter(Boolean)
    const partidaToKeep = primaryPartida || existingNormalized[0] || null
    const existingValor = String(next?.inmueble?.valor || '').trim()
    let derivedValor: string | null = existingValor || null
    if (!derivedValor) {
      const montoLine =
        rawText.match(/\bMONTO\s*[:\-]\s*(\$\s*[0-9][0-9,.\s]*\s*(?:M\.?N\.?|MXN|PESOS)?)\b/i) ||
        rawText.match(/\bIMPORTE\s*[:\-]\s*(\$\s*[0-9][0-9,.\s]*\s*(?:M\.?N\.?|MXN|PESOS)?)\b/i)
      const montoNumberOnly =
        rawText.match(/\bMONTO\s*[:\-]\s*([0-9][0-9,.\s]*\s*(?:M\.?N\.?|MXN|PESOS)?)\b/i) ||
        rawText.match(/\bIMPORTE\s*[:\-]\s*([0-9][0-9,.\s]*\s*(?:M\.?N\.?|MXN|PESOS)?)\b/i)
      const candidate = String(montoLine?.[1] || montoNumberOnly?.[1] || '')
        .replace(/\s+/g, ' ')
        .trim()
      if (candidate) {
        derivedValor = candidate.startsWith('$') ? candidate : `$${candidate}`
      }
    }
    next.inmueble = {
      ...(next.inmueble || {}),
      partidas: partidaToKeep ? [partidaToKeep] : [],
      valor: derivedValor ?? next?.inmueble?.valor ?? null,
    }
  }

  const hasGravamenesArray = Array.isArray(next?.gravamenes) && next.gravamenes.length > 0
  const isLibre = next?.gravamenes === 'LIBRE'
  if (hasGravamenesArray || isLibre) return next

  const normalizedText = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (/\blibre\s+de\s+gravamen(es)?\b|\bsin\s+gravamen(es)?\b/.test(normalizedText)) {
    next.gravamenes = 'LIBRE'
    return next
  }

  const acreedores = new Set<string>()
  for (const match of rawText.matchAll(/\bACREEDOR(?:ES)?\s*[:\-]\s*([^\n\r]+)/gi)) {
    const value = String(match?.[1] || '').replace(/\s+/g, ' ').trim()
    if (value) acreedores.add(value)
  }

  const montoMatch = rawText.match(/\bMONTO\s+DEL\s+CREDITO\s*[:\-]\s*\$?\s*([0-9][0-9,.\s]*)\s*([A-ZÁÉÍÓÚÑ\s]+)?/i)
  const monto = montoMatch ? String(montoMatch[1] || '').replace(/\s+/g, ' ').trim() : null
  const moneda = montoMatch ? String(montoMatch[2] || '').replace(/\s+/g, ' ').trim() || null : null
  const tipo =
    /\bHIPOTECA(?:RIA)?\b/i.test(rawText) || /\bGARANTIA\s+HIPOTECARIA\b/i.test(rawText)
      ? 'hipoteca'
      : null

  if (acreedores.size > 0 || monto || tipo) {
    const list = Array.from(acreedores)
    next.gravamenes = (list.length > 0 ? list : [null]).map((institucion) => ({
      institucion: institucion || null,
      monto: monto || null,
      moneda,
      tipo,
    }))
  }

  return next
}

async function runDeferredPostProcess(input: DeferredPostProcessInput): Promise<void> {
  const asyncStartedAt = Date.now()
  const userIdForLogs = input.authUserId || 'system'

  try {
    const { createServerClient } = await import('@/lib/supabase')
    const supabase = createServerClient()

    if (!input.conversationId) {
      await ActivityLogService.logDocumentProcessingStage({
        userId: userIdForLogs,
        sessionId: input.conversationId || undefined,
        tramiteId: input.tramiteId || undefined,
        traceId: input.traceId,
        stage: 'postprocess_async',
        status: 'skipped',
        durationMs: Date.now() - asyncStartedAt,
        metadata: {
          reason: 'missing_conversation_id',
          document_type: input.documentType
        }
      })
      return
    }

    const processingFingerprint = buildProcessingFingerprint({
      sessionId: input.conversationId,
      tramiteId: input.tramiteId,
      documentType: input.documentType,
      fileName: input.file.name,
      fileSize: input.file.size,
      extractedData: input.extractedData
    })

    let documento: any = null
    if (input.documentoId) {
      const { data: documentoById } = await supabase
        .from('documentos')
        .select('*')
        .eq('id', input.documentoId)
        .single()
      if (documentoById) {
        documento = documentoById
      }
    }

    if (!documento) {
      documento = await DocumentoService.findDocumentoByProcessingFingerprint(processingFingerprint)
    }
    if (!documento && input.conversationId) {
      try {
        const existingInSession = await findExistingDocumentoInSessionByFile(
          supabase,
          input.conversationId,
          input.file
        )
        if (existingInSession) {
          documento = existingInSession
          const currentMetadata =
            existingInSession?.metadata && typeof existingInSession.metadata === 'object'
              ? existingInSession.metadata
              : {}
          const mergedMetadata = {
            ...currentMetadata,
            extracted_data: input.extractedData,
            processing_fingerprint: processingFingerprint,
            trace_id: input.traceId,
            conversation_id: input.conversationId,
            via: currentMetadata?.via || 'preaviso_chat',
          }
          await supabase
            .from('documentos')
            .update({ metadata: mergedMetadata })
            .eq('id', existingInSession.id)

        }
      } catch (dedupeError) {
        console.error('[preaviso-process-document] dedupe_session_lookup_error', {
          trace_id: input.traceId,
          file_name: input.file.name,
          ...toSafeError(dedupeError),
        })
      }
    }
    if (!documento) {
      const { data: insertedDocumento, error: docError } = await supabase
        .from('documentos')
        .insert({
          tipo: input.documentType,
          nombre: input.file.name,
          s3_key: `chat/${input.conversationId}/${input.file.name}`,
          s3_bucket: process.env.S3_BUCKET || 'notary-documents',
          ["tama\u00f1o"]: input.file.size,
          mime_type: input.file.type || 'application/pdf',
          metadata: {
            extracted_data: input.extractedData,
            processing_fingerprint: processingFingerprint,
            trace_id: input.traceId,
            via: 'preaviso_chat'
          }
        })
        .select()
        .single()

      if (docError || !insertedDocumento) {
        throw new Error(`document_insert_failed: ${docError?.message || 'unknown_error'}`)
      }
      documento = insertedDocumento
    }

    const { error: linkError } = await supabase
      .from('chat_session_documents')
      .upsert({
        session_id: input.conversationId,
        documento_id: documento.id,
        uploaded_by: input.authUserId,
        metadata: {
          document_type: input.documentType,
          extraction_success: true,
          tramite_id: input.tramiteId,
          trace_id: input.traceId
        }
      }, {
        onConflict: 'session_id,documento_id',
        ignoreDuplicates: true
      })

    if (linkError) {
      throw new Error(`chat_session_link_failed: ${linkError.message}`)
    }

    if (input.tramiteId) {
      const { error: tramiteLinkError } = await supabase
        .from('tramite_documentos')
        .upsert(
          {
            tramite_id: input.tramiteId,
            documento_id: documento.id,
          },
          {
            onConflict: 'tramite_id,documento_id',
            ignoreDuplicates: true,
          }
        )
      if (tramiteLinkError) {
        throw new Error(`tramite_document_link_failed: ${tramiteLinkError.message}`)
      }
    }

    await ActivityLogService.logDocumentUpload({
      userId: userIdForLogs,
      sessionId: String(input.conversationId),
      tramiteId: input.tramiteId || undefined,
      documentoId: documento.id,
      fileName: input.file.name,
      fileSize: input.file.size,
      mimeType: input.file.type || 'application/pdf'
    })

    let indexingStatus: string | null = null
    let chunksCreated = 0
    let embeddingsCreated = 0
    let indexingExtractionSource: string | null = null
    let indexingNeedsOcrReason: string | null = null
    try {
      const indexingService = new DocumentIndexingService()
      const indexingResult = await indexingService.indexDocument({
        documentoId: documento.id,
        forceReindex: false,
        traceId: input.traceId,
        userId: userIdForLogs
      })
      indexingStatus = indexingResult.status
      chunksCreated = indexingResult.chunks_created
      embeddingsCreated = indexingResult.embeddings_created
      indexingExtractionSource = indexingResult.extraction_source || null
      indexingNeedsOcrReason = indexingResult.needs_ocr_reason || null
    } catch (indexError) {
      const safeIndexError = toSafeError(indexError)
      indexingStatus = 'error'
      console.error('[preaviso-process-document] indexing error', {
        trace_id: input.traceId,
        documento_id: documento.id,
        code: safeIndexError.code,
        message: safeIndexError.message
      })
    }

    const postprocessAsyncMs = Date.now() - asyncStartedAt
    
    await ActivityLogService.logDocumentProcessingStage({
      userId: userIdForLogs,
      sessionId: input.conversationId || undefined,
      tramiteId: input.tramiteId || undefined,
      documentoId: documento.id,
      traceId: input.traceId,
      stage: 'postprocess_async',
      status: 'success',
      durationMs: postprocessAsyncMs,
      metadata: {
        document_type: input.documentType,
        indexing_status: indexingStatus,
        indexing_extraction_source: indexingExtractionSource,
        indexing_needs_ocr_reason: indexingNeedsOcrReason,
        chunks_created: chunksCreated,
        embeddings_created: embeddingsCreated
      }
    })
  } catch (error) {
    const safeError = toSafeError(error)
    const postprocessAsyncMs = Date.now() - asyncStartedAt

    console.error('[preaviso-process-document] deferred postprocess error', {
      trace_id: input.traceId,
      postprocess_async_ms: postprocessAsyncMs,
      code: safeError.code,
      message: safeError.message
    })

    await ActivityLogService.logDocumentProcessingStage({
      userId: userIdForLogs,
      sessionId: input.conversationId || undefined,
      tramiteId: input.tramiteId || undefined,
      traceId: input.traceId,
      stage: 'postprocess_async',
      status: 'error',
      durationMs: postprocessAsyncMs,
      metadata: {
        document_type: input.documentType,
        error_code: safeError.code || 'unknown',
        error_message: safeError.message
      }
    })
  }
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now()
  const traceId = randomUUID()

  // Import createServerClient here, as it's only used in fallback logic
  const { createServerClient } = await import('@/lib/supabase')

  try {
    const usuario = await getCurrentUserFromRequest(req)
    let authUserId: string | null = usuario?.auth_user_id || null

    const formData = await req.formData()
    let file = formData.get('file') as File | null
    const documentoIdRaw = formData.get('documentoId') as string | null
    const documentoId = String(documentoIdRaw || '').trim() || null
    const documentType = formData.get('documentType') as string | null
    const contextRaw = formData.get('context') as string | null
    const tramiteIdRaw = (formData.get('tramiteId') as string | null) || 'preaviso'
    const needOcr = (formData.get('needOcr') as string | null) || null

    let pluginId = 'preaviso'
    if (tramiteIdRaw && typeof tramiteIdRaw === 'string') {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tramiteIdRaw)
      if (!isUUID) {
        pluginId = tramiteIdRaw
      } else {
        let contextTmp: any = null
        if (contextRaw) {
          try {
            contextTmp = JSON.parse(contextRaw)
          } catch {
            contextTmp = null
          }
        }
        const contextTipo = contextTmp?.tipoOperacion || contextTmp?.tipo
        if (contextTipo === 'preaviso' || !contextTipo) {
          pluginId = 'preaviso'
        } else {
          pluginId = 'preaviso'
        }
      }
    }

    if (!file && documentoId) {
      try {
        const supabase = createServerClient()
        const { data: documento, error: documentoError } = await supabase
          .from('documentos')
          .select('id, nombre, mime_type')
          .eq('id', documentoId)
          .single()

        if (documentoError || !documento) {
          return NextResponse.json(
            { error: 'not_found', message: 'documentoId not found' },
            { status: 404 }
          )
        }

        const signedUrl = await DocumentoService.getDocumentoUrl(documentoId, 900)
        const downloadResp = await fetch(signedUrl)
        if (!downloadResp.ok) {
          return NextResponse.json(
            { error: 'bad_request', message: 'failed to download documentoId from storage' },
            { status: 400 }
          )
        }
        const downloadedBytes = new Uint8Array(await downloadResp.arrayBuffer())
        file = new File([downloadedBytes], String(documento.nombre || `documento-${documentoId}.pdf`), {
          type: String(documento.mime_type || downloadResp.headers.get('content-type') || 'application/pdf'),
          lastModified: Date.now(),
        })
      } catch (resolveError) {
        return NextResponse.json(
          { error: 'bad_request', message: `failed to resolve documentoId: ${toSafeError(resolveError).message}` },
          { status: 400 }
        )
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: 'bad_request', message: 'file or documentoId is required' },
        { status: 400 }
      )
    }

    if (!documentType) {
      return NextResponse.json(
        { error: 'bad_request', message: 'documentType is required' },
        { status: 400 }
      )
    }

    let context: any = null
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw)
      } catch {
        context = null
      }
    }
    const deferStructuredExtraction = context?._defer_structured_extraction === true

    if (!authUserId && context?.tramiteId) {
      try {
        const supabase = createServerClient()
        const { data: tramite } = await supabase
          .from('tramites')
          .select('usuario_id')
          .eq('id', context.tramiteId)
          .single()

        if (tramite?.usuario_id) {
          const { data: userRecord } = await supabase
            .from('usuarios')
            .select('auth_user_id')
            .eq('id', tramite.usuario_id)
            .single()

          authUserId = userRecord?.auth_user_id || null
        }
      } catch (error) {
        console.error('[preaviso-process-document] fallback userId error', {
          trace_id: traceId,
          ...toSafeError(error)
        })
      }
    }

    if (authUserId && context) {
      context._userId = authUserId
    } else if (authUserId) {
      context = { _userId: authUserId }
    }

    try {
      const conversationIdIncoming = context?.conversation_id || null
          } catch {
      // ignore debug logging issues
    }

    const tramiteSystem = getTramiteSystem()
    const extractionAgent = new ExtractionAgent()
    const extractStartedAt = Date.now()
    const phaseTimings: {
      text_probe_ms: number | null
      intake_ms: number | null
      ocr_ms: number | null
      extraction_ms: number | null
      extraction_phase: 'text_first' | 'ocr_or_intake' | null
    } = {
      text_probe_ms: null,
      intake_ms: null,
      ocr_ms: null,
      extraction_ms: null,
      extraction_phase: null,
    }
    let result: { data: any; commands: any[]; extractedData?: any; meta?: any }
    const fileBytes = new Uint8Array(await file.arrayBuffer())
    if (isImageLikeFile(file)) {
      result = await tramiteSystem.processDocument(
        pluginId,
        file,
        documentType,
        context || {}
      )
    } else {
      const isPdf = String(file.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name)
      if (!isPdf) {
        result = await tramiteSystem.processDocument(
          pluginId,
          file,
          documentType,
          context || {}
        )
      } else {
        let intakeRawText = ''
        let intakeMeta: any = null

        // Textract como núcleo OCR. Intake se usa sólo como fallback.
        const runIntakePdfNow = async (): Promise<void> => {
          if (String(intakeRawText || '').trim()) return
          try {
            const intakeStartedAt = Date.now()
            const intakeService = new DocumentIntakeService()
            const intakeResult = await intakeService.processBatch({
              traceId,
              documents: [
                {
                  documentId: `adhoc:${traceId}:${file.name}`,
                  filename: file.name,
                  mimeType: file.type || 'application/pdf',
                  file: new File([fileBytes], file.name, {
                    type: file.type || 'application/pdf',
                    lastModified: Date.now(),
                  }),
                },
              ],
              options: {
                maxPages: 20,
                storeChunks: true,
                tramiteId: context?.tramiteId || null,
                sessionId: context?.conversation_id || null,
              },
            })
            const intakeDoc = intakeResult.documents[0]
            intakeRawText = buildRawTextFromIntakePages(intakeDoc?.pages)
            phaseTimings.intake_ms = Date.now() - intakeStartedAt
            intakeMeta = {
              trace_id: intakeResult.traceId,
              detected_type: intakeDoc?.detectedType || null,
              confidence: intakeDoc?.confidence || null,
              pages: Array.isArray(intakeDoc?.pages) ? intakeDoc.pages.length : 0,
              summary: Array.isArray(intakeDoc?.summary) ? intakeDoc.summary : [],
              facts: intakeDoc?.facts || [],
              rules: intakeResult.rules,
            }
          } catch (intakeError) {
            console.error('[preaviso-process-document] intake_pdf_error', {
              trace_id: traceId,
              file_name: file.name,
              ...toSafeError(intakeError),
            })
          }
        }

        const textractAttempt = await extractPdfTextWithAsyncOcr(file, traceId, fileBytes)
        const textractText = String(textractAttempt?.text || '').trim()
        if (!textractText) {
          await runIntakePdfNow()
        }
        const ocrAttempt = textractText
          ? textractAttempt
          : intakeRawText
            ? { text: intakeRawText, source: 'document_intake_pdf' as const, reason: null, elapsed_ms: 0 }
            : textractAttempt

        phaseTimings.ocr_ms = Number(ocrAttempt?.elapsed_ms || 0)
        const ocrText = String(ocrAttempt?.text || '').trim()
        if (ocrText) {
          if (deferStructuredExtraction) {
            result = {
              data: context || {},
              commands: [],
              extractedData: {
                textoCompleto: ocrText,
                _source_extraction: ocrAttempt.source || 'ocr_async_pdf',
                _ocr_debug: {
                  reason: ocrAttempt.reason,
                  elapsed_ms: ocrAttempt.elapsed_ms,
                  source: ocrAttempt.source,
                },
                _intake_debug: intakeMeta,
                _deferred_structured_extraction: true,
              },
              meta: {
                text_first: false,
                extraction_source: ocrAttempt.source || 'ocr_async_pdf',
                text_debug: null,
                deferred_structured_extraction: true,
                warnings: [],
              },
            }
          } else {
            const extractionStartedAt = Date.now()
            const extraction = await extractionAgent.extract({
              tramiteType: 'preaviso',
              documentId: `adhoc:${traceId}:${file.name}`,
              rawText: ocrText,
              fileMeta: {
                file_name: file.name,
                mime_type: file.type || 'application/octet-stream',
                source_document_type: documentType,
                source_extraction: ocrAttempt.source || 'ocr_async_pdf',
                intake_rules: intakeMeta?.rules || null,
                intake_facts: intakeMeta?.facts || null,
                intake_detected_type: intakeMeta?.detected_type || null,
                intake_confidence: intakeMeta?.confidence || null,
              },
              auditContext: {
                userId: authUserId || null,
                tramiteId: context?.tramiteId || null,
                traceId,
              },
            })
            phaseTimings.extraction_ms = Date.now() - extractionStartedAt
            phaseTimings.extraction_phase = 'ocr_or_intake'
            const enrichedStructured = enrichStructuredExtractionFromText({
              structured: extraction.structured,
              rawText: ocrText,
              documentType,
              intakeFacts: intakeMeta?.facts || [],
              traceId,
            })

            result = {
              data: mergeExtractedIntoContext(context || {}, enrichedStructured),
              commands: [],
              extractedData: {
                ...(enrichedStructured || {}),
                textoCompleto: ocrText,
                _source_extraction: ocrAttempt.source || 'ocr_async_pdf',
                _ocr_debug: {
                  reason: ocrAttempt.reason,
                  elapsed_ms: ocrAttempt.elapsed_ms,
                  source: ocrAttempt.source,
                },
                _intake_debug: intakeMeta,
                _trace_id: extraction.trace_id,
              },
              meta: {
                text_first: false,
                extraction_source: ocrAttempt.source || 'ocr_async_pdf',
                text_debug: null,
                warnings: extraction.warnings || [],
              },
            }
          }
        } else {
          result = {
            data: context || {},
            commands: [],
            extractedData: {
              textoCompleto: '',
              _source_extraction: ocrAttempt.source || 'none',
              _needs_ocr_reason: ocrAttempt.reason || 'text_not_usable',
              _requires_ocr: true,
              _ocr_debug: {
                reason: ocrAttempt.reason,
                elapsed_ms: ocrAttempt.elapsed_ms,
                source: ocrAttempt.source,
              },
              _text_debug: null,
            },
            meta: {
              text_first: false,
              requires_ocr: true,
              extraction_source: ocrAttempt.source || 'none',
              needs_ocr_reason: ocrAttempt.reason || 'text_not_usable',
              text_debug: null,
            },
          }
        }
      }
    }
    const extractSyncMs = Date.now() - extractStartedAt

    const conversationId = context?.conversation_id || null
    const tramiteId = context?.tramiteId || null
    const userIdForLogs = authUserId || 'system'

    
    await ActivityLogService.logDocumentProcessingStage({
      userId: userIdForLogs,
      sessionId: conversationId || undefined,
      tramiteId: tramiteId || undefined,
      traceId,
      stage: 'extract_sync',
      status: 'success',
      durationMs: extractSyncMs,
      metadata: {
        document_type: documentType,
        file_name: file.name,
        file_size: file.size
      }
    })

    await ActivityLogService.logDocumentProcessingStage({
      userId: userIdForLogs,
      sessionId: conversationId || undefined,
      tramiteId: tramiteId || undefined,
      traceId,
      stage: 'postprocess_async',
      status: 'queued',
      durationMs: 0,
      metadata: {
        document_type: documentType
      }
    })

    setTimeout(() => {
      void runDeferredPostProcess({
        traceId,
        authUserId,
        conversationId,
        tramiteId,
        documentoId,
        documentType,
        file,
        extractedData: result.extractedData || null
      })
    }, 0)

    if (needOcr === '1') {
      try {
              } catch (error) {
        console.error('[preaviso-process-document] OCR logging error', {
          trace_id: traceId,
          ...toSafeError(error)
        })
      }
    }

    const requestLatencyMs = Date.now() - requestStartedAt
    return NextResponse.json({
      data: result.data,
      extractedData: result.extractedData || null,
      commands: result.commands.map((c: any) => c.type),
      message: 'Documento procesado correctamente',
      trace_id: traceId,
      timings: {
        extract_sync_ms: extractSyncMs,
        request_total_ms: requestLatencyMs,
        postprocess_async_state: 'queued',
        phase_ms: phaseTimings,
      }
    })

  } catch (error: unknown) {
    const safeError = toSafeError(error)
    console.error('[preaviso-process-document] Error', {
      trace_id: traceId,
      code: safeError.code,
      message: safeError.message
    })

    return NextResponse.json(
      {
        error: 'internal_error',
        message: safeError.message || 'Error procesando documento',
        trace_id: traceId
      },
      { status: 500 }
    )
  }
}



