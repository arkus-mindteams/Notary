import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { getCapabilitiesForRole } from '@/lib/authz/capabilities'
import type { UserRole } from '@/lib/types/auth-types'
import type { Capability } from '@/lib/authz/capabilities'

export interface AuthContext {
  userId: string
  role: UserRole
  status: string
  notaryOfficeId: string | null
  capabilities: Capability[]
}

/**
 * Obtiene el contexto de autorización del request (usuario actual + capabilities).
 * Devuelve null si no hay token válido o no existe usuario en BD.
 * No bloquea por status; el caller o requireCapability debe comprobar status === 'ACTIVE' cuando aplique.
 */
export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const usuario = await getCurrentUserFromRequest(req)
  if (!usuario) return null

  const status: string =
    usuario.status != null ? usuario.status : usuario.activo ? 'ACTIVE' : 'SUSPENDED'

  return {
    userId: usuario.id,
    role: usuario.rol,
    status,
    notaryOfficeId: usuario.notaria_id,
    capabilities: getCapabilitiesForRole(usuario.rol),
  }
}
