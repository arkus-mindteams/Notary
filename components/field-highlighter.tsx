"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Eye, 
  EyeOff, 
  MapPin, 
  User, 
  FileText, 
  Hash, 
  Building,
  Calendar,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { ExtractedFields } from '@/lib/ai-processor'

interface HighlightedField {
  id: string
  label: string
  value: string
  confidence: number
  category: 'notario' | 'partes' | 'acto' | 'folio' | 'inmueble'
  position: { x: number; y: number; width: number; height: number }
  icon: React.ReactNode
}

interface FieldHighlighterProps {
  extractedFields: ExtractedFields[]
  onFieldClick?: (field: HighlightedField) => void
  selectedField?: string | null
}

export function FieldHighlighter({ 
  extractedFields, 
  onFieldClick, 
  selectedField 
}: FieldHighlighterProps) {
  const [highlightedFields, setHighlightedFields] = useState<HighlightedField[]>([])
  const [showHighlights, setShowHighlights] = useState(true)
  const [hoveredField, setHoveredField] = useState<string | null>(null)

  useEffect(() => {
    if (extractedFields.length > 0) {
      const fields = createHighlightedFields(extractedFields[0])
      setHighlightedFields(fields)
    }
  }, [extractedFields])

  const createHighlightedFields = (fields: ExtractedFields): HighlightedField[] => {
    const highlighted: HighlightedField[] = []
    let yPosition = 50

    // Notario
    highlighted.push({
      id: 'notario_nombre',
      label: 'Nombre del Notario',
      value: fields.notario.nombre,
      confidence: 0.95,
      category: 'notario',
      position: { x: 50, y: yPosition, width: 300, height: 30 },
      icon: <User className="h-4 w-4" />
    })
    yPosition += 40

    highlighted.push({
      id: 'notario_numero',
      label: 'Número de Notaría',
      value: fields.notario.numero,
      confidence: 0.95,
      category: 'notario',
      position: { x: 50, y: yPosition, width: 150, height: 30 },
      icon: <Hash className="h-4 w-4" />
    })
    yPosition += 40

    // Partes
    highlighted.push({
      id: 'vendedor',
      label: 'Vendedor',
      value: fields.partes.vendedor,
      confidence: fields.confianza,
      category: 'partes',
      position: { x: 50, y: yPosition, width: 300, height: 30 },
      icon: <User className="h-4 w-4" />
    })
    yPosition += 40

    highlighted.push({
      id: 'comprador',
      label: 'Comprador',
      value: fields.partes.comprador,
      confidence: fields.confianza,
      category: 'partes',
      position: { x: 50, y: yPosition, width: 300, height: 30 },
      icon: <User className="h-4 w-4" />
    })
    yPosition += 50

    // Acto Jurídico
    highlighted.push({
      id: 'acto_tipo',
      label: 'Tipo de Acto',
      value: fields.actoJuridico.tipo,
      confidence: fields.confianza,
      category: 'acto',
      position: { x: 50, y: yPosition, width: 400, height: 30 },
      icon: <FileText className="h-4 w-4" />
    })
    yPosition += 40

    // Folio Real
    highlighted.push({
      id: 'folio_numero',
      label: 'Folio Real',
      value: fields.folioReal.numero,
      confidence: fields.confianza,
      category: 'folio',
      position: { x: 50, y: yPosition, width: 150, height: 30 },
      icon: <Hash className="h-4 w-4" />
    })
    yPosition += 40

    highlighted.push({
      id: 'folio_seccion',
      label: 'Sección',
      value: fields.folioReal.seccion,
      confidence: fields.confianza,
      category: 'folio',
      position: { x: 220, y: yPosition - 40, width: 100, height: 30 },
      icon: <Hash className="h-4 w-4" />
    })

    highlighted.push({
      id: 'folio_partida',
      label: 'Partida',
      value: fields.folioReal.partida,
      confidence: fields.confianza,
      category: 'folio',
      position: { x: 340, y: yPosition - 40, width: 100, height: 30 },
      icon: <Hash className="h-4 w-4" />
    })
    yPosition += 50

    // Inmueble
    highlighted.push({
      id: 'inmueble_fraccionamiento',
      label: 'Fraccionamiento',
      value: fields.inmueble.fraccionamiento,
      confidence: fields.confianza,
      category: 'inmueble',
      position: { x: 50, y: yPosition, width: 200, height: 30 },
      icon: <MapPin className="h-4 w-4" />
    })
    yPosition += 40

    highlighted.push({
      id: 'inmueble_unidad',
      label: 'Unidad',
      value: fields.inmueble.unidad,
      confidence: fields.confianza,
      category: 'inmueble',
      position: { x: 50, y: yPosition, width: 80, height: 30 },
      icon: <Building className="h-4 w-4" />
    })

    highlighted.push({
      id: 'inmueble_lote',
      label: 'Lote',
      value: fields.inmueble.lote,
      confidence: fields.confianza,
      category: 'inmueble',
      position: { x: 150, y: yPosition, width: 80, height: 30 },
      icon: <Building className="h-4 w-4" />
    })

    highlighted.push({
      id: 'inmueble_manzana',
      label: 'Manzana',
      value: fields.inmueble.manzana,
      confidence: fields.confianza,
      category: 'inmueble',
      position: { x: 250, y: yPosition, width: 80, height: 30 },
      icon: <Building className="h-4 w-4" />
    })
    yPosition += 40

    highlighted.push({
      id: 'inmueble_direccion',
      label: 'Dirección Completa',
      value: fields.inmueble.direccion,
      confidence: fields.confianza,
      category: 'inmueble',
      position: { x: 50, y: yPosition, width: 500, height: 30 },
      icon: <MapPin className="h-4 w-4" />
    })

    return highlighted
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'notario': return 'bg-blue-100 border-blue-300 text-blue-800'
      case 'partes': return 'bg-green-100 border-green-300 text-green-800'
      case 'acto': return 'bg-purple-100 border-purple-300 text-purple-800'
      case 'folio': return 'bg-orange-100 border-orange-300 text-orange-800'
      case 'inmueble': return 'bg-red-100 border-red-300 text-red-800'
      default: return 'bg-gray-100 border-gray-300 text-gray-800'
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800'
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.9) return <CheckCircle2 className="h-3 w-3" />
    if (confidence >= 0.7) return <AlertCircle className="h-3 w-3" />
    return <AlertCircle className="h-3 w-3" />
  }

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'notario': return 'Notario'
      case 'partes': return 'Partes'
      case 'acto': return 'Acto Jurídico'
      case 'folio': return 'Folio Real'
      case 'inmueble': return 'Inmueble'
      default: return 'Otros'
    }
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold">Campos Extraídos</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHighlights(!showHighlights)}
          >
            {showHighlights ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showHighlights ? 'Ocultar' : 'Mostrar'} Resaltados
          </Button>
        </div>
        <div className="text-sm text-gray-600">
          {highlightedFields.length} campos detectados
        </div>
      </div>

      {/* Lista de campos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {highlightedFields.map((field) => (
          <Card 
            key={field.id}
            className={`cursor-pointer transition-all duration-200 ${
              selectedField === field.id 
                ? 'ring-2 ring-blue-500 shadow-lg' 
                : hoveredField === field.id 
                  ? 'shadow-md' 
                  : 'hover:shadow-sm'
            }`}
            onMouseEnter={() => setHoveredField(field.id)}
            onMouseLeave={() => setHoveredField(null)}
            onClick={() => onFieldClick?.(field)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {field.icon}
                  <span className="text-sm font-medium text-gray-600">
                    {getCategoryName(field.category)}
                  </span>
                </div>
                <Badge className={getConfidenceColor(field.confidence)}>
                  {getConfidenceIcon(field.confidence)}
                  <span className="ml-1">{Math.round(field.confidence * 100)}%</span>
                </Badge>
              </div>
              
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{field.label}</p>
                <p className="text-sm font-medium text-gray-900 line-clamp-2">
                  {field.value}
                </p>
              </div>
              
              {showHighlights && (
                <div className="mt-3 p-2 rounded border-l-4 border-l-yellow-400 bg-yellow-50">
                  <p className="text-xs text-yellow-800">
                    Campo resaltado en el documento original
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Resumen por categoría */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen por Categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {['notario', 'partes', 'acto', 'folio', 'inmueble'].map((category) => {
              const categoryFields = highlightedFields.filter(f => f.category === category)
              const avgConfidence = categoryFields.length > 0 
                ? categoryFields.reduce((sum, f) => sum + f.confidence, 0) / categoryFields.length 
                : 0
              
              return (
                <div key={category} className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${getCategoryColor(category)}`}>
                    {getCategoryName(category).charAt(0)}
                  </div>
                  <p className="text-sm font-medium mt-2">{getCategoryName(category)}</p>
                  <p className="text-xs text-gray-600">{categoryFields.length} campos</p>
                  <Badge className={`mt-1 ${getConfidenceColor(avgConfidence)}`}>
                    {Math.round(avgConfidence * 100)}%
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



