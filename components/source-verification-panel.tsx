"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  FileText, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Download,
  ExternalLink,
  Edit3
} from 'lucide-react'

interface DocumentSource {
  document: string
  page: number
  coordinates: { x: number; y: number; width: number; height: number }
  extractedText: string
  timestamp: Date
}

interface SelectedSection {
  id: string
  title: string
  content: string
  confidence: number
  source: DocumentSource
  type: string
}

interface SourceVerificationPanelProps {
  selectedSection: SelectedSection | null
  onClose: () => void
}

export function SourceVerificationPanel({ 
  selectedSection, 
  onClose 
}: SourceVerificationPanelProps) {
  const [zoom, setZoom] = useState(100)
  const [showOriginal, setShowOriginal] = useState(true)

  const handleViewComplete = () => {
    if (!selectedSection) return
    
    // Crear una ventana modal o expandir la vista del documento
    const modal = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes')
    
    if (modal) {
      modal.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Documento Original - ${selectedSection.source.document}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              background: #f5f5f5;
            }
            .document-container {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              max-width: 800px;
              margin: 0 auto;
            }
            .document-header {
              border-bottom: 2px solid #e5e5e5;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .highlighted-area {
              background: #fef3cd;
              border: 2px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
              position: relative;
            }
            .highlighted-area::before {
              content: "Área extraída";
              position: absolute;
              top: -10px;
              left: 10px;
              background: #f59e0b;
              color: white;
              padding: 2px 8px;
              font-size: 12px;
              border-radius: 3px;
            }
            .metadata {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 4px;
              margin-top: 20px;
              font-size: 14px;
            }
            .close-btn {
              position: fixed;
              top: 20px;
              right: 20px;
              background: #dc3545;
              color: white;
              border: none;
              padding: 10px 15px;
              border-radius: 4px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <button class="close-btn" onclick="window.close()">Cerrar</button>
          <div class="document-container">
            <div class="document-header">
              <h1>${selectedSection.source.document}</h1>
              <p><strong>Página:</strong> ${selectedSection.source.page}</p>
              <p><strong>Fecha:</strong> ${selectedSection.source.timestamp.toLocaleDateString()}</p>
            </div>
            
            <div class="highlighted-area">
              <strong>Texto extraído:</strong><br>
              ${selectedSection.source.extractedText}
            </div>
            
            <div class="metadata">
              <h3>Información de Extracción</h3>
              <p><strong>Confianza:</strong> ${Math.round(selectedSection.confidence * 100)}%</p>
              <p><strong>Coordenadas:</strong> X: ${selectedSection.source.coordinates.x}%, Y: ${selectedSection.source.coordinates.y}%</p>
              <p><strong>Dimensiones:</strong> ${selectedSection.source.coordinates.width}% × ${selectedSection.source.coordinates.height}%</p>
              <p><strong>Extraído el:</strong> ${selectedSection.source.timestamp.toLocaleString()}</p>
            </div>
          </div>
        </body>
        </html>
      `)
      modal.document.close()
    }
  }

  const handleDownload = () => {
    if (!selectedSection) return
    
    // Crear contenido del documento para descarga
    const content = `
DOCUMENTO ORIGINAL - ${selectedSection.source.document}
================================================

INFORMACIÓN DEL DOCUMENTO:
- Página: ${selectedSection.source.page}
- Fecha: ${selectedSection.source.timestamp.toLocaleDateString()}
- Confianza: ${Math.round(selectedSection.confidence * 100)}%

TEXTO EXTRAÍDO:
${selectedSection.source.extractedText}

INFORMACIÓN DE EXTRACCIÓN:
- Coordenadas: X: ${selectedSection.source.coordinates.x}%, Y: ${selectedSection.source.coordinates.y}%
- Dimensiones: ${selectedSection.source.coordinates.width}% × ${selectedSection.source.coordinates.height}%
- Extraído el: ${selectedSection.source.timestamp.toLocaleString()}

---
Generado por Sistema de Notaría Digital
    `.trim()

    // Crear y descargar archivo
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `documento_original_${selectedSection.source.document.replace(/\s+/g, '_')}_pagina_${selectedSection.source.page}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!selectedSection) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Selecciona una sección
          </h3>
          <p className="text-sm text-gray-600">
            Haz clic en cualquier sección del documento para ver su fuente y verificar la información extraída.
          </p>
        </div>
      </div>
    )
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.95) return 'bg-green-100 text-green-800 border-green-200'
    if (confidence >= 0.85) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-red-100 text-red-800 border-red-200'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.95) return <CheckCircle2 className="h-4 w-4" />
    if (confidence >= 0.85) return <AlertCircle className="h-4 w-4" />
    return <AlertCircle className="h-4 w-4" />
  }

  const getDocumentIcon = (documentName: string) => {
    if (documentName.includes('Escritura')) return <FileText className="h-5 w-5 text-blue-600" />
    if (documentName.includes('Plano')) return <MapPin className="h-5 w-5 text-green-600" />
    if (documentName.includes('Identificación')) return <CheckCircle2 className="h-5 w-5 text-purple-600" />
    return <FileText className="h-5 w-5 text-gray-600" />
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Verificación de Fuente</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center space-x-2">
          {getDocumentIcon(selectedSection.source.document)}
          <span className="font-medium text-gray-900">{selectedSection.source.document}</span>
          <Badge variant="outline" className="text-xs">
            Página {selectedSection.source.page}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            {/* Document Preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center space-x-2">
                    <Eye className="h-4 w-4" />
                    <span>Vista del Documento Original</span>
                  </CardTitle>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoom(Math.max(50, zoom - 25))}
                    >
                      <ZoomOut className="h-3 w-3" />
                    </Button>
                    <span className="text-xs text-gray-600 min-w-[3rem] text-center">
                      {zoom}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoom(Math.min(200, zoom + 25))}
                    >
                      <ZoomIn className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <div 
                    className="bg-gray-100 relative"
                    style={{ 
                      height: '400px',
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left'
                    }}
                  >
                    {/* Simulación del documento original */}
                    <div className="absolute inset-0 bg-white border-2 border-gray-300">
                      <div className="p-4 text-xs text-gray-600">
                        <div className="font-bold mb-2">{selectedSection.source.document}</div>
                        <div className="space-y-1">
                          <div>Página {selectedSection.source.page}</div>
                          <div>Fecha: {new Date().toLocaleDateString()}</div>
                        </div>
                      </div>
                      
                      {/* Área resaltada */}
                      <div 
                        className="absolute bg-yellow-200 border-2 border-yellow-400 rounded"
                        style={{
                          left: `${selectedSection.source.coordinates.x}%`,
                          top: `${selectedSection.source.coordinates.y}%`,
                          width: `${selectedSection.source.coordinates.width}%`,
                          height: `${selectedSection.source.coordinates.height}%`
                        }}
                      >
                        <div className="p-1 text-xs font-medium text-yellow-800">
                          {selectedSection.source.extractedText.substring(0, 50)}...
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 flex items-center justify-between">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleViewComplete()}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver completo
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDownload()}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Descargar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
