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

        // 2. Fetch orphan logs (linked to user OR truly anonymous if isAnon)
        const query = supabase.from('agent_usage_logs').select('total_tokens, estimated_cost')

        if (isAnon) {
            query.is('user_id', null).is('session_id', null)
        } else {
            query.eq('user_id', userId).is('session_id', null)
        }

        const { data: orphanLogs } = await query
        const orphanTokens = orphanLogs?.reduce((sum, log) => sum + (log.total_tokens || 0), 0) || 0
        const orphanCost = orphanLogs?.reduce((sum, log) => sum + (log.estimated_cost || 0), 0) || 0

        // 3. Enriched active sessions
        const enrichedSessions = await Promise.all(
            sessions.map(async (session) => {
                if (!session.id) return null
                try {
                    const { count: messageCount } = await supabase
                        .from('chat_messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('session_id', session.id)

                    const { data: usageLogs } = await supabase
                        .from('agent_usage_logs')
                        .select('total_tokens, estimated_cost')
                        .eq('session_id', session.id)

                    const totalTokens = usageLogs?.reduce((sum, log) => sum + (log.total_tokens || 0), 0) || 0
                    const totalCost = usageLogs?.reduce((sum, log) => sum + (log.estimated_cost || 0), 0) || 0

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
