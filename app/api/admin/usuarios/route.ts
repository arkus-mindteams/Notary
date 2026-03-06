import { NextResponse } from 'next/server'
import { UsuarioService } from '@/lib/services/usuario-service'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import type { CreateUsuarioRequest } from '@/lib/types/auth-types'

// GET - Listar usuarios (ADMIN_USERS_VIEW; notario solo ve su notaría)
export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_VIEW')
    if (err) return err

    const notariaId = ctx!.role === 'notario' ? ctx!.notaryOfficeId : undefined
    const usuarios = await UsuarioService.listUsuarios(notariaId ? { notariaId } : {})

    return NextResponse.json(usuarios)
  } catch (error: any) {
    console.error('[api/admin/usuarios] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Crear usuario (ADMIN_USERS_INVITE o ADMIN_USERS_VIEW según flujo actual)
export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_VIEW')
    if (err) return err

    const body: CreateUsuarioRequest = await req.json()
    const nuevoUsuario = await UsuarioService.createUsuario(body)

    return NextResponse.json(
      {
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
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[api/admin/usuarios] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
