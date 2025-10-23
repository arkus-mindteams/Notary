"use client"

import { useState, useEffect } from "react"
import { DocumentViewer } from "./document-viewer"
import { TextSegmentPanel } from "./text-segment-panel"
import { UnitTabs } from "./unit-tabs"
import { ExportDialog, type ExportMetadata } from "./export-dialog"
import { Button } from "@/components/ui/button"
import { Download, ArrowLeft, CheckCircle2, Save, AlertCircle, ShieldCheck } from "lucide-react"
import type { TransformedSegment } from "@/lib/text-transformer"
import type { PropertyUnit } from "@/lib/ocr-simulator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { generateNotarialDocument, downloadDocument, generateFilename } from "@/lib/document-exporter"

interface ValidationViewProps {
  documentUrl: string
  units: PropertyUnit[]
  unitSegments: Map<string, TransformedSegment[]>
  onBack: () => void
}

export function ValidationView({ documentUrl, units, unitSegments, onBack }: ValidationViewProps) {
  const [activeUnit, setActiveUnit] = useState(units[0]?.id || "")
  const [highlightedRegion, setHighlightedRegion] = useState<string | null>(null)
  const [editedUnits, setEditedUnits] = useState<Map<string, TransformedSegment[]>>(unitSegments)
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)

  useEffect(() => {
    if (hasChanges) {
      setIsSaving(true)
      const timer = setTimeout(() => {
        setLastSaved(new Date())
        setHasChanges(false)
        setIsSaving(false)
        console.log("[v0] Auto-saved at", new Date().toLocaleTimeString())
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [hasChanges, editedUnits])

  const handleSegmentsChange = (unitId: string, newSegments: TransformedSegment[]) => {
    const newEditedUnits = new Map(editedUnits)
    newEditedUnits.set(unitId, newSegments)
    setEditedUnits(newEditedUnits)
    setHasChanges(true)
    setIsAuthorized(false)
  }

  const handleManualSave = () => {
    setHasChanges(true)
  }

  const handleAuthorize = () => {
    setIsAuthorized(true)
  }

  const handleExport = (metadata: ExportMetadata) => {
    const allSegments: TransformedSegment[] = []
    units.forEach((unit) => {
      const segments = editedUnits.get(unit.id) || []
      allSegments.push(...segments)
    })

    const documentContent = generateNotarialDocument(allSegments, metadata, units, editedUnits)
    const filename = generateFilename(metadata.propertyName)
    downloadDocument(documentContent, filename)
  }

  const getTimeSinceLastSave = () => {
    const seconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000)
    if (seconds < 60) return "hace unos segundos"
    const minutes = Math.floor(seconds / 60)
    return `hace ${minutes} minuto${minutes > 1 ? "s" : ""}`
  }

  const getTotalSegments = () => {
    let total = 0
    editedUnits.forEach((segments) => {
      total += segments.length
    })
    return total
  }

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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-xl font-semibold">Validación de Documento</h1>
                <p className="text-sm text-muted-foreground">
                  Valida el texto notarial contra el documento original • {units.length} unidad
                  {units.length > 1 ? "es" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 bg-transparent"
                onClick={handleManualSave}
                disabled={isSaving}
              >
                <Save className={`h-4 w-4 ${isSaving ? "animate-spin" : ""}`} />
                {isSaving ? "Guardando..." : "Guardar Sesión"}
              </Button>
              {!isAuthorized && (
                <Button onClick={handleAuthorize} size="lg" variant="default" className="gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Autorizar Texto
                </Button>
              )}
              <Button
                onClick={() => setShowExportDialog(true)}
                size="lg"
                className="gap-2"
                disabled={!isAuthorized}
                variant={isAuthorized ? "default" : "secondary"}
              >
                <Download className="h-4 w-4" />
                Exportar Documento
              </Button>
            </div>
          </div>
        </div>
      </header>

      {isAuthorized && (
        <Alert className="mx-4 mt-4 bg-success/10 border-success/20">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription className="text-sm">
            Texto notarial autorizado. Ahora puedes exportar el documento.
          </AlertDescription>
        </Alert>
      )}

      {hasChanges && (
        <Alert className="mx-4 mt-4 bg-warning/10 border-warning/20">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Tienes cambios sin guardar. Se guardarán automáticamente en unos segundos.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="container mx-auto px-4 py-6 h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Document Viewer - Left Side */}
            <div className="h-[600px] lg:h-full">
              <DocumentViewer
                documentUrl={documentUrl}
                highlightedRegion={highlightedRegion}
                onRegionHover={setHighlightedRegion}
              />
            </div>

            {/* Units with Tabs - Right Side */}
            <div className="h-[600px] lg:h-full">
              <UnitTabs units={units} activeUnit={activeUnit} onUnitChange={setActiveUnit}>
                {(unit) => (
                  <TextSegmentPanel
                    title={`${unit.name} - Texto Notarial`}
                    subtitle={`Superficie: ${unit.surface}`}
                    segments={editedUnits.get(unit.id) || []}
                    highlightedRegion={highlightedRegion}
                    onSegmentHover={setHighlightedRegion}
                    showNotarial={true}
                    editable={true}
                    onSegmentsChange={(newSegments) => handleSegmentsChange(unit.id, newSegments)}
                    unitRegionId={getUnitRegionId(unit.id)}
                  />
                )}
              </UnitTabs>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Documento procesado correctamente • {units.length} unidad{units.length > 1 ? "es" : ""} •{" "}
                {getTotalSegments()} segmentos
              </span>
            </div>
            <span className={`${isSaving ? "text-warning" : "text-muted-foreground"}`}>
              {isSaving ? "Guardando cambios..." : `Auto-guardado ${getTimeSinceLastSave()}`}
            </span>
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
