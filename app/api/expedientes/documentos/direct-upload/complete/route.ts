import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import type { TipoDocumento } from '@/lib/types/expediente-types'
import { ActivityLogService } from '@/lib/services/activity-log-service'

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'No autenticado', details: {} } },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => null)
    const key = String(body?.key || '').trim()
    const bucket = String(body?.bucket || process.env.AWS_S3_BUCKET || process.env.OCR_S3_BUCKET || '').trim()
    const fileName = String(body?.fileName || '').trim()
    const fileType = String(body?.fileType || '').trim() || 'application/octet-stream'
    const fileSize = Number(body?.fileSize || 0)
    const tipo = String(body?.tipo || '').trim() as TipoDocumento
    const tramiteId = String(body?.tramiteId || '').trim() || null
    const sessionId = String(body?.sessionId || '').trim() || null
    const compradorId = String(body?.compradorId || '').trim() || null
    const metadataInput = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}

    if (!key || !bucket || !fileName || !tipo || !fileSize) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'key, bucket, fileName, fileType, fileSize y tipo son requeridos', details: {} } },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const metadata = {
      ...metadataInput,
      conversation_id: sessionId || metadataInput?.conversation_id || null,
      via: 'direct_upload',
    }

    const { data: documento, error: documentoError } = await supabase
      .from('documentos')
      .insert({
        comprador_id: compradorId || null,
        usuario_id: currentUser.id,
        tipo,
        nombre: fileName,
        s3_key: key,
        s3_bucket: bucket,
        ["tamaño"]: fileSize,
        mime_type: fileType,
        metadata,
      })
      .select()
      .single()

    if (documentoError || !documento) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: documentoError?.message || 'No se pudo guardar documento', details: {} } },
        { status: 500 }
      )
    }

    if (sessionId) {
      await supabase
        .from('chat_session_documents')
        .upsert({
          session_id: sessionId,
          documento_id: documento.id,
          uploaded_by: currentUser.auth_user_id || null,
          metadata: {
            via: 'direct_upload_complete',
            original_type: tipo,
            tramite_id: tramiteId,
          },
        }, {
          onConflict: 'session_id,documento_id',
          ignoreDuplicates: true,
        })
    }

    if (tramiteId) {
      await supabase
        .from('tramite_documentos')
        .upsert(
          {
            tramite_id: tramiteId,
            documento_id: documento.id,
          },
          {
            onConflict: 'tramite_id,documento_id',
            ignoreDuplicates: true,
          }
        )
    }

    if (currentUser?.auth_user_id) {
      ActivityLogService.logDocumentUpload({
        userId: currentUser.auth_user_id,
        sessionId: sessionId || undefined,
        tramiteId: tramiteId || undefined,
        documentoId: documento.id,
        fileName,
        fileSize,
        mimeType: fileType,
      }).catch(() => {})
    }

    return NextResponse.json(documento, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error?.message || 'Error completando subida directa',
          details: {},
        },
      },
      { status: 500 }
    )
  }
}

