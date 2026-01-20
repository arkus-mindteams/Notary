import { NextResponse } from 'next/server'
import { UsuarioService } from '@/lib/services/usuario-service'
import { createServerClient } from '@/lib/supabase'
import type { UpdateUsuarioRequest } from '@/lib/types/auth-types'

// PUT - Actualizar usuario (solo superadmin)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
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
        { error: 'forbidden', message: 'Solo superadmin puede actualizar usuarios' },
        { status: 403 }
      )
    }

    // Manejar params como Promise o objeto directo (compatibilidad con Next.js 13+ y 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    
    if (!resolvedParams.id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'ID de usuario es requerido' },
        { status: 400 }
      )
    }

    const body: UpdateUsuarioRequest = await req.json()
    const usuarioActualizado = await UsuarioService.updateUsuario(resolvedParams.id, body)
    
    return NextResponse.json(usuarioActualizado)
  } catch (error: any) {
    console.error('[api/admin/usuarios/[id]] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Desactivar usuario (solo superadmin)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
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
        { error: 'forbidden', message: 'Solo superadmin puede desactivar usuarios' },
        { status: 403 }
      )
    }

    // Manejar params como Promise o objeto directo (compatibilidad con Next.js 13+ y 15+)
    const resolvedParams = params instanceof Promise ? await params : params
    
    if (!resolvedParams.id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'ID de usuario es requerido' },
        { status: 400 }
      )
    }

    // No permitir desactivarse a sí mismo
    if (resolvedParams.id === usuario.id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'No puedes desactivarte a ti mismo' },
        { status: 400 }
      )
    }

    await UsuarioService.deactivateUsuario(resolvedParams.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/admin/usuarios/[id]] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

