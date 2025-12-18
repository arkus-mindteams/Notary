import { createServerClient } from '@/lib/supabase'

export interface PreavisoConfig {
  id: string
  prompt: string
  json_schema: Record<string, any>
  created_at: string
  updated_at: string
}

export interface UpdatePreavisoConfigRequest {
  prompt?: string
  json_schema?: Record<string, any>
}

export class PreavisoConfigService {
  /**
   * Obtiene la configuración actual del preaviso
   * Solo hay una configuración global
   */
  static async getConfig(): Promise<PreavisoConfig | null> {
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('preaviso_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No hay registros
        return null
      }
      throw new Error(`Error obteniendo configuración: ${error.message}`)
    }
    
    return data as PreavisoConfig
  }

  /**
   * Actualiza la configuración del preaviso
   * Solo hay una configuración global, así que actualiza el único registro
   */
  static async updateConfig(data: UpdatePreavisoConfigRequest): Promise<PreavisoConfig> {
    const supabase = createServerClient()
    
    // Primero obtener el registro existente
    const existing = await this.getConfig()
    
    if (!existing) {
      throw new Error('No existe configuración para actualizar')
    }
    
    const updateData: any = {}
    if (data.prompt !== undefined) {
      updateData.prompt = data.prompt
    }
    if (data.json_schema !== undefined) {
      updateData.json_schema = data.json_schema
    }
    
    const { data: updated, error } = await supabase
      .from('preaviso_config')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Error actualizando configuración: ${error.message}`)
    }
    
    return updated as PreavisoConfig
  }
}

