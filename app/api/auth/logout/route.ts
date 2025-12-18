import { NextResponse } from 'next/server'
import { createClientClient } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const supabase = createClientClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      return NextResponse.json(
        { error: 'internal_error', message: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[api/auth/logout] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

