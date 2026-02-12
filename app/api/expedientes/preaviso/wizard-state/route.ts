import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { PreavisoWizardStateService } from '@/lib/services/preaviso-wizard-state-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { computePreavisoState } from '@/lib/preaviso-state'

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'No autenticado',
            details: {},
          },
        },
        { status: 401 }
      )
    }

    const body = await req.json()
    let context = body?.context || null

    if (!context && body?.tramiteId) {
      const tramite = await TramiteService.findTramiteById(String(body.tramiteId))
      if (!tramite) {
        return NextResponse.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'Trámite no encontrado',
              details: {},
            },
          },
          { status: 404 }
        )
      }
      context = tramite.datos || {}
    }

    if (!context) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Debes enviar context o tramiteId',
            details: {},
          },
        },
        { status: 400 }
      )
    }

    const computed = computePreavisoState(context)
    const wizardState = PreavisoWizardStateService.fromSnapshot(
      computed.state.current_state,
      computed.state.state_status,
      computed.state.required_missing,
      computed.state.blocking_reasons
    )

    return NextResponse.json(
      {
        ...computed.state,
        wizard_state: wizardState,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[api/expedientes/preaviso/wizard-state] Error:', error)
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Error interno del servidor',
          details: {},
        },
      },
      { status: 500 }
    )
  }
}
