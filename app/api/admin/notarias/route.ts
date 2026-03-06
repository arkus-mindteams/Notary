import { NextResponse } from 'next/server'
import { NotariaService } from '@/lib/services/notaria-service'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import type { CreateNotariaRequest } from '@/lib/types/auth-types'

// GET - Listar notarías (ADMIN_NOTARIAS, solo superadmin)
export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_NOTARIAS')
    if (err) return err

    const notarias = await NotariaService.listNotarias()
    return NextResponse.json(notarias)
  } catch (error: any) {
    console.error('[api/admin/notarias] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Crear notaría (ADMIN_NOTARIAS, solo superadmin)
export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_NOTARIAS')
    if (err) return err

    const body: CreateNotariaRequest = await req.json()
    const notaria = await NotariaService.createNotaria(body)
    return NextResponse.json(notaria, { status: 201 })
  } catch (error: any) {
    console.error('[api/admin/notarias] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
