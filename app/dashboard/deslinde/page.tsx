"use client"

import { Suspense, useEffect, useState, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { UploadZone } from "@/components/upload-zone"
import { ProcessingScreen } from "@/components/processing-screen"
import { ValidationWizard } from "@/components/validation-wizard"
import { DocumentViewer } from "@/components/document-viewer"
import { simulateOCR, type PropertyUnit } from "@/lib/ocr-simulator"
import type { StructuredUnit, StructuringResponse } from "@/lib/ai-structuring-types"
import { createStructuredSegments, type TransformedSegment } from "@/lib/text-transformer"
import { StatsService, STATS_EVENTS } from "@/lib/services/stats-service"
import { calculateSimilarity } from "@/lib/utils/text-metrics"
import { useAuth } from "@/lib/auth-context"
import { FileText, Scale, Shield, ArrowLeft, X, ImageIcon, Play, Check, CheckSquare, RotateCw, RotateCcw, Crop, ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import Link from "next/link"
import { useIsMobile } from "@/hooks/use-mobile"
import { useIsTablet } from "@/hooks/use-tablet"
type AppState = "upload" | "processing" | "validation"

// Helper function to format numbers preserving original decimal places
// Accepts both number and string to preserve exact decimals from the document
// CRITICAL: If the value is a string, it preserves EXACTLY as-is (including trailing zeros)
// If it's a number, JavaScript may have already lost trailing zeros, so we can't fully preserve them
function formatNumberPreservingDecimals(num: number | string | null): string {
  if (num === null || num === undefined) return "0"

  // If it's already a string, return it as-is (preserves exact decimals from AI/document)
  if (typeof num === "string") {
    const trimmed = num.trim()
    // Validate it's a valid number string
    if (trimmed === "" || isNaN(Number(trimmed))) return "0"
    // Return the string as-is to preserve exact decimal places (e.g., "7.430" stays "7.430")
    return trimmed
  }

  // If it's a number, JavaScript may have already lost trailing zeros
  // We can't fully recover them, but we'll convert to string as-is
  if (typeof num === "number") {
    if (isNaN(num)) return "0"
    // Convert to string - note: this may have already lost trailing zeros (7.430 → "7.43")
    // This is why it's important for the AI to return strings for numbers with specific decimals
    return num.toString()
  }

  return "0"
}

// Helper function to rotate an image file
async function rotateImageFile(file: File, rotation: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Calculate new dimensions based on rotation
      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      // Configure canvas for high-quality rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // Translate and rotate
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      // Convert to blob and then to File with maximum quality
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'))
          return
        }
        const rotatedFile = new File([blob], file.name, { type: file.type })
        resolve(rotatedFile)
      }, file.type, 1.0) // 1.0 = maximum quality for PNG
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

// Helper function to crop an image file
async function cropImageFile(file: File, cropArea: { x: number; y: number; width: number; height: number }): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Set canvas size to crop dimensions
      canvas.width = cropArea.width
      canvas.height = cropArea.height

      // Configure canvas for high-quality rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // Draw only the cropped portion
      ctx.drawImage(
        img,
        cropArea.x, cropArea.y, cropArea.width, cropArea.height, // Source rectangle
        0, 0, cropArea.width, cropArea.height // Destination rectangle
      )

      // Convert to blob with maximum quality
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'))
          return
        }
        const croppedFile = new File([blob], file.name.replace(/\.(png|jpg|jpeg)$/i, '-cropped.$1'), { type: file.type })
        resolve(croppedFile)
      }, file.type, 1.0)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

// Component for PDF image selection card
function PdfImageCard({
  image,
  index,
  isSelected,
  onToggle,
  rotation,
  onEdit,
  hasCrop
}: {
  image: File
  index: number
  isSelected: boolean
  onToggle: () => void
  rotation: number
  onEdit: (index: number) => void
  hasCrop: boolean
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [rotatedImageUrl, setRotatedImageUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(image)
    setImageUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [image])

  // Apply rotation to image URL
  useEffect(() => {
    if (!imageUrl || rotation === 0) {
      setRotatedImageUrl(imageUrl)
      return
    }

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setRotatedImageUrl(imageUrl)
        return
      }

      // Calculate new dimensions
      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      // Rotate and draw
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      const rotatedUrl = canvas.toDataURL()
      if (rotatedImageUrl && rotatedImageUrl !== imageUrl && !rotatedImageUrl.startsWith('data:')) {
        URL.revokeObjectURL(rotatedImageUrl)
      }
      setRotatedImageUrl(rotatedUrl)
    }

    img.onerror = () => {
      setRotatedImageUrl(imageUrl)
    }

    img.src = imageUrl
  }, [imageUrl, rotation])

  return (
    <Card
      className={`p-3 transition-all ${isSelected ? 'ring-2 ring-primary' : ''
        }`}
    >
      <div className="space-y-2">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-muted group">
          {rotatedImageUrl ? (
            <img
              src={rotatedImageUrl}
              alt={`Página ${index + 1}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-2 right-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-background/80'
              }`}>
              {isSelected && <Check className="h-4 w-4" />}
            </div>
          </div>
          {/* Edit button - visible on hover */}
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="sm"
              className="bg-background/90 hover:bg-background text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(index)
              }}
            >
              Editar
            </Button>
          </div>
          <div className="absolute top-2 left-2 flex gap-2">
            {rotation !== 0 && (
              <div className="bg-primary/90 text-primary-foreground text-xs px-2 py-1 rounded">
                {rotation}°
              </div>
            )}
            {hasCrop && (
              <div className="bg-green-600/90 text-white text-xs px-2 py-1 rounded">
                Área seleccionada
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
          />
          <label
            className="text-sm font-medium cursor-pointer flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            Página {index + 1}
          </label>
        </div>
      </div>
    </Card>
  )
}

function DeslindePageInner() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [appState, setAppState] = useState<AppState>("upload")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [documentUrl, setDocumentUrl] = useState<string>("")
  const [units, setUnits] = useState<PropertyUnit[]>([])
  const [unitSegments, setUnitSegments] = useState<Map<string, TransformedSegment[]>>(new Map())
  const [processingStarted, setProcessingStarted] = useState(false)
  const [initialAiText, setInitialAiText] = useState<string | null>(null)
  const [aiStructuredText, setAiStructuredText] = useState<string | null>(null)
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)
  const [ocrRotationHint, setOcrRotationHint] = useState<number | null>(null)
  const [unitBoundariesText, setUnitBoundariesText] = useState<Map<string, string>>(new Map())
  const [lotLocation, setLotLocation] = useState<string | null>(null)
  const [totalLotSurface, setTotalLotSurface] = useState<number | null>(null)
  const [pdfConvertedImages, setPdfConvertedImages] = useState<File[]>([])
  const [selectedPdfImages, setSelectedPdfImages] = useState<Set<number>>(new Set())
  const [showPdfImageSelector, setShowPdfImageSelector] = useState(false)
  const [imageRotations, setImageRotations] = useState<Map<number, number>>(new Map())
  const [imageCrops, setImageCrops] = useState<Map<number, { x: number; y: number; width: number; height: number }>>(new Map())
  const [showCropDialog, setShowCropDialog] = useState(false)
  const [currentCropIndex, setCurrentCropIndex] = useState<number | null>(null)
  const { user } = useAuth()

  // Logging refs & state
  const [processingLogId, setProcessingLogId] = useState<string | null>(null)
  const processingLogIdRef = useRef<string | null>(null)
  const latestTextRef = useRef<string>("")
  const isLogFinalizedRef = useRef(false)
  const unitsLogRef = useRef<Map<string, any>>(new Map())

  // Sync latest text to ref for unmount cleanup
  useEffect(() => {
    const text = Array.from(unitSegments.values())
      .flatMap((segments) => segments.map((seg) => seg.notarialText))
      .join("\n\n")
    if (text) latestTextRef.current = text
  }, [unitSegments])

  // Handle unmount / navigation away logic
  useEffect(() => {
    return () => {
      // If we have an active log and it wasn't finalized (exported)
      if (processingLogIdRef.current && !isLogFinalizedRef.current) {
        const finalText = latestTextRef.current
        // Auto-save the session as abandoned/viewed
        StatsService.updateEvent(processingLogIdRef.current, {
          final_text: finalText,
          status: 'abandoned_or_viewed',
          completion_method: 'navigation_away'
        })
      }
    }
  }, [])


  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams?.get("reset") === "1") {
      setAppState("upload")
      setSelectedFiles([])
      if (documentUrl && !documentUrl.startsWith("/")) {
        URL.revokeObjectURL(documentUrl)
      }
      router.replace("/dashboard/deslinde")
    }
  }, [searchParams, documentUrl, router])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (documentUrl && !documentUrl.startsWith("/")) {
        URL.revokeObjectURL(documentUrl)
      }
    }
  }, [documentUrl])

  const handleFilesSelect = async (files: File[]) => {
    if (files.length === 0) return

    // Separate PDFs and images
    const pdfFiles = files.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    const imageFiles = files.filter(
      (file) => !pdfFiles.includes(file)
    )

    // Convert PDFs to images
    let convertedImages: File[] = []
    if (pdfFiles.length > 0) {
      try {
        for (const pdfFile of pdfFiles) {
          const { convertPdfToImages } = await import('@/lib/ocr-client')
          const images = await convertPdfToImages(pdfFile)
          convertedImages = [...convertedImages, ...images]
        }

        // If we have converted images, show selector modal
        if (convertedImages.length > 0) {
          setPdfConvertedImages(convertedImages)
          // Select all by default
          setSelectedPdfImages(new Set(convertedImages.map((_, index) => index)))
          // Reset rotations and crops for new images
          setImageRotations(new Map())
          setImageCrops(new Map())
          setShowPdfImageSelector(true)
          // Don't add images yet - wait for user selection
        }
      } catch (error) {
        console.error('[deslinde] Error converting PDFs:', error)
        toast.error('Error al convertir PDFs', {
          description: 'No se pudieron convertir los PDFs a imágenes. Intenta subiendo las imágenes directamente.',
          duration: 6000,
        })
        return
      }
    }

    // Add regular image files immediately (not from PDF conversion)
    // IMPORTANT: Do NOT add PDFs to selectedFiles - they will be replaced by converted images
    if (imageFiles.length > 0) {
      // Remove any PDFs that might be in selectedFiles (they should be converted to images)
      const currentFilesWithoutPdfs = selectedFiles.filter(
        (file) => !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      )
      const updatedFiles = [...currentFilesWithoutPdfs, ...imageFiles]
      handleFilesChange(updatedFiles)

      // Update preview with first image if we didn't have one
      if (updatedFiles.length > 0 && (!documentUrl || documentUrl.startsWith("/"))) {
        const url = URL.createObjectURL(updatedFiles[0])
        setDocumentUrl(url)
      }
    } else if (pdfFiles.length > 0) {
      // If only PDFs were uploaded, remove any existing PDFs from selectedFiles
      // (they will be replaced by converted images when user confirms)
      const currentFilesWithoutPdfs = selectedFiles.filter(
        (file) => !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      )
      handleFilesChange(currentFilesWithoutPdfs)
    }
  }

  const handleFilesChange = (files: File[]) => {
    setSelectedFiles(files)
    // Update preview with first image if we have files
    if (files.length > 0 && (!documentUrl || documentUrl.startsWith("/"))) {
      const url = URL.createObjectURL(files[0])
      setDocumentUrl(url)
    } else if (files.length === 0 && documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
      setDocumentUrl("")
    }
  }

  const handleConfirmPdfImageSelection = async () => {
    // Validate that we have selected images
    if (selectedPdfImages.size === 0) {
      toast.error("Debes seleccionar al menos una imagen", {
        description: "Por favor selecciona las páginas del PDF que deseas procesar.",
        duration: 4000,
      })
      return
    }

    // Add only selected images from PDF conversion with rotations and crops applied
    const selectedIndices = Array.from(selectedPdfImages)
    const processedImages: File[] = []

    for (const index of selectedIndices) {
      let image = pdfConvertedImages[index]
      // Validate image exists and is valid
      if (!image || !(image instanceof File) || image.size === 0) {
        console.warn(`[deslinde] Skipping invalid image at index ${index}`)
        continue
      }

      // Apply rotation first
      const rotation = imageRotations.get(index) || 0
      if (rotation !== 0) {
        try {
          image = await rotateImageFile(image, rotation)
        } catch (error) {
          console.error(`Error rotating image ${index}:`, error)
          toast.error(`Error al rotar imagen ${index + 1}`, {
            description: 'Se continuará con la imagen original.',
            duration: 4000,
          })
        }
      }

      // Apply crop if exists
      const cropArea = imageCrops.get(index)
      if (cropArea) {
        try {
          image = await cropImageFile(image, cropArea)
        } catch (error) {
          console.error(`Error cropping image ${index}:`, error)
          toast.error(`Error al recortar imagen ${index + 1}`, {
            description: 'Se continuará con la imagen sin recortar.',
            duration: 4000,
          })
        }
      }

      processedImages.push(image)
    }

    if (processedImages.length > 0) {
      // Remove any PDFs from selectedFiles before adding converted images
      // PDFs should be replaced by their converted images, not kept alongside them
      const filesWithoutPdfs = selectedFiles.filter(
        (file) => !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      )
      const combinedFiles = [...filesWithoutPdfs, ...processedImages]
      handleFilesChange(combinedFiles)
    }

    // Close modal and reset
    setShowPdfImageSelector(false)
    setPdfConvertedImages([])
    setSelectedPdfImages(new Set())
    setImageRotations(new Map())
    setImageCrops(new Map())
  }

  const handleCancelPdfImageSelection = () => {
    // Clean up object URLs
    pdfConvertedImages.forEach((image) => {
      const url = URL.createObjectURL(image)
      URL.revokeObjectURL(url)
    })

    // Close modal and reset without adding images
    setShowPdfImageSelector(false)
    setPdfConvertedImages([])
    setSelectedPdfImages(new Set())
    setImageRotations(new Map())
  }

  const handleRotateImage = (index: number, delta: number) => {
    setImageRotations((prev) => {
      const newRotations = new Map(prev)
      const currentRotation = newRotations.get(index) || 0
      const newRotation = (currentRotation + delta) % 360
      // Normalize to 0-360 range
      const normalizedRotation = newRotation < 0 ? newRotation + 360 : newRotation
      newRotations.set(index, normalizedRotation)
      return newRotations
    })
  }

  const handleCropImage = (index: number) => {
    setCurrentCropIndex(index)
    setShowCropDialog(true)
  }

  const handleSaveCrop = (cropArea: { x: number; y: number; width: number; height: number }) => {
    if (currentCropIndex !== null) {
      setImageCrops((prev) => {
        const newCrops = new Map(prev)
        newCrops.set(currentCropIndex, cropArea)
        return newCrops
      })
    }
    setShowCropDialog(false)
    setCurrentCropIndex(null)
  }

  const handleCancelCrop = () => {
    setShowCropDialog(false)
    setCurrentCropIndex(null)
  }

  // Clean up PDF converted images URLs when component unmounts or images change
  useEffect(() => {
    return () => {
      pdfConvertedImages.forEach((image) => {
        // Note: We can't revoke URLs created in the modal render
        // They will be cleaned up when the modal closes
      })
    }
  }, [pdfConvertedImages])

  const togglePdfImageSelection = (index: number) => {
    setSelectedPdfImages((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const selectAllPdfImages = () => {
    setSelectedPdfImages(new Set(pdfConvertedImages.map((_, index) => index)))
  }

  const deselectAllPdfImages = () => {
    setSelectedPdfImages(new Set())
  }


  const handleProcessImages = () => {
    if (selectedFiles.length === 0) return

    // Prevent processing when PDF selector modal is open
    // This ensures only confirmed/selected PDF images are processed
    if (showPdfImageSelector) {
      toast.error("Por favor confirma la selección de imágenes del PDF primero", {
        description: "Debes seleccionar y confirmar las páginas del PDF que deseas procesar.",
        duration: 5000,
      })
      return
    }

    setProcessingStarted(false)
    setAiStructuredText(null)
    setUnits([])
    setUnitSegments(new Map())
    setUnitBoundariesText(new Map())
    setAppState("processing")
  }

  const handleProcessingComplete = async (update?: (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => void) => {
    if (!selectedFiles || selectedFiles.length === 0) return

    // Prevent processing when PDF selector modal is open
    if (showPdfImageSelector) {
      console.log("[deslinde] PDF selector modal is open, skipping processing")
      return
    }

    if (processingStarted) {
      console.log("[deslinde] processing already started, skipping duplicate run")
      return
    }
    setProcessingStarted(true)

    // Reset confidence/rotation hints since we're not using OCR anymore
    setOcrConfidence(null)
    setOcrRotationHint(null)

    // Send images directly to OpenAI Vision API
    try {
      // Count only image files (exclude PDFs)
      const imageFilesCount = selectedFiles.filter(
        (file) => !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      ).length

      update?.("ai", "in_progress", `Analizando ${imageFilesCount} imagen(es)...`)

      // Send images as FormData
      // Add forceRefresh parameter to bypass cache if needed
      // You can add a UI toggle to control this
      const formData = new FormData()

      // Filter out PDFs - only process images (PDFs should have been converted to images)
      const imageFilesOnly = selectedFiles.filter(
        (file) => !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      )

      if (imageFilesOnly.length === 0) {
        throw new Error("No hay imágenes válidas para procesar. Por favor, asegúrate de haber seleccionado imágenes del PDF o subir imágenes directamente.")
      }

      imageFilesOnly.forEach((image) => {
        // Validate that the image file exists and is valid before adding
        if (image && image instanceof File && image.size > 0) {
          formData.append("images", image)
        } else {
          console.warn("[deslinde] Skipping invalid image file:", image)
        }
      })
      // Optionally force refresh to bypass cache (useful for debugging)
      // formData.append("forceRefresh", "true")

      const resp = await fetch("/api/ai/structure", {
        method: "POST",
        body: formData,
      })
      if (!resp.ok) {
        let errorMessage = `HTTP ${resp.status}`
        let errorDetails = ""

        try {
          const errorData = await resp.json()
          errorMessage = errorData.error || errorMessage
          errorDetails = errorData.details || ""
        } catch {
          // If not JSON, use text response
          const errorText = await resp.text()
          errorMessage = errorText || errorMessage
        }

        // Show user-friendly error message
        const fullErrorMessage = `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ""}`

        // Extract specific error types for better UX
        let toastTitle = "Error al procesar imágenes"
        let toastDescription = errorDetails || errorMessage

        if (errorMessage.includes("No se puede leer con suficiente precisión") ||
          errorMessage.includes("baja resolución") ||
          errorMessage.includes("resolución insuficiente")) {
          toastTitle = "Calidad de imagen insuficiente"
          toastDescription = "Sube imágenes con mayor resolución o haz recortes cercanos a las secciones 'ANEXO - MEDIDAS Y COLINDANCIAS'."
        } else if (errorMessage.includes("invalid_ai_shape") ||
          errorMessage.includes("AI_RESPONSE_INVALID") ||
          errorMessage.includes("AI_PROCESSING_ERROR")) {
          toastTitle = "Texto ilegible o de baja calidad"
          toastDescription = "La IA no pudo leer el texto correctamente. Consejos: asegúrate de que la imagen esté enfocada, bien iluminada, sin sombras, y que el texto sea claro y legible. Evita imágenes borrosas o con baja resolución."
        } else if (errorMessage.includes("No valid units found") ||
          errorMessage.includes("No se detectaron unidades")) {
          toastTitle = "No se encontraron unidades válidas"
          toastDescription = "Asegúrate de que la imagen contenga información de colindancias y medidas. Revisa que sea legible."
        }

        // Update processing status to error FIRST
        update?.("ai", "error", toastDescription)

        // Show toast notification with better visibility and design
        toast.error(toastTitle, {
          description: toastDescription,
          duration: 12000, // Show longer
          position: "top-center", // More visible position
          style: {
            background: "linear-gradient(135deg, hsl(var(--destructive)) 0%, hsl(var(--destructive) / 0.95) 100%)",
            color: "hsl(var(--destructive-foreground))",
            border: "2px solid hsl(var(--destructive) / 0.3)",
            borderLeft: "4px solid hsl(var(--destructive-foreground))",
            fontSize: "15px",
            fontWeight: "600",
            padding: "20px 24px",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)",
            minWidth: "400px",
            maxWidth: "600px",
          },
          className: "error-toast",
          descriptionClassName: "text-sm leading-relaxed opacity-95 mt-2",
        })

        // Return user to upload page after a short delay to let them see the error
        setTimeout(() => {
          setAppState("upload")
          setProcessingStarted(false)
        }, 2500)

        // Don't throw error - just return early to stop processing
        // The error state is already set and toast is shown
        return
      }
      const data = (await resp.json()) as StructuringResponse
      console.log("[deslinde] AI response received:", {
        unitsCount: data.results?.length || 0,
        hasLocation: !!data.lotLocation,
        hasSurface: !!data.totalLotSurface,
        usage: data.usage
      })

      // Calculate token usage cost
      let usageCost = 0
      if (data.usage) {
        usageCost = StatsService.calculateEstimatedCost(data.usage)
      }


      update?.("ai", "done")

      // Extract lot-level metadata
      if (data.lotLocation) {
        setLotLocation(data.lotLocation)
      }
      if (data.totalLotSurface) {
        setTotalLotSurface(data.totalLotSurface)
      }

      const structuredUnits: StructuredUnit[] = Array.isArray(data.results) && data.results.length
        ? data.results
        : []

      if (!structuredUnits.length) {
        throw new Error("No se detectaron unidades en el texto proporcionado.")
      }

      const formatBoundaries = (unit: StructuredUnit) => {
        const lines: string[] = []

        // Use new format with directions if available
        if (unit.directions && Array.isArray(unit.directions) && unit.directions.length > 0) {
          for (const direction of unit.directions) {
            if (!direction.raw_direction || !Array.isArray(direction.segments) || direction.segments.length === 0) {
              continue
            }

            const directionName = direction.raw_direction.toUpperCase()
            const normalizedDir = direction.normalized_direction || ""
            const isVertical = normalizedDir === "UP" || normalizedDir === "DOWN" ||
              directionName === "ARRIBA" || directionName === "ABAJO" ||
              directionName === "SUPERIOR" || directionName === "INFERIOR"

            // Format first segment to calculate indentation
            let firstLine = ""
            let indentWidth = 0

            // Format each segment in this direction
            for (let i = 0; i < direction.segments.length; i++) {
              const segment = direction.segments[i]
              // Preserve length_m as-is (can be string or number) to maintain exact decimals
              const lengthValue = segment.length_m
              // For validation purposes, convert to number if needed
              const lengthNum = lengthValue === null || lengthValue === undefined
                ? null
                : (typeof lengthValue === "string" ? parseFloat(lengthValue) : (typeof lengthValue === "number" ? lengthValue : parseFloat(String(lengthValue))))
              const hasNoMeasure = lengthNum === null || isNaN(lengthNum) || Math.abs(lengthNum) < 0.001

              const who = (segment.abutter || "").toString().trim()
              // Remove leading "CON " if present (prevents "CON CON" duplication)
              const cleanedWho = who.replace(/^\s*CON\s+/i, "").trim()

              // Get length prefix from segment, default to "EN" if empty
              const lengthPrefix = segment.length_prefix && segment.length_prefix.trim() !== ""
                ? segment.length_prefix.trim().toUpperCase()
                : (hasNoMeasure ? null : "EN")

              if (i === 0) {
                // First segment in direction: show full direction
                if (isVertical && hasNoMeasure) {
                  firstLine = `${directionName}: CON ${cleanedWho}`
                } else if (hasNoMeasure && lengthNum === null) {
                  firstLine = `${directionName}: CON ${cleanedWho}`
                } else if (lengthPrefix && lengthNum !== null) {
                  const len = formatNumberPreservingDecimals(lengthValue) // Use original value (string or number)
                  if (lengthPrefix === "LC=") {
                    firstLine = `${directionName}: LC=${len} m CON ${cleanedWho}`
                  } else if (lengthPrefix === "EN" || lengthPrefix === "") {
                    // No mostrar "EN" cuando el prefijo es "EN" o está vacío
                    firstLine = `${directionName}: ${len} m CON ${cleanedWho}`
                  } else {
                    firstLine = `${directionName}: ${lengthPrefix} ${len} m CON ${cleanedWho}`
                  }
                } else {
                  const len = lengthValue !== null && lengthValue !== undefined ? formatNumberPreservingDecimals(lengthValue) : "0"
                  // No mostrar "EN" por defecto
                  firstLine = `${directionName}: ${len} m CON ${cleanedWho}`
                }

                // Calculate indentation: position after "DIRECTION: "
                indentWidth = directionName.length + 2 // direction name + ": "
                lines.push(firstLine)
              } else {
                // Subsequent segments in same direction: align with content after direction name
                const indent = " ".repeat(indentWidth)

                if (isVertical && hasNoMeasure) {
                  lines.push(`${indent}CON ${cleanedWho}`)
                } else if (hasNoMeasure && lengthNum === null) {
                  lines.push(`${indent}CON ${cleanedWho}`)
                } else if (lengthPrefix && lengthNum !== null) {
                  const len = formatNumberPreservingDecimals(lengthValue) // Use original value (string or number)
                  if (lengthPrefix === "LC=") {
                    lines.push(`${indent}LC=${len} m CON ${cleanedWho}`)
                  } else if (lengthPrefix === "EN" || lengthPrefix === "") {
                    // No mostrar "EN" cuando el prefijo es "EN" o está vacío
                    lines.push(`${indent}${len} m CON ${cleanedWho}`)
                  } else {
                    lines.push(`${indent}${lengthPrefix} ${len} m CON ${cleanedWho}`)
                  }
                } else {
                  const len = lengthValue !== null && lengthValue !== undefined ? formatNumberPreservingDecimals(lengthValue) : "0"
                  // No mostrar "EN" por defecto
                  lines.push(`${indent}${len} m CON ${cleanedWho}`)
                }
              }
            }
          }
        } else if (unit.boundaries && Array.isArray(unit.boundaries) && unit.boundaries.length > 0) {
          // Fallback to boundaries format for backward compatibility
          // Mapping for normalized directions to Spanish
          const dirEs: Record<string, string> = {
            "N": "NORTE",
            "S": "SUR",
            "E": "ESTE",
            "W": "OESTE",
            "NE": "NORESTE",
            "NW": "NOROESTE",
            "SE": "SURESTE",
            "SW": "SUROESTE",
            "UP": "ARRIBA",
            "DOWN": "ABAJO",
          }

          const ordered = [...unit.boundaries].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

          // Helper function to get direction key for grouping
          const getDirectionKey = (b: typeof ordered[0]): string => {
            const normalizedDir = b.normalized_direction || ""
            const rawDir = b.raw_direction || ""

            if (normalizedDir) {
              return normalizedDir.toUpperCase()
            }

            const upperRaw = rawDir.toUpperCase()
            if (upperRaw === "NORTE" || upperRaw === "NORTH") return "N"
            if (upperRaw === "SUR" || upperRaw === "SOUTH") return "S"
            if (upperRaw === "ESTE" || upperRaw === "EAST") return "E"
            if (upperRaw === "OESTE" || upperRaw === "WEST") return "W"
            if (upperRaw === "NORESTE" || upperRaw === "NORTHEAST") return "NE"
            if (upperRaw === "NOROESTE" || upperRaw === "NORTHWEST") return "NW"
            if (upperRaw === "SURESTE" || upperRaw === "SOUTHEAST") return "SE"
            if (upperRaw === "SUROESTE" || upperRaw === "SOUTHWEST") return "SW"
            if (upperRaw === "ARRIBA" || upperRaw === "UP" || upperRaw === "SUPERIOR") return "UP"
            if (upperRaw === "ABAJO" || upperRaw === "DOWN" || upperRaw === "INFERIOR") return "DOWN"

            return upperRaw
          }

          // Helper function to get Spanish direction name
          const getSpanishDirectionName = (b: typeof ordered[0]): string => {
            const rawDir = b.raw_direction || ""
            const normalizedDir = b.normalized_direction || ""

            let name = rawDir.toUpperCase()
            if (normalizedDir && dirEs[normalizedDir]) {
              name = dirEs[normalizedDir]
            } else if (rawDir && (rawDir === "NORTE" || rawDir === "SUR" || rawDir === "ESTE" || rawDir === "OESTE" ||
              rawDir === "NORESTE" || rawDir === "NOROESTE" || rawDir === "SURESTE" || rawDir === "SUROESTE" ||
              rawDir === "ARRIBA" || rawDir === "ABAJO")) {
              name = rawDir.toUpperCase()
            }

            return name
          }

          // Group consecutive boundaries with the same direction
          const groups: Array<Array<typeof ordered[0]>> = []
          let currentGroup: Array<typeof ordered[0]> = []
          let currentDirectionKey: string | null = null

          for (const b of ordered) {
            const dirKey = getDirectionKey(b)

            if (currentDirectionKey === null || currentDirectionKey !== dirKey) {
              // Start a new group
              if (currentGroup.length > 0) {
                groups.push(currentGroup)
              }
              currentGroup = [b]
              currentDirectionKey = dirKey
            } else {
              // Add to current group (same direction)
              currentGroup.push(b)
            }
          }

          // Add last group
          if (currentGroup.length > 0) {
            groups.push(currentGroup)
          }

          // Format each group
          for (const group of groups) {
            const firstBoundary = group[0]
            const directionName = getSpanishDirectionName(firstBoundary)

            for (let i = 0; i < group.length; i++) {
              const b = group[i]
              const normalizedDir = b.normalized_direction || ""
              const rawDir = b.raw_direction || ""

              const isVertical = normalizedDir === "UP" || normalizedDir === "DOWN" ||
                rawDir.toUpperCase() === "UP" || rawDir.toUpperCase() === "DOWN" ||
                rawDir.toUpperCase() === "ARRIBA" || rawDir.toUpperCase() === "ABAJO" ||
                rawDir.toUpperCase() === "SUPERIOR" || rawDir.toUpperCase() === "INFERIOR"

              // Handle length_m: can be null, number, or string - preserve original to maintain exact decimals
              const lengthValue = b.length_m
              const lengthNum = lengthValue === null || lengthValue === undefined
                ? null
                : (typeof lengthValue === "string" ? parseFloat(lengthValue) : (typeof lengthValue === "number" ? lengthValue : parseFloat(String(lengthValue))))
              const hasNoMeasure = lengthNum === null || isNaN(lengthNum) || Math.abs(lengthNum) < 0.001

              const who = (b.abutter || "").toString().trim()
              // Remove leading "CON " if present (prevents "CON CON" duplication)
              const cleanedWho = who.replace(/^\s*CON\s+/i, "").trim()

              if (i === 0) {
                // First boundary in group: show full direction
                if (isVertical && hasNoMeasure) {
                  lines.push(`${directionName}: CON ${cleanedWho}`)
                } else if (hasNoMeasure && lengthNum === null) {
                  lines.push(`${directionName}: CON ${cleanedWho}`)
                } else {
                  const len = lengthValue !== null && lengthValue !== undefined ? formatNumberPreservingDecimals(lengthValue) : "0"
                  lines.push(`${directionName}: EN ${len} m CON ${cleanedWho}`)
                }
              } else {
                // Subsequent boundaries in same group: show only measure and abutter (no direction)
                if (isVertical && hasNoMeasure) {
                  lines.push(`         CON ${cleanedWho}`)
                } else if (hasNoMeasure && lengthNum === null) {
                  lines.push(`         CON ${cleanedWho}`)
                } else {
                  const len = lengthValue !== null && lengthValue !== undefined ? formatNumberPreservingDecimals(lengthValue) : "0"
                  lines.push(`         EN ${len} m CON ${cleanedWho}`)
                }
              }
            }
          }
        }

        return lines.join("\n")
      }

      const formatSurfaceValue = (surfaces?: { name: string; value_m2: number }[]) => {
        if (!Array.isArray(surfaces) || !surfaces.length) return 0
        const preferred =
          surfaces.find((s) => /\b(LOTE|TOTAL)\b/i.test(s.name || "")) ||
          surfaces.find((s) => typeof s.value_m2 === "number" && s.value_m2 > 0)
        return preferred && typeof preferred.value_m2 === "number" ? preferred.value_m2 : 0
      }

      const propertyUnits: PropertyUnit[] = []
      const segmentsMap = new Map<string, TransformedSegment[]>()
      const boundariesTextMap = new Map<string, string>()

      structuredUnits.forEach((unit, index) => {
        // Handle new format (unit_name)
        const unitName = unit.unit_name?.trim() || `UNIDAD ${index + 1}`
        const unitIdBase =
          unitName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "unidad"
        // Aseguramos unicidad usando también el índice
        const unitId = `${unitIdBase}-${index + 1}`
        const surfaceValue = formatSurfaceValue(unit.surfaces)
        const surfaceLabel = surfaceValue > 0 ? `${formatNumberPreservingDecimals(surfaceValue)} m²` : ""

        const boundaries: PropertyUnit["boundaries"] = {
          west: [],
          north: [],
          east: [],
          south: [],
        }

        const mapDirection = (normalizedDir: string, rawDir?: string): keyof PropertyUnit["boundaries"] | null => {
          // Use normalized_direction (short code) if available, else derive from raw_direction or direction
          const dir = normalizedDir || rawDir || ""
          const upper = dir.toUpperCase()

          // Handle new format (short codes)
          if (upper === "W" || upper === "WEST" || upper === "OESTE" || upper === "NW" || upper === "SW") return "west"
          if (upper === "E" || upper === "EAST" || upper === "ESTE" || upper === "NE" || upper === "SE") return "east"
          if (upper === "N" || upper === "NORTH" || upper === "NORTE" || upper === "NE" || upper === "NW") return "north"
          if (upper === "S" || upper === "SOUTH" || upper === "SUR" || upper === "SE" || upper === "SW") return "south"

          // Legacy format fallback
          if (upper.includes("WEST") || upper.includes("OESTE")) return "west"
          if (upper.includes("EAST") || upper.includes("ESTE")) return "east"
          if (upper.includes("NORTH") || upper.includes("NORTE")) return "north"
          if (upper.includes("SOUTH") || upper.includes("SUR")) return "south"

          return null
        }

        // Generate boundaries from directions if available, otherwise use boundaries array
        if (unit.directions && Array.isArray(unit.directions) && unit.directions.length > 0) {
          // Use new format: generate boundaries from directions
          for (const direction of unit.directions) {
            if (!direction.raw_direction || !Array.isArray(direction.segments)) continue

            const normalizedDir = direction.normalized_direction || ""
            const rawDir = direction.raw_direction || ""
            const key = mapDirection(normalizedDir, rawDir)
            if (!key) continue

            for (const segment of direction.segments) {
              boundaries[key].push({
                id: `${unitId}-${key}-${boundaries[key].length}`,
                measurement: segment.length_m === null || segment.length_m === undefined ? "" : String(segment.length_m),
                unit: "M",
                description: `CON ${segment.abutter || ""}`.trim(),
                regionId: "",
              })
            }
          }
        } else {
          // Fallback to boundaries array for backward compatibility
          for (const b of unit.boundaries || []) {
            // Use normalized_direction first, fallback to raw_direction
            const normalizedDir = b.normalized_direction || ""
            const rawDir = b.raw_direction || ""
            const key = mapDirection(normalizedDir, rawDir)
            if (!key) continue
            boundaries[key].push({
              id: `${unitId}-${key}-${boundaries[key].length}`,
              measurement: b.length_m === null || b.length_m === undefined ? "" : String(b.length_m),
              unit: "M",
              description: `CON ${b.abutter || ""}`.trim(),
              regionId: "",
            })
          }
        }

        const propertyUnit: PropertyUnit = {
          id: unitId,
          name: unitName,
          surface: surfaceLabel,
          boundaries,
        }

        propertyUnits.push(propertyUnit)
        segmentsMap.set(unitId, createStructuredSegments(propertyUnit))
      })

      // Construir texto de colindancias por unidad
      structuredUnits.forEach((unit, index) => {
        // Handle new format (unit_name)
        const unitName = unit.unit_name?.trim() || `UNIDAD ${index + 1}`
        const unitIdBase =
          unitName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "unidad"
        const unitId = `${unitIdBase}-${index + 1}`
        const formatted = formatBoundaries(unit)
        if (formatted.trim()) {
          boundariesTextMap.set(unitId, formatted)
        }
      })

      setUnitBoundariesText(boundariesTextMap)

      const firstUnitId = propertyUnits[0]?.id
      const formattedMainBoundaries =
        (firstUnitId && boundariesTextMap.get(firstUnitId)) || ""
      setUnits(propertyUnits)
      setUnitSegments(segmentsMap)

      // Capture initial text for diff stats
      const initialText = Array.from(segmentsMap.values())
        .flatMap((segments) => segments.map((seg) => seg.notarialText))
        .join("\n\n")
      setInitialAiText(initialText)
      latestTextRef.current = initialText // Initialize ref

      // Create initial log record
      if (user?.id) {
        StatsService.logEvent(user.authUserId || user.id, STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED, {
          // NESTED STRUCTURE (Clean JSON from start)
          meta_request: {
            images_count: imageFilesCount,
            has_location: !!data.lotLocation,
            has_surface: !!data.totalLotSurface,
            authorized_units_count: 0 // Initial
          },
          costs_summary: {
            units_cost_usd: 0, // No authorized units yet
            units_tokens_total: 0,
            initial_analysis_cost_usd: usageCost, // Track initial cost separately or sum it
            initial_tokens_total: data.usage?.total_tokens || 0
          },
          quality_metrics: {
            // Will be populated later
          },
          // REMOVED: ai_draft_text (User requested removal)
          status: 'in_progress'
        }, {
          tokensInput: data.usage?.prompt_tokens,
          tokensOutput: data.usage?.completion_tokens,
          estimatedCost: usageCost
        }).then(id => {
          if (id) {
            setProcessingLogId(id)
            processingLogIdRef.current = id
            isLogFinalizedRef.current = false
          }
        })
      }
    } catch (e) {
      console.error("[deslinde] Error processing with AI:", e)

      // If error was already handled with toast (from API error response), don't show duplicate
      // Only show toast here if it's an unexpected error that wasn't caught earlier
      if (e instanceof Error) {
        const errorStr = e.message
        const alreadyHandled = errorStr.includes("invalid_ai_shape") ||
          errorStr.includes("No se puede leer") ||
          errorStr.includes("baja resolución") ||
          errorStr.includes("resolución insuficiente") ||
          errorStr.includes("No valid units found") ||
          errorStr.includes("No se detectaron unidades") ||
          errorStr.includes("AI_PROCESSING_ERROR") ||
          errorStr.includes("AI_RESPONSE_INVALID")

        if (!alreadyHandled) {
          // This is an unexpected error, show generic message
          toast.error("Error inesperado al procesar", {
            description: "Ocurrió un error inesperado. Por favor, intenta de nuevo o contacta soporte.",
            duration: 12000,
            position: "top-center",
            style: {
              background: "linear-gradient(135deg, hsl(var(--destructive)) 0%, hsl(var(--destructive) / 0.95) 100%)",
              color: "hsl(var(--destructive-foreground))",
              border: "2px solid hsl(var(--destructive) / 0.3)",
              borderLeft: "4px solid hsl(var(--destructive-foreground))",
              fontSize: "15px",
              fontWeight: "600",
              padding: "20px 24px",
              borderRadius: "12px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)",
              minWidth: "400px",
              maxWidth: "600px",
            },
            descriptionClassName: "text-sm leading-relaxed opacity-95 mt-2",
          })
        }
      } else {
        // Unknown error type
        toast.error("Error al procesar", {
          description: "Ocurrió un error desconocido. Por favor, intenta de nuevo.",
          duration: 12000,
          position: "top-center",
          style: {
            background: "linear-gradient(135deg, hsl(var(--destructive)) 0%, hsl(var(--destructive) / 0.95) 100%)",
            color: "hsl(var(--destructive-foreground))",
            border: "2px solid hsl(var(--destructive) / 0.3)",
            borderLeft: "4px solid hsl(var(--destructive-foreground))",
            fontSize: "15px",
            fontWeight: "600",
            padding: "20px 24px",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)",
            minWidth: "400px",
            maxWidth: "600px",
          },
          descriptionClassName: "text-sm leading-relaxed opacity-95 mt-2",
        })
      }

      // Update processing status
      update?.("ai", "error")

      // Return user to upload page after a short delay
      setTimeout(() => {
        setAppState("upload")
        setProcessingStarted(false)
      }, 2500)

      // Fallback: create empty unit
      setAiStructuredText(null)
      const unit: PropertyUnit = {
        id: "unit-fallback",
        name: "UNIDAD",
        surface: "",
        boundaries: { west: [], north: [], east: [], south: [] },
      }
      setUnits([unit])
      const segmentsMap = new Map<string, TransformedSegment[]>()
      segmentsMap.set(unit.id, [
        {
          id: "unit-fallback-0",
          originalText: "No se pudo procesar el documento.",
          notarialText: "No se pudo procesar el documento.",
          regionId: "",
          direction: "FALLBACK",
        },
      ])
      setUnitSegments(segmentsMap)
      setUnitBoundariesText(new Map())
    }

    setAppState("validation")
    setProcessingStarted(false)
  }



  // Handle unit authorization logging
  const handleUnitAuthorized = async (unitId: string, data: { final_text: string, original_text: string, usage?: any }) => {
    if (!processingLogId) return

    // Calculate basic metrics from the original (AI) text vs final (authorized) text
    const metricsResult = calculateSimilarity(data.original_text, data.final_text || "")
    const cost = data.usage ? StatsService.calculateEstimatedCost(data.usage) : 0

    // 1. Log detailed row to child table (Normalization)
    await StatsService.logUnitProcessing(processingLogId, {
      unit_id: unitId,
      original_text: data.original_text,
      final_text: data.final_text,
      similarity_score: metricsResult.similarity,
      cost_usd: cost,
      usage: data.usage,
      metrics: {
        edit_distance: metricsResult.distance,
        chars_added: metricsResult.charsAdded,
        chars_removed: metricsResult.charsRemoved
      }
    })

    // 2. Keep minimal stats in memory for global aggregation (no heavy text)
    unitsLogRef.current.set(unitId, {
      unit_id: unitId,
      // original_text: REMOVED
      // final_text: REMOVED
      similarity_score: metricsResult.similarity,
      edit_distance: metricsResult.distance,
      chars_added: metricsResult.charsAdded,
      chars_removed: metricsResult.charsRemoved,
      usage: data.usage,
      cost_usd: cost,
      authorized_at: new Date().toISOString()
    })

    // REMOVED: StatsService.updateEvent for units_detailed (Optimization)

    // [NEW] Check if ALL units are authorized
    if (unitsLogRef.current.size === units.length) {
      // Calculate global metrics
      const notarialText = Array.from(unitSegments.values())
        .flatMap((segments) => segments.map((seg) => seg.notarialText))
        .join("\n\n")

      const metrics = initialAiText
        ? calculateSimilarity(initialAiText, notarialText)
        : { similarity: 1, distance: 0, charsAdded: 0, charsRemoved: 0 }

      // Aggregate global costs from units
      const unitsStats = Array.from(unitsLogRef.current.values())
      const unitsTotalCost = unitsStats.reduce((acc, u) => acc + (u.cost_usd || 0), 0)
      const unitsTotalTokens = unitsStats.reduce((acc, u) => acc + (u.usage?.total_tokens || 0), 0)

      StatsService.updateEvent(processingLogId, {
        status: 'completed',
        completion_method: 'all_units_authorized',

        meta_request: {
          images_count: selectedFiles.length,
          has_location: !!lotLocation,
          has_surface: !!totalLotSurface,
          authorized_units_count: unitsStats.length
        },
        costs_summary: {
          units_cost_usd: unitsTotalCost,
          units_tokens_total: unitsTotalTokens
        },
        quality_metrics: {
          global_similarity: metrics.similarity,
          global_edit_distance: metrics.distance,
          chars_added: metrics.charsAdded,
          chars_removed: metrics.charsRemoved
        }
      })
      isLogFinalizedRef.current = true
    }
  }

  const handleBack = () => {
    // Explicitly handle "Abandon" logic since component doesn't unmount
    if (processingLogId && !isLogFinalizedRef.current) {
      const finalText = Array.from(unitSegments.values())
        .flatMap((segments) => segments.map((seg) => seg.notarialText))
        .join("\n\n")

      StatsService.updateEvent(processingLogId, {
        final_text: finalText,
        status: 'abandoned_or_viewed',
        completion_method: 'navigation_back_button'
      })
      isLogFinalizedRef.current = true
    }

    setAppState("upload")
    setSelectedFiles([])
    if (documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
    }
  }

  const handleExport = () => {
    const notarialText = Array.from(unitSegments.values())
      .flatMap((segments) => segments.map((seg) => seg.notarialText))
      .join("\n\n")

    // Explicitly finalize the log - OPTIONAL safety check or metadata update if needed
    // But primary completion is now triggered by authorization
    if (processingLogId && !isLogFinalizedRef.current) {
      // We leave this as a fallback if they export before authorizing everything (unlikely if UI prevents it)
      StatsService.updateEvent(processingLogId, {
        completion_method: 'export_fallback'
      })
    }

    const blob = new Blob([notarialText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "documento-notarial.txt"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }


  if (appState === "processing") {
    const watchdogMs = 120000 // 2 minutes for image processing
    const processSteps = [
      { key: "ai", label: "Análisis con IA (OpenAI Vision)" },
    ]
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <Button variant="ghost" onClick={handleBack} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              {selectedFiles.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Procesando: <span className="font-medium">{selectedFiles.length} imagen(es)</span>
                </div>
              )}
            </div>
            <ProcessingScreen
              fileName={selectedFiles.length > 0 ? selectedFiles.map(f => f.name).join(", ") : ""}
              onRun={async (update) => {
                try {
                  await handleProcessingComplete(update)
                } catch (error) {
                  // Error toast is already shown in handleProcessingComplete
                  // Just update the processing status
                  update("ai", "error")
                }
              }}
              onComplete={() => setAppState("validation")}
              watchdogMs={watchdogMs}
              steps={processSteps}
            />
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  if (appState === "validation") {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <ValidationWizard
            documentUrl={documentUrl}
            images={selectedFiles}
            units={units}
            unitSegments={unitSegments}
            onBack={handleBack}
            fileName={selectedFiles.length > 0 ? selectedFiles.map(f => f.name).join(", ") : undefined}
            aiStructuredText={aiStructuredText || undefined}
            ocrConfidence={ocrConfidence ?? undefined}
            ocrRotationHint={ocrRotationHint ?? undefined}
            unitBoundariesText={Object.fromEntries(unitBoundariesText)}
            lotLocation={lotLocation}
            totalLotSurface={totalLotSurface}
            onUnitAuthorized={handleUnitAuthorized}
          />
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-3 sm:p-4 md:p-6">
          {/* Header - More subtle */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 break-words">Lectura de Plantas Arquitectónicas</h1>
            <p className="text-gray-600 text-sm mt-1">
              Sube tus planos y genera descripciones notariales precisas en segundos.
            </p>
          </div>
          {/* How it Works Section - Bottom */}
          <div className="bg-gradient-to-br from-primary/5 via-primary/3 to-background rounded-lg border border-primary/10 p-4 md:p-5">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-foreground mb-1">¿Cómo empezar?</h2>
              <p className="text-xs text-muted-foreground">
                Sigue estos pasos y deja que nuestra IA redacte la descripción notarial por ti.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="p-3 border border-primary/20 bg-card/50 hover:border-primary/40 transition-all">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-gray-800  w-7 h-7 flex items-center justify-center flex-shrink-0">
                      <div className="rounded-full bg-blue-500/30 text-primary-foreground w-7 h-7 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        1
                      </div>
                    </div>
                    <h3 className="font-medium text-sm">Sube tus documentos</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Arrastra imágenes o PDFs. También puedes pegarlas desde el portapapeles.
                  </p>
                </div>
              </Card>

              <Card className="p-3 border border-primary/20 bg-card/50 hover:border-primary/40 transition-all">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-gray-800  w-7 h-7 flex items-center justify-center flex-shrink-0">
                      <div className="rounded-full bg-blue-500/30 text-primary-foreground w-7 h-7 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        2
                      </div>
                    </div>
                    <h3 className="font-medium text-sm">Procesa con IA</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    La IA extrae automáticamente medidas, colindancias y superficies.
                  </p>
                </div>
              </Card>

              <Card className="p-3 border border-primary/20 bg-card/50 hover:border-primary/40 transition-all">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-gray-800  w-7 h-7 flex items-center justify-center flex-shrink-0">
                      <div className="rounded-full bg-blue-500/30 text-primary-foreground w-7 h-7 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        3
                      </div>
                    </div>
                    <h3 className="font-medium text-sm">Revisa y edita</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Valida la información y edita el texto notarial según tus necesidades.
                  </p>
                </div>
              </Card>

              <Card className="p-3 border border-primary/20 bg-card/50 hover:border-primary/40 transition-all">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-gray-800  w-7 h-7 flex items-center justify-center flex-shrink-0">
                      <div className="rounded-full bg-blue-500/30 text-primary-foreground w-7 h-7 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        4
                      </div>
                    </div>
                    <h3 className="font-medium text-sm">Exporta el resultado</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Obtén tu documento final en formato notarial listo para usar.
                  </p>
                </div>
              </Card>
            </div>
          </div>

          {/* Main Layout: Upload Zone (prominent) with Selected Images inside */}
          <div className="space-y-4 sm:space-y-6 mt-4">
            {/* Upload Zone with Selected Images inside */}
            <div className="min-h-[300px] sm:min-h-[450px] flex flex-col items-center justify-center">
              <div className="w-full">
                <UploadZone
                  onFilesSelect={handleFilesSelect}
                  onFilesChange={handleFilesChange}
                  onProcess={handleProcessImages}
                  files={selectedFiles}
                  disableProcess={showPdfImageSelector}
                />
              </div>
            </div>
          </div>


          {/* PDF Image Selection Modal */}
          <Dialog open={showPdfImageSelector} onOpenChange={(open) => {
            if (!open) {
              // When modal is closed (via ESC, click outside, etc.), cancel the selection
              handleCancelPdfImageSelection()
            } else {
              setShowPdfImageSelector(true)
            }
          }}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Selecciona las imágenes del PDF</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Se encontraron {pdfConvertedImages.length} página(s) en el PDF. Selecciona las que deseas procesar.
                </p>
              </DialogHeader>

              <div className="space-y-4">
                {/* Select All / Deselect All buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllPdfImages}
                      className="gap-1 h-8 px-2 shrink-0 hover:bg-gray-200 hover:text-foreground"
                    >
                      Seleccionar todas
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deselectAllPdfImages}
                      className="gap-1 h-8 px-2 shrink-0 hover:bg-gray-200 hover:text-foreground"
                    >
                      Deseleccionar todas
                    </Button>
                  </div>
                </div>

                {/* Images Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {pdfConvertedImages.map((image, index) => {
                    const rotation = imageRotations.get(index) || 0
                    const hasCrop = imageCrops.has(index)
                    return (
                      <PdfImageCard
                        key={index}
                        image={image}
                        index={index}
                        isSelected={selectedPdfImages.has(index)}
                        onToggle={() => togglePdfImageSelection(index)}
                        rotation={rotation}
                        onEdit={handleCropImage}
                        hasCrop={hasCrop}
                      />
                    )
                  })}
                </div>

                <p className="text-sm text-muted-foreground">
                  {selectedPdfImages.size} de {pdfConvertedImages.length} seleccionadas
                </p>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCancelPdfImageSelection}
                  className="gap-1 px-2 shrink-0 hover:bg-gray-200 hover:text-foreground"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmPdfImageSelection}
                  disabled={selectedPdfImages.size === 0}
                  className="bg-gray-800 hover:bg-gray-700 text-white font-bold p-2.5"
                >
                  Agregar {selectedPdfImages.size > 0 ? `${selectedPdfImages.size} ` : ''}imagen{selectedPdfImages.size !== 1 ? 'es' : ''}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Area Selection Dialog */}
          <Dialog open={showCropDialog} onOpenChange={setShowCropDialog}>
            <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-xl">Seleccionar área de procesamiento</DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Selecciona el área de la imagen que deseas procesar. Solo esa área será enviada para el análisis.
                </p>
              </DialogHeader>

              {currentCropIndex !== null && pdfConvertedImages[currentCropIndex] && (
                <ImageCropEditor
                  image={pdfConvertedImages[currentCropIndex]}
                  rotation={imageRotations.get(currentCropIndex) || 0}
                  initialCrop={imageCrops.get(currentCropIndex)}
                  onSave={handleSaveCrop}
                  onCancel={handleCancelCrop}
                  onRotationChange={(newRotation) => {
                    if (currentCropIndex !== null) {
                      setImageRotations(prev => {
                        const newRotations = new Map(prev)
                        newRotations.set(currentCropIndex, newRotation)
                        return newRotations
                      })
                    }
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}

// Area Selection Editor Component with advanced controls
function ImageCropEditor({
  image,
  rotation = 0,
  initialCrop,
  onSave,
  onCancel,
  onRotationChange
}: {
  image: File
  rotation?: number
  initialCrop?: { x: number; y: number; width: number; height: number }
  onSave: (cropArea: { x: number; y: number; width: number; height: number }) => void
  onCancel: () => void
  onRotationChange?: (rotation: number) => void
}) {
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null)
  const [rotatedImageUrl, setRotatedImageUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isResizing, setIsResizing] = useState<string | null>(null) // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [initialCropArea, setInitialCropArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [cropArea, setCropArea] = useState<{ x: number; y: number; width: number; height: number } | null>(
    initialCrop || null
  )
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(image)
    setOriginalImageUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [image])

  // Apply rotation to image for display
  useEffect(() => {
    if (!originalImageUrl || rotation === 0) {
      setRotatedImageUrl(originalImageUrl)
      return
    }

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setRotatedImageUrl(originalImageUrl)
        return
      }

      // Configure canvas for high-quality rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // Calculate new dimensions based on rotation
      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      // Rotate and draw
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      const rotatedUrl = canvas.toDataURL('image/png', 1.0)
      setRotatedImageUrl(rotatedUrl)

      // Update image size based on rotated dimensions
      setImageSize({ width: canvas.width, height: canvas.height })
    }

    img.onerror = () => {
      setRotatedImageUrl(originalImageUrl)
    }

    img.src = originalImageUrl
  }, [originalImageUrl, rotation])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    // If already set from rotation effect, don't override
    if (!imageSize) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    if (!cropArea && initialCrop) {
      setCropArea(initialCrop)
    }
  }

  const imageSizeRef = useRef(imageSize)
  useEffect(() => {
    imageSizeRef.current = imageSize
  }, [imageSize])

  const getRelativePos = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !imageRef.current || !imageSizeRef.current) return null

    // getBoundingClientRect already accounts for CSS transforms (zoom and pan)
    const imgRect = imageRef.current.getBoundingClientRect()

    // Calculate position relative to the displayed image
    const scaleX = imageSizeRef.current.width / imgRect.width
    const scaleY = imageSizeRef.current.height / imgRect.height

    const x = (clientX - imgRect.left) * scaleX
    const y = (clientY - imgRect.top) * scaleY

    // Clamp to image bounds
    return {
      x: Math.max(0, Math.min(imageSizeRef.current.width, x)),
      y: Math.max(0, Math.min(imageSizeRef.current.height, y))
    }
  }, [])

  // Check if clicking on resize handle
  const getHandleAtPos = (clientX: number, clientY: number, displayCrop: { left: number; top: number; width: number; height: number }) => {
    if (!containerRef.current) return null

    const containerRect = containerRef.current.getBoundingClientRect()
    const x = clientX - containerRect.left
    const y = clientY - containerRect.top

    const handleSize = 12
    const handles = {
      nw: { x: displayCrop.left, y: displayCrop.top },
      ne: { x: displayCrop.left + displayCrop.width, y: displayCrop.top },
      sw: { x: displayCrop.left, y: displayCrop.top + displayCrop.height },
      se: { x: displayCrop.left + displayCrop.width, y: displayCrop.top + displayCrop.height },
      n: { x: displayCrop.left + displayCrop.width / 2, y: displayCrop.top },
      s: { x: displayCrop.left + displayCrop.width / 2, y: displayCrop.top + displayCrop.height },
      e: { x: displayCrop.left + displayCrop.width, y: displayCrop.top + displayCrop.height / 2 },
      w: { x: displayCrop.left, y: displayCrop.top + displayCrop.height / 2 },
    }

    for (const [handle, pos] of Object.entries(handles)) {
      if (Math.abs(x - pos.x) < handleSize && Math.abs(y - pos.y) < handleSize) {
        return handle
      }
    }
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSize || !containerRef.current || !imageRef.current) return

    const displayCrop = getDisplayCrop()

    // Check if clicking on pan area (with shift key or middle mouse)
    if (e.shiftKey || e.button === 1) {
      setIsPanning(true)
      setStartPos({ x: e.clientX, y: e.clientY })
      return
    }

    // Check if clicking on existing crop area
    if (displayCrop && cropArea && cropArea.width > 0 && cropArea.height > 0) {
      // Check if clicking on resize handle
      const handle = getHandleAtPos(e.clientX, e.clientY, displayCrop)
      if (handle) {
        setIsResizing(handle)
        // Store initial mouse position and crop area for resizing
        const pos = getRelativePos(e.clientX, e.clientY)
        if (pos && cropArea) {
          setStartPos(pos)
          setInitialCropArea({ ...cropArea })
        }
        return
      }

      // Check if clicking inside crop area (to move it)
      const containerRect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - containerRect.left
      const y = e.clientY - containerRect.top

      if (x >= displayCrop.left && x <= displayCrop.left + displayCrop.width &&
        y >= displayCrop.top && y <= displayCrop.top + displayCrop.height) {
        setIsMoving(true)
        const pos = getRelativePos(e.clientX, e.clientY)
        if (pos) {
          setStartPos(pos)
        }
        return
      }
    }

    // Start new selection
    const pos = getRelativePos(e.clientX, e.clientY)
    if (!pos) return

    setIsDragging(true)
    setStartPos(pos)
    setCropArea({ x: pos.x, y: pos.y, width: 0, height: 0 })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!startPos || !imageSizeRef.current) return

    // Handle panning
    if (isPanning) {
      const deltaX = e.clientX - startPos.x
      const deltaY = e.clientY - startPos.y
      setPan(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }))
      setStartPos({ x: e.clientX, y: e.clientY })
      return
    }

    // Handle resizing
    if (isResizing && initialCropArea && startPos) {
      const pos = getRelativePos(e.clientX, e.clientY)
      if (!pos) return

      let newArea = { ...initialCropArea }
      const deltaX = pos.x - startPos.x
      const deltaY = pos.y - startPos.y

      switch (isResizing) {
        case 'nw':
          newArea.x = Math.max(0, initialCropArea.x + deltaX)
          newArea.y = Math.max(0, initialCropArea.y + deltaY)
          newArea.width = initialCropArea.width - deltaX
          newArea.height = initialCropArea.height - deltaY
          break
        case 'ne':
          newArea.y = Math.max(0, initialCropArea.y + deltaY)
          newArea.width = initialCropArea.width + deltaX
          newArea.height = initialCropArea.height - deltaY
          break
        case 'sw':
          newArea.x = Math.max(0, initialCropArea.x + deltaX)
          newArea.width = initialCropArea.width - deltaX
          newArea.height = initialCropArea.height + deltaY
          break
        case 'se':
          newArea.width = initialCropArea.width + deltaX
          newArea.height = initialCropArea.height + deltaY
          break
        case 'n':
          newArea.y = Math.max(0, initialCropArea.y + deltaY)
          newArea.height = initialCropArea.height - deltaY
          break
        case 's':
          newArea.height = initialCropArea.height + deltaY
          break
        case 'e':
          newArea.width = initialCropArea.width + deltaX
          break
        case 'w':
          newArea.x = Math.max(0, initialCropArea.x + deltaX)
          newArea.width = initialCropArea.width - deltaX
          break
      }

      // Ensure minimum size
      if (newArea.width > 10 && newArea.height > 10) {
        // Clamp to image bounds
        if (newArea.x < 0) {
          newArea.width += newArea.x
          newArea.x = 0
        }
        if (newArea.y < 0) {
          newArea.height += newArea.y
          newArea.y = 0
        }
        if (newArea.x + newArea.width > imageSizeRef.current.width) {
          newArea.width = imageSizeRef.current.width - newArea.x
        }
        if (newArea.y + newArea.height > imageSizeRef.current.height) {
          newArea.height = imageSizeRef.current.height - newArea.y
        }

        // Only set if still valid after clamping
        if (newArea.width > 10 && newArea.height > 10) {
          setCropArea(newArea)
        }
      }
      return
    }

    // Handle moving existing crop
    if (isMoving && cropArea && cropArea.width > 0 && cropArea.height > 0) {
      const pos = getRelativePos(e.clientX, e.clientY)
      if (!pos || !startPos) return

      const deltaX = pos.x - startPos.x
      const deltaY = pos.y - startPos.y

      const newX = Math.max(0, Math.min(imageSizeRef.current.width - cropArea.width, cropArea.x + deltaX))
      const newY = Math.max(0, Math.min(imageSizeRef.current.height - cropArea.height, cropArea.y + deltaY))

      setCropArea({ ...cropArea, x: newX, y: newY })
      setStartPos(pos)
      return
    }

    // Handle creating new selection
    if (isDragging) {
      const pos = getRelativePos(e.clientX, e.clientY)
      if (!pos) return

      const width = pos.x - startPos.x
      const height = pos.y - startPos.y

      const newX = Math.max(0, Math.min(startPos.x, startPos.x + width))
      const newY = Math.max(0, Math.min(startPos.y, startPos.y + height))
      const newWidth = Math.max(10, Math.min(imageSizeRef.current.width - newX, Math.abs(width)))
      const newHeight = Math.max(10, Math.min(imageSizeRef.current.height - newY, Math.abs(height)))

      setCropArea({
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      })
    }
  }, [isDragging, isMoving, isResizing, isPanning, startPos, cropArea, getRelativePos])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsMoving(false)
    setIsResizing(null)
    setIsPanning(false)
    setInitialCropArea(null)
  }, [])

  useEffect(() => {
    if (isDragging || isMoving || isResizing || isPanning) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isMoving, isResizing, isPanning, handleMouseMove, handleMouseUp])

  // Reset crop area to full image
  const handleSelectAll = () => {
    if (imageSize) {
      setCropArea({
        x: 0,
        y: 0,
        width: imageSize.width,
        height: imageSize.height
      })
      setZoom(1.0)
      setPan({ x: 0, y: 0 })
    }
  }

  // Reset zoom and pan
  const handleResetView = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  const getDisplayCrop = () => {
    if (!cropArea || !imageSize || !imageRef.current || !containerRef.current) return null

    // Since the image is inside a div with transform, we need to calculate based on the container
    const containerRect = containerRef.current.getBoundingClientRect()
    const imgRect = imageRef.current.getBoundingClientRect()

    // The image is centered and then transformed, so we need to find its actual position
    // The transform applies: translate(pan.x, pan.y) scale(zoom) with origin center
    // So the image's actual position relative to container is:
    const containerCenterX = containerRect.width / 2
    const containerCenterY = containerRect.height / 2

    // Image natural size scaled
    const scaledWidth = imgRect.width / zoom * zoom
    const scaledHeight = imgRect.height / zoom * zoom

    // Image position accounting for centering and transform
    const imgActualLeft = containerCenterX - scaledWidth / 2 + pan.x
    const imgActualTop = containerCenterY - scaledHeight / 2 + pan.y

    // Scale factor from image coordinates to display coordinates
    const scaleX = scaledWidth / imageSize.width
    const scaleY = scaledHeight / imageSize.height

    return {
      left: imgActualLeft + cropArea.x * scaleX,
      top: imgActualTop + cropArea.y * scaleY,
      width: cropArea.width * scaleX,
      height: cropArea.height * scaleY
    }
  }

  const displayCrop = getDisplayCrop()

  const getCursor = () => {
    if (isPanning) return 'move'
    if (isResizing) {
      const cursors: Record<string, string> = {
        'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
        'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize'
      }
      return cursors[isResizing] || 'crosshair'
    }
    if (isMoving) return 'move'
    if (isDragging) return 'crosshair'
    return 'crosshair'
  }

  const handleRotateLeft = useCallback(() => {
    const newRotation = ((rotation || 0) - 90 + 360) % 360
    if (onRotationChange) {
      onRotationChange(newRotation)
    }
  }, [rotation, onRotationChange])

  const handleRotateRight = useCallback(() => {
    const newRotation = ((rotation || 0) + 90) % 360
    if (onRotationChange) {
      onRotationChange(newRotation)
    }
  }, [rotation, onRotationChange])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
            disabled={zoom <= 0.5}
            title="Alejar"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[65px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom(prev => Math.min(3.0, prev + 0.1))}
            disabled={zoom >= 3.0}
            title="Acercar"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetView}
            title="Resetear zoom y posición"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
          >
            Seleccionar toda la imagen
          </Button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* Rotation controls */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRotateLeft}
            title="Rotar 90° izquierda"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[60px] text-center">
            {rotation !== 0 ? `${rotation}°` : '0°'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRotateRight}
            title="Rotar 90° derecha"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground w-full mt-2">
          {isPanning ? 'Arrastra para mover la vista' :
            isResizing ? 'Arrastra para redimensionar' :
              isMoving ? 'Arrastra para mover el área' :
                'Arrastra para seleccionar | Shift+arrastra para mover vista'}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-muted rounded-lg"
        onMouseDown={handleMouseDown}
        style={{ cursor: getCursor() }}
        onWheel={(e) => {
          e.preventDefault()
          const delta = e.deltaY > 0 ? -0.1 : 0.1
          setZoom(prev => Math.max(0.5, Math.min(3.0, prev + delta)))
        }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }}
        >
          {rotatedImageUrl && (
            <>
              <img
                ref={imageRef}
                src={rotatedImageUrl}
                alt="Imagen para seleccionar área"
                className="max-w-full max-h-full object-contain"
                onLoad={handleImageLoad}
                draggable={false}
              />
              {displayCrop && displayCrop.width > 0 && displayCrop.height > 0 && (
                <>
                  {/* Dimmed overlay outside crop area */}
                  <div
                    className="absolute inset-0 bg-black/40 pointer-events-none"
                    style={{
                      clipPath: `polygon(
                        0% 0%,
                        0% 100%,
                        ${displayCrop.left}px 100%,
                        ${displayCrop.left}px ${displayCrop.top}px,
                        ${displayCrop.left + displayCrop.width}px ${displayCrop.top}px,
                        ${displayCrop.left + displayCrop.width}px ${displayCrop.top + displayCrop.height}px,
                        ${displayCrop.left}px ${displayCrop.top + displayCrop.height}px,
                        ${displayCrop.left}px 100%,
                        100% 100%,
                        100% 0%
                      )`
                    }}
                  />
                  {/* Selection area border */}
                  <div
                    className="absolute border-2 border-primary bg-primary/5 pointer-events-none"
                    style={{
                      left: `${displayCrop.left}px`,
                      top: `${displayCrop.top}px`,
                      width: `${displayCrop.width}px`,
                      height: `${displayCrop.height}px`
                    }}
                  />
                  {/* Resize handles */}
                  {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((handle) => {
                    const handleSize = 12
                    const positions: Record<string, { left: number; top: number }> = {
                      nw: { left: displayCrop.left, top: displayCrop.top },
                      ne: { left: displayCrop.left + displayCrop.width, top: displayCrop.top },
                      sw: { left: displayCrop.left, top: displayCrop.top + displayCrop.height },
                      se: { left: displayCrop.left + displayCrop.width, top: displayCrop.top + displayCrop.height },
                      n: { left: displayCrop.left + displayCrop.width / 2, top: displayCrop.top },
                      s: { left: displayCrop.left + displayCrop.width / 2, top: displayCrop.top + displayCrop.height },
                      e: { left: displayCrop.left + displayCrop.width, top: displayCrop.top + displayCrop.height / 2 },
                      w: { left: displayCrop.left, top: displayCrop.top + displayCrop.height / 2 },
                    }
                    const pos = positions[handle]
                    const cursors: Record<string, string> = {
                      'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
                      'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize'
                    }
                    return (
                      <div
                        key={handle}
                        className="absolute bg-primary border-2 border-white rounded-full pointer-events-auto"
                        style={{
                          left: `${pos.left - handleSize / 2}px`,
                          top: `${pos.top - handleSize / 2}px`,
                          width: `${handleSize}px`,
                          height: `${handleSize}px`,
                          cursor: cursors[handle]
                        }}
                      />
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {cropArea && cropArea.width > 0 && cropArea.height > 0 && (
        <div className="mt-4 text-sm text-muted-foreground text-center">
          Área seleccionada: {Math.round(cropArea.width)} × {Math.round(cropArea.height)} px
          {imageSize && (
            <span className="ml-2">
              ({(cropArea.width / imageSize.width * 100).toFixed(1)}% × {(cropArea.height / imageSize.height * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      )}

      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            if (cropArea && cropArea.width > 0 && cropArea.height > 0) {
              onSave(cropArea)
            }
          }}
          disabled={!cropArea || cropArea.width === 0 || cropArea.height === 0}
        >
          Seleccionar esta área
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function DeslindePage() {
  return (
    <Suspense fallback={null}>
      <DeslindePageInner />
    </Suspense>
  )
}
