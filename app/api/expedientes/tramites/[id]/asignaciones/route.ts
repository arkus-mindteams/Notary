import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { canReadCase } from '@/lib/authz/rebac'
import {
  listAsignacionesPorTramite,
  asignarTramiteAAasistente,
} from '@/lib/services/tramite-asignacion-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { apiSuccess, apiError } from '@/lib/api-response'

type RouteParams = Promise<{ id: string }> | { id: string }

function resolveParams(params: RouteParams): Promise<{ id: string }> {
  return params instanceof Promise ? params : Promise.resolve(params)
}

// GET - Listar asignaciones del trámite (quien pueda leer el trámite: dueño o notario)
export async function GET(
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

    const { id: tramiteId } = await resolveParams(params)
    if (!tramiteId) {
      return apiError('VALIDATION_ERROR', 'tramiteId es requerido', 400)
    }

    const allowed = await canReadCase(ctx, tramiteId)
    if (!allowed) {
      return apiError('NOT_FOUND', 'Trámite no encontrado o sin acceso', 404)
    }

    const list = await listAsignacionesPorTramite(tramiteId)
    return apiSuccess(list)
  } catch (e: unknown) {
    console.error('[api/expedientes/tramites/[id]/asignaciones] GET', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}

// POST - Asignar trámite a un asistente (solo abogado dueño)
export async function POST(
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
      return apiError('FORBIDDEN', 'Solo el abogado dueño del trámite puede asignar asistentes', 403)
    }

    const body = await req.json().catch(() => ({}))
    const assistantId = body?.assistant_id
    if (!assistantId || typeof assistantId !== 'string') {
      return apiError('VALIDATION_ERROR', 'assistant_id es requerido', 400)
    }

    try {
      const data = await asignarTramiteAAasistente(
        tramiteId,
        assistantId,
        ctx.userId,
        ctx.notaryOfficeId
      )
      await insertAuditLog({
        actor_user_id: ctx.userId,
        action: 'TRAMITE_ASSIGNED_TO_ASSISTANT',
        entity_type: 'tramites',
        entity_id: tramiteId,
        metadata_json: {
          lawyer_id: ctx.userId,
          assistant_id: assistantId,
          notaria_id: ctx.notaryOfficeId,
        },
        notaria_id: ctx.notaryOfficeId,
      })
      return apiSuccess(data, 201)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'NOT_FOUND') return apiError('NOT_FOUND', 'Trámite no encontrado', 404)
      if (msg === 'FORBIDDEN') return apiError('FORBIDDEN', 'No puede asignar a este asistente (no está vinculado o distinta notaría)', 403)
      if (msg === 'CONFLICT') return apiError('CONFLICT', 'El asistente ya está asignado a este trámite', 409)
      throw err
    }
  } catch (e: unknown) {
    console.error('[api/expedientes/tramites/[id]/asignaciones] POST', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
