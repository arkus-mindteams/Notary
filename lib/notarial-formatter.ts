// Utilities to transform "Colindancias" lines into a single notarial paragraph
// following the specified rules.
//
// Public APIs:
// - formatUnitHeader(unitName: string): string
// - notarialize(colindanciasText: string, unitName: string): string
//
// Notes:
// - We implement deterministic formatting to ensure consistent output.
// - Measurements are represented in meters and millimeters. We convert numeric
//   values to Spanish words and compose phrases like:
//   - 6.750 m => "seis metros setecientos cincuenta milímetros"
//   - 0.520 m => "quinientos veinte milímetros"
//   - 0.025 m => "veinticinco milímetros"
// - CRITICAL: We respect the EXACT order of directions as they appear in the input text.
//   NO reordering by cardinality is performed.

type DirectionKey = "OESTE" | "NORTE" | "ESTE" | "SUR" | "NOROESTE" | "NORESTE" | "SURESTE" | "SUROESTE" | "ARRIBA" | "ABAJO" | "SUPERIOR" | "INFERIOR"

interface ParsedSegment {
  lengthMeters: number
  abutterRaw: string
  originalDirection: DirectionKey // Keep track of original direction
  originalOrder: number // Keep track of original order
}

interface DirectionGroup {
  direction: DirectionKey
  segments: ParsedSegment[]
  order: number // Original order of appearance
}

// --- Number formatting (Spanish words) ---

const SPANISH_UNITS = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
]

const SPANISH_TENS = [
  "",
  "diez",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
]

const SPANISH_HUNDREDS = [
  "",
  "cien",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
]

function numberToSpanishWordsInt(n: number): string {
  if (n < 0) return `menos ${numberToSpanishWordsInt(Math.abs(n))}`
  if (n < 20) return SPANISH_UNITS[n]
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const unit = n % 10
    if (n === 20) return "veinte"
    if (n > 20 && n < 30) return unit === 0 ? "veinte" : `veinti${SPANISH_UNITS[unit]}`
    return unit === 0 ? SPANISH_TENS[tens] : `${SPANISH_TENS[tens]} y ${SPANISH_UNITS[unit]}`
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100)
    const rest = n % 100
    if (n === 100) return "cien"
    const hundredsWord = SPANISH_HUNDREDS[hundreds]
    return rest === 0 ? hundredsWord : `${hundredsWord} ${numberToSpanishWordsInt(rest)}`
  }
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000)
    const rest = n % 1000
    const thousandsWord = thousands === 1 ? "mil" : `${numberToSpanishWordsInt(thousands)} mil`
    return rest === 0 ? thousandsWord : `${thousandsWord} ${numberToSpanishWordsInt(rest)}`
  }
  // Fallback simple for larger numbers (unlikely in this context)
  return n.toString()
}

function formatMetersToWords(lengthMeters: number): string {
  // Convert to millimeters, maintain 3 decimals precision as integers of mm.
  const totalMillimeters = Math.round(lengthMeters * 1000)
  const meters = Math.floor(totalMillimeters / 1000)
  const millimeters = totalMillimeters % 1000

  // Special case: if decimal is exactly 000, return only meters
  if (millimeters === 0 && meters > 0) {
    return meters === 1 ? "un metro" : `${numberToSpanishWordsInt(meters)} metros`
  }

  const metersPart =
    meters > 0 ? (meters === 1 ? "un metro" : `${numberToSpanishWordsInt(meters)} metros`) : ""
  const mmPart =
    millimeters > 0
      ? `${numberToSpanishWordsInt(millimeters)} ${millimeters === 1 ? "milímetro" : "milímetros"}`
      : ""

  if (meters > 0 && millimeters > 0) {
    // Style without "y" as per examples: "seis metros setecientos cincuenta milímetros"
    return `${metersPart} ${mmPart}`.trim()
  }
  if (meters > 0) return metersPart
  if (millimeters > 0) return mmPart
  // If zero, return "cero milímetros"
  return "cero milímetros"
}

// --- Unit name header formatting ---

function capitalizeSentenceCase(input: string): string {
  const lower = input.toLowerCase()
  return lower.replace(/(^|[.\s_\-])([a-záéíóúñ])/g, (m, sep, c) => `${sep}${c.toUpperCase()}`)
}

function digitsToSpanish(nStr: string): string {
  const n = parseInt(nStr, 10)
  return numberToSpanishWordsInt(isNaN(n) ? 0 : n)
}

function replaceHyphenNumberWithGuion(text: string): string {
  return text.replace(/-([0-9]+)/g, (_m, d) => ` guion ${digitsToSpanish(d)}`)
}

function appendTrailingNumberInWords(text: string): string {
  // Only append if the number is standalone (not part of a code)
  // Check if text ends with a number that should be converted
  return text.replace(/(\d+)$/g, (_m, d) => {
    // Check if preceding character suggests it's part of a code (e.g., "-1", "_1")
    const beforeNumber = text.substring(0, text.length - d.length)
    const lastChar = beforeNumber.slice(-1)
    if (lastChar === "-" || lastChar === "_" || lastChar === ".") {
      return d // Don't append words if it's part of a code
    }
    return `${d} (${digitsToSpanish(d)})`
  })
}

export function formatUnitHeader(unitName: string): string {
  let name = unitName.trim()
  name = name.replace(/\s+/g, " ")
  // Normalize underscores to spaces for headers
  name = name.replace(/_/g, " ")
  // Title style (only first letters uppercase)
  name = capitalizeSentenceCase(name)
  // Convert hyphen-number to "guion <palabra>"
  name = replaceHyphenNumberWithGuion(name)
  // Convert dots in numbers (e.g., "1.1" in codes) to "punto"
  name = name.replace(/(\d+)\.(\d+)/g, (m, d1, d2) => `${digitsToSpanish(d1)} punto ${digitsToSpanish(d2)}`)
  // If ends with a number (not in a code), append its word in parentheses
  name = appendTrailingNumberInWords(name)
  // Ensure colon at the end
  if (!name.endsWith(":")) name = `${name}:`
  return name
}

// --- Abutter normalization ---

const ACRONYMS_KEEP_UPPER = new Set(["AC", "ACS", "EB", "PB", "E", "B"])

function normalizeAcronymToken(token: string): string {
  if (ACRONYMS_KEEP_UPPER.has(token)) return token
  return token.toLowerCase()
}

function numberTokenToWords(token: string): string {
  const n = parseInt(token, 10)
  if (isNaN(n)) return token
  return numberToSpanishWordsInt(n)
}

function translateKnownPrefixes(text: string): string {
  // EST_ -> estacionamiento guion ...
  return text.replace(/^EST[_-]/i, "estacionamiento guion ")
}

function transformCodeLikeSequence(seq: string): string {
  // Split letters/digits/other while preserving sequence
  // Improved to handle numbers with dots (e.g., "1.1", "AC1.1EB")
  const parts = seq.match(/[A-Za-zÁÉÍÓÚÑ]+|\d+(?:\.\d+)?|[._-]+/g)
  if (!parts) return seq.toLowerCase()
  const transformed: string[] = []
  for (const part of parts) {
    if (/^[A-Za-zÁÉÍÓÚÑ]+$/.test(part)) {
      transformed.push(normalizeAcronymToken(part.toUpperCase()))
    } else if (/^\d+(?:\.\d+)?$/.test(part)) {
      // Handle numbers with dots (e.g., "1.1" -> "uno punto uno")
      if (part.includes(".")) {
        const [intPart, decPart] = part.split(".")
        transformed.push(numberTokenToWords(intPart))
        transformed.push("punto")
        transformed.push(numberTokenToWords(decPart))
      } else {
        transformed.push(numberTokenToWords(part))
      }
    } else if (part === "-") {
      transformed.push("guion")
    } else if (part === ".") {
      transformed.push("punto")
    } else if (/^[-_.]+$/.test(part)) {
      // For sequences like "-_", replace hyphens with "guion", dots with "punto", ignore underscores
      for (const ch of part.split("")) {
        if (ch === "-") transformed.push("guion")
        else if (ch === ".") transformed.push("punto")
      }
    } else {
      transformed.push(part.toLowerCase())
    }
  }
  return transformed.join(" ").replace(/\s+/g, " ").trim()
}

function isVoidAbutter(text: string): boolean {
  const t = text.toUpperCase()
  return (
    t.includes("CUBO DE ILUMINACION") ||
    t.includes("CUBO DE ILUMINACIÓN") ||
    t.includes("CUBO DE LUZ") ||
    t.startsWith("CUBO ") ||
    t.includes("VACIO") ||
    t.includes("VACÍO") ||
    t.includes("SHAFT") ||
    t.includes("HUECO")
  )
}

function transformAbutter(abutter: string): string {
  let t = abutter.trim()
  // Remove leading "CON " if present (prevents "CON CON" duplication)
  t = t.replace(/^\s*CON\s+/i, "").trim()
  t = t.replace(/\s+/g, " ")
  t = translateKnownPrefixes(t)

  // If abutter looks like a code mixture, transform accordingly
  // Handle chunks separated by spaces
  const words = t.split(" ")
  const out: string[] = []
  for (const w of words) {
    if (/^[A-Za-zÁÉÍÓÚÑ0-9._-]+$/.test(w)) {
      out.push(transformCodeLikeSequence(w))
    } else {
      out.push(w.toLowerCase())
    }
  }
  t = out.join(" ").replace(/\s+/g, " ").trim()

  if (isVoidAbutter(abutter)) {
    // Enforce "vacío de <phrase>"
    // Remove leading "con " or "con" if present and lower-case the phrase
    t = t.replace(/^con\s+/i, "").trim()
    return `vacío de ${t}`
  }
  // Ensure "con" is lowercased when composing sentence (added later)
  return t
}

// --- Parsing colindancias text ---

// Updated regex to include SUPERIOR/INFERIOR and handle "AL " prefix
const DIRECTION_REGEX = /^(?:AL\s+)?(OESTE|NOROESTE|NORTE|NORESTE|ESTE|SURESTE|SUR|SUROESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR|COLINDANCIA\s+SUPERIOR|COLINDANCIA\s+INFERIOR)\s*[:\-]?\s*/i
const LENGTH_PATTERNS = [
  /(?:^|\s)EN\s*([0-9]+(?:[\.,][0-9]{1,3})?)\s*m\b/i, // EN <n> m
  /\bLc\s*=\s*([0-9]+(?:[\.,][0-9]{1,3})?)\s*m?\b/i, // Lc=<n> (optional m)
  /\b([0-9]+(?:[\.,][0-9]{1,3})?)\s*m\b/i, // <n> m
]
const AFTER_CON_REGEX = /\bCON\b\s*(.+)$/i

function normalizeNumber(value: string): number {
  const v = value.replace(",", ".")
  const n = Number.parseFloat(v)
  return isNaN(n) ? 0 : n
}

function normalizeDirection(dir: string): DirectionKey {
  const upper = dir.toUpperCase().trim()
  if (upper === "COLINDANCIA SUPERIOR" || upper === "SUPERIOR") return "ARRIBA"
  if (upper === "COLINDANCIA INFERIOR" || upper === "INFERIOR") return "ABAJO"
  return upper as DirectionKey
}

// Parse colindancias maintaining ORIGINAL ORDER
function parseColindancias(colText: string): DirectionGroup[] {
  const lines = colText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^SUPERFICIE/i.test(l) && !/\b(m2|m\^2|metros cuadrados)\b/i.test(l))

  const groups: DirectionGroup[] = []
  const groupMap = new Map<DirectionKey, number>() // direction -> index in groups array
  let currentDir: DirectionKey | null = null
  let globalOrder = 0

  for (const rawLine of lines) {
    let line = rawLine
    const mDir = line.match(DIRECTION_REGEX)
    if (mDir) {
      const rawDir = mDir[1].toUpperCase().trim()
      currentDir = normalizeDirection(rawDir)
      line = line.replace(DIRECTION_REGEX, "")
      
      // Create new group if this direction hasn't been seen yet
      if (!groupMap.has(currentDir)) {
        const newGroup: DirectionGroup = {
          direction: currentDir,
          segments: [],
          order: globalOrder++,
        }
        groups.push(newGroup)
        groupMap.set(currentDir, groups.length - 1)
      }
    }
    if (!currentDir) {
      // skip lines before any direction header
      continue
    }

    // Extract length
    let lengthMeters = 0
    for (const re of LENGTH_PATTERNS) {
      const m = line.match(re)
      if (m) {
        lengthMeters = normalizeNumber(m[1])
        break
      }
    }
    // Extract abutter after "CON"
    let abutter = ""
    const mCon = line.match(AFTER_CON_REGEX)
    if (mCon) {
      abutter = mCon[1].trim()
      // Remove leading "CON " if somehow duplicated
      abutter = abutter.replace(/^\s*CON\s+/i, "").trim()
    } else {
      // Try sentences like "... CON <who>" across lines: keep remainder of line if not found
      const parts = line.split(/\bCON\b/i)
      if (parts.length > 1) {
        abutter = parts.slice(1).join(" ").trim()
        // Remove leading "CON " if somehow duplicated
        abutter = abutter.replace(/^\s*CON\s+/i, "").trim()
      }
    }

    // Add segment to the appropriate group
    const groupIndex = groupMap.get(currentDir)!
    const segment: ParsedSegment = {
      lengthMeters,
      abutterRaw: abutter,
      originalDirection: currentDir,
      originalOrder: groups[groupIndex].segments.length,
    }
    groups[groupIndex].segments.push(segment)
  }

  // Sort groups by original order
  return groups.sort((a, b) => a.order - b.order)
}

function pluralizeTramos(n: number): string {
  const map: Record<number, string> = { 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco" }
  return map[n] || numberToSpanishWordsInt(n)
}

function getDirectionLabel(direction: DirectionKey): string {
  const labels: Record<DirectionKey, string> = {
    OESTE: "al oeste",
    NORTE: "al norte",
    ESTE: "al este",
    SUR: "al sur",
    NOROESTE: "al noroeste",
    NORESTE: "al noreste",
    SURESTE: "al sureste",
    SUROESTE: "al suroeste",
    ARRIBA: "en su colindancia superior",
    ABAJO: "en su colindancia inferior",
    SUPERIOR: "en su colindancia superior",
    INFERIOR: "en su colindancia inferior",
  }
  return labels[direction] || direction.toLowerCase()
}

function ordinalWord(n: number): string {
  const map: Record<number, string> = {
    1: "primero",
    2: "segundo",
    3: "tercero",
    4: "cuarto",
    5: "quinto",
    6: "sexto",
    7: "séptimo",
    8: "octavo",
    9: "noveno",
    10: "décimo",
  }
  return map[n] || `${n}º`
}

// --- Public main API ---

export function notarialize(colindanciasText: string, unitName: string): string {
  const header = formatUnitHeader(unitName)
  const groups = parseColindancias(colindanciasText) // Returns groups in ORIGINAL ORDER

  if (groups.length === 0) {
    return `${header} .`
  }

  const parts: string[] = []
  
  function buildPhrase(group: DirectionGroup, isFirst: boolean, isLast: boolean): string {
    const directionLabel = getDirectionLabel(group.direction)
    const segs = group.segments
    const isVertical = group.direction === "ARRIBA" || group.direction === "ABAJO" || group.direction === "SUPERIOR" || group.direction === "INFERIOR"

    if (segs.length === 1) {
      const s = segs[0]
      const abutter = transformAbutter(s.abutterRaw)
      const prefix = isLast ? "y, " : isFirst ? "" : ""
      
      // Para direcciones verticales sin medida (0.000 o NaN), omitir la parte "en [medida]"
      // Usar comparación con tolerancia para detectar 0.000
      const hasNoMeasure = isNaN(s.lengthMeters) || Math.abs(s.lengthMeters) < 0.001
      if (isVertical && hasNoMeasure) {
        return `${prefix}${directionLabel}, con ${abutter}`
      }
      
      // Para direcciones normales o verticales con medida, incluir la medida
      const measure = formatMetersToWords(s.lengthMeters)
      return `${prefix}${directionLabel}, en ${measure}, con ${abutter}`
    }

    // Multiple segments
    const tramoCountWord = pluralizeTramos(segs.length)
    const tramoPhrases: string[] = []
    
    segs.forEach((s, idx) => {
      const abutter = transformAbutter(s.abutterRaw)
      const ord = ordinalWord(idx + 1)
      
      // Para direcciones verticales sin medida (0.000 o NaN), omitir la medida
      // Usar comparación con tolerancia para 0.000
      const hasNoMeasure = isNaN(s.lengthMeters) || Math.abs(s.lengthMeters) < 0.001
      if (isVertical && hasNoMeasure) {
        tramoPhrases.push(`el ${ord}, con ${abutter}`)
      } else {
        const measure = formatMetersToWords(s.lengthMeters)
        tramoPhrases.push(`el ${ord} de ${measure}, con ${abutter}`)
      }
    })

    const last = tramoPhrases.pop()
    const joined = tramoPhrases.length > 0 
      ? `${tramoPhrases.join(", ")}, y ${last}` 
      : (last || "")

    const prefix = isLast ? "y, " : isFirst ? "" : ""
    return `${prefix}${directionLabel}, en ${tramoCountWord} tramos, ${joined}`
  }

  // Build phrases respecting ORIGINAL ORDER
  // Find the last group with segments
  let lastGroupIndex = -1
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].segments.length > 0) {
      lastGroupIndex = i
      break
    }
  }

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    if (group.segments.length === 0) continue

    const isFirst = parts.length === 0
    const isLast = i === lastGroupIndex

    parts.push(buildPhrase(group, isFirst, isLast))
  }

  // Join parts with semicolons and end with period.
  const body = parts.join("; ") + "."
  return `${header} ${body}`
}


