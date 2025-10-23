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
import type { TransformedSegment } from "@/lib/text-transformer"
import type { PropertyUnit } from "@/lib/ocr-simulator"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  units: PropertyUnit[]
  unitSegments: Map<string, TransformedSegment[]>
  onExport: (metadata: ExportMetadata) => void
}

export interface ExportMetadata {
  propertyName: string
  surface: string
  location: string
  date: string
}

export function ExportDialog({ open, onOpenChange, units, unitSegments, onExport }: ExportDialogProps) {
  const totalSurface = units.reduce((sum, unit) => {
    const numericSurface = Number.parseFloat(unit.surface.replace(/[^\d.]/g, ""))
    return sum + (isNaN(numericSurface) ? 0 : numericSurface)
  }, 0)

  const [metadata, setMetadata] = useState<ExportMetadata>({
    propertyName: units.length > 1 ? "Condominio Maguey" : units[0]?.name || "Propiedad",
    surface: `${totalSurface.toFixed(3)} m²`,
    location: "Manzana 114, Lote 5-A",
    date: new Date().toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  })

  const handleExport = () => {
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
              Nombre de la Propiedad
            </Label>
            <Input
              id="propertyName"
              value={metadata.propertyName}
              onChange={(e) => setMetadata({ ...metadata, propertyName: e.target.value })}
              placeholder="Ej: Condominio Maguey"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="surface">Superficie Total</Label>
            <Input
              id="surface"
              value={metadata.surface}
              onChange={(e) => setMetadata({ ...metadata, surface: e.target.value })}
              placeholder="Ej: 75.398 m²"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Ubicación</Label>
            <Input
              id="location"
              value={metadata.location}
              onChange={(e) => setMetadata({ ...metadata, location: e.target.value })}
              placeholder="Ej: Manzana 114, Lote 5-A"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fecha de Elaboración
            </Label>
            <Input
              id="date"
              value={metadata.date}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
