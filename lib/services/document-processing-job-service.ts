import { randomUUID } from 'crypto'

export type DocumentProcessingJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type DocumentProcessingJobState = {
  job_id: string
  trace_id: string
  status: DocumentProcessingJobStatus
  progress: number
  total_files: number
  processed_files: number
  current_file_name: string | null
  error: string | null
  data: any | null
  created_at: string
  updated_at: string
}

declare global {
  // eslint-disable-next-line no-var
  var __document_processing_jobs__: Map<string, DocumentProcessingJobState> | undefined
}

const jobs =
  globalThis.__document_processing_jobs__ ||
  (globalThis.__document_processing_jobs__ = new Map<string, DocumentProcessingJobState>())

function nowIso(): string {
  return new Date().toISOString()
}

export class DocumentProcessingJobService {
  static create(traceId: string, totalFiles: number): DocumentProcessingJobState {
    const jobId = randomUUID()
    const job: DocumentProcessingJobState = {
      job_id: jobId,
      trace_id: traceId,
      status: 'queued',
      progress: 0,
      total_files: Math.max(0, totalFiles),
      processed_files: 0,
      current_file_name: null,
      error: null,
      data: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    jobs.set(jobId, job)
    return job
  }

  static get(jobId: string): DocumentProcessingJobState | null {
    return jobs.get(jobId) || null
  }

  static update(jobId: string, patch: Partial<DocumentProcessingJobState>): DocumentProcessingJobState | null {
    const current = jobs.get(jobId)
    if (!current) return null
    const next = {
      ...current,
      ...patch,
      updated_at: nowIso(),
    }
    jobs.set(jobId, next)
    return next
  }
}
