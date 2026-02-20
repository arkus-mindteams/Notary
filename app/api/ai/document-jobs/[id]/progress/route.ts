import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentProcessingJobService } from '@/lib/services/document-processing-job-service'

const requestSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  processedDocs: z.number().int().min(0).optional(),
  failedDocs: z.number().int().min(0).optional(),
  totalDocs: z.number().int().min(0).optional(),
  currentDocument: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  metadataPatch: z.record(z.any()).optional(),
}).strict()

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }
    const resolved = await Promise.resolve(params)
    const jobId = String(resolved.id || '')
    if (!jobId) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'job id requerido' } }, { status: 400 })
    }
    const body = requestSchema.safeParse(await req.json())
    if (!body.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Body inválido', details: body.error.flatten() } },
        { status: 400 }
      )
    }

    const job = await DocumentProcessingJobService.findById(jobId)
    if (!job) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Job no encontrado' } }, { status: 404 })
    }
    if (String(job.user_id) !== String(currentUser.id) && currentUser.rol !== 'superadmin') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No autorizado' } }, { status: 403 })
    }

    const updated = await DocumentProcessingJobService.updateProgress({
      id: jobId,
      ...body.data,
    })
    return NextResponse.json({ job: updated })
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error?.message || 'Error actualizando job' } },
      { status: 500 }
    )
  }
}

