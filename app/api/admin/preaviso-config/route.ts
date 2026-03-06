import { NextResponse } from 'next/server'
import { PreavisoConfigService } from '@/lib/services/preaviso-config-service'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'

// GET - Obtener configuración del preaviso (ADMIN_USERS_VIEW)
export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_VIEW')
    if (err) return err

    const config = await PreavisoConfigService.getConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'not_found', message: 'Configuración no encontrada' },
        { status: 404 }
      )
    }
    return NextResponse.json(config)
  } catch (error: any) {
    console.error('[api/admin/preaviso-config] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar configuración del preaviso (ADMIN_USERS_VIEW)
export async function PUT(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_VIEW')
    if (err) return err

    const body = await req.json()
    const { prompt, json_schema } = body

    if (prompt !== undefined && typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'bad_request', message: 'prompt debe ser un string' },
        { status: 400 }
      )
    }
    if (json_schema !== undefined && typeof json_schema !== 'object') {
      return NextResponse.json(
        { error: 'bad_request', message: 'json_schema debe ser un objeto' },
        { status: 400 }
      )
    }

    const updated = await PreavisoConfigService.updateConfig({ prompt, json_schema })
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('[api/admin/preaviso-config] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
