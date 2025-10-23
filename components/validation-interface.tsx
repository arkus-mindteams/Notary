"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  Eye, 
  EyeOff, 
  Save, 
  RotateCcw,
  User,
  MapPin,
  FileText,
  Hash,
  Calendar,
  Building
} from 'lucide-react'
import { ExtractedFields } from '@/lib/ai-processor'
import { DataValidator, ValidationResult } from '@/lib/data-validator'
import { ValidationAlerts } from '@/components/validation-alerts'
import { Progress } from '@/components/ui/progress'

interface ValidationField {
  id: string
  label: string
  value: string
  originalValue: string
  confidence: number
  isEdited: boolean
  isValid: boolean
  error?: string
  icon: React.ReactNode
  category: 'notario' | 'partes' | 'acto' | 'folio' | 'inmueble'
}

interface ValidationInterfaceProps {
  extractedFields: ExtractedFields[]
  onValidate: (validatedFields: ExtractedFields[]) => void
  onBack: () => void
}

export function ValidationInterface({ 
  extractedFields, 
  onValidate, 
  onBack 
}: ValidationInterfaceProps) {
  const [fields, setFields] = useState<ValidationField[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [showAllFields, setShowAllFields] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [showValidationDetails, setShowValidationDetails] = useState(false)

  // Inicializar campos de validación
  useEffect(() => {
    if (extractedFields.length > 0) {
      const consolidatedFields = consolidateFields(extractedFields)
      setFields(consolidatedFields)
      validateFields(consolidatedFields)
    }
  }, [extractedFields])

  // Validar campos en tiempo real
  const validateFields = (fieldsToValidate: ValidationField[]) => {
    const consolidatedData = {
      notario: {
        nombre: fieldsToValidate.find(f => f.id === 'notario_nombre')?.value || '',
        numero: fieldsToValidate.find(f => f.id === 'notario_numero')?.value || '',
        ubicacion: fieldsToValidate.find(f => f.id === 'notario_ubicacion')?.value || ''
      },
      partes: {
        vendedor: fieldsToValidate.find(f => f.id === 'vendedor')?.value || '',
        comprador: fieldsToValidate.find(f => f.id === 'comprador')?.value || ''
      },
      folioReal: {
        numero: fieldsToValidate.find(f => f.id === 'folio_numero')?.value || '',
        seccion: fieldsToValidate.find(f => f.id === 'folio_seccion')?.value || '',
        partida: fieldsToValidate.find(f => f.id === 'folio_partida')?.value || ''
      },
      inmueble: {
        direccion: fieldsToValidate.find(f => f.id === 'inmueble_direccion')?.value || '',
        fraccionamiento: fieldsToValidate.find(f => f.id === 'inmueble_fraccionamiento')?.value || '',
        municipio: fieldsToValidate.find(f => f.id === 'inmueble_municipio')?.value || ''
      }
    }

    const result = DataValidator.validateExtractedFields(consolidatedData)
    setValidationResult(result)
  }

  const consolidateFields = (fields: ExtractedFields[]): ValidationField[] => {
    // Tomar el primer documento como base
    const base = fields[0]
    const allFields: ValidationField[] = []

    // Campos del notario
    allFields.push({
      id: 'notario_nombre',
      label: 'Nombre del Notario',
      value: base.notario.nombre,
      originalValue: base.notario.nombre,
      confidence: 0.95,
      isEdited: false,
      isValid: true,
      icon: <User className="h-4 w-4" />,
      category: 'notario'
    })

    allFields.push({
      id: 'notario_numero',
      label: 'Número de Notaría',
      value: base.notario.numero,
      originalValue: base.notario.numero,
      confidence: 0.95,
      isEdited: false,
      isValid: true,
      icon: <Hash className="h-4 w-4" />,
      category: 'notario'
    })

    allFields.push({
      id: 'notario_ubicacion',
      label: 'Ubicación de la Notaría',
      value: base.notario.ubicacion,
      originalValue: base.notario.ubicacion,
      confidence: 0.95,
      isEdited: false,
      isValid: true,
      icon: <MapPin className="h-4 w-4" />,
      category: 'notario'
    })

    // Campos de las partes
    allFields.push({
      id: 'vendedor',
      label: 'Vendedor',
      value: base.partes.vendedor,
      originalValue: base.partes.vendedor,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <User className="h-4 w-4" />,
      category: 'partes'
    })

    allFields.push({
      id: 'comprador',
      label: 'Comprador',
      value: base.partes.comprador,
      originalValue: base.partes.comprador,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <User className="h-4 w-4" />,
      category: 'partes'
    })

    // Campos del acto jurídico
    allFields.push({
      id: 'acto_tipo',
      label: 'Tipo de Acto Jurídico',
      value: base.actoJuridico.tipo,
      originalValue: base.actoJuridico.tipo,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <FileText className="h-4 w-4" />,
      category: 'acto'
    })

    allFields.push({
      id: 'acto_descripcion',
      label: 'Descripción del Acto',
      value: base.actoJuridico.descripcion,
      originalValue: base.actoJuridico.descripcion,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <FileText className="h-4 w-4" />,
      category: 'acto'
    })

    // Campos del folio real
    allFields.push({
      id: 'folio_numero',
      label: 'Número de Folio Real',
      value: base.folioReal.numero,
      originalValue: base.folioReal.numero,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <Hash className="h-4 w-4" />,
      category: 'folio'
    })

    allFields.push({
      id: 'folio_seccion',
      label: 'Sección del Folio',
      value: base.folioReal.seccion,
      originalValue: base.folioReal.seccion,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <Hash className="h-4 w-4" />,
      category: 'folio'
    })

    allFields.push({
      id: 'folio_partida',
      label: 'Partida del Folio',
      value: base.folioReal.partida,
      originalValue: base.folioReal.partida,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <Hash className="h-4 w-4" />,
      category: 'folio'
    })

    // Campos del inmueble
    allFields.push({
      id: 'inmueble_unidad',
      label: 'Unidad',
      value: base.inmueble.unidad,
      originalValue: base.inmueble.unidad,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <Building className="h-4 w-4" />,
      category: 'inmueble'
    })

    allFields.push({
      id: 'inmueble_lote',
      label: 'Lote',
      value: base.inmueble.lote,
      originalValue: base.inmueble.lote,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <Building className="h-4 w-4" />,
      category: 'inmueble'
    })

    allFields.push({
      id: 'inmueble_manzana',
      label: 'Manzana',
      value: base.inmueble.manzana,
      originalValue: base.inmueble.manzana,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <Building className="h-4 w-4" />,
      category: 'inmueble'
    })

    allFields.push({
      id: 'inmueble_fraccionamiento',
      label: 'Fraccionamiento',
      value: base.inmueble.fraccionamiento,
      originalValue: base.inmueble.fraccionamiento,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <MapPin className="h-4 w-4" />,
      category: 'inmueble'
    })

    allFields.push({
      id: 'inmueble_municipio',
      label: 'Municipio',
      value: base.inmueble.municipio,
      originalValue: base.inmueble.municipio,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <MapPin className="h-4 w-4" />,
      category: 'inmueble'
    })

    allFields.push({
      id: 'inmueble_direccion',
      label: 'Dirección Completa',
      value: base.inmueble.direccion,
      originalValue: base.inmueble.direccion,
      confidence: base.confianza,
      isEdited: false,
      isValid: true,
      icon: <MapPin className="h-4 w-4" />,
      category: 'inmueble'
    })

    return allFields
  }

  const handleFieldEdit = (fieldId: string, newValue: string) => {
    const updatedFields = fields.map(field => 
      field.id === fieldId 
        ? { 
            ...field, 
            value: newValue, 
            isEdited: newValue !== field.originalValue,
            isValid: validateField(fieldId, newValue)
          }
        : field
    )
    
    setFields(updatedFields)
    validateFields(updatedFields)
  }

  const validateField = (fieldId: string, value: string): boolean => {
    if (!value.trim()) return false
    
    // Validaciones específicas por campo usando el validador
    switch (fieldId) {
      case 'notario_numero':
      case 'folio_numero':
        return DataValidator.validateFolio(value).isValid
      case 'vendedor':
      case 'comprador':
        return DataValidator.validateFullName(value, 'Nombre').isValid
      case 'notario_nombre':
        return DataValidator.validateFullName(value, 'Nombre del notario').isValid
      case 'inmueble_direccion':
        return DataValidator.validateAddress(value).isValid
      default:
        return true
    }
  }

  const handleSaveField = (fieldId: string) => {
    setEditingField(null)
    validateAllFields()
  }

  const handleResetField = (fieldId: string) => {
    const updatedFields = fields.map(field => 
      field.id === fieldId 
        ? { 
            ...field, 
            value: field.originalValue, 
            isEdited: false,
            isValid: true
          }
        : field
    )
    
    setFields(updatedFields)
    validateFields(updatedFields)
    setEditingField(null)
  }

  const validateAllFields = () => {
    const errors: string[] = []
    
    fields.forEach(field => {
      if (!field.isValid) {
        errors.push(`${field.label}: ${field.error || 'Valor inválido'}`)
      }
    })
    
    setValidationErrors(errors)
    validateFields(fields) // También ejecutar validación completa
    return errors.length === 0
  }

  const handleValidate = () => {
    const isValid = validateAllFields()
    
    if (isValid && validationResult?.isValid) {
      // Convertir campos validados de vuelta a ExtractedFields
      const validatedFields = convertToExtractedFields(fields)
      onValidate(validatedFields)
    }
  }

  const convertToExtractedFields = (fields: ValidationField[]): ExtractedFields[] => {
    const fieldMap = fields.reduce((acc, field) => {
      acc[field.id] = field.value
      return acc
    }, {} as Record<string, string>)

    return [{
      notario: {
        nombre: fieldMap.notario_nombre || '',
        numero: fieldMap.notario_numero || '',
        ubicacion: fieldMap.notario_ubicacion || ''
      },
      partes: {
        vendedor: fieldMap.vendedor || '',
        comprador: fieldMap.comprador || ''
      },
      actoJuridico: {
        tipo: fieldMap.acto_tipo || '',
        descripcion: fieldMap.acto_descripcion || ''
      },
      folioReal: {
        numero: fieldMap.folio_numero || '',
        seccion: fieldMap.folio_seccion || '',
        partida: fieldMap.folio_partida || ''
      },
      inmueble: {
        unidad: fieldMap.inmueble_unidad || '',
        lote: fieldMap.inmueble_lote || '',
        manzana: fieldMap.inmueble_manzana || '',
        fraccionamiento: fieldMap.inmueble_fraccionamiento || '',
        municipio: fieldMap.inmueble_municipio || '',
        direccion: fieldMap.inmueble_direccion || ''
      },
      confianza: 0.95
    }]
  }

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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'notario': return <User className="h-5 w-5 text-blue-600" />
      case 'partes': return <User className="h-5 w-5 text-green-600" />
      case 'acto': return <FileText className="h-5 w-5 text-purple-600" />
      case 'folio': return <Hash className="h-5 w-5 text-orange-600" />
      case 'inmueble': return <MapPin className="h-5 w-5 text-red-600" />
      default: return <FileText className="h-5 w-5" />
    }
  }

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'notario': return 'Datos del Notario'
      case 'partes': return 'Partes Involucradas'
      case 'acto': return 'Acto Jurídico'
      case 'folio': return 'Folio Real'
      case 'inmueble': return 'Datos del Inmueble'
      default: return 'Otros'
    }
  }

  const groupedFields = fields.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = []
    }
    acc[field.category].push(field)
    return acc
  }, {} as Record<string, ValidationField[]>)

  const visibleFields = showAllFields ? fields : fields.filter(field => field.confidence < 0.9 || field.isEdited)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Validación de Datos</h1>
          <p className="text-gray-600 mt-1">
            Revisa y corrige los datos extraídos por IA antes de generar el documento
          </p>
          {validationResult && (
            <div className="mt-2 flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-green-600">
                  {fields.filter(f => f.isValid).length} campos válidos
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-600">
                  {fields.filter(f => !f.isValid).length} campos con errores
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <span className="text-blue-600">
                  {fields.filter(f => f.isEdited).length} campos editados
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setShowAllFields(!showAllFields)}>
            {showAllFields ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showAllFields ? 'Ocultar' : 'Mostrar'} Todos
          </Button>
          <Button variant="outline" onClick={onBack}>
            Volver
          </Button>
        </div>
      </div>

      {/* Barra de progreso general */}
      {validationResult && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Progreso de validación
                </span>
                <span className="text-sm text-gray-500">
                  {fields.filter(f => f.isValid).length} de {fields.length} campos
                </span>
              </div>
              <Progress 
                value={(fields.filter(f => f.isValid).length / fields.length) * 100} 
                className="h-2"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span className="font-medium">
                  {Math.round((fields.filter(f => f.isValid).length / fields.length) * 100)}%
                </span>
                <span>100%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alertas de validación en tiempo real */}
      {validationResult && (
        <ValidationAlerts
          validationResult={validationResult}
          onShowDetails={() => setShowValidationDetails(!showValidationDetails)}
          showDetails={showValidationDetails}
        />
      )}

      {/* Errores de validación (legacy) */}
      {validationErrors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Errores de validación encontrados:</span>
            </div>
            <ul className="mt-2 list-disc list-inside text-sm text-red-700">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Campos agrupados por categoría */}
      <div className="space-y-6">
        {Object.entries(groupedFields).map(([category, categoryFields]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getCategoryIcon(category)}
                  <span>{getCategoryName(category)}</span>
                  <Badge variant="outline">
                    {categoryFields.length} campos
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  {categoryFields.filter(f => f.isValid).length === categoryFields.length ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Completado
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {categoryFields.filter(f => !f.isValid).length} errores
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoryFields
                .filter(field => showAllFields || field.confidence < 0.9 || field.isEdited)
                .map((field) => (
                <div key={field.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center space-x-2">
                      {field.icon}
                      <span>{field.label}</span>
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Badge className={getConfidenceColor(field.confidence)}>
                        {getConfidenceIcon(field.confidence)}
                        <span className="ml-1">{Math.round(field.confidence * 100)}%</span>
                      </Badge>
                      {field.isEdited && (
                        <Badge variant="outline" className="text-blue-600">
                          <Edit3 className="h-3 w-3 mr-1" />
                          Editado
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {editingField === field.id ? (
                    <div className="space-y-2">
                      <Input
                        value={field.value}
                        onChange={(e) => handleFieldEdit(field.id, e.target.value)}
                        className={!field.isValid ? 'border-red-300' : ''}
                      />
                      <div className="flex space-x-2">
                        <Button size="sm" onClick={() => handleSaveField(field.id)}>
                          <Save className="h-4 w-4 mr-1" />
                          Guardar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleResetField(field.id)}>
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restaurar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        field.isEdited 
                          ? 'bg-blue-50 border-blue-200' 
                          : field.confidence < 0.9 
                            ? 'bg-yellow-50 border-yellow-200' 
                            : 'bg-gray-50 border-gray-200'
                      }`}
                      onClick={() => setEditingField(field.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className={field.isEdited ? 'text-blue-800' : 'text-gray-700'}>
                          {field.value}
                        </span>
                        <Edit3 className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  )}
                  
                  {!field.isValid && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {field.error || 'Valor inválido'}
                      </p>
                    </div>
                  )}
                  
                  {field.isValid && field.isEdited && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-sm text-green-600 flex items-center">
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Campo editado y validado correctamente
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Botones de acción */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {fields.filter(f => f.isEdited).length} campos editados • 
              {fields.filter(f => f.confidence < 0.9).length} campos con baja confianza • 
              {validationResult?.errors.length || 0} errores • 
              {validationResult?.warnings.length || 0} advertencias
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={onBack}>
                Cancelar
              </Button>
              <Button 
                onClick={handleValidate}
                disabled={!validationResult?.isValid || validationErrors.length > 0}
                className={validationResult?.isValid ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {validationResult?.isValid ? 'Validar y Continuar' : 'Corregir Errores'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

