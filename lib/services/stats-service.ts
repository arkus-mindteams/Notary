import { createBrowserClient } from '@/lib/supabase'

// Create a client instance (singleton from the helper)
const supabase = createBrowserClient()

export const STATS_EVENTS = {
    ARCHITECTURAL_PLAN_PROCESSED: 'architectural_plan_processed',
}

export type StatsPeriod = 'day' | 'month' | 'total'

export interface StatsFilter {
    startDate?: string
    endDate?: string
}

export const StatsService = {
    /**
     * Logs a usage event to the database.
     * @param userId The ID of the user performing the action.
     * @param eventType The type of event to log.
     * @param metadata Optional additional data.
     */
    async logEvent(userId: string, eventType: string, metadata: Record<string, any> = {}) {
        try {
            const { error } = await supabase
                .from('usage_stats')
                .insert({
                    user_id: userId,
                    event_type: eventType,
                    metadata,
                })

            if (error) {
                console.error('Error logging stats event:', error)
            }
        } catch (error) {
            console.error('Error in StatsService.logEvent:', error)
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
    }
}
