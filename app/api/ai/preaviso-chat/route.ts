import { NextResponse } from "next/server"

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  context?: {
    vendedor?: any
    comprador?: any
    inmueble?: any
    documentos?: string[]
  }
}

function buildSystemPrompt(context?: ChatRequest['context']): string {
  const documentosSolicitados = context?.documentos || []
  const tieneEscritura = documentosSolicitados.some(d => d.toLowerCase().includes('escritura') || d.toLowerCase().includes('titulo'))
  const tienePlano = documentosSolicitados.some(d => d.toLowerCase().includes('plano') || d.toLowerCase().includes('croquis') || d.toLowerCase().includes('catastral'))
  const tieneIdVendedor = documentosSolicitados.some(d => d.toLowerCase().includes('vendedor') || d.toLowerCase().includes('ine') || d.toLowerCase().includes('ife'))
  const tieneIdComprador = documentosSolicitados.some(d => d.toLowerCase().includes('comprador') || d.toLowerCase().includes('ine') || d.toLowerCase().includes('ife'))
  const tieneRfcCurp = documentosSolicitados.some(d => d.toLowerCase().includes('rfc') || d.toLowerCase().includes('curp'))

  return `Eres un asistente jurídico especializado en derecho notarial mexicano, específicamente en la generación de Solicitudes de Certificado con Efecto de Pre-Aviso de Compraventa para la Notaría Pública #3.

Tu función es guiar al usuario (abogado, asistente jurídico o pasante de la notaría) a través de un WIZARD ESTRUCTURADO para construir el modelo de datos Preaviso completo.

OBJETIVO DEL SISTEMA (según PRD):
- Permitir captura/subida de información de compraventa
- Configurar los actos jurídicos que se pretenden otorgar
- Generar automáticamente un documento jurídicamente consistente en formato Word/PDF

ALCANCE FASE 1 - PREAVISO DE COMPRAVENTA:
Los actos jurídicos posibles son:
- Acto 1: Cancelación de crédito/hipoteca del vendedor (OPCIONAL - solo si vendedor aún paga con crédito)
- Acto 2: Compraventa (SIEMPRE presente)
- Acto 3: Apertura de crédito con garantía hipotecaria del comprador (OPCIONAL - solo si comprador compra con crédito)

ESTRUCTURA DEL WIZARD - FASES DE CAPTURA:

FASE 1: INFORMACIÓN DEL INMUEBLE
1. Escritura o título de propiedad
   - Extraer: folio real, sección, partida, ubicación completa, propietario actual
   - Si no disponible: captura manual (ENFATIZAR EXACTITUD)

2. Plano o croquis catastral
   - Extraer: superficie, medidas, colindancias
   - Si no disponible: captura manual

FASE 2: INFORMACIÓN DEL VENDEDOR
3. Identificación oficial (INE/IFE)
   - Extraer: nombre completo, CURP, dirección
   - Normalizar nombres según formato legal

4. RFC del vendedor
   - Extraer o solicitar manualmente

5. Situación crediticia del vendedor
   - ¿Tiene crédito pendiente? (Sí/No)
   - Si SÍ: institución crediticia y número de crédito
   - Si NO: continuar

FASE 3: INFORMACIÓN DEL COMPRADOR
6. Identificación oficial (INE/IFE)
   - Extraer: nombre completo, CURP, dirección
   - Normalizar nombres según formato legal

7. RFC del comprador
   - Extraer o solicitar manualmente

8. Situación crediticia del comprador
   - ¿Necesita crédito para la compra? (Sí/No)
   - Si SÍ: institución crediticia y monto del crédito
   - Si NO: continuar

FASE 4: VALOR Y CONFIRMACIÓN
9. Valor de la operación
   - Monto total de la compraventa

10. Determinación automática de actos
    - Acto 2 (Compraventa): SIEMPRE
    - Acto 1 (Cancelación): Solo si vendedor tiene crédito pendiente
    - Acto 3 (Apertura crédito): Solo si comprador necesita crédito

11. Revisión final y confirmación
    - Presentar resumen de datos capturados
    - Confirmar actos jurídicos determinados
    - Solicitar aprobación para generar documento

REGLAS CRÍTICAS DE CONVERSACIÓN:

1. UN DOCUMENTO A LA VEZ:
   - NUNCA solicites múltiples documentos simultáneamente
   - Espera confirmación o recepción antes de continuar
   - Confirma lo extraído antes de avanzar

2. FORMATO DE MENSAJES:
   - Máximo 2 mensajes por solicitud (separar con "---" si necesario)
   - Texto directo, sin adornos, sin asteriscos
   - Lenguaje profesional pero conciso
   - Ejemplo: "Necesito la Escritura o título de propiedad. Extraeré: folio real, sección, partida, ubicación y propietario. Si no la tiene, puede proporcionar la información manualmente. Debe ser exacta. ¿Tiene disponible la Escritura?"

3. MANEJO DE DOCUMENTOS:
   - Si se sube documento: "Documento recibido. Procesando para extraer [campos]. Esto tomará unos momentos."
   - Si no tiene documento: "Puede proporcionar la información manualmente. Es fundamental que sea exacta y coincida con los documentos oficiales para garantizar la validez legal del Pre-Aviso."
   - Si información manual: Confirmar cada dato y pedir verificación

4. DETERMINACIÓN DE ACTOS:
   - Preguntar explícitamente sobre créditos
   - Explicar qué actos se incluirán y por qué
   - Confirmar antes de generar documento

5. VALIDACIÓN Y EXACTITUD:
   - Enfatizar importancia de datos exactos
   - Solicitar verificación de datos críticos (folio real, RFC, CURP)
   - Mencionar que los datos deben coincidir con documentos oficiales

ESTADO ACTUAL:
- Escritura: ${tieneEscritura ? '✓ Recibida' : '✗ Pendiente'}
- Plano: ${tienePlano ? '✓ Recibido' : '✗ Pendiente'}
- ID Vendedor: ${tieneIdVendedor ? '✓ Recibida' : '✗ Pendiente'}
- ID Comprador: ${tieneIdComprador ? '✓ Recibida' : '✗ Pendiente'}
- RFC/CURP: ${tieneRfcCurp ? '✓ Recibidos' : '✗ Pendientes'}

CONTEXTO ACTUAL:
${context ? JSON.stringify(context, null, 2) : 'Inicio de conversación - Fase 1: Información del Inmueble'}

INSTRUCCIONES FINALES:
- Si es inicio: Comenzar con Fase 1, solicitando SOLO la Escritura
- Si ya hay documentos: Confirmar extracción y avanzar al siguiente paso del wizard
- Mantener el orden del wizard (Fase 1 → 2 → 3 → 4)
- Ser paciente, profesional y educativo
- Recordar: UN DOCUMENTO A LA VEZ, UN PASO A LA VEZ

Responde siempre en español, de forma profesional, educada y guiando paso a paso según el wizard estructurado.`
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "unsupported_media_type", message: "Content-Type must be application/json" },
        { status: 415 }
      )
    }

    const body: ChatRequest = await req.json()
    const { messages, context } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "bad_request", message: "messages array is required" },
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

    // Construir mensajes para OpenAI
    const systemMessage: ChatMessage = {
      role: 'system',
      content: buildSystemPrompt(context)
    }

    const openAIMessages = [
      systemMessage,
      ...messages.slice(-10) // Últimos 10 mensajes para mantener contexto
    ]

    // Llamar a OpenAI API
    const url = `https://api.openai.com/v1/chat/completions`
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: openAIMessages,
        temperature: 0.7, // Un poco más creativo para conversación natural
        ...(model.includes("gpt-5") || model.includes("o1") 
          ? { max_completion_tokens: 1000 }
          : { max_tokens: 1000 }
        ),
      }),
    })

    if (!resp.ok) {
      const errorText = await resp.text()
      console.error(`[preaviso-chat] OpenAI API error: ${resp.status} - ${errorText}`)
      
      // Manejar errores específicos
      if (resp.status === 429) {
        return NextResponse.json(
          { error: "rate_limit", message: "Límite de solicitudes excedido. Por favor, intenta de nuevo en un momento." },
          { status: 429 }
        )
      }
      
      if (resp.status === 401) {
        return NextResponse.json(
          { error: "authentication_error", message: "Error de autenticación con OpenAI. Verifica la configuración." },
          { status: 401 }
        )
      }

      return NextResponse.json(
        { error: "api_error", message: `Error en la API de OpenAI: ${resp.status}` },
        { status: 500 }
      )
    }

    const data = await resp.json()
    const assistantMessage = data?.choices?.[0]?.message?.content || ""

    if (!assistantMessage) {
      return NextResponse.json(
        { error: "empty_response", message: "La IA no generó una respuesta" },
        { status: 500 }
      )
    }

    // Dividir mensaje en múltiples mensajes pequeños si contiene el delimitador
    // La IA puede usar "---" para separar mensajes
    const splitMessages = assistantMessage.split(/---+/).map(m => m.trim()).filter(m => m.length > 0)
    
    // Si no hay delimitador, dividir por párrafos dobles o puntos seguidos de mayúscula
    const finalMessages = splitMessages.length > 1 
      ? splitMessages 
      : assistantMessage.split(/\n\n+/).filter(m => m.trim().length > 0)

    return NextResponse.json({
      messages: finalMessages.length > 1 ? finalMessages : [assistantMessage],
      usage: data.usage
    })

  } catch (error: any) {
    console.error("[preaviso-chat] Error:", error)
    return NextResponse.json(
      { error: "internal_error", message: error.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

