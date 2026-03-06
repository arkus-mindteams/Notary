import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import { revokeInvitation } from '@/lib/services/invitation-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_INVITE')
    if (err) return err

    const body = await req.json().catch(() => ({}))
    const invitationId = body.invitation_id ?? body.invitationId

    if (!invitationId || typeof invitationId !== 'string') {
      return apiError('VALIDATION_ERROR', 'invitation_id es requerido', 400, { field: 'invitation_id' })
    }

    const invitation = await revokeInvitation(invitationId)

    await insertAuditLog({
      actor_user_id: ctx!.userId,
      action: 'USER_INVITATION_REVOKED',
      entity_type: 'user_invitation',
      entity_id: invitation.id,
      metadata_json: {
        email: invitation.email,
        revoked_at: invitation.revoked_at,
      },
      notaria_id: invitation.notaria_id,
    })

    return apiSuccess({
      invitation_id: invitation.id,
      revoked_at: invitation.revoked_at,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : ''
    if (message === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Invitación no encontrada', 404)
    }
    if (message === 'CONFLICT') {
      return apiError('CONFLICT', 'La invitación ya fue aceptada', 409)
    }
    console.error('[api/admin/usuarios/invite/revoke]', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
