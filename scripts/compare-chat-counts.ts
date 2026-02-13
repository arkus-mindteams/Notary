
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function compareCounts() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) return

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Comparing Chat Counts for Carlos...')

    // 1. Count unique sessions in activity_logs (The "Stats" view)
    // We filter by category='conversation' or check session_id presence
    // 1. Get User ID first
    const { data: user } = await supabase.from('usuarios').select('id, auth_user_id').eq('email', 'cvega@arkusnexus.com').single()

    if (!user) {
        console.log('User not found')
        return
    }

    // 2. Count unique sessions in activity_logs (The "Stats" view)
    const { data: logData, error: logError } = await supabase
        .from('activity_logs')
        .select('session_id')
        .eq('user_id', user.auth_user_id) // uses Auth ID
        .not('session_id', 'is', null)

    if (logError) {
        console.error('Log Error:', logError)
        return
    }

    const logSessions = new Set(logData.map(d => d.session_id))
    console.log(`[Activity Logs] Unique Sessions for cvega@arkusnexus.com: ${logSessions.size}`)

    // 3. Count total sessions in chat_sessions (The "History" view)
    // Assuming chat_sessions.user_id references auth.users
    const { count: sessionCount, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.auth_user_id)

    if (sessionError) {
        console.error('Session Error:', sessionError)
        return
    }

    console.log(`[Chat Sessions] Total Sessions for cvega@arkusnexus.com: ${sessionCount}`)

    if (logSessions.size !== sessionCount) {
        console.log('\nDiscrepancy detected!')
        console.log('Reason: The Stats Dashboard counts activity logs (new system).')
        console.log('The History sidebar counts chat_sessions (storage).')
        console.log('Older sessions created before the migration or not fully migrated might exist in storage but not in stats logs.')
    } else {
        console.log('\nCounts match perfectly.')
    }
}

compareCounts()
