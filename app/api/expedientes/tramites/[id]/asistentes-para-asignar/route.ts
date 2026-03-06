import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { listAsistentesForLawyer } from '@/lib/services/supports-lawyer-service'
import { listAsignacionesPorTramite } from '@/lib/services/tramite-asignacion-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { apiSuccess, apiError } from '@/lib/api-response'

type RouteParams = Promise<{ id: string }> | { id: string }

function resolveParams(params: RouteParams): Promise<{ id: string }> {
  return params instanceof Promise ? params : Promise.resolve(params)
}

/**
 * GET - Lista asistentes que el abogado dueño del trámite puede asignar (supports_lawyer y aún no asignados).
 * Solo el dueño del trámite puede llamar este endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const ctx = await getAuthContext(req)
    if (!ctx) {
      return apiError('UNAUTHORIZED', 'No autenticado', 401)
    }
    if (ctx.status !== 'ACTIVE' || !ctx.notaryOfficeId) {
      return apiError('FORBIDDEN', 'Usuario no activo o sin notaría', 403)
    }

    const { id: tramiteId } = await resolveParams(params)
    if (!tramiteId) {
      return apiError('VALIDATION_ERROR', 'tramiteId es requerido', 400)
    }

    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) {
      return apiError('NOT_FOUND', 'Trámite no encontrado', 404)
    }
    const ownerId = tramite.user_id ?? null
    if (ownerId !== ctx.userId) {
      return apiError('FORBIDDEN', 'Solo el abogado dueño del trámite puede ver asistentes para asignar', 403)
    }

    const [asistentesDelAbogado, asignaciones] = await Promise.all([
      listAsistentesForLawyer(ctx.userId),
      listAsignacionesPorTramite(tramiteId),
    ])
    const assignedIds = new Set(asignaciones.map((a) => a.assistant_id))
    const available = asistentesDelAbogado
      .filter((a) => !assignedIds.has(a.user_id))
      .map((a) => ({ id: a.user_id, email: a.email, nombre: a.nombre }))

    return apiSuccess(available)
  } catch (e: unknown) {
    console.error('[api/expedientes/tramites/[id]/asistentes-para-asignar] GET', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
