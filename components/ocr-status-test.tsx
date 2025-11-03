"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react"

interface ServiceStatus {
  openAI: boolean
  mistral: boolean
}

export function OCRStatusTest() {
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkStatus = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Call the API route to get the actual service status
        const response = await fetch('/api/ocr/status')
        
        if (!response.ok) {
          throw new Error(`Failed to get OCR status: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to get OCR status')
        }
        
        setStatus(data.status)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    checkStatus()
  }, [])

  if (loading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Verificando estado de servicios OCR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Comprobando configuración...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Error al verificar servicios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Estado de Servicios OCR</CardTitle>
        <CardDescription>
          Verificación de configuración de servicios AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            {status?.mistral ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span className="font-medium">Mistral AI Vision (OCR)</span>
          </div>
          <Badge variant={status?.mistral ? "default" : "destructive"}>
            {status?.mistral ? "Disponible" : "No configurado"}
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            {status?.openAI ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span className="font-medium">OpenAI GPT-4 (Notarial)</span>
          </div>
          <Badge variant={status?.openAI ? "default" : "destructive"}>
            {status?.openAI ? "Disponible" : "No configurado"}
          </Badge>
        </div>

        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 mb-2">
            {status?.mistral && status?.openAI ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            )}
            <span className="font-medium">
              {status?.mistral && status?.openAI ? "Servicios Reales Activos" : "Configuración Incompleta"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {status?.mistral && status?.openAI 
              ? "Mistral AI extraerá texto de documentos (OCR) y OpenAI GPT-4 lo convertirá a texto notarial."
              : "Configure todas las credenciales para usar servicios reales."
            }
          </p>
        </div>

        {(!status?.mistral || !status?.openAI) && (
          <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
            <h4 className="font-medium text-yellow-800 mb-2">Configuración Requerida</h4>
            <p className="text-sm text-yellow-700 mb-3">
              Para usar servicios reales, configure las siguientes variables de entorno:
            </p>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• <code>MISTRAL_API_KEY</code> - Clave de API de Mistral AI (OCR)</li>
              <li>• <code>OPENAI_API_KEY</code> - Clave de API de OpenAI (Procesamiento Notarial)</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
