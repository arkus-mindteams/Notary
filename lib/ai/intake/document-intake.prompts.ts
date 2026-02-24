import type { FileInput } from '@/lib/ai/intake/document-intake.types'

export function buildDocumentIntakeSystemPrompt(): string {
  return [
    'Eres un motor experto de OCR + clasificacion documental para un tramite notarial.',
    'Tu tarea:',
    '1) transcribir fielmente el contenido visible del documento (OCR),',
    '2) clasificar el tipo de documento,',
    '3) extraer campos clave relevantes por tipo,',
    '4) devolver evidencia por pagina (fragmentos textuales cortos que respalden cada campo),',
    '5) responder SOLO con JSON valido y estrictamente conforme al esquema.',
    '',
    'Reglas:',
    '- No inventes datos. Si no hay evidencia textual visible, usa null.',
    '- Manten trazabilidad: todo campo importante debe tener al menos una evidencia con pageNumber + snippet.',
    '- Si el documento esta borroso/ilegible, indicalo en issues[] y baja confidence.',
    '- evidence[].snippet debe ser literal y maximo 160 caracteres.',
    '- Usa filename solo como pista auxiliar para clasificacion; la evidencia textual visible manda.',
    '- Para folios reales: SOLO extrae valores que aparezcan inmediatamente despues de la etiqueta literal "FOLIO REAL:".',
    '- NO confundas PARTIDA, VOLANTE, RECIBO, CODIGO DE AUTENTICIDAD o numeracion de pie de pagina con folio real.',
    '- Si hay duda en un numero de folio por baja legibilidad, no lo inventes: omite ese valor y agrega issue.',
  ].join('\n')
}

export function buildDocumentIntakeUserPrompt(args: {
  traceId: string
  files: FileInput[]
  maxPages?: number
}): string {
  const documentsMeta = args.files.map((f) => ({
    documentId: f.documentId,
    filename: f.filename,
    mimeType: f.mimeType,
  }))
  const maxPages = Number(args.maxPages || 0) > 0 ? Number(args.maxPages) : null

  return [
    'Analiza el/los documento(s) adjunto(s) y produce este JSON:',
    JSON.stringify(
      {
        traceId: args.traceId,
        documents: [
          {
            documentId: '<documentId>',
            filename: '<filename>',
            detectedType:
              'INE|COMPROBANTE_DOMICILIO|ESTADO_CUENTA|RFC|CURP|ACTA_NACIMIENTO|PASAPORTE|LICENCIA|OTRO',
            confidence: 0.0,
            issues: ['...'],
            summary: ['...'],
            pages: [
              {
                pageNumber: 1,
                text: 'OCR completo de la pagina',
                evidence: [{ label: 'nombre', snippet: 'texto exacto', pageNumber: 1 }],
              },
            ],
            keyFields: {
              nombre: null,
              domicilio: null,
              curp: null,
              rfc: null,
              numeroDocumento: null,
              fechaEmision: null,
              fechaVencimiento: null,
            },
            facts: [
              {
                key: 'unidad',
                value: '6',
                confidence: 0.9,
                evidence: { pageNumber: 1, snippet: 'INT.: 6' },
              },
            ],
          },
        ],
      },
      null,
      2
    ),
    '',
    `traceId: ${args.traceId}`,
    `maxPages: ${maxPages ?? 'sin limite'}`,
    'Metadatos de documentos a procesar:',
    JSON.stringify(documentsMeta, null, 2),
    '',
    'Notas:',
    '- pages[].text debe ser lo mas completo posible.',
    '- Mantener documentId/filename exactamente como vienen en metadata.',
    '- Si no puedes leer algo, deja valores null y agrega issue.',
    '- Si filename sugiere un tipo y el contenido visible sugiere otro, deja trazabilidad en issues[].',
    '- Si reportas folios reales, cada folio debe venir respaldado por un snippet que contenga la cadena "FOLIO REAL".',
  ].join('\n')
}

export function buildDocumentIntakeRepairPrompt(args: {
  traceId: string
  validationErrors: string[]
  lastModelOutput: string
}): string {
  return [
    `Tu salida JSON anterior para traceId ${args.traceId} fue invalida.`,
    'Corrigela y devuelve SOLO JSON valido segun el esquema solicitado.',
    `Errores: ${args.validationErrors.join(' | ')}`,
    'Salida anterior:',
    args.lastModelOutput || '(vacia)',
  ].join('\n\n')
}

