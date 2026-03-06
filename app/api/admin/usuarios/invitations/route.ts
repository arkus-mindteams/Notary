import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import { listPendingInvitations } from '@/lib/services/invitation-service'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_INVITE')
    if (err) return err

    const notariaId = ctx!.role === 'notario' ? ctx!.notaryOfficeId : undefined
    const list = await listPendingInvitations(notariaId)
    return apiSuccess(list)
  } catch (e: unknown) {
    console.error('[api/admin/usuarios/invitations] GET', e)
    return apiError('INTERNAL_ERROR', 'Error al listar invitaciones', 500)
  }
}
