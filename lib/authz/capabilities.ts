import type { UserRole } from '@/lib/types/auth-types'

/**
 * Catálogo de capabilities (RBAC). Referencia: docs/authz/CAPABILITIES.md
 */
export const CAPABILITIES = [
  'ADMIN_USERS_VIEW',
  'ADMIN_USERS_INVITE',
  'ADMIN_USERS_STATUS_CHANGE',
  'ADMIN_NOTARIAS', // Solo superadmin: listar/crear/editar notarías
  'LAWYER_SUPPORTS_EDIT',
  'CASE_CREATE',
  'CASE_VIEW_ALL',
  'CASE_VIEW_OWN',
  'CASE_VIEW_DELEGATED',
  'DOCUMENT_UPLOAD',
  'PREAVISO_FINALIZE',
] as const

export type Capability = (typeof CAPABILITIES)[number]

const ALL_CAPABILITIES: Capability[] = [...CAPABILITIES]

/** Superadmin: todo excepto LAWYER_SUPPORTS_EDIT (gestión asistentes solo notario). */
const SUPERADMIN_CAPABILITIES: Capability[] = ALL_CAPABILITIES.filter((c) => c !== 'LAWYER_SUPPORTS_EDIT')

const NOTARIO_CAPABILITIES: Capability[] = [
  'ADMIN_USERS_VIEW',
  'ADMIN_USERS_INVITE',
  'ADMIN_USERS_STATUS_CHANGE',
  'LAWYER_SUPPORTS_EDIT',
  'CASE_CREATE',
  'CASE_VIEW_ALL',
  'DOCUMENT_UPLOAD',
  'PREAVISO_FINALIZE',
]
// ADMIN_NOTARIAS no está: solo superadmin

const ABOGADO_CAPABILITIES: Capability[] = [
  'CASE_CREATE',
  'CASE_VIEW_OWN',
  'CASE_VIEW_DELEGATED',
  'DOCUMENT_UPLOAD',
  'PREAVISO_FINALIZE',
]

const ASISTENTE_CAPABILITIES: Capability[] = [
  'CASE_VIEW_DELEGATED',
  'DOCUMENT_UPLOAD',
  'PREAVISO_FINALIZE',
]

/**
 * Devuelve las capabilities por defecto para un rol (fuente: CAPABILITIES.md).
 */
export function getCapabilitiesForRole(role: UserRole): Capability[] {
  switch (role) {
    case 'superadmin':
      return [...SUPERADMIN_CAPABILITIES]
    case 'notario':
      return [...NOTARIO_CAPABILITIES]
    case 'abogado':
      return [...ABOGADO_CAPABILITIES]
    case 'asistente':
      return [...ASISTENTE_CAPABILITIES]
    default:
      return []
  }
}

/**
 * Hook futuro: hoy devuelve capabilities por rol; mañana puede incluir overrides por usuario.
 * @param ctx - AuthContext (userId, role, status, notaryOfficeId, capabilities)
 */
export function getCapabilitiesForUser(ctx: { role: UserRole; capabilities?: string[] }): string[] {
  if (ctx.capabilities && Array.isArray(ctx.capabilities)) return ctx.capabilities
  return getCapabilitiesForRole(ctx.role)
}
