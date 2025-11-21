"use client"

import { useState, useEffect, useCallback } from "react"
import { DocumentViewer } from "./document-viewer"
import { ImageViewer } from "./image-viewer"
import { ExportDialog, type ExportMetadata } from "./export-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Download, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, AlertCircle, FileText, Save, X, Eye, EyeOff } from "lucide-react"
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
  
  // Estados para rastrear valores guardados y cambios no guardados
  const [savedColindanciasByUnit, setSavedColindanciasByUnit] = useState<Map<string, string>>(new Map())
  const [savedNotarialTextByUnit, setSavedNotarialTextByUnit] = useState<Map<string, string>>(new Map())
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const [isViewerCollapsed, setIsViewerCollapsed] = useState(false)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

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
    // Inicializar valores guardados con los valores iniciales
    setSavedColindanciasByUnit(new Map(map))
    setSavedNotarialTextByUnit(new Map())
  }, [unitBoundariesText, aiStructuredText, units])

  // Detectar si hay cambios sin guardar en la unidad actual
  const hasUnsavedChanges = (): boolean => {
    if (!currentUnit) return false
    const currentColindancias = aiTextByUnit.get(currentUnit.id) || ""
    const savedColindancias = savedColindanciasByUnit.get(currentUnit.id) || ""
    const currentNotarial = notarialTextByUnit.get(currentUnit.id) || ""
    const savedNotarial = savedNotarialTextByUnit.get(currentUnit.id) || ""
    
    return currentColindancias !== savedColindancias || currentNotarial !== savedNotarial
  }

  // Guardar cambios de la unidad actual
  const handleSaveChanges = () => {
    if (!currentUnit) return
    const currentColindancias = aiTextByUnit.get(currentUnit.id) || ""
    const currentNotarial = notarialTextByUnit.get(currentUnit.id) || ""
    
    setSavedColindanciasByUnit((prev) => {
      const next = new Map(prev)
      next.set(currentUnit.id, currentColindancias)
      return next
    })
    
    setSavedNotarialTextByUnit((prev) => {
      const next = new Map(prev)
      next.set(currentUnit.id, currentNotarial)
      return next
    })
    
    setHasChanges(true)
    setLastSaved(new Date())
  }

  // Confirmar navegación si hay cambios sin guardar
  const confirmNavigation = (navigationFn: () => void) => {
    if (hasUnsavedChanges()) {
      setPendingNavigation(() => navigationFn)
      setShowUnsavedChangesDialog(true)
    } else {
      navigationFn()
    }
  }

  // Aceptar navegación descartando cambios
  const handleDiscardAndNavigate = () => {
    if (pendingNavigation) {
      setShowUnsavedChangesDialog(false)
      // Restaurar valores guardados
      if (currentUnit) {
        const savedColindancias = savedColindanciasByUnit.get(currentUnit.id) || ""
        const savedNotarial = savedNotarialTextByUnit.get(currentUnit.id) || ""
        
        setAiTextByUnit((prev) => {
          const next = new Map(prev)
          next.set(currentUnit.id, savedColindancias)
          return next
        })
        
        setNotarialTextByUnit((prev) => {
          const next = new Map(prev)
          next.set(currentUnit.id, savedNotarial)
          return next
        })
      }
      pendingNavigation()
      setPendingNavigation(null)
    }
  }

  // Cancelar navegación
  const handleCancelNavigation = () => {
    setShowUnsavedChangesDialog(false)
    setPendingNavigation(null)
  }

  // Guardar y navegar
  const handleSaveAndNavigate = () => {
    handleSaveChanges()
    if (pendingNavigation) {
      setShowUnsavedChangesDialog(false)
      pendingNavigation()
      setPendingNavigation(null)
    }
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
    // Guardar cambios antes de autorizar
    if (hasUnsavedChanges()) {
      handleSaveChanges()
    }
    const newAuthorizedUnits = new Set(authorizedUnits)
    newAuthorizedUnits.add(currentUnit.id)
    setAuthorizedUnits(newAuthorizedUnits)
  }

  const handleUnauthorizeUnit = () => {
    const newAuthorizedUnits = new Set(authorizedUnits)
    newAuthorizedUnits.delete(currentUnit.id)
    setAuthorizedUnits(newAuthorizedUnits)
  }

  const handleNext = () => {
    if (!isLastUnit) {
      confirmNavigation(() => {
        setCurrentUnitIndex(currentUnitIndex + 1)
      })
    }
  }

  const handlePrevious = () => {
    if (!isFirstUnit) {
      confirmNavigation(() => {
        setCurrentUnitIndex(currentUnitIndex - 1)
      })
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
      // Actualizar también el valor guardado automáticamente si las colindancias no han sido editadas
      // Esto permite que el texto generado automáticamente no se marque como "sin guardar"
      setSavedColindanciasByUnit((savedColMap) => {
        const savedColindancias = savedColMap.get(unitId) || ""
        // Si las colindancias que se usaron para generar coinciden con las guardadas,
        // también guardar el texto notarial generado automáticamente
        if (colindanciasText === savedColindancias && colindanciasText) {
          setSavedNotarialTextByUnit((prev) => {
            const next = new Map(prev)
            next.set(unitId, data.notarialText || "")
            return next
          })
        }
        return savedColMap
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
  }, [savedColindanciasByUnit])

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
        <div className="container mx-auto px-3 sm:px-4 py-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 h-8">
                <ArrowLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline text-sm">Volver</span>
              </Button>
              <div className="min-w-0 flex-1 sm:flex-initial">
                <h1 className="text-base sm:text-lg font-semibold truncate">Validación de Deslindes</h1>
                <p className="text-xs text-muted-foreground hidden lg:block">
                  Revisa y autoriza cada unidad antes de exportar
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {allUnitsAuthorized && (
                <Button
                  onClick={handleOpenCompleteTextModal}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 px-3"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="text-xs sm:text-sm">Texto Completo</span>
                </Button>
              )}
              <Button
                onClick={() => setShowExportDialog(true)}
                size="sm"
                className="gap-1.5 h-8 px-3 flex-1 sm:flex-initial"
                disabled={!allUnitsAuthorized}
                variant={allUnitsAuthorized ? "default" : "secondary"}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="text-xs sm:text-sm">Exportar</span>
              </Button>
            </div>
          </div>

          {/* Progress Bar - Compact */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                Unidad {currentUnitIndex + 1} de {units.length}
              </span>
              <span className="text-muted-foreground">
                {authorizedUnits.size}/{units.length} autorizadas
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${(authorizedUnits.size / units.length) * 100}%` }}
              />
              <div
                className="absolute top-0 h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%`, opacity: 0.5 }}
              />
            </div>

            {/* Unit Pills - Single line with scroll */}
            <div className="flex gap-1.5 overflow-x-auto pt-1 pb-0.5 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-thin">
              {units.map((unit, index) => {
                const isAuthorized = authorizedUnits.has(unit.id)
                const isCurrent = index === currentUnitIndex

                return (
                  <button
                    key={`${unit.id}-${index}`}
                    onClick={() => confirmNavigation(() => setCurrentUnitIndex(index))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 flex items-center gap-1 ${
                      isCurrent && isAuthorized
                        ? "bg-green-600 text-white ring-1 ring-green-400"
                        : isCurrent
                          ? "bg-primary text-primary-foreground ring-1 ring-primary/50"
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

      {/* Status Alert - Compact and dismissible */}
      {typeof ocrConfidence === "number" && ocrConfidence < 0.7 && !dismissedAlerts.has("ocr-confidence") && (
        <Alert className="mx-3 sm:mx-4 mt-2 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-300 flex-1">
              Confiabilidad: {Math.round(ocrConfidence * 100)}%
              {typeof ocrRotationHint === "number" && ocrRotationHint !== 0
                ? ` • Rotar ~${ocrRotationHint}°`
                : ""}
            </AlertDescription>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={() => setDismissedAlerts((prev) => new Set(prev).add("ocr-confidence"))}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </Alert>
      )}
      {isCurrentUnitAuthorized && !dismissedAlerts.has("unit-authorized") && (
        <Alert className="mx-3 sm:mx-4 mt-2 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            <AlertDescription className="text-xs text-green-800 dark:text-green-300 flex-1">
              Unidad autorizada • Campos bloqueados
            </AlertDescription>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={() => setDismissedAlerts((prev) => new Set(prev).add("unit-authorized"))}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </Alert>
      )}

      {/* Main Content - Split View with Collapsible Viewer */}
      <div className="flex-1 overflow-hidden">
        <div className="container mx-auto px-3 sm:px-4 py-2 h-full">
          <div className={`grid gap-3 h-full transition-all duration-300 ${
            isViewerCollapsed 
              ? "grid-cols-1" 
              : "grid-cols-1 lg:grid-cols-[minmax(300px,40%)_minmax(400px,60%)]"
          }`}>
            {/* Document/Image Viewer - Left Side with Toggle */}
            {!isViewerCollapsed && (
              <div className="h-[300px] sm:h-[400px] lg:h-full overflow-auto relative group">
                {/* Toggle Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2 z-10 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 shadow-sm"
                  onClick={() => setIsViewerCollapsed(true)}
                  title="Ocultar documento"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </Button>
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
            )}

            {/* Text Panel - Right Side / Full width when viewer collapsed */}
            <div className={`h-[400px] sm:h-[500px] lg:h-full overflow-hidden ${isViewerCollapsed ? "" : ""}`}>
              {/* Toggle Button to show viewer when collapsed */}
              {isViewerCollapsed && (
                <div className="mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5"
                    onClick={() => setIsViewerCollapsed(false)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="text-xs">Mostrar documento</span>
                  </Button>
                </div>
              )}
              <Card className="flex flex-col h-full">
                <div className="px-3 py-1.5 border-b bg-muted/30 shrink-0">
                  <div className="space-y-1.5">
                    {/* Header con información de la unidad - Compact */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-xs sm:text-sm font-semibold truncate">{currentUnit.name}</h2>
                          <span className="text-xs text-muted-foreground shrink-0">• {currentUnit.surface}</span>
                        </div>
                      </div>
                      {isCurrentUnitAuthorized ? (
                        <Button 
                          onClick={handleUnauthorizeUnit} 
                          size="sm" 
                          variant="outline"
                          className="gap-1.5 h-8 px-3 shrink-0 border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-900/20 dark:hover:bg-orange-900/30"
                        >
                          <AlertCircle className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                          <span className="text-xs text-orange-700 dark:text-orange-300">Desautorizar</span>
                        </Button>
                      ) : (
                        <Button onClick={handleAuthorizeUnit} size="sm" className="gap-1.5 h-8 px-3 shrink-0">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span className="text-xs">Autorizar</span>
                        </Button>
                      )}
                    </div>

                    {/* Botones de navegación - Compacto y centrado */}
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevious}
                        disabled={isFirstUnit}
                        className="gap-1 h-8 px-2 shrink-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="text-xs font-medium">Anterior</span>
                      </Button>

                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border border-border rounded-md shrink-0">
                        <span className="text-xs font-semibold text-foreground">{currentUnitIndex + 1}</span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-xs text-muted-foreground">{units.length}</span>
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleNext}
                        disabled={isLastUnit}
                        className="gap-1 h-8 px-2 shrink-0"
                      >
                        <span className="text-xs font-medium">Siguiente</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Botón Guardar - aparece cuando hay cambios sin guardar y la unidad NO está autorizada */}
                    {hasUnsavedChanges() && !isCurrentUnitAuthorized && (
                      <div className="flex justify-end">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleSaveChanges}
                          className="gap-1.5 h-8 px-3 shrink-0"
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">Guardar cambios</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {/* Content area to expand inputs */}
                <div className="flex-1 px-3 pt-1 pb-2 overflow-hidden">
                  <div className="flex flex-col gap-2 h-full">
                    {/* Colindancias (editable) - Always shown when unit is selected */}
                    <div className="flex flex-col h-1/2 min-h-[150px]">
                      <div className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1">
                        <span>Colindancias</span>
                        {isCurrentUnitAuthorized && (
                          <span className="text-xs font-normal text-muted-foreground italic">
                            (Solo lectura)
                          </span>
                        )}
                      </div>
                      <textarea
                        className={`w-full flex-1 min-h-[120px] resize-none border rounded bg-background p-2 text-sm overflow-auto font-mono ${
                          isCurrentUnitAuthorized 
                            ? "cursor-not-allowed opacity-75 bg-muted/50" 
                            : ""
                        }`}
                        value={currentAiText}
                        placeholder={isCurrentUnitAuthorized ? "Unidad autorizada - Desautoriza para editar" : "Ingresa o edita las colindancias..."}
                        readOnly={isCurrentUnitAuthorized}
                        disabled={isCurrentUnitAuthorized}
                        onChange={(e) => {
                          if (isCurrentUnitAuthorized) return
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
                        <div className="mt-1 text-xs text-muted-foreground">
                          Generando...
                        </div>
                      )}
                    </div>
                    
                    {/* Redacción notarial - Always shown below colindancias */}
                    <div className="flex flex-col h-1/2 min-h-[150px]">
                      <div className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1">
                        <span>Redacción notarial</span>
                        {isGeneratingNotarial && <span className="text-muted-foreground text-xs font-normal">(Generando...)</span>}
                        {isCurrentUnitAuthorized && (
                          <span className="text-xs font-normal text-muted-foreground italic">
                            (Solo lectura)
                          </span>
                        )}
                      </div>
                      <textarea
                        className={`w-full flex-1 min-h-[120px] resize-none border rounded bg-background p-2 text-sm overflow-auto leading-relaxed ${
                          isCurrentUnitAuthorized 
                            ? "cursor-not-allowed opacity-75 bg-muted/50" 
                            : ""
                        }`}
                        value={currentNotarialText}
                        placeholder={
                          isCurrentUnitAuthorized 
                            ? "Unidad autorizada - Desautoriza para editar" 
                            : isGeneratingNotarial 
                              ? "Generando..." 
                              : "El texto notarial aparecerá aquí automáticamente..."
                        }
                        readOnly={isCurrentUnitAuthorized}
                        disabled={isCurrentUnitAuthorized}
                        onChange={(e) => {
                          if (isCurrentUnitAuthorized) return
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

      {/* Footer simplificado - Compact */}
      <footer className="border-t bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-1.5">
          <div className="flex items-center justify-center">
            <div className="text-xs text-muted-foreground">
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

      {/* Dialog de confirmación de cambios sin guardar */}
      <Dialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Cambios sin guardar
            </DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar en esta unidad. ¿Qué deseas hacer?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-4">
            <Button
              onClick={handleSaveAndNavigate}
              className="w-full gap-2"
              variant="default"
            >
              <Save className="h-4 w-4" />
              Guardar y continuar
            </Button>
            <Button
              onClick={handleDiscardAndNavigate}
              className="w-full gap-2"
              variant="destructive"
            >
              Descartar cambios y continuar
            </Button>
            <Button
              onClick={handleCancelNavigation}
              className="w-full"
              variant="outline"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
