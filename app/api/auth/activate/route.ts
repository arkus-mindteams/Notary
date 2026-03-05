import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  findInvitationByPlainToken,
  isInvitationValid,
  acceptInvitation,
} from '@/lib/services/invitation-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { apiSuccess, apiError } from '@/lib/api-response'

async function createUsuarioFromActivation(
  authUserId: string,
  email: string,
  role: string,
  notariaId: string,
  nombre: string,
  apellidoPaterno: string,
  apellidoMaterno: string
): Promise<{ id: string }> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      auth_user_id: authUserId,
      notaria_id: notariaId,
      email: email.toLowerCase(),
      nombre: nombre || '',
      apellido_paterno: apellidoPaterno || null,
      apellido_materno: apellidoMaterno || null,
      rol: role,
      activo: true,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Error creando usuario: ${error.message}`)
  }
  return { id: data.id }
}

async function createSupportsLawyerRelations(
  assistantId: string,
  lawyerIds: string[],
  notariaId: string
): Promise<void> {
  if (!lawyerIds?.length) return
  const supabase = createServerClient()
  for (const lawyerId of lawyerIds) {
    if (!lawyerId || typeof lawyerId !== 'string') continue
    await supabase.from('usuarios_supports_lawyer').insert({
      lawyer_id: lawyerId,
      assistant_id: assistantId,
      notaria_id: notariaId,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = body.token
    const password = body.password
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    const apellidoPaterno = typeof body.apellido_paterno === 'string' ? body.apellido_paterno.trim() : ''
    const apellidoMaterno = typeof body.apellido_materno === 'string' ? body.apellido_materno.trim() : ''

    if (!token || typeof token !== 'string') {
      return apiError('VALIDATION_ERROR', 'token es requerido', 400, { field: 'token' })
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return apiError('VALIDATION_ERROR', 'password es requerido (mínimo 6 caracteres)', 400, {
        field: 'password',
      })
    }

    const inv = await findInvitationByPlainToken(token.trim())
    if (!inv) {
      return apiError('NOT_FOUND', 'Invitación no encontrada o token inválido', 404)
    }

    const check = isInvitationValid(inv)
    if (!check.valid) {
      if (check.reason === 'already_accepted') {
        return apiError('CONFLICT', 'Esta invitación ya fue utilizada', 409)
      }
      if (check.reason === 'expired') {
        return apiError('CONFLICT', 'La invitación ha expirado', 409)
      }
      return apiError('CONFLICT', 'Invitación revocada o no válida', 409)
    }

    const supabase = createServerClient()
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message?.toLowerCase().includes('already') || authError.message?.toLowerCase().includes('exists')) {
        return apiError('CONFLICT', 'Ya existe una cuenta con este correo', 409)
      }
      console.error('[api/auth/activate] Auth createUser error:', authError)
      return apiError('INTERNAL_ERROR', 'No se pudo crear la cuenta', 500)
    }

    if (!authData.user) {
      return apiError('INTERNAL_ERROR', 'No se pudo crear la cuenta', 500)
    }

    const usuario = await createUsuarioFromActivation(
      authData.user.id,
      inv.email,
      inv.role,
      inv.notaria_id,
      nombre,
      apellidoPaterno,
      apellidoMaterno
    )

    await acceptInvitation(inv.id)

    const preconfig = (inv.preconfig_json || {}) as { supports_lawyer_user_ids?: string[] }
    const lawyerIds = preconfig.supports_lawyer_user_ids || []
    await createSupportsLawyerRelations(usuario.id, lawyerIds, inv.notaria_id)

    await insertAuditLog({
      actor_user_id: null,
      action: 'USER_ACTIVATED',
      entity_type: 'user',
      entity_id: usuario.id,
      metadata_json: {
        email: inv.email,
        role: inv.role,
        invitation_id: inv.id,
      },
      notaria_id: inv.notaria_id,
    })

    return apiSuccess({
      user_id: usuario.id,
      email: inv.email,
      status: 'ACTIVE',
      activated_at: new Date().toISOString(),
    })
  } catch (e: unknown) {
    console.error('[api/auth/activate]', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
