import { useCallback, useMemo } from 'react'
import { createBrowserClient } from '@/lib/supabase'

/**
 * Hook para hacer peticiones fetch con autenticación automática
 * Obtiene el token de la sesión de Supabase y lo agrega al header Authorization
 */
export function useFetchWithAuth() {
  // Memoizar la instancia del cliente para evitar recrearla en cada render
  const supabase = useMemo(() => createBrowserClient(), [])

  const fetchWithAuth = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const { data: { session } } = await supabase.auth.getSession()

    const headers = new Headers(options.headers)

    // Agregar token de autorización si existe sesión
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`)
    }

    // Agregar Content-Type si no está presente y hay body
    if (options.body && !headers.has('Content-Type')) {
      if (options.body instanceof FormData) {
        // No agregar Content-Type para FormData, el navegador lo hace automáticamente
      } else {
        headers.set('Content-Type', 'application/json')
      }
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }, [supabase])

  return fetchWithAuth
}

