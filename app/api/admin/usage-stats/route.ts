import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const supabase = createServerClient()

        // Check authentication (ADMIN ONLY ideally)
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Parse query params for range (default: current month)
        const url = new URL(req.url)
        const range = url.searchParams.get('range') || 'month'

        let startDate = new Date()
        if (range === 'month') {
            startDate.setDate(1) // First day of current month
            startDate.setHours(0, 0, 0, 0)
        } else if (range === 'all') {
            startDate = new Date(0) // Epoch
        }

        // Fetch logs
        const { data: logs, error } = await supabase
            .from('agent_usage_logs')
            .select('user_id, estimated_cost, total_tokens, model, created_at, session_id, category')
            .gte('created_at', startDate.toISOString())

        if (error) throw error

        // Aggregate stats
        let totalCost = 0
        let totalTokens = 0

        // User Stats
        const userStatsMap = new Map<string, {
            userId: string,
            tokens: number,
            cost: number,
            conversations: Set<string>
        }>()

        // Category Stats
        const categoryStatsMap = new Map<string, {
            category: string,
            tokens: number,
            cost: number
        }>()

        logs?.forEach(log => {
            // Global
            totalCost += log.estimated_cost || 0
            totalTokens += log.total_tokens || 0

            // User Breakdown
            const uid = log.user_id || 'anonymous'
            if (!userStatsMap.has(uid)) {
                userStatsMap.set(uid, { userId: uid, tokens: 0, cost: 0, conversations: new Set() })
            }
            const uStats = userStatsMap.get(uid)!
            uStats.tokens += log.total_tokens || 0
            uStats.cost += log.estimated_cost || 0
            if (log.session_id) uStats.conversations.add(log.session_id)

            // Category Breakdown
            const cat = log.category || 'uncategorized'
            if (!categoryStatsMap.has(cat)) {
                categoryStatsMap.set(cat, { category: cat, tokens: 0, cost: 0 })
            }
            const cStats = categoryStatsMap.get(cat)!
            cStats.tokens += log.total_tokens || 0
            cStats.cost += log.estimated_cost || 0
        })

        // Convert map to array
        const userBreakdown = Array.from(userStatsMap.values()).map(s => ({
            userId: s.userId,
            tokens: s.tokens,
            cost: Number(s.cost.toFixed(4)), // Round for display
            conversationCount: s.conversations.size
        })).sort((a, b) => b.cost - a.cost) // Sort by cost desc

        const categoryBreakdown = Array.from(categoryStatsMap.values()).map(s => ({
            category: s.category,
            tokens: s.tokens,
            cost: Number(s.cost.toFixed(4))
        })).sort((a, b) => b.cost - a.cost)

        // Fetch user details (emails) for the IDs found
        // Note: In a real app we might join 'profiles' or use admin auth client. 
        // For now, we return specific IDs. Frontend might resolve them or we try here.
        // If we have access to auth admin:
        // const { data: { users } } = await supabase.auth.admin.listUsers() 
        // This usually requires SERVICE_ROLE key. createServerClient might use it if configured as such?
        // standard createServerClient usually uses anon/user token. 

        // Let's check 'profiles' table existence? 
        // If not exists, we just return IDs.

        return NextResponse.json({
            period: range,
            totalCost: Number(totalCost.toFixed(4)),
            totalTokens,
            userStats: userBreakdown,
            categoryStats: categoryBreakdown
        })

    } catch (err: any) {
        console.error('Error fetching usage stats:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
