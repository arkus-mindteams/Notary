import { createServerClient } from '@/lib/supabase'
import { UsuarioService } from '@/lib/services/usuario-service'
import type { Usuario } from '@/lib/types/auth-types'

/**
 * Obtiene el usuario actual desde el token de autorización en el header
 */
export async function getCurrentUserFromRequest(req: Request): Promise<Usuario | null> {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers.get('authorization')
    
    if (!authHeader) {
      return null
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createServerClient()
    
    // Validar el token con Supabase
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !authUser) {
      return null
    }

    // Buscar usuario en nuestra tabla usuarios
    const usuario = await UsuarioService.findUsuarioByAuthId(authUser.id)
    return usuario
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Obtiene el usuario actual desde el token de autorización (versión con sesión de cliente)
 */
export async function getCurrentUserFromSession(sessionToken: string): Promise<Usuario | null> {
  try {
    const supabase = createServerClient()
    
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(sessionToken)
    
    if (authError || !authUser) {
      return null
    }

    const usuario = await UsuarioService.findUsuarioByAuthId(authUser.id)
    return usuario
  } catch (error) {
    console.error('Error getting current user from session:', error)
    return null
  }
}

