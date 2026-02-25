import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { TramiteService } from '@/lib/services/tramite-service'
import { S3Service } from '@/lib/services/s3-service'
import type { TipoDocumento } from '@/lib/types/expediente-types'

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'No autenticado', details: {} } },
        { status: 401 }
      )
    }

    const body = await req.json().catch(() => null)
    const fileName = String(body?.fileName || '').trim()
    const fileType = String(body?.fileType || '').trim() || 'application/octet-stream'
    const fileSize = Number(body?.fileSize || 0)
    const tipo = String(body?.tipo || '').trim() as TipoDocumento
    const tramiteId = String(body?.tramiteId || '').trim() || null
    const compradorId = String(body?.compradorId || '').trim() || null

    if (!fileName || !tipo || !fileSize) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'fileName, fileType, fileSize y tipo son requeridos', details: {} } },
        { status: 400 }
      )
    }

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
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `tipo debe ser uno de: ${tiposValidos.join(', ')}`, details: {} } },
        { status: 400 }
      )
    }

    let tipoTramite: string | undefined
    if (tramiteId) {
      try {
        const tramite = await TramiteService.findTramiteById(tramiteId)
        if (tramite) tipoTramite = tramite.tipo
      } catch {
        tipoTramite = undefined
      }
    }

    const compradorIdForS3 = compradorId || (tramiteId ? `temp-${tramiteId}` : `temp-${Date.now()}`)
    const key = tramiteId && tipoTramite
      ? S3Service.generateKey(compradorIdForS3, tramiteId, tipoTramite, tipo, fileName)
      : S3Service.generateKeyForComprador(compradorIdForS3, tipo, fileName)

    const uploadUrl = await S3Service.getSignedUploadUrl(key, fileType, 900)

    return NextResponse.json({
      uploadUrl,
      key,
      bucket: S3Service.getBucket(),
      expiresIn: 900,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error?.message || 'Error inicializando subida directa',
          details: {},
        },
      },
      { status: 500 }
    )
  }
}

