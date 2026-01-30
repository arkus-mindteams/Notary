
import { EmbeddingsService } from '../lib/services/embeddings'
import * as dotenv from 'dotenv'
import path from 'path'

// Cargar .env manual porque al correr scripts tsc/node directo no carga next.js env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function test() {
    console.log('🧪 Testing Embeddings Service...')

    if (!process.env.OPENAI_API_KEY) {
        console.error('❌ OPENAI_API_KEY not found in env')
        process.exit(1)
    }

    const text = "El comprador Juan Pérez adquiere el lote 5 de la manzana 3"
    console.log(`Input: "${text}"`)

    const start = Date.now()
    const vector = await EmbeddingsService.generateEmbedding(text)
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
