import { NextResponse } from 'next/server'
import { PreavisoConfigService } from '@/lib/services/preaviso-config-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'

// GET - Obtener configuración del preaviso (solo superadmin)
export async function GET(req: Request) {
  try {
    const usuario = await getCurrentUserFromRequest(req)
    
    if (!usuario || usuario.rol !== 'superadmin') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Solo superadmin puede acceder' },
        { status: 403 }
      )
    }

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

// PUT - Actualizar configuración del preaviso (solo superadmin)
export async function PUT(req: Request) {
  try {
    const usuario = await getCurrentUserFromRequest(req)
    
    if (!usuario || usuario.rol !== 'superadmin') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Solo superadmin puede acceder' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { prompt, json_schema } = body

    // Validaciones
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

    const updated = await PreavisoConfigService.updateConfig({
      prompt,
      json_schema,
    })
    
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('[api/admin/preaviso-config] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

