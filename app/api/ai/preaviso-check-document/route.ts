/**
 * Comprueba si uno o más archivos ya tienen extracción guardada (global, cualquier conversación).
 * Usado para mostrar el diálogo "usar información existente" vs "volver a procesar".
 */

import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentoService } from '@/lib/services/documento-service'

export type CheckDocumentResult = {
  fileName: string
  fileHash: string
  alreadyProcessed: boolean
  extractedData?: unknown
}

export async function POST(req: Request) {
  try {
    await getCurrentUserFromRequest(req)

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const singleFile = formData.get('file') as File | null
    const list: File[] = singleFile ? [singleFile] : files.filter(Boolean)

    if (list.length === 0) {
      return NextResponse.json(
        { error: 'bad_request', message: 'file or files is required' },
        { status: 400 }
      )
    }

    const results: CheckDocumentResult[] = []

    for (const file of list) {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const fileHash = createHash('md5').update(buffer).digest('hex')
      const extractedData = await DocumentoService.findExtractionData(fileHash)

      results.push({
        fileName: file.name,
        fileHash,
        alreadyProcessed: !!extractedData,
        ...(extractedData ? { extractedData } : {})
      })
    }

    return NextResponse.json({ results })
  } catch (error: unknown) {
    console.error('[preaviso-check-document] Error:', error)
    const message = error instanceof Error ? error.message : 'Error comprobando documento'
    return NextResponse.json(
      { error: 'internal_error', message },
      { status: 500 }
    )
  }
}
