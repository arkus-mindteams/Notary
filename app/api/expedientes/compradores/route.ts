import { NextResponse } from 'next/server'
import { CompradorService } from '@/lib/services/comprador-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { DocumentoService } from '@/lib/services/documento-service'
import { TramiteDocumentoService } from '@/lib/services/tramite-documento-service'
import type { CreateCompradorRequest, ExpedienteCompleto } from '@/lib/types/expediente-types'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const search = searchParams.get('search')
    const rfc = searchParams.get('rfc')
    const curp = searchParams.get('curp')

    // Si hay ID, obtener expediente completo
    if (id) {
      const comprador = await CompradorService.findCompradorById(id)
      if (!comprador) {
        return NextResponse.json(
          { error: 'not_found', message: 'Comprador no encontrado' },
          { status: 404 }
        )
      }

      // Obtener todos los trámites
      const tramites = await TramiteService.findTramitesByCompradorId(id)

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

      // Obtener todos los documentos del comprador
      const documentos = await DocumentoService.listDocumentosByComprador(id)

      const expediente: ExpedienteCompleto = {
        comprador,
        tramites: tramitesConDocumentos,
        documentos,
      }

      return NextResponse.json(expediente)
    }

    // Búsqueda por RFC
    if (rfc) {
      const comprador = await CompradorService.findCompradorByRFC(rfc)
      if (!comprador) {
        return NextResponse.json(
          { error: 'not_found', message: 'Comprador no encontrado' },
          { status: 404 }
        )
      }
      return NextResponse.json(comprador)
    }

    // Búsqueda por CURP
    if (curp) {
      const comprador = await CompradorService.findCompradorByCURP(curp)
      if (!comprador) {
        return NextResponse.json(
          { error: 'not_found', message: 'Comprador no encontrado' },
          { status: 404 }
        )
      }
      return NextResponse.json(comprador)
    }

    // Búsqueda por texto
    if (search) {
      const compradores = await CompradorService.searchCompradores(search)
      return NextResponse.json(compradores)
    }

    // Sin parámetros, retornar error
    return NextResponse.json(
      { error: 'bad_request', message: 'Se requiere id, search, rfc o curp' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[api/expedientes/compradores] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body: CreateCompradorRequest = await req.json()

    // Validar campos requeridos
    if (!body.nombre || !body.rfc || !body.curp) {
      return NextResponse.json(
        { error: 'bad_request', message: 'nombre, rfc y curp son requeridos' },
        { status: 400 }
      )
    }

    const comprador = await CompradorService.createComprador(body)
    return NextResponse.json(comprador, { status: 201 })
  } catch (error: any) {
    console.error('[api/expedientes/compradores] Error:', error)
    
    // Error de duplicado
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return NextResponse.json(
        { error: 'duplicate', message: 'Ya existe un comprador con este RFC o CURP' },
        { status: 409 }
      )
    }

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

    const body: Partial<CreateCompradorRequest> = await req.json()
    const comprador = await CompradorService.updateComprador(id, body)
    
    return NextResponse.json(comprador)
  } catch (error: any) {
    console.error('[api/expedientes/compradores] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

