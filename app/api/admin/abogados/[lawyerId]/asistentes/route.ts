import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/auth/authContext'
import { requireCapability } from '@/lib/authz/requireCapability'
import { UsuarioService } from '@/lib/services/usuario-service'
import {
  listAsistentesForLawyer,
  addAssistant,
} from '@/lib/services/supports-lawyer-service'
import { insertAuditLog } from '@/lib/services/audit-log-service'
import { apiSuccess, apiError } from '@/lib/api-response'

type RouteParams = Promise<{ lawyerId: string }> | { lawyerId: string }

function resolveParams(params: RouteParams): Promise<{ lawyerId: string }> {
  return params instanceof Promise ? params : Promise.resolve(params)
}

// GET - Listar asistentes del abogado
export async function GET(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'LAWYER_SUPPORTS_EDIT')
    if (err) return err

    const { lawyerId } = await resolveParams(params)
    if (!lawyerId) {
      return apiError('VALIDATION_ERROR', 'lawyerId es requerido', 400)
    }

    const lawyer = await UsuarioService.findUsuarioById(lawyerId)
    if (!lawyer) {
      return apiError('NOT_FOUND', 'Abogado no encontrado', 404)
    }
    if (lawyer.rol !== 'abogado') {
      return apiError('NOT_FOUND', 'El usuario no es un abogado', 404)
    }

    if (ctx!.role === 'notario' && lawyer.notaria_id !== ctx!.notaryOfficeId) {
      return apiError('FORBIDDEN', 'Solo puede ver abogados de su notaría', 403)
    }

    const list = await listAsistentesForLawyer(lawyerId)
    return apiSuccess(list)
  } catch (e: unknown) {
    console.error('[api/admin/abogados/[lawyerId]/asistentes] GET', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}

// POST - Asignar asistente al abogado
export async function POST(
  req: NextRequest,
  { params }: { params: RouteParams }
) {
  try {
    const ctx = await getAuthContext(req)
    const err = requireCapability(ctx, 'LAWYER_SUPPORTS_EDIT')
    if (err) return err

    const { lawyerId } = await resolveParams(params)
    if (!lawyerId) {
      return apiError('VALIDATION_ERROR', 'lawyerId es requerido', 400)
    }

    const body = await req.json().catch(() => ({}))
    const assistantId = body.assistant_user_id ?? body.assistantId
    if (!assistantId || typeof assistantId !== 'string') {
      return apiError('VALIDATION_ERROR', 'assistant_user_id es requerido', 400, {
        field: 'assistant_user_id',
      })
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

    const assistant = await UsuarioService.findUsuarioById(assistantId)
    if (!assistant || assistant.rol !== 'asistente') {
      return apiError('NOT_FOUND', 'Asistente no encontrado', 404)
    }
    if (assistant.notaria_id !== lawyer.notaria_id) {
      return apiError('DOMAIN_RULE_VIOLATION', 'El asistente debe ser de la misma notaría que el abogado', 422)
    }

    const result = await addAssistant(lawyerId, assistantId, lawyer.notaria_id)

    await insertAuditLog({
      actor_user_id: ctx!.userId,
      action: 'LAWYER_SUPPORT_ASSIGNED',
      entity_type: 'usuarios_supports_lawyer',
      entity_id: null,
      metadata_json: {
        lawyer_id: lawyerId,
        assistant_id: assistantId,
        notaria_id: lawyer.notaria_id,
      },
      notaria_id: lawyer.notaria_id,
    })

    return apiSuccess(result, 201)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'CONFLICT') {
      return apiError('CONFLICT', 'La relación ya existe', 409)
    }
    console.error('[api/admin/abogados/[lawyerId]/asistentes] POST', e)
    return apiError('INTERNAL_ERROR', 'Error interno del servidor', 500)
  }
}
