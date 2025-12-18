import { NextResponse } from 'next/server'
import { NotariaService } from '@/lib/services/notaria-service'
import { createServerClient } from '@/lib/supabase'
import { UsuarioService } from '@/lib/services/usuario-service'
import type { CreateNotariaRequest, UpdateNotariaRequest } from '@/lib/types/auth-types'

// GET - Listar notarías (solo superadmin)
export async function GET(req: Request) {
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
        { error: 'forbidden', message: 'Solo superadmin puede acceder' },
        { status: 403 }
      )
    }

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

// POST - Crear notaría (solo superadmin)
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
        { error: 'forbidden', message: 'Solo superadmin puede crear notarías' },
        { status: 403 }
      )
    }

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

