import { NextResponse } from 'next/server'
import { StatsService } from '@/lib/stats-service'

export async function GET() {
    try {
        const stats = StatsService.getStats()
        return NextResponse.json(stats)
    } catch (error) {
        return NextResponse.json({ error: 'failed_to_get_stats' }, { status: 500 })
    }
}
