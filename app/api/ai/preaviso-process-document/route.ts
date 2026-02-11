/**
 * Endpoint de procesamiento de documentos usando Plugin System
 */

import { NextResponse } from 'next/server'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { ActivityLogService } from '@/lib/services/activity-log-service'
import { getCurrentUserFromRequest } from '@/lib/utils/auth-helper'
import { DocumentoService } from '@/lib/services/documento-service'
import {
  DocumentExtractionTextBuilder,
  RAG_CHUNK_MAX_CHARS
} from '@/lib/services/document-extraction-text-builder'

export async function POST(req: Request) {
  // Import createServerClient here, as it's only used in the fallback logic
  const { createServerClient } = await import('@/lib/supabase')

  try {
    // ✅ Obtener usuario autenticado usando el helper oficial
    // Esto valida el token del header Authorization
    const usuario = await getCurrentUserFromRequest(req)

    // El ID que necesitamos para activity_logs es el auth_user_id (el de Supabase Auth)
    let authUserId: string | null = usuario?.auth_user_id || null

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const documentType = formData.get('documentType') as string | null
    const contextRaw = formData.get('context') as string | null
    const tramiteIdRaw = (formData.get('tramiteId') as string | null) || 'preaviso'
    const needOcr = (formData.get('needOcr') as string | null) || null

    // Mapear tramiteId: si viene un UUID (ID de base de datos), usar el tipo del trámite del contexto
    // o default a 'preaviso'. El frontend puede enviar el UUID del trámite, pero necesitamos el ID del plugin.
    let pluginId = 'preaviso' // Default
    if (tramiteIdRaw && typeof tramiteIdRaw === 'string') {
      // Si es un UUID (formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), ignorarlo y usar el tipo del contexto
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tramiteIdRaw)
      if (!isUUID) {
        // Si no es UUID, puede ser el ID del plugin directamente
        pluginId = tramiteIdRaw
      } else {
        // Es UUID, usar el tipo del trámite del contexto si está disponible
        let contextTmp: any = null
        if (contextRaw) {
          try {
            contextTmp = JSON.parse(contextRaw)
          } catch {
            contextTmp = null
          }
        }
        const contextTipo = contextTmp?.tipoOperacion || contextTmp?.tipo
        if (contextTipo === 'preaviso' || !contextTipo) {
          pluginId = 'preaviso'
        } else {
          // En el futuro, mapear otros tipos de trámites
          pluginId = 'preaviso' // Por ahora, solo preaviso está implementado
        }
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: 'bad_request', message: 'file is required' },
        { status: 400 }
      )
    }

    if (!documentType) {
      return NextResponse.json(
        { error: 'bad_request', message: 'documentType is required' },
        { status: 400 }
      )
    }

    let context: any = null
    if (contextRaw) {
      try {
        context = JSON.parse(contextRaw)
      } catch {
        context = null
      }
    }

    // ✅ Fallback: si no hay usuario en el request, intentar obtenerlo del trámite
    if (!authUserId && context?.tramiteId) {
      try {
        const supabase = createServerClient()
        const { data: tramite } = await supabase
          .from('tramites')
          .select('usuario_id')
          .eq('id', context.tramiteId)
          .single()

        if (tramite?.usuario_id) {
          // El usuario_id en tramites es el ID de la tabla publica usuarios.
          // Necesitamos el auth_user_id para el activity_log
          const { data: userRecord } = await supabase
            .from('usuarios')
            .select('auth_user_id')
            .eq('id', tramite.usuario_id)
            .single()

          authUserId = userRecord?.auth_user_id || null
        }
      } catch (e) {
        console.error('[preaviso-process-document] Error en fallback de userId:', e)
      }
    }

    // ✅ Inyectar userId en el contexto para que el DocumentProcessor lo use al loggear
    if (authUserId && context) {
      context._userId = authUserId
    } else if (authUserId) {
      context = { _userId: authUserId }
    }

    // DEBUG: Verificar que el backend reciba conversation_id, tramiteId y contexto
    try {
      const conversationIdIncoming = context?.conversation_id || null
      console.log('[preaviso-process-document] incoming', {
        documentType,
        fileName: file?.name || null,
        pluginId,
        userId: authUserId,
        conversation_id: conversationIdIncoming,
        tramiteId: context?.tramiteId || null,
        _document_intent: context?._document_intent ?? null,
        comprador0: context?.compradores?.[0]?.persona_fisica?.nombre || context?.compradores?.[0]?.persona_moral?.denominacion_social || null,
        comprador0EstadoCivil: context?.compradores?.[0]?.persona_fisica?.estado_civil || null,
        conyuge: context?.compradores?.[0]?.persona_fisica?.conyuge?.nombre || null,
      })
    } catch { }

    // Obtener sistema de trámites
    const tramiteSystem = getTramiteSystem()

    // Procesar documento
    const result = await tramiteSystem.processDocument(
      pluginId,
      file,
      documentType,
      context || {}
    )

    // ✅ 4. Guardar documento en DB y vincular con sesión (Logging Unificado)
    try {
      const conversationId = context?.conversation_id || null
      const tramiteId = context?.tramiteId || null
      const supabase = createServerClient()

      // No usar is_processing_artifact para omitir guardado/RAG: las páginas extraídas de un PDF
      // (marcadas como artifact en el front) son contenido real y deben persistirse e indexarse.
      if (!conversationId) {
        console.warn('[preaviso-process-document] No conversation_id in context: document and RAG will not be saved. Frontend must send context.conversation_id.')
      }
      if (conversationId && result.extractedData) {
        console.log('[preaviso-process-document] Saving document and RAG', { conversationId, hasExtractedData: !!result.extractedData })
        // 1. Guardar documento en tabla 'documentos'
        const { data: documento, error: docError } = await supabase
          .from('documentos')
          .insert({
            tipo: documentType,
            nombre: file.name,
            s3_key: `chat/${conversationId}/${file.name}`,
            s3_bucket: process.env.S3_BUCKET || 'notary-documents',
            tamaño: file.size,
            mime_type: file.type || 'application/pdf',
            metadata: {
              extracted_data: result.extractedData,
              via: 'preaviso_chat'
            }
          })
          .select()
          .single()

        if (docError) {
          console.error('[preaviso-process-document] Error saving to documentos:', docError)
        } else if (documento) {
          // 2. Vincular con la sesión de chat
          const { error: linkError } = await supabase
            .from('chat_session_documents')
            .insert({
              session_id: conversationId,
              documento_id: documento.id,
              uploaded_by: authUserId,
              metadata: {
                document_type: documentType,
                extraction_success: true,
                tramite_id: tramiteId
              }
            })

          if (linkError) {
            console.error('[preaviso-process-document] Error linking document to session:', linkError)
          }

          // 3. Registrar upload en activity_logs
          await ActivityLogService.logDocumentUpload({
            userId: authUserId || 'system',
            sessionId: String(conversationId),
            tramiteId: tramiteId ? String(tramiteId) : undefined,
            documentoId: documento.id,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/pdf'
          }).catch(console.error)

          // 4. Indexar documento en RAG (documento_text_chunks) ligado a la sesión de chat
          // para recuperar contexto al reabrir la conversación (session_id) y opcionalmente al trámite (tramite_id)
          const conversationIdForRag = conversationId || context?.conversation_id || null
          if (result.extractedData && (conversationIdForRag || tramiteId)) {
            try {
              // Preferir transcripción completa del documento (textoCompleto) si el extractor la devolvió; si no, usar JSON completo
              const rawFullText =
                typeof result.extractedData.textoCompleto === 'string' && result.extractedData.textoCompleto.trim()
                  ? result.extractedData.textoCompleto.trim()
                  : DocumentExtractionTextBuilder.buildFullTextFromExtractedData(result.extractedData)
              const chunks = DocumentExtractionTextBuilder.splitIntoChunks(rawFullText, RAG_CHUNK_MAX_CHARS)

              if (chunks.length > 0) {
                console.log('[preaviso-process-document] Indexing full document for RAG (chunks)', {
                  documentoId: documento.id,
                  sessionId: conversationIdForRag,
                  tramiteId: tramiteId || null,
                  fullTextLength: rawFullText.length,
                  chunkCount: chunks.length,
                  source: typeof result.extractedData.textoCompleto === 'string' && result.extractedData.textoCompleto.trim() ? 'textoCompleto' : 'json'
                })
                try {
                  await DocumentoService.processAndSaveTextChunks(documento.id, chunks, 1, {
                    sessionId: conversationIdForRag,
                    tramiteId: tramiteId || null
                  })
                  console.log('[preaviso-process-document] RAG index saved successfully', { documentoId: documento.id, chunkCount: chunks.length })
                } catch (ragErr) {
                  console.error('[preaviso-process-document] Error indexing document for RAG:', ragErr)
                }
              } else {
                console.warn('[preaviso-process-document] No text to index from extractedData:', {
                  documentoId: documento.id,
                  documentType,
                  extractedDataKeys: Object.keys(result.extractedData || {})
                })
              }
            } catch (indexError) {
              console.error('[preaviso-process-document] Error building text for RAG indexing:', indexError)
            }
          } else if (!conversationIdForRag && !tramiteId) {
            console.warn('[preaviso-process-document] Skipping RAG indexing: no conversation_id nor tramiteId', {
              documentoId: documento?.id,
              documentType
            })
          }
        }
      }
    } catch (e) {
      console.error('[preaviso-process-document] unified logging error', e)
    }

    // Guardar OCR en Redis si se requiere (reutilizar lógica existente)
    // NOTA: El OCR se maneja principalmente desde el frontend que procesa cada página
    // Este endpoint procesa el documento completo, así que el OCR se guarda por página desde el frontend
    // Si necesitamos guardar OCR aquí, usaríamos upsertPage con los parámetros correctos
    if (needOcr === '1') {
      try {
        // Por ahora, el OCR se maneja desde el frontend que procesa cada página individualmente
        // Si necesitamos guardar OCR aquí, usaríamos:
        // const { PreavisoOcrCacheService } = await import('@/lib/services/preaviso-ocr-cache-service')
        // const ocrText = await extractOCRText(file)
        // await PreavisoOcrCacheService.upsertPage({
        //   tramiteId: context?.tramiteId || pluginId,
        //   docName: file.name,
        //   docSubtype: documentType,
        //   docRole: null,
        //   pageNumber: 1, // Para documentos multi-página, el frontend maneja cada página
        //   text: ocrText
        // })
        console.log('[preaviso-process-document] OCR se maneja desde el frontend por página')
      } catch (ocrError) {
        console.error('[preaviso-process-document] Error guardando OCR:', ocrError)
        // No fallar si OCR falla
      }
    }

    return NextResponse.json({
      data: result.data,
      extractedData: result.extractedData || null, // Datos extraídos del documento
      commands: result.commands.map((c: any) => c.type), // Para debugging
      message: 'Documento procesado correctamente'
    })

  } catch (error: any) {
    console.error('[preaviso-process-document] Error:', error)
    return NextResponse.json(
      {
        error: 'internal_error',
        message: error.message || 'Error procesando documento'
      },
      { status: 500 }
    )
  }
}

/**
 * Helper para extraer texto OCR (simplificado)
 */
async function extractOCRText(file: File): Promise<string> {
  // Por ahora, retornar nombre del archivo como placeholder
  // En producción, usar servicio OCR real
  return `OCR text from ${file.name}`
}
