import type { AuthContext } from '@/lib/auth/authContext'
import type { Capability } from '@/lib/authz/capabilities'

/**
 * Error shape uniforme (API_CONTRACTS.md / AGENTS.md). Backend es fuente de verdad.
 */
function jsonError(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {}
) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
        trace_id: undefined as string | undefined,
      },
    },
    { status }
  )
}

/**
 * Comprueba que el usuario esté activo y tenga la capability indicada.
 * Devuelve una Response (401 o 403) si no está autorizado; null si está autorizado.
 * Usar en rutas: const err = requireCapability(ctx, 'ADMIN_USERS_VIEW'); if (err) return err;
 *
 * @param ctx - Contexto de auth (getAuthContext); si es null se devuelve 401.
 * @param capability - Capability requerida.
 * @returns Response 401/403 con error shape uniforme, o null si autorizado.
 */
export function requireCapability(
  ctx: AuthContext | null,
  capability: Capability
): Response | null {
  if (!ctx) {
    return jsonError('UNAUTHORIZED', 'No autenticado', 401)
  }

  if (ctx.status !== 'ACTIVE') {
    return jsonError(
      'FORBIDDEN',
      ctx.status === 'SUSPENDED' ? 'Usuario suspendido' : 'Cuenta no activa',
      403,
      { required_status: 'ACTIVE' }
    )
  }

  if (!ctx.capabilities.includes(capability)) {
    return jsonError('FORBIDDEN', 'Sin permiso para esta acción', 403, {
      required_capability: capability,
    })
  }

  return null
}
