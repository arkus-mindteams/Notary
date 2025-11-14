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

type DirectionKey = "OESTE" | "NORTE" | "ESTE" | "SUR" | "NOROESTE" | "NORESTE" | "SURESTE" | "SUROESTE" | "ARRIBA" | "ABAJO"

interface ParsedSegment {
  lengthMeters: number
  abutterRaw: string
}

const BASE_DIRECTIONS_ORDER: DirectionKey[] = ["OESTE", "NORTE", "ESTE", "SUR"]
type BaseDirection = "OESTE" | "NORTE" | "ESTE" | "SUR"

const DIAGONAL_TO_BASE: Record<DirectionKey, BaseDirection | "ARRIBA" | "ABAJO"> = {
  OESTE: "OESTE",
  NOROESTE: "OESTE",
  SUROESTE: "OESTE",
  NORTE: "NORTE",
  NORESTE: "ESTE",
  ESTE: "ESTE",
  SURESTE: "ESTE",
  SUR: "SUR",
  ARRIBA: "ARRIBA",
  ABAJO: "ABAJO",
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

  const metersPart =
    meters > 0 ? `${numberToSpanishWordsInt(meters)} ${meters === 1 ? "metro" : "metros"}` : ""
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
  return text.replace(/(\d+)$/g, (_m, d) => `${d} (${digitsToSpanish(d)})`)
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
  // If ends with a number, append its word in parentheses
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
  const parts = seq.match(/[A-Za-zÁÉÍÓÚÑ]+|\d+|[._-]+/g)
  if (!parts) return seq.toLowerCase()
  const transformed: string[] = []
  for (const part of parts) {
    if (/^[A-Za-zÁÉÍÓÚÑ]+$/.test(part)) {
      transformed.push(normalizeAcronymToken(part.toUpperCase()))
    } else if (/^\d+$/.test(part)) {
      transformed.push(numberTokenToWords(part))
    } else if (part === "-") {
      transformed.push("guion")
    } else if (part === "." ) {
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

const DIRECTION_REGEX = /^(OESTE|NOROESTE|NORTE|NORESTE|ESTE|SURESTE|SUR|SUROESTE|ARRIBA|ABAJO)\s*[:\-]?\s*/i
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

function parseColindancias(colText: string): Map<DirectionKey, ParsedSegment[]> {
  const lines = colText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^SUPERFICIE/i.test(l) && !/\b(m2|m\^2|metros cuadrados)\b/i.test(l))

  const map = new Map<DirectionKey, ParsedSegment[]>()
  let currentDir: DirectionKey | null = null

  for (const rawLine of lines) {
    let line = rawLine
    const mDir = line.match(DIRECTION_REGEX)
    if (mDir) {
      currentDir = mDir[1].toUpperCase() as DirectionKey
      line = line.replace(DIRECTION_REGEX, "")
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
    } else {
      // Try sentences like "... CON <who>" across lines: keep remainder of line if not found
      const parts = line.split(/\\bCON\\b/i)
      if (parts.length > 1) abutter = parts.slice(1).join(" ").trim()
    }

    if (!map.has(currentDir)) map.set(currentDir, [])
    map.get(currentDir)!.push({
      lengthMeters,
      abutterRaw: abutter,
    })
  }
  return map
}

function collapseToBaseDirections(parsed: Map<DirectionKey, ParsedSegment[]>): Map<BaseDirection, ParsedSegment[]> {
  const baseMap = new Map<BaseDirection, ParsedSegment[]>()
  for (const dir of BASE_DIRECTIONS_ORDER) {
    baseMap.set(dir as BaseDirection, [])
  }
  for (const [dir, segs] of parsed.entries()) {
    const base = DIAGONAL_TO_BASE[dir]
    if (base === "ARRIBA" || base === "ABAJO") {
      continue
    }
    const bucket = baseMap.get(base as BaseDirection)
    if (!bucket) continue
    bucket.push(...segs)
  }
  return baseMap
}

function pluralizeTramos(n: number): string {
  const map: Record<number, string> = { 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco" }
  return map[n] || numberToSpanishWordsInt(n)
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
  const parsed = parseColindancias(colindanciasText)
  const base = collapseToBaseDirections(parsed)

  const parts: string[] = []
  function buildPhrase(prefix: string, label: string, segs: ParsedSegment[]): string {
    const dirLower = label.toLowerCase()
    if (segs.length === 1) {
      const s = segs[0]
      const measure = formatMetersToWords(s.lengthMeters)
      const abutter = transformAbutter(s.abutterRaw)
      return `${prefix} ${dirLower}, en ${measure}, con ${abutter}`
    }
    const tramoCountWord = pluralizeTramos(segs.length)
    const tramoPhrases: string[] = []
    segs.forEach((s, idx) => {
      const measure = formatMetersToWords(s.lengthMeters)
      const abutter = transformAbutter(s.abutterRaw)
      const ord = ordinalWord(idx + 1)
      tramoPhrases.push(`el ${ord} de ${measure}, con ${abutter}`)
    })
    const last = tramoPhrases.pop()
    const joined = tramoPhrases.length > 0 ? `${tramoPhrases.join(", ")}, y ${last}` : (last || "")
    return `${prefix} ${dirLower}, en ${tramoCountWord} tramos, ${joined}`
  }
  for (let i = 0; i < BASE_DIRECTIONS_ORDER.length; i++) {
    const dir = BASE_DIRECTIONS_ORDER[i]
    const segs = base.get(dir as BaseDirection)
    if (!segs || segs.length === 0) continue

    const prefix = i === BASE_DIRECTIONS_ORDER.length - 1 ? "y, al" : i === 0 ? "Al" : "al"
    parts.push(buildPhrase(prefix, dir, segs))
  }

  // Append vertical directions after cardinals
  const arribaSegs = parsed.get("ARRIBA")
  const abajoSegs = parsed.get("ABAJO")
  if (arribaSegs && arribaSegs.length > 0 && abajoSegs && abajoSegs.length > 0) {
    parts.push(buildPhrase("por", "arriba", arribaSegs))
    parts.push(buildPhrase("y, por", "abajo", abajoSegs))
  } else if (arribaSegs && arribaSegs.length > 0) {
    parts.push(buildPhrase("y, por", "arriba", arribaSegs))
  } else if (abajoSegs && abajoSegs.length > 0) {
    parts.push(buildPhrase("y, por", "abajo", abajoSegs))
  }

  // Join parts with semicolons and end with period.
  const body = parts.join("; ") + "."
  return `${header} ${body}`
}


