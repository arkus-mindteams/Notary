"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, FileText, Calendar, MapPin } from "lucide-react"
import { toast } from "sonner"
import type { TransformedSegment } from "@/lib/text-transformer"
import type { PropertyUnit } from "@/lib/ocr-simulator"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  units: PropertyUnit[]
  unitSegments: Map<string, TransformedSegment[]>
  onExport: (metadata: ExportMetadata) => void
  /** Nombre del archivo original (para sugerir el nombre de la propiedad) */
  fileName?: string
  /** Ubicación sugerida (extraída por la IA). Si no viene, se deja vacío. */
  locationHint?: string | null
  /** Superficie total del lote en m² (extraída por la IA, no la suma de unidades) */
  totalLotSurface?: number | null
}

export interface ExportMetadata {
  propertyName: string
  surface: string
  location: string
  date: string
}

export function ExportDialog({
  open,
  onOpenChange,
  units,
  unitSegments,
  onExport,
  fileName,
  locationHint,
  totalLotSurface,
}: ExportDialogProps) {
  // Use totalLotSurface from AI if available, otherwise calculate from units
  const totalSurface = totalLotSurface 
    ? totalLotSurface 
    : units.reduce((sum, unit) => {
        const numericSurface = Number.parseFloat(unit.surface.replace(/[^\d.]/g, ""))
        return sum + (isNaN(numericSurface) ? 0 : numericSurface)
      }, 0)

  const baseNameFromFile = fileName ? fileName.replace(/\.[^.]+$/, "") : ""
  const defaultPropertyName =
    baseNameFromFile || (units.length > 1 ? "Propiedad" : units[0]?.name || "Propiedad")

  const [metadata, setMetadata] = useState<ExportMetadata>({
    propertyName: defaultPropertyName,
    surface: totalSurface > 0 ? `${totalSurface.toFixed(3)} m²` : "",
    location: locationHint?.trim() || "",
    date: new Date().toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  })
  const [surfaceError, setSurfaceError] = useState<string>("")

  const validateSurface = (value: string): boolean => {
    // Permite números con decimales y opcionalmente "m²" al final
    // Ejemplos válidos: "75.398", "75.398 m²", "100", "100 m²"
    const trimmed = value.trim()
    if (!trimmed) {
      setSurfaceError("La superficie es requerida")
      return false
    }
    
    // Extrae el número del string (permite decimales)
    const numericValue = trimmed.replace(/\s*m²\s*$/i, "").trim()
    const num = Number.parseFloat(numericValue)
    
    if (isNaN(num) || numericValue === "") {
      setSurfaceError("La superficie debe ser un número válido")
      return false
    }
    
    if (num <= 0) {
      setSurfaceError("La superficie debe ser mayor a 0")
      return false
    }
    
    setSurfaceError("")
    return true
  }

  const handleSurfaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMetadata({ ...metadata, surface: value })
    // Validar en tiempo real
    if (value.trim()) {
      validateSurface(value)
    } else {
      setSurfaceError("")
    }
  }

  const handleExport = () => {
    // Validar todos los campos requeridos
    const errors: string[] = []
    
    if (!metadata.propertyName.trim()) {
      errors.push("El nombre de la propiedad es requerido")
    }
    
    if (!metadata.surface.trim()) {
      errors.push("La superficie es requerida")
      setSurfaceError("La superficie es requerida")
    } else {
      // Validar formato de superficie
      const trimmed = metadata.surface.trim()
      const numericValue = trimmed.replace(/\s*m²\s*$/i, "").trim()
      const num = Number.parseFloat(numericValue)
      
      if (isNaN(num) || numericValue === "") {
        errors.push("La superficie debe ser un número válido")
        setSurfaceError("La superficie debe ser un número válido")
      } else if (num <= 0) {
        errors.push("La superficie debe ser mayor a 0")
        setSurfaceError("La superficie debe ser mayor a 0")
      } else {
        setSurfaceError("")
      }
    }
    
    if (!metadata.location.trim()) {
      errors.push("La ubicación es requerida")
    }
    
    if (!metadata.date.trim()) {
      errors.push("La fecha es requerida")
    }
    
    // Si hay errores, mostrar toast y prevenir exportación
    if (errors.length > 0) {
      toast.error("Campos requeridos faltantes", {
        description: errors.join(". "),
        duration: 5000,
      })
      return
    }
    
    onExport(metadata)
    onOpenChange(false)
  }

  const getTotalSegments = () => {
    let total = 0
    unitSegments.forEach((segments) => {
      total += segments.length
    })
    return total
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Exportar Documento Notarial
          </DialogTitle>
          <DialogDescription>
            Completa los metadatos del documento antes de exportar. El texto notarial autorizado será incluido en el
            archivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="propertyName" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Nombre de la Propiedad  <span className="text-red-500">*</span>
            </Label>
            <Input
              id="propertyName"
              value={metadata.propertyName}
              onChange={(e) => setMetadata({ ...metadata, propertyName: e.target.value })}
              placeholder="Ej: Condominio Maguey"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="surface">Superficie Total  <span className="text-red-500">*</span></Label>
            <Input
              id="surface"
              value={metadata.surface}
              onChange={handleSurfaceChange}
              placeholder="Ej: 75.398 m²"
              type="text"
              required
              className={surfaceError ? "border-red-500" : ""}
            />
            {surfaceError && (
              <p className="text-sm text-red-500">{surfaceError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Ubicación  <span className="text-red-500">*</span></Label>
            <Input
              id="location"
              value={metadata.location}
              required
              onChange={(e) => setMetadata({ ...metadata, location: e.target.value })}
              placeholder="Ej: Manzana 114, Lote 5-A"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fecha de Elaboración
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="date"
              value={metadata.date}
              required
              onChange={(e) => setMetadata({ ...metadata, date: e.target.value })}
            />
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Vista previa del contenido:</p>
            <p className="text-xs text-muted-foreground">
              {units.length} unidad{units.length > 1 ? "es" : ""} • {getTotalSegments()} segmentos de texto notarial
            </p>
            <p className="text-xs text-muted-foreground">Formato: Documento Word (.docx)</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1 h-8 px-2 shrink-0 hover:bg-gray-200 hover:text-foreground">
            Cancelar
          </Button>
          <Button onClick={handleExport} className="bg-gray-800 hover:bg-gray-700 text-white font-bold p-2.5">
            <Download className="h-4 w-4" />
            Exportar Documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
