import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { TramiteService } from '@/lib/services/tramite-service'
import { DocumentoService } from '@/lib/services/documento-service'
import { ExtractionAgent, AIOutputInvalidError } from '@/lib/ai/extraction/extraction-agent'
import type { ExtractionResult } from '@/lib/ai/extraction/types'

const requestSchema = z.object({
  documentId: z.string().trim().min(1),
  tramiteType: z.literal('preaviso'),
  rawText: z.string().optional(),
  fileMeta: z.record(z.any()).optional(),
}).strict()

const extractionAgent = new ExtractionAgent()

const errorResponse = (
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  traceId?: string
) =>
  NextResponse.json(
    {
      error: {
        code,
        message,
        details,
        ...(traceId ? { trace_id: traceId } : {}),
      },
    },
    { status }
  )

const defaultDeps = {
  getCurrentUserFromRequest,
  findTramiteById: TramiteService.findTramiteById,
  findDocumentoById: DocumentoService.findDocumentoById,
  extract: (args: Parameters<ExtractionAgent['extract']>[0]) => extractionAgent.extract(args),
  isDocumentLinkedToTramite: async (tramiteId: string, documentoId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('tramite_documentos')
      .select('id')
      .eq('tramite_id', tramiteId)
      .eq('documento_id', documentoId)
      .maybeSingle()
    if (error) throw new Error(`Error validating tramite-document link: ${error.message}`)
    return !!data
  },
}

type RouteDeps = typeof defaultDeps

function resolveRawText(bodyRawText: string | undefined, metadata: Record<string, any> | null | undefined): string | null {
  const explicit = String(bodyRawText || '').trim()
  if (explicit) return explicit

  if (!metadata || typeof metadata !== 'object') return null

  const direct = [
    metadata.rawText,
    metadata.ocrText,
    metadata.text,
    metadata.textoCompleto,
    metadata.extracted_data?.textoCompleto,
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find(Boolean)

  if (direct) return direct

  if (metadata.extracted_data && typeof metadata.extracted_data === 'object') {
    return JSON.stringify(metadata.extracted_data)
  }

  return null
}

export function createExtractRouteHandler(deps: RouteDeps = defaultDeps) {
  return async function POST(
    req: Request,
    { params }: { params: { id: string } | Promise<{ id: string }> }
  ) {
    try {
      const currentUser = await deps.getCurrentUserFromRequest(req)
      if (!currentUser || !currentUser.activo) {
        return errorResponse(401, 'UNAUTHORIZED', 'No autenticado')
      }

      const parsedBody = requestSchema.safeParse(await req.json())
      if (!parsedBody.success) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Body invalido', {
          issues: parsedBody.error.issues.map((x) => ({
            path: x.path.join('.'),
            message: x.message,
          })),
        })
      }

      const body = parsedBody.data
      const resolvedParams = await Promise.resolve(params)
      const tramiteId = resolvedParams.id
      const tramite = await deps.findTramiteById(tramiteId)
      if (!tramite) {
        return errorResponse(404, 'NOT_FOUND', 'Tramite no encontrado')
      }

      if (tramite.tipo !== body.tramiteType) {
        return errorResponse(
          422,
          'DOMAIN_RULE_VIOLATION',
          'El tipo de tramite no coincide con el tramite solicitado',
          { expected: tramite.tipo, received: body.tramiteType }
        )
      }

      const isOwner =
        currentUser.rol === 'superadmin' ||
        !tramite.user_id ||
        String(tramite.user_id) === String(currentUser.id)
      if (!isOwner) {
        return errorResponse(403, 'FORBIDDEN', 'No autorizado para este tramite')
      }

      const linked = await deps.isDocumentLinkedToTramite(tramiteId, body.documentId)
      if (!linked) {
        return errorResponse(422, 'DOMAIN_RULE_VIOLATION', 'El documento no pertenece al tramite', {
          tramiteId,
          documentId: body.documentId,
        })
      }

      const documento = await deps.findDocumentoById(body.documentId)
      if (!documento) {
        return errorResponse(404, 'NOT_FOUND', 'Documento no encontrado')
      }

      const rawText = resolveRawText(body.rawText, documento.metadata || null)
      if (!rawText) {
        return errorResponse(
          400,
          'VALIDATION_ERROR',
          'No hay texto disponible para extraccion. Envia rawText o metadata con OCR/transcripcion.'
        )
      }

      const extraction: ExtractionResult = await deps.extract({
        tramiteType: body.tramiteType,
        documentId: body.documentId,
        rawText,
        fileMeta: {
          file_name: documento.nombre,
          mime_type: documento.mime_type,
          tipo_documento: documento.tipo,
          tamano: (documento as any).tamano ?? (documento as any)['tama\u00f1o'] ?? null,
          ...(body.fileMeta || {}),
        },
        auditContext: {
          userId: currentUser.auth_user_id || null,
          tramiteId,
        },
      })

      return NextResponse.json(
        {
          structured: extraction.structured,
          warnings: extraction.warnings || [],
          trace_id: extraction.trace_id,
        },
        { status: 200 }
      )
    } catch (error: any) {
      if (error instanceof AIOutputInvalidError) {
        return errorResponse(
          422,
          'AI_OUTPUT_INVALID',
          error.message,
          error.details || {},
          String(error.details?.trace_id || '')
        )
      }

      console.error('[api/expedientes/tramites/[id]/extract] Error:', error)
      return errorResponse(500, 'INTERNAL_ERROR', error?.message || 'Error interno del servidor')
    }
  }
}

export const POST = createExtractRouteHandler()
