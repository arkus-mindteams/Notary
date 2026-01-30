
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: Request) {
    try {
        const supabase = createServerClient()
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // List active sessions (not archived)
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('id, title, summary, updated_at, created_at, pinned')
            .eq('user_id', user.id)
            .eq('archived', false)
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(50)

        if (error) throw error

        return NextResponse.json({ sessions: data })
    } catch (error: any) {
        console.error('[GET /api/chat/sessions] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const supabase = createServerClient()
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json().catch(() => ({}))

        // Create new session
        const { data, error } = await supabase
            .from('chat_sessions')
            .insert({
                user_id: user.id,
                title: body.title || `Chat ${new Date().toLocaleDateString()}`,
                last_context: body.context || {},
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ session: data })
    } catch (error: any) {
        console.error('[POST /api/chat/sessions] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
