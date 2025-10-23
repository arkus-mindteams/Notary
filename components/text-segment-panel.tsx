"use client"
import { Button } from "@/components/ui/button"
import { Lock, Unlock, AlertCircle } from "lucide-react"
import { useState } from "react"
import type { TransformedSegment } from "@/lib/text-transformer"
import { EditableSegment } from "./editable-segment"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface TextSegmentPanelProps {
  title: string
  subtitle?: string
  segments: TransformedSegment[]
  highlightedRegion: string | null
  onSegmentHover: (regionId: string | null) => void
  editable?: boolean
  onSegmentsChange?: (segments: TransformedSegment[]) => void
  showNotarial?: boolean
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
  showNotarial = false,
  unitRegionId,
  unitId = "",
}: TextSegmentPanelProps) {
  const [isEditMode, setIsEditMode] = useState(false)

  const handleDirectionChange = (direction: string, newText: string) => {
    if (onSegmentsChange) {
      const updatedSegments = segments.map((seg) => {
        if (seg.direction === direction) {
          return {
            ...seg,
            notarialText: `${seg.direction}: ${newText}`,
          }
        }
        return seg
      })
      onSegmentsChange(updatedSegments)
    }
  }

  const getDirectionRegionId = (direction: string, unitId: string): string => {
    const directionMap: Record<string, string> = {
      "AL OESTE": "west",
      "AL NORTE": "north",
      "AL ESTE": "east",
      "AL SUR": "south",
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

  const directionOrder = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR"]

  return (
    <div className="flex flex-col">
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

      <div className="p-4 space-y-4 overflow-y-auto min-h-0">
        {isEditMode && (
          <Alert className="bg-primary/10 border-primary/20">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Modo de edición activado. Haz clic en cualquier dirección para editarla.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {directionOrder.map((direction) => {
            const directionSegments = groupedSegments[direction]
            if (!directionSegments || directionSegments.length === 0) return null

            const combinedText = directionSegments
              .map((segment) => {
                const text = showNotarial ? segment.notarialText.split(": ")[1] : segment.originalText.split(": ")[1]
                return text
              })
              .join(", ")

            const directionRegionId = getDirectionRegionId(direction, unitId)
            const isDirectionHighlighted = highlightedRegion === directionRegionId

            console.log(
              "[v0] Direction:",
              direction,
              "Region ID:",
              directionRegionId,
              "Highlighted:",
              isDirectionHighlighted,
            )

            return (
              <div key={direction} className="space-y-2">
                <h3
                  className="font-semibold text-sm text-primary border-b pb-1 cursor-pointer hover:text-primary/80 transition-colors"
                  onClick={() => onSegmentHover(directionRegionId)}
                >
                  {direction}
                </h3>
                <div onClick={() => onSegmentHover(directionRegionId)}>
                  <EditableSegment
                    text={combinedText}
                    isHighlighted={isDirectionHighlighted}
                    onHover={() => {}}
                    onLeave={() => {}}
                    onChange={(newText) => handleDirectionChange(direction, newText)}
                    isEditMode={isEditMode}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
