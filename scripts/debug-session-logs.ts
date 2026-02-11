import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSessionLogs(sessionId: string) {
    console.log(`Checking logs for session: ${sessionId}`)
    const { data, error } = await supabase
        .from('activity_logs')
        .select('*, usuarios:user_id(email, nombre)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error(error)
        return
    }

    if (!data || data.length === 0) {
        console.log('No logs found for this session.')
        return
    }

    console.log('Index | Type | Category | Tokens (In/Out/Total) | Cost | Event Info')
    console.log('-'.repeat(100))
    data.forEach((log: any, idx: number) => {
        const tokens = `${log.tokens_input || 0}/${log.tokens_output || 0}/${log.tokens_total || 0}`
        const cost = log.estimated_cost || 0
        const info = log.event_type === 'document_upload'
            ? `File: ${log.data?.file_name}`
            : log.event_type
        console.log(`${idx + 1} | ${log.event_type} | ${log.category} | ${tokens} | ${cost} | ${info}`)
    })

    // Also show full data for the last few entries
    console.log('\nLast 2 entries (full data):')
    console.log(JSON.stringify(data.slice(-2), null, 2))
}

const targetSession = process.argv[2] || '0f859aad-2021-4362-9255-71ca9d79bf51'
checkSessionLogs(targetSession)
