import abbreviationsData from "@/data/abbreviations.json"
import type { BoundarySegment, PropertyUnit } from "./ocr-simulator"

const numberWords: { [key: string]: string } = {
  "0": "CERO",
  "1": "UN",
  "2": "DOS",
  "3": "TRES",
  "4": "CUATRO",
  "5": "CINCO",
  "6": "SEIS",
  "7": "SIETE",
  "8": "OCHO",
  "9": "NUEVE",
}

const decimalWords: { [key: string]: string } = {
  "10": "DIEZ",
  "20": "VEINTE",
  "30": "TREINTA",
  "40": "CUARENTA",
  "50": "CINCUENTA",
  "60": "SESENTA",
  "70": "SETENTA",
  "80": "OCHENTA",
  "90": "NOVENTA",
}

function numberToWords(num: string): string {
  const parts = num.split(".")
  const integerPart = Number.parseInt(parts[0])
  const decimalPart = parts[1] || ""

  let result = ""

  if (integerPart === 0) {
    result = "CERO"
  } else if (integerPart < 10) {
    result = numberWords[integerPart.toString()]
  } else if (integerPart < 100) {
    const tens = Math.floor(integerPart / 10) * 10
    const ones = integerPart % 10
    result = decimalWords[tens.toString()]
    if (ones > 0) {
      result += ` Y ${numberWords[ones.toString()]}`
    }
  } else {
    result = integerPart.toString()
  }

  if (decimalPart) {
    result += ` PUNTO ${decimalPart
      .split("")
      .map((d) => numberWords[d])
      .join(" ")}`
  }

  return result
}

function convertUnitNameToNotarial(unitName: string): string {
  // Convert "UNIDAD B-2" to "UNIDAD B guion dos"
  // Convert "JUNTA CONSTRUCTIVA 1" to "JUNTA CONSTRUCTIVA 1 (uno)"
  // Convert "CUBO DE ILUMINACION" to "CUBO DE ILUMINACIÓN"

  let notarialName = unitName

  // Replace hyphens with "guion"
  notarialName = notarialName.replace(/-(\d+)/g, (match, num) => {
    const numWord = numberToWords(num).toLowerCase()
    return ` guion ${numWord}`
  })

  // Add number in parentheses for "JUNTA CONSTRUCTIVA" and similar
  notarialName = notarialName.replace(/(\d+)$/g, (match, num) => {
    const numWord = numberToWords(num).toLowerCase()
    return `${num} (${numWord})`
  })

  // Fix accents
  notarialName = notarialName.replace(/ILUMINACION/g, "ILUMINACIÓN")
  notarialName = notarialName.replace(/ESTACIONAMIENTO/g, "ESTACIONAMIENTO")

  return notarialName
}

export interface TransformedSegment {
  id: string
  originalText: string
  notarialText: string
  regionId: string
  direction: string
}

export function transformToNotarialText(unit: PropertyUnit): string {
  const { abbreviations, cardinalDirections } = abbreviationsData

  // Start with unit name in notarial format
  const unitNameNotarial = convertUnitNameToNotarial(unit.name)
  let notarialText = `${unitNameNotarial}: `

  const directions = ["west", "north", "east", "south"]
  const directionConnectors = ["Al", "al", "al", "y, al"]

  directions.forEach((direction, index) => {
    const directionData = unit.boundaries[direction as keyof typeof unit.boundaries]
    if (!directionData || directionData.length === 0) return

    const cardinalName = cardinalDirections[direction as keyof typeof cardinalDirections].toLowerCase()
    const connector = directionConnectors[index]

    notarialText += `${connector} ${cardinalName}, `

    if (directionData.length === 1) {
      // Single segment
      const segment = directionData[0]
      const measurementInWords = numberToWords(segment.measurement).toLowerCase()
      let description = segment.description.toLowerCase()

      Object.entries(abbreviations).forEach(([abbr, full]) => {
        const regex = new RegExp(abbr, "gi")
        description = description.replace(regex, full.toLowerCase())
      })

      // Replace hyphens in descriptions with "guion"
      description = description.replace(/-(\d+)/g, (match, num) => ` guion ${num}`)
      description = description.replace(/$$([^)]+)$$/g, (match, content) => {
        return `(${content.replace(/-/g, " guion ")})`
      })

      notarialText += `en ${measurementInWords} milímetros, ${description}`
    } else {
      // Multiple segments
      notarialText += `en ${directionData.length === 2 ? "dos" : directionData.length === 3 ? "tres" : directionData.length === 4 ? "cuatro" : directionData.length} tramos`

      directionData.forEach((segment: BoundarySegment, segIndex: number) => {
        const measurementInWords = numberToWords(segment.measurement).toLowerCase()
        let description = segment.description.toLowerCase()

        Object.entries(abbreviations).forEach(([abbr, full]) => {
          const regex = new RegExp(abbr, "gi")
          description = description.replace(regex, full.toLowerCase())
        })

        // Replace hyphens in descriptions with "guion"
        description = description.replace(/-(\d+)/g, (match, num) => ` guion ${num}`)
        description = description.replace(/$$([^)]+)$$/g, (match, content) => {
          return `(${content.replace(/-/g, " guion ")})`
        })

        if (segIndex === 0) {
          notarialText += ` el primero de ${measurementInWords} milímetros, ${description}`
        } else if (segIndex === directionData.length - 1) {
          notarialText += `, y el ${segIndex === 1 ? "segundo" : segIndex === 2 ? "tercero" : segIndex === 3 ? "cuarto" : "último"} de ${measurementInWords} milímetros, ${description}`
        } else {
          notarialText += `, el ${segIndex === 1 ? "segundo" : segIndex === 2 ? "tercero" : segIndex === 3 ? "cuarto" : "último"} de ${measurementInWords} milímetros, ${description}`
        }
      })
    }

    if (index < directions.length - 1) {
      notarialText += "; "
    }
  })

  return notarialText + "."
}

export function extractOriginalText(boundaries: any): string {
  let originalText = ""

  const directions = ["north", "south", "east", "west"]
  const directionLabels: { [key: string]: string } = {
    north: "NORTE",
    south: "SUR",
    east: "ESTE",
    west: "OESTE",
  }

  directions.forEach((direction, index) => {
    const directionData = boundaries[direction]
    if (!directionData || directionData.length === 0) return

    originalText += `${directionLabels[direction]}: `

    directionData.forEach((segment: any, segIndex: number) => {
      originalText += `${segment.measurement} ${segment.unit}. ${segment.description}`

      if (segIndex < directionData.length - 1) {
        originalText += "; "
      }
    })

    if (index < directions.length - 1) {
      originalText += ". "
    }
  })

  return originalText + "."
}

export function createStructuredSegments(unit: PropertyUnit): TransformedSegment[] {
  const { abbreviations, cardinalDirections } = abbreviationsData
  const segments: TransformedSegment[] = []

  const directions = ["west", "north", "east", "south"] as const
  const directionLabels = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR"]

  directions.forEach((direction, dirIndex) => {
    const directionData = unit.boundaries[direction]
    const cardinalName = directionLabels[dirIndex]

    if (!directionData || directionData.length === 0) {
      console.log(`[v0] Warning: ${unit.name} missing ${direction} data`)
      return
    }

    directionData.forEach((segment: BoundarySegment, segIndex: number) => {
      const measurementInWords = numberToWords(segment.measurement).toLowerCase()
      let description = segment.description.toLowerCase()

      Object.entries(abbreviations).forEach(([abbr, full]) => {
        const regex = new RegExp(abbr, "gi")
        description = description.replace(regex, full.toLowerCase())
      })

      // Replace hyphens with "guion"
      description = description.replace(/-(\d+)/g, (match, num) => ` guion ${num}`)
      description = description.replace(/$$([^)]+)$$/g, (match, content) => {
        return `(${content.replace(/-/g, " guion ")})`
      })

      const originalText = `${segment.measurement} ${segment.unit}. ${segment.description}`
      const notarialText = `${measurementInWords} milímetros, ${description}`

      segments.push({
        id: `${unit.id}-${direction}-${segIndex}`,
        originalText: `${cardinalName}: ${originalText}`,
        notarialText: `${cardinalName}: ${notarialText}`,
        regionId: segment.regionId || `${unit.id}-${direction}-${segIndex}`,
        direction: cardinalName,
      })
    })
  })

  console.log(`[v0] Created ${segments.length} segments for ${unit.name}`)
  return segments
}
