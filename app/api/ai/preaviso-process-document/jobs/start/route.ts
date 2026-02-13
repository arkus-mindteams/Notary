import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { DocumentProcessingJobService } from '@/lib/services/document-processing-job-service'
import { DocumentTextExtractor } from '@/lib/services/document-text-extractor'
import { ExtractionAgent } from '@/lib/ai/extraction/extraction-agent'

function toSafeError(error: unknown): { message: string } {
  if (!error || typeof error !== 'object') return { message: 'unknown_error' }
  const err = error as { message?: string }
  return { message: err.message || 'processing_error' }
}

function detectDocumentTypeByName(name: string): string {
  const n = String(name || '').toLowerCase()
  if (n.includes('inscrip') || n.includes('escrit')) return 'inscripcion'
  if (n.includes('acta') && n.includes('matri')) return 'acta_matrimonio'
  if (n.includes('ine') || n.includes('identif') || n.includes('pasaporte')) return 'identificacion'
  return 'inscripcion'
}

function mergeExtractedIntoContext(context: any, structured: any): any {
  const next = { ...(context || {}) }
  const inmueble = structured?.inmueble || {}
  const direccion = inmueble?.direccion || {}
  const datosCatastrales = inmueble?.datos_catastrales || {}

  next.inmueble = {
    ...(next.inmueble || {}),
    folio_real: inmueble?.folio_real ?? next?.inmueble?.folio_real ?? null,
    partidas: Array.isArray(inmueble?.partidas) && inmueble.partidas.length > 0
      ? inmueble.partidas
      : (next?.inmueble?.partidas || []),
    seccion: inmueble?.seccion ?? next?.inmueble?.seccion ?? null,
    numero_expediente: inmueble?.numero_expediente ?? next?.inmueble?.numero_expediente ?? null,
    direccion: {
      ...(next?.inmueble?.direccion || {}),
      calle: direccion?.calle ?? next?.inmueble?.direccion?.calle ?? null,
      numero: direccion?.numero ?? next?.inmueble?.direccion?.numero ?? null,
      colonia: direccion?.colonia ?? next?.inmueble?.direccion?.colonia ?? null,
      municipio: direccion?.municipio ?? next?.inmueble?.direccion?.municipio ?? null,
      estado: direccion?.estado ?? next?.inmueble?.direccion?.estado ?? null,
      codigo_postal: direccion?.codigo_postal ?? next?.inmueble?.direccion?.codigo_postal ?? null,
    },
    superficie: inmueble?.superficie ?? next?.inmueble?.superficie ?? null,
    valor: inmueble?.valor ?? next?.inmueble?.valor ?? null,
    datos_catastrales: {
      ...(next?.inmueble?.datos_catastrales || {}),
      lote: datosCatastrales?.lote ?? next?.inmueble?.datos_catastrales?.lote ?? null,
      manzana: datosCatastrales?.manzana ?? next?.inmueble?.datos_catastrales?.manzana ?? null,
      fraccionamiento: datosCatastrales?.fraccionamiento ?? next?.inmueble?.datos_catastrales?.fraccionamiento ?? null,
      condominio: datosCatastrales?.condominio ?? next?.inmueble?.datos_catastrales?.condominio ?? null,
      unidad: datosCatastrales?.unidad ?? next?.inmueble?.datos_catastrales?.unidad ?? null,
      modulo: datosCatastrales?.modulo ?? next?.inmueble?.datos_catastrales?.modulo ?? null,
    }
  }

  if (structured?.titular_registral?.nombre) {
    const vendedor = {
      party_id: 'vendedor_1',
      persona_fisica: {
        nombre: structured.titular_registral.nombre,
        rfc: structured?.titular_registral?.rfc ?? null,
        curp: structured?.titular_registral?.curp ?? null,
      },
      titular_registral_confirmado: true,
    }
    const existing = Array.isArray(next.vendedores) ? next.vendedores : []
    next.vendedores = existing.length > 0 ? [ { ...existing[0], ...vendedor } ] : [vendedor]
  }

  const compradoresDetectados = Array.isArray(structured?.compradores_detectados)
    ? structured.compradores_detectados.filter((p: any) => p?.nombre)
    : []
  if (compradoresDetectados.length > 0) {
    const existing = Array.isArray(next.compradores) ? next.compradores : []
    const merged = [...existing]
    for (let i = 0; i < compradoresDetectados.length; i++) {
      const buyer = compradoresDetectados[i]
      const prev = merged[i] || {}
      merged[i] = {
        ...prev,
        party_id: prev.party_id || `comprador_${i + 1}`,
        persona_fisica: {
          ...(prev.persona_fisica || {}),
          nombre: buyer?.nombre ?? prev?.persona_fisica?.nombre ?? null,
          rfc: buyer?.rfc ?? prev?.persona_fisica?.rfc ?? null,
          curp: buyer?.curp ?? prev?.persona_fisica?.curp ?? null,
        }
      }
    }
    next.compradores = merged
  }

  if (structured?.gravamenes === 'LIBRE') {
    next.gravamenes = []
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: false }
  } else if (Array.isArray(structured?.gravamenes) && structured.gravamenes.length > 0) {
    next.gravamenes = structured.gravamenes
    next.inmueble = { ...(next.inmueble || {}), existe_hipoteca: true }
  }

  return next
}

export async function POST(req: Request) {
  const traceId = randomUUID()
  try {
    const currentUser = await getCurrentUserFromRequest(req)
    if (!currentUser || !currentUser.activo) {
      return NextResponse.json({ error: 'unauthorized', message: 'No autenticado', trace_id: traceId }, { status: 401 })
    }

    const formData = await req.formData()
    const files = formData.getAll('files').filter(Boolean) as File[]
    const contextRaw = String(formData.get('context') || '{}')
    const context = JSON.parse(contextRaw || '{}')

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'bad_request', message: 'files is required', trace_id: traceId }, { status: 400 })
    }

    const job = DocumentProcessingJobService.create(traceId, files.length)
    const tramiteSystem = getTramiteSystem()
    const textExtractor = new DocumentTextExtractor()
    const extractionAgent = new ExtractionAgent()

    setTimeout(async () => {
      try {
        DocumentProcessingJobService.update(job.job_id, { status: 'running', progress: 0 })
        let workingContext = { ...(context || {}), _bulk_fast_mode: true, _userId: currentUser.auth_user_id || null }

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const documentType = detectDocumentTypeByName(file.name)
          DocumentProcessingJobService.update(job.job_id, {
            current_file_name: file.name,
            processed_files: i,
            progress: Math.round((i / files.length) * 100),
          })

          try {
            // 1) Intento rápido por texto (pdf embebido/docx/ocr imagen) para capturar IDs y datos personales.
            const textResult = await textExtractor.extractFromFile(file)
            if (!textResult.needs_ocr && textResult.text?.trim()) {
              const extraction = await extractionAgent.extract({
                tramiteType: 'preaviso',
                documentId: `job:${job.job_id}:${i}`,
                rawText: textResult.text,
                fileMeta: {
                  file_name: file.name,
                  mime_type: file.type,
                  source_document_type: documentType,
                  source_extraction: textResult.source,
                },
                auditContext: {
                  userId: currentUser.auth_user_id || null,
                  tramiteId: workingContext?.tramiteId || null,
                },
              })
              workingContext = mergeExtractedIntoContext(workingContext, extraction?.structured || null)
            } else {
              // 2) Fallback legado (vision/plugin) para mantener compatibilidad.
              const result = await tramiteSystem.processDocument('preaviso', file, documentType, workingContext)
              workingContext = result?.data || workingContext
            }
          } catch (fileError) {
            console.error('[preaviso-process-document/jobs/start] file processing failed', {
              trace_id: traceId,
              file_name: file.name,
              error: toSafeError(fileError).message,
            })
          }

          DocumentProcessingJobService.update(job.job_id, {
            processed_files: i + 1,
            progress: Math.round(((i + 1) / files.length) * 100),
          })
        }

        DocumentProcessingJobService.update(job.job_id, {
          status: 'completed',
          progress: 100,
          current_file_name: null,
          data: workingContext,
        })
      } catch (error) {
        DocumentProcessingJobService.update(job.job_id, {
          status: 'failed',
          error: toSafeError(error).message,
          current_file_name: null,
        })
      }
    }, 0)

    return NextResponse.json({
      job_id: job.job_id,
      status: job.status,
      progress: job.progress,
      trace_id: traceId,
    }, { status: 202 })
  } catch (error) {
    const safe = toSafeError(error)
    return NextResponse.json({ error: 'internal_error', message: safe.message, trace_id: traceId }, { status: 500 })
  }
}
