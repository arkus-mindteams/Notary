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
    const extractStartedAt = Date.now()
    const result = await tramiteSystem.processDocument(
      pluginId,
      file,
      documentType,
      context || {}
    )
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



