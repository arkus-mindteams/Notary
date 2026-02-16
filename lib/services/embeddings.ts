
export class EmbeddingsService {
    private static readonly OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
    private static readonly MODEL = 'text-embedding-3-small'
    private static readonly DIMENSIONS = 1536

    /**
     * Genera un embedding vectorial para el texto dado usando OpenAI.
     * Retorna un array de 1536 números.
     */
    static async generateEmbedding(text: string): Promise<number[] | null> {
        try {
            if (!text || !text.trim()) return null

            // Limpieza básica del texto para optimizar tokens y relevancia
            const cleanText = text.trim().replace(/\s+/g, ' ')

            const apiKey = process.env.OPENAI_API_KEY
            if (!apiKey) {
                console.error('[EmbeddingsService] OPENAI_API_KEY missing')
                return null
            }

            const response = await fetch(this.OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    input: cleanText,
                    model: this.MODEL,
                    encoding_format: 'float'
                })
            })

            if (!response.ok) {
                const error = await response.text()
                console.error(`[EmbeddingsService] API Error: ${response.status}`, error)
                return null
            }

            const data = await response.json()

            if (data?.data?.[0]?.embedding) {
                return data.data[0].embedding
            }

            return null

        } catch (error) {
            console.error('[EmbeddingsService] Exception:', error)
            return null
        }
    }

    /**
     * Calcula la similitud coseno entre dos vectores (utilidad local).
     * Nota: En producción, esto normalmente lo hace la BD (pgvector).
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
