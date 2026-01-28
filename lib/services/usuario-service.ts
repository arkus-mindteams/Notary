import { createServerClient } from '@/lib/supabase'
import type { Usuario, CreateUsuarioRequest, UpdateUsuarioRequest } from '@/lib/types/auth-types'

export class UsuarioService {
  /**
   * Crea un nuevo usuario en Supabase Auth y en la tabla usuarios
   */
  static async createUsuario(data: CreateUsuarioRequest): Promise<Usuario> {
    const supabase = createServerClient()
    
    // Validar: abogados deben tener notaria_id
    if (data.rol === 'abogado' && !data.notaria_id) {
      throw new Error('Los abogados deben tener una notaría asignada')
    }
    
    // Validar: superadmin no debe tener notaria_id
    if (data.rol === 'superadmin' && data.notaria_id) {
      throw new Error('El superadmin no debe tener notaría asignada (es global)')
    }
    
    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true, // Auto-confirmar email
    })
    
    if (authError) {
      throw new Error(`Error creando usuario en Auth: ${authError.message}`)
    }
    
    if (!authData.user) {
      throw new Error('No se pudo crear el usuario en Auth')
    }
    
    // 2. Crear registro en tabla usuarios
    const { data: usuarioData, error: usuarioError } = await supabase
      .from('usuarios')
      .insert({
        notaria_id: data.notaria_id || null,
        auth_user_id: authData.user.id,
        email: data.email,
        nombre: data.nombre,
        apellido_paterno: data.apellido_paterno,
        apellido_materno: data.apellido_materno,
        telefono: data.telefono,
        rol: data.rol,
        activo: true,
      })
      .select()
      .single()
    
    if (usuarioError) {
      // Si falla, intentar eliminar el usuario de Auth
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(`Error creando usuario: ${usuarioError.message}`)
    }
    
    return usuarioData as Usuario
  }
  
  /**
   * Busca un usuario por email
   */
  static async findUsuarioByEmail(email: string): Promise<Usuario | null> {
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .eq('activo', true)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error buscando usuario: ${error.message}`)
    }
    
    return data as Usuario
  }
  
  /**
   * Busca un usuario por auth_user_id
   */
  static async findUsuarioByAuthId(authUserId: string): Promise<Usuario | null> {
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', authUserId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error buscando usuario: ${error.message}`)
    }
    
    return data as Usuario
  }
  
  /**
   * Busca un usuario por ID
   */
  static async findUsuarioById(id: string): Promise<Usuario | null> {
    if (!id || id === 'undefined' || id === 'null') {
      throw new Error('ID de usuario inválido')
    }
    
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Error buscando usuario: ${error.message}`)
    }
    
    return data as Usuario
  }
  
  /**
   * Lista todos los usuarios (con filtros opcionales)
   */
  static async listUsuarios(options?: {
    notariaId?: string | null
    rol?: 'superadmin' | 'abogado'
    activos?: boolean
  }): Promise<Usuario[]> {
    const supabase = createServerClient()
    
    let query = supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (options?.notariaId !== undefined) {
      if (options.notariaId === null) {
        query = query.is('notaria_id', null)
      } else {
        query = query.eq('notaria_id', options.notariaId)
      }
    }
    
    if (options?.rol) {
      query = query.eq('rol', options.rol)
    }
    
    if (options?.activos !== undefined) {
      query = query.eq('activo', options.activos)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Error listando usuarios: ${error.message}`)
    }
    
    return (data || []) as Usuario[]
  }
  
  /**
   * Actualiza un usuario
   */
  static async updateUsuario(id: string, updates: UpdateUsuarioRequest): Promise<Usuario> {
    if (!id || id === 'undefined' || id === 'null') {
      throw new Error('ID de usuario inválido')
    }
    
    const supabase = createServerClient()
    
    // Validar constraints si se actualiza rol o notaria_id
    if (updates.rol || updates.notaria_id !== undefined) {
      const usuario = await this.findUsuarioById(id)
      if (!usuario) {
        throw new Error('Usuario no encontrado')
      }
      
      const nuevoRol = updates.rol || usuario.rol
      const nuevaNotariaId = updates.notaria_id !== undefined ? updates.notaria_id : usuario.notaria_id
      
      if (nuevoRol === 'abogado' && !nuevaNotariaId) {
        throw new Error('Los abogados deben tener una notaría asignada')
      }
      
      if (nuevoRol === 'superadmin' && nuevaNotariaId) {
        throw new Error('El superadmin no debe tener notaría asignada')
      }
    }
    
    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Error actualizando usuario: ${error.message}`)
    }
    
    return data as Usuario
  }
  
  /**
   * Actualiza la fecha de último login
   */
  static async updateLastLogin(authUserId: string): Promise<void> {
    const supabase = createServerClient()
    
    const { error } = await supabase
      .from('usuarios')
      .update({ last_login_at: new Date().toISOString() })
      .eq('auth_user_id', authUserId)
    
    if (error) {
      console.error('Error actualizando last_login_at:', error)
      // No lanzar error, es solo un log
    }
  }
  
  /**
   * Desactiva un usuario (soft delete)
   */
  static async deactivateUsuario(id: string): Promise<void> {
    const supabase = createServerClient()
    
    const { error } = await supabase
      .from('usuarios')
      .update({ activo: false })
      .eq('id', id)
    
    if (error) {
      throw new Error(`Error desactivando usuario: ${error.message}`)
    }
  }
  
  /**
   * Elimina un usuario (hard delete - solo para superadmin)
   */
  static async deleteUsuario(id: string): Promise<void> {
    const supabase = createServerClient()
    
    // Obtener auth_user_id antes de eliminar
    const usuario = await this.findUsuarioById(id)
    if (!usuario) {
      throw new Error('Usuario no encontrado')
    }
    
    // Eliminar de tabla usuarios
    const { error: usuarioError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id)
    
    if (usuarioError) {
      throw new Error(`Error eliminando usuario: ${usuarioError.message}`)
    }
    
    // Eliminar de Supabase Auth si existe auth_user_id
    if (usuario.auth_user_id) {
      const { error: authError } = await supabase.auth.admin.deleteUser(usuario.auth_user_id)
      if (authError) {
        console.error('Error eliminando usuario de Auth:', authError)
        // No lanzar error, el usuario ya fue eliminado de la tabla
      }
    }
  }
}

