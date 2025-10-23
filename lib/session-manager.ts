"use client"

import { GeneratedDocument } from './document-generator'

export interface DocumentSession {
  id: string
  title: string
  type: 'preaviso' | 'escritura' | 'testamento' | 'poder'
  status: 'draft' | 'processing' | 'completed' | 'exported'
  createdAt: Date
  updatedAt: Date
  document?: GeneratedDocument
  metadata: {
    notaria: string
    folio: string
    confidence: number
  }
  files: {
    name: string
    type: string
    size: number
    uploadedAt: Date
  }[]
  progress: {
    uploaded: number
    processed: number
    validated: number
    generated: number
  }
}

export interface SessionHistory {
  sessions: DocumentSession[]
  lastAccessed: Date
}

export class SessionManager {
  private static readonly STORAGE_KEY = 'notaria_sessions'
  private static readonly MAX_SESSIONS = 50

  // Guardar sesión
  static saveSession(session: DocumentSession): void {
    try {
      const history = this.getSessionHistory()
      
      // Actualizar o agregar sesión
      const existingIndex = history.sessions.findIndex(s => s.id === session.id)
      if (existingIndex >= 0) {
        history.sessions[existingIndex] = session
      } else {
        history.sessions.unshift(session) // Agregar al inicio
      }

      // Limitar número de sesiones
      if (history.sessions.length > this.MAX_SESSIONS) {
        history.sessions = history.sessions.slice(0, this.MAX_SESSIONS)
      }

      history.lastAccessed = new Date()
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history))
    } catch (error) {
      console.error('Error guardando sesión:', error)
    }
  }

  // Obtener sesión por ID
  static getSession(sessionId: string): DocumentSession | null {
    try {
      const history = this.getSessionHistory()
      return history.sessions.find(s => s.id === sessionId) || null
    } catch (error) {
      console.error('Error obteniendo sesión:', error)
      return null
    }
  }

  // Obtener todas las sesiones
  static getAllSessions(): DocumentSession[] {
    try {
      const history = this.getSessionHistory()
      return history.sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      console.error('Error obteniendo sesiones:', error)
      return []
    }
  }

  // Obtener sesiones por tipo
  static getSessionsByType(type: DocumentSession['type']): DocumentSession[] {
    return this.getAllSessions().filter(session => session.type === type)
  }

  // Obtener sesiones por estado
  static getSessionsByStatus(status: DocumentSession['status']): DocumentSession[] {
    return this.getAllSessions().filter(session => session.status === status)
  }

  // Actualizar estado de sesión
  static updateSessionStatus(sessionId: string, status: DocumentSession['status']): void {
    try {
      const session = this.getSession(sessionId)
      if (session) {
        session.status = status
        session.updatedAt = new Date()
        this.saveSession(session)
      }
    } catch (error) {
      console.error('Error actualizando estado de sesión:', error)
    }
  }

  // Actualizar progreso de sesión
  static updateSessionProgress(sessionId: string, progress: Partial<DocumentSession['progress']>): void {
    try {
      const session = this.getSession(sessionId)
      if (session) {
        session.progress = { ...session.progress, ...progress }
        session.updatedAt = new Date()
        this.saveSession(session)
      }
    } catch (error) {
      console.error('Error actualizando progreso de sesión:', error)
    }
  }

  // Eliminar sesión
  static deleteSession(sessionId: string): void {
    try {
      const history = this.getSessionHistory()
      history.sessions = history.sessions.filter(s => s.id !== sessionId)
      history.lastAccessed = new Date()
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history))
    } catch (error) {
      console.error('Error eliminando sesión:', error)
    }
  }

  // Limpiar sesiones antiguas (más de 30 días)
  static cleanOldSessions(): void {
    try {
      const history = this.getSessionHistory()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      history.sessions = history.sessions.filter(session => 
        new Date(session.updatedAt) > thirtyDaysAgo
      )

      history.lastAccessed = new Date()
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history))
    } catch (error) {
      console.error('Error limpiando sesiones antiguas:', error)
    }
  }

  // Crear nueva sesión
  static createSession(
    type: DocumentSession['type'],
    title: string,
    metadata: DocumentSession['metadata']
  ): DocumentSession {
    const session: DocumentSession = {
      id: this.generateSessionId(),
      title,
      type,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata,
      files: [],
      progress: {
        uploaded: 0,
        processed: 0,
        validated: 0,
        generated: 0
      }
    }

    this.saveSession(session)
    return session
  }

  // Obtener estadísticas de sesiones
  static getSessionStats(): {
    total: number
    byType: Record<DocumentSession['type'], number>
    byStatus: Record<DocumentSession['status'], number>
    recent: number
  } {
    const sessions = this.getAllSessions()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    return {
      total: sessions.length,
      byType: sessions.reduce((acc, session) => {
        acc[session.type] = (acc[session.type] || 0) + 1
        return acc
      }, {} as Record<DocumentSession['type'], number>),
      byStatus: sessions.reduce((acc, session) => {
        acc[session.status] = (acc[session.status] || 0) + 1
        return acc
      }, {} as Record<DocumentSession['status'], number>),
      recent: sessions.filter(session => 
        new Date(session.updatedAt) > sevenDaysAgo
      ).length
    }
  }

  // Exportar sesiones (para backup)
  static exportSessions(): string {
    try {
      const history = this.getSessionHistory()
      return JSON.stringify(history, null, 2)
    } catch (error) {
      console.error('Error exportando sesiones:', error)
      return '{}'
    }
  }

  // Importar sesiones (para restore)
  static importSessions(jsonData: string): boolean {
    try {
      const history = JSON.parse(jsonData) as SessionHistory
      
      // Validar estructura
      if (!history.sessions || !Array.isArray(history.sessions)) {
        throw new Error('Formato de datos inválido')
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history))
      return true
    } catch (error) {
      console.error('Error importando sesiones:', error)
      return false
    }
  }

  // Obtener historial de sesiones desde localStorage
  private static getSessionHistory(): SessionHistory {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        const history = JSON.parse(stored) as SessionHistory
        
        // Convertir fechas de string a Date
        history.sessions.forEach(session => {
          session.createdAt = new Date(session.createdAt)
          session.updatedAt = new Date(session.updatedAt)
          session.files.forEach(file => {
            file.uploadedAt = new Date(file.uploadedAt)
          })
        })
        
        history.lastAccessed = new Date(history.lastAccessed)
        
        return history
      }
    } catch (error) {
      console.error('Error parseando historial de sesiones:', error)
    }

    // Retornar historial vacío si no hay datos o hay error
    return {
      sessions: [],
      lastAccessed: new Date()
    }
  }

  // Generar ID único para sesión
  private static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}


