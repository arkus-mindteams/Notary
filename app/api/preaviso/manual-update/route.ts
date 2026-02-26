import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import {
  PreavisoProposedUpdateService,
  ProposedUpdateDomainViolationError,
} from '@/lib/services/preaviso-proposed-update-service'

const requestSchema = z
  .object({
    tramiteId: z.string().uuid(),
    updates: z
      .array(
        z.object({
          path: z.string().trim().min(1),
          value: z.unknown(),
        })
      )
      .min(1),
    source: z.literal('manual').default('manual'),
  })
  .strict()

const errorResponse = (
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  traceId?: string
) =>
  NextResponse.json(
    {
      error: {
        code,
        message,
        details,
        ...(traceId ? { trace_id: traceId } : {}),
      },
    },
    { status }
  )

const defaultDeps = {
  getCurrentUserFromRequest,
  findTramiteScope: async (tramiteId: string) => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('tramites')
      .select('id,tipo,user_id,comprador_id,compradores(notaria_id)')
      .eq('id', tramiteId)
      .maybeSingle()
    if (error) throw new Error(`Error loading tramite: ${error.message}`)
    return (data || null) as {
      id: string
      tipo: string
      user_id?: string | null
      comprador_id?: string | null
      compradores?: { notaria_id?: string | null } | null
    } | null
  },
  commitProposedUpdates: PreavisoProposedUpdateService.commit,
}

type RouteDeps = typeof defaultDeps

export function createPreavisoManualUpdateHandler(deps: RouteDeps = defaultDeps) {
  return async function POST(req: Request) {
    const traceId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    try {
      const currentUser = await deps.getCurrentUserFromRequest(req)
      if (!currentUser || !currentUser.activo || !currentUser.auth_user_id) {
        return errorResponse(401, 'UNAUTHORIZED', 'No autenticado', {}, traceId)
      }

      const parsed = requestSchema.safeParse(await req.json())
      if (!parsed.success) {
        return errorResponse(
          400,
          'VALIDATION_ERROR',
          'Body invalido',
          {
            issues: parsed.error.issues.map((x) => ({ path: x.path.join('.'), message: x.message })),
          },
          traceId
        )
      }

      const body = parsed.data
      const tramiteScope = await deps.findTramiteScope(body.tramiteId)
      if (!tramiteScope) return errorResponse(404, 'NOT_FOUND', 'Tramite no encontrado', {}, traceId)
      if (tramiteScope.tipo !== 'preaviso') {
        return errorResponse(422, 'DOMAIN_RULE_VIOLATION', 'Solo aplica para tramites preaviso', {}, traceId)
      }

      if (currentUser.rol !== 'superadmin') {
        if (tramiteScope.user_id && String(tramiteScope.user_id) !== String(currentUser.id)) {
          return errorResponse(403, 'FORBIDDEN', 'No autorizado para este tramite', {}, traceId)
        }
      }

      const proposedUpdates = body.updates.map((u) => ({
        op: 'set',
        path: String(u.path || '').trim(),
        value: u.value,
        reason: 'manual_inline_edit',
      }))

      console.info('[preaviso/manual-update] commit_start', {
        trace_id: traceId,
        tramite_id: body.tramiteId,
        source: body.source,
        paths: proposedUpdates.map((u) => u.path),
      })

      const committed = await deps.commitProposedUpdates({
        tramiteId: body.tramiteId,
        userId: currentUser.auth_user_id,
        traceId,
        proposedUpdates,
        source: body.source,
      })

      console.info('[preaviso/manual-update] commit_ok', {
        trace_id: traceId,
        applied_updates: committed.applied_updates,
      })

      return NextResponse.json(
        {
          ok: true,
          trace_id: traceId,
          source: body.source,
          applied_updates: committed.applied_updates,
          data: committed.data,
          state: committed.state,
        },
        { status: 200 }
      )
    } catch (error: any) {
      if (error instanceof ProposedUpdateDomainViolationError) {
        return errorResponse(422, error.code, error.message, {}, traceId)
      }
      return errorResponse(500, 'INTERNAL_ERROR', error?.message || 'Error interno del servidor', {}, traceId)
    }
  }
}

export const POST = createPreavisoManualUpdateHandler()

