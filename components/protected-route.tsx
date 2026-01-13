"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Shield, Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, session, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Importante: proteger por sesión (fuente de verdad).
    // `user` puede ser null temporalmente si /api/auth/me falla, pero la sesión sigue válida.
    if (!isLoading && !session) {
      router.push('/login')
    }
  }, [session, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-md text-muted-foreground">Verificando autenticación...</p>
          </div>
        </div>
      </div>
    )
  }

  // Si hay sesión pero todavía no cargó el perfil (`user`), NO redirigir.
  if (session && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-md -md  text-muted-foreground">Verificando perfil...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
       <div className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <p className="text-md text-muted-foreground">Redirigiendo al login...</p>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

