"use client"

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  FileText, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Archive,
  Eye,
  Download
} from 'lucide-react'
import type { TramiteConDocumentos } from '@/lib/types/expediente-types'

interface TramitesListProps {
  tramites: TramiteConDocumentos[]
  compradorId: string
}

export function TramitesList({ tramites, compradorId }: TramitesListProps) {
  const [selectedTramite, setSelectedTramite] = useState<string | null>(null)

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'completado':
        return (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completado
          </Badge>
        )
      case 'en_proceso':
        return (
          <Badge className="bg-blue-100 text-blue-700">
            <Clock className="h-3 w-3 mr-1" />
            En Proceso
          </Badge>
        )
      case 'archivado':
        return (
          <Badge className="bg-gray-100 text-gray-700">
            <Archive className="h-3 w-3 mr-1" />
            Archivado
          </Badge>
        )
      default:
        return <Badge variant="outline">{estado}</Badge>
    }
  }

  const getTipoTramiteBadge = (tipo: string) => {
    const tipos: Record<string, { label: string; color: string }> = {
      preaviso: { label: 'Pre-Aviso', color: 'bg-blue-100 text-blue-700' },
      plano_arquitectonico: { label: 'Plano Arquitectónico', color: 'bg-purple-100 text-purple-700' },
      otro: { label: 'Otro', color: 'bg-gray-100 text-gray-700' },
    }
    const tipoInfo = tipos[tipo] || tipos.otro
    return <Badge className={tipoInfo.color}>{tipoInfo.label}</Badge>
  }

  const formatTramiteData = (tramite: TramiteConDocumentos) => {
    if (tramite.tipo === 'preaviso') {
      const datos = tramite.datos as any
      return {
        inmueble: datos.inmueble?.direccion || 'N/A',
        valor: datos.inmueble?.valor || 'N/A',
        actos: datos.actosNotariales,
      }
    } else if (tramite.tipo === 'plano_arquitectonico') {
      const datos = tramite.datos as any
      return {
        unidades: datos.unidades?.length || 0,
        ubicacion: datos.lotLocation || 'N/A',
      }
    }
    return null
  }

  if (tramites.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay trámites registrados para este comprador</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-400px)]">
      {tramites.map((tramite) => {
        const tramiteData = formatTramiteData(tramite)
        const isExpanded = selectedTramite === tramite.id

        return (
          <Card 
            key={tramite.id} 
            className={`transition-all ${isExpanded ? 'border-blue-300 shadow-md' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {getTipoTramiteBadge(tramite.tipo)}
                    {getEstadoBadge(tramite.estado)}
                  </div>
                  
                  {tramite.tipo === 'preaviso' && tramiteData && (
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><strong>Inmueble:</strong> {tramiteData.inmueble}</p>
                      <p><strong>Valor:</strong> {tramiteData.valor}</p>
                      {tramiteData.actos && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tramiteData.actos.compraventa && (
                            <Badge variant="secondary" className="text-xs">Compraventa</Badge>
                          )}
                          {tramiteData.actos.cancelacionCreditoVendedor && (
                            <Badge variant="secondary" className="text-xs">Cancelación Crédito</Badge>
                          )}
                          {tramiteData.actos.aperturaCreditoComprador && (
                            <Badge variant="secondary" className="text-xs">Apertura Crédito</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {tramite.tipo === 'plano_arquitectonico' && tramiteData && (
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><strong>Unidades:</strong> {tramiteData.unidades}</p>
                      <p><strong>Ubicación:</strong> {tramiteData.ubicacion}</p>
                    </div>
                  )}

                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(tramite.created_at).toLocaleDateString('es-MX')}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <FileText className="h-3 w-3" />
                      <span>{tramite.documentos.length} documento(s)</span>
                    </span>
                  </div>

                  {/* Detalles expandidos */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Documentos asociados:</h4>
                        {tramite.documentos.length > 0 ? (
                          <div className="space-y-1">
                            {tramite.documentos.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                                <span className="flex items-center space-x-2">
                                  <FileText className="h-4 w-4 text-gray-400" />
                                  <span>{doc.nombre}</span>
                                  <Badge variant="outline" className="text-xs">{doc.tipo}</Badge>
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(`/api/expedientes/documentos?id=${doc.id}`)
                                      if (response.ok) {
                                        const { url } = await response.json()
                                        window.open(url, '_blank')
                                      }
                                    } catch (error) {
                                      console.error('Error obteniendo URL:', error)
                                    }
                                  }}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Ver
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No hay documentos asociados</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col space-y-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTramite(isExpanded ? null : tramite.id)}
                  >
                    {isExpanded ? 'Ocultar' : 'Ver Detalles'}
                  </Button>
                  {tramite.documento_generado && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        // Descargar documento generado
                        // TODO: Implementar descarga
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Descargar
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

