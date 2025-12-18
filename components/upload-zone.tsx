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
      className={`relative border-2 border-dashed transition-all duration-200 bg-background ${
        isDragging
          ? "border-primary bg-primary/10 scale-[1.02] shadow-lg"
          : "border-primary/30 hover:border-primary/50 hover:bg-muted/50"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="rounded-full bg-primary/20 p-6 flex-shrink-0">
          <Upload className="h-12 w-12 text-primary" />
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-xl font-bold text-foreground">
            Arrastra y suelta tus imágenes o PDFs aquí
          </h3>
          <p className="text-sm text-muted-foreground">
            También puedes <strong>pegar desde el portapapeles</strong> usando Ctrl+V (Cmd+V en Mac)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
            <span>PNG, JPG, PDF</span>
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
          <Button asChild size="lg" className="cursor-pointer">
              <label htmlFor="file-upload" className="cursor-pointer">Seleccionar archivos</label>
          </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
