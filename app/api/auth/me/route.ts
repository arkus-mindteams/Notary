import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import type { AuthUser } from '@/lib/types/auth-types'

export async function GET(req: Request) {
  try {
    // Obtener usuario desde el token (header o cookies)
    const usuario = await getCurrentUserFromRequest(req)

    if (!usuario) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }
    
    if (!usuario.activo) {
      return NextResponse.json(
        { error: 'forbidden', message: 'Usuario desactivado' },
        { status: 403 }
      )
    }

    // Construir respuesta con usuario simplificado
    const nombreCompleto = `${usuario.nombre} ${usuario.apellido_paterno || ''} ${usuario.apellido_materno || ''}`.trim()
    const authUser: AuthUser = {
      id: usuario.id,
      email: usuario.email,
      name: nombreCompleto,
      role: usuario.rol,
      notariaId: usuario.notaria_id,
    }

    return NextResponse.json({ user: authUser })
  } catch (error: any) {
    console.error('[api/auth/me] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

