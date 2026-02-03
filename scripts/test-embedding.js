
// .env loaded via node --env-file=.env

// Mock de la clase EmbeddingsService (ya que no podemos importar TS directo fácilmente sin build)
// Para el test rápido, replicamos la lógica de fetch aquí, verificando que la API Key y endpoint funcionen.

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings'
const MODEL = 'text-embedding-3-small'

async function generateEmbedding(text) {
    try {
        if (!text || !text.trim()) return null

        const cleanText = text.trim().replace(/\s+/g, ' ')
        const apiKey = process.env.OPENAI_API_KEY

        if (!apiKey) {
            console.error('[Test] OPENAI_API_KEY missing')
            return null
        }

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                input: cleanText,
                model: MODEL,
                encoding_format: 'float'
            })
        })

        if (!response.ok) {
            const error = await response.text()
            console.error(`[Test] API Error: ${response.status}`, error)
            return null
        }

        const data = await response.json()
        if (data?.data?.[0]?.embedding) {
            return data.data[0].embedding
        }
        return null
    } catch (error) {
        console.error('[Test] Exception:', error)
        return null
    }
}

async function test() {
    console.log('🧪 Testing Embeddings API Direct Connection...')

    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY not found in env')
        process.exit(1)
    }

    const text = "El comprador Juan Pérez adquiere el lote 5 de la manzana 3"
    console.log(`Input: "${text}"`)

    const start = Date.now()
    const vector = await generateEmbedding(text)
    const duration = Date.now() - start

    if (!vector) {
        console.error('❌ Failed to generate embedding')
        process.exit(1)
    }

    console.log('✅ Embedding generated successfully')
    console.log(`- Dimensions: ${vector.length}`)
    console.log(`- Time: ${duration}ms`)
    console.log(`- First 5 dimensions: ${JSON.stringify(vector.slice(0, 5))}`)

    // Validation
    if (vector.length !== 1536) {
        console.error(`❌ Unexpected dimension size: ${vector.length} (Expected 1536)`)
        process.exit(1)
    }

    console.log('✨ Test Passed!')
}

test()
