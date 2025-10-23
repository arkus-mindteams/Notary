"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Edit3,
  Eye,
  EyeOff
} from 'lucide-react'

interface ValidationProgressProps {
  totalFields: number
  validatedFields: number
  editedFields: number
  lowConfidenceFields: number
  errors: number
  onToggleDetails?: () => void
  showDetails?: boolean
}

export function ValidationProgress({
  totalFields,
  validatedFields,
  editedFields,
  lowConfidenceFields,
  errors,
  onToggleDetails,
  showDetails = false
}: ValidationProgressProps) {
  const validationPercentage = totalFields > 0 ? (validatedFields / totalFields) * 100 : 0
  const completionPercentage = totalFields > 0 ? ((validatedFields - errors) / totalFields) * 100 : 0

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600'
    if (percentage >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 90) return <CheckCircle2 className="h-5 w-5 text-green-600" />
    if (percentage >= 70) return <AlertCircle className="h-5 w-5 text-yellow-600" />
    return <AlertCircle className="h-5 w-5 text-red-600" />
  }

  const getStatusText = (percentage: number) => {
    if (percentage >= 90) return 'Excelente'
    if (percentage >= 70) return 'Bueno'
    if (percentage >= 50) return 'Regular'
    return 'Necesita atención'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Progreso de Validación</span>
          </CardTitle>
          {onToggleDetails && (
            <button
              onClick={onToggleDetails}
              className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
            >
              {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>{showDetails ? 'Ocultar' : 'Mostrar'} detalles</span>
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progreso principal */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Validación General</span>
            <div className="flex items-center space-x-2">
              {getStatusIcon(completionPercentage)}
              <span className={`text-sm font-medium ${getStatusColor(completionPercentage)}`}>
                {getStatusText(completionPercentage)}
              </span>
            </div>
          </div>
          <Progress value={completionPercentage} className="h-3" />
          <div className="flex justify-between text-xs text-gray-600">
            <span>{validatedFields - errors} de {totalFields} campos válidos</span>
            <span>{Math.round(completionPercentage)}%</span>
          </div>
        </div>

        {/* Detalles expandibles */}
        {showDetails && (
          <div className="space-y-3 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Campos Editados</span>
                  <Badge variant="outline" className="text-blue-600">
                    <Edit3 className="h-3 w-3 mr-1" />
                    {editedFields}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Baja Confianza</span>
                  <Badge variant="outline" className="text-yellow-600">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {lowConfidenceFields}
                  </Badge>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Errores</span>
                  <Badge variant={errors > 0 ? "destructive" : "outline"} className={errors > 0 ? "text-red-600" : "text-green-600"}>
                    {errors > 0 ? <AlertCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {errors}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Campos</span>
                  <Badge variant="outline">
                    {totalFields}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Progreso por categoría */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Progreso por Categoría</h4>
              <div className="space-y-1">
                {[
                  { name: 'Notario', progress: 100, color: 'bg-blue-500' },
                  { name: 'Partes', progress: 85, color: 'bg-green-500' },
                  { name: 'Acto Jurídico', progress: 90, color: 'bg-purple-500' },
                  { name: 'Folio Real', progress: 75, color: 'bg-orange-500' },
                  { name: 'Inmueble', progress: 80, color: 'bg-red-500' }
                ].map((category) => (
                  <div key={category.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{category.name}</span>
                      <span className="text-xs text-gray-500">{category.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${category.color}`}
                        style={{ width: `${category.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mensaje de estado */}
        {errors > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {errors} error{errors > 1 ? 'es' : ''} encontrado{errors > 1 ? 's' : ''}. 
                Corrige los errores antes de continuar.
              </span>
            </div>
          </div>
        )}

        {errors === 0 && completionPercentage >= 90 && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                ¡Excelente! Todos los campos están validados correctamente.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}



