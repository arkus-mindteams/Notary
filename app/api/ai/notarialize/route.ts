import { NextResponse } from "next/server"
import { notarialize } from "@/lib/notarial-formatter"

export const runtime = "nodejs"

function buildNotarialPrompt(colindanciasText: string, unitName: string): string {
  return [
    "Eres un redactor experto en lenguaje notarial mexicano.",
    "",
    "Tu función es transformar texto técnico de \"medidas y colindancias\" en una redacción narrativa, continua, formal y jurídica propia de escrituras notariales.",
    "",
    "Debes seguir TODAS las reglas siguientes sin excepción.",
    "",
    "===========================================================",
    "1. OBJETIVO",
    "===========================================================",
    "",
    "Convertir el texto técnico (deslindes, medidas y colindancias) en:",
    "",
    "• Un párrafo notarial por cada unidad.",
    "• Redacción fluida y continua.",
    "• Sin listas, sin saltos, sin formato técnico.",
    "• Estilo estrictamente jurídico y uniforme.",
    "• Siguiendo el orden EXACTO del texto interpretado (NO reordenar por cardinalidad).",
    "",
    "===========================================================",
    "2. ESTRUCTURA DEL RESULTADO",
    "===========================================================",
    "",
    "Cada unidad debe producir:",
    "",
    "[NOMBRE DE LA UNIDAD]: Al [dirección1], [tramos]; al [dirección2], [tramos]; ... y, al [dirección final], [tramos].",
    "",
    "• Un párrafo por unidad.",
    "• Inicia con el nombre de la unidad transformado a formato notarial (ver reglas).",
    "• Luego redacta las direcciones y tramos en el mismo orden en que aparecen en el texto de entrada.",
    "• Cierra con punto final.",
    "",
    "===========================================================",
    "3. TRANSFORMACIÓN DEL ENCABEZADO",
    "===========================================================",
    "",
    "Reglas:",
    "",
    "1. Convertir:",
    '   "UNIDAD B-2" → "Unidad B guion dos:"',
    '   "JUNTA CONSTRUCTIVA 1" → "Junta Constructiva 1 (uno):"',
    '   "CAJON DE ESTACIONAMIENTO" → "Cajón de Estacionamiento:"',
    "",
    "2. Usar mayúscula inicial y lo demás en minúsculas.",
    "",
    "3. Convertir guiones:",
    "   • \"-\" → \"guion\"",
    "   • Números → texto entre paréntesis cuando corresponda.",
    "",
    "===========================================================",
    "4. DIRECCIONES (EN EL ORDEN ORIGINAL)",
    "===========================================================",
    "",
    "Nunca reordenar NORTE–SUR–ESTE–OESTE.",
    "Respeta exactamente el orden del input.",
    "",
    "Reglas:",
    "",
    '• OESTE → "al oeste"',
    '• ESTE → "al este"',
    '• NORTE → "al norte"',
    '• SUR → "al sur"',
    '• NORESTE → "al noreste"',
    '• NOROESTE → "al noroeste"',
    '• SURESTE → "al sureste"',
    '• SUROESTE → "al suroeste"',
    '• ARRIBA / SUPERIOR → "en su colindancia superior"',
    '• ABAJO / INFERIOR → "en su colindancia inferior"',
    "",
    "===========================================================",
    "5. AGRUPACIÓN DE TRAMOS (REGLAS CRÍTICAS)",
    "===========================================================",
    "",
    "Para cada dirección, si hay:",
    "",
    "1 tramo:",
    '  "en [medida], con [colindante]"',
    "",
    "2 tramos:",
    '  "en dos tramos, el primero de [medida], con [colindante], y el segundo de [medida], con [colindante]"',
    "",
    "3 tramos:",
    '  "en tres tramos, el primero..., el segundo..., y el tercero..."',
    "",
    "N tramos (>3):",
    '  "en N tramos, el primero..., el segundo..., el tercero..., ..., y el N-ésimo..."',
    "",
    "SIEMPRE respetar el orden EXACTO del texto interpretado.",
    "",
    "===========================================================",
    "6. CONVERSIÓN DE MEDIDAS A TEXTO NOTARIAL",
    "===========================================================",
    "",
    "Reglas:",
    "",
    '• 6.750 → "seis metros setecientos cincuenta milímetros"',
    '• 2.550 → "dos metros quinientos cincuenta milímetros"',
    '• 0.300 → "trescientos milímetros"',
    '• 0.025 → "veinticinco milímetros"',
    '• 1.600 → "un metro seiscientos milímetros"',
    '• 9.200 → "nueve metros doscientos milímetros"',
    '• 15.000 → "quince metros"',
    "",
    "Conversión numérica:",
    "",
    "- Parte entera (metros) → texto + \"metros\" (omitir si =1 → \"un metro\").",
    "- Decimales de 3 dígitos = milímetros.",
    "- Si decimales = 000 → solo metros.",
    "",
    "===========================================================",
    "7. COLINDANTES (CONVERSIÓN AVANZADA)",
    "===========================================================",
    "",
    "Siempre en minúsculas después de \"con\".",
    "",
    "Reglas:",
    "",
    "1. Mantener la palabra \"con\".",
    "2. Convertir todas las abreviaturas técnicas:",
    "",
    "Tabla de conversiones:",
    "",
    '• ACS-7 DE E-B → "ACS guion siete de E guion B"',
    '• AC-12 → "AC guion doce"',
    '• AC1.1EB-PB → "AC uno punto uno EB guion PB"',
    '• AC1EB-PB → "AC uno EB guion PB"',
    '• EST_B-4 → "estacionamiento guion B guion cuatro"',
    "",
    '3. Si el colindante contiene "CUBO DE ILUMINACION" → convertir a:',
    '   "con vacío de cubo de iluminación"',
    "",
    "4. Mantener paréntesis y claves entre paréntesis cuando existan:",
    '   "(ACS-7 DE E-B)" → "(ACS guion siete de E guion B)"',
    "",
    "===========================================================",
    "8. ELIMINACIÓN AUTOMÁTICA DE SUPERFICIES",
    "===========================================================",
    "",
    "Eliminar líneas que contengan:",
    "",
    '• "SUPERFICIE"',
    '• "m2", "m²"',
    "• cualquier valor de metros cuadrados.",
    "",
    "Nunca incluir estas superficies en la narrativa.",
    "",
    "===========================================================",
    "9. PUNTUACIÓN FORMAL",
    "===========================================================",
    "",
    "• Comas dentro de cada tramo.",
    "• Punto y coma entre direcciones.",
    "• Antes de la última dirección: \"y,\"",
    "• Párrafo termina con punto final.",
    "• Nunca usar saltos de línea.",
    "",
    "===========================================================",
    "10. CASOS ESPECIALES QUE DEBES MANEJAR",
    "===========================================================",
    "",
    "1. Si la dirección está repetida muchas veces, respetar y agrupar sus tramos.",
    "2. Si la dirección es ARRIBA / ABAJO, usar narrativa vertical.",
    "3. Si aparecen direcciones intercardinales, redactarlas literalmente.",
    "4. Nunca reordenar direcciones según punto cardinal.",
    "5. Nunca inventar información que no aparezca en el texto.",
    "6. Si un colindante incluye números, convertirlos a texto si forman parte del nombre:",
    '   "1.1" → "uno punto uno", "4" → "cuatro".',
    "",
    "===========================================================",
    "11. FORMATO FINAL DEL OUTPUT",
    "===========================================================",
    "",
    "Tu respuesta debe ser:",
    "",
    "• Texto notarial fluido.",
    "• Un párrafo por unidad.",
    "• Sin JSON.",
    "• Sin viñetas.",
    "• Sin formato técnico.",
    "• Estilo jurídico continuo.",
    "",
    "===========================================================",
    "12. REGLA SUPREMA (NO IGNORAR)",
    "===========================================================",
    "",
    "La narrativa debe seguir EXACTAMENTE el orden del texto técnico interpretado.",
    "NO reordenes NORTE, SUR, ESTE, OESTE, ni direcciones verticales.",
    "NO agrupes por cardinalidad.",
    "El orden original es EL ORDEN JURÍDICO.",
    "",
    "===========================================================",
    "",
    "# Ahora procede con la transformación notarial según estas reglas.",
    "",
    `# Input:`,
    "",
    `UNIDAD: ${unitName}`,
    "",
    `TEXTO TÉCNICO:`,
    colindanciasText,
    "",
    "Transforma este texto técnico en texto notarial siguiendo TODAS las reglas anteriores.",
  ].join("\n")
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "unsupported_media_type", message: "Content-Type must be application/json" },
        { status: 415 },
      )
    }
    const body = await req.json()
    const unitName = (body?.unitName || "").toString().trim()
    const colindanciasText = (body?.colindanciasText || "").toString()

    if (!unitName || !colindanciasText) {
      return NextResponse.json(
        { error: "bad_request", message: "unitName and colindanciasText are required" },
        { status: 400 },
      )
    }

    // Try using AI first (new rules)
    const useAI = process.env.USE_AI_NOTARIALIZE !== "false" // Default to true, can disable with env var
    let result: string

    if (useAI) {
      try {
        const apiKey = process.env.OPENAI_API_KEY
        const model = process.env.OPENAI_MODEL || "gpt-4o"
        
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY missing")
        }

        const prompt = buildNotarialPrompt(colindanciasText, unitName)
        
        // Call OpenAI API
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
                content: "Eres un redactor experto en lenguaje notarial mexicano. Transformas texto técnico de medidas y colindancias en redacción narrativa, continua, formal y jurídica.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_completion_tokens: model.includes("gpt-5") || model.includes("o1") ? 2000 : undefined,
            max_tokens: model.includes("gpt-5") || model.includes("o1") ? undefined : 2000,
          }),
        })

        if (!resp.ok) {
          const errorText = await resp.text()
          throw new Error(`OpenAI API error: ${resp.status} - ${errorText}`)
        }

        const data = await resp.json()
        const aiText = data?.choices?.[0]?.message?.content || ""

        // Extract text from AI response (remove markdown code blocks if present)
        let notarialText = aiText.trim()
        if (notarialText.startsWith("```")) {
          const match = notarialText.match(/```(?:notarial|text)?\n([\s\S]*?)\n```/)
          if (match) notarialText = match[1].trim()
        }

        if (!notarialText) {
          throw new Error("Empty AI response")
        }

        result = notarialText
      } catch (aiError: any) {
        console.warn("[notarialize] AI error, falling back to deterministic formatter:", aiError.message)
        // Fallback to deterministic formatter
        result = notarialize(colindanciasText, unitName)
      }
    } else {
      // Use deterministic formatter
      result = notarialize(colindanciasText, unitName)
    }

    return NextResponse.json({ notarialText: result })
  } catch (err: any) {
    console.error("[notarialize] error:", err)
    return NextResponse.json(
      { error: "server_error", message: err?.message || "Internal error" },
      { status: 500 },
    )
  }
}


