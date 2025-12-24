import { NextResponse } from 'next/server'
import { CompradorService } from '@/lib/services/comprador-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { DocumentoService } from '@/lib/services/documento-service'
import { TramiteDocumentoService } from '@/lib/services/tramite-documento-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import type { CreateCompradorRequest, ExpedienteCompleto } from '@/lib/types/expediente-types'

// En este proyecto operamos con una sola notaría (Notaría Pública #3).
// Esta notaría se crea en la migración `003_create_auth_tables.sql` con este ID fijo.
const DEFAULT_NOTARIA_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: Request) {
  try {
    // Obtener usuario actual para aplicar filtros
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const search = searchParams.get('search')
    const rfc = searchParams.get('rfc')
    const curp = searchParams.get('curp')

    // Determinar notariaId para filtros (fallback determinista a Notaría #3)
    const notariaId = currentUser.notaria_id || DEFAULT_NOTARIA_ID

    // Si hay ID, obtener expediente completo
    if (id) {
      const comprador = await CompradorService.findCompradorById(id)
      if (!comprador) {
        return NextResponse.json(
          { error: 'not_found', message: 'Comprador no encontrado' },
          { status: 404 }
        )
      }

      // Verificar que el comprador pertenece a la notaría del usuario (si es abogado)
      if (currentUser.rol === 'abogado' && comprador.notaria_id !== currentUser.notaria_id) {
        return NextResponse.json(
          { error: 'forbidden', message: 'No tienes acceso a este expediente' },
          { status: 403 }
        )
      }

      // Obtener todos los trámites (con filtro de notaría si es abogado)
      const tramites = await TramiteService.findTramitesByCompradorId(id, notariaId)

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

    // Búsqueda por texto (con filtro de notaría si es abogado)
    if (search) {
      const compradores = await CompradorService.searchCompradores(search, 20, notariaId)
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
    // Obtener usuario actual para asignar notaria_id
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    // Determinar notaria_id (fallback determinista a Notaría #3)
    const notariaId = currentUser.notaria_id || DEFAULT_NOTARIA_ID
    if (!notariaId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'No se puede crear comprador sin notaria_id' },
        { status: 400 }
      )
    }
    
    const body: CreateCompradorRequest = await req.json()

    // Validar campos requeridos (nombre y curp son obligatorios, rfc es opcional)
    if (!body.nombre || !body.curp) {
      return NextResponse.json(
        { error: 'bad_request', message: 'nombre y curp son requeridos' },
        { status: 400 }
      )
    }

    // Agregar notaria_id al crear comprador
    const comprador = await CompradorService.createComprador({
      ...body,
      notaria_id: notariaId,
    })
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

