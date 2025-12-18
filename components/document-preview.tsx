"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  FileText,
  Download,
  Edit,
  Eye,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  MapPin,
  Hash
} from 'lucide-react'
import { GeneratedDocument } from '@/lib/document-generator'
import DOMPurify from 'dompurify'

interface DocumentPreviewProps {
  document: GeneratedDocument
  onEdit?: () => void
  onExport?: () => void
  onApprove?: () => void
}

export function DocumentPreview({ 
  document, 
  onEdit, 
  onExport, 
  onApprove 
}: DocumentPreviewProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'html' | 'text'>('preview')
  const [selectedSection, setSelectedSection] = useState<string | null>(null)

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800'
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.9) return <CheckCircle2 className="h-4 w-4" />
    if (confidence >= 0.7) return <AlertCircle className="h-4 w-4" />
    return <AlertCircle className="h-4 w-4" />
  }

  const renderPreview = () => (
    <div className="space-y-6">
      {/* Header del documento */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">
          {document.title}
        </h1>
        <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center space-x-1">
            <Hash className="h-4 w-4" />
            <span>Notaría {document.metadata.notaria}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Calendar className="h-4 w-4" />
            <span>{document.metadata.generatedAt.toLocaleDateString('es-MX')}</span>
          </div>
          <Badge className={getConfidenceColor(document.metadata.confidence)}>
            {getConfidenceIcon(document.metadata.confidence)}
            <span className="ml-1">{Math.round(document.metadata.confidence * 100)}%</span>
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Navegación de secciones */}
      <div className="flex flex-wrap gap-2">
        {document.sections.map((section) => (
          <Button
            key={section.id}
            variant={selectedSection === section.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedSection(
              selectedSection === section.id ? null : section.id
            )}
            className="text-xs"
          >
            {section.title}
          </Button>
        ))}
      </div>

      {/* Contenido de las secciones */}
      <div className="space-y-4">
        {document.sections
          .filter(section => !selectedSection || section.id === selectedSection)
          .map((section) => (
            <Card key={section.id} className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center space-x-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                    {section.order}
                  </span>
                  <span>{section.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <div
                    className="whitespace-pre-line text-gray-700 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(section.content.replace(/\n/g, '<br>'), {
                        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'span', 'div'],
                        ALLOWED_ATTR: ['class', 'style']
                      })
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  )

  const renderHTML = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Vista HTML</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const blob = new Blob([document.html], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${document.title.replace(/\s+/g, '_')}.html`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Descargar HTML
        </Button>
      </div>
      <div
        className="border rounded-lg p-4 bg-white max-h-96 overflow-auto"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(document.html, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th'],
            ALLOWED_ATTR: ['class', 'style', 'colspan', 'rowspan']
          })
        }}
      />
    </div>
  )

  const renderText = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Vista de Texto</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const blob = new Blob([document.text], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${document.title.replace(/\s+/g, '_')}.txt`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Descargar TXT
        </Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg max-h-96 overflow-auto">
        {document.text}
      </pre>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header con controles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle className="text-xl">Documento Generado</CardTitle>
                <p className="text-sm text-gray-600">
                  {document.sections.length} secciones • 
                  Generado el {document.metadata.generatedAt.toLocaleString('es-MX')}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className={getConfidenceColor(document.metadata.confidence)}>
                {getConfidenceIcon(document.metadata.confidence)}
                <span className="ml-1">{Math.round(document.metadata.confidence * 100)}% confianza</span>
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Controles de vista */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex space-x-2">
              <Button
                variant={viewMode === 'preview' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('preview')}
              >
                <Eye className="h-4 w-4 mr-2" />
                Vista Previa
              </Button>
              <Button
                variant={viewMode === 'html' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('html')}
              >
                <FileText className="h-4 w-4 mr-2" />
                HTML
              </Button>
              <Button
                variant={viewMode === 'text' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('text')}
              >
                <FileText className="h-4 w-4 mr-2" />
                Texto
              </Button>
            </div>
            
            <div className="flex space-x-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              )}
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              )}
              {onApprove && (
                <Button size="sm" onClick={onApprove}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Aprobar
                </Button>
              )}
            </div>
          </div>

          {/* Contenido según el modo de vista */}
          <div className="min-h-96">
            {viewMode === 'preview' && renderPreview()}
            {viewMode === 'html' && renderHTML()}
            {viewMode === 'text' && renderText()}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



