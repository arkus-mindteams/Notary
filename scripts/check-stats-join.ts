
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env vars from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function testJoin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing env vars')
        return
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Testing Join activity_logs -> usuarios...')

    const { data, error } = await supabase
        .from('activity_logs')
        .select(`
      id,
      user_id,
      estimated_cost,
      tokens_total,
      created_at,
      usuarios:user_id(email, nombre)
    `)
        .limit(5)

    if (error) {
        console.error('Error executing query:', error)
    } else {
        console.log('Query successful. Results:')
        console.log(JSON.stringify(data, null, 2))
    }
}

testJoin()
