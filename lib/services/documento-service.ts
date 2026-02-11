import { createServerClient } from '@/lib/supabase'
import { S3Service } from './s3-service'
import { createHash } from 'crypto'
import { EmbeddingsService } from './embeddings'
import type { Documento, TipoDocumento, UploadDocumentoRequest } from '@/lib/types/expediente-types'

export class DocumentoService {
  /**
   * Calcula el hash MD5 de un archivo
   */
  private static async calculateFileHash(file: File | Buffer): Promise<string> {
    const arrayBuffer = file instanceof File
      ? await file.arrayBuffer()
      : file
    const buffer = Buffer.from(arrayBuffer as any)
    return createHash('md5').update(buffer).digest('hex')
  }

  /**
   * Busca un documento existente por hash para el mismo comprador
   * Si compradorId es null, busca globalmente (para documentos sin comprador aún)
   */
  private static async findDocumentoByHash(
    compradorId: string | null,
    fileHash: string
  ): Promise<Documento | null> {
    const supabase = createServerClient()

    let query = supabase
      .from('documentos')
      .select('*')
      .eq('file_hash', fileHash)
      .order('uploaded_at', { ascending: false })
      .limit(1)

    // Si hay comprador, buscar solo para ese comprador
    // Si no hay comprador, buscar globalmente (para evitar duplicados en borradores)
    if (compradorId) {
      query = query.eq('comprador_id', compradorId)
    }

    const { data, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No encontrado
      }
      throw new Error(`Error finding documento by hash: ${error.message}`)
    }

    return data as Documento
  }

  /**
   * Actualiza el comprador_id de documentos asociados a un trámite
   * Útil cuando se identifica el comprador después de subir documentos en borrador
   */
  static async updateDocumentosCompradorId(
    tramiteId: string,
    compradorId: string
  ): Promise<void> {
    const supabase = createServerClient()

    // Obtener todos los documentos asociados al trámite
    const { data: tramiteDocumentos, error: fetchError } = await supabase
      .from('tramite_documentos')
      .select('documento_id')
      .eq('tramite_id', tramiteId)

    if (fetchError) {
      throw new Error(`Error fetching documentos for tramite: ${fetchError.message}`)
    }

    if (!tramiteDocumentos || tramiteDocumentos.length === 0) {
      return // No hay documentos para actualizar
    }

    const documentoIds = tramiteDocumentos.map(td => td.documento_id)

    // Actualizar comprador_id de todos los documentos
    const { error: updateError } = await supabase
      .from('documentos')
      .update({ comprador_id: compradorId })
      .in('id', documentoIds)
      .is('comprador_id', null) // Solo actualizar los que no tienen comprador

    if (updateError) {
      throw new Error(`Error updating documentos comprador_id: ${updateError.message}`)
    }
  }

  /**
   * Sube un documento a S3 y guarda metadata en Supabase
   * Implementa deduplicación: si el archivo ya existe (mismo hash), reutiliza el documento existente
   */
  static async uploadDocumento(
    request: UploadDocumentoRequest,
    tramiteId?: string,
    tipoTramite?: string
  ): Promise<Documento> {
    const supabase = createServerClient()

    // Calcular hash del archivo para deduplicación
    const fileHash = await this.calculateFileHash(request.file)

    // Verificar si ya existe un documento con el mismo hash
    // Si hay comprador, buscar solo para ese comprador; si no, buscar globalmente
    const existingDocumento = await this.findDocumentoByHash(request.compradorId || null, fileHash)

    if (existingDocumento) {
      // Documento duplicado encontrado - reutilizar el existente
      console.log(`[DocumentoService] Documento duplicado detectado, reutilizando: ${existingDocumento.id}`)

      // Si hay un trámite, asociar el documento existente al trámite
      if (tramiteId) {
        // Verificar si ya está asociado
        const { data: existingAssociation } = await supabase
          .from('tramite_documentos')
          .select('id')
          .eq('tramite_id', tramiteId)
          .eq('documento_id', existingDocumento.id)
          .single()

        if (!existingAssociation) {
          // Asociar documento existente al trámite
          await supabase
            .from('tramite_documentos')
            .insert({
              tramite_id: tramiteId,
              documento_id: existingDocumento.id,
            })
        }
      }

      // Si el documento existente no tiene comprador pero ahora tenemos uno, actualizarlo
      if (!existingDocumento.comprador_id && request.compradorId) {
        await supabase
          .from('documentos')
          .update({ comprador_id: request.compradorId })
          .eq('id', existingDocumento.id)
      }

      return existingDocumento
    }

    // Documento nuevo - subir a S3
    // Si no hay comprador, usar tramiteId como identificador temporal
    // Cuando se identifique el comprador, los documentos se asociarán correctamente
    const compradorIdForS3 = request.compradorId || (tramiteId ? `temp-${tramiteId}` : `temp-${Date.now()}`)

    const s3Key = tramiteId && tipoTramite
      ? S3Service.generateKey(compradorIdForS3, tramiteId, tipoTramite, request.tipo, request.file.name)
      : S3Service.generateKeyForComprador(compradorIdForS3, request.tipo, request.file.name)

    // Subir a S3
    const s3Info = await S3Service.uploadFile({
      file: request.file,
      key: s3Key,
      contentType: request.file.type,
      metadata: request.metadata ? Object.fromEntries(
        Object.entries(request.metadata).map(([k, v]) => [k, String(v)])
      ) : undefined,
    })

    // Guardar metadata en Supabase con hash
    // usuario_id se pasa como parte del request (agregado en la API route)
    const { data: documento, error } = await supabase
      .from('documentos')
      .insert({
        comprador_id: request.compradorId || null,
        usuario_id: (request as any).usuarioId || null, // Agregado desde la API route
        tipo: request.tipo,
        nombre: request.file.name,
        s3_key: s3Info.key,
        s3_bucket: s3Info.bucket,
        tamaño: request.file.size,
        mime_type: request.file.type,
        file_hash: fileHash,
        metadata: request.metadata || null,
      })
      .select()
      .single()

    if (error) {
      // Si falla la inserción, intentar eliminar el archivo de S3
      try {
        await S3Service.deleteFile(s3Info.key)
      } catch (e) {
        console.error('Error deleting file from S3 after failed insert:', e)
      }
      throw new Error(`Error uploading documento: ${error.message}`)
    }

    // Si hay un trámite, asociar el documento al trámite
    if (tramiteId && documento) {
      await supabase
        .from('tramite_documentos')
        .insert({
          tramite_id: tramiteId,
          documento_id: documento.id,
        })
    }

    return documento as Documento
  }

  /**
   * Obtiene una URL firmada para descargar un documento
   */
  static async getDocumentoUrl(documentoId: string, expiresIn: number = 3600): Promise<string> {
    const supabase = createServerClient()

    // Obtener documento
    const { data: documento, error } = await supabase
      .from('documentos')
      .select('s3_key')
      .eq('id', documentoId)
      .single()

    if (error || !documento) {
      throw new Error(`Error finding documento: ${error?.message || 'Not found'}`)
    }

    // Generar URL firmada
    return await S3Service.getSignedUrl(documento.s3_key, expiresIn)
  }

  /**
   * Elimina un documento de S3 y Supabase
   */
  static async deleteDocumento(documentoId: string): Promise<void> {
    const supabase = createServerClient()

    // Obtener documento para obtener s3_key
    const { data: documento, error: fetchError } = await supabase
      .from('documentos')
      .select('s3_key')
      .eq('id', documentoId)
      .single()

    if (fetchError || !documento) {
      throw new Error(`Error finding documento: ${fetchError?.message || 'Not found'}`)
    }

    // Eliminar de S3
    try {
      await S3Service.deleteFile(documento.s3_key)
    } catch (e) {
      console.error('Error deleting file from S3:', e)
      // Continuar con la eliminación de la metadata aunque falle S3
    }

    // Eliminar metadata de Supabase
    const { error: deleteError } = await supabase
      .from('documentos')
      .delete()
      .eq('id', documentoId)

    if (deleteError) {
      throw new Error(`Error deleting documento metadata: ${deleteError.message}`)
    }
  }

  /**
   * Lista documentos de un comprador
   */
  static async listDocumentosByComprador(compradorId: string): Promise<Documento[]> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('comprador_id', compradorId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      throw new Error(`Error listing documentos: ${error.message}`)
    }

    return (data || []) as Documento[]
  }

  /**
   * Busca documentos compartidos (usados en múltiples trámites)
   */
  static async findDocumentosCompartidos(compradorId: string): Promise<Documento[]> {
    const supabase = createServerClient()

    // Documentos que aparecen en más de un trámite
    const { data, error } = await supabase
      .from('documentos')
      .select(`
        *,
        tramite_documentos!inner(tramite_id)
      `)
      .eq('comprador_id', compradorId)

    if (error) {
      throw new Error(`Error finding shared documentos: ${error.message}`)
    }

    // Filtrar documentos que aparecen en múltiples trámites
    const documentos = (data || []) as any[]
    const documentosCompartidos = documentos.filter((doc: any) => {
      const tramiteIds = new Set(
        (doc.tramite_documentos || []).map((td: any) => td.tramite_id)
      )
      return tramiteIds.size > 1
    })

    return documentosCompartidos.map((doc: any) => {
      const { tramite_documentos, ...documento } = doc
      return documento as Documento
    })
  }

  /**
   * Obtiene un documento por ID
   */
  static async findDocumentoById(id: string): Promise<Documento | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error finding documento: ${error.message}`)
    }

    return data as Documento
  }


  /**
   * Procesa y guarda texto extraído de un documento para RAG.
   * Genera embeddings y guarda chunks.
   * @param sessionId - Sesión de chat (prioritario para recuperar contexto al reabrir el chat)
   * @param tramiteId - Trámite (opcional; expedientes/upload lo usan)
   */
  static async processAndSaveText(
    documentoId: string,
    text: string,
    pageNumber: number = 1,
    options: { tramiteId?: string | null; sessionId?: string | null } = {}
  ): Promise<void> {
    const { tramiteId, sessionId } = options
    if (!text || !text.trim()) {
      console.warn('[DocumentoService.processAndSaveText] Skipping: text empty', { documentoId, sessionId: !!sessionId, tramiteId: !!tramiteId })
      return
    }
    if (!tramiteId && !sessionId) {
      console.warn('[DocumentoService.processAndSaveText] Skipping: neither tramiteId nor sessionId provided', { documentoId, textLength: text.length })
      return
    }

    const supabase = createServerClient()

    // 1. Generar Embedding
    const embedding = await EmbeddingsService.generateEmbedding(text)
    if (!embedding || !Array.isArray(embedding)) {
      console.error('[DocumentoService.processAndSaveText] No embedding generated (OPENAI_API_KEY o API falló). No se guardará chunk.', { documentoId, textLength: text.length })
      throw new Error('Embedding generation failed: OPENAI_API_KEY missing or API error')
    }

    // 2. Guardar Chunk (ligado a session_id y/o tramite_id)
    const payload = {
      documento_id: documentoId,
      tramite_id: tramiteId || null,
      session_id: sessionId || null,
      page_number: pageNumber,
      chunk_index: 0,
      text: text,
      embedding: embedding,
      metadata: { source: sessionId ? 'preaviso_chat' : 'ocr_upload' }
    }
    const { error } = await supabase
      .from('documento_text_chunks')
      .upsert(payload, {
        onConflict: 'documento_id,page_number,chunk_index'
      })

    if (error) {
      console.error('[DocumentoService.processAndSaveText] Error saving text chunk:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        documentoId,
        sessionId: sessionId ?? null,
        tramiteId: tramiteId ?? null
      })
      throw new Error(`documento_text_chunks upsert failed: ${error.message}`)
    }
  }

  /**
   * Guarda múltiples chunks del documento completo para RAG (reemplaza los chunks existentes para este documento/página).
   * Usar cuando se indexa el documento completo troceado (buildFullTextFromExtractedData + splitIntoChunks).
   */
  static async processAndSaveTextChunks(
    documentoId: string,
    textChunks: string[],
    pageNumber: number = 1,
    options: { tramiteId?: string | null; sessionId?: string | null } = {}
  ): Promise<void> {
    const { tramiteId, sessionId } = options
    const chunks = textChunks.map(t => t?.trim()).filter(Boolean)
    if (chunks.length === 0) {
      console.warn('[DocumentoService.processAndSaveTextChunks] No chunks to save', { documentoId })
      return
    }
    if (!tramiteId && !sessionId) {
      console.warn('[DocumentoService.processAndSaveTextChunks] Skipping: neither tramiteId nor sessionId provided', { documentoId, chunkCount: chunks.length })
      return
    }

    const supabase = createServerClient()

    // Reemplazar chunks existentes para este documento/página
    const { error: deleteError } = await supabase
      .from('documento_text_chunks')
      .delete()
      .eq('documento_id', documentoId)
      .eq('page_number', pageNumber)

    if (deleteError) {
      console.error('[DocumentoService.processAndSaveTextChunks] Error deleting previous chunks:', deleteError)
      throw new Error(`documento_text_chunks delete failed: ${deleteError.message}`)
    }

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i]
      const embedding = await EmbeddingsService.generateEmbedding(text)
      if (!embedding || !Array.isArray(embedding)) {
        console.error('[DocumentoService.processAndSaveTextChunks] No embedding for chunk', { documentoId, chunkIndex: i, textLength: text.length })
        throw new Error(`Embedding generation failed for chunk ${i}`)
      }
      const payload = {
        documento_id: documentoId,
        tramite_id: tramiteId || null,
        session_id: sessionId || null,
        page_number: pageNumber,
        chunk_index: i,
        text,
        embedding,
        metadata: { source: sessionId ? 'preaviso_chat' : 'ocr_upload', full_document: true }
      }
      const { error } = await supabase
        .from('documento_text_chunks')
        .insert(payload)

      if (error) {
        console.error('[DocumentoService.processAndSaveTextChunks] Error inserting chunk:', { chunkIndex: i, code: error.code, message: error.message })
        throw new Error(`documento_text_chunks insert failed: ${error.message}`)
      }
    }
  }

  /**
   * Busca chunks de documentos similares usando Semántica Vectorial (RAG).
   * Prioridad: si se pasa sessionId (conversación), filtra por sesión para tener contexto al reabrir el chat.
   */
  static async searchSimilarChunks(
    queryText: string,
    tramiteId?: string | null,
    threshold: number = 0.5,
    matchCount: number = 5,
    sessionId?: string | null
  ): Promise<any[]> {
    if (!queryText?.trim()) return []
    if (!tramiteId && !sessionId) return []

    const embedding = await EmbeddingsService.generateEmbedding(queryText)
    if (!embedding) return []

    const supabase = createServerClient()

    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: matchCount,
      filter_tramite_id: tramiteId || null,
      filter_session_id: sessionId || null
    })

    if (error) {
      console.error('[DocumentoService] Search error:', error)
      return []
    }

    return data || []
  }

  /**
   * Busca datos de extracción previos para un hash de archivo (Intelligent Processing)
   */
  static async findExtractionData(fileHash: string): Promise<any | null> {
    const supabase = createServerClient()

    // Buscar en la tabla dedicada de caché
    const { data, error } = await supabase
      .from('document_extractions')
      .select('data')
      .eq('file_hash', fileHash)
      .single()

    if (error || !data) return null

    return data.data
  }

  /**
   * Guarda datos de extracción para un hash
   */
  static async saveExtractionData(fileHash: string, extractionData: any): Promise<void> {
    const supabase = createServerClient()

    // Guardar en tabla dedicada (upsert)
    const { error } = await supabase
      .from('document_extractions')
      .upsert({
        file_hash: fileHash,
        data: extractionData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'file_hash'
      })

    if (error) {
      console.error('[DocumentoService] Error saving extraction data:', error)
    }
  }
}
