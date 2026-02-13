export const DEFAULT_CHUNKING_VERSION = 'v1_text_char_3600_overlap_12'

export type DocumentChunk = {
  chunk_index: number
  content: string
  token_count: number
  metadata: Record<string, any>
}

type ChunkerInput = {
  rawText: string
  docMeta?: Record<string, any>
  chunkingVersion?: string
  targetTokens?: number
  minTokens?: number
  maxTokens?: number
  overlapRatio?: number
}

const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN))
}

function normalizeText(input: string): string {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function findChunkEnd(text: string, start: number, minEnd: number, targetEnd: number, maxEnd: number): number {
  const safeMin = Math.max(start + 1, minEnd)
  const safeMax = Math.min(text.length, Math.max(safeMin, maxEnd))
  const safeTarget = Math.min(safeMax, Math.max(safeMin, targetEnd))

  if (safeTarget >= text.length) return text.length

  const boundaryRegex = /[\n.!?;:]/g
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY

  boundaryRegex.lastIndex = safeMin
  while (true) {
    const match = boundaryRegex.exec(text)
    if (!match) break
    const idx = match.index + 1
    if (idx > safeMax) break
    const distance = Math.abs(idx - safeTarget)
    if (distance < bestDistance) {
      best = idx
      bestDistance = distance
    }
  }

  if (best !== -1) return best

  const whitespaceForward = text.slice(safeTarget, safeMax).search(/\s/)
  if (whitespaceForward >= 0) {
    return safeTarget + whitespaceForward + 1
  }

  const backwardSlice = text.slice(safeMin, safeTarget)
  const lastWhitespace = backwardSlice.lastIndexOf(' ')
  if (lastWhitespace >= 0) {
    return safeMin + lastWhitespace + 1
  }

  return safeTarget
}

export class DocumentChunker {
  static chunk(input: ChunkerInput): DocumentChunk[] {
    const normalized = normalizeText(input.rawText)
    if (!normalized) return []

    const chunkingVersion = input.chunkingVersion || DEFAULT_CHUNKING_VERSION
    const targetTokens = input.targetTokens ?? 900
    const minTokens = input.minTokens ?? 600
    const maxTokens = input.maxTokens ?? 1200
    const overlapRatio = input.overlapRatio ?? 0.12

    const targetChars = targetTokens * CHARS_PER_TOKEN
    const minChars = minTokens * CHARS_PER_TOKEN
    const maxChars = maxTokens * CHARS_PER_TOKEN
    const overlapChars = Math.max(1, Math.floor(targetChars * overlapRatio))

    const chunks: DocumentChunk[] = []
    let start = 0

    while (start < normalized.length) {
      const minEnd = Math.min(normalized.length, start + minChars)
      const targetEnd = Math.min(normalized.length, start + targetChars)
      const maxEnd = Math.min(normalized.length, start + maxChars)
      const end = findChunkEnd(normalized, start, minEnd, targetEnd, maxEnd)

      const rawChunk = normalized.slice(start, end).trim()
      if (!rawChunk) {
        start = Math.max(start + 1, end)
        continue
      }

      const chunkIndex = chunks.length
      chunks.push({
        chunk_index: chunkIndex,
        content: rawChunk,
        token_count: estimateTokens(rawChunk),
        metadata: {
          chunking_version: chunkingVersion,
          char_start: start,
          char_end: end,
          ...(input.docMeta || {}),
        },
      })

      if (end >= normalized.length) break
      const nextStart = Math.max(start + 1, end - overlapChars)
      start = nextStart
    }

    return chunks
  }
}

