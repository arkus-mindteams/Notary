"use client"

import React from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  X,
  Eye,
  EyeOff
} from 'lucide-react'
import { ValidationError, ValidationResult } from '@/lib/data-validator'

interface ValidationAlertsProps {
  validationResult: ValidationResult
  onDismiss?: (errorId: string) => void
  onShowDetails?: () => void
  showDetails?: boolean
  className?: string
}

export function ValidationAlerts({ 
  validationResult, 
  onDismiss, 
  onShowDetails, 
  showDetails = false,
  className = ""
}: ValidationAlertsProps) {
  const { errors, warnings, score, isValid } = validationResult

  const getAlertIcon = (type: ValidationError['type']) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="h-4 w-4" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />
      case 'info':
        return <Info className="h-4 w-4" />
      default:
        return <Info className="h-4 w-4" />
    }
  }

  const getAlertVariant = (type: ValidationError['type']) => {
    switch (type) {
      case 'error':
        return 'destructive'
      case 'warning':
        return 'default'
      case 'info':
        return 'default'
      default:
        return 'default'
    }
  }

  const getSeverityColor = (severity: ValidationError['severity']) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreIcon = (score: number) => {
    if (score >= 90) return <CheckCircle2 className="h-4 w-4 text-green-600" />
    if (score >= 70) return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    return <AlertCircle className="h-4 w-4 text-red-600" />
  }

  if (isValid && errors.length === 0 && warnings.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Todos los datos han sido validados correctamente
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Score y resumen */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          {getScoreIcon(score)}
          <span className="font-medium">Calidad de datos:</span>
          <Badge variant="outline" className={getScoreColor(score)}>
            {score}%
          </Badge>
        </div>
        
        {(errors.length > 0 || warnings.length > 0) && onShowDetails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowDetails}
            className="text-gray-600 hover:text-gray-800"
          >
            {showDetails ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                Ocultar detalles
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                Ver detalles
              </>
            )}
          </Button>
        )}
      </div>

      {/* Errores críticos */}
      {errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-800 flex items-center">
            <AlertCircle className="h-4 w-4 mr-1" />
            Errores que requieren atención ({errors.length})
          </h4>
          {errors.map((error, index) => (
            <Alert key={`error-${index}`} variant="destructive" className="relative">
              <div className="flex items-start space-x-2">
                {getAlertIcon(error.type)}
                <div className="flex-1">
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{error.field}:</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getSeverityColor(error.severity)}`}
                      >
                        {error.severity}
                      </Badge>
                    </div>
                    <p className="mt-1">{error.message}</p>
                  </AlertDescription>
                </div>
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDismiss(`error-${index}`)}
                    className="text-red-600 hover:text-red-800 p-1 h-auto"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Alert>
          ))}
        </div>
      )}

      {/* Advertencias */}
      {warnings.length > 0 && showDetails && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-yellow-800 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Advertencias ({warnings.length})
          </h4>
          {warnings.map((warning, index) => (
            <Alert key={`warning-${index}`} variant="default" className="border-yellow-200 bg-yellow-50">
              <div className="flex items-start space-x-2">
                {getAlertIcon(warning.type)}
                <div className="flex-1">
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-yellow-800">{warning.field}:</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getSeverityColor(warning.severity)}`}
                      >
                        {warning.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-yellow-700">{warning.message}</p>
                  </AlertDescription>
                </div>
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDismiss(`warning-${index}`)}
                    className="text-yellow-600 hover:text-yellow-800 p-1 h-auto"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Alert>
          ))}
        </div>
      )}

      {/* Resumen compacto si no se muestran detalles */}
      {!showDetails && warnings.length > 0 && (
        <Alert variant="default" className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            {warnings.length} advertencia{warnings.length > 1 ? 's' : ''} pendiente{warnings.length > 1 ? 's' : ''}
            {onShowDetails && (
              <Button
                variant="link"
                size="sm"
                onClick={onShowDetails}
                className="ml-2 p-0 h-auto text-yellow-800 hover:text-yellow-900"
              >
                Ver detalles
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}


