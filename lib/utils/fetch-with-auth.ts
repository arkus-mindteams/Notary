import { createBrowserClient } from '@/lib/supabase'

// Instancia singleton para el helper (no hook)
// Lazy-load para evitar ejecución durante build time
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

function getSupabaseClient() {
  if (!supabaseClient) {
    // Solo crear el cliente si estamos en el navegador y las variables están disponibles
    if (typeof window !== 'undefined') {
      supabaseClient = createBrowserClient()
    } else {
      // Durante build time, retornar null y manejar en fetchWithAuth
      return null
    }
  }
  return supabaseClient
}

/**
 * Helper para hacer peticiones fetch con autenticación automática
 * Obtiene el token de la sesión de Supabase y lo agrega al header Authorization
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const client = getSupabaseClient()
  
  // Si no hay cliente (build time), hacer fetch sin auth
  if (!client) {
    return fetch(url, options)
  }
  
  const { data: { session } } = await client.auth.getSession()

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
