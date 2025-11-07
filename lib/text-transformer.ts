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

const directions: ["norte", "sur", "este", "oeste", "noreste", "noroeste", "sureste", "suroeste"] = ["norte", "sur", "este", "oeste", "noreste", "noroeste", "sureste", "suroeste"]
const directionLabels: { [key: string]: string } = {
  "norte": "NORTE",
  "sur": "SUR",
  "este": "ESTE",
  "oeste": "OESTE",
  "noreste": "NORESTE",
  "noroeste": "NOROESTE",
  "sureste": "SURESTE",
  "suroeste": "SUROESTE",
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
  } else if (integerPart < 1000) {
    // Handle hundreds (100-999)
    const hundreds = Math.floor(integerPart / 100)
    const remainder = integerPart % 100
    
    // Special cases for hundreds
    const hundredWords: { [key: number]: string } = {
      1: "CIEN",
      2: "DOSCIENTOS",
      3: "TRESCIENTOS",
      4: "CUATROCIENTOS",
      5: "QUINIENTOS",
      6: "SEISCIENTOS",
      7: "SETECIENTOS",
      8: "OCHOCIENTOS",
      9: "NOVECIENTOS",
    }
    
    if (hundreds === 1 && remainder === 0) {
      result = "CIEN"
    } else if (hundreds === 1) {
      result = "CIENTO"
    } else {
      result = hundredWords[hundreds] || (numberWords[hundreds.toString()] + "CIENTOS")
    }
    
    if (remainder > 0) {
      if (remainder < 10) {
        result += ` ${numberWords[remainder.toString()]}`
      } else {
        const tens = Math.floor(remainder / 10) * 10
        const ones = remainder % 10
        result += ` ${decimalWords[tens.toString()]}`
        if (ones > 0) {
          result += ` Y ${numberWords[ones.toString()]}`
        }
      }
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

// Convert measurement to notarial text, handling MTS conversion properly
function measurementToNotarialText(measurement: string, unit: string): string {
  // If unit is MTS (metros), convert to "metros + milímetros" format
  if (unit === "MTS" || unit === "METROS") {
    const parts = measurement.split(".")
    const meters = Number.parseInt(parts[0]) || 0
    const millimeters = parts[1] ? Number.parseInt(parts[1].padEnd(3, "0").substring(0, 3)) : 0
    
    let result = ""
    
    // Convert meters part
    if (meters === 0) {
      // No meters, just millimeters
    } else if (meters === 1) {
      result = "un metro"
    } else {
      const metersWord = numberToWords(meters.toString()).toLowerCase()
      result = `${metersWord} metros`
    }
    
    // Convert millimeters part
    if (millimeters > 0) {
      const millimetersWord = numberToWords(millimeters.toString()).toLowerCase()
      if (result) {
        result += ` ${millimetersWord} milímetros`
      } else {
        result = `${millimetersWord} milímetros`
      }
    } else if (!result) {
      result = "cero milímetros"
    }
    
    return result
  }
  
  // For other units, use standard conversion
  const measurementInWords = numberToWords(measurement).toLowerCase()
  return `${measurementInWords} ${unit.toLowerCase()}`
}

export function convertUnitNameToNotarial(unitName: string): string {
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
  regionId: string
  direction: string
}

export function transformToNotarialText(unit: PropertyUnit): string {
  const { abbreviations, cardinalDirections } = abbreviationsData

  // Start with unit name in notarial format
  const unitNameNotarial = convertUnitNameToNotarial(unit.name)
  let notarialText = `${unitNameNotarial}: `

  //const directions = ["west", "north", "east", "south"]
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
      const measurementText = measurementToNotarialText(segment.measurement, segment.unit)
      let description = segment.notarialText.toLowerCase()

      Object.entries(abbreviations).forEach(([abbr, full]) => {
        const regex = new RegExp(abbr, "gi")
        description = description.replace(regex, full.toLowerCase())
      })

      // Replace hyphens in descriptions with "guion"
      description = description.replace(/-(\d+)/g, (match, num) => {
        const numWord = numberToWords(num).toLowerCase()
        return ` guion ${numWord}`
      })
      description = description.replace(/$$([^)]+)$$/g, (match, content) => {
        return `(${content.replace(/-/g, " guion ")})`
      })

      // Convert "CON CUBO DE ILUMINACION" to "con vacío de cubo de iluminación"
      description = description.replace(/con cubo de iluminaci[oó]n/gi, "con vacío de cubo de iluminación")

      // Convert "CON UNIDAD" to "con unidad" (ensure lowercase)
      description = description.replace(/^con /, "con ")

      notarialText += `en ${measurementText}, ${description}`
    } else {
      // Multiple segments
      notarialText += `en ${directionData.length === 2 ? "dos" : directionData.length === 3 ? "tres" : directionData.length === 4 ? "cuatro" : directionData.length} tramos`

      directionData.forEach((segment: BoundarySegment, segIndex: number) => {
        const measurementText = measurementToNotarialText(segment.measurement, segment.unit)
        let description = segment.notarialText.toLowerCase()

        Object.entries(abbreviations).forEach(([abbr, full]) => {
          const regex = new RegExp(abbr, "gi")
          description = description.replace(regex, full.toLowerCase())
        })

        // Replace hyphens in descriptions with "guion"
        description = description.replace(/-(\d+)/g, (match, num) => {
          const numWord = numberToWords(num).toLowerCase()
          return ` guion ${numWord}`
        })
        description = description.replace(/$$([^)]+)$$/g, (match, content) => {
          return `(${content.replace(/-/g, " guion ")})`
        })

        // Convert "CON CUBO DE ILUMINACION" to "con vacío de cubo de iluminación"
        description = description.replace(/con cubo de iluminaci[oó]n/gi, "con vacío de cubo de iluminación")

        // Convert "CON UNIDAD" to "con unidad" (ensure lowercase)
        description = description.replace(/^con /, "con ")

        if (segIndex === 0) {
          notarialText += ` el primero de ${measurementText}, ${description}`
        } else if (segIndex === directionData.length - 1) {
          notarialText += `, y el ${segIndex === 1 ? "segundo" : segIndex === 2 ? "tercero" : segIndex === 3 ? "cuarto" : "último"} de ${measurementText}, ${description}`
        } else {
          notarialText += `, el ${segIndex === 1 ? "segundo" : segIndex === 2 ? "tercero" : segIndex === 3 ? "cuarto" : "último"} de ${measurementText}, ${description}`
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

  //const directions = ["north", "south", "east", "west"]
  /*const directionLabels: { [key: string]: string } = {
    north: "NORTE",
    south: "SUR",
    east: "ESTE",
    west: "OESTE",
  }*/

  directions.forEach((direction, index) => {
    const directionData = boundaries[direction]
    if (!directionData || directionData.length === 0) return

    originalText += `${directionLabels[direction]}: `

    directionData.forEach((segment: any, segIndex: number) => {
      originalText += `${segment.measurement} ${segment.unit}. ${segment.notarialText}`

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

  //const directions = ["west", "north", "east", "south"] as const
  const directionLabels = ["AL OESTE", "AL NORTE", "AL ESTE", "AL SUR", "AL NORESTE", "AL NOROESTE", "AL SURESTE", "AL SUROESTE"]

  directions.forEach((direction, dirIndex) => {
    const directionData = unit.boundaries[direction]
    const cardinalName = directionLabels[dirIndex]

    if (!directionData || directionData.length === 0) {
      console.log(`[v0] Warning: ${unit.name} missing ${direction} data`)
      return
    }

    directionData.forEach((segment: BoundarySegment, segIndex: number) => {
      const measurementText = measurementToNotarialText(segment.measurement, segment.unit)
      let description = segment.notarialText.toLowerCase()

      Object.entries(abbreviations).forEach(([abbr, full]) => {
        const regex = new RegExp(abbr, "gi")
        description = description.replace(regex, full.toLowerCase())
      })

      // Replace hyphens with "guion"
      description = description.replace(/-(\d+)/g, (match, num) => {
        const numWord = numberToWords(num).toLowerCase()
        return ` guion ${numWord}`
      })
      description = description.replace(/$$([^)]+)$$/g, (match, content) => {
        return `(${content.replace(/-/g, " guion ")})`
      })

      // Convert "CON CUBO DE ILUMINACION" to "con vacío de cubo de iluminación"
      description = description.replace(/con cubo de iluminaci[oó]n/gi, "con vacío de cubo de iluminación")

      // Convert "CON UNIDAD" to "con unidad" (ensure lowercase)
      description = description.replace(/^con /, "con ")

      const originalText = `${segment.measurement} ${segment.unit}. ${segment.notarialText}`

      segments.push({
        id: `${unit.id}-${direction}-${segIndex}`,
        originalText: `${cardinalName}: ${originalText}`,
        regionId: segment.regionId || `${unit.id}-${direction}-${segIndex}`,
        direction: cardinalName,
      })
    })
  })

  console.log(`[v0] Created ${segments.length} segments for ${unit.name}`)
  return segments
}

/**
 * Create structured segments without modifying the notarialText
 * This preserves the notarialText exactly as it comes from OpenAI
 */
/**
 * Generate unit-level aggregated notarial text from unit boundaries
 */
export function generateUnitNotarialText(unit: PropertyUnit): string {
  const directionOrder = ["oeste", "norte", "este", "sur", "noreste", "noroeste", "sureste", "suroeste"]
  const directionLabels: Record<string, string> = {
    "oeste": "al oeste",
    "norte": "al norte",
    "este": "al este",
    "sur": "al sur",
    "noreste": "al noreste",
    "noroeste": "al noroeste",
    "sureste": "al sureste",
    "suroeste": "al suroeste"
  }  

  let combinedText = ""
  directionOrder.forEach((directionKey) => {
    const directionData = unit.boundaries[directionKey as keyof typeof unit.boundaries]
    if (!directionData || directionData.length === 0) return

    const direction = directionLabels[directionKey]
    const notarialTexts = directionData.map((segment: BoundarySegment) => {
     // const measurementText = measurementToNotarialText(segment.measurement, segment.unit)
      //return `${measurementText}, ${segment.notarialText.toLowerCase()}`
      return segment.notarialText;
    })

    // Combine with ordinals
    const numSegments = directionData.length
    const ordinals = ["", "primero", "segundo", "tercero", "cuarto", "quinto"]
    const tramosWords = ["", "", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"]
    
    let combinedTextForDirection = ""
    
    if (numSegments === 1) {
      // Single segment: just the text
      combinedTextForDirection = notarialTexts[0]
    } else {
      // Multiple segments: use ordinals with "en X tramos" prefix
      notarialTexts.forEach((text, index) => {
        const ordinal = ordinals[index + 1] || `tramo ${index + 1}`
        
        if (index === 0) {
          // First segment: add "en X tramos" prefix
          const tramosLabel = tramosWords[numSegments] 
            ? `en ${tramosWords[numSegments]} tramos, ` 
            : ''
          combinedTextForDirection = `${tramosLabel}el ${ordinal} de ${text}`
        } else if (index === numSegments - 1) {
          // Last segment: add "y" before
          combinedTextForDirection += `, y el ${ordinal} de ${text}`
        } else {
          // Middle segments
          combinedTextForDirection += `, el ${ordinal} de ${text}`
        }
      })
    }

    combinedText += `${direction}, ${combinedTextForDirection}. `
  })

  return combinedText.trim()
}

export function createStructuredSegmentsDirect(unit: PropertyUnit): TransformedSegment[] {
  const segments: TransformedSegment[] = []
  // Map direction keys to their display labels
  const directionLabelMap: Record<string, string> = {
    "oeste": "AL OESTE",
    "norte": "AL NORTE",
    "este": "AL ESTE",
    "sur": "AL SUR",
    "noreste": "AL NORESTE",
    "noroeste": "AL NOROESTE",
    "sureste": "AL SURESTE",
    "suroeste": "AL SUROESTE"
  }

  directions.forEach((direction) => {
    // Safely access boundary data
    const directionData = unit.boundaries[direction as keyof typeof unit.boundaries]
    const cardinalName = directionLabelMap[direction]

    if (!directionData || !Array.isArray(directionData) || directionData.length === 0) {
      console.log(`[v0] Warning: ${unit.name} missing ${direction} data`)
      return
    }

    // Determine if we need to add "EN X TRAMOS" prefix
    const numSegments = directionData.length
    const ordinals = ["", "primero", "segundo", "tercero", "cuarto", "quinto"]
    const tramosWords = ["", "", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"]
    
    directionData.forEach((segment: BoundarySegment, segIndex: number) => {
      // Validate segment has required fields
      if (!segment || !segment.measurement || !segment.unit || !segment.notarialText) {
        console.log(`[v0] Warning: ${unit.name} ${direction} segment ${segIndex} missing required fields`)
        return
      }

      // Use the notarialText directly without modifications - it already contains the converted text
      const notarialTextOnly = segment.notarialText
      
      // Build the text with tramo indicator if multiple segments
      let displayText = notarialTextOnly
      if (numSegments > 1) {
        const ordinal = ordinals[segIndex + 1] || `tramo ${segIndex + 1}`
        
        // Add "EN X TRAMOS" prefix only to the first segment
        const tramosLabel = segIndex === 0 && tramosWords[numSegments] 
          ? `en ${tramosWords[numSegments]} tramos, ` 
          : ''
        
        displayText = `${tramosLabel}el ${ordinal} de ${notarialTextOnly}`
      }

      segments.push({
        id: `${unit.id}-${direction}-${segIndex}`,
        originalText: `${cardinalName}: ${displayText}`,
        regionId: segment.regionId || `${unit.id}-${direction}-${segIndex}`,
        direction: cardinalName,
      })
    })
  })

  console.log(`[v0] Created ${segments.length} direct segments for ${unit.name} (notarialText preserved)`)
  return segments
}
