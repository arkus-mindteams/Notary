import { NextResponse } from 'next/server'
import { NotariaService } from '@/lib/services/notaria-service'
import { createServerClient } from '@/lib/supabase'
import { UsuarioService } from '@/lib/services/usuario-service'
import type { UpdateNotariaRequest } from '@/lib/types/auth-types'

// PUT - Actualizar notaría (solo superadmin)
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
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
        { error: 'forbidden', message: 'Solo superadmin puede actualizar notarías' },
        { status: 403 }
      )
    }

    const body: UpdateNotariaRequest = await req.json()
    const notaria = await NotariaService.updateNotaria(params.id, body)
    
    return NextResponse.json(notaria)
  } catch (error: any) {
    console.error('[api/admin/notarias/[id]] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE - Desactivar notaría (solo superadmin)
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
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
        { error: 'forbidden', message: 'Solo superadmin puede desactivar notarías' },
        { status: 403 }
      )
    }

    await NotariaService.deactivateNotaria(params.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/admin/notarias/[id]] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

