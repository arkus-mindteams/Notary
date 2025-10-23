"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface IframePDFViewerProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

export default function IframePDFViewer({ 
  fileUrl, 
  highlightedRegion, 
  onRegionHover, 
  zoom, 
  rotation 
}: IframePDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

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

  const goToPrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1))
  }

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1))
  }

  const handleIframeLoad = () => {
    setIsLoading(false)
    setError(null)
  }

  const handleIframeError = () => {
    setIsLoading(false)
    setError("Error al cargar el PDF. El archivo puede estar corrupto o no ser un PDF válido.")
  }

  // Crear URL con parámetros para el PDF
  const pdfUrl = `${fileUrl}#page=${currentPage}&toolbar=1&navpanes=1&scrollbar=1&view=FitH`

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full">
      <div
        style={{
          transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          transition: "transform 0.2s ease-in-out",
        }}
        className="relative w-full h-full"
      >
        {/* Controles superiores */}
        <div className="flex items-center justify-between mb-2 p-2 bg-white rounded-t-lg border border-gray-200">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            
            <span className="text-sm text-muted-foreground min-w-[100px] text-center">
              Página {currentPage} de {totalPages}
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="gap-1"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openInNewTab}
              className="gap-1"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              Descargar
            </Button>
          </div>
        </div>

        {/* Contenedor del PDF */}
        <div className="relative w-full h-[600px] bg-gray-100 rounded-b-lg border border-gray-200 border-t-0">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Cargando PDF...</p>
              </div>
            </div>
          )}

          <iframe
            src={pdfUrl}
            className="w-full h-full border-0 rounded-b-lg"
            title="PDF Document"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{
              minHeight: '600px'
            }}
          />

          {/* Overlay para resaltado de regiones */}
          <div className="absolute inset-0 pointer-events-none">
            {highlightedRegion && (
              <div
                className="absolute border-2 sm:border-4 border-yellow-400 rounded-lg shadow-lg transition-all duration-200"
                style={{
                  left: "10%",
                  top: "10%",
                  width: "30%",
                  height: "20%",
                  backgroundColor: "rgba(250, 204, 21, 0.25)",
                  boxShadow: "0 0 30px rgba(250, 204, 21, 0.5), inset 0 0 20px rgba(250, 204, 21, 0.2)",
                }}
              >
                <div className="absolute -top-6 sm:-top-8 left-0 bg-yellow-500 text-yellow-950 px-2 py-0.5 sm:px-3 sm:py-1 rounded-md text-xs sm:text-sm font-medium shadow-lg">
                  Región resaltada
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}



