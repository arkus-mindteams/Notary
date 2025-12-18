import { NextResponse } from 'next/server'
import { DocumentoService } from '@/lib/services/documento-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import type { TipoDocumento } from '@/lib/types/expediente-types'

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

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const compradorId = formData.get('compradorId') as string | null
    const tipo = formData.get('tipo') as string | null
    const tramiteId = formData.get('tramiteId') as string | null
    const metadataStr = formData.get('metadata') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'bad_request', message: 'file es requerido' },
        { status: 400 }
      )
    }

    // compradorId es opcional (puede ser null para documentos en borrador)

    if (!tipo) {
      return NextResponse.json(
        { error: 'bad_request', message: 'tipo es requerido' },
        { status: 400 }
      )
    }

    // Validar tipo de documento
    const tiposValidos: TipoDocumento[] = [
      'escritura',
      'plano',
      'ine_vendedor',
      'ine_comprador',
      'rfc',
      'documento_generado',
      'plano_arquitectonico',
      'croquis_catastral',
    ]

    if (!tiposValidos.includes(tipo as TipoDocumento)) {
      return NextResponse.json(
        { error: 'bad_request', message: `tipo debe ser uno de: ${tiposValidos.join(', ')}` },
        { status: 400 }
      )
    }

    // Parsear metadata si existe
    let metadata: Record<string, any> | undefined
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr)
      } catch (e) {
        console.warn('Error parsing metadata, ignoring:', e)
      }
    }

    // Si hay tramiteId, obtener el tipo de trámite para la estructura S3
    let tipoTramite: string | undefined
    if (tramiteId) {
      try {
        const tramite = await TramiteService.findTramiteById(tramiteId)
        if (tramite) {
          tipoTramite = tramite.tipo
        }
      } catch (error) {
        console.warn('Error obteniendo tipo de trámite, continuando sin él:', error)
      }
    }

    // Subir documento (agregar usuarioId al request)
    const uploadRequest: any = {
      compradorId,
      tipo: tipo as TipoDocumento,
      file,
      metadata,
      usuarioId: currentUser.id, // Agregar usuario_id
    }
    
    const documento = await DocumentoService.uploadDocumento(
      uploadRequest,
      tramiteId || undefined,
      tipoTramite
    )

    return NextResponse.json(documento, { status: 201 })
  } catch (error: any) {
    console.error('[api/expedientes/documentos/upload] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

