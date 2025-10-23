"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PDFViewerProps {
  fileUrl: string
  highlightedRegion?: string | null
  onRegionHover?: (regionId: string | null) => void
  zoom: number
  rotation: number
}

export function PDFViewer({ fileUrl, highlightedRegion, onRegionHover, zoom, rotation }: PDFViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages] = useState(1) // In real implementation, this would come from PDF.js

  return (
    <div className="relative flex flex-col items-center justify-center min-h-full">
      <div
        style={{
          transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
          transition: "transform 0.2s ease-in-out",
        }}
        className="relative"
      >
        <iframe
          src={`${fileUrl}#page=${currentPage}`}
          className="w-[1200px] h-[900px] shadow-lg bg-white"
          title="PDF Document"
        />

        <div className="absolute inset-0 pointer-events-none">
          {highlightedRegion && (
            <div
              className="absolute animate-pulse"
              style={{
                backgroundColor: "rgba(250, 204, 21, 0.5)",
                border: "3px solid rgb(234, 179, 8)",
                borderRadius: "6px",
                boxShadow: "0 0 20px rgba(234, 179, 8, 0.6)",
                left: "10%",
                top: "10%",
                width: "30%",
                height: "20%",
              }}
            />
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-4 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
