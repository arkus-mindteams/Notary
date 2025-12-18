import { NextResponse } from 'next/server'
import { createClientClient } from '@/lib/supabase'
import { UsuarioService } from '@/lib/services/usuario-service'
import { AuthService } from '@/lib/services/auth-service'
import type { LoginRequest, AuthUser } from '@/lib/types/auth-types'

export async function POST(req: Request) {
  try {
    const body: LoginRequest = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Email y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // 1. Autenticar con Supabase Auth
    const supabase = createClientClient()
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user || !authData.session) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Credenciales incorrectas' },
        { status: 401 }
      )
    }

    // 2. Buscar usuario en la tabla usuarios
    const usuario = await UsuarioService.findUsuarioByAuthId(authData.user.id)
    
    if (!usuario) {
      // Si no existe en la tabla, cerrar sesión de Auth
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'not_found', message: 'Usuario no encontrado en el sistema' },
        { status: 404 }
      )
    }

    if (!usuario.activo) {
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'forbidden', message: 'Usuario desactivado' },
        { status: 403 }
      )
    }

    // 3. Actualizar último login
    await AuthService.updateLastLogin(authData.user.id)

    // 4. Construir respuesta con usuario simplificado
    const nombreCompleto = `${usuario.nombre} ${usuario.apellido_paterno || ''} ${usuario.apellido_materno || ''}`.trim()
    const authUser: AuthUser = {
      id: usuario.id,
      email: usuario.email,
      name: nombreCompleto,
      role: usuario.rol,
      notariaId: usuario.notaria_id,
    }

    return NextResponse.json({
      user: authUser,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at || 0,
      },
    })
  } catch (error: any) {
    console.error('[api/auth/login] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

