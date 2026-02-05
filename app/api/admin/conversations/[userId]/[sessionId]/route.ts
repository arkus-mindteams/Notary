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

        // 1. Try to fetch session from chat_sessions first
        const { data: session, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', userId)
            .single()

        if (sessionError) {
            // 2. FALLBACK: Check if this is an Architectural Plan in activity_logs
            const { data: planLog, error: planError } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('id', sessionId)
                .eq('user_id', userId)
                .eq('event_type', 'architectural_plan_processed')
                .single()

            if (planError || !planLog) {
                console.error('[session-detail] Not found in sessions or plans:', { sessionError, planError })
                return NextResponse.json({ error: 'Session not found' }, { status: 404 })
            }

            // This is a plan! Fetch units
            const { data: unitLogs } = await supabase
                .from('activity_logs')
                .select('*')
                .eq('category', 'document_processing')
                .eq('event_type', 'unit_processed')
                .contains('data', { stats_id: sessionId })
                .order('created_at', { ascending: true })

            const totalPlanTokens = (planLog.tokens_total || 0) + (unitLogs?.reduce((sum, u) => sum + (u.tokens_total || 0), 0) || 0)
            const totalPlanCost = (Number(planLog.estimated_cost) || 0) + (unitLogs?.reduce((sum, u) => sum + (Number(u.estimated_cost) || 0), 0) || 0)

            return NextResponse.json({
                isPlan: true,
                session: {
                    id: planLog.id,
                    title: 'Plan Arquitectónico',
                    createdAt: planLog.created_at,
                    totalTokens: totalPlanTokens,
                    totalCost: Number(totalPlanCost.toFixed(4)),
                    models: ['gpt-4o'], // Architectural plans use vision
                    metadata: planLog.data?.meta_request // Expose request metadata
                },
                units: unitLogs?.map(u => ({
                    id: u.id,
                    ...u.data,
                    created_at: u.created_at,
                    tokens: u.tokens_total,
                    cost: Number(u.estimated_cost)
                })) || [],
                documents: [] // Could link documents here if needed
            })
        }

        // 3. Normal path: Fetch messages for chat session
        const { data: messages, error: messagesError } = await supabase
            .from('chat_messages')
            .select('id, role, content, metadata, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })

        if (messagesError) console.error('[session-detail] Messages fetch error:', messagesError)

        // Aggregate usage from unified activity_logs table
        const { data: usageLogs } = await supabase
            .from('activity_logs')
            .select('tokens_total, estimated_cost, data, created_at')
            .eq('session_id', sessionId)
            .eq('category', 'ai_usage')

        const totalTokens = usageLogs?.reduce((sum, log) => sum + (log.tokens_total || 0), 0) || 0
        const totalCost = usageLogs?.reduce((sum, log) => sum + (Number(log.estimated_cost) || 0), 0) || 0

        // Fetch related documents via chat_session_documents bridge table
        const { data: linkedDocs } = await supabase
            .from('chat_session_documents')
            .select(`
                documentos:documento_id (
                    id, 
                    nombre, 
                    tipo, 
                    created_at
                )
            `)
            .eq('session_id', sessionId)

        // Flatten the join results
        const documents = linkedDocs?.map((ld: any) => ld.documentos).filter(Boolean) || []

        // Fallback: If no linked docs, check last_context.tramite_id (legacy)
        if (documents.length === 0) {
            const tramiteId = session.last_context?.tramite_id
            if (tramiteId) {
                const { data: legacyDocs } = await supabase
                    .from('documentos')
                    .select('id, nombre, tipo, created_at')
                    .eq('tramite_id', tramiteId)
                if (legacyDocs) documents.push(...legacyDocs)
            }
        }

        return NextResponse.json({
            session: {
                id: session.id,
                title: session.title,
                createdAt: session.created_at,
                totalTokens,
                totalCost: Number(totalCost.toFixed(4)),
                models: [...new Set(usageLogs?.map(log => log.data?.model))].filter(Boolean)
            },
            messages: messages || [],
            documents: [...new Map(documents.map((d: any) => [d.id, d])).values()] // Deduplicate by ID
        })

    } catch (err: any) {
        console.error('[session-detail] Unexpected error:', err)
        return NextResponse.json({ error: 'Internal Server Error', message: err.message }, { status: 500 })
    }
}
