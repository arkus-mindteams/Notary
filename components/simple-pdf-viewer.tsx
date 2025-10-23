"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface SimplePDFViewerProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

function SimplePDFViewer({ 
  fileUrl, 
  highlightedRegion, 
  onRegionHover, 
  zoom, 
  rotation 
}: SimplePDFViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages] = useState(1) // En una implementación real, esto vendría del PDF
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
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
    } finally {
      setIsDownloading(false)
    }
  }

  const openInNewTab = () => {
    window.open(fileUrl, '_blank')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full">
      <div
        style={{
          transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          transition: "transform 0.2s ease-in-out",
        }}
        className="relative"
      >
        <div className="w-[1200px] h-[900px] bg-white border border-gray-200 shadow-lg flex flex-col items-center justify-center">
          <div className="text-center space-y-4 p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <ExternalLink className="h-8 w-8 text-red-600" />
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Documento PDF
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Para una mejor experiencia, abre el PDF en una nueva pestaña o descárgalo
              </p>
            </div>

            <div className="flex gap-3">
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
                disabled={isDownloading}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {isDownloading ? "Descargando..." : "Descargar PDF"}
              </Button>
            </div>

            <div className="text-xs text-gray-500 mt-4">
              <p>El sistema procesará automáticamente el contenido del PDF</p>
            </div>
          </div>
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

      {/* Controles de navegación simulados */}
      {totalPages > 1 && (
        <div className="flex items-center gap-4 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="gap-2"
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
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="gap-2"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

export default SimplePDFViewer
