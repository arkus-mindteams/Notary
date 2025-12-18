import { NextResponse } from "next/server"
import { PreavisoConfigService } from "@/lib/services/preaviso-config-service"

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

async function buildSystemPrompt(context?: ChatRequest['context']): Promise<string> {
  // Obtener prompt desde la base de datos
  let basePrompt = ''
  try {
    const config = await PreavisoConfigService.getConfig()
    if (config && config.prompt) {
      basePrompt = config.prompt
    }
  } catch (error) {
    console.error('Error obteniendo configuración de preaviso, usando prompt por defecto:', error)
  }

  // Si no hay prompt en DB, usar prompt por defecto (fallback)
  if (!basePrompt) {
    basePrompt = `Eres un asistente jurídico especializado en derecho notarial mexicano, específicamente en la generación de Solicitudes de Certificado con Efecto de Pre-Aviso de Compraventa para la Notaría Pública #3.`
  }

  const hasDraftTramite = context?.hasDraftTramite || false
  const documentosProcesados = context?.documentosProcesados || []
  
  // Analizar documentos procesados para determinar estado actual
  const tieneEscritura = documentosProcesados.some(d => d.tipo === 'escritura' || d.tipo === 'titulo')
  const tienePlano = documentosProcesados.some(d => d.tipo === 'plano' || d.tipo === 'croquis_catastral')
  const tieneIdVendedor = documentosProcesados.some(d => 
    d.tipo === 'identificacion' && 
    (d.informacionExtraida?.tipo === 'vendedor' || d.nombre.toLowerCase().includes('vendedor'))
  )
  const tieneIdComprador = documentosProcesados.some(d => 
    d.tipo === 'identificacion' && 
    (d.informacionExtraida?.tipo === 'comprador' || d.nombre.toLowerCase().includes('comprador'))
  )
  
  // Determinar estado actual según el flujo conversacional del prompt maestro
  let estadoActual = 'ESTADO 0'
  let estadoDescripcion = 'EXPEDIENTE - Confirmar expediente del comprador'
  
  if (context?.comprador?.nombre) {
    if (!context?.inmueble?.folioReal && !tieneEscritura) {
      estadoActual = 'ESTADO 1'
      estadoDescripcion = 'OPERACIÓN Y FORMA DE PAGO (BLOQUEANTE) - Definir tipo de operación y forma de pago'
    } else if (!context?.inmueble?.folioReal || !tieneEscritura) {
      estadoActual = 'ESTADO 2'
      estadoDescripcion = 'INMUEBLE Y REGISTRO (BLOQUEANTE) - Solicitar TODAS las hojas/antecedentes registrales'
    } else if (!context?.vendedor?.nombre || !tieneIdVendedor) {
      estadoActual = 'ESTADO 3'
      estadoDescripcion = 'VENDEDOR(ES) - Capturar información del vendedor'
    } else if (!context?.comprador?.nombre || !tieneIdComprador) {
      estadoActual = 'ESTADO 4'
      estadoDescripcion = 'COMPRADOR(ES) - Capturar información del comprador'
    } else {
      estadoActual = 'ESTADO 7'
      estadoDescripcion = 'OBJETO DEL ACTO - Confirmar detalles del inmueble'
    }
  }

  let draftNotice = ''
  if (hasDraftTramite) {
    draftNotice = `\n\n⚠️ IMPORTANTE: El usuario tiene un trámite guardado en progreso. Si el usuario responde "continuar", "seguir" o similar, confirma que continuará con ese trámite. Si responde "nuevo", "empezar nuevo" o similar, inicia un trámite completamente nuevo.`
  }

  // Construir resumen de documentos procesados según el formato del prompt maestro
  let resumenDocumentos = ''
  if (documentosProcesados.length > 0) {
    resumenDocumentos = '\n\nDOCUMENTOS PROCESADOS Y INFORMACIÓN EXTRAÍDA:\n'
    documentosProcesados.forEach((doc, idx) => {
      const info = doc.informacionExtraida || {}
      resumenDocumentos += `\n${idx + 1}. ${doc.nombre} (${doc.tipo})\n`
      
      if (doc.tipo === 'identificacion') {
        if (info.nombre) resumenDocumentos += `   Nombre: ${info.nombre}\n`
        if (info.rfc) resumenDocumentos += `   RFC: ${info.rfc}\n`
        if (info.curp) resumenDocumentos += `   CURP: ${info.curp}\n`
        if (info.direccion) resumenDocumentos += `   Dirección: ${info.direccion}\n`
        if (info.fechaNacimiento) resumenDocumentos += `   Fecha de nacimiento: ${info.fechaNacimiento}\n`
        if (info.tipoDocumento) resumenDocumentos += `   Tipo documento: ${info.tipoDocumento}\n`
        if (info.numeroDocumento) resumenDocumentos += `   Número documento: ${info.numeroDocumento}\n`
      } else if (doc.tipo === 'escritura' || doc.tipo === 'titulo') {
        if (info.folioReal) resumenDocumentos += `   Folio Real: ${info.folioReal}\n`
        if (info.seccion) resumenDocumentos += `   Sección: ${info.seccion}\n`
        if (info.partida) resumenDocumentos += `   Partida: ${info.partida}\n`
        if (info.ubicacion || info.direccion) resumenDocumentos += `   Ubicación: ${info.ubicacion || info.direccion}\n`
        if (info.propietario?.nombre) resumenDocumentos += `   Titular registral: ${info.propietario.nombre}\n`
        if (info.propietario?.rfc) resumenDocumentos += `   RFC Titular: ${info.propietario.rfc}\n`
        if (info.gravamenes) resumenDocumentos += `   Gravámenes detectados: ${info.gravamenes}\n`
      } else if (doc.tipo === 'plano' || doc.tipo === 'croquis_catastral') {
        if (info.superficie) resumenDocumentos += `   Superficie: ${info.superficie}\n`
        if (info.lote) resumenDocumentos += `   Lote: ${info.lote}\n`
        if (info.manzana) resumenDocumentos += `   Manzana: ${info.manzana}\n`
        if (info.medidas || info.colindancias) resumenDocumentos += `   Medidas/Colindancias: ${info.medidas || info.colindancias}\n`
      }
    })
  } else {
    resumenDocumentos = '\n\nDOCUMENTOS PROCESADOS: Ningún documento procesado aún.\n'
  }

  // Construir contexto adicional dinámico (información específica de la sesión)
  const contextoDinamico = `
${draftNotice}

================================================================

ESTADO ACTUAL DEL FLUJO CONVERSACIONAL (SOLO PARA REFERENCIA INTERNA, NO MENCIONAR AL USUARIO):
${estadoActual} – ${estadoDescripcion}

IMPORTANTE: Este estado es solo para tu referencia interna. NUNCA menciones "ESTADO X" o "estamos en el estado Y" al usuario. Habla de forma natural como un abogado profesional.

INFORMACIÓN CAPTURADA SEGÚN ESTADOS DEL FLUJO:

ESTADO 0 – EXPEDIENTE:
${context?.comprador?.nombre 
  ? `✓ Expediente del comprador: ${context.comprador.nombre}`
  : '✗ Expediente del comprador: Pendiente'}

ESTADO 1 – OPERACIÓN Y FORMA DE PAGO:
${context?.comprador?.necesitaCredito !== undefined
  ? `✓ Forma de pago: ${context.comprador.necesitaCredito ? 'Crédito' : 'Contado'}`
  : '✗ Forma de pago: Pendiente (debe definirse si es contado o crédito)'}

ESTADO 2 – INMUEBLE Y REGISTRO:
${context?.inmueble?.folioReal 
  ? `✓ Folio Real: ${context.inmueble.folioReal}`
  : '✗ Folio Real: Pendiente'}
${context?.inmueble?.partida 
  ? `✓ Partida(s): ${context.inmueble.partida}`
  : '✗ Partida(s): Pendiente'}
${context?.inmueble?.seccion 
  ? `✓ Sección: ${context.inmueble.seccion}`
  : '✗ Sección: Pendiente'}
${tieneEscritura && documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.propietario?.nombre
  ? `✓ Titular registral: ${documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.propietario?.nombre}`
  : tieneEscritura
    ? '✗ Titular registral: Pendiente extracción de escritura'
    : '✗ Titular registral: Pendiente (requiere escritura)'}
${tieneEscritura && documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.gravamenes
  ? `✓ Gravámenes detectados: ${documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.gravamenes}`
  : tieneEscritura
    ? '✗ Gravámenes: Pendiente verificación en escritura'
    : '✗ Gravámenes: Pendiente (requiere escritura)'}
${tieneEscritura
  ? '⚠ Confirmación de totalidad de hojas: Debe confirmarse explícitamente'
  : '✗ Confirmación de totalidad de hojas: Pendiente (requiere escritura)'}

ESTADO 3 – VENDEDOR(ES):
${context?.vendedor?.nombre 
  ? `✓ Vendedor: ${context.vendedor.nombre}`
  : '✗ Vendedor: Pendiente'}
${context?.vendedor?.rfc 
  ? `✓ RFC: ${context.vendedor.rfc}`
  : context?.vendedor?.nombre ? '✗ RFC: Pendiente' : ''}
${context?.vendedor?.curp 
  ? `✓ CURP: ${context.vendedor.curp}`
  : context?.vendedor?.nombre ? '✗ CURP: Pendiente' : ''}
${context?.vendedor?.tieneCredito !== undefined
  ? context.vendedor.tieneCredito
      ? `✓ Tiene crédito pendiente: Sí${context.vendedor.institucionCredito ? ` (${context.vendedor.institucionCredito})` : ''}`
      : '✓ Tiene crédito pendiente: No'
  : context?.vendedor?.nombre ? '✗ Crédito pendiente: Pendiente verificación' : ''}
${tieneIdVendedor && context?.vendedor?.nombre
  ? '⚠ Validación contra titular registral: Debe verificarse que coincida'
  : context?.vendedor?.nombre ? '✗ Validación contra titular registral: Pendiente' : ''}

ESTADO 4 – COMPRADOR(ES):
${context?.comprador?.nombre 
  ? `✓ Comprador: ${context.comprador.nombre}`
  : '✗ Comprador: Pendiente'}
${context?.comprador?.rfc 
  ? `✓ RFC: ${context.comprador.rfc}`
  : context?.comprador?.nombre ? '✗ RFC: Pendiente' : ''}
${context?.comprador?.curp 
  ? `✓ CURP: ${context.comprador.curp}`
  : context?.comprador?.nombre ? '✗ CURP: Pendiente' : ''}

ESTADO 5 – CRÉDITO DEL COMPRADOR (si aplica):
${context?.comprador?.necesitaCredito === true
  ? `✓ Crédito requerido: Sí
${context.comprador.institucionCredito ? `✓ Institución: ${context.comprador.institucionCredito}` : '✗ Institución: Pendiente'}
${context.comprador.montoCredito ? `✓ Monto: ${context.comprador.montoCredito}` : '✗ Monto: Pendiente'}
✗ Roles exactos: Pendiente (acreditante, acreditado, coacreditado, obligado solidario, garante hipotecario)`
  : context?.comprador?.necesitaCredito === false
    ? '✓ Crédito requerido: No (pago de contado)'
    : ''}

ESTADO 6 – CANCELACIÓN DE HIPOTECA (si existe):
${tieneEscritura && documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.gravamenes
  ? '⚠ Cancelación de hipoteca: Debe confirmarse si se cancelará como parte de la operación'
  : tieneEscritura
    ? '✓ Cancelación de hipoteca: No aplica (sin hipoteca detectada)'
    : ''}

ESTADO 7 – OBJETO DEL ACTO:
${context?.inmueble?.direccion 
  ? `✓ Ubicación: ${context.inmueble.direccion}`
  : '✗ Ubicación: Pendiente'}
${context?.inmueble?.superficie 
  ? `✓ Superficie: ${context.inmueble.superficie}`
  : '✗ Superficie: Pendiente'}
${context?.inmueble?.valor 
  ? `✓ Valor: ${context.inmueble.valor}`
  : '✗ Valor: Pendiente'}
${context?.inmueble?.folioReal 
  ? `✓ Folio Real: ${context.inmueble.folioReal}`
  : '✗ Folio Real: Pendiente'}
${tienePlano && documentosProcesados.find(d => d.tipo === 'plano' || d.tipo === 'croquis_catastral')
  ? `✓ Información catastral disponible: ${documentosProcesados.filter(d => d.tipo === 'plano' || d.tipo === 'croquis_catastral').length} plano(s) procesado(s)`
  : '✗ Información catastral: Pendiente (lote, manzana, fraccionamiento, colonia, municipio)'}

ESTADO 8 – REVISIÓN FINAL:
✗ Revisión final: Pendiente (debe completarse antes de generar documento)

${resumenDocumentos}

INSTRUCCIONES PARA ESTE ESTADO:
- ANTES de hacer cualquier pregunta, REVISA el contexto "INFORMACIÓN CAPTURADA SEGÚN ESTADOS DEL FLUJO" para ver qué información ya tienes disponible.
- Si la información ya está disponible en el contexto o en los documentos procesados, NO la preguntes de nuevo.
- Usa la información de los documentos procesados cuando esté disponible.
- Si falta información crítica para este estado, solicítala explícitamente UNA SOLA VEZ.
- NO infieras información. Todo dato crítico debe venir de documento o captura manual con confirmación.
- Sigue el orden estricto del flujo conversacional internamente, pero NUNCA menciones los estados (ESTADO 0, ESTADO 1, etc.) al usuario.
- Al procesar documentos, explica la información relevante extraída en lenguaje natural, como un notario explicaría a su cliente.
- Si el usuario menciona croquis catastral o planos, indícale que puede usar el módulo de "Lectura de Plantas Arquitectónicas" (Deslinde) para procesarlos.
- NUNCA digas "Estamos en el ESTADO X" o "Vamos a pasar al ESTADO Y". Habla de forma natural como un abogado en una oficina.

MANEJO DE EXPEDIENTES:
- Si el usuario tiene un trámite guardado en progreso (hasDraftTramite = true), reconócelo automáticamente como continuación de un expediente existente.
- Si no hay trámite guardado, asume automáticamente que es un expediente nuevo. NO preguntes al usuario si es nuevo o existente.

SOLICITUD DE INFORMACIÓN DEL COMPRADOR (CRÍTICO - OBLIGATORIO):
- NUNCA preguntes por el nombre del comprador por separado.
- NUNCA preguntes "¿Quién será el comprador principal?" o "¿Cuál es el nombre del comprador?" o "Solo dime nombre completo del comprador".
- SIEMPRE pide DIRECTAMENTE la identificación oficial (INE, IFE o Pasaporte) del comprador para adjuntarla al expediente.
- El nombre, RFC, CURP y demás datos se extraerán automáticamente de la identificación cuando la suba.
- Ejemplo CORRECTO: "Necesito la identificación oficial del comprador (INE, IFE o Pasaporte) para adjuntarla al expediente."
- Ejemplo INCORRECTO: "¿Quién será el comprador principal y me puedes indicar qué identificación oficial tiene? Solo dime nombre completo del comprador y el tipo de identificación."
- NO combines la solicitud del nombre con la solicitud de identificación. SOLO pide la identificación.

MANEJO DE MÚLTIPLES FOLIOS REALES EN HOJAS DE INSCRIPCIÓN:
- Si al procesar una hoja de inscripción detectas MÚLTIPLES folios reales, NUNCA elijas uno automáticamente.
- DEBES informar al usuario que encontraste varios folios reales en el documento y preguntarle explícitamente cuál es el correcto para este trámite.
- Presenta los folios reales encontrados de forma clara y solicita confirmación: "He revisado la hoja de inscripción y encontré los siguientes folios reales: [lista los folios]. ¿Cuál de estos corresponde al inmueble de este trámite?"
- Solo después de que el usuario confirme cuál folio real usar, procede a continuar con el proceso.
- NUNCA asumas o elijas un folio real sin confirmación explícita del usuario cuando hay múltiples opciones.

REGLAS CRÍTICAS DE COMUNICACIÓN (OBLIGATORIAS):
- NUNCA menciones JSON, bloques de datos, estructuras de datos, o cualquier aspecto técnico del sistema.
- NUNCA menciones procesos internos, actualizaciones de datos, o cómo funciona el sistema por detrás.
- NUNCA uses términos técnicos como "parsear", "extraer datos", "actualizar estado", "bloque DATA_UPDATE", etc.
- SIEMPRE mantén el papel de un abogado/notario profesional que está ayudando al cliente.
- Habla de forma natural, como si estuvieras en una oficina notarial conversando con el cliente.
- Si procesas información de documentos, simplemente confirma lo que leíste de forma natural: "Perfecto, he revisado tu documento y veo que..." sin mencionar procesos técnicos.
- El bloque <DATA_UPDATE> es SOLO para uso interno del sistema. NUNCA lo menciones, lo muestres, o hagas referencia a él en tus respuestas al usuario.
- Si necesitas actualizar información, hazlo silenciosamente en el bloque <DATA_UPDATE> sin mencionarlo al usuario.
- Haz UNA pregunta a la vez, o máximo DOS preguntas relacionadas en el mismo mensaje. NO hagas múltiples preguntas separadas en diferentes mensajes.
- Sé conciso y directo. Evita hacer listas numeradas largas o múltiples mensajes seguidos con preguntas.
- Cuando necesites información, agrupa las preguntas relacionadas en un solo mensaje natural, no las separes en múltiples mensajes.
- NUNCA repitas la misma pregunta de diferentes formas. Si ya hiciste una pregunta, no la reformules ni la vuelvas a hacer.
- Si necesitas confirmar algo que ya preguntaste, espera la respuesta del usuario antes de hacer una nueva pregunta relacionada.
- Evita estructurar las mismas preguntas de múltiples formas (por ejemplo, no uses numeración Y luego letras para la misma información).

FORMATO DE RESPUESTA OBLIGATORIO (SOLO PARA USO INTERNO):
Al final de cada respuesta, cuando captures o confirmes información del usuario, DEBES incluir SILENCIOSAMENTE un bloque JSON estructurado con la información capturada. Este bloque es EXCLUSIVAMENTE para uso interno del sistema y NUNCA debe ser visible o mencionado al usuario.

El formato es:

<DATA_UPDATE>
{
  "tipoOperacion": "compraventa" | null,
  "comprador": {
    "nombre": "string" | null,
    "rfc": "string" | null,
    "curp": "string" | null,
    "necesitaCredito": true | false | null,
    "institucionCredito": "string" | null,
    "montoCredito": "string" | null
  },
  "vendedor": {
    "nombre": "string" | null,
    "rfc": "string" | null,
    "curp": "string" | null,
    "tieneCredito": true | false | null,
    "institucionCredito": "string" | null,
    "numeroCredito": "string" | null
  },
  "inmueble": {
    "direccion": "string" | null,
    "folioReal": "string" | null,
    "seccion": "string" | null,
    "partida": "string" | null,
    "superficie": "string" | null,
    "valor": "string" | null,
    "unidad": "string" | null,
    "modulo": "string" | null,
    "condominio": "string" | null,
    "lote": "string" | null,
    "manzana": "string" | null,
    "fraccionamiento": "string" | null,
    "colonia": "string" | null
  }
}
</DATA_UPDATE>

IMPORTANTE SOBRE EL BLOQUE <DATA_UPDATE>:
- Este bloque es COMPLETAMENTE INVISIBLE para el usuario. NUNCA lo menciones, lo muestres, o hagas referencia a él.
- Solo incluye campos que hayas capturado o confirmado en esta respuesta.
- Usa null para campos que no se mencionaron o no se confirmaron.
- NO incluyas el bloque <DATA_UPDATE> si no hay información nueva que actualizar.
- El JSON debe ser válido y estar dentro del bloque <DATA_UPDATE>...</DATA_UPDATE>.
- Tu respuesta al usuario debe ser SOLO en lenguaje natural, como un abogado profesional. El bloque JSON es invisible y solo para el sistema.

Responde siempre en español, de forma profesional, educada y guiando paso a paso según el flujo conversacional obligatorio.`

  // Combinar prompt base con contexto dinámico
  return basePrompt + contextoDinamico
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
      content: await buildSystemPrompt(context)
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
    let assistantMessage = data?.choices?.[0]?.message?.content || ""

    if (!assistantMessage) {
      return NextResponse.json(
        { error: "empty_response", message: "La IA no generó una respuesta" },
        { status: 500 }
      )
    }

    // Eliminar el bloque <DATA_UPDATE>...</DATA_UPDATE> antes de mostrar al usuario
    assistantMessage = assistantMessage.replace(/<DATA_UPDATE>[\s\S]*?<\/DATA_UPDATE>/gi, '').trim()

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

