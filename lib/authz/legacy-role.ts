import type { Usuario } from '@/lib/types/auth-types'

/**
 * Indica si el usuario puede acceder a la sección admin (superadmin global o notario de notaría).
 * Usar en rutas bajo /api/admin/* (excepto las solo globales).
 */
export function canAccessAdmin(usuario: Usuario): boolean {
  return usuario.rol === 'superadmin' || usuario.rol === 'notario'
}

/**
 * Indica si el usuario tiene acceso admin global (solo superadmin).
 * Usar en rutas que listan/crean notarías u otros recursos globales.
 */
export function canAccessGlobalAdmin(usuario: Usuario): boolean {
  return usuario.rol === 'superadmin'
}
