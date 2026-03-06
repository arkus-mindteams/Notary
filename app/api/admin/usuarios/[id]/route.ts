import { NextResponse } from 'next/server'
import { UsuarioService } from '@/lib/services/usuario-service'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import type { UpdateUsuarioRequest } from '@/lib/types/auth-types'

// PUT - Actualizar usuario (ADMIN_USERS_VIEW; notario solo usuarios de su notaría)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_VIEW')
    if (err) return err

    const resolvedParams = params instanceof Promise ? await params : params
    if (!resolvedParams.id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'ID de usuario es requerido' },
        { status: 400 }
      )
    }

    if (ctx!.role === 'notario') {
      const target = await UsuarioService.findUsuarioById(resolvedParams.id)
      if (!target || target.notaria_id !== ctx!.notaryOfficeId) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Solo puede editar usuarios de su notaría',
              details: {},
            },
          },
          { status: 403 }
        )
      }
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

// DELETE - Desactivar usuario (ADMIN_USERS_STATUS_CHANGE; notario solo usuarios de su notaría)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_STATUS_CHANGE')
    if (err) return err

    const resolvedParams = params instanceof Promise ? await params : params
    if (!resolvedParams.id) {
      return NextResponse.json(
        { error: 'bad_request', message: 'ID de usuario es requerido' },
        { status: 400 }
      )
    }

    if (resolvedParams.id === ctx!.userId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'No puedes desactivarte a ti mismo' },
        { status: 400 }
      )
    }

    if (ctx!.role === 'notario') {
      const target = await UsuarioService.findUsuarioById(resolvedParams.id)
      if (!target || target.notaria_id !== ctx!.notaryOfficeId) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Solo puede desactivar usuarios de su notaría',
              details: {},
            },
          },
          { status: 403 }
        )
      }
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
