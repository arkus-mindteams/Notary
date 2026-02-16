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

      console.info('[preaviso-process-document] text_first_extraction_summary', {
        trace_id: traceId,
        file_name: file.name,
        folio_real: extraction?.structured?.inmueble?.folio_real ?? null,
        partidas_count: Array.isArray(extraction?.structured?.inmueble?.partidas)
          ? extraction.structured.inmueble.partidas.length
          : 0,
        source_refs_count: Array.isArray(extraction?.source_refs) ? extraction.source_refs.length : 0,
        warnings_count: Array.isArray(extraction?.warnings) ? extraction.warnings.length : 0,
      })

      result = {
        data: mergeExtractedIntoContext(context || {}, extraction.structured),
        commands: [],
        extractedData: {
          ...(extraction.structured || {}),
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



