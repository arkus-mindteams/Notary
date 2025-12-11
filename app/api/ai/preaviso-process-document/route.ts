import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const documentType = formData.get("documentType") as string | null

    if (!file) {
      return NextResponse.json(
        { error: "bad_request", message: "file is required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || "gpt-4o"

    if (!apiKey) {
      return NextResponse.json(
        { error: "configuration_error", message: "OPENAI_API_KEY missing" },
        { status: 500 }
      )
    }

    // Verificar que sea una imagen (los PDFs ya deben estar convertidos en el cliente)
    const isImage = file.type.startsWith("image/")
    if (!isImage) {
      return NextResponse.json(
        { error: "unsupported_format", message: "Solo se aceptan imágenes. Los PDFs deben convertirse a imágenes en el cliente." },
        { status: 400 }
      )
    }

    // Convertir archivo a base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    const mimeType = file.type || "image/jpeg"

    // Construir prompt según el tipo de documento
    let systemPrompt = ""
    let userPrompt = ""

    switch (documentType) {
      case "escritura":
        systemPrompt = `Eres un experto en análisis de documentos notariales. Analiza la Escritura o título de propiedad y extrae la siguiente información en formato JSON:
{
  "folioReal": "número del folio real",
  "seccion": "sección registral",
  "partida": "partida registral",
  "ubicacion": "dirección completa del inmueble",
  "propietario": {
    "nombre": "nombre completo del propietario",
    "rfc": "RFC si está disponible",
    "curp": "CURP si está disponible"
  },
  "superficie": "superficie del inmueble si está disponible",
  "valor": "valor del inmueble si está disponible"
}

Extrae SOLO la información que puedas leer claramente. Si algún campo no está disponible, usa null.`
        userPrompt = "Analiza este documento de Escritura o título de propiedad y extrae la información solicitada."
        break

      case "plano":
        systemPrompt = `Eres un experto en análisis de planos catastrales. Analiza el plano y extrae la siguiente información en formato JSON:
{
  "superficie": "superficie en metros cuadrados",
  "lote": "número de lote si está disponible",
  "manzana": "número de manzana si está disponible",
  "fraccionamiento": "nombre del fraccionamiento si está disponible",
  "medidas": "medidas del terreno si están disponibles"
}

Extrae SOLO la información que puedas leer claramente.`
        userPrompt = "Analiza este plano catastral y extrae la información solicitada."
        break

      case "identificacion":
        systemPrompt = `Eres un experto en análisis de documentos de identificación oficial mexicana. Analiza el documento (puede ser INE/IFE, Pasaporte, Licencia de conducir, CURP, o cualquier otro documento oficial) y extrae TODA la información disponible en formato JSON:
{
  "nombre": "nombre completo como aparece en el documento",
  "rfc": "RFC si está visible en el documento",
  "curp": "CURP si está visible en el documento",
  "direccion": "dirección completa si está visible",
  "fechaNacimiento": "fecha de nacimiento si está visible",
  "tipoDocumento": "INE/IFE, Pasaporte, Licencia, CURP, etc.",
  "numeroDocumento": "número de credencial/pasaporte/etc si está visible",
  "tipo": "vendedor o comprador según el contexto del flujo (si no está claro, puedes inferirlo o dejar null)"
}

IMPORTANTE:
- Extrae TODA la información que puedas leer claramente del documento
- Si es una INE/IFE, busca nombre completo en el frente, CURP y dirección en el reverso
- Si es un pasaporte, extrae nombre, fecha de nacimiento, número de pasaporte
- Si es una CURP, extrae nombre, CURP, fecha de nacimiento
- Si es una licencia, extrae nombre, dirección, número de licencia
- Lee cuidadosamente todos los campos visibles en el documento`
        userPrompt = "Analiza este documento de identificación oficial y extrae TODA la información disponible que puedas leer. Sé exhaustivo y preciso."
        break

      default:
        systemPrompt = `Eres un experto en análisis de documentos notariales. Analiza el documento y extrae toda la información relevante que puedas identificar relacionada con:
- Folio real, sección, partida
- Datos de personas (nombres, RFC, CURP)
- Información del inmueble (dirección, superficie, valor)
- Información crediticia si está presente

Devuelve la información en formato JSON estructurado.`
        userPrompt = "Analiza este documento y extrae toda la información relevante."
    }

    // Llamar a OpenAI Vision API
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
            content: systemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
        ...(model.includes("gpt-5") || model.includes("o1") 
          ? { max_completion_tokens: 2000 }
          : { max_tokens: 2000 }
        ),
      }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      console.error(`[preaviso-process-document] OpenAI API error: ${resp.status} - ${errorText}`)
      return NextResponse.json(
        { error: "api_error", message: `Error procesando documento: ${resp.status}` },
        { status: 500 }
      )
    }

    const data = await resp.json()
    const extractedText = data?.choices?.[0]?.message?.content || ""

    if (!extractedText) {
      return NextResponse.json(
        { error: "empty_response", message: "No se pudo extraer información del documento" },
        { status: 500 }
      )
    }

    // Parsear JSON
    let extractedData
    try {
      let jsonText = extractedText.trim()
      if (jsonText.startsWith("```")) {
        const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/)
        if (match) jsonText = match[1]
      }
      extractedData = JSON.parse(jsonText)
    } catch (e) {
      console.error("[preaviso-process-document] Error parsing JSON:", e)
      return NextResponse.json(
        { error: "parse_error", message: "Error al procesar la respuesta de la IA" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      extractedData,
      fileName: file.name,
      fileType: documentType,
    })

  } catch (error: any) {
    console.error("[preaviso-process-document] Error:", error)
    return NextResponse.json(
      { error: "internal_error", message: error.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

