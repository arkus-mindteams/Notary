import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { TramiteService } from '@/lib/services/tramite-service'
import { DocumentoTextChunkService } from '@/lib/services/documento-text-chunk-service'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: 'unauthorized', message: 'No autenticado' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const documentoId = body?.documentoId as string | undefined
    const tramiteId = body?.tramiteId as string | undefined
    const pageNumber = Number(body?.pageNumber ?? 1)
    const chunkIndex = body?.chunkIndex !== undefined ? Number(body?.chunkIndex) : 0
    const text = String(body?.text ?? '').trim()
    const metadata = (body?.metadata && typeof body.metadata === 'object') ? body.metadata : null

    if (!documentoId || !tramiteId) {
      return NextResponse.json({ error: 'bad_request', message: 'documentoId y tramiteId son requeridos' }, { status: 400 })
    }
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'bad_request', message: 'pageNumber inválido' }, { status: 400 })
    }
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: 'bad_request', message: 'chunkIndex inválido' }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: 'bad_request', message: 'text vacío' }, { status: 400 })
    }

    // Autorizar: el trámite debe pertenecer al usuario (o ser superadmin)
    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) {
      return NextResponse.json({ error: 'not_found', message: 'Trámite no encontrado' }, { status: 404 })
    }
    if (currentUser.rol !== 'superadmin' && (tramite as any).usuario_id && (tramite as any).usuario_id !== currentUser.id) {
      return NextResponse.json({ error: 'forbidden', message: 'No tienes acceso a este trámite' }, { status: 403 })
    }

    // Verificar que documento esté asociado al trámite (evita escribir chunks a docs ajenos)
    const supabase = createServerClient()
    const { data: assoc, error: assocError } = await supabase
      .from('tramite_documentos')
      .select('id')
      .eq('tramite_id', tramiteId)
      .eq('documento_id', documentoId)
      .maybeSingle()

    if (assocError) {
      return NextResponse.json({ error: 'internal_error', message: assocError.message }, { status: 500 })
    }
    if (!assoc) {
      return NextResponse.json({ error: 'forbidden', message: 'Documento no asociado al trámite' }, { status: 403 })
    }

    const saved = await DocumentoTextChunkService.upsertChunk({
      documentoId,
      tramiteId,
      pageNumber,
      chunkIndex,
      text: text.length > 20000 ? text.slice(0, 20000) : text,
      metadata,
    })

    return NextResponse.json({ success: true, chunk: saved })
  } catch (error: any) {
    console.error('[api/expedientes/documentos/text-chunks/upsert] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

