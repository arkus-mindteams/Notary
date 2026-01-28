"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  FileText, 
  Download, 
  Eye,
  Calendar,
  Share2,
  AlertCircle
} from 'lucide-react'
import type { Documento, TramiteConDocumentos } from '@/lib/types/expediente-types'

interface DocumentosListProps {
  documentos: Documento[]
  tramites: TramiteConDocumentos[]
  compradorId: string
}

export function DocumentosList({ documentos, tramites, compradorId }: DocumentosListProps) {
  const [documentosCompartidos, setDocumentosCompartidos] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Identificar documentos compartidos (usados en múltiples trámites)
    const docCounts = new Map<string, number>()
    tramites.forEach(tramite => {
      tramite.documentos.forEach(doc => {
        docCounts.set(doc.id, (docCounts.get(doc.id) || 0) + 1)
      })
    })

    const compartidos = new Set<string>()
    docCounts.forEach((count, docId) => {
      if (count > 1) {
        compartidos.add(docId)
      }
    })
    setDocumentosCompartidos(compartidos)
  }, [tramites])

  const getTipoBadge = (tipo: string) => {
    const tipos: Record<string, { label: string; color: string }> = {
      escritura: { label: 'Escritura', color: 'bg-blue-100 text-blue-700' },
      plano: { label: 'Plano', color: 'bg-green-100 text-green-700' },
      plano_arquitectonico: { label: 'Plano Arquitectónico', color: 'bg-purple-100 text-purple-700' },
      croquis_catastral: { label: 'Croquis Catastral', color: 'bg-yellow-100 text-yellow-700' },
      ine_vendedor: { label: 'INE Vendedor', color: 'bg-orange-100 text-orange-700' },
      ine_comprador: { label: 'INE Comprador', color: 'bg-pink-100 text-pink-700' },
      rfc: { label: 'RFC', color: 'bg-gray-100 text-gray-700' },
      documento_generado: { label: 'Documento Generado', color: 'bg-indigo-100 text-indigo-700' },
    }
    const tipoInfo = tipos[tipo] || { label: tipo, color: 'bg-gray-100 text-gray-700' }
    return <Badge className={tipoInfo.color}>{tipoInfo.label}</Badge>
  }

  const getTramitesQueUsanDocumento = (documentoId: string): string[] => {
    const tramitesQueUsan: string[] = []
    tramites.forEach(tramite => {
      if (tramite.documentos.some(doc => doc.id === documentoId)) {
        tramitesQueUsan.push(tramite.id)
      }
    })
    return tramitesQueUsan
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  const handleViewDocument = async (documento: Documento) => {
    try {
      const response = await fetch(`/api/expedientes/documentos?id=${documento.id}`)
      if (response.ok) {
        const { url } = await response.json()
        window.open(url, '_blank')
      } else {
        throw new Error('Error obteniendo URL del documento')
      }
    } catch (error) {
      console.error('Error obteniendo URL:', error)
      alert('Error al abrir el documento. Por favor, intente de nuevo.')
    }
  }

  if (documentos.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay documentos registrados para este comprador</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-400px)]">
      {documentos.map((documento) => {
        const isCompartido = documentosCompartidos.has(documento.id)
        const tramitesQueUsan = getTramitesQueUsanDocumento(documento.id)

        return (
          <Card key={documento.id} className={isCompartido ? 'border-blue-300 bg-blue-50/30' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    {getTipoBadge(documento.tipo)}
                    {isCompartido && (
                      <Badge className="bg-blue-100 text-blue-700">
                        <Share2 className="h-3 w-3 mr-1" />
                        Compartido
                      </Badge>
                    )}
                  </div>
                  
                  <h4 className="font-semibold text-gray-900 truncate mb-1">{documento.nombre}</h4>
                  
                  <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
                    <span className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(documento.uploaded_at).toLocaleDateString('es-MX')}</span>
                    </span>
                    <span>{formatFileSize(documento.tamaño)}</span>
                    {isCompartido && (
                      <span className="text-blue-600">
                        Usado en {tramitesQueUsan.length} trámite(s)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex space-x-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDocument(documento)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/expedientes/documentos?id=${documento.id}`)
                        if (response.ok) {
                          const { url } = await response.json()
                          const a = document.createElement('a')
                          a.href = url
                          a.download = documento.nombre
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                        }
                      } catch (error) {
                        console.error('Error descargando:', error)
                        alert('Error al descargar el documento')
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descargar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

