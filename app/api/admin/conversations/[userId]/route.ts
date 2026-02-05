import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/conversations/[userId]
 * Returns all chat sessions for a specific user
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const { userId } = await params
        console.log('[conversations] Request for userId:', userId)

        if (!userId || userId === 'undefined' || userId === 'null') {
            return NextResponse.json({ error: 'Invalid userId parameter' }, { status: 400 })
        }

        const isAnon = userId === 'anonymous'
        const supabase = createServerClient()
        const authHeader = req.headers.get('authorization')

        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized', message: 'No auth header' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            console.error('[conversations] Auth error:', authError)
            return NextResponse.json({ error: 'Unauthorized', message: 'Invalid token' }, { status: 401 })
        }

        // Check admin role
        const { data: usuario, error: uError } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('auth_user_id', user.id)
            .single()

        if (usuario?.rol !== 'superadmin' && usuario?.rol !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 0. Parse query parameters
        const url = new URL(req.url)
        const includePlans = url.searchParams.get('includePlans') === 'true'

        // 1. Fetch sessions OR empty array if anon
        let sessions: any[] = []
        if (!isAnon) {
            const { data: sData, error: sessionsError } = await supabase
                .from('chat_sessions')
                .select('id, title, summary, created_at, updated_at, archived, pinned')
                .eq('user_id', userId)
                .eq('archived', false)
                .order('updated_at', { ascending: false })

            if (sessionsError) {
                console.error('[conversations] Database error fetching sessions:', sessionsError)
                return NextResponse.json({ error: 'Database error fetching sessions', detail: sessionsError.message }, { status: 500 })
            }
            sessions = sData || []
        }

        // 3. Fetch Architectural Plans from activity_logs (ONLY IF REQUESTED)
        let planLogs: any[] = []
        if (includePlans) {
            const { data: pLogs } = await supabase
                .from('activity_logs')
                .select('id, created_at, data, tokens_total, estimated_cost')
                .eq('user_id', userId)
                .eq('event_type', 'architectural_plan_processed')
                .order('created_at', { ascending: false })
            planLogs = pLogs || []
        }

        // 4. Fetch Unit Processing details to sum them up with parents (ONLY IF REQUESTED)
        const unitStatsByPlan = new Map<string, { tokens: number, cost: number, count: number }>()
        if (includePlans) {
            const { data: unitLogs } = await supabase
                .from('activity_logs')
                .select('data, tokens_total, estimated_cost')
                .eq('user_id', userId)
                .eq('event_type', 'unit_processed')

            unitLogs?.forEach(unit => {
                const statsId = unit.data?.stats_id
                if (statsId) {
                    const current = unitStatsByPlan.get(statsId) || { tokens: 0, cost: 0, count: 0 }
                    unitStatsByPlan.set(statsId, {
                        tokens: current.tokens + (unit.tokens_total || 0),
                        cost: current.cost + (Number(unit.estimated_cost) || 0),
                        count: current.count + 1
                    })
                }
            })
        }

        // 5. Enriched active sessions using UNIFIED activity_logs
        const enrichedSessions = await Promise.all(
            sessions.map(async (session) => {
                if (!session.id) return null
                try {
                    const { count: messageCount } = await supabase
                        .from('chat_messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('session_id', session.id)

                    // ✅ Use activity_logs (unified table) instead of agent_usage_logs
                    const { data: usageLogs } = await supabase
                        .from('activity_logs')
                        .select('tokens_total, estimated_cost')
                        .eq('session_id', session.id)
                        .eq('category', 'ai_usage')

                    const totalTokens = usageLogs?.reduce((sum, log) => sum + (log.tokens_total || 0), 0) || 0
                    const totalCost = usageLogs?.reduce((sum, log) => sum + (Number(log.estimated_cost) || 0), 0) || 0

                    return {
                        ...session,
                        messageCount: messageCount || 0,
                        totalTokens,
                        totalCost: Number(totalCost.toFixed(4))
                    }
                } catch (e) {
                    return { ...session, messageCount: 0, totalTokens: 0, totalCost: 0, error: true }
                }
            })
        )

        const sessionsList = (enrichedSessions.filter(Boolean) as any[])

        // 6. Map Plan logs (ONLY IF REQUESTED)
        if (includePlans) {
            planLogs.forEach(plan => {
                const children = unitStatsByPlan.get(plan.id) || { tokens: 0, cost: 0, count: 0 }
                sessionsList.push({
                    id: plan.id,
                    title: 'Plan Arquitectónico',
                    summary: `Procesamiento de imagen (${plan.data?.meta_request?.images_count || 1} archivos)`,
                    messageCount: children.count,
                    totalTokens: (plan.tokens_total || 0) + children.tokens,
                    totalCost: Number(((Number(plan.estimated_cost) || 0) + children.cost).toFixed(4)),
                    created_at: plan.created_at,
                    isPlan: true
                })
            })
        }

        // 7. Sort merged list by created_at desc
        sessionsList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        // 8. Fetch orphan logs from activity_logs
        const query = supabase
            .from('activity_logs')
            .select('tokens_total, estimated_cost')
            .eq('category', 'ai_usage')
            .is('session_id', null)

        if (isAnon) {
            query.is('user_id', null)
        } else {
            query.eq('user_id', userId)
        }

        const { data: orphanLogs } = await query
        const orphanTokens = orphanLogs?.reduce((sum, log) => sum + (log.tokens_total || 0), 0) || 0
        const orphanCost = orphanLogs?.reduce((sum, log) => sum + (Number(log.estimated_cost) || 0), 0) || 0

        if (orphanTokens > 0) {
            sessionsList.unshift({
                id: 'orphan-usage',
                title: isAnon ? 'Uso de Sistema / Pruebas' : 'Uso general (sin chat asociado)',
                summary: isAnon ? 'Logs sin usuario ni sesión registrada (histórico)' : 'Actividad de IA no vinculada a una conversación específica',
                messageCount: 0,
                totalTokens: orphanTokens,
                totalCost: Number(orphanCost.toFixed(4)),
                created_at: new Date().toISOString(),
                isOrphan: true
            })
        }

        return NextResponse.json({ sessions: sessionsList })

    } catch (err: any) {
        console.error('[conversations] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal Server Error', message: err.message }, { status: 500 })
    }
}
