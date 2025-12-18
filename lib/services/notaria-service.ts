import { createServerClient } from '@/lib/supabase'
import type { Notaria, CreateNotariaRequest, UpdateNotariaRequest } from '@/lib/types/auth-types'

export class NotariaService {
  /**
   * Crea una nueva notaría
   */
  static async createNotaria(data: CreateNotariaRequest): Promise<Notaria> {
    const supabase = createServerClient()
    
    const { data: notariaData, error } = await supabase
      .from('notarias')
      .insert({
        nombre: data.nombre,
        activo: true,
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Error creando notaría: ${error.message}`)
    }
    
    return notariaData as Notaria
  }
  
  /**
   * Busca una notaría por ID
   */
  static async findNotariaById(id: string): Promise<Notaria | null> {
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('notarias')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error buscando notaría: ${error.message}`)
    }
    
    return data as Notaria
  }
  
  /**
   * Lista todas las notarías activas
   */
  static async listNotarias(activas: boolean = true): Promise<Notaria[]> {
    const supabase = createServerClient()
    
    let query = supabase
      .from('notarias')
      .select('*')
      .order('nombre', { ascending: true })
    
    if (activas) {
      query = query.eq('activo', true)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Error listando notarías: ${error.message}`)
    }
    
    return (data || []) as Notaria[]
  }
  
  /**
   * Actualiza una notaría
   */
  static async updateNotaria(id: string, updates: UpdateNotariaRequest): Promise<Notaria> {
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('notarias')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Error actualizando notaría: ${error.message}`)
    }
    
    return data as Notaria
  }
  
  /**
   * Desactiva una notaría (soft delete)
   */
  static async deactivateNotaria(id: string): Promise<void> {
    const supabase = createServerClient()
    
    const { error } = await supabase
      .from('notarias')
      .update({ activo: false })
      .eq('id', id)
    
    if (error) {
      throw new Error(`Error desactivando notaría: ${error.message}`)
    }
  }
}

