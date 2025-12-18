import { createBrowserClient } from '@/lib/supabase'

// Instancia singleton para el helper (no hook)
const supabaseClient = createBrowserClient()

/**
 * Helper para hacer peticiones fetch con autenticación automática
 * Obtiene el token de la sesión de Supabase y lo agrega al header Authorization
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabaseClient.auth.getSession()

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
}
