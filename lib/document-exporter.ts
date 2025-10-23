import type { TransformedSegment } from "./text-transformer"
import type { PropertyUnit } from "./ocr-simulator"
import type { ExportMetadata } from "@/components/export-dialog"

export function generateNotarialDocument(
  allSegments: TransformedSegment[],
  metadata: ExportMetadata,
  units: PropertyUnit[],
  unitSegments: Map<string, TransformedSegment[]>,
): string {
  const header = `ESCRITURA DE DESLINDE

PROPIEDAD: ${metadata.propertyName}
UBICACIÓN: ${metadata.location}
SUPERFICIE TOTAL: ${metadata.surface}

MEDIDAS Y COLINDANCIAS:

`

  const unitsText = units
    .map((unit) => {
      const segments = unitSegments.get(unit.id) || []
      if (segments.length === 0) return ""

      // Convert unit name to notarial format
      let unitName = unit.name
      unitName = unitName.replace(/-(\d+)/g, (match, num) => {
        const numMap: { [key: string]: string } = {
          "1": "uno",
          "2": "dos",
          "3": "tres",
          "4": "cuatro",
          "5": "cinco",
        }
        return ` guion ${numMap[num] || num}`
      })

      // Group segments by direction
      const directions = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR"]
      const directionSegments: { [key: string]: TransformedSegment[] } = {}

      segments.forEach((seg) => {
        if (!directionSegments[seg.direction]) {
          directionSegments[seg.direction] = []
        }
        directionSegments[seg.direction].push(seg)
      })

      // Build continuous text
      let unitText = `${unitName}: `

      directions.forEach((direction, index) => {
        const segs = directionSegments[direction]
        if (!segs || segs.length === 0) return

        const connector = index === 0 ? "Al" : index === 3 ? "y, al" : "al"
        const directionName = direction.replace("AL ", "").toLowerCase()

        unitText += `${connector} ${directionName}, `

        if (segs.length === 1) {
          const text = segs[0].notarialText.split(": ")[1]
          unitText += `en ${text}`
        } else {
          const numWords = ["", "un", "dos", "tres", "cuatro", "cinco"]
          unitText += `en ${numWords[segs.length] || segs.length} tramos`

          segs.forEach((seg, segIndex) => {
            const text = seg.notarialText.split(": ")[1]
            const ordinals = ["", "primero", "segundo", "tercero", "cuarto", "quinto"]

            if (segIndex === 0) {
              unitText += ` el ${ordinals[1]} de ${text}`
            } else if (segIndex === segs.length - 1) {
              unitText += `, y el ${ordinals[segIndex + 1] || "último"} de ${text}`
            } else {
              unitText += `, el ${ordinals[segIndex + 1]} de ${text}`
            }
          })
        }

        if (index < directions.length - 1) {
          unitText += "; "
        }
      })

      return unitText + "."
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
