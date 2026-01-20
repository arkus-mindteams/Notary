import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { PreavisoOcrCacheService } from '@/lib/services/preaviso-ocr-cache-service'

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: 'unauthorized', message: 'No autenticado' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const tramiteId = String(body?.tramiteId || '').trim()
    const docName = String(body?.docName || '').trim()
    const docSubtype = body?.docSubtype ? String(body.docSubtype) : null
    const docRole = body?.docRole ? String(body.docRole) : null
    const pageNumber = Number(body?.pageNumber ?? 1)
    const text = String(body?.text ?? '').trim()

    if (!tramiteId || !docName) {
      return NextResponse.json({ error: 'bad_request', message: 'tramiteId y docName son requeridos' }, { status: 400 })
    }
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'bad_request', message: 'pageNumber inválido' }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: 'bad_request', message: 'text vacío' }, { status: 400 })
    }

    const clipped = text.length > 20000 ? text.slice(0, 20000) : text
    const saved = await PreavisoOcrCacheService.upsertPage({
      tramiteId,
      docName,
      docSubtype,
      docRole,
      pageNumber,
      text: clipped,
    })

    if (!saved.ok) {
      return NextResponse.json(
        { error: 'cache_error', message: saved.error || 'No se pudo guardar OCR en cache' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/ai/preaviso-ocr-cache/upsert] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

