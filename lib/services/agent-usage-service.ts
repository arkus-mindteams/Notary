import { createClient } from '@supabase/supabase-js'

// Pricing configuration (USD per 1M tokens)
// Updated: January 2026 - OpenAI official pricing
const PRICING = {
    'gpt-4o': {
        input: 2.50,   // $2.50 / 1M input tokens (was $5.00)
        output: 10.00, // $10.00 / 1M output tokens (was $15.00)
        cached: 1.25   // $1.25 / 1M cached input tokens (50% off)
    },
    'gpt-4o-mini': {
        input: 0.150,  // $0.15 / 1M input tokens
        output: 0.600, // $0.60 / 1M output tokens
        cached: 0.075  // $0.075 / 1M cached input tokens
    },
    'o1': {
        input: 15.00,  // $15.00 / 1M input tokens
        output: 60.00  // $60.00 / 1M output tokens
    },
    'o1-mini': {
        input: 1.10,   // $1.10 / 1M input tokens
        output: 4.40   // $4.40 / 1M output tokens
    },
    'o3': {
        input: 2.00,   // $2.00 / 1M input tokens (80% reduction from original)
        output: 8.00,  // $8.00 / 1M output tokens
        cached: 0.50   // $0.50 / 1M cached input tokens
    },
    'o3-mini': {
        input: 1.10,   // $1.10 / 1M input tokens (same as o1-mini)
        output: 4.40   // $4.40 / 1M output tokens
    },
    // Fallback for unknown models
    'default': {
        input: 2.50,
        output: 10.00
    }
}

export type AgentActionType = 'generate_question' | 'extract_data' | 'interpret_intent' | 'general_chat'

interface LogUsageParams {
    userId?: string
    sessionId?: string
    tramiteId?: string
    model: string
    tokensInput: number
    tokensOutput: number
    actionType: AgentActionType
    category?: string // 'preaviso', 'deslinde', 'general'
    metadata?: any
}

export class AgentUsageService {
    private supabase

    constructor() {
        this.supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
    }

    /**
     * Calculates estimated cost in USD
     */
    calculateCost(model: string, input: number, output: number): number {
        const pricing = PRICING[model as keyof typeof PRICING] || PRICING['default']

        const inputCost = (input / 1_000_000) * pricing.input
        const outputCost = (output / 1_000_000) * pricing.output

        return Number((inputCost + outputCost).toFixed(6))
    }

    /**
     * Logs usage to the database (unified activity_logs table)
     */
    async logUsage(params: LogUsageParams) {
        try {
            const cost = this.calculateCost(params.model, params.tokensInput, params.tokensOutput)
            const totalTokens = params.tokensInput + params.tokensOutput

            const { error } = await this.supabase
                .from('activity_logs')
                .insert({
                    user_id: params.userId || null,
                    session_id: params.sessionId || null,
                    tramite_id: params.tramiteId || null,
                    category: 'ai_usage',
                    event_type: params.actionType,
                    tokens_input: params.tokensInput,
                    tokens_output: params.tokensOutput,
                    tokens_total: totalTokens,
                    estimated_cost: cost,
                    data: {
                        model: params.model,
                        category: params.category || 'uncategorized',
                        ...params.metadata
                    }
                })

            if (error) {
                console.error('[AgentUsageService] Error logging usage to activity_logs:', error)
            }
        } catch (err) {
            console.error('[AgentUsageService] Unexpected error:', err)
        }
    }

    /**
     * Get aggregated stats (admin only)
     */
    async getStats(timeRange: 'day' | 'month' | 'all' = 'month') {
        // This would be implemented for the dashboard
        // For now, placeholder
        return {}
    }
}
