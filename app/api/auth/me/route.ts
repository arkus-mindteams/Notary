import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { getCapabilitiesForRole } from '@/lib/authz/capabilities'
import type { AuthUser } from '@/lib/types/auth-types'

const ROLE_COOKIE_NAME = 'sb-user-role'

function roleCookie(role: string) {
  const isProd = process.env.NODE_ENV === 'production'
  return `${ROLE_COOKIE_NAME}=${encodeURIComponent(role)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isProd ? '; Secure' : ''}`
}

export async function GET(req: Request) {
  try {
    const usuario = await getCurrentUserFromRequest(req)

    if (!usuario) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    const activo = usuario.status != null ? usuario.status === 'ACTIVE' : usuario.activo
    if (!activo) {
      return NextResponse.json(
        { error: 'forbidden', message: 'Usuario desactivado' },
        { status: 403 }
      )
    }

    const nombreCompleto = `${usuario.nombre} ${usuario.apellido_paterno || ''} ${usuario.apellido_materno || ''}`.trim()
    const capabilities = getCapabilitiesForRole(usuario.rol)
    const authUser: AuthUser = {
      id: usuario.id,
      authUserId: usuario.auth_user_id || '',
      email: usuario.email,
      name: nombreCompleto,
      role: usuario.rol,
      notariaId: usuario.notaria_id,
      ...(usuario.status != null && { status: usuario.status }),
      capabilities,
    }

    const res = NextResponse.json({ user: authUser })
    res.headers.set('Set-Cookie', roleCookie(usuario.rol))
    return res
  } catch (error: any) {
    console.error('[api/auth/me] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

