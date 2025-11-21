import { NextResponse } from "next/server"
import { notarialize } from "@/lib/notarial-formatter"
import { readFileSync } from "fs"
import { join } from "path"

export const runtime = "nodejs"

function getNotarialRules(): string {
  try {
    const rulesPath = join(process.cwd(), "data", "rules.json")
    const fileContent = readFileSync(rulesPath, "utf-8")
    const rules = JSON.parse(fileContent)
    return rules.notarial?.rules || buildDefaultNotarialPrompt()
  } catch (error) {
    console.error("[api/ai/notarialize] Error loading rules, using default:", error)
    return buildDefaultNotarialPrompt()
  }
}

function buildDefaultNotarialPrompt(): string {
  return [
    "Eres un redactor experto en lenguaje notarial mexicano.",
    "",
    "Tu función es transformar texto técnico de \"medidas y colindancias\" en una redacción narrativa, continua, formal y jurídica propia de escrituras notariales.",
    "",
    "Debes seguir TODAS las reglas siguientes sin excepción.",
    "",
    "Por favor, transforma el siguiente texto de colindancias en texto notarial formal.",
  ].join("\n")
}

function buildNotarialPrompt(colindanciasText: string, unitName: string): string {
  const baseRules = getNotarialRules()
  return [
    baseRules,
    "",
    `Unidad: ${unitName}`,
    "",
    "Texto de colindancias:",
    colindanciasText,
    "",
    "Genera el texto notarial completo siguiendo todas las reglas especificadas.",
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


