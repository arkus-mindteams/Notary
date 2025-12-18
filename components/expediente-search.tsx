"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, User, FileText, Loader2 } from 'lucide-react'
import { useFetchWithAuth } from '@/lib/hooks/use-fetch-with-auth'
import type { Comprador, ExpedienteCompleto } from '@/lib/types/expediente-types'

interface ExpedienteSearchProps {
  onExpedienteSelect: (expediente: ExpedienteCompleto) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function ExpedienteSearch({ onExpedienteSelect, searchQuery, onSearchChange }: ExpedienteSearchProps) {
  const fetchWithAuth = useFetchWithAuth()
  const [compradores, setCompradores] = useState<Comprador[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setCompradores([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetchWithAuth(`/api/expedientes/compradores?search=${encodeURIComponent(searchQuery)}`)
      
      if (!response.ok) {
        throw new Error('Error en la búsqueda')
      }

      const data = await response.json()
      setCompradores(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err.message || 'Error al buscar compradores')
      setCompradores([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCompradorClick = async (comprador: Comprador) => {
    setIsLoading(true)
    try {
      const response = await fetchWithAuth(`/api/expedientes/compradores?id=${comprador.id}`)
      if (!response.ok) {
        throw new Error('Error al cargar expediente')
      }
      const expediente: ExpedienteCompleto = await response.json()
      onExpedienteSelect(expediente)
    } catch (err: any) {
      setError(err.message || 'Error al cargar expediente')
    } finally {
      setIsLoading(false)
    }
  }

  // Búsqueda automática al escribir (con debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 3) {
        handleSearch()
      } else {
        setCompradores([])
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4">
      {/* Barra de búsqueda */}
      <Card>
        <CardContent className="p-4">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar por nombre, RFC o CURP..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch()
                  }
                }}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoading || !searchQuery.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mensaje de error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Resultados */}
      {compradores.length > 0 && (
        <Card className="flex-1 min-h-0">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Resultados ({compradores.length})
            </h3>
            <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
              {compradores.map((comprador) => (
                <Card
                  key={comprador.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleCompradorClick(comprador)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">{comprador.nombre}</h4>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            RFC: {comprador.rfc}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            CURP: {comprador.curp}
                          </Badge>
                        </div>
                        {comprador.direccion && (
                          <p className="text-sm text-gray-500 mt-1 truncate">{comprador.direccion}</p>
                        )}
                      </div>
                    </div>
                    <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sin resultados */}
      {!isLoading && searchQuery.trim().length >= 3 && compradores.length === 0 && !error && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No se encontraron compradores con ese criterio de búsqueda</p>
          </CardContent>
        </Card>
      )}

      {/* Estado inicial */}
      {!searchQuery && compradores.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              Busca un comprador por nombre, RFC o CURP para ver su expediente completo
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

