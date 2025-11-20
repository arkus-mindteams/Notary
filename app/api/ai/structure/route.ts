import { NextResponse } from "next/server"
import type { StructuringRequest, StructuringResponse, StructuredUnit } from "@/lib/ai-structuring-types"

const cache = new Map<string, StructuredUnit[]>()
const metadataCache = new Map<string, { lotLocation?: string; totalLotSurface?: number }>()

function hashPayload(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `${h}-${s.length}`
}

function buildPrompt(): string {
  return [
    "Eres un asistente experto en documentos notariales (deslindes). Analizas planos arquitectónicos para extraer información de unidades, colindancias y superficies.",
    "",
    "Devuelve EXCLUSIVAMENTE JSON válido con este esquema:",
    "{",
    '  "results": [',
    '    {',
    '      "unit": { "name": string, "location"?: string },',
    '      "boundaries": [ { "direction": "WEST"|"NORTHWEST"|"NORTH"|"NORTHEAST"|"EAST"|"SOUTHEAST"|"SOUTH"|"SOUTHWEST"|"UP"|"DOWN", "length_m": number, "abutter": string, "order_index": number } ],',
    '      "surfaces": [ { "name": string, "value_m2": number } ],',
    '      "anomalies"?: string[]',
    '    }',
    "  ],",
    '  "lotLocation"?: string,  // Ubicación del lote (manzana, lote, dirección, ciudad, estado)',
    '  "totalLotSurface"?: number  // Superficie total del lote en m² (no la suma de unidades)',
    "}",
    "",
    "===========================================================",
    "REGLA SUPREMA (NO IGNORAR)",
    "===========================================================",
    "",
    "El order_index DEBE seguir EXACTAMENTE el orden de aparición en el texto técnico interpretado.",
    "NUNCA reordenes las direcciones por cardinalidad (NORTE, SUR, ESTE, OESTE).",
    "NUNCA agrupes por cardinalidad.",
    "El orden original es EL ORDEN JURÍDICO que debe respetarse.",
    "",
    "Ejemplo: Si el texto dice OESTE, luego NORTE, luego ESTE, luego SUR:",
    "- order_index 0 = OESTE",
    "- order_index 1 = NORTE", 
    "- order_index 2 = ESTE",
    "- order_index 3 = SUR",
    "NO reordenes a OESTE, NORTE, ESTE, SUR si aparecen en diferente orden.",
    "",
    "Reglas generales:",
    "- Mantén el orden de aparición EXACTO (order_index desde 0, incrementando secuencialmente).",
    "- Normaliza a metros y m2, usa punto decimal (ej. 6.750).",
    "- No inventes datos; si faltan, deja listas vacías.",
    "- Responde SOLO JSON válido.",
    "",
    "Acotación del texto fuente:",
    '- El bloque de colindancias aparece bajo "MEDIDAS Y COLINDANCIAS" (variantes: "Medidas y Colindancias", "MEDIDAS Y COLINDANCIAS.").',
    '- Extrae colindancias solo desde ese encabezado hacia abajo y DETENTE al iniciar otra sección (ej: "SUPERFICIE(S)", "DESCRIPCIÓN", "CARACTERÍSTICAS", "OBSERVACIONES", "DATOS").',
    "- ELIMINA completamente cualquier línea que contenga:",
    '  • "SUPERFICIE"',
    '  • "m2", "m²"',
    "  • cualquier valor de metros cuadrados",
    "  Nunca incluyas estas superficies en el array de boundaries.",
    "",
    "Heurísticas de colindancias (RESPETANDO ORDEN ORIGINAL):",
    '- Cada colindancia inicia con direcciones en español: "NORTE", "SUR", "ESTE", "OESTE" o intercardinales "NOROESTE", "NORESTE", "SUROESTE", "SURESTE", con o sin "AL " (ej. "AL NORTE").',
    "- También puede haber colindancias verticales:",
    '  • "ARRIBA" / "COLINDANCIA SUPERIOR" / "SUPERIOR" → mapéalas como dirección "UP"',
    '  • "ABAJO" / "COLINDANCIA INFERIOR" / "INFERIOR" → mapéalas como dirección "DOWN"',
    "- Puede haber N colindancias por dirección (incluso repetidas). Conserva TODAS por separado y su orden EXACTO.",
    "- NO omitas ninguna colindancia aunque parezcan iguales o repetidas.",
    "- NO mezcles múltiples colindancias de la misma dirección en una sola entrada.",
    '- Cada colindancia suele tener una longitud y un colindante (ej. "colinda con …" / "con …"). Si falta alguno, conserva lo disponible.',
    '- Las longitudes pueden venir como "EN <n> M", "<n> M", "<n> MTS", "<n> METROS" o "LC=<n> (M)". Reconoce "LC=" como longitud.',
    '- La línea puede contener todo: "NORESTE: EN 5.4610 m CON ÁREA COMÚN…", o el detalle puede estar en líneas siguientes; extrae en ambos casos.',
    "- Conserva el texto completo del colindante incluyendo paréntesis, códigos y referencias:",
    '  • "(ACS-7 DE E-B)" → mantener completo',
    '  • "(AC-12)" → mantener completo',
    '  • "AC1.1EB-PB" → mantener completo',
    "",
    "",
    "Superficies (SEPARADAS de boundaries):",
    '- Extrae superficies presentes en el documento como pares nombre/valor_m2 (ej. "PLANTA BAJA": 59.280).',
    '- Las superficies van en el array "surfaces", NUNCA en "boundaries".',
    '- Reconoce encabezados y etiquetas como: "SUPERFICIE", "SUPERFICIE(S)", "SUPERFICIE LOTE", "SUPERFICIE TOTAL", "SUPERFICIE TOTAL PRIVATIVA", "SUPERFICIE DE ÁREA EDIFICADA", "SUPERFICIE DE PATIO POSTERIOR/FRONTAL", "SUPERFICIE DE PASILLO", "SUPERFICIE DE JUNTA CONSTRUCTIVA", así como abreviaturas "SUP." (p. ej., "SUP. LOTE", "SUP. TOTAL").',
    "- Acepta formatos con coma o punto decimal: 145,600 m² => 145.600.",
    '- Devuelve nombres claros y concisos (ej. "LOTE", "TOTAL PRIVATIVA", "ÁREA EDIFICADA", "PATIO POSTERIOR").',
    "",
    "Ubicación del lote (lotLocation):",
    '- Busca información de ubicación en el documento, especialmente al inicio o en encabezados.',
    '- Extrae datos como: manzana, lote, fraccionamiento, dirección, ciudad, estado.',
    '- Ejemplos: "MANZANA 114, LOTE 5-A", "FRACCIONAMIENTO BURDEOS, MANZANA 114, LOTE 5-A, TIJUANA, B.C.", "LOTE 5-82 MANZANA 174".',
    '- Si no encuentras ubicación específica, deja este campo vacío (undefined).',
    "",
    "Superficie total del lote (totalLotSurface):",
    '- Busca la superficie TOTAL del lote (no la suma de unidades individuales).',
    '- Busca términos como: "SUPERFICIE LOTE", "SUPERFICIE TOTAL", "SUPERFICIE TOTAL DEL LOTE", "SUP. LOTE", "SUP. TOTAL".',
    '- Esta es la superficie del terreno completo, no la suma de las superficies de las unidades.',
    '- Si no encuentras una superficie total del lote específica, deja este campo vacío (undefined).',
    "",
    "Nombre de unidad (unit.name):",
    '- Prioriza patrones como "UNIDAD <n/ código>" (ej. "UNIDAD 64", "UNIDAD B-2"), "CUBO DE ILUMINACIÓN/ILUMINACION", "JUNTA CONSTRUCTIVA <n>", "CAJON DE ESTACIONAMIENTO/ESTACIONAMIENTO".',
    '- NO uses encabezados o secciones como nombre de unidad: "MEDIDAS Y COLINDANCIAS", "SUPERFICIE(S)", "CONDOMINIO", "FRACCIONAMIENTO", nombres de empresa ("PROMOTORA", "DESARROLLADORA"), sellos o marcas.',
    "",
    "Regla crítica de validez de unidad:",
    "- Solo consideres una unidad/área como válida si, DESPUÉS de su nombre, puedes identificar al menos una colindancia (boundary) con dirección + longitud + colindante.",
    "- Si no hay ninguna colindancia confiable para esa unidad, devuelve boundaries: [] y, si es posible, anota una explicación en anomalies.",
    "",
    "ORDEN DE LAS COLINDANCIAS (CRÍTICO):",
    "- El order_index DEBE seguir el orden de aparición en el texto, NO el orden cardinal.",
    "- Si aparecen: OESTE (order_index 0), SUR (order_index 1), NORTE (order_index 2), ESTE (order_index 3),",
    "  mantén ese orden exacto en el JSON.",
    "- Si una dirección aparece múltiples veces, cada aparición debe tener su propio order_index secuencial.",
    "- NO reordenes a OESTE, NORTE, ESTE, SUR si aparecen en otro orden.",
    "- NO agrupes todas las colindancias de una dirección; mantén cada entrada separada.",
    "",
    "EJEMPLO COMPLETO (referencia, NO lo inventes, solo sigue el mismo patrón de salida):",
    "",
    "Texto OCR de entrada simplificado:",
    "\"UNIDAD B-2\\n",
    "OESTE:\\n",
    "6.750 MTS. CON UNIDAD B-4\\n",
    "1.750 MTS. CON CUBO DE ILUMINACION\\n",
    "NORTE:\\n",
    "2.550 MTS CON CUBO DE ILUMINACION\\n",
    "4.720 MTS. CON JUNTA CONSTRUCTIVA 1\\n",
    "ESTE:\\n",
    "0.520 MTS CON AREA COMUN DE SERVICIO 7 DE EDIFICIO B (ACS-7 DE E-B)\\n",
    "3.480 MTS CON AREA COMUN (AC-12)\\n",
    "4.500 MTS. CON AREA COMUN (AC-12)\\n",
    "SUR:\\n",
    "0.300 MTS CON AREA COMUN (AC-12)\\n",
    "5.370 MTS CON AREA COMUN 1 DE EDIFICIO B EN PLANTA BAJA (AC1.1EB-PB)\\n",
    "SUPERFICIE: 55.980 m2\"",
    "",
    "Salida JSON esperada para ese bloque:",
    "{",
    '  \"unit\": { \"name\": \"UNIDAD B-2\" },',
    '  \"boundaries\": [',
    '    { \"direction\": \"WEST\", \"length_m\": 6.75, \"abutter\": \"UNIDAD B-4\", \"order_index\": 0 },',
    '    { \"direction\": \"WEST\", \"length_m\": 1.75, \"abutter\": \"CUBO DE ILUMINACION\", \"order_index\": 1 },',
    '    { \"direction\": \"NORTH\", \"length_m\": 2.55, \"abutter\": \"CUBO DE ILUMINACION\", \"order_index\": 2 },',
    '    { \"direction\": \"NORTH\", \"length_m\": 4.72, \"abutter\": \"JUNTA CONSTRUCTIVA 1\", \"order_index\": 3 },',
    '    { \"direction\": \"EAST\", \"length_m\": 0.52, \"abutter\": \"AREA COMUN DE SERVICIO 7 DE EDIFICIO B (ACS-7 DE E-B)\", \"order_index\": 4 },',
    '    { \"direction\": \"EAST\", \"length_m\": 3.48, \"abutter\": \"AREA COMUN (AC-12)\", \"order_index\": 5 },',
    '    { \"direction\": \"EAST\", \"length_m\": 4.5, \"abutter\": \"AREA COMUN (AC-12)\", \"order_index\": 6 },',
    '    { \"direction\": \"SOUTH\", \"length_m\": 0.3, \"abutter\": \"AREA COMUN (AC-12)\", \"order_index\": 7 },',
    '    { \"direction\": \"SOUTH\", \"length_m\": 5.37, \"abutter\": \"AREA COMUN 1 DE EDIFICIO B EN PLANTA BAJA (AC1.1EB-PB)\", \"order_index\": 8 }',
    "  ],",
    '  \"surfaces\": [',
    '    { \"name\": \"PRIVATIVA\", \"value_m2\": 55.98 }',
    "  ]",
    "}",
    "",
    "Repite este mismo criterio para otras unidades como \"CUBO DE ILUMINACION\", \"JUNTA CONSTRUCTIVA 1\", \"JUNTA CONSTRUCTIVA 2\", \"CAJON DE ESTACIONAMIENTO\", \"AREA COMUN (AC-12)\", etc.:",
    "- Usa el encabezado como unit.name (normalizado).",
    "- Toma SOLO las colindancias que pertenecen a ese bloque/unidad.",
    "- Extrae la superficie si está presente (SUPERFICIE: ... m2), sin inventar valores.",
    "- RESPETA SIEMPRE el orden de aparición en el texto original para el order_index de cada boundary.",
    "",
    "RESUMEN FINAL:",
    "1. order_index = orden de aparición EXACTO en el texto (0, 1, 2, 3...).",
    "2. NUNCA reordenes por cardinalidad (OESTE, NORTE, ESTE, SUR).",
    "3. NUNCA mezcles múltiples colindancias de la misma dirección.",
    "4. ELIMINA superficies (m2, m²) del bloque de colindancias.",
    "5. CONSERVA todas las colindancias, incluso si parecen repetidas.",
    "6. MANTÉN el texto completo de los colindantes (incluyendo paréntesis y códigos).",
  ].join("\n")
}

function preFilterOCRText(ocrText: string, unitHint?: string): string {
  if (!ocrText) return ""
  const text = ocrText.replace(/\r/g, "")
  const lower = text.toLowerCase()
  // Encontrar TODAS las ocurrencias de "Medidas y Colindancias" para construir candidatos
  const headings: number[] = []
  const regex = /medidas\s*y\s*colindancias/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(lower)) !== null) {
    headings.push(m.index)
  }
  // Si no hay encabezados claros, regresar texto original acotado
  if (headings.length === 0) {
    let sliced = text
    const endMatch = sliced.match(/(^|\n)\s*(superficie|superficies|descripci[oó]n|caracter[ií]sticas|observaciones|datos)\b/gi)
    if (endMatch && endMatch.index !== undefined && endMatch.index > 0) {
      sliced = sliced.slice(0, endMatch.index)
    }
    if (sliced.length > 8000) sliced = sliced.slice(0, 8000)
    return sliced.trim()
  }
  // Crear bloques candidatos entre cada encabezado y el siguiente encabezado fuerte
  const strongHeaderRe = /(^|\n)\s*(superficie|superficies|descripci[oó]n|caracter[ií]sticas|observaciones|datos|medidas\s*y\s*colindancias)\b/gi
  const candidates: string[] = []
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i]
    const slice = text.slice(start)
    const endMatch = slice.match(strongHeaderRe)
    let candidate = slice
    if (endMatch && endMatch.index !== undefined && endMatch.index > 0) {
      candidate = slice.slice(0, endMatch.index)
    }
    candidates.push(candidate.trim())
  }
  // Preparar pistas de unidad
  const unitUpper = (unitHint || "").toUpperCase()
  let unitToken = ""
  const mUnit = unitUpper.match(/UNIDAD\s+([A-Z0-9\-]+)/)
  if (mUnit && mUnit[1]) {
    unitToken = mUnit[1]
  }
  // Puntuar candidatos
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const cu = c.toUpperCase()
    let score = 0
    // Presencia de la unidad sugerida
    if (unitUpper && cu.includes(unitUpper)) score += 8
    if (unitToken && cu.includes(unitToken)) score += 6
    // Densidad de direcciones
    const dirCount = (cu.match(/\b(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE)\b/g) || []).length
    score += dirCount
    // Penalizar bloques típicos de estacionamiento (pero no descartar)
    if (/\bESTACIONAMIENTO|CAJ[ÓO]N\b/.test(cu)) score -= 3
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  let chosen = candidates[bestIdx] || candidates[0] || text
  if (chosen.length > 8000) chosen = chosen.slice(0, 8000)
  return chosen.trim()
}

type UnitBlock = {
  heading: string
  text: string
}

function splitTextIntoUnitBlocks(ocrText: string): UnitBlock[] {
  if (!ocrText) return []
  const text = ocrText.replace(/\r/g, "")
  const lines = text.split(/\n+/)

  const headingPattern = new RegExp(
    [
      "^UNIDAD\\s+[A-Z0-9\\-]+",
      "^CUBO\\s+DE\\s+ILUMINACI[ÓO]N",
      "^JUNTA\\s+CONSTRUCTIVA\\s+\\d+",
      "^CAJ[ÓO]N\\s+DE\\s+ESTACIONAMIENTO(?:\\s+[A-Z0-9\\-]+)?",
      "^ESTACIONAMIENTO(?:\\s+[A-Z0-9\\-]+)?",
      "^ÁREAS?\\s+COMUN(?:ES)?(?:\\s+DE\\s+SERVICIO)?(?:\\s+[A-Z0-9\\-]+)?",
      "^AREAS?\\s+COMUN(?:ES)?(?:\\s+DE\\s+SERVICIO)?(?:\\s+[A-Z0-9\\-]+)?",
    ].join("|"),
    "i"
  )

  const blocks: UnitBlock[] = []
  let currentHeading = "UNIDAD"
  let currentLines: string[] = []

  const pushCurrent = () => {
    const chunk = currentLines.join("\n").trim()
    if (!chunk) return
    blocks.push({
      heading: currentHeading,
      text: chunk,
    })
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && headingPattern.test(trimmed)) {
      if (currentLines.length) pushCurrent()
      currentHeading = trimmed
      currentLines = [trimmed]
    } else {
      currentLines.push(line)
    }
  }
  pushCurrent()

  if (!blocks.length) {
    blocks.push({ heading: "UNIDAD", text })
  }

  return blocks
}

function pickUnitNameFromText(ocrText: string, fallback: string = "UNIDAD"): string {
  const upper = ocrText.toUpperCase()
  const patterns = [
    /UNIDAD\s+[A-Z0-9\-]+/g,
    /U[\-\s]?(\d+)/g, // e.g. U-64 => UNIDAD 64
    /CUBO DE ILUMINACI[ÓO]N/g,
    /JUNTA CONSTRUCTIVA\s+\d+/g,
    /CAJ[ÓO]N DE ESTACIONAMIENTO|ESTACIONAMIENTO/g,
    /LOTE\s+[0-9A-Z\-]+(?:\s*,\s*MANZANA\s+[0-9A-Z\-]+)?/g,
    /ÁREAS?\s+COMUN(?:ES)?(?:\s*\([^)]*\))?/g,
    /AREAS?\s+COMUN(?:ES)?(?:\s*\([^)]*\))?/g,
  ]
  for (const p of patterns) {
    const m = upper.match(p)
    if (m && m[0]) {
      const hit = m[0]
      if (/^U[\-\s]?\d+$/i.test(hit)) {
        const num = hit.replace(/[^0-9]/g, "")
        if (num) return `UNIDAD ${num}`
      }
      return hit
    }
  }
  return fallback
}

function normalizeUnitName(name: string | undefined | null): string {
  return (name || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:]+$/g, "")
    .trim()
}

function isHeadingLikeName(name: string): boolean {
  const bad = normalizeUnitName(name)
  if (!bad) return true
  if (bad === "MEDIDAS Y COLINDANCIAS") return true
  if (bad === "MEDIDAS") return true
  if (bad === "COLINDANCIAS") return true
  if (bad.startsWith("SUPERFICIE")) return true
  if (bad === "CONDOMINIO" || bad === "FRACCIONAMIENTO") return true
  if (/PROMOTORA|DESARROLLADORA|S\.?A\.?/i.test(bad)) return true
  // Descartar nombres demasiado largos (descripciones completas)
  if (bad.length > 80) return true
  return false
}

// Fusionar unidades con el mismo nombre lógico (ignorando mayúsculas/acentos)
function mergeUnitsByName(units: StructuredUnit[]): StructuredUnit[] {
  const byName = new Map<string, StructuredUnit>()

  for (const u of units) {
    const rawName = u.unit?.name || ""
    const norm = normalizeUnitName(rawName)
    if (!norm || isHeadingLikeName(rawName)) {
      continue
    }

    const existing = byName.get(norm)
    if (!existing) {
      byName.set(norm, u)
      continue
    }

    // Fusionar boundaries
    const mergedBoundaries: StructuredUnit["boundaries"] = [
      ...(existing.boundaries || []),
      ...(u.boundaries || []),
    ]
    mergedBoundaries.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    mergedBoundaries.forEach((b, idx) => {
      b.order_index = idx
    })

    // Fusionar surfaces (por nombre)
    const mergedSurfaces: { name: string; value_m2: number }[] = []
    const seen = new Map<string, { name: string; value_m2: number }>()
    const pushSurface = (s: { name: string; value_m2: number }) => {
      const key = normalizeUnitName(s.name)
      const prev = seen.get(key)
      if (!prev) {
        seen.set(key, { name: s.name, value_m2: s.value_m2 })
      } else {
        // Si hay conflicto, conservar el valor mayor como heurística
        if (typeof s.value_m2 === "number" && s.value_m2 > (prev.value_m2 || 0)) {
          seen.set(key, { name: s.name, value_m2: s.value_m2 })
        }
      }
    }
    ;(existing.surfaces || []).forEach(pushSurface)
    ;(u.surfaces || []).forEach(pushSurface)
    seen.forEach((v) => mergedSurfaces.push(v))

    existing.boundaries = mergedBoundaries
    existing.surfaces = mergedSurfaces
  }

  return Array.from(byName.values())
}

function heuristicBoundaries(ocrText: string): StructuredUnit["boundaries"] {
  const lines = ocrText.split(/\n+/)
  const out: StructuredUnit["boundaries"] = []
  const dirMap: Record<string, string> = {
    NORTE: "NORTH",
    SUR: "SOUTH",
    ESTE: "EAST",
    OESTE: "WEST",
    NOROESTE: "NORTHWEST",
    NORESTE: "NORTHEAST",
    SUROESTE: "SOUTHWEST",
    SURESTE: "SOUTHEAST",
    ARRIBA: "UP",
    ABAJO: "DOWN",
    SUPERIOR: "UP",
    INFERIOR: "DOWN",
  }
  let order = 0
  for (const raw of lines) {
    const l = raw.toUpperCase().trim()
    const dirMatch = l.match(/\b(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\b/)
    if (!dirMatch) continue
    const dir = dirMap[(dirMatch[2] || "").toUpperCase()]
    if (!dir) continue
    // Longitud: números con punto o coma, opcional m/mts/ml
    const lenMatch =
      l.match(/(\d+(?:[.,]\d+)?)(?=\s*(MTS?|ML|M\.?)(\b|[^A-Z]))/) ||
      l.match(/\bLC\s*=\s*(\d+(?:[.,]\d+)?)/)
    const length_m =
      lenMatch ? parseFloat(lenMatch[1].replace(",", ".")) : NaN
    // Abutter: después de "CON" o "COLINDA CON"
    let abutter = ""
    const conIdx = l.indexOf(" CON ")
    if (conIdx >= 0) {
      abutter = l.slice(conIdx + 5).replace(/\s+/g, " ").trim()
    } else {
      const colIdx = l.indexOf(" COLINDA CON ")
      if (colIdx >= 0) abutter = l.slice(colIdx + 13).replace(/\s+/g, " ").trim()
    }
    out.push({
      direction: dir,
      length_m: isNaN(length_m) ? 0 : length_m,
      abutter,
      order_index: order++,
    })
  }
  return out
}

// Más estricto: escanea encabezados de dirección y busca línea(s) siguientes con "EN <n> m" y "CON ..."
function parseBoundariesFromText(ocrText: string): StructuredUnit["boundaries"] {
  const dirMap: Record<string, string> = {
    NORTE: "NORTH",
    SUR: "SOUTH",
    ESTE: "EAST",
    OESTE: "WEST",
    NOROESTE: "NORTHWEST",
    NORESTE: "NORTHEAST",
    SUROESTE: "SOUTHWEST",
    SURESTE: "SOUTHEAST",
    ARRIBA: "UP",
    ABAJO: "DOWN",
    SUPERIOR: "UP",
    INFERIOR: "DOWN",
  }
  const lines = ocrText.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const upper = lines.map((s) => s.toUpperCase())
  const out: StructuredUnit["boundaries"] = []
  let order = 0
  for (let i = 0; i < upper.length; i++) {
    // Acepta encabezado solo o encabezado con contenido en la misma línea
    const lm = upper[i].match(/^(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\s*:?\s*(.*)$/)
    if (!lm) continue
    const dirEs = (lm[2] || "").toUpperCase()
    const direction = dirMap[dirEs]
    if (!direction) continue
    // Buscar en las próximas líneas un patrón de longitud y colindante.
    let length_m = 0
    let abutter = ""
    // 1) Intentar extraer en la misma línea si hay contenido tras el encabezado
    const sameLine = (lm[3] || "").trim()
    if (sameLine) {
      const uj = sameLine
      const lenEn = uj.match(/\bEN\s+(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
      const lenBare = uj.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
      const lenLc = uj.match(/\bLC\s*=\s*(\d+(?:[.,]\d+)?)/)
      const lenMatch = lenEn || lenBare || lenLc
      if (lenMatch) {
        length_m = parseFloat(lenMatch[1].replace(",", "."))
        const conSame = uj.match(/\bCON\s+(.+?)\s*$/) || uj.match(/\bCOLINDA CON\s+(.+?)\s*$/)
        if (conSame && conSame[1]) {
          abutter = conSame[1].trim()
        }
      }
    }
    // 2) Si no se encontró en la misma línea, buscar en las siguientes
    if (!length_m || !abutter) {
      for (let j = i + 1; j < Math.min(i + 8, upper.length); j++) {
        const uj = upper[j]
      // Formatos válidos:
      // 1) "EN <n> M" (con o sin punto) opcional "CON ...".
      // 2) "<n> M" (con o sin punto) opcional "CON ...".
      // 3) línea posterior que inicie con "CON " o "COLINDA CON ".
      // 4) "LC=<n> M" o "LC=<n>" (longitud de arco común en planos)
      const lenEn = uj.match(/\bEN\s+(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
      const lenBare = uj.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*M(?:TS|ETROS|\.|\b)/)
      const lenLc = uj.match(/\bLC\s*=\s*(\d+(?:[.,]\d+)?)/)
      const lenMatch = lenEn || lenBare || lenLc
      if (lenMatch) {
        length_m = parseFloat(lenMatch[1].replace(",", "."))
        // abutter mismo renglón si viene tras "CON ..."
        const conSame = uj.match(/\bCON\s+(.+?)\s*$/) || uj.match(/\bCOLINDA CON\s+(.+?)\s*$/)
        if (conSame && conSame[1]) {
          abutter = conSame[1].trim()
        } else if (j + 1 < upper.length) {
          const next = upper[j + 1]
          const conNext = next.match(/^\s*(CON|COLINDA CON)\s+(.+?)\s*$/)
          if (conNext && conNext[2]) abutter = conNext[2].trim()
        }
        break
      } else {
        // Línea tipo "CON ..." sin longitud aún
        const onlyCon = uj.match(/^\s*(CON|COLINDA CON)\s+(.+?)\s*$/)
        if (onlyCon && onlyCon[2] && !abutter) {
          abutter = onlyCon[2].trim()
        }
      }
      }
    }
    out.push({
      direction,
      length_m: isFinite(length_m) ? length_m : 0,
      abutter,
      order_index: order++,
    })
  }
  return out
}

/**
 * Call OpenAI Vision API with images
 * Supports any OpenAI model with vision capabilities:
 * - gpt-4o (default, recommended)
 * - gpt-4o-mini
 * - gpt-4-turbo
 * - gpt-5.1 (if available - use OPENAI_MODEL=gpt-5.1)
 * 
 * To verify available models, check: https://platform.openai.com/docs/models
 * or call: GET https://api.openai.com/v1/models
 * 
 * To use GPT-5.1, set OPENAI_MODEL=gpt-5.1 in your environment variables
 * 
 * @param prompt System prompt for the model
 * @param images Array of image files to analyze
 * @returns Parsed JSON response
 */
async function callOpenAIVision(prompt: string, images: File[]): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY
  // Default to gpt-4o, but can be overridden with OPENAI_MODEL env var
  // For GPT-5.1, set OPENAI_MODEL=gpt-5.1
  // Note: Model names may vary (e.g., gpt-5.1, gpt-5.1-preview, gpt-5.1-2024-12-01)
  // Check OpenAI documentation for the exact model identifier
  const model = process.env.OPENAI_MODEL || "gpt-4o"
  
  // Log the model being used for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[OpenAI Vision] Using model: ${model}`)
  }
  
  if (!apiKey) throw new Error("OPENAI_API_KEY missing")
  
  // Convert images to base64
  const imageParts = await Promise.all(
    images.map(async (image) => {
      const arrayBuffer = await image.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString("base64")
      return {
        type: "image_url",
        image_url: {
          url: `data:${image.type};base64,${base64}`,
        },
      }
    })
  )

  const url = `https://api.openai.com/v1/chat/completions`
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza estas imágenes de planos arquitectónicos y extrae la información de unidades, colindancias y superficies según las instrucciones del sistema. Devuelve SOLO JSON válido sin markdown ni explicaciones.",
            },
            ...imageParts,
          ],
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      // GPT-5.1 and newer models require max_completion_tokens instead of max_tokens
      // We use max_completion_tokens for newer models (gpt-5.x, o1) and max_tokens for older ones
      ...(model.includes("gpt-5") || model.includes("o1") 
        ? { max_completion_tokens: 4000 }
        : { max_tokens: 4000 }
      ),
    }),
  })

  if (!resp.ok) {
    const errorText = await resp.text()
    throw new Error(`OpenAI API error: ${resp.status} - ${errorText}`)
  }

  const data = await resp.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("empty_response")
  
  // Try to parse JSON, handle markdown code blocks if present
  let jsonText = text.trim()
  if (jsonText.startsWith("```")) {
    const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/)
    if (match) jsonText = match[1]
  }
  
  return JSON.parse(jsonText)
}

function simpleFallback(source: string): StructuredUnit {
  const name = source?.replace(/\.(png|jpg|jpeg|pdf)$/i, "").slice(0, 60) || "UNIDAD"
  return {
    unit: { name },
    boundaries: [],
    surfaces: [],
    anomalies: [],
  }
}

function extractSurfacesFromText(ocrText: string): { name: string; value_m2: number }[] {
  if (!ocrText) return []
  const text = ocrText.replace(/\r/g, "")
  const lines = text.split(/\n+/)
  const out: { name: string; value_m2: number }[] = []

  // Helper to parse a number with comma or dot decimals
  const parseNum = (s: string): number => {
    const trimmed = s.trim()
    // If both separators appear, assume the last occurrence is the decimal separator
    const lastComma = trimmed.lastIndexOf(",")
    const lastDot = trimmed.lastIndexOf(".")
    let normalized = trimmed
    if (lastComma > lastDot) {
      normalized = trimmed.replace(/\./g, "").replace(",", ".")
    } else if (lastDot > lastComma) {
      normalized = trimmed.replace(/,/g, "")
    } else {
      normalized = trimmed.replace(",", ".")
    }
    const n = Number.parseFloat(normalized)
    return isNaN(n) ? NaN : n
  }

  const pushSurface = (nameRaw: string, valueRaw: string) => {
    const value = parseNum(valueRaw)
    if (!isNaN(value)) {
      // Normalize name to Title Case without leading "SUPERFICIE"/"SUP."
      let name = nameRaw.trim()
      name = name.replace(/^SUPERFICIE(S)?\s*/i, "")
      name = name.replace(/^SUP\.\s*/i, "")
      name = name.replace(/[:=\-]+$/g, "").trim()
      // If empty, use generic "TOTAL"
      if (!name) name = "TOTAL"
      // Title case
      name = name
        .toLowerCase()
        .replace(/(^|[\s_-])([a-záéíóúñ])/g, (_m, sep, c) => `${sep}${c.toUpperCase()}`)
      out.push({ name, value_m2: value })
    }
  }

  // Pattern 1: SUPERFICIE <LABEL>: <VALUE> m2|m²
  const reSurface = /(SUPERFICIE(?:S)?(?:\s+DE)?\s+[A-ZÁÉÍÓÚÑ0-9\s._-]{0,40})[:=]\s*([0-9][0-9.,]*)\s*m(?:2|²)\b/i
  // Pattern 2: SUP. <LABEL>[:=]? <VALUE> m2|m²
  const reSup = /(SUP\.\s+[A-ZÁÉÍÓÚÑ0-9\s._-]{1,40})[:=]?\s*([0-9][0-9.,]*)\s*m(?:2|²)\b/i
  // Pattern 3: Standalone SUPERFICIE LOTE <VALUE>
  const reLot = /(SUPERFICIE\s+LOTE)\s*[:=]?\s*([0-9][0-9.,]*)\s*m(?:2|²)\b/i

  for (const raw of lines) {
    const l = raw.trim()
    let m = l.match(reSurface)
    if (m) {
      pushSurface(m[1], m[2])
      continue
    }
    m = l.match(reSup)
    if (m) {
      pushSurface(m[1], m[2])
      continue
    }
    m = l.match(reLot)
    if (m) {
      pushSurface("LOTE", m[2])
      continue
    }
  }
  return out
}

export async function POST(req: Request) {
  try {
    // Accept FormData with images
    const formData = await req.formData()
    const images = formData.getAll("images") as File[]
    
    if (!images || images.length === 0) {
      return NextResponse.json({ error: "bad_request", message: "images required" }, { status: 400 })
    }

    // Cache is disabled - always process images with AI
    // This ensures fresh results every time, avoiding stale cache issues
    console.log(`[api/ai/structure] Processing ${images.length} image(s) with AI (cache disabled)...`)
    
    let processedUnits: StructuredUnit[] | null = null
    let processedMetadata: { lotLocation?: string; totalLotSurface?: number } | undefined = undefined
    
    // Always process (cache disabled)
    try {
      const prompt = buildPrompt()
        // Call OpenAI Vision with all images
        const aiResponse = await callOpenAIVision(prompt, images)
        
        // Extract lot-level metadata if present
        let lotLocation: string | undefined = undefined
        let totalLotSurface: number | undefined = undefined
        
        if (typeof aiResponse.lotLocation === "string" && aiResponse.lotLocation.trim()) {
          lotLocation = aiResponse.lotLocation.trim()
        }
        if (typeof aiResponse.totalLotSurface === "number" && aiResponse.totalLotSurface > 0) {
          totalLotSurface = aiResponse.totalLotSurface
        }
        
        // OpenAI might return a single unit or multiple units
        // Handle both cases
        let units: StructuredUnit[] = []
        
        if (Array.isArray(aiResponse.results)) {
          units = aiResponse.results
        } else if (aiResponse.result) {
          units = [aiResponse.result]
        } else if (aiResponse.unit) {
          // Single unit object - wrap in array
          units = [aiResponse as StructuredUnit]
        } else {
          throw new Error("invalid_ai_shape")
        }

        // Validate structure
        for (const unit of units) {
          if (!unit || typeof unit !== "object" || !unit.unit || !Array.isArray(unit.boundaries) || !Array.isArray(unit.surfaces)) {
            throw new Error("invalid_ai_shape")
          }
        }

        // Merge units with the same name
        const merged = mergeUnitsByName(units)
        
        // Filter out units without boundaries
        const validUnits = merged.filter((u) => u.boundaries && u.boundaries.length > 0)
        
        // If no valid units, create a fallback
        if (validUnits.length > 0) {
          processedUnits = validUnits
          console.log(`[api/ai/structure] Processed ${validUnits.length} valid units from AI response`)
        } else {
          console.warn(`[api/ai/structure] No valid units found in AI response, using fallback`)
          processedUnits = [simpleFallback(images[0]?.name || "UNIDAD")]
        }
        
        // Store metadata
        if (lotLocation || totalLotSurface) {
          processedMetadata = { lotLocation, totalLotSurface }
          console.log(`[api/ai/structure] Extracted metadata: location=${lotLocation}, surface=${totalLotSurface}`)
        }
    } catch (e: any) {
      console.error("[api/ai/structure] OpenAI Vision error:", e)
      // Fallback: create a simple unit from the first image name
      processedUnits = [simpleFallback(images[0]?.name || "UNIDAD")]
      console.log(`[api/ai/structure] Using fallback unit`)
    }

    // Ensure all units have valid structure
    if (!processedUnits) {
      processedUnits = [simpleFallback(images[0]?.name || "UNIDAD")]
    }
    
    const results = processedUnits.map((result) => {
      const unit = JSON.parse(JSON.stringify(result)) as StructuredUnit
      
      if (!unit.unit?.name) {
        unit.unit = { ...(unit.unit || {}), name: "UNIDAD" }
      }
      if (!Array.isArray(unit.boundaries)) {
        unit.boundaries = []
      }
      if (!Array.isArray(unit.surfaces)) {
        unit.surfaces = []
      }
      
      return unit
    })

    const resp: StructuringResponse = {
      results,
      ...(processedMetadata?.lotLocation ? { lotLocation: processedMetadata.lotLocation } : {}),
      ...(processedMetadata?.totalLotSurface ? { totalLotSurface: processedMetadata.totalLotSurface } : {}),
    }
    
    console.log(`[api/ai/structure] Returning ${results.length} units (fresh processing, cache disabled)`)
    return NextResponse.json(resp)
  } catch (e: any) {
    console.error("[api/ai/structure] Error:", e)
    return NextResponse.json({ error: "structure_failed", message: String(e?.message || e) }, { status: 400 })
  }
}
