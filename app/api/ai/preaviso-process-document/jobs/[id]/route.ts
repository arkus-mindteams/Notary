import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentProcessingJobService } from '@/lib/services/document-processing-job-service'

export async function GET(
  req: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserFromRequest(req)
  if (!currentUser || !currentUser.activo) {
    return NextResponse.json({ error: 'unauthorized', message: 'No autenticado' }, { status: 401 })
  }

  const resolved = await Promise.resolve(params)
  const job = DocumentProcessingJobService.get(resolved.id)
  if (!job) {
    return NextResponse.json({ error: 'not_found', message: 'Job no encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    job_id: job.job_id,
    trace_id: job.trace_id,
    status: job.status,
    progress: job.progress,
    total_files: job.total_files,
    processed_files: job.processed_files,
    current_file_name: job.current_file_name,
    error: job.error,
    data: job.status === 'completed' ? job.data : null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  })
}

