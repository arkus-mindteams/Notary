"use client"

import { useState, useEffect, useRef } from "react"
import { Download, ExternalLink, Loader2 } from "lucide-react"
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
  rotation,
}: DirectPDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const objectRef = useRef<HTMLObjectElement | null>(null)
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
  }, [fileUrl])

  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "documento.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Error downloading PDF:", err)
    }
  }

  const openInNewTab = () => {
    window.open(fileUrl, "_blank")
  }

  // Medir tamaño base del visor PDF una vez cargado
  const handleObjectLoad = () => {
    setIsLoading(false)
    setError(null)

    // Medimos después de que el navegador haya layoutado el PDF
    requestAnimationFrame(() => {
      if (!objectRef.current || baseSize) return
      const rect = objectRef.current.getBoundingClientRect()
      if (rect.width && rect.height) {
        setBaseSize({ width: rect.width, height: rect.height })
      }
    })
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

  const normalizedRotation = ((rotation % 360) + 360) % 360

  // Dimensiones objetivo del contenedor según el tamaño base
  const targetWidth = baseSize ? baseSize.width : undefined
  const targetHeight = baseSize ? baseSize.height : undefined

  return (
    <div className="relative min-h-[400px] w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10 rounded-lg">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando PDF...</p>
          </div>
        </div>
      )}

      <div
        ref={wrapperRef}
        className="relative mx-auto"
        style={{
          width: targetWidth ?? "100%",
          height: targetHeight ?? "80vh",
          transform: `rotate(${normalizedRotation}deg)`,
          transformOrigin: "center center",
          transition: "transform 0.2s ease-in-out, width 0.2s ease-in-out, height 0.2s ease-in-out",
        }}
      >
        <object
          ref={objectRef}
          data={fileUrl}
          type="application/pdf"
          className="block w-full h-full"
          onLoad={handleObjectLoad}
          onError={() => {
            setIsLoading(false)
            setError("Error al cargar el PDF. El archivo puede estar corrupto o no ser un PDF válido.")
          }}
        >
          <div className="flex items-center justify-center h-full bg-white">
            <div className="text-center space-y-4 p-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <ExternalLink className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">PDF no soportado</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Tu navegador no puede mostrar PDFs directamente
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={openInNewTab} variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Abrir en nueva pestaña
                </Button>
                <Button onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </Button>
              </div>
            </div>
          </div>
        </object>
      </div>

      {/* Overlay de región resaltada (si aplica) */}
      <div className="pointer-events-none absolute inset-0">
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
  )
}
