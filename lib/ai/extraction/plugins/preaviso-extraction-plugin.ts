import { z } from 'zod'
import type { ExtractionInput, ExtractionPlugin } from '@/lib/ai/extraction/types'

const nullableString = z.string().trim().min(1).nullable()

const direccionSchema = z.object({
  calle: nullableString.optional(),
  numero: nullableString.optional(),
  colonia: nullableString.optional(),
  municipio: nullableString.optional(),
  estado: nullableString.optional(),
  codigo_postal: nullableString.optional(),
}).strict()

const datosCatastralesSchema = z.object({
  lote: nullableString.optional(),
  manzana: nullableString.optional(),
  fraccionamiento: nullableString.optional(),
  condominio: nullableString.optional(),
  unidad: nullableString.optional(),
  modulo: nullableString.optional(),
}).strict()

const personaDetectadaSchema = z.object({
  nombre: nullableString,
  rfc: nullableString.optional(),
  curp: nullableString.optional(),
}).strict()

const gravamenDetalleSchema = z.object({
  institucion: nullableString.optional(),
  monto: nullableString.optional(),
  moneda: nullableString.optional(),
  tipo: nullableString.optional(),
}).strict()

export const preavisoExtractionSchema = z.object({
  source_document_type: z.enum([
    'inscripcion',
    'escritura',
    'identificacion',
    'acta_matrimonio',
    'otro',
  ]),
  inmueble: z.object({
    folio_real: nullableString.optional(),
    partidas: z.array(z.string().trim().min(1)).default([]),
    seccion: nullableString.optional(),
    numero_expediente: nullableString.optional(),
    direccion: direccionSchema.nullable().optional(),
    superficie: nullableString.optional(),
    valor: nullableString.optional(),
    datos_catastrales: datosCatastralesSchema.nullable().optional(),
  }).strict().optional(),
  titular_registral: z.object({
    nombre: nullableString,
    rfc: nullableString.optional(),
    curp: nullableString.optional(),
  }).strict().nullable().optional(),
  compradores_detectados: z.array(personaDetectadaSchema).default([]),
  conyuges_detectados: z.array(
    z.object({
      nombre: nullableString,
    }).strict()
  ).default([]),
  gravamenes: z.union([
    z.literal('LIBRE'),
    z.array(gravamenDetalleSchema),
  ]).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()).default([]),
  source_refs: z.array(
    z.object({
      field: z.string().trim().min(1),
      evidence: z.string().trim().min(1),
    }).strict()
  ).default([]),
}).strict()

export type PreavisoExtractionStructured = z.infer<typeof preavisoExtractionSchema>

export class PreavisoExtractionPlugin implements ExtractionPlugin<typeof preavisoExtractionSchema> {
  tramiteType: 'preaviso' = 'preaviso'
  outputSchema = preavisoExtractionSchema

  buildSystemPrompt(_input: ExtractionInput): string {
    return [
      'Eres un extractor juridico notarial para tramite PREAVISO.',
      'Tu tarea es convertir texto de documento a JSON ESTRICTO y valido.',
      'No inventes datos. Si no hay evidencia textual, usa null o arreglos vacios.',
      'Responde SOLO JSON valido, sin markdown, sin explicaciones.',
      'Usa exactamente el esquema solicitado por el usuario.',
    ].join('\n')
  }

  buildUserPrompt(input: ExtractionInput): string {
    const fileMeta = JSON.stringify(input.fileMeta || {}, null, 2)
    const schemaExample = `{
  "source_document_type": "inscripcion|escritura|identificacion|acta_matrimonio|otro",
  "inmueble": {
    "folio_real": "string|null",
    "partidas": ["string"],
    "seccion": "string|null",
    "numero_expediente": "string|null",
    "direccion": {
      "calle": "string|null",
      "numero": "string|null",
      "colonia": "string|null",
      "municipio": "string|null",
      "estado": "string|null",
      "codigo_postal": "string|null"
    },
    "superficie": "string|null",
    "valor": "string|null",
    "datos_catastrales": {
      "lote": "string|null",
      "manzana": "string|null",
      "fraccionamiento": "string|null",
      "condominio": "string|null",
      "unidad": "string|null",
      "modulo": "string|null"
    }
  },
  "titular_registral": { "nombre": "string|null", "rfc": "string|null", "curp": "string|null" },
  "compradores_detectados": [{ "nombre": "string|null", "rfc": "string|null", "curp": "string|null" }],
  "conyuges_detectados": [{ "nombre": "string|null" }],
  "gravamenes": "LIBRE | [{ institucion, monto, moneda, tipo }] | null",
  "confidence": 0.0,
  "warnings": ["string"],
  "source_refs": [{ "field": "campo", "evidence": "texto exacto de respaldo" }]
}`
    return [
      'Extrae los campos minimos para el wizard de preaviso.',
      'Schema de salida requerido:',
      schemaExample,
      'Metadatos del archivo:',
      fileMeta,
      'Texto del documento (fuente de verdad para extraer):',
      input.rawText || '',
    ].join('\n\n')
  }

  buildRepairPrompt(args: {
    input: ExtractionInput
    lastModelOutput: string
    validationErrors: string[]
  }): string {
    return [
      'Tu salida JSON anterior fue invalida.',
      'Corrigela y devuelve SOLO JSON valido que cumpla el schema.',
      `Errores de validacion: ${args.validationErrors.join(' | ')}`,
      'Salida anterior:',
      args.lastModelOutput,
      'Texto fuente:',
      args.input.rawText || '',
    ].join('\n\n')
  }
}
