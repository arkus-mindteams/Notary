"use client"

import { Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface TestPDFViewerProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

export default function TestPDFViewer({ 
  fileUrl, 
  highlightedRegion, 
  onRegionHover, 
  zoom, 
  rotation 
}: TestPDFViewerProps) {
  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'documento.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading PDF:', error)
    }
  }

  const openInNewTab = () => {
    window.open(fileUrl, '_blank')
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
            <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <ExternalLink className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-lg">Documento PDF</CardTitle>
            <CardDescription>
              Vista previa no disponible en el navegador
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button 
                onClick={openInNewTab}
                variant="outline"
                className="gap-2 flex-1"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir PDF
              </Button>
              
              <Button 
                onClick={handleDownload}
                className="gap-2 flex-1"
              >
                <Download className="h-4 w-4" />
                Descargar
              </Button>
            </div>
            
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                El sistema procesará automáticamente el contenido del PDF
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



