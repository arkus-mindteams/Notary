import { NextResponse } from 'next/server'
import { UsuarioService } from '@/lib/services/usuario-service'
import { createServerClient } from '@/lib/supabase'
import type { CreateUsuarioRequest, UpdateUsuarioRequest } from '@/lib/types/auth-types'

// GET - Listar usuarios (solo superadmin)
export async function GET(req: Request) {
  try {
    // Verificar autenticación y rol de superadmin
    const supabase = createServerClient()
    const authHeader = req.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !authUser) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Token inválido' },
        { status: 401 }
      )
    }

    const usuario = await UsuarioService.findUsuarioByAuthId(authUser.id)
    if (!usuario || usuario.rol !== 'superadmin') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Solo superadmin puede acceder' },
        { status: 403 }
      )
    }

    // Listar todos los usuarios
    const usuarios = await UsuarioService.listUsuarios()
    
    return NextResponse.json(usuarios)
  } catch (error: any) {
    console.error('[api/admin/usuarios] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Crear usuario (solo superadmin)
export async function POST(req: Request) {
  try {
    const supabase = createServerClient()
    const authHeader = req.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'No autenticado' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !authUser) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Token inválido' },
        { status: 401 }
      )
    }

    const usuario = await UsuarioService.findUsuarioByAuthId(authUser.id)
    if (!usuario || usuario.rol !== 'superadmin') {
      return NextResponse.json(
        { error: 'forbidden', message: 'Solo superadmin puede crear usuarios' },
        { status: 403 }
      )
    }

    const body: CreateUsuarioRequest = await req.json()
    const nuevoUsuario = await UsuarioService.createUsuario(body)
    
    // Retornar sin información sensible
    return NextResponse.json({
      id: nuevoUsuario.id,
      email: nuevoUsuario.email,
      nombre: nuevoUsuario.nombre,
      apellido_paterno: nuevoUsuario.apellido_paterno,
      apellido_materno: nuevoUsuario.apellido_materno,
      telefono: nuevoUsuario.telefono,
      rol: nuevoUsuario.rol,
      notaria_id: nuevoUsuario.notaria_id,
      activo: nuevoUsuario.activo,
      created_at: nuevoUsuario.created_at,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[api/admin/usuarios] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

