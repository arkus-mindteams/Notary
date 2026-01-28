
import { NextResponse } from "next/server"

export const runtime = "nodejs"

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
        const { totalUsage, totalCost, totalTokens, avgSimilarity, dailyStats, userBreakdown } = body

        const apiKey = process.env.OPENAI_API_KEY
        const model = process.env.OPENAI_MODEL || "gpt-4o"

        if (!apiKey) {
            return NextResponse.json({ error: "config_error", message: "OPENAI_API_KEY missing" }, { status: 500 })
        }

        // Summarize daily stats to avoid huge prompt
        const recentActivity = dailyStats?.slice(-7) || [] // Last 7 days
        const activeUsers = userBreakdown?.slice(0, 5) || [] // Top 5 users

        const prompt = `
Actúa como un consultor experto en eficiencia operativa y análisis de datos para una Notaría.
Analiza las siguientes métricas de uso de la herramienta de IA.

# Métricas Globales (Últimos 30 días)
- Total Documentos: ${totalUsage}
- Costo Total: $${(totalCost || 0).toFixed(2)} USD
- Tokens Totales: ${(totalTokens || 0).toLocaleString()}
- Calidad (Similitud): ${(avgSimilarity || 0).toFixed(1)}%

# Usuarios Top
${JSON.stringify(activeUsers)}

# Tu Tarea:
Genera un análisis estructurado en formato JSON.
El análisis debe evaluar: Salud del sistema, Costos, Calidad y Adopción.

Formato de Respuesta (JSON estricto):
{
  "executive_summary": "Resumen corto y directo de 2-3 líneas sobre el estado actual.",
  "system_health": "Excelente" | "Bueno" | "Requiere Atención" | "Crítico",
  "key_insights": [
    {
      "title": "Eficiencia de Costos",
      "status": "positive" | "neutral" | "negative",
      "description": "Análisis breve."
    },
    {
      "title": "Calidad de Resultados",
      "status": "positive" | "neutral" | "negative",
      "description": "Análisis breve."
    },
    {
      "title": "Adopción de Usuarios",
      "status": "positive" | "neutral" | "negative",
      "description": "Análisis breve."
    }
  ],
  "recommendations": [
    {
      "action": "Título de la acción",
      "description": "Detalle de qué hacer y por qué.",
      "priority": "Alta" | "Media" | "Baja"
    }
  ]
}
SOLO devuelve el JSON, sin bloques de código ni texto adicional.
`

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
                        content: "Eres un analista experto. Respondes SIEMPRE en formato JSON válido.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.2,
                response_format: { type: "json_object" } // Force JSON mode
            }),
        })

        if (!resp.ok) {
            const errorText = await resp.text()
            throw new Error(`OpenAI API error: ${resp.status} - ${errorText}`)
        }

        const data = await resp.json()
        const analysis = data?.choices?.[0]?.message?.content || ""

        return NextResponse.json({ analysis })
    } catch (err: any) {
        console.error("[stats-analysis] error:", err)
        return NextResponse.json(
            { error: "server_error", message: err?.message || "Internal error" },
            { status: 500 },
        )
    }
}
