import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Cliente para operaciones server-side (usa service role key)
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Cliente para operaciones client-side (usa anon key)
export function createClientClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

// Instancia singleton del cliente del navegador (para evitar múltiples instancias)
let browserClientInstance: SupabaseClient | null = null

// Cliente para el navegador (con persistencia de sesión)
// Usa un patrón singleton para evitar múltiples instancias
export function createBrowserClient(): SupabaseClient {
  // Si ya existe una instancia, reutilizarla
  if (browserClientInstance) {
    return browserClientInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Durante build time (SSR/SSG), las variables pueden no estar disponibles
  // En ese caso, crear un cliente con valores dummy que solo se usará en build
  // El cliente real se creará en runtime cuando las variables estén disponibles
  if (!supabaseUrl || !supabaseAnonKey) {
    // Si estamos en el navegador (runtime), las variables deberían estar disponibles
    // Si no, es un error real de configuración
    if (typeof window !== 'undefined') {
      throw new Error('Missing Supabase environment variables')
    }
    
    // Durante build time (server-side), crear un cliente dummy
    // Este cliente nunca se usará realmente, solo permite que el código se compile
    // Next.js necesita que los módulos se puedan importar sin errores durante build
    const placeholderUrl = 'https://placeholder.supabase.co'
    const placeholderKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'
    
    browserClientInstance = createClient(placeholderUrl, placeholderKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
    return browserClientInstance
  }

  // Crear instancia única
  browserClientInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return browserClientInstance
}

