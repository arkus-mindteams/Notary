"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PDFViewerWrapperProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

export function PDFViewerWrapper({ 
  fileUrl, 
  highlightedRegion, 
  onRegionHover, 
  zoom, 
  rotation 
}: PDFViewerWrapperProps) {
  const [Document, setDocument] = useState<any>(null)
  const [Page, setPage] = useState<any>(null)
  const [pdfjs, setPdfjs] = useState<any>(null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return

    const loadPDFJS = async () => {
      try {
        setLoading(true)
        
        // Importar react-pdf dinámicamente
        const { Document: DocumentComponent, Page: PageComponent, pdfjs: pdfjsLib } = await import('react-pdf')
        
        // Configurar el worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`
        
        setDocument(() => DocumentComponent)
        setPage(() => PageComponent)
        setPdfjs(pdfjsLib)
        setError(null)
      } catch (err) {
        console.error("Error loading PDF.js:", err)
        setError("Error al cargar el visor de PDF")
      } finally {
        setLoading(false)
      }
    }

    loadPDFJS()
  }, [isClient])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setError(null)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error("Error loading PDF:", error)
    setError("Error al cargar el documento PDF")
  }

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1))
  }

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages || 1, prev + 1))
  }

  useEffect(() => {
    setPageNumber(1)
  }, [fileUrl])

  if (!isClient || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando visor de PDF...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!Document || !Page) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>No se pudo cargar el visor de PDF</AlertDescription>
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
        className="relative"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          className="shadow-lg"
        >
          <Page
            pageNumber={pageNumber}
            width={1200}
            className="border border-gray-200"
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>

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

      {/* Controles de navegación */}
      {numPages && numPages > 1 && (
        <div className="flex items-center gap-4 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          
          <span className="text-sm text-muted-foreground min-w-[120px] text-center">
            Página {pageNumber} de {numPages}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber === numPages}
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

