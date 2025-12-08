import { NextResponse } from 'next/server'
import { TramiteService } from '@/lib/services/tramite-service'
import { TramiteDocumentoService } from '@/lib/services/tramite-documento-service'
import type { CreateTramiteRequest, TramiteConDocumentos } from '@/lib/types/expediente-types'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const compradorId = searchParams.get('compradorId')
    const tipo = searchParams.get('tipo')

    // Si hay ID, obtener trámite específico con documentos
    if (id) {
      const tramite = await TramiteService.findTramiteById(id)
      if (!tramite) {
        return NextResponse.json(
          { error: 'not_found', message: 'Trámite no encontrado' },
          { status: 404 }
        )
      }

      const documentos = await TramiteDocumentoService.listDocumentosPorTramite(id)
      const tramiteConDocumentos: TramiteConDocumentos = {
        ...tramite,
        documentos,
      }

      return NextResponse.json(tramiteConDocumentos)
    }

    // Si hay compradorId, listar trámites del comprador
    if (compradorId) {
      let tramites
      
      if (tipo) {
        tramites = await TramiteService.findTramitesByTipo(compradorId, tipo as any)
      } else {
        tramites = await TramiteService.findTramitesByCompradorId(compradorId)
      }

      // Obtener documentos de cada trámite
      const tramitesConDocumentos = await Promise.all(
        tramites.map(async (tramite) => {
          const documentos = await TramiteDocumentoService.listDocumentosPorTramite(tramite.id)
          return {
            ...tramite,
            documentos,
          }
        })
      )

      return NextResponse.json(tramitesConDocumentos)
    }

    return NextResponse.json(
      { error: 'bad_request', message: 'Se requiere id o compradorId' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[api/expedientes/tramites] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body: CreateTramiteRequest = await req.json()

    // Validar campos requeridos
    if (!body.compradorId || !body.tipo || !body.datos) {
      return NextResponse.json(
        { error: 'bad_request', message: 'compradorId, tipo y datos son requeridos' },
        { status: 400 }
      )
    }

    const tramite = await TramiteService.createTramite(body)
    return NextResponse.json(tramite, { status: 201 })
  } catch (error: any) {
    console.error('[api/expedientes/tramites] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'id es requerido' },
        { status: 400 }
      )
    }

    const body: {
      datos?: any
      estado?: string
      documento_generado?: any
      notas?: string
    } = await req.json()

    const tramite = await TramiteService.updateTramite(id, body)
    return NextResponse.json(tramite)
  } catch (error: any) {
    console.error('[api/expedientes/tramites] Error:', error)
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

    await TramiteService.deleteTramite(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/expedientes/tramites] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

