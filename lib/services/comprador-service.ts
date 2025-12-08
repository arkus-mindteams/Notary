import { createServerClient } from '@/lib/supabase'
import type { Comprador, CreateCompradorRequest } from '@/lib/types/expediente-types'

export class CompradorService {
  /**
   * Crea un nuevo comprador
   */
  static async createComprador(data: CreateCompradorRequest): Promise<Comprador> {
    const supabase = createServerClient()

    const { data: comprador, error } = await supabase
      .from('compradores')
      .insert({
        nombre: data.nombre,
        rfc: data.rfc,
        curp: data.curp,
        direccion: data.direccion || null,
        telefono: data.telefono || null,
        email: data.email || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Error creating comprador: ${error.message}`)
    }

    return comprador as Comprador
  }

  /**
   * Busca un comprador por RFC
   */
  static async findCompradorByRFC(rfc: string): Promise<Comprador | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('compradores')
      .select('*')
      .eq('rfc', rfc)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw new Error(`Error finding comprador by RFC: ${error.message}`)
    }

    return data as Comprador
  }

  /**
   * Busca un comprador por CURP
   */
  static async findCompradorByCURP(curp: string): Promise<Comprador | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('compradores')
      .select('*')
      .eq('curp', curp)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error finding comprador by CURP: ${error.message}`)
    }

    return data as Comprador
  }

  /**
   * Busca un comprador por ID
   */
  static async findCompradorById(id: string): Promise<Comprador | null> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('compradores')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error finding comprador by ID: ${error.message}`)
    }

    return data as Comprador
  }

  /**
   * Busca compradores por nombre, RFC o CURP
   */
  static async searchCompradores(query: string, limit: number = 20): Promise<Comprador[]> {
    const supabase = createServerClient()

    const searchQuery = `%${query}%`

    const { data, error } = await supabase
      .from('compradores')
      .select('*')
      .or(`nombre.ilike.${searchQuery},rfc.ilike.${searchQuery},curp.ilike.${searchQuery}`)
      .limit(limit)

    if (error) {
      throw new Error(`Error searching compradores: ${error.message}`)
    }

    return (data || []) as Comprador[]
  }

  /**
   * Actualiza un comprador
   */
  static async updateComprador(id: string, updates: Partial<CreateCompradorRequest>): Promise<Comprador> {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('compradores')
      .update({
        ...(updates.nombre && { nombre: updates.nombre }),
        ...(updates.rfc && { rfc: updates.rfc }),
        ...(updates.curp && { curp: updates.curp }),
        ...(updates.direccion !== undefined && { direccion: updates.direccion || null }),
        ...(updates.telefono !== undefined && { telefono: updates.telefono || null }),
        ...(updates.email !== undefined && { email: updates.email || null }),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Error updating comprador: ${error.message}`)
    }

    return data as Comprador
  }

  /**
   * Busca o crea un comprador por RFC/CURP
   * Útil para evitar duplicados
   */
  static async findOrCreateComprador(data: CreateCompradorRequest): Promise<Comprador> {
    // Primero intentar buscar por RFC
    let comprador = await this.findCompradorByRFC(data.rfc)
    
    if (comprador) {
      return comprador
    }

    // Si no existe por RFC, buscar por CURP
    comprador = await this.findCompradorByCURP(data.curp)
    
    if (comprador) {
      return comprador
    }

    // Si no existe, crear nuevo
    return await this.createComprador(data)
  }
}

