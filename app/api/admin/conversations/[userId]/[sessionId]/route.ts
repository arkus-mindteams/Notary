import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/conversations/[userId]/[sessionId]
 * Returns full session details
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ userId: string; sessionId: string }> }
) {
    try {
        const { userId, sessionId } = await params
        console.log('[session-detail] Request for userId:', userId, 'sessionId:', sessionId)

        if (!userId || userId === 'undefined' || userId === 'null') {
            return NextResponse.json({ error: 'Invalid userId parameter' }, { status: 400 })
        }
        if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
            return NextResponse.json({ error: 'Invalid sessionId parameter' }, { status: 400 })
        }

        if (userId === 'anonymous') {
            return NextResponse.json({ error: 'Anonymous users do not have stored sessions' }, { status: 404 })
        }

        const supabase = createServerClient()
        const authHeader = req.headers.get('authorization')

        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized', message: 'No auth header' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', message: 'Invalid token' }, { status: 401 })
        }

        // Check admin role
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('auth_user_id', user.id)
            .single()

        if (usuario?.rol !== 'superadmin' && usuario?.rol !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // Fetch session
        const { data: session, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', userId)
            .single()

        if (sessionError) {
            console.error('[session-detail] Session fetch error:', sessionError)
            return NextResponse.json({ error: 'Session not found', detail: sessionError.message }, { status: 404 })
        }

        // Fetch messages
        const { data: messages, error: messagesError } = await supabase
            .from('chat_messages')
            .select('id, role, content, metadata, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })

        if (messagesError) console.error('[session-detail] Messages fetch error:', messagesError)

        // Aggregate usage
        const { data: usageLogs } = await supabase
            .from('agent_usage_logs')
            .select('total_tokens, estimated_cost, model, created_at')
            .eq('session_id', sessionId)

        const totalTokens = usageLogs?.reduce((sum, log) => sum + (log.total_tokens || 0), 0) || 0
        const totalCost = usageLogs?.reduce((sum, log) => sum + (log.estimated_cost || 0), 0) || 0

        // Fetch related documents if tramite_id exists
        let documents: any[] = []
        const tramiteId = session.last_context?.tramite_id

        if (tramiteId) {
            const { data: docs } = await supabase
                .from('documentos')
                .select('id, nombre, tipo, created_at')
                .eq('tramite_id', tramiteId)
            documents = docs || []
        }

        return NextResponse.json({
            session: {
                id: session.id,
                title: session.title,
                createdAt: session.created_at,
                totalTokens,
                totalCost: Number(totalCost.toFixed(4)),
                models: [...new Set(usageLogs?.map(log => log.model))].filter(Boolean)
            },
            messages: messages || [],
            documents
        })

    } catch (err: any) {
        console.error('[session-detail] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal Server Error', message: err.message }, { status: 500 })
    }
}
