"use client"

import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const SUPERADMIN_FORBIDDEN_PATHS = ['/dashboard/deslinde', '/dashboard/preaviso', '/dashboard/expedientes']

function isSuperadminForbiddenPath(pathname: string): boolean {
  if (!pathname) return false
  if (pathname === '/dashboard' || pathname === '/dashboard/') return true
  return SUPERADMIN_FORBIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    if (user.role === 'superadmin' && isSuperadminForbiddenPath(pathname ?? '')) {
      router.replace('/dashboard/admin/usuarios')
    }
  }, [user, pathname, router])

  return <>{children}</>
}
