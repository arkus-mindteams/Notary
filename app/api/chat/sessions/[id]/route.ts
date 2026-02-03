
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = createServerClient()
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        // Await params for Next.js 15+
        const { id } = await params

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify ownership and delete
        const { error } = await supabase
            .from('chat_sessions')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[DELETE /api/chat/sessions/[id]] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
