import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import {
  DomainRuleViolationError,
  PreavisoDomainService,
} from '@/lib/services/preaviso-domain-service'

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
    const preavisoData = body?.preavisoData

    if (!preavisoData) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'preavisoData es requerido',
            details: {},
          },
        },
        { status: 400 }
      )
    }

    const result = await PreavisoDomainService.finalizePreaviso(
      {
        preavisoData,
        tramiteId: body?.tramiteId || null,
        generatedDocument: body?.generatedDocument,
      },
      currentUser
    )

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    if (error instanceof DomainRuleViolationError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: {},
          },
        },
        { status: 422 }
      )
    }

    console.error('[api/expedientes/preaviso/finalize] Error:', error)
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

