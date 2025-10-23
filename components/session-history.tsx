"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  FileText, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Download, 
  Trash2, 
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Archive
} from 'lucide-react'
import { SessionManager, DocumentSession } from '@/lib/session-manager'

interface SessionHistoryProps {
  onSelectSession?: (session: DocumentSession) => void
  onDeleteSession?: (sessionId: string) => void
  className?: string
}

export function SessionHistory({ 
  onSelectSession, 
  onDeleteSession,
  className = ""
}: SessionHistoryProps) {
  const [sessions, setSessions] = useState<DocumentSession[]>([])
  const [filteredSessions, setFilteredSessions] = useState<DocumentSession[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [stats, setStats] = useState({
    total: 0,
    byType: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    recent: 0
  })

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    filterSessions()
  }, [sessions, searchQuery, typeFilter, statusFilter])

  const loadSessions = () => {
    const allSessions = SessionManager.getAllSessions()
    setSessions(allSessions)
    setStats(SessionManager.getSessionStats())
  }

  const filterSessions = () => {
    let filtered = sessions

    // Filtrar por búsqueda
    if (searchQuery) {
      filtered = filtered.filter(session =>
        session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.metadata.folio.includes(searchQuery) ||
        session.metadata.notaria.includes(searchQuery)
      )
    }

    // Filtrar por tipo
    if (typeFilter !== 'all') {
      filtered = filtered.filter(session => session.type === typeFilter)
    }

    // Filtrar por estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(session => session.status === statusFilter)
    }

    setFilteredSessions(filtered)
  }

  const getStatusIcon = (status: DocumentSession['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
      case 'exported':
        return <Download className="h-4 w-4 text-purple-600" />
      case 'draft':
        return <Clock className="h-4 w-4 text-gray-600" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: DocumentSession['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'exported':
        return 'bg-purple-100 text-purple-800'
      case 'draft':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeIcon = (type: DocumentSession['type']) => {
    switch (type) {
      case 'preaviso':
        return <FileText className="h-4 w-4 text-blue-600" />
      case 'escritura':
        return <FileText className="h-4 w-4 text-green-600" />
      case 'testamento':
        return <FileText className="h-4 w-4 text-purple-600" />
      case 'poder':
        return <FileText className="h-4 w-4 text-orange-600" />
      default:
        return <FileText className="h-4 w-4 text-gray-600" />
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleDeleteSession = (sessionId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta sesión?')) {
      SessionManager.deleteSession(sessionId)
      loadSessions()
      onDeleteSession?.(sessionId)
    }
  }

  const handleExportSessions = () => {
    const data = SessionManager.exportSessions()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notaria_sessions_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header y Estadísticas */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Historial de Sesiones</h2>
          <p className="text-gray-600">
            {stats.total} sesiones totales • {stats.recent} recientes
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleExportSessions}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={loadSessions}>
            <Archive className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar sesiones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="preaviso">Pre-aviso</SelectItem>
                <SelectItem value="escritura">Escritura</SelectItem>
                <SelectItem value="testamento">Testamento</SelectItem>
                <SelectItem value="poder">Poder</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="exported">Exportado</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchQuery('')
              setTypeFilter('all')
              setStatusFilter('all')
            }}>
              <Filter className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Sesiones */}
      <ScrollArea className="h-96">
        <div className="space-y-3">
          {filteredSessions.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No hay sesiones
                  </h3>
                  <p className="text-gray-600">
                    {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                      ? 'No se encontraron sesiones con los filtros aplicados'
                      : 'Aún no has creado ninguna sesión'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredSessions.map((session) => (
              <Card key={session.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        {getTypeIcon(session.type)}
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {session.title}
                        </h3>
                        <Badge className={getStatusColor(session.status)}>
                          {getStatusIcon(session.status)}
                          <span className="ml-1 capitalize">{session.status}</span>
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-3">
                        <div>
                          <span className="font-medium">Notaría:</span> {session.metadata.notaria}
                        </div>
                        <div>
                          <span className="font-medium">Folio:</span> {session.metadata.folio}
                        </div>
                        <div>
                          <span className="font-medium">Archivos:</span> {session.files.length}
                        </div>
                        <div>
                          <span className="font-medium">Confianza:</span> {Math.round(session.metadata.confidence * 100)}%
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>Creado: {formatDate(session.createdAt)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>Actualizado: {formatDate(session.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectSession?.(session)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSession(session.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}


