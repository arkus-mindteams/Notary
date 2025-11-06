"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  Maximize
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Slider } from "@/components/ui/slider"

// Dynamic imports for react-pdf components - will be loaded client-side only
let Document: any = null
let Page: any = null
let pdfjsLib: any = null

interface PDFViewerProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom?: number
  rotation?: number
  fileName?: string
}

const ZOOM_MIN = 25
const ZOOM_MAX = 300
const ZOOM_STEP = 10
const DEFAULT_ZOOM = 100

export function PDFViewer({ 
  fileUrl, 
  highlightedRegion, 
  onRegionHover,
  zoom: externalZoom,
  rotation: externalRotation,
  fileName = "documento.pdf"
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [internalZoom, setInternalZoom] = useState(DEFAULT_ZOOM)
  const [internalRotation, setInternalRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageWidth, setPageWidth] = useState<number | null>(null)
  const [fitMode, setFitMode] = useState<'width' | 'height' | 'auto'>('auto')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPdfLoaded, setIsPdfLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Dynamically load PDF.js and react-pdf on client side only
  useEffect(() => {
    const loadPdfLib = async () => {
      // Double check we're on client
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return
      }

      try {
        // Load react-pdf - webpack noParse should prevent transformation issues
        // Wrap in try-catch to handle any module loading errors gracefully
        const reactPdfModule = await import('react-pdf').catch((err) => {
          console.error('Failed to import react-pdf:', err)
          throw new Error(`Failed to load react-pdf library: ${err.message}`)
        })
        
        // Handle both default and named exports
        const reactPdf = reactPdfModule.default || reactPdfModule
        
        // Access pdfjs from react-pdf
        const pdfjs = reactPdf?.pdfjs || reactPdfModule?.pdfjs
        
        if (!pdfjs || !pdfjs.GlobalWorkerOptions) {
          throw new Error('Could not access pdfjs from react-pdf. The library may not have loaded correctly.')
        }
        
        // Configure worker - load from CDN and create blob URL to avoid CORS issues
        // PDF.js 5.4.296 uses ES module workers (.mjs)
        const pdfVersion = pdfjs.version || '5.4.296'
        const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`
        
        try {
          // Fetch worker and create blob URL to avoid CORS issues
          const workerResponse = await fetch(workerUrl)
          if (workerResponse.ok) {
            const workerText = await workerResponse.text()
            // Create blob with proper type for ES module worker
            const workerBlob = new Blob([workerText], { 
              type: 'application/javascript' 
            })
            const blobUrl = URL.createObjectURL(workerBlob)
            pdfjs.GlobalWorkerOptions.workerSrc = blobUrl
          } else {
            // Fallback to direct CDN URL
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
          }
        } catch (fetchError) {
          // If fetch fails, try direct URL (might work if CDN has CORS)
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        }
        
        pdfjsLib = pdfjs
        
        // Import CSS dynamically - handle errors gracefully  
        try {
          await Promise.all([
            import('react-pdf/dist/Page/AnnotationLayer.css'),
            import('react-pdf/dist/Page/TextLayer.css')
          ])
        } catch (cssErr) {
          // CSS import might fail, but that's okay - styles might be loaded already
          console.warn('Could not load PDF CSS (non-critical):', cssErr)
        }
        
        // Get Document and Page components
        Document = reactPdf?.Document || reactPdfModule?.Document
        Page = reactPdf?.Page || reactPdfModule?.Page
        
        if (!Document || !Page) {
          throw new Error('Could not load Document or Page components from react-pdf')
        }
        
        setIsPdfLoaded(true)
        setLoading(false)
      } catch (err: any) {
        console.error('Error loading PDF library:', err)
        console.error('Error stack:', err.stack)
        setError(`Error al cargar la librería de PDF: ${err.message || 'Error desconocido'}. Por favor, recarga la página.`)
        setLoading(false)
      }
    }

    loadPdfLib()
  }, [])

  // Use external zoom/rotation if provided, otherwise use internal state
  const zoom = externalZoom ?? internalZoom
  const rotation = externalRotation ?? internalRotation
  
  // Determine if we're using external controls
  const isControlled = externalZoom !== undefined || externalRotation !== undefined

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
    setPageNumber(1)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error("Error loading PDF:", error)
    setError("Error al cargar el documento PDF. Por favor, verifica que el archivo sea válido.")
    setLoading(false)
  }, [])

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(zoom + ZOOM_STEP, ZOOM_MAX)
    if (!isControlled) {
      setInternalZoom(newZoom)
    }
  }, [zoom, isControlled])

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(zoom - ZOOM_STEP, ZOOM_MIN)
    if (!isControlled) {
      setInternalZoom(newZoom)
    }
  }, [zoom, isControlled])

  const handleZoomChange = useCallback((value: number[]) => {
    const newZoom = Math.max(ZOOM_MIN, Math.min(value[0], ZOOM_MAX))
    if (!isControlled) {
      setInternalZoom(newZoom)
    }
  }, [isControlled])

  const handleRotate = useCallback(() => {
    if (!isControlled) {
      setInternalRotation((prev) => (prev + 90) % 360)
    }
  }, [isControlled])

  const handleFitToWidth = useCallback(() => {
    setFitMode('width')
    if (containerRef.current && pageWidth && !isControlled) {
      const containerWidth = containerRef.current.clientWidth - 40 // padding
      const newZoom = (containerWidth / pageWidth) * 100
      setInternalZoom(Math.max(ZOOM_MIN, Math.min(newZoom, ZOOM_MAX)))
    }
  }, [pageWidth, isControlled])

  const handleFitToHeight = useCallback(() => {
    setFitMode('height')
  }, [])

  const handleFitAuto = useCallback(() => {
    setFitMode('auto')
    if (!isControlled) {
      setInternalZoom(DEFAULT_ZOOM)
    }
  }, [isControlled])

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch PDF')
      }
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
      console.error('Error downloading PDF:', error)
      setError('Error al descargar el PDF')
    }
  }, [fileUrl, fileName])

  const goToPrevPage = useCallback(() => {
    setPageNumber((prev) => Math.max(1, prev - 1))
  }, [])

  const goToNextPage = useCallback(() => {
    setPageNumber((prev) => Math.min(numPages || 1, prev + 1))
  }, [numPages])

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [isFullscreen])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    setPageNumber(1)
    setLoading(true)
    setError(null)
  }, [fileUrl])

  const onPageLoadSuccess = useCallback((page: any) => {
    setPageWidth(page.width)
  }, [])

  // Show loading state until PDF library is loaded
  if (!isPdfLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando visor PDF...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!Document || !Page) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Error al inicializar el visor de PDF</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full w-full bg-background"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/30 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Page Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={pageNumber <= 1 || loading}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[80px] text-center px-2">
              {loading ? '...' : `${pageNumber} / ${numPages || '?'}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={!numPages || pageNumber >= numPages || loading}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_MIN || loading || isControlled}
              className="h-8 w-8 p-0"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-[100px]">
              <Slider
                value={[zoom]}
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                onValueChange={handleZoomChange}
                className="w-20"
                disabled={loading || isControlled}
              />
              <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                {Math.round(zoom)}%
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_MAX || loading || isControlled}
              className="h-8 w-8 p-0"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Fit Controls */}
          {!isControlled && (
            <div className="flex items-center gap-1 border-l pl-2 ml-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFitAuto}
                className="h-8 px-2 text-xs"
                title="Fit auto"
              >
                <Maximize className="h-3 w-3 mr-1" />
                Auto
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFitToWidth}
                className="h-8 px-2 text-xs"
                title="Fit to width"
              >
                Ancho
              </Button>
            </div>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRotate}
            className="h-8 w-8 p-0"
            title="Rotate"
            disabled={loading || isControlled}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="h-8 w-8 p-0"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-8 w-8 p-0"
            title="Download PDF"
            disabled={loading}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Viewer Area */}
      <div className="flex-1 overflow-auto bg-muted/10">
        <div className="flex items-start justify-center p-4">
          <div
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: "transform 0.2s ease-in-out",
            }}
            className="relative"
          >
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            }
            className="shadow-lg"
          >
            {numPages && (
              <Page
                pageNumber={pageNumber}
                scale={zoom / 100}
                onLoadSuccess={onPageLoadSuccess}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="border border-border"
                width={fitMode === 'width' && containerRef.current 
                  ? containerRef.current.clientWidth - 40 
                  : undefined}
              />
            )}
          </Document>

          {/* Overlay for highlighted regions */}
          {highlightedRegion && (
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute border-2 border-yellow-400 rounded-lg shadow-lg transition-all duration-200"
                style={{
                  left: "10%",
                  top: "10%",
                  width: "30%",
                  height: "20%",
                  backgroundColor: "rgba(250, 204, 21, 0.25)",
                  boxShadow: "0 0 30px rgba(250, 204, 21, 0.5), inset 0 0 20px rgba(250, 204, 21, 0.2)",
                }}
              >
                <div className="absolute -top-6 left-0 bg-yellow-500 text-yellow-950 px-2 py-1 rounded-md text-xs font-medium shadow-lg">
                  Región resaltada
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
