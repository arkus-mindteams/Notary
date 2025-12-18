import { NextResponse } from 'next/server'
import { TramiteService } from '@/lib/services/tramite-service'
import { TramiteDocumentoService } from '@/lib/services/tramite-documento-service'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const tipo = searchParams.get('tipo')

    if (!userId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'userId es requerido' },
        { status: 400 }
      )
    }

    if (!tipo) {
      return NextResponse.json(
        { error: 'bad_request', message: 'tipo es requerido' },
        { status: 400 }
      )
    }

    const tramite = await TramiteService.findActiveDraftTramite(userId, tipo as any)

    if (!tramite) {
      return NextResponse.json(
        { error: 'not_found', message: 'No hay trámite activo' },
        { status: 404 }
      )
    }

    // Obtener documentos asociados al trámite
    const documentos = await TramiteDocumentoService.listDocumentosPorTramite(tramite.id)

    return NextResponse.json({
      ...tramite,
      documentos
    })
  } catch (error: any) {
    console.error('[api/expedientes/tramites/active-draft] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

