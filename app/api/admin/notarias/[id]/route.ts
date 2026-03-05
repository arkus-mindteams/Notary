import { NextResponse } from 'next/server'
import { NotariaService } from '@/lib/services/notaria-service'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import type { UpdateNotariaRequest } from '@/lib/types/auth-types'

// PUT - Actualizar notaría (ADMIN_NOTARIAS, solo superadmin)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_NOTARIAS')
    if (err) return err

    const resolvedParams = params instanceof Promise ? await params : params
    const body: UpdateNotariaRequest = await req.json()
    const notaria = await NotariaService.updateNotaria(resolvedParams.id, body)
    return NextResponse.json(notaria)
  } catch (error: any) {
    console.error('[api/admin/notarias/[id]] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Desactivar notaría (ADMIN_NOTARIAS, solo superadmin)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_NOTARIAS')
    if (err) return err

    const resolvedParams = params instanceof Promise ? await params : params
    await NotariaService.deactivateNotaria(resolvedParams.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/admin/notarias/[id]] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
