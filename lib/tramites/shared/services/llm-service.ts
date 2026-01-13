/**
 * Servicio LLM compartido
 * Maneja todas las llamadas a OpenAI
 */

export class LLMService {
  private apiKey: string
  private model: string

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || ''
    this.model = process.env.OPENAI_MODEL || 'gpt-4o'
  }

  /**
   * Llama a OpenAI API
   */
  async call(prompt: string, systemPrompts?: string[]): Promise<string> {
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
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }
}
