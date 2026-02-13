/**
 * Servicio LLM compartido
 * Maneja todas las llamadas a OpenAI
 */
import { AgentUsageService } from '@/lib/services/agent-usage-service'

/** Formato OpenAI para un tool (function) */
export type OpenAIChatTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties?: Record<string, any>
      required?: string[]
    }
  }
}

/** Resultado de una tool call parseada */
export type ParsedToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Resultado de callWithTools */
export type CallWithToolsResult = {
  content: string
  tool_calls: ParsedToolCall[]
}

export class LLMService {
  private apiKey: string
  private model: string
  private usageService: AgentUsageService

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_MODEL || 'gpt-4o'
    this.usageService = new AgentUsageService()
  }

  /**
   * Llama a OpenAI API
   */
  async call(
    prompt: string,
    systemPrompts?: string[],
    userId?: string,
    actionType: string = 'general_chat',
    category: string = 'general',
    sessionId?: string,
    tramiteId?: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const messages: any[] = []

    // Agregar system prompts si existen
    if (systemPrompts) {
      for (const systemPrompt of systemPrompts) {
        messages.push({
          role: 'system',
          content: systemPrompt
        })
      }
    }

    // Agregar prompt del usuario
    messages.push({
      role: 'user',
      content: prompt
    })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...((this.model.startsWith('o1') || this.model.startsWith('o3') || this.model.includes('gpt-5'))
          ? {}
          : { temperature: 0.3 })
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || ''

    // Log usage asynchronously (don't block response)
    this.usageService.logUsage({
      userId,
      sessionId,
      tramiteId,
      model: this.model,
      tokensInput: data.usage.prompt_tokens,
      tokensOutput: data.usage.completion_tokens,
      actionType: actionType as any,
      category
    }).catch(err => console.error('Failed to log usage:', err))

    return content
  }

  /**
   * Llama a OpenAI API con tools (function calling).
   * Devuelve el contenido de texto y las tool_calls parseadas (arguments como objeto).
   */
  async callWithTools(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools: OpenAIChatTool[],
    options?: {
      tool_choice?: 'auto' | 'none'
      userId?: string
      actionType?: string
      category?: string
      sessionId?: string
      tramiteId?: string
    }
  ): Promise<CallWithToolsResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      tools,
      tool_choice: options?.tool_choice ?? 'auto'
    }

    if (!(this.model.startsWith('o1') || this.model.startsWith('o3') || this.model.includes('gpt-5'))) {
      body.temperature = 0.3
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const msg = data.choices[0]?.message ?? {}
    const content = msg.content ?? ''

    const tool_calls: ParsedToolCall[] = []
    const rawCalls = msg.tool_calls
    if (Array.isArray(rawCalls)) {
      for (const tc of rawCalls) {
        const name = tc.function?.name
        const argsStr = tc.function?.arguments
        if (!name) continue
        let args: Record<string, unknown> = {}
        if (typeof argsStr === 'string' && argsStr.trim()) {
          try {
            args = JSON.parse(argsStr) as Record<string, unknown>
          } catch {
            args = {}
          }
        }
        tool_calls.push({
          id: tc.id ?? '',
          name,
          arguments: args
        })
      }
    }

    this.usageService.logUsage({
      userId: options?.userId,
      sessionId: options?.sessionId,
      tramiteId: options?.tramiteId,
      model: this.model,
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
      actionType: (options?.actionType ?? 'interpret_intent') as any,
      category: options?.category ?? 'general'
    }).catch(err => console.error('Failed to log usage:', err))

    return { content, tool_calls }
  }
}
