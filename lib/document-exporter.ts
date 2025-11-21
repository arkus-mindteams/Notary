import type { TransformedSegment } from "./text-transformer"
import type { PropertyUnit } from "./ocr-simulator"
import type { ExportMetadata } from "@/components/export-dialog"
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx"
import { saveAs } from "file-saver"

export function generateNotarialDocument(
  allSegments: TransformedSegment[],
  metadata: ExportMetadata,
  units: PropertyUnit[],
  unitSegments: Map<string, TransformedSegment[]>,
  notarialTextsByUnit?: Map<string, string>,
): string {
  const header = `ESCRITURA DE DESLINDE

PROPIEDAD: ${metadata.propertyName}
UBICACIÓN: ${metadata.location}
SUPERFICIE TOTAL: ${metadata.surface}

MEDIDAS Y COLINDANCIAS:

`

  const footer = `


_______________________________________________

Fecha de elaboración: ${metadata.date}

Este documento ha sido generado mediante el Sistema de Interpretación Notarial de Deslindes.
El texto notarial ha sido validado y autorizado por el usuario.
`

  // Si tenemos textos notariales directos por unidad, usarlos
  if (notarialTextsByUnit && notarialTextsByUnit.size > 0) {
    const unitsText = units
      .map((unit) => {
        const notarialText = notarialTextsByUnit.get(unit.id)
        if (!notarialText || !notarialText.trim()) return ""

        // El texto notarial ya viene formateado, solo agregamos el nombre de la unidad si no está incluido
        let unitText = notarialText.trim()
        
        // Verificar si el texto ya incluye el nombre de la unidad
        const unitNamePattern = new RegExp(`^${unit.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'i')
        if (!unitNamePattern.test(unitText)) {
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
          unitText = `${unitName}: ${unitText}`
        }

        return unitText
      })
      .filter(Boolean)
      .join("\n\n")

    return header + unitsText + footer
  }

  // Fallback al método anterior usando segmentos
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

  return header + unitsText + footer
}

export async function downloadDocument(content: string, filename: string) {
  try {
    // Split content into lines for proper paragraph handling
    const lines = content.split("\n").filter((line) => line.trim() !== "")

    // Create paragraphs from content
    const paragraphs: Paragraph[] = []

    lines.forEach((line) => {
      const trimmedLine = line.trim()

      // Check if it's a header (all caps or title-like)
      const isHeader =
        trimmedLine === trimmedLine.toUpperCase() &&
        (trimmedLine.includes("ESCRITURA") ||
          trimmedLine.includes("PROPIEDAD") ||
          trimmedLine.includes("UBICACIÓN") ||
          trimmedLine.includes("SUPERFICIE") ||
          trimmedLine.includes("MEDIDAS") ||
          trimmedLine.includes("COLINDANCIAS") ||
          trimmedLine.includes("Fecha") ||
          trimmedLine.includes("Este documento"))

      // Check if it's a separator line
      const isSeparator = /^_+$/.test(trimmedLine)

      if (isSeparator) {
        // Add empty paragraph for separator
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            spacing: { after: 200 },
          })
        )
      } else if (isHeader) {
        // Header paragraph
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmedLine,
                bold: true,
                size: 24, // 12pt
                font: "Times New Roman",
              }),
            ],
            spacing: { after: 200 },
            alignment: trimmedLine.includes("ESCRITURA") ? AlignmentType.CENTER : AlignmentType.LEFT,
          })
        )
      } else {
        // Regular paragraph
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmedLine,
                size: 22, // 11pt
                font: "Times New Roman",
              }),
            ],
            spacing: { after: 120, line: 360 }, // 1.5 line spacing
            alignment: AlignmentType.JUSTIFIED,
          })
        )
      }
    })

    // Create Word document with proper UTF-8 encoding
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          children: paragraphs,
        },
      ],
    })

    // Generate blob with proper encoding
    const blob = await Packer.toBlob(doc)

    // Download using file-saver (handles UTF-8 correctly)
    saveAs(blob, filename)
  } catch (error) {
    console.error("Error generating DOCX:", error)
    // Fallback to simple text download if docx library fails
    const blob = new Blob(["\ufeff" + content], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

export function generateFilename(propertyName: string): string {
  const date = new Date().toISOString().split("T")[0]
  const sanitizedName = propertyName.replace(/[^a-zA-Z0-9]/g, "_")
  return `Deslinde_${sanitizedName}_${date}.docx`
}
