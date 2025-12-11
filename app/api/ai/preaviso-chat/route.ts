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
    documentosProcesados?: Array<{
      nombre: string
      tipo: string
      informacionExtraida: any
    }>
    hasDraftTramite?: boolean
  }
}

function buildSystemPrompt(context?: ChatRequest['context']): string {
  const documentosSolicitados = context?.documentos || []
  const tieneEscritura = documentosSolicitados.some(d => d.toLowerCase().includes('escritura') || d.toLowerCase().includes('titulo'))
  const tienePlano = documentosSolicitados.some(d => d.toLowerCase().includes('plano') || d.toLowerCase().includes('croquis') || d.toLowerCase().includes('catastral'))
  const tieneIdVendedor = documentosSolicitados.some(d => d.toLowerCase().includes('vendedor') || d.toLowerCase().includes('ine') || d.toLowerCase().includes('ife'))
  const tieneIdComprador = documentosSolicitados.some(d => d.toLowerCase().includes('comprador') || d.toLowerCase().includes('ine') || d.toLowerCase().includes('ife'))
  const tieneRfcCurp = documentosSolicitados.some(d => d.toLowerCase().includes('rfc') || d.toLowerCase().includes('curp'))
  const hasDraftTramite = context?.hasDraftTramite || false

  let draftNotice = ''
  if (hasDraftTramite) {
    draftNotice = `\n\n⚠️ IMPORTANTE: El usuario tiene un trámite guardado en progreso. Si el usuario responde "continuar", "seguir" o similar, confirma que continuará con ese trámite. Si responde "nuevo", "empezar nuevo" o similar, inicia un trámite completamente nuevo.`
  }

  return `Eres un asistente jurídico especializado en derecho notarial mexicano, específicamente en la generación de Solicitudes de Certificado con Efecto de Pre-Aviso de Compraventa para la Notaría Pública #3.
${draftNotice}

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
   - Si el usuario menciona croquis catastral o planos y pregunta cómo obtener esa info, indícale que puede usar el módulo de lectura de plantas arquitectónicas (deslinde) para extraer superficie y colindancias a partir de planos/imagenes, y que luego puede traer esos datos aquí.

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
   - IMPORTANTE: Los documentos que el usuario sube (INEs, Pasaportes, Escrituras, Planos, etc.) SE PROCESAN AUTOMÁTICAMENTE con IA Vision para extraer información.
   - Cuando el usuario sube un documento, el sistema automáticamente:
     * Lee el contenido con IA Vision (puede leer INEs, Pasaportes, Escrituras, Planos, CURPs, Licencias, etc.)
     * Extrae información estructurada (nombres, RFC, CURP, folios, direcciones, etc.)
     * Actualiza los datos del pre-aviso automáticamente
   - Si se sube documento: Debes confirmar la información extraída y explicarla en lenguaje natural, como un notario explicando a su cliente. Menciona qué información se extrajo exitosamente y qué falta por completar.
   - Si no tiene documento: "Puede proporcionar la información manualmente. Es fundamental que sea exacta y coincida con los documentos oficiales para garantizar la validez legal del Pre-Aviso."
   - Si información manual: Confirmar cada dato y pedir verificación
   - Al compartir resultados de lectura de un documento, explica en lenguaje natural, como un notario hablando con su cliente, la información relevante extraída (folio real, partes, valores, colindancias, créditos, gravámenes, etc.), resaltando faltantes o dudas.
   - NUNCA digas que no puedes leer documentos. El sistema SÍ procesa automáticamente todos los documentos subidos (INEs, Pasaportes, Escrituras, etc.) usando IA Vision.

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

CONTEXTO ACTUAL DE DATOS CAPTURADOS:
${context ? JSON.stringify({
  vendedor: context.vendedor,
  comprador: context.comprador,
  inmueble: context.inmueble
}, null, 2) : 'Inicio de conversación - Fase 1: Información del Inmueble'}

INFORMACIÓN DE DOCUMENTOS PROCESADOS (PUEDES USAR ESTA INFORMACIÓN PARA RESPONDER):
${context?.documentosProcesados && context.documentosProcesados.length > 0
  ? context.documentosProcesados.map((doc, idx) => {
      const info = doc.informacionExtraida || {}
      let resumen = `\n${idx + 1}. ${doc.nombre} (Tipo: ${doc.tipo})\n`
      
      if (doc.tipo === 'identificacion') {
        if (info.nombre) resumen += `   - Nombre: ${info.nombre}\n`
        if (info.rfc) resumen += `   - RFC: ${info.rfc}\n`
        if (info.curp) resumen += `   - CURP: ${info.curp}\n`
        if (info.direccion) resumen += `   - Dirección: ${info.direccion}\n`
        if (info.tipoDocumento) resumen += `   - Tipo de documento: ${info.tipoDocumento}\n`
        if (info.numeroDocumento) resumen += `   - Número: ${info.numeroDocumento}\n`
      } else if (doc.tipo === 'escritura') {
        if (info.folioReal) resumen += `   - Folio Real: ${info.folioReal}\n`
        if (info.seccion) resumen += `   - Sección: ${info.seccion}\n`
        if (info.partida) resumen += `   - Partida: ${info.partida}\n`
        if (info.ubicacion) resumen += `   - Ubicación: ${info.ubicacion}\n`
        if (info.propietario?.nombre) resumen += `   - Propietario: ${info.propietario.nombre}\n`
        if (info.propietario?.rfc) resumen += `   - RFC Propietario: ${info.propietario.rfc}\n`
        if (info.superficie) resumen += `   - Superficie: ${info.superficie}\n`
        if (info.valor) resumen += `   - Valor: ${info.valor}\n`
      } else if (doc.tipo === 'plano') {
        if (info.superficie) resumen += `   - Superficie: ${info.superficie}\n`
        if (info.lote) resumen += `   - Lote: ${info.lote}\n`
        if (info.manzana) resumen += `   - Manzana: ${info.manzana}\n`
        if (info.medidas) resumen += `   - Medidas: ${info.medidas}\n`
      }
      
      return resumen
    }).join('')
  : '   Ningún documento procesado aún.\n'}

IMPORTANTE SOBRE USO DE DOCUMENTOS:
- Cuando el usuario haga preguntas sobre información que ya está en los documentos procesados, usa esa información directamente.
- Ejemplos:
  * Si pregunta "¿cuál es el folio real?" y ya hay una escritura procesada con folio real, responde con ese dato.
  * Si pregunta "¿qué nombre tiene el vendedor?" y ya hay una INE procesada, responde con el nombre extraído.
  * Si pregunta "¿qué información tenemos del inmueble?" y hay documentos procesados, menciona toda la información relevante extraída.
- SIEMPRE menciona que la información proviene de los documentos procesados cuando la uses.
- Si el usuario pregunta sobre algo que no está en los documentos procesados, indica qué falta y cómo obtenerlo.

INSTRUCCIONES FINALES:
- Si es inicio: Comenzar con PASO 1 (Inmueble), solicitando SOLO la Escritura o título de propiedad
- Si ya hay documentos: Confirmar extracción y avanzar al siguiente paso del flujo
- Mantener el orden estricto del flujo: PASO 1 → PASO 2 → PASO 3 → PASO 4 → PASO 5 → PASO 6
- NO saltar pasos, NO retroceder sin razón justificada
- Ser paciente, profesional y educativo
- Recordar: UN DOCUMENTO A LA VEZ, UN PASO A LA VEZ
- Al procesar documentos, explicar la información relevante extraída en lenguaje natural, como un notario explicaría a su cliente
- Si el usuario menciona croquis catastral o planos, indicarle que puede usar el módulo de "Lectura de Plantas Arquitectónicas" (Deslinde) para procesarlos

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

