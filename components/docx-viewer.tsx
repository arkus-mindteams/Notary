"use client"

import { useState } from "react"
import { Download, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface DOCXViewerProps {
  fileUrl: string
  fileName?: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

export function DOCXViewer({ 
  fileUrl, 
  fileName = "documento.docx",
  highlightedRegion, 
  onRegionHover, 
  zoom, 
  rotation 
}: DOCXViewerProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch(fileUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading file:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-full">
      <div
        style={{
          transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          transition: "transform 0.2s ease-in-out",
        }}
        className="relative"
      >
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-lg">Documento Word</CardTitle>
            <CardDescription>
              {fileName}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                La vista previa de documentos Word no está disponible en el navegador. 
                Puedes descargar el archivo para abrirlo con Microsoft Word o Google Docs.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <strong>Información del archivo:</strong>
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Formato: Microsoft Word Document (.docx)</li>
                <li>• Tamaño: Calculando...</li>
                <li>• Última modificación: Reciente</li>
              </ul>
            </div>
            
            <Button 
              onClick={handleDownload} 
              className="w-full gap-2"
              disabled={isDownloading}
            >
              <Download className="h-4 w-4" />
              {isDownloading ? "Descargando..." : "Descargar Documento"}
            </Button>
            
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                El sistema procesará automáticamente el contenido del documento
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

