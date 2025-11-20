"use client"

import { useState, useEffect, useCallback } from "react"
import { DocumentViewer } from "./document-viewer"
import { ImageViewer } from "./image-viewer"
import { ExportDialog, type ExportMetadata } from "./export-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Download, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, AlertCircle, FileText } from "lucide-react"
import type { TransformedSegment } from "@/lib/text-transformer"
import type { PropertyUnit } from "@/lib/ocr-simulator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { generateNotarialDocument, downloadDocument, generateFilename } from "@/lib/document-exporter"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ValidationWizardProps {
  documentUrl: string
  images?: File[] // Array of image files for ImageViewer
  units: PropertyUnit[]
  unitSegments: Map<string, TransformedSegment[]>
  onBack: () => void
  fileName?: string
  aiStructuredText?: string
  ocrConfidence?: number
  ocrRotationHint?: number
  /**
   * Texto de colindancias sugerido por unidad (id -> texto),
   * generado a partir de la IA para cada bloque/unidad.
   */
  unitBoundariesText?: Record<string, string>
  /**
   * Ubicación del lote extraída por la IA (manzana, lote, dirección, etc.)
   */
  lotLocation?: string | null
  /**
   * Superficie total del lote en m² extraída por la IA (no la suma de unidades)
   */
  totalLotSurface?: number | null
}

export function ValidationWizard({
  documentUrl,
  images,
  units,
  unitSegments,
  onBack,
  fileName,
  aiStructuredText,
  ocrConfidence,
  ocrRotationHint,
  unitBoundariesText,
  lotLocation,
  totalLotSurface,
}: ValidationWizardProps) {
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0)
  const [editedUnits, setEditedUnits] = useState<Map<string, TransformedSegment[]>>(unitSegments)
  const [authorizedUnits, setAuthorizedUnits] = useState<Set<string>>(new Set())
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [aiTextByUnit, setAiTextByUnit] = useState<Map<string, string>>(new Map())
  const [notarialTextByUnit, setNotarialTextByUnit] = useState<Map<string, string>>(new Map())
  const [isGeneratingNotarial, setIsGeneratingNotarial] = useState<boolean>(false)
  const [showCompleteTextModal, setShowCompleteTextModal] = useState(false)
  const [completeNotarialText, setCompleteNotarialText] = useState<string>("")
  const [isGeneratingCompleteText, setIsGeneratingCompleteText] = useState(false)

  const currentUnit = units[currentUnitIndex]
  const progress = ((currentUnitIndex + 1) / units.length) * 100
  const isLastUnit = currentUnitIndex === units.length - 1
  const isFirstUnit = currentUnitIndex === 0
  const isCurrentUnitAuthorized = authorizedUnits.has(currentUnit?.id)
  const allUnitsAuthorized = units.every((unit) => authorizedUnits.has(unit.id))

  useEffect(() => {
    setSelectedRegion(null)
  }, [currentUnitIndex])

  useEffect(() => {
    if (hasChanges) {
      const timer = setTimeout(() => {
        setLastSaved(new Date())
        setHasChanges(false)
        console.log("[v0] Auto-saved at", new Date().toLocaleTimeString())
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [hasChanges])

  // Inicializar texto de colindancias por unidad cuando cambia la data estructurada
  useEffect(() => {
    const map = new Map<string, string>()

    if (unitBoundariesText && Object.keys(unitBoundariesText).length > 0) {
      units.forEach((u) => {
        const txt = unitBoundariesText[u.id]
        if (typeof txt === "string" && txt.trim()) {
          map.set(u.id, txt)
        }
      })
    } else if (aiStructuredText && units[0]) {
      map.set(units[0].id, aiStructuredText)
    }

    setAiTextByUnit(map)
    setNotarialTextByUnit(new Map())
  }, [unitBoundariesText, aiStructuredText, units])

  const getUnitRegionId = (unitId: string): string => {
    const unitIdMap: Record<string, string> = {
      unit_b2: "unit_b2",
      unit_cubo_iluminacion: "unit_cubo_iluminacion",
      unit_junta_constructiva_1: "unit_junta_constructiva_1",
      unit_junta_constructiva_2: "unit_junta_constructiva_2",
      unit_cajon_estacionamiento: "unit_cajon_estacionamiento",
    }
    return unitIdMap[unitId] || ""
  }

  const handleSegmentClick = (regionId: string | null) => {
    setSelectedRegion(regionId)
  }

  const handleSegmentsChange = (unitId: string, newSegments: TransformedSegment[]) => {
    const newEditedUnits = new Map(editedUnits)
    newEditedUnits.set(unitId, newSegments)
    setEditedUnits(newEditedUnits)
    setHasChanges(true)

    const newAuthorizedUnits = new Set(authorizedUnits)
    newAuthorizedUnits.delete(unitId)
    setAuthorizedUnits(newAuthorizedUnits)
  }

  const handleAuthorizeUnit = () => {
    const newAuthorizedUnits = new Set(authorizedUnits)
    newAuthorizedUnits.add(currentUnit.id)
    setAuthorizedUnits(newAuthorizedUnits)
  }

  const handleNext = () => {
    if (!isLastUnit) {
      setCurrentUnitIndex(currentUnitIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (!isFirstUnit) {
      setCurrentUnitIndex(currentUnitIndex - 1)
    }
  }

  const handleExport = (metadata: ExportMetadata) => {
    // Usar solo las unidades autorizadas para la exportación
    const authorizedUnitsArray = units.filter((unit) => authorizedUnits.has(unit.id));

    const authorizedSegmentsMap = new Map<string, TransformedSegment[]>(
      Array.from(editedUnits.entries()).filter(([unitId]) => authorizedUnits.has(unitId)),
    );

    const allSegments = Array.from(authorizedSegmentsMap.values()).flat();

    const documentContent = generateNotarialDocument(
      allSegments,
      metadata,
      authorizedUnitsArray,
      authorizedSegmentsMap,
    );
    const filename = generateFilename(metadata.propertyName);
    downloadDocument(documentContent, filename);
  }

  const getTimeSinceLastSave = () => {
    const seconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000)
    if (seconds < 60) return "hace unos segundos"
    const minutes = Math.floor(seconds / 60)
    return `hace ${minutes} minuto${minutes > 1 ? "s" : ""}`
  }

  if (!currentUnit) return null

  const displayRegion = selectedRegion || getUnitRegionId(currentUnit.id)
  const currentAiText = aiTextByUnit.get(currentUnit.id) || ""
  const currentNotarialText = notarialTextByUnit.get(currentUnit.id) || ""

  // Generate notarial text when colindancias change
  const generateNotarialText = useCallback(async (colindanciasText: string, unitId: string, unitName: string) => {
    if (!colindanciasText.trim()) {
      setNotarialTextByUnit((prev) => {
        const next = new Map(prev)
        next.delete(unitId)
        return next
      })
      return
    }

    try {
      setIsGeneratingNotarial(true)
      const resp = await fetch("/api/ai/notarialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitName,
          colindanciasText,
        }),
      })
      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(msg)
      }
      const data = await resp.json() as { notarialText: string }
      setNotarialTextByUnit((prev) => {
        const next = new Map(prev)
        next.set(unitId, data.notarialText || "")
        return next
      })
    } catch (e) {
      console.error("[ui] notarialize failed", e)
      setNotarialTextByUnit((prev) => {
        const next = new Map(prev)
        next.delete(unitId)
        return next
      })
    } finally {
      setIsGeneratingNotarial(false)
    }
  }, [])

  // Auto-generate notarial text when colindancias change (debounced)
  useEffect(() => {
    if (currentAiText && currentUnit) {
      const timer = setTimeout(() => {
        generateNotarialText(currentAiText, currentUnit.id, currentUnit.name)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentAiText, currentUnit?.id, generateNotarialText])

  // Generate complete notarial text when modal opens
  const handleOpenCompleteTextModal = async () => {
    setShowCompleteTextModal(true)
    setIsGeneratingCompleteText(true)
    setCompleteNotarialText("")

    try {
      // Get all authorized units with their notarial texts
      const authorizedUnitsWithTexts = units
        .filter((unit) => authorizedUnits.has(unit.id))
        .map((unit) => ({
          unitName: unit.name,
          notarialText: notarialTextByUnit.get(unit.id) || "",
          colindanciasText: aiTextByUnit.get(unit.id) || "",
        }))

      if (authorizedUnitsWithTexts.length === 0) {
        setCompleteNotarialText("No hay unidades autorizadas.")
        return
      }

      // Call API to combine all texts into a complete notarial document
      const resp = await fetch("/api/ai/combine-notarial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          units: authorizedUnitsWithTexts,
        }),
      })

      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(msg)
      }

      const data = await resp.json() as { completeText: string }
      setCompleteNotarialText(data.completeText || "")
    } catch (e) {
      console.error("[ui] combine notarial failed", e)
      // Fallback: combine manually
      const combined = units
        .filter((unit) => authorizedUnits.has(unit.id))
        .map((unit) => {
          const text = notarialTextByUnit.get(unit.id) || ""
          return text ? `${unit.name}: ${text}` : ""
        })
        .filter(Boolean)
        .join("\n\n")
      setCompleteNotarialText(combined || "No se pudo generar el texto completo.")
    } finally {
      setIsGeneratingCompleteText(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with Progress */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Volver</span>
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold truncate">Validación de Deslindes</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Revisa y autoriza cada unidad antes de exportar
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {allUnitsAuthorized && (
                <Button
                  onClick={handleOpenCompleteTextModal}
                  size="lg"
                  variant="outline"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span className="sm:inline">Ver Texto Notarial Completo</span>
                </Button>
              )}
              <Button
                onClick={() => setShowExportDialog(true)}
                size="lg"
                className="gap-2 flex-1 sm:flex-initial"
                disabled={!allUnitsAuthorized}
                variant={allUnitsAuthorized ? "default" : "secondary"}
              >
                <Download className="h-4 w-4" />
                <span className="sm:inline">Exportar</span>
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium">
                Unidad {currentUnitIndex + 1} de {units.length}
              </span>
              <span className="text-muted-foreground">
                {authorizedUnits.size}/{units.length} autorizadas
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${(authorizedUnits.size / units.length) * 100}%` }}
              />
              <div
                className="absolute top-0 h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%`, opacity: 0.5 }}
              />
            </div>

            {/* Unit Pills */}
            <div className="flex gap-2 overflow-x-auto pt-2 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {units.map((unit, index) => {
                const isAuthorized = authorizedUnits.has(unit.id)
                const isCurrent = index === currentUnitIndex

                return (
                  <button
                    key={`${unit.id}-${index}`}
                    onClick={() => setCurrentUnitIndex(index)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      isCurrent && isAuthorized
                        ? "bg-green-600 text-white ring-2 ring-green-400 ring-offset-2"
                        : isCurrent
                          ? "bg-primary text-primary-foreground ring-2 ring-primary/50 ring-offset-2"
                          : isAuthorized
                            ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {isAuthorized && <CheckCircle2 className="h-3 w-3" />}
                    {unit.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Status Alert */}
      {typeof ocrConfidence === "number" && ocrConfidence < 0.7 && (
        <Alert className="mx-4 sm:mx-6 mt-3 sm:mt-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-xs sm:text-sm text-amber-800 dark:text-amber-300">
            El texto extraído del documento tiene una confiabilidad aproximada de{" "}
            {Math.round(ocrConfidence * 100)}%. Te recomendamos revisar la legibilidad del PDF
            {typeof ocrRotationHint === "number" && ocrRotationHint !== 0
              ? ` y considerar rotarlo aproximadamente ${ocrRotationHint}° para mejorar la lectura.`
              : " y considerar ajustar su orientación para una mejor interpretación."}
          </AlertDescription>
        </Alert>
      )}
      {isCurrentUnitAuthorized && (
        <Alert className="mx-4 sm:mx-6 mt-3 sm:mt-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-xs sm:text-sm text-green-800 dark:text-green-300">
            Esta unidad ha sido autorizada. Puedes continuar a la siguiente.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content - Split View */}
      <div className="flex-1 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 h-full">
            {/* Document/Image Viewer - Left Side with persistent highlight */}
            <div className="h-[300px] sm:h-[400px] lg:h-full overflow-auto">
              {images && images.length > 0 ? (
                <ImageViewer 
                  images={images}
                  initialIndex={0}
                />
              ) : (
                <DocumentViewer 
                  documentUrl={documentUrl} 
                  highlightedRegion={displayRegion} 
                  onRegionHover={() => {}} 
                  fileName={fileName}
                />
              )}
            </div>

            {/* Text Panel - Right Side */}
            <div className="h-[400px] sm:h-[500px] lg:h-full overflow-hidden">
              <Card className="flex flex-col h-full">
                <div className="p-4 sm:p-6 border-b bg-muted/30 shrink-0">
                  <div className="space-y-4">
                    {/* Header con información de la unidad */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base sm:text-lg font-semibold truncate">{currentUnit.name}</h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Superficie: {currentUnit.surface}</p>
                      </div>
                      {isCurrentUnitAuthorized ? (
                        <div className="flex items-center gap-2 text-success shrink-0">
                          <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                          <span className="text-xs sm:text-sm font-medium hidden sm:inline">Autorizada</span>
                        </div>
                      ) : (
                        <Button onClick={handleAuthorizeUnit} size="sm" className="gap-2 shrink-0">
                          <ShieldCheck className="h-4 w-4" />
                          <span className="hidden sm:inline">Autorizar</span>
                        </Button>
                      )}
                    </div>

                    {/* Botones de navegación */}
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevious}
                        disabled={isFirstUnit}
                        className="gap-2 flex-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Anterior</span>
                      </Button>

                      <div className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded-md">
                        {currentUnitIndex + 1} de {units.length}
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleNext}
                        disabled={isLastUnit}
                        className="gap-2 flex-1"
                      >
                        <span className="hidden sm:inline">Siguiente</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Content area to expand inputs */}
                <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                  <div className="flex flex-col gap-4 h-full">
                    {/* Colindancias (editable) - Always shown when unit is selected */}
                    <div className="flex flex-col h-1/2 min-h-[200px]">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Colindancias</div>
                      <textarea
                        className="w-full flex-1 min-h-[140px] resize-none border rounded bg-background p-2 text-sm overflow-auto"
                        value={currentAiText}
                        placeholder="Ingresa o edita las colindancias de esta unidad..."
                        onChange={(e) => {
                          const value = e.target.value
                          setAiTextByUnit((prev) => {
                            const next = new Map(prev)
                            next.set(currentUnit.id, value)
                            return next
                          })
                          setHasChanges(true)
                        }}
                      />
                      {isGeneratingNotarial && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Generando texto notarial...
                        </div>
                      )}
                    </div>
                    
                    {/* Redacción notarial - Always shown below colindancias */}
                    <div className="flex flex-col h-1/2 min-h-[200px]">
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        Redacción notarial
                        {isGeneratingNotarial && <span className="ml-2 text-muted-foreground">(Generando...)</span>}
                      </div>
                      <textarea
                        className="w-full flex-1 min-h-[140px] resize-none border rounded bg-background p-2 text-sm overflow-auto"
                        value={currentNotarialText}
                        placeholder={isGeneratingNotarial ? "Generando texto notarial..." : "El texto notarial aparecerá aquí automáticamente cuando ingreses las colindancias..."}
                        onChange={(e) => {
                          const value = e.target.value
                          setNotarialTextByUnit((prev) => {
                            const next = new Map(prev)
                            next.set(currentUnit.id, value)
                            return next
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Footer simplificado */}
      <footer className="border-t bg-card">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-center">
            <div className="text-xs sm:text-sm text-muted-foreground">
              Auto-guardado {getTimeSinceLastSave()}
            </div>
          </div>
        </div>
      </footer>

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        units={units}
        unitSegments={editedUnits}
        onExport={handleExport}
        fileName={fileName}
        locationHint={lotLocation || undefined}
        totalLotSurface={totalLotSurface || undefined}
      />

      {/* Modal for Complete Notarial Text */}
      <Dialog open={showCompleteTextModal} onOpenChange={setShowCompleteTextModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Texto Notarial Completo
            </DialogTitle>
            <DialogDescription>
              Texto notarial combinado de todas las unidades autorizadas, formateado según estándares notariales.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {isGeneratingCompleteText ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Generando texto notarial completo...</div>
                </div>
              </div>
            ) : (
              <textarea
                className="w-full flex-1 min-h-[400px] resize-none border rounded bg-background p-4 text-sm overflow-auto font-mono"
                value={completeNotarialText}
                onChange={(e) => setCompleteNotarialText(e.target.value)}
                placeholder="El texto notarial completo aparecerá aquí..."
              />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowCompleteTextModal(false)}
            >
              Cerrar
            </Button>
            <Button
              onClick={() => {
                if (completeNotarialText) {
                  const blob = new Blob([completeNotarialText], { type: "text/plain" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = "texto-notarial-completo.txt"
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }
              }}
              disabled={!completeNotarialText || isGeneratingCompleteText}
            >
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
