/**
 * Endpoint de procesamiento de documentos usando Plugin System
 */

import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { ActivityLogService } from '@/lib/services/activity-log-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentoService } from '@/lib/services/documento-service'
import { DocumentIndexingService } from '@/lib/services/document-indexing-service'
import { DocumentTextExtractor } from '@/lib/services/document-text-extractor'
import { ExtractionAgent } from '@/lib/ai/extraction/extraction-agent'

type DeferredPostProcessInput = {
  traceId: string
  authUserId: string | null
  conversationId: string | null
  tramiteId: string | null
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

function mergeExtractedIntoContext(context: any, structured: any): any {
  const next = { ...(context || {}) }
  const inmueble = structured?.inmueble || {}
  const direccion = inmueble?.direccion || {}
  const datosCatastrales = inmueble?.datos_catastrales || {}

  next.inmueble = {
    ...(next.inmueble || {}),
    folio_real: inmueble?.folio_real ?? next?.inmueble?.folio_real ?? null,
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

  if (structured?.titular_registral?.nombre) {
    const vendedor = {
      party_id: 'vendedor_1',
      persona_fisica: {
        nombre: structured.titular_registral.nombre,
        rfc: structured?.titular_registral?.rfc ?? null,
        curp: structured?.titular_registral?.curp ?? null,
      },
      titular_registral_confirmado: true,
    }
    const existing = Array.isArray(next.vendedores) ? next.vendedores : []
    next.vendedores = existing.length > 0 ? [{ ...existing[0], ...vendedor }] : [vendedor]
  }

  const compradoresDetectados = Array.isArray(structured?.compradores_detectados)
    ? structured.compradores_detectados.filter((p: any) => p?.nombre)
    : []
  if (compradoresDetectados.length > 0) {
    const existing = Array.isArray(next.compradores) ? next.compradores : []
    const merged = [...existing]
    for (let i = 0; i < compradoresDetectados.length; i++) {
      const buyer = compradoresDetectados[i]
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

  const derivedBuyerName = String(structured?.__derived?.acreditado_nombre || '').trim()
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

  if (structured?.gravamenes === 'LIBRE') {
    next.gravamenes = []
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: false }
  } else if (Array.isArray(structured?.gravamenes) && structured.gravamenes.length > 0) {
    next.gravamenes = structured.gravamenes
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: true }
  }

  return next
}

function isImageLikeFile(file: File): boolean {
  const mime = String(file.type || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const name = String(file.name || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)
}

function detectFoliosFromText(rawText: string): string[] {
  const text = String(rawText || '')
  if (!text) return []
  const patterns = [
    /\bfolio\s*real\s*[:#-]?\s*([0-9]{5,})\b/gi,
    /\bfolio\s*[:#-]?\s*([0-9]{5,})\b/gi,
    /\bmatr[ií]cula\s*[:#-]?\s*([0-9]{5,})\b/gi,
  ]
  const found = new Set<string>()
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const folio = String(match?.[1] || '').trim()
      if (folio) found.add(folio)
    }
  }
  return Array.from(found)
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

function enrichStructuredExtractionFromText(args: {
  structured: any
  rawText: string
  documentType: string | null
}): any {
  const sourceDocumentType = normalizeExtractionDocumentType(args.documentType)
  const rawText = String(args.rawText || '')
  const next = { ...(args.structured || {}) } as any

  // El backend ya conoce el tipo real del archivo; evitar deriva del modelo.
  next.source_document_type = sourceDocumentType

  // Derivaciones deterministas de certificados/correos operativos
  const acreditadoMatch = rawText.match(/\bACREDITADO\s*[:\-]\s*([^\n\r]+)/i)
  const acreditadoNombre = acreditadoMatch ? String(acreditadoMatch[1] || '').replace(/\s+/g, ' ').trim() : null
  if ((!Array.isArray(next.compradores_detectados) || next.compradores_detectados.length === 0) && acreditadoNombre) {
    next.compradores_detectados = [{ nombre: acreditadoNombre, rfc: null, curp: null }]
  }

  const creditMatch = rawText.match(/\bCREDITO\s*[:\-]\s*([^\n\r]+)/i)
  const creditoInstitucion =
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
    acreditado_nombre: acreditadoNombre,
    credit_institucion: creditoInstitucion,
    buyer_estado_civil: buyerEstadoCivil,
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

    let documento = await DocumentoService.findDocumentoByProcessingFingerprint(processingFingerprint)
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

    console.info('[preaviso-process-document] indexing debug', {
      trace_id: input.traceId,
      documento_id: documento.id,
      status: indexingStatus,
      extraction_source: indexingExtractionSource,
      needs_ocr_reason: indexingNeedsOcrReason,
      chunks_created: chunksCreated,
      embeddings_created: embeddingsCreated,
    })

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
    const file = formData.get('file') as File | null
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

    if (!file) {
      return NextResponse.json(
        { error: 'bad_request', message: 'file is required' },
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
    const textExtractor = new DocumentTextExtractor()
    const extractionAgent = new ExtractionAgent()
    const extractStartedAt = Date.now()
    let result: { data: any; commands: any[]; extractedData?: any; meta?: any }
    const textResult = await textExtractor.extractFromFile(file, { allowOcrFallback: false })
    console.info('[preaviso-process-document] text_first_probe', {
      trace_id: traceId,
      file_name: file.name,
      mime_type: file.type || 'unknown',
      source: textResult.source,
      needs_ocr: textResult.needs_ocr,
      reason: textResult.reason || null,
      text_length: String(textResult.text || '').length,
      text_debug: textResult.debug || null,
    })

    if (!textResult.needs_ocr && textResult.text?.trim()) {
      const regexFolios = detectFoliosFromText(textResult.text)
      console.info('[preaviso-process-document] text_first_folio_probe', {
        trace_id: traceId,
        file_name: file.name,
        regex_folios_detected: regexFolios.length,
        regex_folios_sample: regexFolios.slice(0, 10),
      })

      const extraction = await extractionAgent.extract({
        tramiteType: 'preaviso',
        documentId: `adhoc:${traceId}:${file.name}`,
        rawText: textResult.text,
        fileMeta: {
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          source_document_type: documentType,
          source_extraction: textResult.source,
        },
        auditContext: {
          userId: authUserId || null,
          tramiteId: context?.tramiteId || null,
          traceId,
        },
      })
      const enrichedStructured = enrichStructuredExtractionFromText({
        structured: extraction.structured,
        rawText: textResult.text,
        documentType,
      })

      console.info('[preaviso-process-document] text_first_extraction_summary', {
        trace_id: traceId,
        file_name: file.name,
        folio_real: enrichedStructured?.inmueble?.folio_real ?? null,
        partidas_count: Array.isArray(enrichedStructured?.inmueble?.partidas)
          ? enrichedStructured.inmueble.partidas.length
          : 0,
        gravamenes_count: Array.isArray(enrichedStructured?.gravamenes) ? enrichedStructured.gravamenes.length : 0,
        source_refs_count: Array.isArray(extraction?.source_refs) ? extraction.source_refs.length : 0,
        warnings_count: Array.isArray(extraction?.warnings) ? extraction.warnings.length : 0,
      })

      result = {
        data: mergeExtractedIntoContext(context || {}, enrichedStructured),
        commands: [],
        extractedData: {
          ...(enrichedStructured || {}),
          textoCompleto: textResult.text,
          _source_extraction: textResult.source,
          _trace_id: extraction.trace_id,
        },
        meta: {
          text_first: true,
          extraction_source: textResult.source,
          text_debug: textResult.debug || null,
          warnings: extraction.warnings || [],
        }
      }
    } else {
      if (isImageLikeFile(file)) {
        result = await tramiteSystem.processDocument(
          pluginId,
          file,
          documentType,
          context || {}
        )
      } else {
        // No enviar PDFs/DOCX sin texto utilizable a Vision (espera imagen MIME).
        result = {
          data: context || {},
          commands: [],
          extractedData: {
            textoCompleto: '',
            _source_extraction: textResult.source,
            _needs_ocr_reason: textResult.reason || 'text_not_usable',
            _requires_ocr: true,
            _text_debug: textResult.debug || null,
          },
          meta: {
            text_first: false,
            requires_ocr: true,
            extraction_source: textResult.source,
            needs_ocr_reason: textResult.reason || 'text_not_usable',
            text_debug: textResult.debug || null,
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
    console.info('[preaviso-process-document] response_summary', {
      trace_id: traceId,
      file_name: file.name,
      folio_real: result?.data?.inmueble?.folio_real ?? null,
      partidas_count: Array.isArray(result?.data?.inmueble?.partidas) ? result.data.inmueble.partidas.length : 0,
      tramite_id: result?.data?.tramiteId ?? context?.tramiteId ?? null,
      text_first: result?.meta?.text_first === true,
      extraction_source: result?.meta?.extraction_source || null,
    })

    return NextResponse.json({
      data: result.data,
      extractedData: result.extractedData || null,
      commands: result.commands.map((c: any) => c.type),
      message: 'Documento procesado correctamente',
      trace_id: traceId,
      timings: {
        extract_sync_ms: extractSyncMs,
        request_total_ms: requestLatencyMs,
        postprocess_async_state: 'queued'
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



