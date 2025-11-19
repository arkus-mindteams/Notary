"use client"

import { useEffect, useRef, useState } from "react"
import { ZoomIn, ZoomOut, RotateCw, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Image from "next/image"
import DirectPDFViewer from "./direct-pdf-viewer"
import { DOCXViewer } from "./docx-viewer"
import { detectFileType, type FileTypeInfo } from "@/lib/file-type-detector"
import documentRegions from "@/data/document-regions.json"

interface DocumentViewerProps {
  documentUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  fileName?: string
}

export function DocumentViewer({ documentUrl, highlightedRegion, onRegionHover, fileName }: DocumentViewerProps) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Detectar el tipo de archivo
  const fileTypeInfo: FileTypeInfo = detectFileType(documentUrl, fileName)

  const activeRegion = highlightedRegion
    ? documentRegions.regions[highlightedRegion as keyof typeof documentRegions.regions]
    : null

  // Cada vez que cambian rotación o zoom, recentramos el scroll alrededor del documento
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const centerX = (el.scrollWidth - el.clientWidth) / 2
    const centerY = (el.scrollHeight - el.clientHeight) / 2

    el.scrollTo({
      left: Math.max(0, centerX),
      top: Math.max(0, centerY),
    })
  }, [rotation, zoom, documentUrl])

  return (
    <Card className="flex flex-col h-full">
      {/* Para PDFs usamos los controles nativos del visor, para otros tipos usamos esta barra */}
      {fileTypeInfo.type !== "pdf" && (
        <div className="flex items-center justify-between gap-2 p-2 sm:p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-medium">Documento Original</span>
            {fileTypeInfo.isSupported && (
              <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                <FileText className="h-3 w-3" />
                {fileTypeInfo.extension.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="h-8 w-8 p-0 sm:h-9 sm:w-9"
            >
              <ZoomOut className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[2.5rem] sm:min-w-[3rem] text-center">
              {zoom}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom((z) => Math.min(300, z + 10))}
              className="h-8 w-8 p-0 sm:h-9 sm:w-9"
            >
              <ZoomIn className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="h-8 w-8 p-0 sm:h-9 sm:w-9"
            >
              <RotateCw className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-muted/10 p-2 sm:p-4"
      >
        {!fileTypeInfo.isSupported ? (
          <div className="flex items-center justify-center min-h-full">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Tipo de archivo no soportado: {fileTypeInfo.extension}
              </AlertDescription>
            </Alert>
          </div>
        ) : fileTypeInfo.type === "pdf" ? (
          <DirectPDFViewer
            fileUrl={documentUrl}
            highlightedRegion={highlightedRegion}
            onRegionHover={onRegionHover}
            // El zoom se gestiona con los controles nativos del visor PDF; solo aplicamos rotación
            zoom={zoom}
            rotation={rotation}
          />
        ) : fileTypeInfo.type === "docx" ? (
          <DOCXViewer
            fileUrl={documentUrl}
            fileName={fileName}
            highlightedRegion={highlightedRegion}
            onRegionHover={onRegionHover}
            zoom={zoom}
            rotation={rotation}
          />
        ) : fileTypeInfo.type === "image" ? (
          <div className="flex items-center justify-center min-h-full">
            <div
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: "transform 0.2s ease-in-out",
              }}
              className="relative"
            >
              <Image
                src={documentUrl || "/testdeslinde.png"}
                alt="Documento de deslinde"
                width={1200}
                height={900}
                className="max-w-full h-auto shadow-lg"
              />

              <div className="absolute inset-0 pointer-events-none">
                {activeRegion && (
                  <div
                    className="absolute border-2 sm:border-4 border-yellow-400 rounded-lg shadow-lg transition-all duration-200"
                    style={{
                      left: `${activeRegion.x}%`,
                      top: `${activeRegion.y}%`,
                      width: `${activeRegion.width}%`,
                      height: `${activeRegion.height}%`,
                      backgroundColor: "rgba(250, 204, 21, 0.25)",
                      boxShadow: "0 0 30px rgba(250, 204, 21, 0.5), inset 0 0 20px rgba(250, 204, 21, 0.2)",
                    }}
                  >
                    <div className="absolute -top-6 sm:-top-8 left-0 bg-yellow-500 text-yellow-950 px-2 py-0.5 sm:px-3 sm:py-1 rounded-md text-xs sm:text-sm font-medium shadow-lg">
                      {activeRegion.label}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
