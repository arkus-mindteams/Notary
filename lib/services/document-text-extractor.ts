import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract'
import { S3Service } from '@/lib/services/s3-service'

type DocumentoRecord = {
  id: string
  nombre: string
  mime_type: string
  s3_key?: string | null
  metadata?: Record<string, any> | null
}

export type TextExtractionResult = {
  text: string
  source: 'metadata' | 'pdf_text' | 'docx_text' | 'ocr_fallback' | 'none'
  needs_ocr: boolean
  reason?: string
  debug?: {
    text_length: number
    alnum_ratio: number
    mime_type: string
  }
}

type OcrFallbackResult = {
  text: string
  source: string
} | null

type ExtractorDeps = {
  downloadDocumentBytes: (documento: DocumentoRecord) => Promise<Uint8Array | null>
  ocrFallback: (documento: DocumentoRecord, bytes: Uint8Array) => Promise<OcrFallbackResult>
  ocrFallbackFromFile: (file: File, bytes: Uint8Array) => Promise<OcrFallbackResult>
}

const textractClient = new TextractClient({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
})

const defaultDeps: ExtractorDeps = {
  downloadDocumentBytes: async (documento) => {
    if (!documento.s3_key) return null
    const signedUrl = await S3Service.getSignedUrl(documento.s3_key, 600)
    const response = await fetch(signedUrl)
    if (!response.ok) {
      throw new Error(`document_download_failed:${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  },
  ocrFallback: async (documento, bytes) => {
    if (!documento.mime_type?.startsWith('image/')) {
      return null
    }
    const command = new DetectDocumentTextCommand({ Document: { Bytes: bytes } })
    const response = await textractClient.send(command)
    const lines = (response.Blocks || [])
      .filter((b) => b.BlockType === 'LINE' && b.Text)
      .map((b) => String(b.Text))
    if (lines.length === 0) return null
    return {
      text: lines.join('\n'),
      source: 'textract_detect_document_text',
    }
  },
  ocrFallbackFromFile: async (file, bytes) => {
    if (!String(file.type || '').startsWith('image/')) {
      return null
    }
    const command = new DetectDocumentTextCommand({ Document: { Bytes: bytes } })
    const response = await textractClient.send(command)
    const lines = (response.Blocks || [])
      .filter((b) => b.BlockType === 'LINE' && b.Text)
      .map((b) => String(b.Text))
    if (lines.length === 0) return null
    return {
      text: lines.join('\n'),
      source: 'textract_detect_document_text',
    }
  },
}

const DOCUMENT_INDEX_DEBUG = process.env.DOCUMENT_INDEX_DEBUG === '1'

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripXmlTags(input: string): string {
  return input
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
}

function getMetadataText(metadata: Record<string, any> | null | undefined): string {
  if (!metadata || typeof metadata !== 'object') return ''

  const candidates = [
    metadata.rawText,
    metadata.ocrText,
    metadata.text,
    metadata.textoCompleto,
    metadata.extracted_data?.textoCompleto,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  if (metadata.extracted_data && typeof metadata.extracted_data === 'object') {
    return JSON.stringify(metadata.extracted_data)
  }

  return ''
}

export class DocumentTextExtractor {
  constructor(private readonly deps: ExtractorDeps = defaultDeps) {}

  static isUsableText(text: string): boolean {
    const normalized = String(text || '').trim()
    if (normalized.length < 80) return false

    const alphaNum = (normalized.match(/[A-Za-z0-9\u00C0-\u017F]/g) || []).length
    const ratio = alphaNum / Math.max(1, normalized.length)
    return ratio >= 0.55
  }

  static getTextQuality(text: string): { length: number; alnumRatio: number } {
    const normalized = String(text || '').trim()
    const alphaNum = (normalized.match(/[A-Za-z0-9\u00C0-\u017F]/g) || []).length
    const ratio = alphaNum / Math.max(1, normalized.length)
    return { length: normalized.length, alnumRatio: ratio }
  }

  async extract(documento: DocumentoRecord): Promise<TextExtractionResult> {
    const mime = String(documento.mime_type || '').toLowerCase()

    const fromMetadata = getMetadataText(documento.metadata)
    if (DocumentTextExtractor.isUsableText(fromMetadata)) {
      const quality = DocumentTextExtractor.getTextQuality(fromMetadata)
      if (DOCUMENT_INDEX_DEBUG) {
        console.info('[DocumentTextExtractor] source=metadata', {
          documento_id: documento.id,
          mime_type: mime,
          text_length: quality.length,
          alnum_ratio: Number(quality.alnumRatio.toFixed(3)),
        })
      }
      return {
        text: fromMetadata,
        source: 'metadata',
        needs_ocr: false,
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    if (!documento.s3_key) {
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'missing_s3_key',
        debug: {
          text_length: 0,
          alnum_ratio: 0,
          mime_type: mime,
        },
      }
    }

    let bytes: Uint8Array | null = null
    try {
      bytes = await this.deps.downloadDocumentBytes(documento)
    } catch {
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'download_failed',
        debug: {
          text_length: 0,
          alnum_ratio: 0,
          mime_type: mime,
        },
      }
    }

    if (!bytes || bytes.length === 0) {
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'empty_file',
        debug: {
          text_length: 0,
          alnum_ratio: 0,
          mime_type: mime,
        },
      }
    }

    if (mime === 'application/pdf' || documento.nombre.toLowerCase().endsWith('.pdf')) {
      const pdfText = await this.extractPdfText(bytes)
      const quality = DocumentTextExtractor.getTextQuality(pdfText)
      if (DOCUMENT_INDEX_DEBUG) {
        console.info('[DocumentTextExtractor] source=pdf_text_probe', {
          documento_id: documento.id,
          mime_type: mime,
          text_length: quality.length,
          alnum_ratio: Number(quality.alnumRatio.toFixed(3)),
          usable: DocumentTextExtractor.isUsableText(pdfText),
        })
      }
      if (DocumentTextExtractor.isUsableText(pdfText)) {
        return {
          text: pdfText,
          source: 'pdf_text',
          needs_ocr: false,
          debug: {
            text_length: quality.length,
            alnum_ratio: quality.alnumRatio,
            mime_type: mime,
          },
        }
      }
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'pdf_text_not_usable',
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      documento.nombre.toLowerCase().endsWith('.docx')
    ) {
      const docxText = await this.extractDocxText(bytes)
      const quality = DocumentTextExtractor.getTextQuality(docxText)
      if (DocumentTextExtractor.isUsableText(docxText)) {
        return {
          text: docxText,
          source: 'docx_text',
          needs_ocr: false,
          debug: {
            text_length: quality.length,
            alnum_ratio: quality.alnumRatio,
            mime_type: mime,
          },
        }
      }
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'docx_text_not_usable',
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    const ocrResult = await this.deps.ocrFallback(documento, bytes)
    if (ocrResult && DocumentTextExtractor.isUsableText(ocrResult.text)) {
      const quality = DocumentTextExtractor.getTextQuality(ocrResult.text)
      if (DOCUMENT_INDEX_DEBUG) {
        console.info('[DocumentTextExtractor] source=ocr_fallback', {
          documento_id: documento.id,
          mime_type: mime,
          text_length: quality.length,
          alnum_ratio: Number(quality.alnumRatio.toFixed(3)),
          ocr_source: ocrResult.source,
        })
      }
      return {
        text: ocrResult.text,
        source: 'ocr_fallback',
        needs_ocr: false,
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    if (DOCUMENT_INDEX_DEBUG) {
      console.info('[DocumentTextExtractor] source=none needs_ocr', {
        documento_id: documento.id,
        mime_type: mime,
      })
    }
    return {
      text: '',
      source: 'none',
      needs_ocr: true,
      reason: 'no_usable_text',
      debug: {
        text_length: 0,
        alnum_ratio: 0,
        mime_type: mime,
      },
    }
  }

  async extractFromFile(file: File): Promise<TextExtractionResult> {
    const mime = String(file.type || '').toLowerCase()
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!bytes || bytes.length === 0) {
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'empty_file',
        debug: {
          text_length: 0,
          alnum_ratio: 0,
          mime_type: mime,
        },
      }
    }

    if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdfText = await this.extractPdfText(bytes)
      const quality = DocumentTextExtractor.getTextQuality(pdfText)
      if (DocumentTextExtractor.isUsableText(pdfText)) {
        return {
          text: pdfText,
          source: 'pdf_text',
          needs_ocr: false,
          debug: {
            text_length: quality.length,
            alnum_ratio: quality.alnumRatio,
            mime_type: mime,
          },
        }
      }
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'pdf_text_not_usable',
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx')
    ) {
      const docxText = await this.extractDocxText(bytes)
      const quality = DocumentTextExtractor.getTextQuality(docxText)
      if (DocumentTextExtractor.isUsableText(docxText)) {
        return {
          text: docxText,
          source: 'docx_text',
          needs_ocr: false,
          debug: {
            text_length: quality.length,
            alnum_ratio: quality.alnumRatio,
            mime_type: mime,
          },
        }
      }
      return {
        text: '',
        source: 'none',
        needs_ocr: true,
        reason: 'docx_text_not_usable',
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    const ocrResult = await this.deps.ocrFallbackFromFile(file, bytes)
    if (ocrResult && DocumentTextExtractor.isUsableText(ocrResult.text)) {
      const quality = DocumentTextExtractor.getTextQuality(ocrResult.text)
      return {
        text: ocrResult.text,
        source: 'ocr_fallback',
        needs_ocr: false,
        debug: {
          text_length: quality.length,
          alnum_ratio: quality.alnumRatio,
          mime_type: mime,
        },
      }
    }

    return {
      text: '',
      source: 'none',
      needs_ocr: true,
      reason: 'no_usable_text',
      debug: {
        text_length: 0,
        alnum_ratio: 0,
        mime_type: mime,
      },
    }
  }

  private async extractPdfText(bytes: Uint8Array): Promise<string> {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const task = pdfjs.getDocument({
        data: bytes,
        disableWorker: true,
      } as any)
      const document = await task.promise
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const text = (content.items || [])
          .map((item: any) => String(item?.str || ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text) pages.push(text)
      }
      return pages.join('\n\n').trim()
    } catch {
      return ''
    }
  }

  private async extractDocxText(bytes: Uint8Array): Promise<string> {
    try {
      const { default: JSZip } = await import('jszip')
      const zip = await JSZip.loadAsync(bytes)
      const documentXml = zip.file('word/document.xml')
      if (!documentXml) return ''
      const xml = await documentXml.async('string')
      const text = decodeXmlEntities(stripXmlTags(xml))
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\s{2,}/g, ' ')
        .trim()
      return text
    } catch {
      return ''
    }
  }
}
