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
    expedienteExistente?: {
      compradorId: string
      compradorNombre: string
      tieneExpedientes: boolean
      cantidadTramites: number
      tramites: Array<{ id: string, tipo: string, estado: string, createdAt: string, updatedAt: string }>
    }
  }
}

/**
 * Construye el prompt del sistema combinando:
 * - Base prompt desde la base de datos (preaviso_config): Contiene TODAS las reglas de negocio
 *   (qué información pedir, cómo pedirla, flujo conversacional, reglas de comunicación, etc.)
 * - Contexto dinámico desde el código: Contiene SOLO reglas técnicas de implementación
 *   (formato <DATA_UPDATE>, estructura JSON, estado actual técnico, documentos procesados)
 * 
 * Separación de responsabilidades:
 * - DB (preaviso_config): Reglas de negocio, flujo conversacional, cómo comunicarse con el usuario
 * - Código (buildSystemPrompt): Reglas técnicas, formato de datos, construcción de contexto dinámico
 */
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
  
  // Determinar estado actual según el flujo conversacional del prompt maestro (6 estados consolidados)
  // NOTA: Esta lógica es técnica y ayuda a construir el contexto dinámico. Las reglas de negocio 
  // sobre QUÉ información pedir y CÓMO pedirla están en la base de datos (preaviso_config).
  let estadoActual = 'ESTADO 1'
  let estadoDescripcion = 'OPERACIÓN Y FORMA DE PAGO (BLOQUEANTE) - Definir tipo de operación y forma de pago'
  
  // Si ya tenemos tipo de operación y forma de pago, avanzar al siguiente estado
  if (context?.comprador?.necesitaCredito !== undefined || context?.tipoOperacion) {
    // ESTADO 2 - INMUEBLE Y REGISTRO (consolidado con objeto del acto)
    if (!context?.inmueble?.folioReal || !tieneEscritura) {
      estadoActual = 'ESTADO 2'
      estadoDescripcion = 'INMUEBLE Y REGISTRO (BLOQUEANTE - CONSOLIDADO) - Solicitar hojas registrales y detalles del inmueble'
    } else if (!context?.vendedor?.nombre || !tieneIdVendedor) {
      // ESTADO 3 - VENDEDOR(ES)
      estadoActual = 'ESTADO 3'
      estadoDescripcion = 'VENDEDOR(ES) - Capturar información del vendedor'
    } else if (!context?.comprador?.nombre || !tieneIdComprador) {
      // ESTADO 4 - COMPRADOR(ES) (consolidado con expediente)
      estadoActual = 'ESTADO 4'
      estadoDescripcion = 'COMPRADOR(ES) - Capturar información del comprador y apertura de expediente'
    } else if (context?.comprador?.necesitaCredito === true && (!context?.comprador?.institucionCredito || !context?.comprador?.montoCredito)) {
      // ESTADO 5 - CRÉDITO DEL COMPRADOR (si aplica)
      estadoActual = 'ESTADO 5'
      estadoDescripcion = 'CRÉDITO DEL COMPRADOR - Capturar información del crédito'
    } else {
      // ESTADO 6 - CANCELACIÓN DE HIPOTECA (si aplica) o completado
      estadoActual = 'ESTADO 6'
      estadoDescripcion = 'CANCELACIÓN DE HIPOTECA - Verificar si aplica cancelación'
    }
  }

  let draftNotice = ''
  if (hasDraftTramite) {
    draftNotice = `\n\n⚠️ IMPORTANTE: El usuario tiene un trámite guardado en progreso. Si el usuario responde "continuar", "seguir" o similar, confirma que continuará con ese trámite. Si responde "nuevo", "empezar nuevo" o similar, inicia un trámite completamente nuevo.`
  }

  // Información sobre expedientes existentes del comprador
  let expedienteExistenteNotice = ''
  if (context?.expedienteExistente) {
    const exp = context.expedienteExistente
    if (exp.tieneExpedientes) {
      expedienteExistenteNotice = `\n\n📋 EXPEDIENTE EXISTENTE: El comprador "${exp.compradorNombre}" ya tiene ${exp.cantidadTramites} trámite(s) registrado(s) en el sistema:\n`
      exp.tramites.forEach((t, idx) => {
        expedienteExistenteNotice += `- Trámite ${idx + 1}: Tipo "${t.tipo}", Estado: "${t.estado}" (Creado: ${new Date(t.createdAt).toLocaleDateString('es-MX')})\n`
      })
      expedienteExistenteNotice += `\nEsta información es SOLO para tu referencia. NO menciones estos trámites a menos que el usuario pregunte específicamente por ellos. Continúa con el proceso normal de captura como si fuera un trámite nuevo, pero puedes mencionar de forma natural que el comprador ya está registrado en el sistema si es relevante para la conversación.`
    } else {
      expedienteExistenteNotice = `\n\n✅ NUEVO COMPRADOR: El comprador "${exp.compradorNombre}" es un comprador nuevo sin trámites previos registrados en el sistema.`
    }
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
${expedienteExistenteNotice}

================================================================

ESTADO ACTUAL DEL FLUJO CONVERSACIONAL (SOLO PARA REFERENCIA INTERNA, NO MENCIONAR AL USUARIO):
${estadoActual} – ${estadoDescripcion}

IMPORTANTE: Este estado es solo para tu referencia interna. NUNCA menciones "ESTADO X" o "estamos en el estado Y" al usuario. Habla de forma natural como un asistente jurídico profesional.

INFORMACIÓN CAPTURADA SEGÚN ESTADOS DEL FLUJO:

ESTADO 1 – OPERACIÓN Y FORMA DE PAGO:
${context?.comprador?.necesitaCredito !== undefined
  ? `✓ Forma de pago: ${context.comprador.necesitaCredito ? 'Crédito' : 'Contado'}`
  : '✗ Forma de pago: Pendiente (debe definirse si es contado o crédito)'}

ESTADO 2 – INMUEBLE Y REGISTRO (CONSOLIDADO):
${context?.inmueble?.folioReal 
  ? `✓ Folio Real: ${context.inmueble.folioReal}`
  : '✗ Folio Real: Pendiente'}
${context?.inmueble?.partida 
  ? `✓ Partida(s): ${context.inmueble.partida}`
  : '✗ Partida(s): Pendiente'}
${context?.inmueble?.seccion 
  ? `✓ Sección: ${context.inmueble.seccion}`
  : '✗ Sección: Pendiente'}
${context?.inmueble?.direccion 
  ? `✓ Dirección: ${context.inmueble.direccion}`
  : '✗ Dirección: Pendiente'}
${context?.inmueble?.superficie 
  ? `✓ Superficie: ${context.inmueble.superficie}`
  : '✗ Superficie: Pendiente'}
${context?.inmueble?.valor 
  ? `✓ Valor: ${context.inmueble.valor}`
  : '✗ Valor: Pendiente'}
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
${tienePlano && documentosProcesados.find(d => d.tipo === 'plano' || d.tipo === 'croquis_catastral')
  ? `✓ Información catastral disponible: ${documentosProcesados.filter(d => d.tipo === 'plano' || d.tipo === 'croquis_catastral').length} plano(s) procesado(s)`
  : '✗ Información catastral: Pendiente (lote, manzana, fraccionamiento, colonia, municipio)'}

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

ESTADO 4 – COMPRADOR(ES) (CONSOLIDADO CON EXPEDIENTE):
${context?.comprador?.nombre 
  ? `✓ Comprador: ${context.comprador.nombre}`
  : '✗ Comprador: Pendiente (requiere identificación oficial)'}
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

NOTA: La revisión final es una validación automática que se realiza cuando todos los datos críticos están presentes. NO es un estado de captura separado.

${resumenDocumentos}

================================================================

REGLAS TÉCNICAS DE IMPLEMENTACIÓN (SOLO PARA USO INTERNO):
NOTA: Las reglas de negocio sobre QUÉ información pedir, CÓMO pedirla, y el FLUJO de preguntas están en la base de datos (preaviso_config). 
Las siguientes reglas son SOLO técnicas sobre el formato de respuesta para la implementación del sistema.

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
- Tu respuesta al usuario debe ser SOLO en lenguaje natural, como un asistente jurídico profesional. El bloque JSON es invisible y solo para el sistema.

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

