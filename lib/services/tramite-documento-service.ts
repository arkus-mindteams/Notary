import { createServerClient } from '@/lib/supabase'
import type { TramiteDocumento, Documento, AsociarDocumentoRequest } from '@/lib/types/expediente-types'

export class TramiteDocumentoService {
  /**
   * Asocia un documento a un trámite
   */
  static async asociarDocumentoATramite(request: AsociarDocumentoRequest): Promise<TramiteDocumento> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramite_documentos')
      .insert({
        tramite_id: request.tramiteId,
        documento_id: request.documentoId,
        notas: request.notas || null,
      })
      .select()
      .single()

    if (error) {
      // Si ya existe la asociación, retornar la existente
      if (error.code === '23505') { // Unique violation
        const existing = await this.findAsociacion(request.tramiteId, request.documentoId)
        if (existing) {
          return existing
        }
      }
      throw new Error(`Error associating documento to tramite: ${error.message}`)
    }

    return data as TramiteDocumento
  }

  /**
   * Desasocia un documento de un trámite
   */
  static async desasociarDocumentoDeTramite(tramiteId: string, documentoId: string): Promise<void> {
    const supabase = createServerClient()

    const { error } = await supabase
      .from('tramite_documentos')
      .delete()
      .eq('tramite_id', tramiteId)
      .eq('documento_id', documentoId)

    if (error) {
      throw new Error(`Error disassociating documento from tramite: ${error.message}`)
    }
  }

  /**
   * Lista documentos de un trámite
   */
  static async listDocumentosPorTramite(tramiteId: string): Promise<Documento[]> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramite_documentos')
      .select(`
        documento_id,
        documentos (*)
      `)
      .eq('tramite_id', tramiteId)

    if (error) {
      throw new Error(`Error listing documentos for tramite: ${error.message}`)
    }

    return (data || []).map((item: any) => item.documentos) as Documento[]
  }

  /**
   * Busca documentos compartidos (usados en múltiples trámites)
   */
  static async buscarDocumentosCompartidos(compradorId: string): Promise<Documento[]> {
    const supabase = createServerClient()

    // Documentos que aparecen en más de un trámite del mismo comprador
    const { data, error } = await supabase
      .from('tramite_documentos')
      .select(`
        documento_id,
        documentos!inner (*)
      `)
      .eq('documentos.comprador_id', compradorId)

    if (error) {
      throw new Error(`Error finding shared documentos: ${error.message}`)
    }

    // Agrupar por documento_id y contar cuántos trámites lo usan
    const documentoCounts = new Map<string, number>()
    const documentosMap = new Map<string, Documento>()

    ;(data || []).forEach((item: any) => {
      const docId = item.documento_id
      const doc = item.documentos as Documento
      
      documentoCounts.set(docId, (documentoCounts.get(docId) || 0) + 1)
      documentosMap.set(docId, doc)
    })

    // Filtrar documentos que aparecen en más de un trámite
    const documentosCompartidos: Documento[] = []
    documentoCounts.forEach((count, docId) => {
      if (count > 1) {
        const doc = documentosMap.get(docId)
        if (doc) {
          documentosCompartidos.push(doc)
        }
      }
    })

    return documentosCompartidos
  }

  /**
   * Encuentra una asociación específica
   */
  private static async findAsociacion(tramiteId: string, documentoId: string): Promise<TramiteDocumento | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramite_documentos')
      .select('*')
      .eq('tramite_id', tramiteId)
      .eq('documento_id', documentoId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error finding asociacion: ${error.message}`)
    }

    return data as TramiteDocumento
  }

  /**
   * Obtiene todos los trámites que usan un documento
   */
  static async getTramitesPorDocumento(documentoId: string): Promise<string[]> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramite_documentos')
      .select('tramite_id')
      .eq('documento_id', documentoId)

    if (error) {
      throw new Error(`Error getting tramites for documento: ${error.message}`)
    }

    return (data || []).map((item: any) => item.tramite_id)
  }
}

