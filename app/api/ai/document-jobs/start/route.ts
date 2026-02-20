import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentProcessingJobService } from '@/lib/services/document-processing-job-service'

const requestSchema = z.object({
  totalDocs: z.number().int().min(1),
  tramiteId: z.string().uuid().optional().nullable(),
  sessionId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.any()).optional(),
}).strict()

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }
    const body = requestSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Body inválido', details: body.error.flatten() } },
        { status: 400 }
      )
    }

    const job = await DocumentProcessingJobService.create({
      userId: String(currentUser.id),
      authUserId: currentUser.auth_user_id || null,
      tramiteId: body.data.tramiteId || null,
      sessionId: body.data.sessionId || null,
      totalDocs: body.data.totalDocs,
      metadata: body.data.metadata || {},
    })

    return NextResponse.json({ job })
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error?.message || 'Error creando job' } },
      { status: 500 }
    )
  }
}

