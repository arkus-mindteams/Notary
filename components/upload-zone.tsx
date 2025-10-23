"use client"

import type React from "react"

import { useCallback, useState } from "react"
import { Upload, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface UploadZoneProps {
  onFileSelect: (file: File) => void
}

export function UploadZone({ onFileSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true)
    } else if (e.type === "dragleave") {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect],
  )

  return (
    <Card
      className={`relative border-2 border-dashed transition-all duration-200 ${
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-muted/30"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center gap-6 p-12 text-center">
        <div className="rounded-full bg-primary/10 p-6">
          <Upload className="h-12 w-12 text-primary" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">Arrastra tu documento aquí</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Sube planos arquitectónicos, documentos PDF o imágenes con información de deslindes
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>PDF</span>
          </div>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <span>PNG, JPG</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>DOCX</span>
          </div>
        </div>

        <div className="relative">
          <input
            type="file"
            id="file-upload"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.docx"
            onChange={handleFileInput}
          />
          <Button asChild size="lg" className="cursor-pointer">
            <label htmlFor="file-upload">Seleccionar archivo</label>
          </Button>
        </div>
      </div>
    </Card>
  )
}
