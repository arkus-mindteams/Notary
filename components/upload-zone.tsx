"use client"

import type React from "react"

import { useCallback, useState, useEffect, useRef } from "react"
import { Upload, FileText, ImageIcon, X, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void
  onFilesChange?: (files: File[]) => void
  onProcess?: () => void
  files?: File[] // External files for synchronization
  disableProcess?: boolean // Disable the process button (e.g., when PDF selector modal is open)
}

export function UploadZone({ onFilesSelect, onFilesChange, onProcess, files: externalFiles, disableProcess = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map())
  const cardRef = useRef<HTMLDivElement>(null)

  // Sync with external files if provided
  useEffect(() => {
    if (externalFiles !== undefined) {
      // Only update if files are actually different (compare by name and size)
      const areEqual = 
        selectedFiles.length === externalFiles.length &&
        selectedFiles.every((file, index) => {
          const externalFile = externalFiles[index]
          return externalFile && 
                 file.name === externalFile.name && 
                 file.size === externalFile.size
        })
      
      if (!areEqual) {
        setSelectedFiles(externalFiles)
      }
    }
  }, [externalFiles]) // Only depend on externalFiles to avoid loops

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
        setSelectedFiles((prevFiles) => {
          const existingFiles = prevFiles || []
          const newFiles = files.filter(
            (newFile) =>
              !existingFiles.some(
                (existingFile) =>
                  existingFile.name === newFile.name && existingFile.size === newFile.size
              )
          )
          const combinedFiles = [...existingFiles, ...newFiles]
          onFilesChange?.(combinedFiles)
          return combinedFiles
        })
        onFilesSelect(files)
      }
    },
    [onFilesSelect, onFilesChange],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const imageFiles = Array.from(files).filter(isValidFile)
        if (imageFiles.length > 0) {
          setSelectedFiles((prevFiles) => {
            const existingFiles = prevFiles || []
            const newFiles = imageFiles.filter(
              (newFile) =>
                !existingFiles.some(
                  (existingFile) =>
                    existingFile.name === newFile.name && existingFile.size === newFile.size
                )
            )
            const combinedFiles = [...existingFiles, ...newFiles]
            onFilesChange?.(combinedFiles)
            return combinedFiles
          })
          onFilesSelect(imageFiles)
        }
      }
      // Reset input to allow selecting the same file again
      e.target.value = ""
    },
    [onFilesSelect, onFilesChange],
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
        setSelectedFiles((prevFiles) => {
          const existingFiles = prevFiles || []
          const newFiles = imageFiles.filter(
            (newFile) =>
              !existingFiles.some(
                (existingFile) =>
                  existingFile.name === newFile.name && existingFile.size === newFile.size
              )
          )
          const combinedFiles = [...existingFiles, ...newFiles]
          onFilesChange?.(combinedFiles)
          return combinedFiles
        })
        onFilesSelect(imageFiles)
      }
    },
    [onFilesSelect, onFilesChange],
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

  // Create thumbnail URLs when files change
  useEffect(() => {
    setThumbnailUrls((prev) => {
      const newThumbnailUrls = new Map<number, string>()
      
      selectedFiles.forEach((file, index) => {
        if (prev.has(index)) {
          // Keep existing URL
          newThumbnailUrls.set(index, prev.get(index)!)
        } else {
          // Create new URL
          const url = URL.createObjectURL(file)
          newThumbnailUrls.set(index, url)
        }
      })
      
      // Clean up URLs for removed files
      prev.forEach((url, index) => {
        if (!newThumbnailUrls.has(index)) {
          if (!url.startsWith("/")) {
            URL.revokeObjectURL(url)
          }
        }
      })
      
      return newThumbnailUrls
    })
  }, [selectedFiles])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setThumbnailUrls((prev) => {
        prev.forEach((url) => {
          if (!url.startsWith("/")) {
            URL.revokeObjectURL(url)
          }
        })
        return new Map()
      })
    }
  }, [])

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prevFiles) => {
      const newFiles = prevFiles.filter((_, i) => i !== index)
      onFilesChange?.(newFiles)
      return newFiles
    })
    
    // Clean up thumbnail URL
    setThumbnailUrls((prev) => {
      const url = prev.get(index)
      if (url && !url.startsWith("/")) {
        URL.revokeObjectURL(url)
      }
      const newMap = new Map(prev)
      newMap.delete(index)
      // Reindex remaining URLs
      const reindexed = new Map<number, string>()
      newMap.forEach((url, oldIndex) => {
        if (oldIndex > index) {
          reindexed.set(oldIndex - 1, url)
        } else {
          reindexed.set(oldIndex, url)
        }
      })
      return reindexed
    })
  }

  return (
    <div className="space-y-6">
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
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-primary/20 p-6 flex-shrink-0">
            <Upload className="h-12 w-12 text-primary" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-xl font-bold text-foreground">
              Sube tus archivos para comenzar
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Arrastra archivos, selecciona o pega desde el portapapeles (Ctrl+V) PDF, PNG o JPG (Máx. 20MB)</span>
            </div>
          </div>
          <div className="relative w-full sm:w-auto">
            <input
              type="file"
              id="file-upload"
              className="sr-only"
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              multiple
              onChange={handleFileInput}
            />
            <Button asChild size="lg" className="w-full sm:w-auto cursor-pointer h-10 sm:h-12 bg-blue-950 hover:bg-blue-950/80 text-white font-bold py-2 sm:py-2.5 px-4 sm:px-6 text-sm sm:text-base">
              <label htmlFor="file-upload" className="cursor-pointer w-full sm:w-auto">Seleccionar archivos</label>
            </Button>
          </div>
           {selectedFiles.length > 0 && onProcess && (
              <Button 
                onClick={onProcess} 
                disabled={disableProcess}
                className="w-full sm:w-auto cursor-pointer h-10 sm:h-12 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 sm:py-2.5 px-4 sm:px-6 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Procesar imágenes </span>
                <span>({selectedFiles.length})</span>
              </Button>
            )}

          {/* Selected Files Section */}
          <div className="w-full overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {selectedFiles.map((file, index) => {
                const imageUrl = thumbnailUrls.get(index)

                return (
                  <Card
                    key={`${file.name}-${file.size}-${index}`}
                    className="p-2 relative group border w-[180px] shrink-0"
                  >
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-md bg-muted flex items-center justify-center overflow-hidden">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={file.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        )}

                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
