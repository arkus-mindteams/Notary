"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createBrowserClient } from '@/lib/supabase'
import type { AuthUser } from '@/lib/types/auth-types'
import type { Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: AuthUser | null
  session: Session | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Memoizar la instancia del cliente para evitar recrearla en cada render
  const supabase = useMemo(() => createBrowserClient(), [])
  const fetchingRef = useRef(false) // Ref para evitar llamadas duplicadas
  const pendingFetchRef = useRef<Promise<void> | null>(null) // Promise compartida para evitar "early return" con loading pegado

  const fetchUser = useCallback(async (authUserId: string) => {
    // Evitar llamadas duplicadas simultáneas: si ya hay una en curso, esperar la misma.
    if (fetchingRef.current && pendingFetchRef.current) {
      return await pendingFetchRef.current
    }

    const run = async () => {
      try {
        fetchingRef.current = true
      
        // Obtener token de la sesión actual.
        // IMPORTANTE: no usar timeouts aquí; getSession es local (storage) y un timeout puede provocar
        // falsos "deslogueos" si por cualquier razón tarda más de lo esperado.
        const { data: { session: currentSession } } = await supabase.auth.getSession()
      
        if (!currentSession?.access_token) {
          setUser(null)
          setSession(null)
          setIsLoading(false)
          return
        }

        // Fetch /api/auth/me con timeout (en Vercel a veces puede colgarse por red/cold start)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 7000)
        let response: Response | null = null
        try {
          response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${currentSession.access_token}`,
            },
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }
      
        if (response && response.ok) {
          const data = await response.json()
          setUser(data.user)
        } else {
          // Si el endpoint falla/no responde, NO desloguear al usuario por un fallo temporal.
          // Solo limpiar user/session si es un fallo real de auth (401/403).
          const status = response?.status
          if (status === 401 || status === 403) {
            setUser(null)
            setSession(null)
          } else {
            // Mantener el user previo (si existe) para evitar redirects falsos.
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error)
        // No borrar user/session por default: puede ser un fallo temporal de red/backend.
      } finally {
        setIsLoading(false)
        fetchingRef.current = false
        pendingFetchRef.current = null
      }
    }

    pendingFetchRef.current = run()
    return await pendingFetchRef.current
  }, [supabase])

  // Verificar sesión al cargar
  useEffect(() => {
    let mounted = true
    
    // Verificar sesión existente con manejo de errores (sin "timeouts" que provoquen redirects falsos).
    ;(async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!mounted) return
        
        if (error) {
          console.error('[Auth] Error obteniendo sesión:', error)
          setIsLoading(false)
          return
        }
        
        if (session) {
          setSession(session)
          await fetchUser(session.user.id)
        } else {
          setSession(null)
          setUser(null)
          setIsLoading(false)
        }
      } catch (error) {
        console.error('[Auth] Error inesperado obteniendo sesión:', error)
        if (mounted) {
          setIsLoading(false)
        }
      }
    })()

    // Escuchar cambios en la autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      console.info('[Auth] onAuthStateChange:', event)

      if (session) {
        setSession(session)
        // onAuthStateChange se dispara después del login, así que llamamos fetchUser
        await fetchUser(session.user.id)
      } else {
        setSession(null)
        setUser(null)
        setIsLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchUser, supabase])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true)
      
      // Autenticar directamente con Supabase
      const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !sessionData.session || !sessionData.user) {
        setIsLoading(false)
        return false
      }

      // No llamar a /api/auth/me aquí, onAuthStateChange lo hará automáticamente
      // Solo actualizar la sesión y esperar a que onAuthStateChange complete
      setSession(sessionData.session)
      
      // Actualizar último login (llamar a login API para registrar)
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).catch(() => {}) // Ignorar errores en actualización de login
      
      // Esperar a que onAuthStateChange complete el fetchUser
      // Esto evita llamadas duplicadas
      return true
    } catch (error) {
      console.error('Error en login:', error)
      setIsLoading(false)
      return false
    }
  }

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true)
      await supabase.auth.signOut()
      setUser(null)
      setSession(null)
    } catch (error) {
      console.error('Error en logout:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

