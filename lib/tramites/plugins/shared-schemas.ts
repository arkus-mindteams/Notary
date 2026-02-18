import { z } from 'zod'

export const proposedUpdateSchema = z
  .object({
    op: z.enum(['set', 'unset', 'append', 'remove']).default('set'),
    path: z.string().trim().min(1),
    value: z.unknown().optional(),
    reason: z.string().trim().optional(),
  })
  .strict()

export const proposedUpdatesSchema = z.array(proposedUpdateSchema)

export function getPathValue(source: unknown, path: string): unknown {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return undefined

  const tokens = normalizedPath
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((token) => token.trim())
    .filter(Boolean)

  let current: any = source
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined
    current = current[token]
  }

  return current
}

export function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}
