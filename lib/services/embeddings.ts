export class EmbeddingsService {
    private static readonly OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
    private static readonly MODEL = 'text-embedding-3-small'
    private static readonly DIMENSIONS = 1536
    private static readonly DEFAULT_TIMEOUT_MS = 8000
    private static readonly inflight = new Map<string, Promise<number[] | null>>()

    /**
     * Generate an embedding vector for the given text using OpenAI.
     * Returns an array of 1536 numbers or null when unavailable.
     */
    static async generateEmbedding(text: string): Promise<number[] | null> {
        try {
            if (!text || !text.trim()) return null

            const cleanText = text.trim().replace(/\s+/g, ' ')
            const inflightKey = `${EmbeddingsService.MODEL}:${cleanText}`
            const running = EmbeddingsService.inflight.get(inflightKey)
            if (running) {
                return running
            }

            const task = EmbeddingsService.generateEmbeddingInternal(cleanText)
            EmbeddingsService.inflight.set(inflightKey, task)
            try {
                return await task
            } finally {
                EmbeddingsService.inflight.delete(inflightKey)
            }
        } catch (error) {
            console.warn('[EmbeddingsService] Exception:', String((error as any)?.message || error || 'unknown_error'))
            return null
        }
    }

    private static async generateEmbeddingInternal(cleanText: string): Promise<number[] | null> {
        try {
            const apiKey = process.env.OPENAI_API_KEY
            if (!apiKey) {
                console.warn('[EmbeddingsService] OPENAI_API_KEY missing')
                return null
            }

            const timeoutMs = Math.max(
                1000,
                Number(process.env.OPENAI_EMBEDDINGS_TIMEOUT_MS || EmbeddingsService.DEFAULT_TIMEOUT_MS)
            )
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), timeoutMs)

            const response = await fetch(EmbeddingsService.OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    input: cleanText,
                    model: EmbeddingsService.MODEL,
                    encoding_format: 'float'
                }),
                signal: controller.signal,
            }).finally(() => clearTimeout(timer))

            if (!response.ok) {
                const errorBody = (await response.text().catch(() => '')).slice(0, 240)
                console.warn(`[EmbeddingsService] API non-ok: ${response.status}`, errorBody)
                return null
            }

            const data = await response.json()
            if (data?.data?.[0]?.embedding) {
                return data.data[0].embedding
            }

            return null
        } catch (error) {
            const message = (error as any)?.name === 'AbortError'
                ? 'timeout'
                : String((error as any)?.message || error || 'unknown_error')
            console.warn('[EmbeddingsService] Exception:', message)
            return null
        }
    }

    /**
     * Cosine similarity utility.
     */
    static cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0
        let dotProduct = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
    }

    static getModelName(): string {
        return this.MODEL
    }

    static getModelDimensions(): number {
        return this.DIMENSIONS
    }
}
