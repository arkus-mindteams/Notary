
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function listUsers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) return

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Listing public.usuarios...')

    const { data, error } = await supabase
        .from('usuarios')
        .select('id, auth_user_id, email, nombre, apellido_paterno, rol')
        .limit(10)

    if (error) {
        console.error('Error:', error)
    } else {
        console.table(data)
    }
}

listUsers()
