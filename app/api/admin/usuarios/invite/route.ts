import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import { createInvitation } from '@/lib/services/invitation-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { UsuarioService } from '@/lib/services/usuario-service'
import { apiSuccess, apiError } from '@/lib/api-response'
import type { UserRole } from '@/lib/types/auth-types'

const ALLOWED_INVITE_ROLES: UserRole[] = ['notario', 'abogado', 'asistente']

function validEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'ADMIN_USERS_INVITE')
    if (err) return err

    const body = await req.json().catch(() => ({}))
    const email = body.email
    const roleRaw = body.role
    const notariaId = body.notaria_id
    const preconfig = body.preconfig_json || {}

    if (!validEmail(email)) {
      return apiError('VALIDATION_ERROR', 'email es requerido y debe ser válido', 400, { field: 'email' })
    }

    const role = typeof roleRaw === 'string' ? roleRaw.toLowerCase() as UserRole : null
    if (!role || !ALLOWED_INVITE_ROLES.includes(role)) {
      return apiError('VALIDATION_ERROR', 'role debe ser notario, abogado o asistente', 400, { field: 'role' })
    }

    if (!notariaId || typeof notariaId !== 'string') {
      return apiError('VALIDATION_ERROR', 'notaria_id es requerido', 400, { field: 'notaria_id' })
    }

    if (ctx!.role === 'notario' && ctx!.notaryOfficeId !== notariaId) {
      return apiError('DOMAIN_RULE_VIOLATION', 'Solo puede invitar usuarios de su notaría', 422)
    }

    const lawyerIds = preconfig.supports_lawyer_user_ids
    if (role === 'asistente') {
      if (!Array.isArray(lawyerIds)) {
        return apiError('VALIDATION_ERROR', 'preconfig_json.supports_lawyer_user_ids es requerido para rol asistente', 400)
      }
      for (const lid of lawyerIds) {
        if (typeof lid !== 'string') continue
        const u = await UsuarioService.findUsuarioById(lid)
        if (!u || u.rol !== 'abogado' || u.notaria_id !== notariaId) {
          return apiError('DOMAIN_RULE_VIOLATION', 'Todos los abogados deben existir y pertenecer a la misma notaría', 422)
        }
      }
    }

    const result = await createInvitation({
      email: email.trim().toLowerCase(),
      role,
      notaria_id: notariaId,
      preconfig_json: { supports_lawyer_user_ids: role === 'asistente' ? lawyerIds : undefined },
      expires_in_days: 7,
    })

    await insertAuditLog({
      actor_user_id: ctx!.userId,
      action: 'USER_INVITED',
      entity_type: 'user_invitation',
      entity_id: result.invitation.id,
      metadata_json: {
        email: result.invitation.email,
        role: result.invitation.role,
        notaria_id: result.invitation.notaria_id,
      },
      notaria_id: result.invitation.notaria_id,
    })

    return apiSuccess(
      {
        invitation_id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        status: result.invitation.status,
        expires_at: result.invitation.expires_at ?? undefined,
        // El token plano solo debe enviarse por canal seguro (ej. email); no exponer en producción si no se envía por email
        activation_token: result.plainToken,
      },
      201
    )
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al crear invitación'
    if (message === 'INVITATION_EXISTS') {
      return apiError('CONFLICT', 'Ya existe una invitación pendiente para este email', 409)
    }
    console.error('[api/admin/usuarios/invite]', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
