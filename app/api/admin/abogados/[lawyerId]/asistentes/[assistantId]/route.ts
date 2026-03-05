import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import { UsuarioService } from '@/lib/services/usuario-service'
import { removeAssistant } from '@/lib/services/supports-lawyer-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { apiSuccess, apiError } from '@/lib/api-response'

type RouteParams = Promise<{ lawyerId: string; assistantId: string }> | { lawyerId: string; assistantId: string }

function resolveParams(params: RouteParams): Promise<{ lawyerId: string; assistantId: string }> {
  return params instanceof Promise ? params : Promise.resolve(params)
}

// DELETE - Quitar asistente del abogado (soft delete: removed_at)
export async function DELETE(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'LAWYER_SUPPORTS_EDIT')
    if (err) return err

    const { lawyerId, assistantId } = await resolveParams(params)
    if (!lawyerId || !assistantId) {
      return apiError('VALIDATION_ERROR', 'lawyerId y assistantId son requeridos', 400)
    }

    const lawyer = await UsuarioService.findUsuarioById(lawyerId)
    if (!lawyer || lawyer.rol !== 'abogado') {
      return apiError('NOT_FOUND', 'Abogado no encontrado', 404)
    }
    if (!lawyer.notaria_id) {
      return apiError('DOMAIN_RULE_VIOLATION', 'Abogado sin notaría', 422)
    }

    if (ctx!.role === 'notario' && lawyer.notaria_id !== ctx!.notaryOfficeId) {
      return apiError('FORBIDDEN', 'Solo puede editar abogados de su notaría', 403)
    }

    const result = await removeAssistant(lawyerId, assistantId)

    await insertAuditLog({
      actor_user_id: ctx!.userId,
      action: 'LAWYER_SUPPORT_REMOVED',
      entity_type: 'usuarios_supports_lawyer',
      entity_id: null,
      metadata_json: {
        lawyer_id: lawyerId,
        assistant_id: assistantId,
        notaria_id: lawyer.notaria_id,
        removed_at: result.removed_at,
      },
      notaria_id: lawyer.notaria_id,
    })

    return apiSuccess(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Relación no encontrada', 404)
    }
    console.error('[api/admin/abogados/[lawyerId]/asistentes/[assistantId]] DELETE', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
