import { NextResponse } from 'next/server'
import { DocumentoService } from '@/lib/services/documento-service'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const compradorId = searchParams.get('compradorId')
    const expiresIn = parseInt(searchParams.get('expiresIn') || '3600')

    // Si hay ID, obtener URL firmada del documento
    if (id) {
      const url = await DocumentoService.getDocumentoUrl(id, expiresIn)
      return NextResponse.json({ url })
    }

    // Si hay compradorId, listar documentos del comprador
    if (compradorId) {
      const documentos = await DocumentoService.listDocumentosByComprador(compradorId)
      return NextResponse.json(documentos)
    }

    return NextResponse.json(
      { error: 'bad_request', message: 'Se requiere id o compradorId' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[api/expedientes/documentos] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'id es requerido' },
        { status: 400 }
      )
    }

    await DocumentoService.deleteDocumento(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/expedientes/documentos] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

