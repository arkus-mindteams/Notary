
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'

console.log('CWD:', process.cwd())
const dataDir = join(process.cwd(), 'data')
console.log('Target Dir:', dataDir)

try {
    if (!existsSync(dataDir)) {
        console.log('Creating dir...')
        mkdirSync(dataDir, { recursive: true })
    }

    const testFile = join(dataDir, 'test-write.txt')
    writeFileSync(testFile, 'hello world ' + new Date().toISOString())
    console.log('File written successfully to:', testFile)

    const content = readFileSync(testFile, 'utf-8')
    console.log('Read back:', content)
} catch (e) {
    console.error('Error:', e)
}
