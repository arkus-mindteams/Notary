import type { PropertyUnit } from "./ocr-simulator"
import type { ExportMetadata } from "@/components/export-dialog"
import { convertUnitNameToNotarial } from "./text-transformer"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"

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

      return convertUnitNameToNotarial(unit.name) + ": " + unit.notarialText
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

function createDocParagraphs(content: string): Paragraph[] {
  const sections = content.trim().split(/\n{2,}/)

  if (sections.length === 0) {
    return [new Paragraph("")]
  }

  return sections.flatMap((section) => {
    const lines = section.split(/\n/)

    // Treat headings specially if the line is fully uppercase and short
    if (lines.length === 1 && /^[A-ZÁÉÍÓÚÜÑ0-9 ,.:;-]+$/.test(lines[0]) && lines[0].length <= 60) {
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: lines[0],
              color: "000000",
            }),
          ],
        }),
      ]
    }

    const textRuns = lines.map((line, index) =>
      new TextRun({
        text: line,
        break: index === 0 ? undefined : 1,
        color: "000000",
      }),
    )

    return [
      new Paragraph({
        children: textRuns.length > 0 ? textRuns : [new TextRun({ text: "", color: "000000" })],
        spacing: {
          after: 200,
        },
      }),
    ]
  })
}

export async function downloadDocument(content: string, filename: string) {
  const paragraphs = createDocParagraphs(content)

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
        // Ensure default text color is black
        headers: undefined,
        footers: undefined,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()

  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateFilename(propertyName: string): string {
  const date = new Date().toISOString().split("T")[0]
  const sanitizedName = propertyName.replace(/[^a-zA-Z0-9]/g, "_")
  return `Deslinde_${sanitizedName}_${date}.docx`
}
