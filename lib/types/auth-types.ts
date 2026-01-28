// Tipos para el sistema de autenticación

export type UserRole = 'superadmin' | 'abogado'

export interface Notaria {
  id: string
  nombre: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Usuario {
  id: string
  notaria_id: string | null // NULL para superadmin
  auth_user_id: string | null // ID en Supabase Auth
  email: string
  nombre: string
  apellido_paterno?: string | null
  apellido_materno?: string | null
  telefono?: string | null
  rol: UserRole
  activo: boolean
  created_at: string
  updated_at: string
  last_login_at?: string | null
}

// Tipo para el usuario en el contexto de autenticación (simplificado)
export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  notariaId: string | null // NULL para superadmin
}

// Request para crear usuario
export interface CreateUsuarioRequest {
  email: string
  password: string
  nombre: string
  apellido_paterno?: string
  apellido_materno?: string
  telefono?: string
  rol: UserRole
  notaria_id?: string | null // NULL para superadmin, requerido para abogado
}

// Request para actualizar usuario
export interface UpdateUsuarioRequest {
  nombre?: string
  apellido_paterno?: string
  apellido_materno?: string
  telefono?: string
  rol?: UserRole
  notaria_id?: string | null
  activo?: boolean
}

// Request para login
export interface LoginRequest {
  email: string
  password: string
}

// Response de login
export interface LoginResponse {
  user: AuthUser
  session: {
    access_token: string
    refresh_token: string
    expires_at: number
  }
}

// Request para crear notaría
export interface CreateNotariaRequest {
  nombre: string
}

// Request para actualizar notaría
export interface UpdateNotariaRequest {
  nombre?: string
  activo?: boolean
}

