import { createBrowserClient } from '@/lib/supabase'

// Create a client instance (singleton from the helper)
const supabase = createBrowserClient()

export const STATS_EVENTS = {
    ARCHITECTURAL_PLAN_PROCESSED: 'architectural_plan_processed',
    ARCHITECTURAL_PLAN_FINALIZED: 'architectural_plan_finalized',
}

export type StatsPeriod = 'day' | 'month' | 'total'

export interface StatsFilter {
    startDate?: string
    endDate?: string
}

export const StatsService = {
    /**
     * Calculates estimated cost in USD based on token usage.
     * Defaults to GPT-4o pricing (Input: $2.50/1M, Output: $10.00/1M).
     */
    calculateEstimatedCost(usage: { prompt_tokens: number; completion_tokens: number }, model: string = "gpt-4o"): number {
        // Pricing per 1M tokens (as of Jan 2026 - hypothetical/current)
        // GPT-4o
        const PRICING = {
            "gpt-4o": { input: 2.50, output: 10.00 },
            "gpt-4o-mini": { input: 0.15, output: 0.60 },
            "o1": { input: 15.00, output: 60.00 },
            "o1-mini": { input: 3.00, output: 12.00 }
        }

        const pricing = PRICING[model as keyof typeof PRICING] || PRICING["gpt-4o"]

        const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input
        const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output

        return Number((inputCost + outputCost).toFixed(6))
    },

    /**
     * Logs a usage event to the database.
     * @param userId The ID of the user performing the action.
     * @param eventType The type of event to log.
     * @param metadata Optional additional data.
     * @returns The UUID of the created log, or null if error.
     */
    async logEvent(userId: string, eventType: string, metadata: Record<string, any> = {}): Promise<string | null> {
        try {
            const { data, error } = await supabase
                .from('usage_stats')
                .insert({
                    user_id: userId,
                    event_type: eventType,
                    metadata,
                })
                .select('id')
                .single()

            if (error) {
                console.error('Error logging stats event:', JSON.stringify(error, null, 2))
                console.error('Failed payload:', { userId, eventType, metadata })
                return null
            }

            return data.id
        } catch (error) {
            console.error('Error in StatsService.logEvent:', error)
            return null
        }
    },

    /**
     * Updates an existing stats event (e.g., to add final results).
     */
    async updateEvent(logId: string, metadata: Record<string, any>) {
        try {
            // First fetch existing metadata to merge
            const { data: existing } = await supabase
                .from('usage_stats')
                .select('metadata')
                .eq('id', logId)
                .single()

            const mergedMetadata = {
                ...(existing?.metadata || {}),
                ...metadata
            }

            const { error } = await supabase
                .from('usage_stats')
                .update({ metadata: mergedMetadata })
                .eq('id', logId)

            if (error) {
                console.error('Error updating stats event:', error)
            }
        } catch (error) {
            console.error('Error in StatsService.updateEvent:', error)
        }
    },

    /**
     * Logs a specific unit authorization detail to the child table.
     * This avoids bloating the main usage_stats JSON.
     */
    async logUnitProcessing(
        statsId: string,
        data: {
            unit_id: string
            original_text: string
            final_text: string
            similarity_score: number
            cost_usd: number
            usage?: any
            metrics?: any
        }
    ) {
        try {
            const { error } = await supabase
                .from('processed_units_log')
                .insert({
                    stats_id: statsId,
                    unit_id: data.unit_id,
                    original_text: data.original_text,
                    final_text: data.final_text,
                    similarity_score: data.similarity_score,
                    cost_usd: data.cost_usd,
                    usage: data.usage,
                    metrics: data.metrics
                })

            if (error) {
                console.error('Error logUnitProcessing:', error)
            }
        } catch (error) {
            console.error('Error in StatsService.logUnitProcessing:', error)
        }
    },

    /**
     * Fetches usage statistics for a specific event type.
     * Only accessible by superadmins (enforced by RLS).
     */
    async getUsageStats(eventType: string, period: StatsPeriod = 'day', filter: StatsFilter = {}) {
        let query = supabase
            .from('usage_stats')
            .select('created_at, user_id, metadata, users:user_id(email, nombre, apellido_paterno)')
            .eq('event_type', eventType)
            .order('created_at', { ascending: false })

        if (filter.startDate) {
            query = query.gte('created_at', filter.startDate)
        }

        if (filter.endDate) {
            query = query.lte('created_at', filter.endDate)
        }

        const { data, error } = await query

        if (error) {
            throw error
        }

        return data
    },

    /**
     * Fetches paginated logs with filtering.
     */
    async getUsageLogs(
        page: number = 1,
        pageSize: number = 10,
        filter: StatsFilter & { searchTerm?: string } = {}
    ) {
        // First get the count
        let countQuery = supabase
            .from('usage_stats')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED)

        if (filter.startDate) countQuery = countQuery.gte('created_at', filter.startDate)
        if (filter.endDate) countQuery = countQuery.lte('created_at', filter.endDate)

        const { count } = await countQuery

        // Then get data
        let query = supabase
            .from('usage_stats')
            .select('id, created_at, user_id, metadata, users:user_id(email, nombre, apellido_paterno)')
            .eq('event_type', STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED)
            .order('created_at', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1)

        if (filter.startDate) query = query.gte('created_at', filter.startDate)
        if (filter.endDate) query = query.lte('created_at', filter.endDate)

        const { data, error } = await query

        if (error) {
            console.error("Error fetching logs:", error)
            throw error
        }

        return { data: data || [], count: count || 0 }
    },

    /**
     * Aggregates stats by day for charting.
     */
    async getDailyUsage(eventType: string, days: number = 30) {
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const { data, error } = await supabase
            .from('usage_stats')
            .select('created_at')
            .eq('event_type', eventType)
            .gte('created_at', startDate.toISOString())

        if (error) throw error

        // Group by day
        const grouped = (data || []).reduce((acc, curr) => {
            const day = curr.created_at.split('T')[0]
            acc[day] = (acc[day] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        // Fill in missing days
        const result = []
        for (let i = 0; i < days; i++) {
            const d = new Date()
            d.setDate(d.getDate() - i)
            const dateStr = d.toISOString().split('T')[0]
            result.push({
                date: dateStr,
                count: grouped[dateStr] || 0
            })
        }

        return result.reverse()
    },

    /**
      * Gets total count of users who have used the feature
      */
    async getUniqueUsersCount(eventType: string) {
        const { data, error } = await supabase
            .from('usage_stats')
            .select('user_id')
            .eq('event_type', eventType)

        if (error) throw error

        const uniqueUsers = new Set((data || []).map(d => d.user_id))
        return uniqueUsers.size
    },

    /**
     * Fetches detailed unit logs for a specific processing session.
     */
    async getLogDetails(statsId: string) {
        const { data, error } = await supabase
            .from('processed_units_log')
            .select('*')
            .eq('stats_id', statsId)
            .order('created_at', { ascending: true })

        if (error) {
            console.error('Error fetching log details:', error)
            return []
        }
        return data
    }
}
