import { NextResponse } from 'next/server'
import { createClientClient } from '@/lib/supabase'

const ROLE_COOKIE_NAME = 'sb-user-role'

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

    const res = NextResponse.json({ success: true })
    res.headers.set('Set-Cookie', `${ROLE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return res
  } catch (error: any) {
    console.error('[api/auth/logout] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

