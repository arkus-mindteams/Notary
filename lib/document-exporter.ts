import type { PropertyUnit } from "./ocr-simulator"
import type { ExportMetadata } from "@/components/export-dialog"

export function generateNotarialDocument(
  metadata: ExportMetadata,
  units: PropertyUnit[],
): string {
  const header = `ESCRITURA DE DESLINDE

PROPIEDAD: ${metadata.propertyName}
UBICACIÓN: ${metadata.location}
SUPERFICIE TOTAL: ${metadata.surface}

MEDIDAS Y COLINDANCIAS:

`

  const unitsText = units
    .map((unit) => {
      // Use the unit-level notarialText that's already aggregated
      if (!unit.notarialText || unit.notarialText.length === 0) return ""

      return unit.notarialText
    })
    .filter(Boolean)
    .join("\n\n")

  const footer = `


_______________________________________________

Fecha de elaboración: ${metadata.date}

Este documento ha sido generado mediante el Sistema de Interpretación Notarial de Deslindes.
El texto notarial ha sido validado y autorizado por el usuario.
`

  return header + unitsText + footer
}

export function downloadDocument(content: string, filename: string) {
  // Create a Blob with proper formatting
  const blob = new Blob([content], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
  const url = URL.createObjectURL(blob)

  // Create download link
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()

  // Cleanup
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateFilename(propertyName: string): string {
  const date = new Date().toISOString().split("T")[0]
  const sanitizedName = propertyName.replace(/[^a-zA-Z0-9]/g, "_")
  return `Deslinde_${sanitizedName}_${date}.docx`
}
