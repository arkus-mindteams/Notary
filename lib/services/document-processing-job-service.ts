import { createServerClient } from '@/lib/supabase'

export type DocumentProcessingJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type DocumentProcessingJob = {
  id: string
  user_id: string
  auth_user_id: string | null
  tramite_id: string | null
  session_id: string | null
  status: DocumentProcessingJobStatus
  total_docs: number
  processed_docs: number
  failed_docs: number
  current_document: string | null
  message: string | null
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export class DocumentProcessingJobService {
  static async create(args: {
    userId: string
    authUserId?: string | null
    tramiteId?: string | null
    sessionId?: string | null
    totalDocs: number
    metadata?: Record<string, any>
  }): Promise<DocumentProcessingJob> {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('document_processing_jobs')
      .insert({
        user_id: args.userId,
        auth_user_id: args.authUserId || null,
        tramite_id: args.tramiteId || null,
        session_id: args.sessionId || null,
        status: 'queued',
        total_docs: Math.max(0, Number(args.totalDocs || 0)),
        processed_docs: 0,
        failed_docs: 0,
        metadata: args.metadata || {},
      })
      .select('*')
      .single()
    if (error || !data) throw new Error(`create_document_processing_job_failed: ${error?.message || 'unknown'}`)
    return data as DocumentProcessingJob
  }

  static async updateProgress(args: {
    id: string
    status?: DocumentProcessingJobStatus
    processedDocs?: number
    failedDocs?: number
    totalDocs?: number
    currentDocument?: string | null
    message?: string | null
    metadataPatch?: Record<string, any>
  }): Promise<DocumentProcessingJob> {
    const supabase = createServerClient()
    const { data: current, error: currentError } = await supabase
      .from('document_processing_jobs')
      .select('*')
      .eq('id', args.id)
      .single()
    if (currentError || !current) {
      throw new Error(`document_processing_job_not_found: ${currentError?.message || args.id}`)
    }

    const nextMetadata = {
      ...((current as any).metadata || {}),
      ...(args.metadataPatch || {}),
    }
    const nextStatus = args.status || (current as any).status
    const updates: Record<string, any> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      metadata: nextMetadata,
    }
    if (args.processedDocs !== undefined) updates.processed_docs = Math.max(0, Number(args.processedDocs || 0))
    if (args.failedDocs !== undefined) updates.failed_docs = Math.max(0, Number(args.failedDocs || 0))
    if (args.totalDocs !== undefined) updates.total_docs = Math.max(0, Number(args.totalDocs || 0))
    if (args.currentDocument !== undefined) updates.current_document = args.currentDocument
    if (args.message !== undefined) updates.message = args.message
    if (nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'cancelled') {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('document_processing_jobs')
      .update(updates)
      .eq('id', args.id)
      .select('*')
      .single()
    if (error || !data) throw new Error(`update_document_processing_job_failed: ${error?.message || 'unknown'}`)
    return data as DocumentProcessingJob
  }

  static async findById(id: string): Promise<DocumentProcessingJob | null> {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('document_processing_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`find_document_processing_job_failed: ${error.message}`)
    return (data || null) as DocumentProcessingJob | null
  }

  static async findLatestActive(args: {
    userId: string
    tramiteId?: string | null
    sessionId?: string | null
  }): Promise<DocumentProcessingJob | null> {
    const supabase = createServerClient()
    let query = supabase
      .from('document_processing_jobs')
      .select('*')
      .eq('user_id', args.userId)
      .in('status', ['queued', 'processing'])
      .order('updated_at', { ascending: false })
      .limit(1)
    if (args.tramiteId) query = query.eq('tramite_id', args.tramiteId)
    if (args.sessionId) query = query.eq('session_id', args.sessionId)
    const { data, error } = await query.maybeSingle()
    if (error) throw new Error(`find_latest_active_document_processing_job_failed: ${error.message}`)
    return (data || null) as DocumentProcessingJob | null
  }
}

