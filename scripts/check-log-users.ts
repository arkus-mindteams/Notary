
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function checkUserCounts() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) return

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Checking distinct users in activity_logs...')

    // Get distinct user_ids (simulated via group by or just fetching all and traversing)
    // PostgREST doesn't support SELECT DISTINCT easily without RPC, so we fetch only user_id
    const { data, error } = await supabase
        .from('activity_logs')
        .select('user_id')

    if (error) {
        console.error(error)
        return
    }

    const userIds = new Set(data.map(d => d.user_id))
    console.log(`Total rows: ${data.length}`)
    console.log(`Unique Users: ${userIds.size}`)
    console.log('User IDs found:', Array.from(userIds))
}

checkUserCounts()
