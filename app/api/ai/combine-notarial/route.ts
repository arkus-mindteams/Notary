import { NextResponse } from "next/server"

export const runtime = "nodejs"

interface UnitData {
  unitName: string
  notarialText: string
  colindanciasText: string
}

function buildCombinePrompt(units: UnitData[]): string {
  return [
    "Eres un experto en redacción de documentos notariales mexicanos. Tu tarea es combinar múltiples textos notariales de diferentes unidades de una propiedad en un solo documento notarial completo y coherente.",
    "",
    "INSTRUCCIONES:",
    "1. Combina todos los textos notariales proporcionados en un documento único y fluido.",
    "2. Mantén el formato y estilo notarial mexicano estándar.",
    "3. Organiza las unidades de manera lógica (por ejemplo, unidad principal primero, luego áreas comunes, etc.).",
    "4. Usa conectores apropiados entre unidades para crear un texto continuo y profesional.",
    "5. Asegúrate de que el documento final sea coherente y siga las convenciones notariales mexicanas.",
    "6. No agregues información que no esté en los textos proporcionados.",
    "7. Mantén la precisión de las medidas y colindancias tal como aparecen en cada texto.",
    "",
    "TEXTOS NOTARIALES A COMBINAR:",
    ...units.map((unit, index) => [
      `--- UNIDAD ${index + 1}: ${unit.unitName} ---`,
      unit.notarialText || unit.colindanciasText,
      "",
    ].join("\n")),
    "",
    "Devuelve SOLO el texto notarial completo combinado, sin explicaciones adicionales ni markdown.",
    "El texto debe estar listo para usar en un documento notarial oficial.",
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
    const units: UnitData[] = body?.units || []

    if (!Array.isArray(units) || units.length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "units array is required and must not be empty" },
        { status: 400 },
      )
    }

    // Filter out units without text
    const validUnits = units.filter(
      (unit) => unit.unitName && (unit.notarialText || unit.colindanciasText)
    )

    if (validUnits.length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "No valid units with text found" },
        { status: 400 },
      )
    }

    // If only one unit, return its text directly
    if (validUnits.length === 1) {
      return NextResponse.json({
        completeText: validUnits[0].notarialText || validUnits[0].colindanciasText,
      })
    }

    // Use AI to combine multiple units
    const prompt = buildCombinePrompt(validUnits)
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || "gpt-4o"
    
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing")
    }

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
            content: "Eres un experto en redacción de documentos notariales mexicanos. Tu tarea es combinar múltiples textos notariales en un documento único y coherente.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_completion_tokens: model.includes("gpt-5") || model.includes("o1") ? 4000 : undefined,
        max_tokens: model.includes("gpt-5") || model.includes("o1") ? undefined : 4000,
      }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      throw new Error(`OpenAI API error: ${resp.status} - ${errorText}`)
    }

    const data = await resp.json()
    const aiText = data?.choices?.[0]?.message?.content || ""

    // Extract text from AI response
    let completeText = aiText.trim()
    
    // Fallback if AI response is empty
    if (!completeText) {
      completeText = validUnits
        .map((unit) => {
          const text = unit.notarialText || unit.colindanciasText
          return text ? `${unit.unitName}: ${text}` : ""
        })
        .filter(Boolean)
        .join("\n\n")
    }

    return NextResponse.json({ completeText })
  } catch (err: any) {
    console.error("[combine-notarial] error:", err)
    return NextResponse.json(
      { error: "server_error", message: err?.message || "Internal error" },
      { status: 500 },
    )
  }
}

