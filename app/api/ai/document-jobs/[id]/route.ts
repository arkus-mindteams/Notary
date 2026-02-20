import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentProcessingJobService } from '@/lib/services/document-processing-job-service'

export async function GET(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }
    const resolved = await Promise.resolve(params)
    const jobId = String(resolved.id || '')
    const job = await DocumentProcessingJobService.findById(jobId)
    if (!job) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Job no encontrado' } }, { status: 404 })
    }
    if (String(job.user_id) !== String(currentUser.id) && currentUser.rol !== 'superadmin') {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'No autorizado' } }, { status: 403 })
    }
    return NextResponse.json({ job })
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error?.message || 'Error obteniendo job' } },
      { status: 500 }
    )
  }
}

