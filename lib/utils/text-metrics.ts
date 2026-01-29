/**
 * Calculates the Levenshtein distance between two strings.
 * Normalized to return a similarity score between 0 and 1.
 */
export function calculateSimilarity(original: string, modified: string): {
    similarity: number
    distance: number
    charsAdded: number
    charsRemoved: number
} {
    const len1 = original.length
    const len2 = modified.length

    // Optimizaciones triviales
    if (original === modified) return { similarity: 1, distance: 0, charsAdded: 0, charsRemoved: 0 }
    if (len1 === 0) return { similarity: 0, distance: len2, charsAdded: len2, charsRemoved: 0 }
    if (len2 === 0) return { similarity: 0, distance: len1, charsAdded: 0, charsRemoved: len1 }

    // Matriz para Levenshtein
    const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null))

    for (let i = 0; i <= len1; i += 1) {
        matrix[0][i] = i
    }

    for (let j = 0; j <= len2; j += 1) {
        matrix[j][0] = j
    }

    for (let j = 1; j <= len2; j += 1) {
        for (let i = 1; i <= len1; i += 1) {
            const indicator = original[i - 1] === modified[j - 1] ? 0 : 1
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
            )
        }
    }

    const distance = matrix[len2][len1]
    const maxLength = Math.max(len1, len2)
    const similarity = 1 - distance / maxLength

    // Aproximación simple para added/removed basada en longitud
    // Nota: Levenshtein exacto de adiciones/borrados requiere backtracing, 
    // pero para stats generales esto es suficiente.
    const charsAdded = Math.max(0, len2 - len1)
    const charsRemoved = Math.max(0, len1 - len2)

    return {
        similarity,
        distance,
        charsAdded,
        charsRemoved
    }
}
