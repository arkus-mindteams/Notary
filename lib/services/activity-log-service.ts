import { createServerClient } from '@/lib/supabase'

export type ActivityCategory = 'ai_usage' | 'user_event' | 'conversation' | 'document_processing'

interface LogAIUsageParams {
    userId: string
    sessionId?: string
    tramiteId?: string
    model: string
    tokensInput: number
    tokensOutput: number
    actionType?: string
    metadata?: Record<string, any>
}

interface LogDocumentUploadParams {
    userId: string
    sessionId?: string
    tramiteId?: string
    documentoId: string
    fileName: string
    fileSize: number
    mimeType: string
}

interface LogDocumentExtractionParams {
    userId: string
    tramiteId?: string
    documentoId: string
    traceId: string
    status: 'retry' | 'success' | 'error'
    attempt: number
    reason?: string
    actionType?: string
    metadata?: Record<string, any>
}

interface LogDocumentProcessingStageParams {
    userId: string
    sessionId?: string
    tramiteId?: string
    documentoId?: string
    traceId: string
    stage: 'extract_sync' | 'postprocess_async'
    status: 'queued' | 'success' | 'error' | 'skipped'
    durationMs?: number
    metadata?: Record<string, any>
}

interface LogDocumentIndexingParams {
    userId: string
    traceId: string
    documentoId: string
    tramiteId?: string
    stage: string
    status: 'start' | 'success' | 'error' | 'skipped' | 'needs_ocr'
    durationMs?: number
    metadata?: Record<string, any>
}

interface LogUserEventParams {
    userId: string
    eventType: string
    metadata?: Record<string, any>
    sessionId?: string
    tramiteId?: string
}

interface LogKnowledgeSnapshotParams {
    userId: string
    sessionId?: string
    tramiteId?: string
    snapshot: Record<string, any>
    actionType?: string
}

interface GetStatsOptions {
    userId?: string
    sessionId?: string
    tramiteId?: string
    category?: ActivityCategory
    startDate?: Date
    endDate?: Date
    limit?: number
}

/**
 * Unified Activity Log Service
 * Replaces: AgentUsageService, StatsService (partially), and conversation logging
 */
export class ActivityLogService {
    private static get supabase() {
        return createServerClient()
    }

    // Pricing per 1M tokens (USD)
    private static readonly PRICING: Record<string, { input: number; output: number }> = {
        'gpt-4o': { input: 5.00, output: 15.00 },
        'gpt-4o-mini': { input: 0.150, output: 0.600 },
        'o1': { input: 15.00, output: 60.00 },
        'o1-mini': { input: 3.00, output: 12.00 },
        'default': { input: 5.00, output: 15.00 }
    }

    /**
     * Calculate estimated cost based on token usage
     */
    private static calculateCost(model: string, inputTokens: number, outputTokens: number): number {
        const pricing = this.PRICING[model] || this.PRICING['default']
        const inputCost = (inputTokens / 1_000_000) * pricing.input
        const outputCost = (outputTokens / 1_000_000) * pricing.output
        return Number((inputCost + outputCost).toFixed(6))
    }

    /**
     * Log AI usage (replaces AgentUsageService.logUsage)
     */
    static async logAIUsage(params: LogAIUsageParams) {
        try {
            const cost = this.calculateCost(params.model, params.tokensInput, params.tokensOutput)

            const { data, error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: params.sessionId || null,
                    tramite_id: params.tramiteId || null,
                    category: 'ai_usage',
                    event_type: params.actionType || 'completion',
                    tokens_input: params.tokensInput,
                    tokens_output: params.tokensOutput,
                    tokens_total: params.tokensInput + params.tokensOutput,
                    estimated_cost: cost,
                    data: {
                        model: params.model,
                        ...params.metadata
                    }
                })
                .select()
                .single()

            if (error) {
                console.error('[ActivityLogService] Error logging AI usage:', error)
                return null
            }

            return data
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logAIUsage:', error)
            return null
        }
    }

    /**
     * Log document upload
     */
    static async logDocumentUpload(params: LogDocumentUploadParams) {
        try {
            const { error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: params.sessionId || null,
                    tramite_id: params.tramiteId || null,
                    category: 'document_processing',
                    event_type: 'document_upload',
                    data: {
                        documento_id: params.documentoId,
                        file_name: params.fileName,
                        file_size: params.fileSize,
                        mime_type: params.mimeType
                    }
                })

            if (error) {
                console.error('[ActivityLogService] Error logging document upload:', error)
            }
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logDocumentUpload:', error)
        }
    }

    /**
     * Log extraction attempts/results for auditability
     */
    static async logDocumentExtraction(params: LogDocumentExtractionParams) {
        try {
            const { error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: null,
                    tramite_id: params.tramiteId || null,
                    category: 'document_processing',
                    event_type: params.actionType || 'document_extraction',
                    data: {
                        documento_id: params.documentoId,
                        trace_id: params.traceId,
                        status: params.status,
                        attempt: params.attempt,
                        reason: params.reason || null,
                        ...(params.metadata || {})
                    }
                })

            if (error) {
                console.error('[ActivityLogService] Error logging document extraction:', error)
            }
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logDocumentExtraction:', error)
        }
    }

    /**
     * Log processing stages for end-to-end document pipeline latency auditing
     */
    static async logDocumentProcessingStage(params: LogDocumentProcessingStageParams) {
        try {
            const { error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: params.sessionId || null,
                    tramite_id: params.tramiteId || null,
                    category: 'document_processing',
                    event_type: 'document_processing_stage',
                    data: {
                        documento_id: params.documentoId || null,
                        trace_id: params.traceId,
                        stage: params.stage,
                        status: params.status,
                        duration_ms: params.durationMs ?? null,
                        ...(params.metadata || {})
                    }
                })

            if (error) {
                console.error('[ActivityLogService] Error logging document processing stage:', error)
            }
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logDocumentProcessingStage:', error)
        }
    }

    /**
     * Log document indexing stages (Fase 4: text chunks + embeddings)
     */
    static async logDocumentIndexing(params: LogDocumentIndexingParams) {
        try {
            const { error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: null,
                    tramite_id: params.tramiteId || null,
                    category: 'document_processing',
                    event_type: 'document_indexing',
                    data: {
                        documento_id: params.documentoId,
                        trace_id: params.traceId,
                        stage: params.stage,
                        status: params.status,
                        duration_ms: params.durationMs ?? null,
                        ...(params.metadata || {})
                    }
                })

            if (error) {
                console.error('[ActivityLogService] Error logging document indexing:', error)
            }
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logDocumentIndexing:', error)
        }
    }

    /**
     * Log user event (replaces StatsService.logEvent)
     */
    static async logUserEvent(params: LogUserEventParams): Promise<string | null> {
        try {
            const { data, error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: params.sessionId || null,
                    tramite_id: params.tramiteId || null,
                    category: 'user_event',
                    event_type: params.eventType,
                    data: params.metadata || {}
                })
                .select('id')
                .single()

            if (error) {
                console.error('[ActivityLogService] Error logging user event:', error)
                return null
            }

            return data.id
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logUserEvent:', error)
            return null
        }
    }

    /**
     * Log knowledge snapshot used by AI generation for reproducibility
     */
    static async logKnowledgeSnapshot(params: LogKnowledgeSnapshotParams): Promise<string | null> {
        try {
            const { data, error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId,
                    session_id: params.sessionId || null,
                    tramite_id: params.tramiteId || null,
                    category: 'ai_usage',
                    event_type: params.actionType || 'knowledge_snapshot',
                    data: {
                        model: params.snapshot?.model || process.env.OPENAI_MODEL || 'gpt-4o',
                        knowledge_snapshot: params.snapshot
                    }
                })
                .select('id')
                .single()

            if (error) {
                console.error('[ActivityLogService] Error logging knowledge snapshot:', error)
                return null
            }

            return data.id
        } catch (error) {
            console.error('[ActivityLogService] Unexpected error in logKnowledgeSnapshot:', error)
            return null
        }
    }

    /**
     * Get activity logs with filters
     */
    static async getLogs(options: GetStatsOptions = {}) {
        try {
            let query = this.supabase
                .from('activity_logs')
                .select(`
          *,
          usuarios:user_id(id, email, nombre),
          chat_sessions:session_id(id, title),
          tramites:tramite_id(id, numero_escritura)
        `)
                .order('created_at', { ascending: false })

            if (options.userId) {
                query = query.eq('user_id', options.userId)
            }

            if (options.sessionId) {
                query = query.eq('session_id', options.sessionId)
            }

            if (options.tramiteId) {
                query = query.eq('tramite_id', options.tramiteId)
            }

            if (options.category) {
                query = query.eq('category', options.category)
            }

            if (options.startDate) {
                query = query.gte('created_at', options.startDate.toISOString())
            }

            if (options.endDate) {
                query = query.lte('created_at', options.endDate.toISOString())
            }

            if (options.limit) {
                query = query.limit(options.limit)
            }

            const { data, error } = await query

            if (error) throw error

            return data
        } catch (error) {
            console.error('[ActivityLogService] Error getting logs:', error)
            return []
        }
    }

    /**
     * Get AI usage statistics
     */
    static async getAIUsageStats(options: GetStatsOptions = {}) {
        try {
            const logs = await this.getLogs({
                ...options,
                category: 'ai_usage'
            })

            const totalTokens = logs.reduce((sum, log) => sum + (log.tokens_total || 0), 0)
            const totalCost = logs.reduce((sum, log) => sum + (log.estimated_cost || 0), 0)
            const uniqueUsers = new Set(logs.map(log => log.user_id).filter(Boolean)).size
            const uniqueSessions = new Set(logs.map(log => log.session_id).filter(Boolean)).size

            // Group by model
            const byModel: Record<string, { count: number; tokens: number; cost: number }> = {}
            logs.forEach(log => {
                const model = log.data?.model || 'unknown'
                if (!byModel[model]) {
                    byModel[model] = { count: 0, tokens: 0, cost: 0 }
                }
                byModel[model].count++
                byModel[model].tokens += log.tokens_total || 0
                byModel[model].cost += log.estimated_cost || 0
            })

            // Group by event type
            const byEventType: Record<string, number> = {}
            logs.forEach(log => {
                byEventType[log.event_type] = (byEventType[log.event_type] || 0) + 1
            })

            return {
                logs,
                summary: {
                    totalRequests: logs.length,
                    totalTokens,
                    totalCost,
                    uniqueUsers,
                    uniqueSessions,
                    avgTokensPerRequest: logs.length > 0 ? Math.round(totalTokens / logs.length) : 0,
                    avgCostPerRequest: logs.length > 0 ? totalCost / logs.length : 0
                },
                byModel,
                byEventType
            }
        } catch (error) {
            console.error('[ActivityLogService] Error getting AI usage stats:', error)
            return null
        }
    }

    /**
     * Get daily usage aggregation
     */
    static async getDailyUsage(options: { startDate?: Date; endDate?: Date } = {}) {
        try {
            const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            const endDate = options.endDate || new Date()

            const { data, error } = await this.supabase.rpc('get_daily_activity_stats', {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
            })

            if (error) throw error

            return data
        } catch (error) {
            console.error('[ActivityLogService] Error getting daily usage:', error)
            return []
        }
    }

    /**
     * Get cost breakdown by user
     */
    static async getCostByUser(options: { startDate?: Date; endDate?: Date } = {}) {
        try {
            const logs = await this.getLogs({
                ...options,
                category: 'ai_usage'
            })

            const costByUser: Record<string, {
                userId: string
                email: string
                totalCost: number
                totalTokens: number
                requestCount: number
            }> = {}

            logs.forEach(log => {
                const userId = log.user_id
                if (!userId) return

                if (!costByUser[userId]) {
                    costByUser[userId] = {
                        userId,
                        email: log.usuarios?.email || 'Unknown',
                        totalCost: 0,
                        totalTokens: 0,
                        requestCount: 0
                    }
                }

                costByUser[userId].totalCost += log.estimated_cost || 0
                costByUser[userId].totalTokens += log.tokens_total || 0
                costByUser[userId].requestCount++
            })

            return Object.values(costByUser).sort((a, b) => b.totalCost - a.totalCost)
        } catch (error) {
            console.error('[ActivityLogService] Error getting cost by user:', error)
            return []
        }
    }
}
