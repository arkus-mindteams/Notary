import { createClient } from '@supabase/supabase-js'

// Pricing configuration (USD per 1M tokens)
// As of Oct 2023 / current GPT-4o pricing reference
const PRICING = {
    'gpt-4o': {
        input: 5.00,  // $5.00 / 1M input tokens
        output: 15.00 // $15.00 / 1M output tokens
    },
    'gpt-4o-mini': {
        input: 0.150, // $0.15 / 1M input tokens
        output: 0.600 // $0.60 / 1M output tokens
    },
    // Fallback
    'default': {
        input: 5.00,
        output: 15.00
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
