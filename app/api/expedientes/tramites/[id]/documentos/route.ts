import { NextResponse } from 'next/server'
import { TramiteDocumentoService } from '@/lib/services/tramite-documento-service'
import type { AsociarDocumentoRequest } from '@/lib/types/expediente-types'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tramiteId = params.id
    const body: Omit<AsociarDocumentoRequest, 'tramiteId'> = await req.json()

    if (!body.documentoId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'documentoId es requerido' },
        { status: 400 }
      )
    }

    const asociacion = await TramiteDocumentoService.asociarDocumentoATramite({
      tramiteId,
      documentoId: body.documentoId,
      notas: body.notas,
    })

    return NextResponse.json(asociacion, { status: 201 })
  } catch (error: any) {
    console.error('[api/expedientes/tramites/[id]/documentos] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tramiteId = params.id
    const { searchParams } = new URL(req.url)
    const documentoId = searchParams.get('documentoId')

    if (!documentoId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'documentoId es requerido' },
        { status: 400 }
      )
    }

    await TramiteDocumentoService.desasociarDocumentoDeTramite(tramiteId, documentoId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/expedientes/tramites/[id]/documentos] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

