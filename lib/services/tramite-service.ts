import { createServerClient } from '@/lib/supabase'
import type { Tramite, CreateTramiteRequest, TipoTramite, EstadoTramite } from '@/lib/types/expediente-types'

export class TramiteService {
  /**
   * Crea un nuevo trámite
   */
  static async createTramite(data: CreateTramiteRequest): Promise<Tramite> {
    const supabase = createServerClient()

    const { data: tramite, error } = await supabase
      .from('tramites')
      .insert({
        comprador_id: data.compradorId || null,
        user_id: data.userId || null,
        tipo: data.tipo,
        datos: data.datos,
        estado: data.estado || 'en_proceso',
        notas: data.notas || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Error creating tramite: ${error.message}`)
    }

    return tramite as Tramite
  }

  /**
   * Busca el trámite activo (en_proceso) sin comprador para un usuario
   * Útil para detectar trámites en borrador que el usuario puede continuar
   */
  static async findActiveDraftTramite(
    userId: string,
    tipo: TipoTramite
  ): Promise<Tramite | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .eq('user_id', userId)
      .eq('tipo', tipo)
      .eq('estado', 'en_proceso')
      .is('comprador_id', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No encontrado
      }
      throw new Error(`Error finding active draft tramite: ${error.message}`)
    }

    return data as Tramite
  }

  /**
   * Busca trámites por comprador
   * Si notariaId se proporciona, filtra por notaría del comprador (para abogados)
   */
  static async findTramitesByCompradorId(
    compradorId: string,
    notariaId?: string | null
  ): Promise<Tramite[]> {
    const supabase = createServerClient()

    // Primero verificar que el comprador pertenece a la notaría (si se especifica)
    if (notariaId !== undefined && notariaId !== null) {
      const { data: comprador } = await supabase
        .from('compradores')
        .select('notaria_id')
        .eq('id', compradorId)
        .single()

      if (!comprador || comprador.notaria_id !== notariaId) {
        // El comprador no pertenece a la notaría del abogado
        return []
      }
    }

    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .eq('comprador_id', compradorId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Error finding tramites by comprador: ${error.message}`)
    }

    return (data || []) as Tramite[]
  }

  /**
   * Busca trámites por tipo
   */
  static async findTramitesByTipo(compradorId: string, tipo: TipoTramite): Promise<Tramite[]> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .eq('comprador_id', compradorId)
      .eq('tipo', tipo)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Error finding tramites by tipo: ${error.message}`)
    }

    return (data || []) as Tramite[]
  }

  /**
   * Busca un trámite por ID
   */
  static async findTramiteById(id: string): Promise<Tramite | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error finding tramite by ID: ${error.message}`)
    }

    return data as Tramite
  }

  /**
   * Actualiza un trámite
   */
  static async updateTramite(
    id: string,
    updates: {
      comprador_id?: string | null
      datos?: any
      estado?: EstadoTramite
      documento_generado?: any
      notas?: string
    }
  ): Promise<Tramite> {
    const supabase = createServerClient()

    const updateData: any = {}
    if (updates.comprador_id !== undefined) updateData.comprador_id = updates.comprador_id
    if (updates.datos !== undefined) updateData.datos = updates.datos
    if (updates.estado !== undefined) updateData.estado = updates.estado
    if (updates.documento_generado !== undefined) updateData.documento_generado = updates.documento_generado
    if (updates.notas !== undefined) updateData.notas = updates.notas || null

    const { data, error } = await supabase
      .from('tramites')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Error updating tramite: ${error.message}`)
    }

    return data as Tramite
  }

  /**
   * Elimina un trámite
   */
  static async deleteTramite(id: string): Promise<void> {
    const supabase = createServerClient()

    const { error } = await supabase
      .from('tramites')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Error deleting tramite: ${error.message}`)
    }
  }
}

