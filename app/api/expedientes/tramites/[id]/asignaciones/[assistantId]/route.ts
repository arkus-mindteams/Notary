import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { quitarAsignacion, getAsignacion } from '@/lib/services/tramite-asignacion-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { apiSuccess, apiError } from '@/lib/api-response'

type RouteParams = Promise<{ id: string; assistantId: string }> | { id: string; assistantId: string }

function resolveParams(params: RouteParams): Promise<{ id: string; assistantId: string }> {
  return params instanceof Promise ? params : Promise.resolve(params)
}

// DELETE - Quitar asignación (solo abogado dueño)
export async function DELETE(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const ctx = await getAuthContext(req)
    if (!ctx) {
      return apiError('UNAUTHORIZED', 'No autenticado', 401)
    }
    if (ctx.status !== 'ACTIVE') {
      return apiError('FORBIDDEN', 'Usuario no activo', 403)
    }
    if (!ctx.notaryOfficeId) {
      return apiError('FORBIDDEN', 'Usuario sin notaría', 403)
    }

    const { id: tramiteId, assistantId } = await resolveParams(params)
    if (!tramiteId || !assistantId) {
      return apiError('VALIDATION_ERROR', 'tramiteId y assistantId son requeridos', 400)
    }

    const tramite = await TramiteService.findTramiteById(tramiteId)
    if (!tramite) {
      return apiError('NOT_FOUND', 'Trámite no encontrado', 404)
    }
    const ownerId = tramite.user_id ?? null
    if (ownerId !== ctx.userId) {
      return apiError('FORBIDDEN', 'Solo el abogado dueño del trámite puede quitar asignaciones', 403)
    }

    const asignacion = await getAsignacion(tramiteId, assistantId)
    if (!asignacion) {
      return apiError('NOT_FOUND', 'Asignación no encontrada', 404)
    }

    await quitarAsignacion(tramiteId, assistantId)
    await insertAuditLog({
      actor_user_id: ctx.userId,
      action: 'TRAMITE_UNASSIGNED_FROM_ASSISTANT',
      entity_type: 'tramites',
      entity_id: tramiteId,
      metadata_json: {
        lawyer_id: ctx.userId,
        assistant_id: assistantId,
        notaria_id: ctx.notaryOfficeId,
      },
      notaria_id: ctx.notaryOfficeId,
    })
    return apiSuccess({ deleted: true })
  } catch (e: unknown) {
    console.error('[api/expedientes/tramites/[id]/asignaciones/[assistantId]] DELETE', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
