import { createServerClient } from '@/lib/supabase'
import type { DocumentIntakeBatchResult, DocumentIntakeItem } from '@/lib/ai/intake/document-intake.types'

function splitIntoChunks(text: string, maxChars: number = 1100, overlap: number = 150): string[] {
  const clean = String(text || '').trim()
  if (!clean) return []
  const out: string[] = []
  let cursor = 0
  while (cursor < clean.length) {
    const end = Math.min(clean.length, cursor + maxChars)
    out.push(clean.slice(cursor, end))
    if (end >= clean.length) break
    cursor = Math.max(0, end - overlap)
  }
  return out
}

export class DocumentIntakePersistenceService {
  static async persistBatch(args: {
    result: DocumentIntakeBatchResult
    storeChunks: boolean
    tramiteId?: string | null
    sessionId?: string | null
  }): Promise<void> {
    const supabase = createServerClient()
    const now = new Date().toISOString()

    for (const doc of args.result.documents) {
      await this.persistDocumentResult({
        supabase,
        doc,
        traceId: args.result.traceId,
        rules: args.result.rules,
        tramiteId: args.tramiteId || null,
        sessionId: args.sessionId || null,
        now,
      })
      if (args.storeChunks) {
        await this.persistDocumentChunks({
          supabase,
          doc,
          traceId: args.result.traceId,
          tramiteId: args.tramiteId || null,
          sessionId: args.sessionId || null,
        })
      }
    }
  }

  private static async persistDocumentResult(args: {
    supabase: ReturnType<typeof createServerClient>
    doc: DocumentIntakeItem
    traceId: string
    rules: DocumentIntakeBatchResult['rules']
    tramiteId: string | null
    sessionId: string | null
    now: string
  }): Promise<void> {
    const { error } = await args.supabase
      .from('document_intake_results')
      .upsert(
        {
          trace_id: args.traceId,
          documento_id: args.doc.documentId,
          tramite_id: args.tramiteId,
          session_id: args.sessionId,
          filename: args.doc.filename,
          mime_type: null,
          detected_type: args.doc.detectedType,
          confidence: args.doc.confidence,
          issues: args.doc.issues,
          summary: args.doc.summary,
          key_fields: args.doc.keyFields,
          pages: args.doc.pages,
          facts: args.doc.facts,
          rules: args.rules,
          raw: args.doc.raw || null,
          created_at: args.now,
          updated_at: args.now,
        },
        { onConflict: 'trace_id,documento_id' }
      )
    if (error) {
      throw new Error(`document_intake_results upsert failed: ${error.message}`)
    }
  }

  private static async persistDocumentChunks(args: {
    supabase: ReturnType<typeof createServerClient>
    doc: DocumentIntakeItem
    traceId: string
    tramiteId: string | null
    sessionId: string | null
  }): Promise<void> {
    const rows: any[] = []
    for (const page of args.doc.pages) {
      const chunks = splitIntoChunks(page.text)
      for (let i = 0; i < chunks.length; i++) {
        rows.push({
          trace_id: args.traceId,
          documento_id: args.doc.documentId,
          tramite_id: args.tramiteId,
          session_id: args.sessionId,
          page_number: page.pageNumber,
          chunk_index: i,
          text: chunks[i],
          metadata: {
            source: 'document_intake_batch',
            detected_type: args.doc.detectedType,
          },
        })
      }
    }
    if (rows.length === 0) return
    const { error } = await args.supabase
      .from('document_intake_chunks')
      .upsert(rows, { onConflict: 'trace_id,documento_id,page_number,chunk_index' })
    if (error) {
      throw new Error(`document_intake_chunks upsert failed: ${error.message}`)
    }
  }
}

