
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function executeCleanup() {
    console.log('🚀 Starting Robust Database Cleanup...')

    const tables = [
        'usage_stats',
        'agent_usage_logs',
        'activity_logs',
        'chat_messages',
        'chat_session_documents',
        'preaviso_conversation_logs',
        'processed_units_log',
        'documento_text_chunks',
        'document_extractions',
        'tramite_documentos',
        'compradores',
        'chat_sessions',
        'documentos',
        'tramites'
    ]

    for (const table of tables) {
        process.stdout.write(`  Wiping ${table}... `)
        try {
            // Check if table exists first by doing a count
            const { error: checkError } = await supabase.from(table).select('count', { count: 'exact', head: true })
            if (checkError) {
                if (checkError.code === '42P01') {
                    console.log('Skipped (not found)')
                    continue
                }
                throw checkError
            }

            const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000' as any)
            if (error) {
                // If ID is not the PK, try with a filter that always matches (like created_at < now)
                const { error: error2 } = await supabase.from(table).delete().lt('created_at', new Date().toISOString())
                if (error2) throw error2
            }
            console.log('Done ✅')
        } catch (err: any) {
            console.log(`Error ❌: ${err.message}`)
        }
    }

    console.log('\n✨ Database cleanup complete. Core data (users, notaria) preserved.')
}

executeCleanup()
