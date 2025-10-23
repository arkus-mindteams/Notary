"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface DirectPDFViewerProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

export default function DirectPDFViewer({ 
  fileUrl, 
  highlightedRegion, 
  onRegionHover, 
  zoom, 
  rotation 
}: DirectPDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pdfScale, setPdfScale] = useState(1.0)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const handleZoomIn = () => {
    setPdfScale(prev => Math.min(prev + 0.2, 3.0))
  }

  const handleZoomOut = () => {
    setPdfScale(prev => Math.max(prev - 0.2, 0.5))
  }

  useEffect(() => {
    // Simular carga del PDF
    const timer = setTimeout(() => {
      setIsLoading(false)
      setTotalPages(1) // En una implementación real, esto vendría del PDF
    }, 1000)

    return () => clearTimeout(timer)
  }, [fileUrl])

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
        <div className="flex items-center justify-between mb-2 p-3 bg-white rounded-t-lg border border-gray-200 shadow-sm">
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
            
            <span className="text-sm text-muted-foreground min-w-[120px] text-center">
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
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={pdfScale <= 0.5}
                className="h-8 w-8 p-0"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              
              <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                {Math.round(pdfScale * 100)}%
              </span>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                disabled={pdfScale >= 3.0}
                className="h-8 w-8 p-0"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

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
        <div 
          ref={containerRef}
          className="relative w-full h-[700px] bg-gray-100 rounded-b-lg border border-gray-200 border-t-0 shadow-sm overflow-hidden"
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10 rounded-b-lg">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Cargando PDF...</p>
              </div>
            </div>
          )}

          {/* Renderizado del PDF usando object tag */}
          <div className="w-full h-full">
            <object
              data={`${fileUrl}#page=${currentPage}&toolbar=1&navpanes=1&scrollbar=1&view=FitH&zoom=${Math.round(pdfScale * 100)}`}
              type="application/pdf"
              className="w-full h-full"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false)
                setError("Error al cargar el PDF. El archivo puede estar corrupto o no ser un PDF válido.")
              }}
            >
              {/* Fallback si el navegador no soporta PDFs */}
              <div className="flex items-center justify-center h-full bg-white">
                <div className="text-center space-y-4 p-8">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <ExternalLink className="h-8 w-8 text-red-600" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      PDF no soportado
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Tu navegador no puede mostrar PDFs directamente
                    </p>
                  </div>

                  <div className="flex gap-3 justify-center">
                    <Button 
                      onClick={openInNewTab}
                      variant="outline"
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir en nueva pestaña
                    </Button>
                    
                    <Button 
                      onClick={handleDownload}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Descargar PDF
                    </Button>
                  </div>
                </div>
              </div>
            </object>
          </div>

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



