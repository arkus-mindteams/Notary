type DiffEntry = {
  path: string
  before?: any
  after?: any
}

export type ContextDiff = {
  added: string[]
  removed: string[]
  changed: DiffEntry[]
}

const isPrimitive = (v: any): boolean =>
  v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

const summarizeValue = (v: any) => {
  if (isPrimitive(v)) return v
  if (Array.isArray(v)) return { type: 'array', length: v.length }
  if (typeof v === 'object') return { type: 'object', keys: Object.keys(v || {}).length }
  return { type: typeof v }
}

export function diffContext(
  before: any,
  after: any,
  maxDepth: number = 4,
  maxChanges: number = 80
): ContextDiff {
  const added: string[] = []
  const removed: string[] = []
  const changed: DiffEntry[] = []

  const walk = (a: any, b: any, path: string, depth: number) => {
    if (changed.length >= maxChanges) return

    if (a === undefined && b !== undefined) {
      added.push(path)
      return
    }
    if (a !== undefined && b === undefined) {
      removed.push(path)
      return
    }

    if (isPrimitive(a) || isPrimitive(b)) {
      if (a !== b) {
        changed.push({ path, before: a, after: b })
      }
      return
    }

    if (depth >= maxDepth) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changed.push({ path, before: summarizeValue(a), after: summarizeValue(b) })
      }
      return
    }

    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        changed.push({ path, before: summarizeValue(a), after: summarizeValue(b) })
        return
      }
      for (let i = 0; i < a.length; i += 1) {
        walk(a[i], b[i], `${path}[${i}]`, depth + 1)
        if (changed.length >= maxChanges) break
      }
      return
    }

    const keys = new Set<string>([
      ...Object.keys(a || {}),
      ...Object.keys(b || {})
    ])
    for (const key of keys) {
      walk(a?.[key], b?.[key], path ? `${path}.${key}` : key, depth + 1)
      if (changed.length >= maxChanges) break
    }
  }

  walk(before, after, '', 0)

  return { added, removed, changed }
}
