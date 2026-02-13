import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentIndexingService } from '@/lib/services/document-indexing-service'
import { ActivityLogService } from '@/lib/services/activity-log-service'

const bodySchema = z
  .object({
    forceReindex: z.boolean().optional(),
  })
  .strict()

const defaultDeps = {
  getCurrentUserFromRequest,
  getDocumentAuthorization: async (documentoId: string, currentUser: any) => {
    const supabase = createServerClient()
    const { data: documento, error: docError } = await supabase
      .from('documentos')
      .select('id,usuario_id')
      .eq('id', documentoId)
      .maybeSingle()

    if (docError) throw new Error(`document_lookup_failed:${docError.message}`)
    if (!documento) return { exists: false, allowed: false }

    if (currentUser.rol === 'superadmin') {
      return { exists: true, allowed: true }
    }

    if (documento.usuario_id && String(documento.usuario_id) === String(currentUser.id)) {
      return { exists: true, allowed: true }
    }

    const { data: links, error: linkError } = await supabase
      .from('tramite_documentos')
      .select('tramites!inner(usuario_id,user_id)')
      .eq('documento_id', documentoId)

    if (linkError) {
      throw new Error(`document_links_lookup_failed:${linkError.message}`)
    }

    const allowedByTramite = (links || []).some((row: any) => {
      const tramite = row.tramites
      return (
        String(tramite?.usuario_id || '') === String(currentUser.id) ||
        String(tramite?.user_id || '') === String(currentUser.id)
      )
    })

    return { exists: true, allowed: allowedByTramite }
  },
  indexDocument: async (args: {
    documentoId: string
    forceReindex: boolean
    traceId: string
    userId: string
  }) => {
    const service = new DocumentIndexingService()
    return service.indexDocument({
      documentoId: args.documentoId,
      forceReindex: args.forceReindex,
      traceId: args.traceId,
      userId: args.userId,
    })
  },
}

type RouteDeps = typeof defaultDeps

function errorResponse(
  status: number,
  code: string,
  message: string,
  traceId: string,
  details: Record<string, any> = {}
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details,
        trace_id: traceId,
      },
    },
    { status }
  )
}

export function createDocumentIndexRouteHandler(deps: RouteDeps = defaultDeps) {
  return async function POST(
    req: Request,
    { params }: { params: { id: string } | Promise<{ id: string }> }
  ) {
    const traceId = randomUUID()
    const requestStartedAt = Date.now()

    try {
      const currentUser = await deps.getCurrentUserFromRequest(req)
      if (!currentUser || !currentUser.activo) {
        return errorResponse(401, 'UNAUTHORIZED', 'No autenticado', traceId)
      }

      const rawBody = await req.json().catch(() => ({}))
      const parsed = bodySchema.safeParse(rawBody)
      if (!parsed.success) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Body invalido', traceId, {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        })
      }

      const resolvedParams = await Promise.resolve(params)
      const documentoId = resolvedParams.id
      const forceReindex = Boolean(parsed.data.forceReindex)
      const auth = await deps.getDocumentAuthorization(documentoId, currentUser)

      if (!auth.exists) {
        return errorResponse(404, 'NOT_FOUND', 'Documento no encontrado', traceId)
      }
      if (!auth.allowed) {
        return errorResponse(403, 'FORBIDDEN', 'No autorizado para indexar este documento', traceId)
      }

      const result = await deps.indexDocument({
        documentoId,
        forceReindex,
        traceId,
        userId: currentUser.auth_user_id || 'system',
      })

      await ActivityLogService.logDocumentIndexing({
        userId: currentUser.auth_user_id || 'system',
        traceId,
        documentoId,
        stage: 'request',
        status: 'success',
        durationMs: Date.now() - requestStartedAt,
        metadata: {
          status: result.status,
          chunks_created: result.chunks_created,
          embeddings_created: result.embeddings_created,
          force_reindex: forceReindex,
        },
      })

      return NextResponse.json({
        chunks_created: result.chunks_created,
        embeddings_created: result.embeddings_created,
        status: result.status,
        extraction_source: result.extraction_source || null,
        needs_ocr_reason: result.needs_ocr_reason || null,
        trace_id: result.trace_id,
      })
    } catch (error: any) {
      const safeMessage = String(error?.message || 'internal_error')
      const code =
        safeMessage === 'document_not_found'
          ? 'NOT_FOUND'
          : safeMessage.startsWith('embedding_failed')
            ? 'AI_OUTPUT_INVALID'
            : 'INTERNAL_ERROR'
      const status = code === 'NOT_FOUND' ? 404 : code === 'AI_OUTPUT_INVALID' ? 502 : 500

      console.error('[api/documents/[id]/index] Error', {
        trace_id: traceId,
        message: safeMessage,
      })

      return errorResponse(status, code, 'No fue posible indexar el documento', traceId)
    }
  }
}

export const POST = createDocumentIndexRouteHandler()
