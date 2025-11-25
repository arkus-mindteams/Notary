"use client"

import type React from "react"

import { useCallback, useState, useEffect, useRef } from "react"
import { Upload, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void
}

export function UploadZone({ onFilesSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const isValidImage = (file: File): boolean => {
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    const validExtensions = [".png", ".jpg", ".jpeg", ".webp"]
    return (
      validTypes.includes(file.type) ||
      validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    )
  }

  const isValidPdf = (file: File): boolean => {
    return (
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')
    )
  }

  const isValidFile = (file: File): boolean => {
    return isValidImage(file) || isValidPdf(file)
  }

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

      const files = Array.from(e.dataTransfer.files).filter(isValidFile)
      if (files.length > 0) {
        onFilesSelect(files)
      }
    },
    [onFilesSelect],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const imageFiles = Array.from(files).filter(isValidFile)
        if (imageFiles.length > 0) {
          onFilesSelect(imageFiles)
        }
      }
      // Reset input to allow selecting the same file again
      e.target.value = ""
    },
    [onFilesSelect],
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles: File[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile()
          if (file && isValidImage(file)) {
            // Generate a name for pasted images
            const timestamp = Date.now()
            const extension = file.type.split("/")[1] || "png"
            const namedFile = new File([file], `pasted-image-${timestamp}.${extension}`, {
              type: file.type,
            })
            imageFiles.push(namedFile)
          }
        }
      }

      if (imageFiles.length > 0) {
        onFilesSelect(imageFiles)
      }
    },
    [onFilesSelect],
  )

  useEffect(() => {
    // Add paste event listener to the document
    const handleDocumentPaste = (e: ClipboardEvent) => {
      // Only handle paste if the card is focused or if user is clicking/pasting anywhere
      // This allows pasting from anywhere when the upload zone is visible
      handlePaste(e)
    }

    document.addEventListener("paste", handleDocumentPaste)
    return () => {
      document.removeEventListener("paste", handleDocumentPaste)
    }
  }, [handlePaste])

  return (
    <Card
      ref={cardRef}
      tabIndex={0}
      className={`relative border-2 border-dashed transition-all duration-200 ${
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-muted/30"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="flex flex-row items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="rounded-full bg-primary/10 p-3 flex-shrink-0">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Arrastra imágenes o PDFs aquí
            </h3>
            <p className="text-xs text-muted-foreground">
              También puedes pegar desde el portapapeles (Ctrl+V / Cmd+V) o hacer clic en el botón
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">PNG, JPG, PDF</span>
          </div>
          <div className="relative">
            <input
              type="file"
              id="file-upload"
              className="sr-only"
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              multiple
              onChange={handleFileInput}
            />
            <Button asChild size="sm" className="cursor-pointer">
              <label htmlFor="file-upload">Seleccionar archivos</label>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
