"use client"

import { useState, useEffect } from "react"
import { DocumentViewer } from "./document-viewer"
import { ExportDialog, type ExportMetadata } from "./export-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Download, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, Plus, X, Edit2, Check } from "lucide-react"
import type { PropertyUnit } from "@/lib/ocr-simulator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { generateNotarialDocument, downloadDocument, generateFilename } from "@/lib/document-exporter"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ValidationWizardProps {
  documentUrl: string
  units: PropertyUnit[]
  onBack: () => void
  fileName?: string
}

export function ValidationWizard({ documentUrl, units, onBack, fileName }: ValidationWizardProps) {
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0)
  const [authorizedUnits, setAuthorizedUnits] = useState<Set<string>>(new Set())
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date>(new Date())
  const [hasChanges, setHasChanges] = useState(false)
  const [availableUnits, setAvailableUnits] = useState<PropertyUnit[]>(units)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [unitToDelete, setUnitToDelete] = useState<string | null>(null)
  const [editingUnitName, setEditingUnitName] = useState(false)
  const [editingUnitSurface, setEditingUnitSurface] = useState(false)
  const [editedUnitName, setEditedUnitName] = useState('')
  const [editedUnitSurface, setEditedUnitSurface] = useState('')

  const currentUnit = availableUnits[currentUnitIndex]
  const progress = ((currentUnitIndex + 1) / availableUnits.length) * 100
  const isLastUnit = currentUnitIndex === availableUnits.length - 1
  const isFirstUnit = currentUnitIndex === 0
  const isCurrentUnitAuthorized = authorizedUnits.has(currentUnit?.id)
  const allUnitsAuthorized = availableUnits.every((unit) => authorizedUnits.has(unit.id))

  useEffect(() => {
    setEditingUnitName(false)
    setEditingUnitSurface(false)
    setEditedUnitName('')
    setEditedUnitSurface('')
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

  const handleNotarialTextChange = (unitId: string, newNotarialText: string) => {
    const newAvailableUnits = availableUnits.map(unit => {
      if (unit.id === unitId) {
        return {
          ...unit,
          notarialText: newNotarialText
        }
      }
      return unit
    })
    setAvailableUnits(newAvailableUnits)
    
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

  const handleAddUnit = () => {
    const newUnit: PropertyUnit = {
      id: `unit_manual_${Date.now()}`,
      name: 'Nueva Unidad',
      surface: '0 M2',
      notarialText: '',
      boundaries: {
        norte: [],
        sur: [],
        este: [],
        oeste: []
      }
    }
    const newAvailableUnits = [...availableUnits, newUnit]
    setAvailableUnits(newAvailableUnits)
    setCurrentUnitIndex(newAvailableUnits.length - 1)
    setHasChanges(true)
  }

  const handleDeleteUnit = (unitId: string, index: number) => {
    setUnitToDelete(unitId)
    setShowDeleteDialog(true)
  }

  const confirmDeleteUnit = () => {
    if (!unitToDelete) return
    
    const unitIndex = availableUnits.findIndex(u => u.id === unitToDelete)
    if (unitIndex === -1) return
    
    const newAvailableUnits = availableUnits.filter(u => u.id !== unitToDelete)
    setAvailableUnits(newAvailableUnits)
    
    // Remove from authorized units
    const newAuthorizedUnits = new Set(authorizedUnits)
    newAuthorizedUnits.delete(unitToDelete)
    setAuthorizedUnits(newAuthorizedUnits)
    
    // Adjust current index if needed
    if (currentUnitIndex >= newAvailableUnits.length && newAvailableUnits.length > 0) {
      setCurrentUnitIndex(newAvailableUnits.length - 1)
    } else if (newAvailableUnits.length === 0) {
      setCurrentUnitIndex(0)
    }
    
    setHasChanges(true)
    setShowDeleteDialog(false)
    setUnitToDelete(null)
  }

  const handleSaveUnitName = () => {
    if (!editedUnitName.trim()) return
    
    const newAvailableUnits = [...availableUnits]
    newAvailableUnits[currentUnitIndex] = {
      ...newAvailableUnits[currentUnitIndex],
      name: editedUnitName.trim()
    }
    setAvailableUnits(newAvailableUnits)
    setEditingUnitName(false)
    setHasChanges(true)
  }

  const handleSaveUnitSurface = () => {
    if (!editedUnitSurface.trim()) return
    
    const newAvailableUnits = [...availableUnits]
    newAvailableUnits[currentUnitIndex] = {
      ...newAvailableUnits[currentUnitIndex],
      surface: editedUnitSurface.trim()
    }
    setAvailableUnits(newAvailableUnits)
    setEditingUnitSurface(false)
    setHasChanges(true)
  }

  const handleExport = (metadata: ExportMetadata) => {
    const documentContent = generateNotarialDocument(
      metadata,
      availableUnits,
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
                Unidad {currentUnitIndex + 1} de {availableUnits.length}
              </span>
              <span className="text-muted-foreground">
                {authorizedUnits.size}/{availableUnits.length} autorizadas
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${availableUnits.length > 0 ? (authorizedUnits.size / availableUnits.length) * 100 : 0}%` }}
              />
              <div
                className="absolute top-0 h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%`, opacity: 0.5 }}
              />
            </div>

            {/* Unit Pills */}
            <div className="flex gap-2 overflow-x-auto pt-2 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {availableUnits.map((unit, index) => {
                const isAuthorized = authorizedUnits.has(unit.id)
                const isCurrent = index === currentUnitIndex

                return (
                  <div
                    key={unit.id}
                    className="flex items-center gap-1 shrink-0"
                  >
                    <button
                      onClick={() => setCurrentUnitIndex(index)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
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
                    <button
                      onClick={() => handleDeleteUnit(unit.id, index)}
                      className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Eliminar unidad"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
              <button
                onClick={handleAddUnit}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5"
                title="Agregar unidad"
              >
                <Plus className="h-3 w-3" />
                Agregar
              </button>
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
                highlightedRegion={null} 
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
                        <div className="flex items-center gap-2">
                          {editingUnitName ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input
                                value={editedUnitName}
                                onChange={(e) => setEditedUnitName(e.target.value)}
                                className="flex-1 text-base sm:text-lg font-semibold"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveUnitName()
                                  if (e.key === 'Escape') {
                                    setEditingUnitName(false)
                                    setEditedUnitName('')
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={handleSaveUnitName}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingUnitName(false)
                                  setEditedUnitName('')
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <h2 className="text-base sm:text-lg font-semibold truncate flex-1">{currentUnit.name}</h2>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                onClick={() => {
                                  setEditedUnitName(currentUnit.name)
                                  setEditingUnitName(true)
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {editingUnitSurface ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input
                                value={editedUnitSurface}
                                onChange={(e) => setEditedUnitSurface(e.target.value)}
                                className="flex-1 text-xs sm:text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveUnitSurface()
                                  if (e.key === 'Escape') {
                                    setEditingUnitSurface(false)
                                    setEditedUnitSurface('')
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={handleSaveUnitSurface}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  setEditingUnitSurface(false)
                                  setEditedUnitSurface('')
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs sm:text-sm text-muted-foreground">Superficie: {currentUnit.surface}</p>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 shrink-0"
                                onClick={() => {
                                  setEditedUnitSurface(currentUnit.surface)
                                  setEditingUnitSurface(true)
                                }}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
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
                        {currentUnitIndex + 1} de {availableUnits.length}
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

                <div className="flex-1 min-h-0 overflow-auto">
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Texto Notarial</h3>
                      <p className="text-xs text-muted-foreground mb-2">Revisa y edita si es necesario</p>
                    </div>
                    <Textarea
                      value={currentUnit.notarialText || ''}
                      onChange={(e) => handleNotarialTextChange(currentUnit.id, e.target.value)}
                      className="min-h-[400px] font-mono text-sm"
                      placeholder="Texto notarial de la unidad..."
                    />
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
        units={availableUnits}
        onExport={handleExport}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar unidad?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente esta unidad y todos sus datos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnitToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUnit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
