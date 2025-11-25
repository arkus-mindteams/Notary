"use client"

import { Suspense, useEffect, useState } from "react"
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
import { FileText, Scale, Shield, ArrowLeft, X, ImageIcon, Play, Check, CheckSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
type AppState = "upload" | "processing" | "validation"

// Component for PDF image selection card
function PdfImageCard({ 
  image, 
  index, 
  isSelected, 
  onToggle 
}: { 
  image: File
  index: number
  isSelected: boolean
  onToggle: () => void
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  
  useEffect(() => {
    const url = URL.createObjectURL(image)
    setImageUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [image])
  
  return (
    <Card
      className={`p-3 cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onToggle}
    >
      <div className="space-y-2">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Página ${index + 1}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-2 right-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isSelected ? 'bg-primary text-primary-foreground' : 'bg-background/80'
            }`}>
              {isSelected && <Check className="h-4 w-4" />}
            </div>
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
            onClick={(e) => e.stopPropagation()}
          >
            Página {index + 1}
          </label>
        </div>
      </div>
    </Card>
  )
}

function DeslindePageInner() {
  const [appState, setAppState] = useState<AppState>("upload")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [documentUrl, setDocumentUrl] = useState<string>("")
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map())
  const [units, setUnits] = useState<PropertyUnit[]>([])
  const [unitSegments, setUnitSegments] = useState<Map<string, TransformedSegment[]>>(new Map())
  const [processingStarted, setProcessingStarted] = useState(false)
  const [aiStructuredText, setAiStructuredText] = useState<string | null>(null)
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)
  const [ocrRotationHint, setOcrRotationHint] = useState<number | null>(null)
  const [unitBoundariesText, setUnitBoundariesText] = useState<Map<string, string>>(new Map())
  const [lotLocation, setLotLocation] = useState<string | null>(null)
  const [totalLotSurface, setTotalLotSurface] = useState<number | null>(null)
  const [pdfConvertedImages, setPdfConvertedImages] = useState<File[]>([])
  const [selectedPdfImages, setSelectedPdfImages] = useState<Set<number>>(new Set())
  const [showPdfImageSelector, setShowPdfImageSelector] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams?.get("reset") === "1") {
      setAppState("upload")
      setSelectedFiles([])
      if (documentUrl && !documentUrl.startsWith("/")) {
        URL.revokeObjectURL(documentUrl)
      }
      // Clean up thumbnail URLs
      setThumbnailUrls((prev) => {
        prev.forEach((url) => {
          if (!url.startsWith("/")) {
            URL.revokeObjectURL(url)
          }
        })
        return new Map()
      })
      router.replace("/dashboard/deslinde")
    }
  }, [searchParams, documentUrl, router])

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
          setShowPdfImageSelector(true)
          // Don't add images yet - wait for user selection
        }
      } catch (error) {
        console.error('[deslinde] Error converting PDFs:', error)
        alert('Error al convertir PDFs a imágenes. Por favor, intenta con imágenes directamente.')
        return
      }
    }
    
    // Add regular image files immediately (not from PDF conversion)
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
        
        // Update preview with first image if we didn't have one
        if (combinedFiles.length > 0 && (!documentUrl || documentUrl.startsWith("/"))) {
          const url = URL.createObjectURL(combinedFiles[0])
          setDocumentUrl(url)
        }
        
        return combinedFiles
      })
    }
  }
  
  const handleConfirmPdfImageSelection = () => {
    // Add only selected images from PDF conversion
    const selectedImages = Array.from(selectedPdfImages)
      .map(index => pdfConvertedImages[index])
      .filter(Boolean)
    
    if (selectedImages.length > 0) {
      setSelectedFiles((prevFiles) => {
        const existingFiles = prevFiles || []
        const newFiles = selectedImages.filter(
          (newFile) =>
            !existingFiles.some(
              (existingFile) =>
                existingFile.name === newFile.name && existingFile.size === newFile.size
            )
        )
        
        const combinedFiles = [...existingFiles, ...newFiles]
        
        // Update preview with first image if we didn't have one
        if (combinedFiles.length > 0 && (!documentUrl || documentUrl.startsWith("/"))) {
          const url = URL.createObjectURL(combinedFiles[0])
          setDocumentUrl(url)
        }
        
        return combinedFiles
      })
    }
    
    // Close modal and reset
    setShowPdfImageSelector(false)
    setPdfConvertedImages([])
    setSelectedPdfImages(new Set())
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

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prevFiles) => {
      const newFiles = prevFiles.filter((_, i) => i !== index)
      
      // Update preview if we removed the first image
      if (newFiles.length > 0 && index === 0) {
        if (documentUrl && !documentUrl.startsWith("/")) {
          URL.revokeObjectURL(documentUrl)
        }
        const url = URL.createObjectURL(newFiles[0])
        setDocumentUrl(url)
      } else if (newFiles.length === 0) {
        // No more files, revoke URL
    if (documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
    }
        setDocumentUrl("")
      }
      
      return newFiles
    })
  }

  const handleProcessImages = () => {
    if (selectedFiles.length === 0) return
    
    setProcessingStarted(false)
    setAiStructuredText(null)
    setUnits([])
    setUnitSegments(new Map())
    setUnitBoundariesText(new Map())
    setAppState("processing")
  }

  const handleProcessingComplete = async (update?: (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => void) => {
    if (!selectedFiles || selectedFiles.length === 0) return
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
      update?.("ai", "in_progress", `Analizando ${selectedFiles.length} imagen(es)...`)
      
      // Send images as FormData
      // Add forceRefresh parameter to bypass cache if needed
      // You can add a UI toggle to control this
      const formData = new FormData()
      selectedFiles.forEach((image) => {
        formData.append("images", image)
      })
      // Optionally force refresh to bypass cache (useful for debugging)
      // formData.append("forceRefresh", "true")
      
      const resp = await fetch("/api/ai/structure", {
        method: "POST",
        body: formData,
      })
      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(errorText || `HTTP ${resp.status}`)
      }
      const data = (await resp.json()) as StructuringResponse
      console.log("[deslinde] AI response received:", {
        unitsCount: data.results?.length || 0,
        hasLocation: !!data.lotLocation,
        hasSurface: !!data.totalLotSurface,
      })
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
              const lengthNum = segment.length_m === null || segment.length_m === undefined 
                ? null 
                : (typeof segment.length_m === "number" ? segment.length_m : parseFloat(String(segment.length_m)))
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
                  const len = lengthNum.toFixed(3)
                  if (lengthPrefix === "LC=") {
                    firstLine = `${directionName}: LC=${len} m CON ${cleanedWho}`
                  } else if (lengthPrefix === "EN" || lengthPrefix === "") {
                    // No mostrar "EN" cuando el prefijo es "EN" o está vacío
                    firstLine = `${directionName}: ${len} m CON ${cleanedWho}`
                  } else {
                    firstLine = `${directionName}: ${lengthPrefix} ${len} m CON ${cleanedWho}`
                  }
                } else {
                  const len = lengthNum !== null ? lengthNum.toFixed(3) : "0.000"
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
                  const len = lengthNum.toFixed(3)
                  if (lengthPrefix === "LC=") {
                    lines.push(`${indent}LC=${len} m CON ${cleanedWho}`)
                  } else if (lengthPrefix === "EN" || lengthPrefix === "") {
                    // No mostrar "EN" cuando el prefijo es "EN" o está vacío
                    lines.push(`${indent}${len} m CON ${cleanedWho}`)
                  } else {
                    lines.push(`${indent}${lengthPrefix} ${len} m CON ${cleanedWho}`)
                  }
                } else {
                  const len = lengthNum !== null ? lengthNum.toFixed(3) : "0.000"
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
            
            // Handle length_m: can be null, number, or string
            const lengthNum = b.length_m === null || b.length_m === undefined 
              ? null 
              : (typeof b.length_m === "number" ? b.length_m : parseFloat(String(b.length_m)))
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
                const len = lengthNum !== null ? lengthNum.toFixed(3) : "0.000"
                lines.push(`${directionName}: EN ${len} m CON ${cleanedWho}`)
              }
            } else {
              // Subsequent boundaries in same group: show only measure and abutter (no direction)
              if (isVertical && hasNoMeasure) {
                lines.push(`         CON ${cleanedWho}`)
              } else if (hasNoMeasure && lengthNum === null) {
                lines.push(`         CON ${cleanedWho}`)
              } else {
                const len = lengthNum !== null ? lengthNum.toFixed(3) : "0.000"
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
        const surfaceLabel = surfaceValue > 0 ? `${surfaceValue.toFixed(3)} m²` : ""

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
      setAiStructuredText(formattedMainBoundaries || null)
      setUnits(propertyUnits)
      setUnitSegments(segmentsMap)
    } catch (e) {
      console.error("[deslinde] Error processing with AI:", e)
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

  const handleBack = () => {
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
                } catch {
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
          />
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 break-words">Lectura de Plantas Arquitectónicas</h1>
            <p className="text-gray-600 mt-1">
              Procesa plantas arquitectónicas y genera texto notarial automáticamente
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center gap-3 p-6 rounded-lg bg-card border">
              <div className="rounded-full bg-primary/10 p-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Extracción Automática</h3>
              <p className="text-sm text-muted-foreground">
                Extrae medidas y colindancias de imágenes de planos arquitectónicos
              </p>
            </div>

            <div className="flex flex-col items-center text-center gap-3 p-6 rounded-lg bg-card border">
              <div className="rounded-full bg-primary/10 p-3">
                <Scale className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Conversión Notarial</h3>
              <p className="text-sm text-muted-foreground">Transforma automáticamente a lenguaje notarial formal</p>
            </div>

            <div className="flex flex-col items-center text-center gap-3 p-6 rounded-lg bg-card border">
              <div className="rounded-full bg-primary/10 p-3">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Validación Visual</h3>
              <p className="text-sm text-muted-foreground">Compara y valida con resaltado sincronizado</p>
            </div>
          </div>

          {/* Upload Zone */}
          <UploadZone onFilesSelect={handleFilesSelect} />

          {/* PDF Image Selection Modal */}
          <Dialog open={showPdfImageSelector} onOpenChange={setShowPdfImageSelector}>
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
                    >
                      Seleccionar todas
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deselectAllPdfImages}
                    >
                      Deseleccionar todas
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedPdfImages.size} de {pdfConvertedImages.length} seleccionadas
                  </p>
                </div>

                {/* Images Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {pdfConvertedImages.map((image, index) => (
                    <PdfImageCard
                      key={index}
                      image={image}
                      index={index}
                      isSelected={selectedPdfImages.has(index)}
                      onToggle={() => togglePdfImageSelection(index)}
                    />
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCancelPdfImageSelection}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmPdfImageSelection}
                  disabled={selectedPdfImages.size === 0}
                >
                  Agregar {selectedPdfImages.size > 0 ? `${selectedPdfImages.size} ` : ''}imagen{selectedPdfImages.size !== 1 ? 'es' : ''}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Selected Images List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Imágenes seleccionadas ({selectedFiles.length})
                </h3>
                <Button onClick={handleProcessImages} size="lg" className="gap-2">
                  <Play className="h-4 w-4" />
                  Procesar imágenes
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedFiles.map((file, index) => {
                  const imageUrl = thumbnailUrls.get(index)
                  return (
                    <Card key={`${file.name}-${file.size}-${index}`} className="p-4 relative group">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => handleRemoveFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-muted/30 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">Cómo funciona</h3>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  1
                </span>
                <span>Sube una o más imágenes del plano arquitectónico con información de plantas arquitectónicas</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  2
                </span>
                <span>Haz clic en "Procesar imágenes" para que el sistema extraiga automáticamente las medidas y colindancias</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  3
                </span>
                <span>Revisa y edita el texto notarial generado en la vista de validación</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  4
                </span>
                <span>Exporta el documento final en formato notarial</span>
              </li>
            </ol>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}

export default function DeslindePage() {
  return (
    <Suspense fallback={null}>
      <DeslindePageInner />
    </Suspense>
  )
}
