/**
 * Endpoint alternativo de procesamiento de documentos usando Plugin System
 * Activar con feature flag: USE_PLUGIN_SYSTEM=1
 */

import { NextResponse } from 'next/server'
import { getTramiteSystem } from '@/lib/tramites/tramite-system-instance'
import { PreavisoConversationLogService } from '@/lib/services/preaviso-conversation-log-service'

export async function POST(req: Request) {
  try {
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
        let context: any = null
        if (contextRaw) {
          try {
            context = JSON.parse(contextRaw)
          } catch {
            context = null
          }
        }
        const contextTipo = context?.tipoOperacion || context?.tipo
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

    // DEBUG: Verificar que el backend reciba _document_intent y el comprador/cónyuge en el contexto
    try {
      console.log('[preaviso-process-document-v2] incoming', {
        documentType,
        fileName: file?.name || null,
        pluginId,
        _document_intent: context?._document_intent ?? null,
        comprador0: context?.compradores?.[0]?.persona_fisica?.nombre || context?.compradores?.[0]?.persona_moral?.denominacion_social || null,
        comprador0EstadoCivil: context?.compradores?.[0]?.persona_fisica?.estado_civil || null,
        conyuge: context?.compradores?.[0]?.persona_fisica?.conyuge?.nombre || null,
      })
    } catch {}

    // Obtener sistema de trámites
    const tramiteSystem = getTramiteSystem()

    // Procesar documento
    const result = await tramiteSystem.processDocument(
      pluginId,
      file,
      documentType,
      context || {}
    )

    // Logging (DB): registrar evento de documento como parte de la conversación si hay conversation_id
    try {
      const conversationId = context?.conversation_id || null
      if (conversationId) {
        const asUuidOrNull = (v: any): string | null => {
          if (!v || typeof v !== 'string') return null
          const s = v.trim()
          return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null
        }
        const tramiteIdForLog =
          asUuidOrNull(context?.tramiteId) ||
          asUuidOrNull(tramiteIdRaw) ||
          null

        const meta = {
          kind: 'document_upload',
          documentType,
          fileName: file?.name || null,
          user_agent: req.headers.get('user-agent'),
          ts: new Date().toISOString(),
          tramite_id_raw: typeof tramiteIdRaw === 'string' ? tramiteIdRaw : null,
          ...(result.meta || {})
        }
        // No siempre tenemos el arreglo completo de messages aquí; guardamos meta + snapshot del contexto.
        await PreavisoConversationLogService.upsert({
          conversationId: String(conversationId),
          tramiteId: tramiteIdForLog,
          pluginId,
          // IMPORTANT: no sobrescribir messages existentes
          lastUserMessage: `He subido el siguiente documento: ${file?.name || ''}`.trim(),
          lastAssistantMessage: 'Documento procesado correctamente',
          context: result.data || context,
          state: { commands: result.commands?.map((c: any) => c.type) || [] },
          meta,
        })
      }
    } catch (e) {
      console.error('[preaviso-process-document-v2] logging error', e)
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
        console.log('[preaviso-process-document-v2] OCR se maneja desde el frontend por página')
      } catch (ocrError) {
        console.error('[preaviso-process-document-v2] Error guardando OCR:', ocrError)
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
    console.error('[preaviso-process-document-v2] Error:', error)
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
