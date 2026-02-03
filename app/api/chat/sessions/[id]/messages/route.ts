
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const supabase = createServerClient()
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        const { id: sessionId } = await params

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify ownership
        const { data: chatSession, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('id, last_context')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single()

        if (sessionError || !chatSession) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        // Fetch messages
        const { data: messages, error: messagesError } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })

        if (messagesError) throw messagesError

        return NextResponse.json({
            messages,
            session: chatSession
        })
    } catch (error: any) {
        console.error(`[GET /api/chat/sessions/unknown/messages] Error:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const supabase = createServerClient()
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        const { id: sessionId } = await params

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { role, content, metadata } = body

        if (!content || !role) {
            return NextResponse.json({ error: 'Missing content or role' }, { status: 400 })
        }

        // Verify ownership
        const { data: chatSession, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('id')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single()

        if (sessionError || !chatSession) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        // Insert message
        const { data: message, error: insertError } = await supabase
            .from('chat_messages')
            .insert({
                session_id: sessionId,
                role,
                content,
                metadata: metadata || {}
            })
            .select()
            .single()

        if (insertError) throw insertError

        return NextResponse.json({ message })
    } catch (error: any) {
        console.error(`[POST /api/chat/sessions/unknown/messages] Error:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
