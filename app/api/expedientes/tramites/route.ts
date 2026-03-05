import { NextResponse } from 'next/server'
import { TramiteService } from '@/lib/services/tramite-service'
import { TramiteDocumentoService } from '@/lib/services/tramite-documento-service'
import { getAuthContext } from '@/lib/auth/authContext'
import { listVisibleCases, canReadCase } from '@/lib/authz/rebac'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import type { CreateTramiteRequest, UpdateTramiteRequest, TramiteConDocumentos } from '@/lib/types/expediente-types'

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    if (!ctx) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const compradorId = searchParams.get('compradorId')
    const tipo = searchParams.get('tipo')

    // Si hay ID, obtener trámite específico con documentos (ReBAC: solo si puede leer)
    if (id) {
      const allowed = await canReadCase(ctx, id)
      if (!allowed) {
        return NextResponse.json(
          { error: 'not_found', message: 'Trámite no encontrado' },
          { status: 404 }
        )
      }
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

    // Si hay compradorId, listar trámites del comprador (solo los visibles por ReBAC)
    if (compradorId) {
      let tramites
      if (tipo) {
        tramites = await TramiteService.findTramitesByTipo(compradorId, tipo as any)
      } else {
        tramites = await TramiteService.findTramitesByCompradorId(compradorId)
      }

      const visibleSet = new Set((await listVisibleCases(ctx)).map((t) => t.id))
      const filtered = tramites.filter((t) => visibleSet.has(t.id))

      const tramitesConDocumentos = await Promise.all(
        filtered.map(async (tramite) => {
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
    // Obtener usuario actual del token
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    const body: CreateTramiteRequest = await req.json()

    // Validar campos requeridos
    // compradorId puede ser null para trámites en borrador
    if (body.compradorId === undefined || !body.tipo || !body.datos) {
      return NextResponse.json(
        { error: 'bad_request', message: 'tipo y datos son requeridos. compradorId puede ser null para borradores' },
        { status: 400 }
      )
    }

    // Agregar usuario_id automáticamente
    const tramiteData: CreateTramiteRequest = {
      ...body,
      userId: currentUser.id, // Siempre usar el usuario del token
    }

    const tramite = await TramiteService.createTramite(tramiteData)
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

    const body: UpdateTramiteRequest = await req.json()

    // Convertir camelCase a snake_case para el servicio
    const updateData: {
      comprador_id?: string | null
      datos?: any
      estado?: string
      documento_generado?: any
      notas?: string
    } = {}
    
    if (body.compradorId !== undefined) updateData.comprador_id = body.compradorId
    if (body.datos !== undefined) updateData.datos = body.datos
    if (body.estado !== undefined) updateData.estado = body.estado
    if (body.documento_generado !== undefined) updateData.documento_generado = body.documento_generado
    if (body.notas !== undefined) updateData.notas = body.notas

    const tramite = await TramiteService.updateTramite(id, updateData)
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

