"use client"
import { Button } from "@/components/ui/button"
import { Lock, Unlock, AlertCircle } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import type { TransformedSegment } from "@/lib/text-transformer"
import { EditableSegment } from "./editable-segment"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"

interface TextSegmentPanelProps {
  title: string
  subtitle?: string
  segments: TransformedSegment[]
  highlightedRegion: string | null
  onSegmentHover: (regionId: string | null) => void
  editable?: boolean
  onSegmentsChange?: (segments: TransformedSegment[]) => void
  unitRegionId?: string
  unitId?: string
}

export function TextSegmentPanel({
  title,
  subtitle,
  segments,
  highlightedRegion,
  onSegmentHover,
  editable = false,
  onSegmentsChange,
  unitRegionId,
  unitId = "",
}: TextSegmentPanelProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [editedText, setEditedText] = useState("")

  // Combine all boundaries into a single text format
  const combineBoundariesToText = useCallback((): string => {      
    const directionOrder = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR", "AL NORESTE", "AL NOROESTE", "AL SURESTE", "AL SUROESTE"]
    const groupedSegments = segments.reduce(
      (acc, segment) => {
        if (!acc[segment.direction]) {
          acc[segment.direction] = []
        }
        acc[segment.direction].push(segment)
        return acc
      },
      {} as Record<string, TransformedSegment[]>,
    )

    let combinedText = ""
    directionOrder.forEach((direction) => {
      const directionSegments = groupedSegments[direction]
      if (!directionSegments || directionSegments.length === 0) return

      // Extract just the text without the direction prefix
      const notarialTexts = directionSegments.map((segment) => {
        const text = segment.originalText.split(": ")[1]
        return text
      })

      // Combine with ordinals
      const numSegments = directionSegments.length
      const ordinals = ["", "primero", "segundo", "tercero", "cuarto", "quinto"]
      
      let combinedTextForDirection = ""
      
      if (numSegments === 1) {
        // Single segment: just the text
        combinedTextForDirection = notarialTexts[0]
      } else {
        // Multiple segments: use ordinals
        notarialTexts.forEach((text, index) => {
          const ordinal = ordinals[index + 1] || `tramo ${index + 1}`
          
          if (index === 0) {
            // First segment
            combinedTextForDirection = `el ${ordinal} de ${text}`
          } else if (index === numSegments - 1) {
            // Last segment: add "y" before
            combinedTextForDirection += `, y el ${ordinal} de ${text}`
          } else {
            // Middle segments
            combinedTextForDirection += `, el ${ordinal} de ${text}`
          }
        })
      }

      combinedText += `${direction}:\n${combinedTextForDirection}\n\n`
    })

    return combinedText.trim()
  }, [segments])

  // Parse edited text back into segments
  const parseTextToSegments = useCallback((text: string): TransformedSegment[] => {
    const directionLabels = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR", "AL NORESTE", "AL NOROESTE", "AL SURESTE", "AL SUROESTE"]
    const updatedSegments: TransformedSegment[] = []

    // Split by direction headers
    const sections = text.split(/(?=AL (OESTE|NORTE|ESTE|SUR|NORESTE|NOROESTE|SURESTE|SUROESTE):)/i)

    sections.forEach((section) => {
      const trimmedSection = section.trim()
      if (!trimmedSection) return

      // Find direction
      const direction = directionLabels.find((dir) => trimmedSection.startsWith(dir + ":"))
      if (!direction) return

      // Extract text after direction label
      const textAfterDirection = trimmedSection
        .substring(direction.length + 1)
        .trim()
        .split("\n")
        .join(" ")

      if (!textAfterDirection) return

      // Find existing segments for this direction
      const existingSegmentsForDirection = segments.filter((seg) => seg.direction === direction)

      if (existingSegmentsForDirection.length > 0) {
        // Update existing segments - split by comma if multiple segments
        const segmentTexts = textAfterDirection.split(",").map((t) => t.trim()).filter((t) => t)

        existingSegmentsForDirection.forEach((existingSeg, index) => {
          const newText = segmentTexts[index] || segmentTexts[0] || textAfterDirection
          updatedSegments.push({
            ...existingSeg,
            originalText: `${direction}: ${newText}`,
          })
        })
      } else {
        // Create a new segment if direction doesn't exist yet
        updatedSegments.push({
          id: `${unitId}-${direction.toLowerCase().replace("al ", "")}-0`,
          originalText: `${direction}: ${textAfterDirection}`,
          regionId: `${unitId}-${direction.toLowerCase().replace("al ", "")}-0`,
          direction: direction,
        })
      }
    })

    // Keep segments for directions that weren't edited
    segments.forEach((segment) => {
      if (!directionLabels.some((dir) => segment.direction === dir)) {
        updatedSegments.push(segment)
      } else if (!updatedSegments.some((s) => s.id === segment.id)) {
        updatedSegments.push(segment)
      }
    })

    return updatedSegments
  }, [segments, unitId])

  // Initialize edited text on component mount and when segments change
  useEffect(() => {
    setEditedText(combineBoundariesToText())
  }, [combineBoundariesToText])

  const handleUnifiedTextChange = useCallback((newText: string) => {
    setEditedText(newText)
    if (onSegmentsChange) {
      const updatedSegments = parseTextToSegments(newText)
      onSegmentsChange(updatedSegments)
    }
  }, [onSegmentsChange, parseTextToSegments])

  const getDirectionRegionId = (direction: string, unitId: string): string => {
    const directionMap: Record<string, string> = {
      "AL OESTE": "oeste",
      "AL NORTE": "norte",
      "AL ESTE": "este",
      "AL SUR": "sur",
      "AL NORESTE": "noreste",
      "AL NOROESTE": "noroeste",
      "AL SURESTE": "sureste",
      "AL SUROESTE": "suroeste",
    }

    const unitPrefixMap: Record<string, string> = {
      unit_b2: "b2",
      unit_cubo_iluminacion: "cubo",
      unit_junta_constructiva_1: "junta1",
      unit_junta_constructiva_2: "junta2",
      unit_cajon_estacionamiento: "cajon",
    }

    const unitPrefix = unitPrefixMap[unitId] || ""
    const directionKey = directionMap[direction] || ""

    const regionId = `${unitPrefix}_${directionKey}`
    console.log("[v0] Constructing regionId:", { unitId, direction, unitPrefix, directionKey, regionId })

    return regionId
  }

  const directionOrder = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR", "AL NORESTE", "AL NOROESTE", "AL SURESTE", "AL SUROESTE"]
  const groupedSegments = segments.reduce(
    (acc, segment) => {
      if (!acc[segment.direction]) {
        acc[segment.direction] = []
      }
      acc[segment.direction].push(segment)
      return acc
    },
    {} as Record<string, TransformedSegment[]>,
  )

  return (
    <div className="flex flex-col h-full">
      <div
        className={`flex items-center justify-between gap-2 p-3 border-b transition-colors duration-200 shrink-0 ${
          unitRegionId && highlightedRegion === unitRegionId ? "bg-highlight/20 border-warning" : "bg-muted/30"
        }`}
        onMouseEnter={() => unitRegionId && onSegmentHover(unitRegionId)}
        onMouseLeave={() => unitRegionId && onSegmentHover(null)}
      >
        <div>
          <span className="text-sm font-medium">{title}</span>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {editable && (
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(!isEditMode)}
            className="gap-2"
          >
            {isEditMode ? (
              <>
                <Unlock className="h-4 w-4" />
                Modo Edición
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Bloqueado
              </>
            )}
          </Button>
        )}
      </div>

      <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
        {isEditMode ? (
          <>
            <Alert className="bg-primary/10 border-primary/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Modo de edición unificado activado. Edita todos los linderos de la unidad en el editor de texto.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <label className="text-sm font-medium">Todos los Linderos</label>
              <Textarea
                value={editedText}
                onChange={(e) => handleUnifiedTextChange(e.target.value)}
                className="min-h-[400px] font-mono text-sm resize-none"
                placeholder="AL OESTE:&#10;texto de linderos...&#10;&#10;AL NORTE:&#10;texto de linderos..."
              />
              <p className="text-xs text-muted-foreground">
                Formato: Cada dirección debe comenzar con "AL [DIRECCIÓN]:" seguido del texto de los linderos.
                Las direcciones disponibles son: AL OESTE, AL NORTE, AL ESTE, AL SUR, AL NORESTE, AL NOROESTE, AL SURESTE, AL SUROESTE
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Todos los Linderos</label>
              <Textarea
                value={editedText}
                readOnly
                className="min-h-[400px] font-mono text-sm resize-none cursor-default"
                placeholder="AL OESTE:&#10;texto de linderos...&#10;&#10;AL NORTE:&#10;texto de linderos..."
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
