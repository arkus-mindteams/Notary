import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Cookie con el rol del usuario (seteada por /api/auth/me y login). Solo para bloqueo rápido en middleware; el backend es fuente de verdad. */
const ROLE_COOKIE_NAME = 'sb-user-role'

const ADMIN_ROLES = ['superadmin', 'notario']

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (!pathname.startsWith('/dashboard/admin')) {
    return NextResponse.next()
  }

  const role = request.cookies.get(ROLE_COOKIE_NAME)?.value

  if (role && ADMIN_ROLES.includes(role)) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}

export const config = {
  matcher: ['/dashboard/admin/:path*'],
}
