import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const supabase = createServerClient()

        // Check authentication - extract token from Authorization header
        const authHeader = req.headers.get('authorization')

        if (!authHeader) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'No autenticado' },
                { status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Token inválido' },
                { status: 401 }
            )
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

        // Fetch logs from unified table
        const { data: logs, error } = await supabase
            .from('activity_logs')
            .select(`
                user_id, 
                estimated_cost, 
                tokens_total, 
                category, 
                event_type, 
                created_at, 
                session_id,
                data,
                usuarios:user_id(email, nombre, apellido_paterno)
            `)
            .gte('created_at', startDate.toISOString())

        if (error) throw error

        // Aggregate stats
        let totalCost = 0
        let totalTokens = 0
        let similaritySum = 0
        let similarityCount = 0

        // User Stats (Global)
        const userStatsMap = new Map<string, any>()
        // User Stats (Architectural Plans)
        const deslindeUserStatsMap = new Map<string, any>()
        // User Stats (Chat Notarial)
        const chatUserStatsMap = new Map<string, any>()

        // Category Stats
        const categoryStatsMap = new Map<string, {
            category: string,
            tokens: number,
            cost: number
        }>()

        logs?.forEach(log => {
            // Global
            totalCost += Number(log.estimated_cost) || 0
            totalTokens += log.tokens_total || 0

            // Quality / Similarity (mostly for architectural plans)
            const meta = (log.data as any) || {}
            const quality = meta.quality_metrics || {}
            let sim = quality.global_similarity !== undefined ? quality.global_similarity : (meta.global_similarity)

            // Fallback for units which use similarity_score directly in data
            if (sim === undefined && meta.similarity_score !== undefined) {
                sim = meta.similarity_score
            }

            if (sim !== undefined && sim !== null) {
                similaritySum += Number(sim)
                similarityCount++
            }

            // User Breakdown
            const uid = log.user_id || 'anonymous'
            const user = (log as any).usuarios || {}
            const nombreCompleto = `${user.nombre || ''} ${user.apellido_paterno || ''}`.trim() || 'Desconocido'

            if (!userStatsMap.has(uid)) {
                const base = {
                    userId: uid,
                    email: user.email || 'N/A',
                    nombre: nombreCompleto,
                    tokens: 0,
                    cost: 0,
                    conversations: new Set(),
                    lastActivity: log.created_at
                }
                userStatsMap.set(uid, { ...base })
            }

            const uStats = userStatsMap.get(uid)!
            uStats.tokens += log.tokens_total || 0
            uStats.cost += Number(log.estimated_cost) || 0
            if (log.session_id) uStats.conversations.add(log.session_id)
            if (new Date(log.created_at) > new Date(uStats.lastActivity)) {
                uStats.lastActivity = log.created_at
            }

            // Category Breakdown - Better grouping for user-facing labels
            let cat = log.category || 'uncategorized'

            if (log.event_type === 'architectural_plan_processed' || log.event_type === 'unit_processed' || log.data?.category === 'deslinde') {
                cat = 'Planos Arquitectónicos'
            } else if (cat === 'ai_usage' || cat === 'chat' || log.session_id) {
                cat = 'Chat Notarial'
            } else {
                // Formatting for other categories
                cat = cat.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
            }

            if (!categoryStatsMap.has(cat)) {
                categoryStatsMap.set(cat, { category: cat, tokens: 0, cost: 0 })
            }
            const cStats = categoryStatsMap.get(cat)!
            cStats.tokens += log.tokens_total || 0
            cStats.cost += Number(log.estimated_cost) || 0

            // Module specific user breakdowns
            if (cat === 'Planos Arquitectónicos') {
                if (!deslindeUserStatsMap.has(uid)) {
                    deslindeUserStatsMap.set(uid, {
                        ...userStatsMap.get(uid),
                        tokens: 0,
                        cost: 0,
                        count: 0,
                        similaritySum: 0,
                        similarityCount: 0
                    })
                }
                const dUStats = deslindeUserStatsMap.get(uid)!
                dUStats.tokens += log.tokens_total || 0
                dUStats.cost += Number(log.estimated_cost) || 0

                // CRITICAL: Only count the parent event as a "Document", 
                // individual units contribute to cost/tokens but shouldn't inflate the count.
                if (log.event_type === 'architectural_plan_processed') {
                    dUStats.count += 1
                }

                if (sim !== undefined && sim !== null) {
                    dUStats.similaritySum += Number(sim)
                    dUStats.similarityCount += 1
                }
            } else if (cat === 'Chat Notarial') {
                if (!chatUserStatsMap.has(uid)) {
                    chatUserStatsMap.set(uid, {
                        ...userStatsMap.get(uid),
                        tokens: 0,
                        cost: 0,
                        conversations: new Set()
                    })
                }
                const cUStats = chatUserStatsMap.get(uid)!
                cUStats.tokens += log.tokens_total || 0
                cUStats.cost += Number(log.estimated_cost) || 0
                if (log.session_id) cUStats.conversations.add(log.session_id)
            }
        })

        const formatUserStats = (map: Map<string, any>) =>
            Array.from(map.values()).map(s => ({
                userId: s.userId,
                email: s.email,
                nombre: s.nombre,
                tokens: s.tokens,
                cost: Number(s.cost.toFixed(4)),
                count: s.count || s.conversations?.size || 0,
                lastActivity: s.lastActivity,
                avgSimilarity: s.similarityCount > 0 ? (s.similaritySum / s.similarityCount) * 100 : null
            })).sort((a, b) => b.cost - a.cost)

        const categoryBreakdown = Array.from(categoryStatsMap.values()).map(s => ({
            category: s.category,
            tokens: s.tokens,
            cost: Number(s.cost.toFixed(4))
        })).sort((a, b) => b.cost - a.cost)

        return NextResponse.json({
            period: range,
            totalCost: Number(totalCost.toFixed(4)),
            totalTokens,
            avgSimilarity: similarityCount > 0 ? (similaritySum / similarityCount) * 100 : 0,
            userStats: formatUserStats(userStatsMap),
            deslindeUserStats: formatUserStats(deslindeUserStatsMap),
            chatUserStats: formatUserStats(chatUserStatsMap),
            categoryStats: categoryBreakdown
        })

    } catch (err: any) {
        console.error('Error fetching usage stats:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
