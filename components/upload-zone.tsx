"use client"

import type React from "react"

import { useCallback, useState } from "react"
import { Upload, FileText, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void
}

export function UploadZone({ onFilesSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const isValidImage = (file: File): boolean => {
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    const validExtensions = [".png", ".jpg", ".jpeg", ".webp"]
    return (
      validTypes.includes(file.type) ||
      validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    )
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

      const files = Array.from(e.dataTransfer.files).filter(isValidImage)
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
        const imageFiles = Array.from(files).filter(isValidImage)
        if (imageFiles.length > 0) {
          onFilesSelect(imageFiles)
        }
      }
    },
    [onFilesSelect],
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
          <h3 className="text-xl font-semibold text-foreground">Arrastra tus imágenes aquí</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Sube una o más imágenes del plano arquitectónico con información de deslindes. Puedes subir múltiples imágenes si el plano tiene varias páginas.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <span>PNG, JPG, JPEG, WEBP</span>
          </div>
        </div>

        <div className="relative">
          <input
            type="file"
            id="file-upload"
            className="sr-only"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            onChange={handleFileInput}
          />
          <Button asChild size="lg" className="cursor-pointer">
            <label htmlFor="file-upload">Seleccionar imagen(es)</label>
          </Button>
        </div>
      </div>
    </Card>
  )
}
