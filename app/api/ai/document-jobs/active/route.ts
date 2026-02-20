import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentProcessingJobService } from '@/lib/services/document-processing-job-service'

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }
    const url = new URL(req.url)
    const tramiteId = url.searchParams.get('tramiteId')
    const sessionId = url.searchParams.get('sessionId')
    const job = await DocumentProcessingJobService.findLatestActive({
      userId: String(currentUser.id),
      tramiteId: tramiteId || null,
      sessionId: sessionId || null,
    })
    return NextResponse.json({ job: job || null })
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error?.message || 'Error buscando job activo' } },
      { status: 500 }
    )
  }
}

