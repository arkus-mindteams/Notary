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

const sexoSchema = z.enum(['hombre', 'mujer']).nullable()

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
      sexo: sexoSchema.optional(),
    }).strict()
  ).default([]),
  personas_detectadas_no_clasificadas: z.array(personaDetectadaSchema).default([]),
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
      'MODO BATCH: si el texto contiene bloques "<<<DOCUMENT_START>>> ... <<<DOCUMENT_END>>>", procesa TODOS los bloques y consolida en una sola salida.',
      'MODO BATCH (legacy): si el texto contiene marcadores "--- DOCUMENTO N ---", tambien procesa TODOS los documentos.',
      'En modo batch, NO te ancles al primer documento: combina evidencia de todas las secciones del texto.',
      'REGLA CRITICA: si en el texto aparecen terminos de acta de matrimonio (p.ej. ACTA DE MATRIMONIO, CONTRAYENTES, contrajo matrimonio, conyuge/esposo/esposa), debes poblar conyuges_detectados con los nombres visibles.',
      'REGLA CRITICA: todo nombre agregado a conyuges_detectados debe tener respaldo en source_refs con evidencia textual literal.',
      'REGLA CRITICA: si detectas personas pero NO puedes clasificar su rol (vendedor/comprador/conyuge), agregalas en personas_detectadas_no_clasificadas.',
      'REGLA CRITICA: no repitas nombres entre listas; evita duplicados exactos o equivalentes por mayusculas/acentos.',
      'REGLA CRITICA (FOLIO): si en un mismo documento aparecen multiples "FOLIO REAL", NO asignes uno arbitrariamente en inmueble.folio_real; dejalo en null y reporta warning.',
      'REGLA CRITICA (BATCH + INMUEBLE): si existe una seccion de INSCRIPCION/ESCRITURA con PARTIDA/SECCION/MUNICIPIO/FOLIO REAL, prioriza esa seccion para poblar inmueble.',
      'REGLA CRITICA (BATCH + REFERENCIAS): cuando haya datos de mas de un documento, incluye source_refs de multiples documentos cuando sea posible.',
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
  "conyuges_detectados": [{ "nombre": "string|null", "sexo": "hombre|mujer|null" }],
  "personas_detectadas_no_clasificadas": [{ "nombre": "string|null", "rfc": "string|null", "curp": "string|null" }],
  "gravamenes": "LIBRE | [{ institucion, monto, moneda, tipo }] | null",
  "confidence": 0.0,
  "warnings": ["string"],
  "source_refs": [{ "field": "campo", "evidence": "texto exacto de respaldo" }]
}`
    return [
      'Extrae los campos minimos para el wizard de preaviso.',
      'Instrucciones criticas adicionales:',
      '- Si el texto esta consolidado por bloques "<<<DOCUMENT_START>>> ... <<<DOCUMENT_END>>>", debes leer TODOS los bloques antes de responder.',
      '- Compatibilidad: si el texto viene con "--- DOCUMENTO N ---", tambien debes leer TODOS los bloques.',
      '- Si hay acta de matrimonio + hoja de inscripcion: usa acta para conyuges_detectados y hoja de inscripcion para inmueble/titular/partidas/seccion cuando exista evidencia.',
      '- Usa `fileMeta.documents[*].sourceDocumentType` como pista de priorizacion por documento (sin inventar datos no visibles en el texto).',
      '- Si `fileMeta.documents[*].sourceWarnings` reporta ambiguedad, manten advertencias consistentes en `warnings`.',
      '- No descartes un bloque por haber identificado otro tipo de documento al inicio.',
      '- Si el texto fuente contiene datos de matrimonio/contrayentes, NO omitas conyuges_detectados.',
      '- Si detectas 2 contrayentes, devuelve 2 entradas en conyuges_detectados (nombre completo o la mejor lectura posible).',
      '- Si el documento explicita sexo/genero (HOMBRE/MUJER, MASCULINO/FEMENINO, ESPOSO/ESPOSA), completa conyuges_detectados[].sexo con "hombre" o "mujer".',
      '- Si el sexo no aparece de forma textual clara, usa sexo: null (no inferir por nombre).',
      '- Si no hay evidencia textual clara, deja conyuges_detectados como [] (no inventar).',
      '- Si detectas personas sin rol claro, agregalas en personas_detectadas_no_clasificadas.',
      '- Evita nombres duplicados entre titular_registral, compradores_detectados, conyuges_detectados y personas_detectadas_no_clasificadas.',
      '- Incluye source_refs para los campos importantes, especialmente conyuges_detectados cuando aplique.',
      '- Si extraes partidas/seccion/municipio o folios desde una hoja de inscripcion, agrega source_refs para esos campos.',
      '- Folio real: si hay mas de un folio en el texto, NO elijas uno; devuelve inmueble.folio_real = null y agrega warning.',
      '- Solo puedes asignar inmueble.folio_real cuando hay evidencia unica y consistente (ej. unidad/letra/numero oficial coinciden de forma explicita).',
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
      'No omitas conyuges_detectados si el texto fuente contiene contrayentes/acta de matrimonio.',
      'Incluye personas_detectadas_no_clasificadas cuando haya nombres sin rol claro y elimina duplicados de nombres.',
      'Si hay multiples folios reales en el texto, NO asignes inmueble.folio_real; dejalo en null y agrega warning.',
      'Salida anterior:',
      args.lastModelOutput,
      'Texto fuente:',
      args.input.rawText || '',
    ].join('\n\n')
  }
}
