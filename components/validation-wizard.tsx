"use client"

import { useState, useEffect } from "react"
import { DocumentViewer } from "./document-viewer"
import { ExportDialog, type ExportMetadata } from "./export-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Download, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react"
import type { TransformedSegment } from "@/lib/text-transformer"
import type { PropertyUnit } from "@/lib/ocr-simulator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { generateNotarialDocument, downloadDocument, generateFilename } from "@/lib/document-exporter"

interface ValidationWizardProps {
  documentUrl: string
  units: PropertyUnit[]
  unitSegments: Map<string, TransformedSegment[]>
  onBack: () => void
  fileName?: string
  aiStructuredText?: string
}

export function ValidationWizard({ documentUrl, units, unitSegments, onBack, fileName, aiStructuredText }: ValidationWizardProps) {
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0)
  const [editedUnits, setEditedUnits] = useState<Map<string, TransformedSegment[]>>(unitSegments)
  const [authorizedUnits, setAuthorizedUnits] = useState<Set<string>>(new Set())
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [aiText, setAiText] = useState<string>(aiStructuredText || "")
  const [notarialDraft, setNotarialDraft] = useState<string>("")
  const [isGeneratingNotarial, setIsGeneratingNotarial] = useState<boolean>(false)

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

  useEffect(() => {
    setAiText(aiStructuredText || "")
    setNotarialDraft("")
  }, [aiStructuredText])

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
    const documentContent = generateNotarialDocument(
      Array.from(editedUnits.values()).flat(),
      metadata,
      units,
      editedUnits,
    )
    const filename = generateFilename(metadata.propertyName)
    downloadDocument(documentContent, filename)
  }

  const getTimeSinceLastSave = () => {
    const seconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000)
    if (seconds < 60) return "hace unos segundos"
    const minutes = Math.floor(seconds / 60)
    return `hace ${minutes} minuto${minutes > 1 ? "s" : ""}`
  }

  if (!currentUnit) return null

  const displayRegion = selectedRegion || getUnitRegionId(currentUnit.id)

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
            <Button
              onClick={() => setShowExportDialog(true)}
              size="lg"
              className="gap-2 w-full sm:w-auto"
              disabled={!allUnitsAuthorized}
              variant={allUnitsAuthorized ? "default" : "secondary"}
            >
              <Download className="h-4 w-4" />
              <span className="sm:inline">Exportar</span>
            </Button>
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
                    key={unit.id}
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
            {/* Document Viewer - Left Side with persistent highlight */}
            <div className="h-[300px] sm:h-[400px] lg:h-full overflow-auto">
              <DocumentViewer 
                documentUrl={documentUrl} 
                highlightedRegion={displayRegion} 
                onRegionHover={() => {}} 
                fileName={fileName}
              />
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

                    {/* Colindancias (editable) */}
                    {(aiText || aiStructuredText) && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">Colindancias</div>
                        <textarea
                          className="w-full h-32 resize-y border rounded bg-background p-2 text-sm"
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={!aiText || isGeneratingNotarial}
                            onClick={async () => {
                              try {
                                setIsGeneratingNotarial(true)
                                setNotarialDraft("")
                                const resp = await fetch("/api/ai/notarialize", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    unitName: currentUnit.name,
                                    colindanciasText: aiText,
                                  }),
                                })
                                if (!resp.ok) {
                                  const msg = await resp.text()
                                  throw new Error(msg)
                                }
                                const data = await resp.json() as { notarialText: string }
                                setNotarialDraft(data.notarialText || "")
                              } catch (e) {
                                console.error("[ui] notarialize failed", e)
                                setNotarialDraft("")
                              } finally {
                                setIsGeneratingNotarial(false)
                              }
                            }}
                            className="gap-2"
                          >
                            {isGeneratingNotarial ? "Generando..." : "Generar redacción notarial"}
                          </Button>
                        </div>
                        {notarialDraft && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Redacción notarial</div>
                            <textarea
                              className="w-full h-28 resize-y border rounded bg-background p-2 text-sm"
                              value={notarialDraft}
                              onChange={(e) => setNotarialDraft(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}
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
      />
    </div>
  )
}
