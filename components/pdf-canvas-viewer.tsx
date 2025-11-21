"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PdfCanvasViewerProps {
  fileUrl: string
  zoom: number
  rotation: number
}

type PdfJsDocument = any

export function PdfCanvasViewer({ fileUrl, zoom, rotation }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const pdfRef = useRef<PdfJsDocument | null>(null)

  const [numPages, setNumPages] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load PDF document with pdfjs-dist (client-side only)
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        setNumPages(null)
        pdfRef.current = null

        if (typeof window === "undefined" || typeof document === "undefined") {
          return
        }

        const pdfjsModule: any = await import("pdfjs-dist/build/pdf")
        const pdfjs = pdfjsModule?.default || pdfjsModule

        if (!pdfjs?.getDocument || !pdfjs.GlobalWorkerOptions) {
          throw new Error("No se pudo inicializar pdf.js correctamente.")
        }

        // Configure worker from CDN
        const workerVersion = pdfjs.version || "5.4.296"
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`

        const loadingTask = pdfjs.getDocument(fileUrl)
        const pdf = await loadingTask.promise

        if (cancelled) return

        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        setLoading(false)
      } catch (err: any) {
        if (cancelled) return
        console.error("Error loading PDF with pdf.js:", err)
        setError(
          err?.message ||
            "Error al cargar el PDF con pdf.js. Verifica que el archivo sea válido."
        )
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [fileUrl])

  // Render all pages to canvases whenever zoom or rotation changes
  useEffect(() => {
    const renderPages = async () => {
      const pdf = pdfRef.current
      if (!pdf || !numPages) return

      const normalizedRotation = ((rotation % 360) + 360) % 360
      const scale = Math.max(0.1, zoom / 100)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const canvas = canvasRefs.current[pageNum - 1]
        if (!canvas) continue

        const context = canvas.getContext("2d")
        if (!context) continue

        // Clear previous content
        context.clearRect(0, 0, canvas.width, canvas.height)

        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale, rotation: normalizedRotation })

        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport,
        }

        await page.render(renderContext).promise
      }
    }

    renderPages()
  }, [numPages, zoom, rotation])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando PDF...</p>
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

  if (!numPages) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-neutral-200"
    >
      <div className="flex flex-col items-center py-4 space-y-6">
        {Array.from({ length: numPages }, (_, index) => (
          <div
            key={index}
            className="bg-white shadow-md border border-border"
          >
            <canvas
              ref={(el) => {
                canvasRefs.current[index] = el
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}


