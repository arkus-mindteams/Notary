import { createHash } from 'crypto'
import { upstashCommand, upstashPipeline } from '@/lib/upstash-redis-rest'

export type OcrCacheEntry = {
  tramiteId: string
  docKey: string
  docName?: string | null
  docSubtype?: string | null
  docRole?: string | null
  pageNumber: number
  text: string
  createdAt: number
}

function ttlSeconds(): number {
  const raw = process.env.PREAVISO_OCR_CACHE_TTL_SECONDS
  const n = raw ? Number(raw) : 7200 // 2 horas default
  if (!Number.isFinite(n) || n <= 0) return 7200
  return Math.min(Math.max(300, Math.floor(n)), 24 * 3600) // 5min..24h (defensivo)
}

function makeDocKey(docName: string, docSubtype?: string | null, docRole?: string | null): string {
  const base = `${docName || ''}|${docSubtype || ''}|${docRole || ''}`
  return createHash('sha1').update(base).digest('hex').slice(0, 16)
}

function makeRedisKey(tramiteId: string, docKey: string, pageNumber: number): string {
  return `preaviso:ocr:${tramiteId}:${docKey}:p:${pageNumber}`
}

export class PreavisoOcrCacheService {
  static async upsertPage(args: {
    tramiteId: string
    docName: string
    docSubtype?: string | null
    docRole?: string | null
    pageNumber: number
    text: string
  }): Promise<{ ok: boolean; error?: string; docKey?: string }> {
    const docKey = makeDocKey(args.docName, args.docSubtype, args.docRole)
    const key = makeRedisKey(args.tramiteId, docKey, args.pageNumber)
    const entry: OcrCacheEntry = {
      tramiteId: args.tramiteId,
      docKey,
      docName: args.docName || null,
      docSubtype: args.docSubtype || null,
      docRole: args.docRole || null,
      pageNumber: args.pageNumber,
      text: args.text,
      createdAt: Date.now(),
    }
    const value = JSON.stringify(entry)
    const ttl = ttlSeconds()
    const res = await upstashCommand(['SET', key, value, 'EX', ttl])
    if (res.error) return { ok: false, error: res.error }
    return { ok: true, docKey }
  }

  static async listKeysForTramite(tramiteId: string, maxKeys: number = 200): Promise<string[]> {
    const prefix = `preaviso:ocr:${tramiteId}:`
    let cursor = '0'
    const out: string[] = []
    // SCAN cursor MATCH prefix* COUNT 200
    for (let i = 0; i < 6 && out.length < maxKeys; i++) {
      const res = await upstashCommand<any>(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 200])
      if (res.error || !Array.isArray(res.result)) break
      cursor = String(res.result[0] ?? '0')
      const keys = Array.isArray(res.result[1]) ? res.result[1].map(String) : []
      for (const k of keys) {
        out.push(k)
        if (out.length >= maxKeys) break
      }
      if (cursor === '0') break
    }
    return out
  }

  static async getMany(keys: string[]): Promise<Array<OcrCacheEntry | null>> {
    if (!keys.length) return []
    // Pipeline GET key1 ... para evitar múltiples roundtrips
    const cmds = keys.map(k => ['GET', k])
    const res = await upstashPipeline<any>(cmds)
    if (res.error || !Array.isArray(res.result)) return keys.map(() => null)
    return res.result.map((r: any) => {
      // Upstash puede devolver { result: "..." } por comando
      const val = r?.result ?? r
      if (!val) return null
      try {
        return JSON.parse(String(val)) as OcrCacheEntry
      } catch {
        return null
      }
    })
  }
}

