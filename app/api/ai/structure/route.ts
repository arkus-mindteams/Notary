import { NextResponse } from "next/server"
import type { StructuringRequest, StructuringResponse, StructuredUnit } from "@/lib/ai-structuring-types"

const cache = new Map<string, StructuringResponse>()

function hashPayload(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `${h}-${s.length}`
}

function buildPrompt(): string {
  return [
    "Eres un asistente experto en documentos notariales (deslindes).",
    "Devuelve EXCLUSIVAMENTE JSON con este esquema:",
    "{",
    '  "unit": { "name": string, "model"?: string },',
    '  "boundaries": [ { "direction": "WEST" | "NORTHWEST" | "NORTH" | "NORTHEAST" | "EAST" | "SOUTHEAST" | "SOUTH" | "SOUTHWEST", "length_m": number, "abutter": string, "order_index": number } ],',
    '  "surfaces": [ { "name": string, "value_m2": number } ],',
    '  "anomalies"?: string[]',
    "}",
    "Reglas:",
    "- Mantén el orden de aparición (order_index desde 0).",
    "- Normaliza a metros y m2, usa punto decimal (ej. 6.750).",
    "- No inventes datos; si faltan, deja listas vacías.",
    "- Responde SOLO JSON válido.",
    "",
    "Acotación del texto fuente:",
    '- El bloque de colindancias aparece bajo “MEDIDAS Y COLINDANCIAS” (variantes: "Medidas y Colindancias", "MEDIDAS Y COLINDANCIAS.").',
    "- Extrae colindancias solo desde ese encabezado hacia abajo y DETENTE al iniciar otra sección (ej: “SUPERFICIE(S)”, “DESCRIPCIÓN”, “CARACTERÍSTICAS”, “OBSERVACIONES”, “DATOS”).",
    "",
    "Heurísticas de colindancias:",
    '- Cada colindancia inicia con cardinales en español: “NORTE”, “SUR”, “ESTE”, “OESTE” o intercardinales “NOROESTE”, “NORESTE”, “SUROESTE”, “SURESTE”, con o sin “AL ” (ej. “AL NORTE”).',
    '- También puede haber colindancias verticales “ARRIBA/ABAJO” y equivalentes “COLINDANCIA SUPERIOR/INFERIOR” o “SUPERIOR/INFERIOR”: mapéalas como direcciones "UP" y "DOWN" respectivamente.',
    "- Puede haber N colindancias por dirección (incluso repetidas). Conserva todas y su orden.",
    '- Cada colindancia suele tener una longitud y un colindante (ej. “colinda con …” / “con …”). Si falta alguno, conserva lo disponible.',
    "- No mezcles superficies con boundaries; ignora totales de área (m2, m²) al construir boundaries.",
    "",
    "Superficies:",
    "- Extrae superficies si existe una sección separada (encabezado “SUPERFICIE(S)”), como pares nombre/valor_m2 (ej. “PLANTA BAJA”: 59.280).",
    "",
    "Nombre de unidad (unit.name):",
    '- Prioriza patrones como “UNIDAD <n/ código>” (ej. “UNIDAD 64”), “CUBO DE ILUMINACIÓN/ILUMINACION”, “JUNTA CONSTRUCTIVA <n>”, “CAJON DE ESTACIONAMIENTO/ESTACIONAMIENTO”.',
    '- NO uses encabezados o secciones como nombre de unidad: “MEDIDAS Y COLINDANCIAS”, “SUPERFICIE(S)”, “CONDOMINIO”, “FRACCIONAMIENTO”, nombres de empresa (“PROMOTORA”, “DESARROLLADORA”), sellos o marcas.',
  ].join("\n")
}

function preFilterOCRText(ocrText: string): string {
  if (!ocrText) return ""
  const text = ocrText.replace(/\r/g, "")
  const lower = text.toLowerCase()
  const startIdx =
    lower.indexOf("medidas y colindancias") >= 0
      ? lower.indexOf("medidas y colindancias")
      : lower.indexOf("medidas") >= 0 && lower.indexOf("colindancias") >= 0
      ? Math.min(lower.indexOf("medidas"), lower.indexOf("colindancias"))
      : -1
  let sliced = startIdx >= 0 ? text.slice(startIdx) : text
  // Cortar al siguiente encabezado fuerte conocido
  const endMatch = sliced.match(
    /(^|\n)\s*(superficie|superficies|descripci[oó]n|caracter[ií]sticas|observaciones|datos)\b/gi,
  )
  if (endMatch && endMatch.index !== undefined && endMatch.index > 0) {
    sliced = sliced.slice(0, endMatch.index)
  }
  // Limitar longitud para evitar ruido excesivo
  if (sliced.length > 8000) sliced = sliced.slice(0, 8000)
  return sliced.trim()
}

function pickUnitNameFromText(ocrText: string, fallback: string = "UNIDAD"): string {
  const upper = ocrText.toUpperCase()
  const patterns = [
    /UNIDAD\s+[A-Z0-9\-]+/g,
    /U[\-\s]?(\d+)/g, // e.g. U-64 => UNIDAD 64
    /CUBO DE ILUMINACI[ÓO]N/g,
    /JUNTA CONSTRUCTIVA\s+\d+/g,
    /CAJ[ÓO]N DE ESTACIONAMIENTO|ESTACIONAMIENTO/g,
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
    const lenMatch = l.match(/(\d+(?:[.,]\d+)?)(?=\s*(MTS?|ML|M\.?)(\b|[^A-Z]))/)
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
    const lm = upper[i].match(/^(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\s*:?\s*$/)
    if (!lm) continue
    const dirEs = (lm[2] || "").toUpperCase()
    const direction = dirMap[dirEs]
    if (!direction) continue
    // Buscar en las próximas líneas un patrón de longitud y colindante.
    let length_m = 0
    let abutter = ""
    for (let j = i + 1; j < Math.min(i + 6, upper.length); j++) {
      const uj = upper[j]
      // Formatos válidos:
      // 1) "EN <n> M" (con o sin punto) opcional "CON ...".
      // 2) "<n> M" (con o sin punto) opcional "CON ...".
      // 3) línea posterior que inicie con "CON " o "COLINDA CON ".
      const lenEn = uj.match(/\bEN\s+(\d+(?:[.,]\d+)?)\s*M(?:\.|\b)/)
      const lenBare = uj.match(/^\s*(\d+(?:[.,]\d+)?)\s*M(?:\.|\b)/)
      const lenMatch = lenEn || lenBare
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
    out.push({
      direction,
      length_m: isFinite(length_m) ? length_m : 0,
      abutter,
      order_index: order++,
    })
  }
  return out
}

async function callGeminiJSON(prompt: string, ocrText: string) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || "gemini-1.5-pro"
  if (!apiKey) throw new Error("GEMINI_API_KEY missing")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: prompt }] },
      contents: [{ role: "user", parts: [{ text: ocrText }]}],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  })
  if (!resp.ok) throw new Error(await resp.text())
  const data = await resp.json()
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.parts?.[0]?.rawText ||
    data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!text) throw new Error("empty_response")
  return JSON.parse(text)
}

function simpleFallback(ocrText: string): StructuredUnit {
  const firstLine = (ocrText || "").split("\n").find((l) => l.trim().length > 0) || "UNIDAD"
  return {
    unit: { name: firstLine.slice(0, 60) },
    boundaries: [],
    surfaces: [],
    anomalies: [],
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StructuringRequest
    if (!body?.ocrText || typeof body.ocrText !== "string") {
      return NextResponse.json({ error: "bad_request", message: "ocrText required" }, { status: 400 })
    }
    // Pre-filtrar al bloque de "Medidas y Colindancias"
    const filtered = preFilterOCRText(body.ocrText)
    const payload = JSON.stringify({ ocrText: filtered || body.ocrText, hints: body.hints || {} })
    const key = hashPayload(payload)
    if (cache.has(key)) return NextResponse.json(cache.get(key)!)
    let result: StructuredUnit
    try {
      const prompt = buildPrompt()
      const ai = await callGeminiJSON(prompt, filtered || body.ocrText)
      if (!ai || typeof ai !== "object" || !ai.unit || !Array.isArray(ai.boundaries) || !Array.isArray(ai.surfaces)) {
        throw new Error("invalid_ai_shape")
      }
      result = ai as StructuredUnit
    } catch {
      result = simpleFallback(filtered || body.ocrText)
    }
    // Reconstrucción: si faltan longitudes/abutters, hacer parse más estricto del texto
    const parsed = parseBoundariesFromText(filtered || body.ocrText)
    const needRepair =
      !result.boundaries ||
      result.boundaries.length === 0 ||
      result.boundaries.some((b) => !b || b.length_m === 0 || !b.abutter)
    if (needRepair && parsed.length > 0) {
      result.boundaries = parsed
    } else if (result.boundaries && result.boundaries.length > 0 && parsed.length > 0) {
      // Rellenar campos vacíos con parsed por orden
      const repaired = result.boundaries.map((b, idx) => {
        const p = parsed[idx]
        if (!p) return b
        return {
          direction: b.direction || p.direction,
          length_m: b.length_m || p.length_m,
          abutter: b.abutter || p.abutter,
          order_index: typeof b.order_index === "number" ? b.order_index : p.order_index,
        }
      })
      result.boundaries = repaired
    } else if (!result.boundaries || result.boundaries.length === 0) {
      // Último fallback
      const hb = heuristicBoundaries(filtered || body.ocrText)
      if (hb.length > 0) result.boundaries = hb
    }
    // Si el nombre de unidad parece genérico/encabezado, intentar detectarlo del texto
    const badName = (result.unit?.name || "").toUpperCase().trim()
    const isHeading =
      badName === "MEDIDAS Y COLINDANCIAS" ||
      badName === "MEDIDAS" ||
      badName === "COLINDANCIAS" ||
      badName.startsWith("SUPERFICIE") ||
      badName === "CONDOMINIO" ||
      badName === "FRACCIONAMIENTO" ||
      /PROMOTORA|DESARROLLADORA|S\.?A\.?/i.test(badName)
    if (!result.unit?.name || isHeading) {
      result.unit = { name: pickUnitNameFromText(body.ocrText, result.unit?.name || "UNIDAD") }
    }
    const resp: StructuringResponse = { result }
    cache.set(key, resp)
    return NextResponse.json(resp)
  } catch (e: any) {
    return NextResponse.json({ error: "structure_failed", message: String(e?.message || e) }, { status: 400 })
  }
}


