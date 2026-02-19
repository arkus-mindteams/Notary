export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentIntakeService } from '@/lib/ai/intake/document-intake.service'
import type { FileInput } from '@/lib/ai/intake/document-intake.types'

type IntakeRequestOptions = {
  maxPages?: number
  storeChunks?: boolean
  tramiteId?: string | null
  sessionId?: string | null
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  traceId: string,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details || {},
        trace_id: traceId,
      },
    },
    { status }
  )
}

function toNumberOrUndefined(value: unknown): number | undefined {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

function parseOptions(value: unknown): IntakeRequestOptions {
  if (!value) return {}
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    return {
      maxPages: toNumberOrUndefined(v.maxPages),
      storeChunks: v.storeChunks === undefined ? undefined : Boolean(v.storeChunks),
      tramiteId: v.tramiteId ? String(v.tramiteId) : null,
      sessionId: v.sessionId ? String(v.sessionId) : null,
    }
  }
  if (typeof value === 'string') {
    try {
      return parseOptions(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return {}
}

function buildFilesFromJson(body: any): FileInput[] {
  const docs = Array.isArray(body?.documents) ? body.documents : []
  const files: FileInput[] = []
  for (const item of docs) {
    const base64 = String(item?.base64 || item?.fileBase64 || '').trim()
    if (!base64) continue
    const documentId = String(item?.documentId || randomUUID())
    const filename = String(item?.filename || `${documentId}.pdf`)
    const mimeType = String(item?.mimeType || 'application/pdf')
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
    const file = new File([bytes], filename, { type: mimeType })
    files.push({
      documentId,
      filename,
      mimeType,
      file,
    })
  }
  return files
}

function buildFilesFromFormData(formData: FormData): FileInput[] {
  const metasRaw = String(formData.get('documentsMeta') || '[]')
  let metas: Array<{ documentId?: string; filename?: string; mimeType?: string }> = []
  try {
    const parsed = JSON.parse(metasRaw)
    if (Array.isArray(parsed)) metas = parsed
  } catch {
    metas = []
  }

  const filesRaw = [
    ...formData.getAll('documents'),
    ...formData.getAll('files'),
    ...formData.getAll('file'),
  ]
  const filesOnly = filesRaw.filter((f): f is File => f instanceof File)
  return filesOnly.map((file, idx) => {
    const meta = metas[idx] || {}
    return {
      documentId: String(meta.documentId || randomUUID()),
      filename: String(meta.filename || file.name || `document-${idx + 1}`),
      mimeType: String(meta.mimeType || file.type || 'application/octet-stream'),
      file,
    }
  })
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  const traceId = randomUUID()
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return errorResponse('UNAUTHORIZED', 'No autenticado', 401, traceId)
    }

    const contentType = String(req.headers.get('content-type') || '')
    let files: FileInput[] = []
    let options: IntakeRequestOptions = {}
    let traceIdInput: string = traceId

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      files = buildFilesFromFormData(formData)
      traceIdInput = String(formData.get('traceId') || traceId)
      options = parseOptions(formData.get('options'))
      if (!options.tramiteId && formData.get('tramiteId')) options.tramiteId = String(formData.get('tramiteId'))
      if (!options.sessionId && formData.get('sessionId')) options.sessionId = String(formData.get('sessionId'))
    } else {
      const body = await req.json().catch(() => null)
      files = buildFilesFromJson(body)
      traceIdInput = String(body?.traceId || traceId)
      options = parseOptions(body?.options)
      if (!options.tramiteId && body?.tramiteId) options.tramiteId = String(body.tramiteId)
      if (!options.sessionId && body?.sessionId) options.sessionId = String(body.sessionId)
    }

    if (files.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'documents[] es requerido', 400, traceIdInput)
    }

    const intakeService = new DocumentIntakeService()
    const result = await intakeService.processBatch({
      documents: files,
      traceId: traceIdInput,
      options: {
        maxPages: options.maxPages,
        storeChunks: options.storeChunks !== false,
        tramiteId: options.tramiteId || null,
        sessionId: options.sessionId || null,
      },
    })

    const elapsedMs = Date.now() - startedAt
    console.info('[document-intake-batch] success', {
      trace_id: traceIdInput,
      user_id: currentUser.auth_user_id || null,
      docs: result.documents.length,
      elapsed_ms: elapsedMs,
      detected_types: result.documents.map((d) => d.detectedType),
      confidences: result.documents.map((d) => d.confidence),
      pages: result.documents.reduce((acc, d) => acc + d.pages.length, 0),
    })

    return NextResponse.json({
      traceId: result.traceId,
      documents: result.documents.map((doc) => ({
        documentId: doc.documentId,
        type: doc.detectedType,
        confidence: doc.confidence,
        pages: doc.pages,
        summary: doc.summary,
        keyFields: doc.keyFields,
        facts: doc.facts,
        issues: doc.issues,
        raw: doc.raw || null,
      })),
      rules: result.rules,
      timings: {
        total_ms: elapsedMs,
      },
    })
  } catch (error: any) {
    const message = String(error?.message || 'Error interno')
    const status = message.includes('AI_OUTPUT_INVALID') ? 422 : message.includes('OpenAI') ? 502 : 500
    console.error('[document-intake-batch] error', {
      trace_id: traceId,
      message,
      status,
    })
    return errorResponse(
      status === 422 ? 'AI_OUTPUT_INVALID' : status === 502 ? 'AI_PROVIDER_ERROR' : 'INTERNAL_ERROR',
      message,
      status,
      traceId
    )
  }
}
