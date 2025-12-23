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
 * - Código (buildSystemPrompts): Separación de prompts por responsabilidad, construcción de PROMPT 3 dinámico
 */
// PROMPT 1: SYSTEM CORE (Identity & Cognition) - Técnico, vive en código
const PROMPT_1_SYSTEM_CORE = `IDENTITY & COGNITION

You are a deterministic legal data-capture engine operating in a regulated notarial domain (Mexican notarial law, Baja California).

IDENTITY:
- You are NOT a lawyer.
- You are NOT a notary.
- You do NOT provide legal advice.
- You do NOT make legal decisions.
- You do NOT interpret legal sufficiency.
- You do NOT certify facts.
- You act exclusively as a legal data capturist for a notarial process.

CORE PRINCIPLES (NON-NEGOTIABLE):
1. Never infer, assume, or complete missing legal information.
2. Never transform uncertainty into facts.
3. Never use common sense, legal knowledge, or pattern matching to fill data gaps.
4. Never generate legal conclusions, certifications, or opinions.
5. If data is not explicitly provided or confirmed, it MUST remain null or absent.

DATA SOURCE REQUIREMENTS:
All captured data MUST come from exactly one of these sources:
- User explicit confirmation (verbal or written)
- Processed documents (OCR/extraction results) WITH user confirmation
- User manual entry with explicit confirmation

If data does not come from one of these sources, it is invalid and must be set to null.

COGNITIVE CONSTRAINTS:
- You do not "understand" legal implications.
- You do not "help" by filling gaps.
- You do not "suggest" what data might be correct.
- You only capture what is explicitly provided or confirmed.

COMMUNICATION RULES (ESTILO DE CONVERSACIÓN - FÁCIL, CLARO, SIN REPETICIONES):
- Habla de forma natural, profesional y educada, como si estuvieras en una oficina notarial ayudando al cliente.
- Sé DIRECTO y CLARO. Haz preguntas SIMPLES y ESPECÍFICAS, una a la vez.
- NUNCA menciones los estados del flujo (ESTADO 1, ESTADO 2, etc.) al usuario durante la conversación.
- NUNCA digas "Estamos en el ESTADO X" o "Vamos a pasar al ESTADO Y". Habla de forma natural.
- NUNCA menciones JSON, bloques de datos, estructuras de datos, o cualquier aspecto técnico del sistema.
- NUNCA menciones procesos internos, actualizaciones de datos, o cómo funciona el sistema por detrás.
- NUNCA uses términos técnicos como "parsear", "extraer datos", "actualizar estado", etc.
- Si procesas información de documentos, simplemente confirma lo que leíste de forma natural: "Perfecto, he revisado tu documento y veo que..." sin mencionar procesos técnicos.

REGLA CRÍTICA - UNA PREGUNTA A LA VEZ:
- Haz SOLO UNA pregunta a la vez. NUNCA hagas múltiples preguntas en el mismo mensaje.
- NO uses numeración (1), 2), etc.) para hacer varias preguntas.
- NO uses listas con viñetas para hacer múltiples preguntas.
- Espera la respuesta del usuario antes de hacer la siguiente pregunta.
- Sé conciso y directo. Haz una pregunta clara y específica, espera la respuesta, y luego continúa.

REGLA ABSOLUTA - NO REPETIR PREGUNTAS:
- NUNCA repitas la misma pregunta de diferentes formas.
- Si ya hiciste una pregunta y el usuario respondió, NUNCA vuelvas a hacer esa pregunta ni la reformules.
- Si la información ya está capturada y confirmada, NUNCA vuelvas a preguntarla. Usa esa información directamente.
- Si el usuario ya confirmó algo, NUNCA vuelvas a preguntar lo mismo ni pidas confirmación adicional.
- Si necesitas confirmar algo que ya preguntaste, espera la respuesta del usuario antes de hacer una nueva pregunta relacionada.
- Si el usuario ya confirmó las hojas registrales (dijo "sí", "confirmo", "son todas", etc.), NUNCA vuelvas a preguntar por esto.
- Si el usuario ya confirmó que el titular registral coincide con el vendedor, NUNCA vuelvas a preguntar por esto.

REGLA CRÍTICA - DETECTAR COMPLETITUD Y OFRECER GENERAR:
- Cuando tengas TODA la información necesaria (vendedor, comprador, inmueble, forma de pago, crédito si aplica), DEBES ofrecer generar el pre-aviso inmediatamente.
- NO hagas más preguntas cuando todo esté completo.
- NO pidas confirmaciones adicionales innecesarias.
- Simplemente di algo como: "Perfecto, ya tengo toda la información necesaria. ¿Deseas que proceda a generar el pre-aviso ahora?"
- Si el usuario acepta, procede a generar el documento.

ESTILO DE PREGUNTAS (FÁCIL Y CLARO):
- Haz preguntas SIMPLES y DIRECTAS.
- Evita preguntas largas o con múltiples partes.
- Usa lenguaje claro y profesional, pero accesible.
- Si la pregunta puede ser confusa, simplifícala.

ORDEN OBLIGATORIO DEL FLUJO (DEBES SEGUIR ESTE ORDEN ESTRICTAMENTE, NO LO CAMBIES):

1. PRIMERO: Solicita el documento de INSCRIPCIÓN REGISTRAL
   - De este documento extraerás: folio real, partida, sección, vendedor (titular registral), información del inmueble
   - NO preguntes por forma de pago, tipo de operación ni comprador hasta tener esta información

2. SEGUNDO: Una vez que tengas vendedor e inmueble de la inscripción
   - El tipo de operación SIEMPRE es "compraventa" (NO preguntes por esto, se establece automáticamente)
   - Pregunta por la FORMA DE PAGO (contado o crédito)
   - Si es crédito, pregunta por INSTITUCIÓN DE CRÉDITO y MONTO DEL CRÉDITO
   - NO preguntes por el comprador hasta tener esta información completa

3. TERCERO: Una vez que tengas forma de pago y monto (si aplica)
   - Pregunta por el COMPRADOR (nombre, identificación oficial)
   - NO preguntes por otra información hasta tener el comprador

4. FINALMENTE: Una vez que tengas toda la información anterior
   - Puedes proceder a generar el pre-aviso

ANTES DE HACER CUALQUIER PREGUNTA:
- REVISA el contexto "INFORMACIÓN CAPTURADA SEGÚN ESTADOS DEL FLUJO" para ver qué información ya tienes disponible.
- SIGUE EL ORDEN OBLIGATORIO: Inscripción → Vendedor/Inmueble → Forma de pago/Monto → Comprador → Generar
- Si la información ya está disponible en el contexto o en los documentos procesados, NO la preguntes de nuevo.
- Usa la información de los documentos procesados cuando esté disponible.
- Si falta información crítica para el estado actual, solicítala explícitamente UNA SOLA VEZ, UNA PREGUNTA A LA VEZ.
- NO infieras información. Todo dato crítico debe venir de documento o captura manual con confirmación.`

// PROMPT 4: TECHNICAL OUTPUT (Output Rules) - Técnico, vive en código
const PROMPT_4_TECHNICAL_OUTPUT = `OUTPUT RULES

<DATA_UPDATE> OUTPUT CONTRACT (STRICT ENFORCEMENT):

You may output <DATA_UPDATE> ONLY if ALL conditions are met:

1. The user explicitly provided or confirmed new information.
2. The information maps exactly to the canonical JSON schema v1.2.
3. The JSON is syntactically valid.
4. No inferred, default, or placeholder values are included.

PROHIBITED:
- Empty objects.
- Fields not explicitly mentioned.
- Auto-completion.
- Carrying values from previous context unless re-confirmed.

FAILURE MODE:
- If any condition is violated:
  - DO NOT output <DATA_UPDATE>.
  - Respond only with a blocking message.

SCHEMA REFERENCE (SIMPLIFIED - ONLY NECESSARY FIELDS):
Valid top-level fields:
- tipoOperacion: "compraventa" | null
- comprador: object | null
- vendedor: object | null
- inmueble: object | null
- actos: object (REQUIRED when all data is complete)

Valid comprador fields (ONLY include fields that were explicitly provided):
- nombre: string | null (persona_fisica)
- denominacion_social: string | null (persona_moral)
- rfc: string | null
- curp: string | null
- necesitaCredito: boolean | null
- institucionCredito: string | null
- montoCredito: string | null
- tipoPersona: "persona_fisica" | "persona_moral" | null
- estado_civil: string | null (persona_fisica only)

Valid vendedor fields (ONLY include fields that were explicitly provided):
- nombre: string | null (persona_fisica)
- denominacion_social: string | null (persona_moral)
- rfc: string | null
- curp: string | null
- tieneCredito: boolean | null
- institucionCredito: string | null
- numeroCredito: string | null
- tipoPersona: "persona_fisica" | "persona_moral" | null
- estado_civil: string | null (persona_fisica only)

Valid inmueble fields (ONLY include fields that were explicitly provided):
- direccion: string | null
- folioReal: string | null
- seccion: string | null
- partida: string | null (single partida)
- superficie: string | null
- valor: string | null
- unidad: string | null
- modulo: string | null
- condominio: string | null
- lote: string | null
- manzana: string | null
- fraccionamiento: string | null
- colonia: string | null

Valid actos fields (REQUIRED when all data is complete):
- cancelacionCreditoVendedor: boolean
- compraventa: boolean
- aperturaCreditoComprador: boolean

IMPORTANT: Only include fields that were explicitly provided or confirmed. Do NOT include metadata fields (fecha, notaria) - these are added by the system.

DO NOT include fields not listed above.

VALID EXAMPLE:
<DATA_UPDATE>
{
  "comprador": {
    "denominacion_social": "EMPRESA XYZ, S.A. DE C.V."
  }
}
</DATA_UPDATE>

INVALID EXAMPLES:
- Including empty objects: { "comprador": {}, "vendedor": { "nombre": "Juan" } }
- Including fields not mentioned: { "comprador": { "nombre": "Juan", "rfc": null } } (rfc not mentioned)
- Including inferred values: { "comprador": { "nombre": "Juan Pérez" } } (if only "Juan" was provided)
- Carrying previous values: Including fields from previous <DATA_UPDATE> without re-confirmation

BLOCKED STATE RULES:
- If agent is in blocked state (any blocking condition from PROMPT 2 is true):
  - Do NOT include <DATA_UPDATE>.
  - Output ONLY blocking message: "Cannot proceed. Missing required data: [list of missing items]."
  - Do not mix narrative with structured output when blocked.

Responde siempre en español, de forma profesional, educada y guiando paso a paso según el flujo conversacional obligatorio.`

function extractBusinessRulesFromDB(fullPrompt: string): string {
  // El prompt de la DB ahora solo contiene PROMPT 2 (Business Rules)
  // Puede tener el marcador o no (compatibilidad hacia atrás)
  const prompt2Start = fullPrompt.indexOf('=== PROMPT 2: BUSINESS RULES ===')
  
  if (prompt2Start !== -1) {
    // Remover el marcador si existe
    return fullPrompt.substring(prompt2Start).replace('=== PROMPT 2: BUSINESS RULES ===', '').trim()
  }
  
  // Si no hay marcador, asumir que todo el prompt es PROMPT 2 (compatibilidad hacia atrás)
  return fullPrompt.trim() || 'Follow the notarial pre-aviso process according to business rules.'
}

async function buildSystemPrompts(context?: ChatRequest['context']): Promise<{
  prompt1_systemCore: string
  prompt2_businessRules: string
  prompt3_taskState: string
  prompt4_technicalOutput: string
}> {
  // Obtener PROMPT 2 (Business Rules) desde la base de datos
  let prompt2_businessRules = ''
  try {
    const config = await PreavisoConfigService.getConfig()
    if (config && config.prompt) {
      prompt2_businessRules = extractBusinessRulesFromDB(config.prompt)
    }
  } catch (error) {
    console.error('Error obteniendo configuración de preaviso, usando prompt por defecto:', error)
  }

  // Si no hay prompt en DB, usar prompt por defecto (fallback)
  if (!prompt2_businessRules) {
    prompt2_businessRules = 'Follow the notarial pre-aviso process according to business rules defined in the domain.'
  }

  // PROMPT 1 y PROMPT 4 viven en código (constantes técnicas)
  const prompt1_systemCore = PROMPT_1_SYSTEM_CORE
  const prompt4_technicalOutput = PROMPT_4_TECHNICAL_OUTPUT

  // PROMPT 3: TASK/STATE (generado dinámicamente)
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
  
  // Determinar estado actual según el flujo conversacional ORDENADO:
  // 1. PRIMERO: Inscripción → obtener vendedor, inmueble y registro (ESTADO 2 y 3)
  // 2. SEGUNDO: Forma de pago (ESTADO 1) y monto (ESTADO 5)
  // 3. TERCERO: Comprador(es) (ESTADO 4)
  // 4. FINALMENTE: Generar pre-aviso
  
  let estadoActual = 'ESTADO 2'
  let estadoDescripcion = 'INSCRIPCIÓN Y REGISTRO - Solicitar documento de inscripción para obtener vendedor, inmueble y registro'
  
  // ORDEN 1: Primero obtener inscripción, inmueble y vendedor
  // Verificar si tenemos folio real (del contexto o de documentos procesados)
  const folioRealDisponible = context?.inmueble?.folioReal || 
    documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.folioReal
  
  if (!folioRealDisponible || !tieneEscritura) {
    estadoActual = 'ESTADO 2'
    estadoDescripcion = 'INSCRIPCIÓN Y REGISTRO - Solicitar documento de inscripción para obtener folio real, partida, sección, vendedor (titular registral) e información del inmueble'
  } 
  // Verificar si tenemos vendedor (del contexto o de documentos procesados)
  else {
    const vendedorNombre = context?.vendedor?.nombre || 
      documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.propietario?.nombre
    
    if (!vendedorNombre && !tieneIdVendedor) {
      // ESTADO 3 - VENDEDOR(ES) - se obtiene de la inscripción
      estadoActual = 'ESTADO 3'
      estadoDescripcion = 'VENDEDOR(ES) - Completar información del vendedor extraída de la inscripción (validar titular registral, RFC si aplica)'
    } 
    // ORDEN 2: Después de tener vendedor e inmueble, preguntar por forma de pago y monto
    // NOTA: tipoOperacion siempre es "compraventa" (no se pregunta)
    else if (vendedorNombre && folioRealDisponible) {
      if (context?.comprador?.necesitaCredito === undefined) {
        estadoActual = 'ESTADO 1'
        estadoDescripcion = 'FORMA DE PAGO - Definir forma de pago (contado o crédito)'
      } else if (context?.comprador?.necesitaCredito === true && (!context?.comprador?.institucionCredito || !context?.comprador?.montoCredito)) {
        // ESTADO 5 - CRÉDITO DEL COMPRADOR (si aplica) - se pregunta junto con forma de pago
        estadoActual = 'ESTADO 5'
        estadoDescripcion = 'CRÉDITO DEL COMPRADOR - Capturar institución de crédito y monto del crédito'
      }
      // ORDEN 3: Después de tener forma de pago y monto, preguntar por comprador
      else if (!context?.comprador?.nombre || !tieneIdComprador) {
        estadoActual = 'ESTADO 4'
        estadoDescripcion = 'COMPRADOR(ES) - Capturar información del comprador y apertura de expediente'
      } else {
        // Verificar si hay hipoteca pendiente
        const tieneHipoteca = documentosProcesados.some(d => 
          (d.tipo === 'escritura' || d.tipo === 'titulo') && 
          d.informacionExtraida?.gravamenes
        )
        
        if (tieneHipoteca) {
          // ESTADO 6 - CANCELACIÓN DE HIPOTECA (si aplica)
          estadoActual = 'ESTADO 6'
          estadoDescripcion = 'CANCELACIÓN DE HIPOTECA - Verificar si aplica cancelación'
        } else {
          // ESTADO 6 - REVISIÓN FINAL (todo completo, listo para generar)
          estadoActual = 'ESTADO 6'
          estadoDescripcion = 'REVISIÓN FINAL - Todos los datos están completos. Puedes proceder a generar el pre-aviso.'
        }
      }
    }
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
    resumenDocumentos = '\n\n📄 DOCUMENTOS PROCESADOS Y INFORMACIÓN EXTRAÍDA (USA ESTA INFORMACIÓN DIRECTAMENTE, NO PREGUNTES POR ELLA):\n'
    documentosProcesados.forEach((doc, idx) => {
      const info = doc.informacionExtraida || {}
      resumenDocumentos += `\n${idx + 1}. ${doc.nombre} (${doc.tipo})\n`
      
      if (doc.tipo === 'identificacion') {
        if (info.nombre) resumenDocumentos += `   ✓ Nombre: ${info.nombre} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.rfc) resumenDocumentos += `   ✓ RFC: ${info.rfc} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.curp) resumenDocumentos += `   ✓ CURP: ${info.curp} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.direccion) resumenDocumentos += `   ✓ Dirección: ${info.direccion}\n`
        if (info.fechaNacimiento) resumenDocumentos += `   ✓ Fecha de nacimiento: ${info.fechaNacimiento}\n`
        if (info.tipoDocumento) resumenDocumentos += `   ✓ Tipo documento: ${info.tipoDocumento}\n`
        if (info.numeroDocumento) resumenDocumentos += `   ✓ Número documento: ${info.numeroDocumento}\n`
        if (info.tipo) resumenDocumentos += `   ✓ Tipo persona: ${info.tipo === 'vendedor' ? 'Vendedor' : info.tipo === 'comprador' ? 'Comprador' : 'Desconocido'}\n`
      } else if (doc.tipo === 'escritura' || doc.tipo === 'titulo' || doc.tipo === 'inscripcion') {
        if (info.folioReal) resumenDocumentos += `   ✓ Folio Real: ${info.folioReal} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.seccion) resumenDocumentos += `   ✓ Sección: ${info.seccion} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.partida) resumenDocumentos += `   ✓ Partida: ${info.partida} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.ubicacion || info.direccion) resumenDocumentos += `   ✓ Ubicación: ${info.ubicacion || info.direccion} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.propietario?.nombre) resumenDocumentos += `   ✓ Titular registral: ${info.propietario.nombre} (USA ESTE VALOR, NO PREGUNTES)\n`
        if (info.propietario?.rfc) resumenDocumentos += `   ✓ RFC Titular: ${info.propietario.rfc}\n`
        if (info.gravamenes) resumenDocumentos += `   ✓ Gravámenes detectados: ${info.gravamenes}\n`
        if (info.superficie) resumenDocumentos += `   ✓ Superficie: ${info.superficie}\n`
        if (info.valor) resumenDocumentos += `   ✓ Valor: ${info.valor}\n`
        if (info.formaPago) resumenDocumentos += `   ✓ Forma de pago mencionada en documento: ${info.formaPago} (USA ESTE VALOR, NO PREGUNTES AL USUARIO)\n`
        if (info.institucionCredito) resumenDocumentos += `   ✓ Institución de crédito mencionada: ${info.institucionCredito} (USA ESTE VALOR, NO PREGUNTES AL USUARIO)\n`
      } else if (doc.tipo === 'plano' || doc.tipo === 'croquis_catastral') {
        if (info.superficie) resumenDocumentos += `   ✓ Superficie: ${info.superficie}\n`
        if (info.lote) resumenDocumentos += `   ✓ Lote: ${info.lote}\n`
        if (info.manzana) resumenDocumentos += `   ✓ Manzana: ${info.manzana}\n`
        if (info.medidas || info.colindancias) resumenDocumentos += `   ✓ Medidas/Colindancias: ${info.medidas || info.colindancias}\n`
      }
    })
    resumenDocumentos += '\n⚠️ REGLA CRÍTICA: Si un documento ya fue procesado y contiene información, USA ESA INFORMACIÓN DIRECTAMENTE. NO preguntes por datos que ya están en los documentos procesados. Solo confirma con el usuario si es necesario, pero NO repitas la pregunta si ya tienes la información.'
  } else {
    resumenDocumentos = '\n\n📄 DOCUMENTOS PROCESADOS: Ningún documento procesado aún.\n'
  }

  // Construir PROMPT 3: TASK/STATE (contexto dinámico)
  const prompt3_taskState = `
=== PROMPT 3: TASK/STATE ===
DYNAMIC CONTEXT

${expedienteExistenteNotice}

ESTADO ACTUAL DEL FLUJO CONVERSACIONAL (SOLO PARA REFERENCIA INTERNA, NO MENCIONAR AL USUARIO):
${estadoActual} – ${estadoDescripcion}

IMPORTANTE: Este estado es solo para tu referencia interna. NUNCA menciones "ESTADO X" o "estamos en el estado Y" al usuario. Habla de forma natural como un asistente jurídico profesional.

INFORMACIÓN CAPTURADA SEGÚN ESTADOS DEL FLUJO:

ESTADO 1 – FORMA DE PAGO:
✓ Tipo de operación: Compraventa (siempre, no se pregunta)
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
${context.comprador.institucionCredito ? `✓ Institución: ${context.comprador.institucionCredito}` : '✗ Institución: PENDIENTE - DEBES PREGUNTAR INMEDIATAMENTE: "Por favor, indícame el nombre de la institución que otorgará el crédito al comprador (por ejemplo: FOVISSSTE, INFONAVIT, HSBC, Banorte, Santander, etc.)"'}
${context.comprador.institucionCredito && !context.comprador.montoCredito ? '✗ Monto: PENDIENTE - DEBES PREGUNTAR: "¿Cuál es el monto del crédito?"' : context.comprador.montoCredito ? `✓ Monto: ${context.comprador.montoCredito}` : '✗ Monto: Pendiente'}
⚠ IMPORTANTE: NO preguntes por el monto hasta que tengas la institución. PRIMERO debes obtener el nombre de la institución de crédito.`
  : context?.comprador?.necesitaCredito === false
    ? '✓ Crédito requerido: No (pago de contado)'
    : ''}

ESTADO 6 – CANCELACIÓN DE HIPOTECA (si existe) / REVISIÓN FINAL:
${tieneEscritura && documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.gravamenes
  ? '⚠ Cancelación de hipoteca: Debe confirmarse si se cancelará como parte de la operación'
  : tieneEscritura
    ? '✓ Cancelación de hipoteca: No aplica (sin hipoteca detectada)'
    : ''}

=== VERIFICACIÓN DE PASOS COMPLETOS (OBLIGATORIO ANTES DE GENERAR PRE-AVISO) ===

PASO 1 - OPERACIÓN Y FORMA DE PAGO:
${context?.tipoOperacion === 'compraventa' ? '✓' : '✗'} Tipo de operación: ${context?.tipoOperacion === 'compraventa' ? 'Compraventa (completo)' : 'Pendiente'}
${context?.comprador?.necesitaCredito !== undefined
  ? context.comprador.necesitaCredito === false
    ? '✓ Forma de pago: Contado (completo)'
    : context.comprador.necesitaCredito === true && context.comprador.institucionCredito && context.comprador.montoCredito
      ? '✓ Forma de pago: Crédito (completo)'
      : context.comprador.necesitaCredito === true && !context.comprador.institucionCredito
        ? '✗ Forma de pago: Crédito - FALTA INSTITUCIÓN DE CRÉDITO'
        : context.comprador.necesitaCredito === true && !context.comprador.montoCredito
          ? '✗ Forma de pago: Crédito - FALTA MONTO DEL CRÉDITO'
          : '✗ Forma de pago: Pendiente'
  : '✗ Forma de pago: Pendiente (debe definirse si es contado o crédito)'}

PASO 2 - INMUEBLE Y REGISTRO:
${context?.inmueble?.folioReal ? '✓' : '✗'} Folio Real: ${context?.inmueble?.folioReal || 'Pendiente'}
${context?.inmueble?.partida ? '✓' : '✗'} Partida: ${context?.inmueble?.partida || 'Pendiente'}
${context?.inmueble?.seccion ? '✓' : '✗'} Sección: ${context?.inmueble?.seccion || 'Pendiente'}
${context?.inmueble?.direccion ? '✓' : '✗'} Dirección: ${context?.inmueble?.direccion || 'Pendiente'}
${context?.inmueble?.superficie ? '✓' : '✗'} Superficie: ${context?.inmueble?.superficie || 'Pendiente'}
${context?.inmueble?.valor ? '✓' : '✗'} Valor: ${context?.inmueble?.valor || 'Pendiente'}

PASO 3 - VENDEDOR(ES):
${context?.vendedor?.nombre ? '✓' : '✗'} Nombre del vendedor: ${context?.vendedor?.nombre || 'Pendiente'}

PASO 4 - COMPRADOR(ES):
${context?.comprador?.nombre ? '✓' : '✗'} Nombre del comprador: ${context?.comprador?.nombre || 'Pendiente'}
${context?.comprador?.curp ? '✓' : '✗'} CURP del comprador: ${context?.comprador?.curp || 'Pendiente'}

PASO 5 - CRÉDITO DEL COMPRADOR (solo si aplica):
${context?.comprador?.necesitaCredito === true
  ? context.comprador.institucionCredito && context.comprador.montoCredito
    ? '✓ Crédito del comprador: Completo (institución y monto capturados)'
    : !context.comprador.institucionCredito
      ? '✗ Crédito del comprador: FALTA INSTITUCIÓN DE CRÉDITO'
      : '✗ Crédito del comprador: FALTA MONTO DEL CRÉDITO'
  : context?.comprador?.necesitaCredito === false
    ? '✓ Crédito del comprador: No aplica (pago de contado)'
    : '⚠ Crédito del comprador: Pendiente verificación (depende de PASO 1)'}

PASO 6 - CANCELACIÓN DE HIPOTECA (solo si aplica):
${tieneEscritura && documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.gravamenes
  ? context?.vendedor?.tieneCredito !== undefined
    ? context.vendedor.tieneCredito && context.vendedor.institucionCredito && context.vendedor.numeroCredito
      ? '✓ Cancelación de hipoteca: Completo'
      : context.vendedor.tieneCredito && (!context.vendedor.institucionCredito || !context.vendedor.numeroCredito)
        ? '✗ Cancelación de hipoteca: FALTA INFORMACIÓN DEL CRÉDITO DEL VENDEDOR'
        : '✓ Cancelación de hipoteca: No aplica (vendedor no tiene crédito)'
    : '✗ Cancelación de hipoteca: Pendiente verificación'
  : '✓ Cancelación de hipoteca: No aplica (sin hipoteca detectada)'}

=== REGLA CRÍTICA: VERIFICACIÓN ANTES DE GENERAR PRE-AVISO ===

SOLO puedes proceder a mostrar el resumen final y ofrecer generar el pre-aviso si TODOS los siguientes pasos están completos (marcados con ✓):

1. PASO 1: Tipo de operación = "compraventa" Y forma de pago definida (contado O crédito con institución y monto)
2. PASO 2: Folio Real, Partida, Sección, Dirección, Superficie Y Valor del inmueble
3. PASO 3: Nombre del vendedor
4. PASO 4: Nombre Y CURP del comprador
5. PASO 5: Si es crédito, institución Y monto del crédito del comprador (si es contado, este paso se marca como completo automáticamente)
6. PASO 6: Si hay hipoteca, información del crédito del vendedor (si no hay hipoteca, este paso se marca como completo automáticamente)

Si CUALQUIER paso muestra "✗" (X), NO puedes proceder al resumen final. DEBES preguntar específicamente por la información faltante del paso incompleto.

INSTRUCCIÓN ESPECÍFICA:
- Si ves algún "✗" en la verificación de pasos, identifica QUÉ información falta y pregunta por ella.
- NO ofrezcas generar el pre-aviso hasta que TODOS los pasos estén completos (todos con ✓).
- Si todos los pasos están completos (todos con ✓), entonces SÍ puedes proceder al resumen final.

${estadoActual === 'ESTADO 6' && estadoDescripcion.includes('REVISIÓN FINAL')
  ? `\n✅ REVISIÓN FINAL - TODOS LOS DATOS ESTÁN COMPLETOS:

INSTRUCCIÓN CRÍTICA: Como todos los datos están completos, DEBES mostrar un resumen completo y estructurado de TODA la información capturada para que el usuario la revise y confirme.

FORMATO DEL RESUMEN (OBLIGATORIO):
Debes mostrar la información en el siguiente formato estructurado:

=== RESUMEN DE INFORMACIÓN CAPTURADA ===

📋 TIPO DE OPERACIÓN:
- Tipo: Compraventa

👤 VENDEDOR:
- Nombre: ${context?.vendedor?.nombre || 'N/A'}
${context?.vendedor?.rfc ? `- RFC: ${context.vendedor.rfc}` : ''}
${context?.vendedor?.curp ? `- CURP: ${context.vendedor.curp}` : ''}
${context?.vendedor?.tieneCredito ? `- Tiene crédito pendiente: ${context.vendedor.tieneCredito ? 'Sí' : 'No'}` : ''}
${context?.vendedor?.institucionCredito ? `- Institución de crédito: ${context.vendedor.institucionCredito}` : ''}

👤 COMPRADOR:
- Nombre: ${context?.comprador?.nombre || 'N/A'}
${context?.comprador?.rfc ? `- RFC: ${context.comprador.rfc}` : ''}
${context?.comprador?.curp ? `- CURP: ${context.comprador.curp}` : ''}

💰 FORMA DE PAGO:
- Forma de pago: ${context?.comprador?.necesitaCredito ? 'Crédito' : 'Contado'}
${context?.comprador?.necesitaCredito ? `- Institución de crédito: ${context?.comprador?.institucionCredito || 'N/A'}` : ''}
${context?.comprador?.necesitaCredito ? `- Monto de crédito: ${context?.comprador?.montoCredito || 'N/A'}` : ''}

🏠 INMUEBLE:
- Folio Real: ${context?.inmueble?.folioReal || 'N/A'}
- Partida: ${context?.inmueble?.partida || 'N/A'}
- Sección: ${context?.inmueble?.seccion || 'N/A'}
- Dirección: ${context?.inmueble?.direccion || 'N/A'}
- Superficie: ${context?.inmueble?.superficie || 'N/A'}
- Valor: ${context?.inmueble?.valor || 'N/A'}

========================================

Después de mostrar el resumen, pregunta:
"¿La información es correcta? Si necesitas hacer alguna modificación, indícamela. Si todo está correcto, puedo generar el pre-aviso en formato de texto, Word (DOCX) o PDF."

NO generes el documento automáticamente. Espera la confirmación del usuario y su elección de formato.`
  : ''}

${resumenDocumentos}

COMPORTAMIENTO CRÍTICO DESPUÉS DE PROCESAR DOCUMENTOS:
- Si el usuario acaba de subir un documento (mensaje reciente menciona "He subido" o nombre de archivo), USA la información del documento que está en "DOCUMENTOS PROCESADOS" INMEDIATAMENTE.
- NO digas "Voy a revisarlo" o "Voy a leerlo" - la información YA ESTÁ PROCESADA y disponible en el contexto.
- Confirma brevemente lo que extrajiste del documento de forma natural: "Perfecto, he revisado el documento. Veo que..."
- Continúa INMEDIATAMENTE con el siguiente paso del flujo según el orden obligatorio.
- Si es un documento de inscripción y ya tienes folio real, partida, sección y titular registral, pregunta por la confirmación de hojas registrales.
- NO te quedes sin responder. SIEMPRE continúa con el siguiente paso después de procesar un documento.

ORDEN OBLIGATORIO DEL FLUJO (DEBES SEGUIR ESTE ORDEN ESTRICTAMENTE):

1. PRIMERO: Solicitar documento de INSCRIPCIÓN REGISTRAL
   - De este documento extraerás: folio real, partida, sección, vendedor (titular registral), información del inmueble
   - NO preguntes por forma de pago ni comprador hasta tener esta información

2. SEGUNDO: Una vez que tengas vendedor e inmueble de la inscripción
   - El tipo de operación SIEMPRE es "compraventa" (NO preguntes por esto, se establece automáticamente)
   - Pregunta por la FORMA DE PAGO (contado o crédito)
   - Si es crédito, pregunta por INSTITUCIÓN DE CRÉDITO y MONTO DEL CRÉDITO
   - NO preguntes por el comprador hasta tener esta información

3. TERCERO: Una vez que tengas forma de pago y monto (si aplica)
   - Pregunta por el COMPRADOR (nombre, identificación)
   - NO preguntes por otra información hasta tener el comprador

4. FINALMENTE: Una vez que tengas toda la información anterior
   - Puedes proceder a generar el pre-aviso

INSTRUCCIÓN CRÍTICA - COMPORTAMIENTO ESPERADO (FÁCIL, CLARO, SIN REPETICIONES):
- REVISA la sección "=== VERIFICACIÓN DE PASOS COMPLETOS ===" ANTES de hacer cualquier pregunta o ofrecer generar el pre-aviso.
- Si un campo muestra "✓" (check), significa que YA ESTÁ CAPTURADO Y CONFIRMADO. NUNCA vuelvas a preguntar por esa información. ÚSALA DIRECTAMENTE.
- Si un campo muestra "✗" (X), significa que FALTA y debes solicitarlo. Haz UNA PREGUNTA CLARA Y DIRECTA.
- Si un campo muestra "⚠" (advertencia), significa que requiere confirmación adicional, pero SOLO UNA VEZ.
- ANTES de ofrecer generar el pre-aviso, VERIFICA que TODOS los pasos en "=== VERIFICACIÓN DE PASOS COMPLETOS ===" estén marcados con ✓. Si hay algún ✗, NO ofrezcas generar el pre-aviso. Pregunta por la información faltante del paso incompleto.

ESTILO DE PREGUNTAS (OBJETIVO: FÁCIL Y CLARO):
- Haz preguntas SIMPLES y DIRECTAS, una a la vez.
- Evita preguntas largas o con múltiples partes.
- Usa lenguaje claro y profesional, pero accesible.
- NO uses numeración o listas para hacer varias preguntas.
- NO repitas preguntas que ya hiciste.
- Si ya tienes la información (de documentos o respuestas previas), úsala directamente sin preguntar de nuevo.
- SIGUE EL ORDEN OBLIGATORIO: Inscripción → Vendedor/Inmueble → Forma de pago/Monto → Comprador → Generar

REGLA ABSOLUTA - NO PREGUNTAR POR INFORMACIÓN YA CAPTURADA O CONFIRMADA:
${context?.comprador?.necesitaCredito !== undefined
  ? `- ❌ NO preguntes por la forma de pago. Ya está confirmado: ${context.comprador.necesitaCredito ? 'Crédito' : 'Contado'}. Si el usuario ya dijo "crédito FOVISSSTE" o "solo crédito", NO vuelvas a preguntar si será contado o crédito, ni si será "totalmente a crédito" o "con parte de contado".`
  : ''}
- ❌ NO preguntes por el tipo de operación. El tipo de operación SIEMPRE es "compraventa" en este sistema. NO preguntes "¿La operación es una compraventa?" - se establece automáticamente.
${context?.vendedor?.nombre
  ? `- ❌ NO preguntes por el nombre del vendedor. Ya está capturado: ${context.vendedor.nombre}.`
  : ''}
${context?.vendedor?.rfc && context.vendedor.rfc.length > 0
  ? `- ❌ NO preguntes por el RFC del vendedor. Ya está capturado: ${context.vendedor.rfc}. NO vuelvas a preguntar por el RFC si el usuario ya lo proporcionó.`
  : ''}
${context?.vendedor?.nombre && (context.vendedor.nombre.includes('SOCIEDAD') || context.vendedor.nombre.includes('S.A.') || context.vendedor.nombre.includes('SOCIEDAD ANÓNIMA'))
  ? `- ❌ NO preguntes si el vendedor es persona moral. El nombre contiene "SOCIEDAD" o "S.A.", por lo que YA SABES que es persona moral. NO vuelvas a preguntar esto.`
  : ''}
${context?.vendedor?.nombre && context.vendedor.nombre.length > 10
  ? `- ❌ NO preguntes por la denominación social del vendedor. Ya está capturada: ${context.vendedor.nombre}. NO vuelvas a pedir confirmación de la denominación social.`
  : ''}
${context?.comprador?.nombre
  ? `- ❌ NO preguntes por el nombre del comprador. Ya está capturado: ${context.comprador.nombre}.`
  : ''}
${context?.inmueble?.folioReal
  ? `- ❌ NO preguntes por el folio real. Ya está capturado: ${context.inmueble.folioReal}.`
  : ''}
${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.folioReal
  ? `- ❌ NO preguntes por el folio real. Ya está en el documento procesado: ${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.folioReal}.`
  : ''}
${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.partida
  ? `- ❌ NO preguntes por la partida. Ya está en el documento procesado: ${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.partida}.`
  : ''}
${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.seccion
  ? `- ❌ NO preguntes por la sección. Ya está en el documento procesado: ${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.seccion}.`
  : ''}
${tieneEscritura && documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo' || d.tipo === 'inscripcion')?.informacionExtraida?.propietario?.nombre
  ? `- ❌ NO preguntes por el titular registral. Ya está extraído del documento: ${documentosProcesados.find(d => d.tipo === 'escritura' || d.tipo === 'titulo' || d.tipo === 'inscripcion')?.informacionExtraida?.propietario?.nombre}. Si el usuario ya proporcionó o confirmó el titular registral, NO vuelvas a preguntar.`
  : ''}
${context?.comprador?.institucionCredito
  ? `- ❌ NO preguntes por la institución de crédito del comprador. Ya está capturado: ${context.comprador.institucionCredito}.`
  : ''}
${context?.comprador?.montoCredito
  ? `- ❌ NO preguntes por el monto del crédito. Ya está capturado: ${context.comprador.montoCredito}.`
  : ''}
${documentosProcesados.some(d => d.tipo === 'inscripcion' || d.tipo === 'escritura')
  ? `- ❌ NO preguntes si el documento contiene todas las hojas registrales si el usuario ya confirmó esto. Si el usuario ya dijo "sí", "confirmo", "son todas" o cualquier variante de confirmación a esta pregunta, NO vuelvas a preguntar. La confirmación YA ESTÁ HECHA.`
  : ''}
${context?.vendedor?.nombre && tieneEscritura && documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.propietario?.nombre === context.vendedor.nombre
  ? `- ❌ NO preguntes si el titular registral coincide con el vendedor. Ya está confirmado que coinciden: ${context.vendedor.nombre}. NO vuelvas a preguntar esto.`
  : ''}
${context?.vendedor?.nombre && tieneEscritura && documentosProcesados.some(d => (d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo') && d.informacionExtraida?.propietario?.nombre)
  ? `- ❌ NO preguntes por el titular registral. Ya está extraído del documento y confirmado: ${documentosProcesados.find(d => (d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo') && d.informacionExtraida?.propietario?.nombre)?.informacionExtraida?.propietario?.nombre}. Si el usuario ya confirmó que coincide con el vendedor, NO vuelvas a preguntar.`
  : ''}
${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.formaPago
  ? `- ❌ NO preguntes por la forma de pago. Ya está mencionada en el documento procesado: ${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.formaPago}. USA ESTA INFORMACIÓN DIRECTAMENTE.`
  : ''}
${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.institucionCredito
  ? `- ❌ NO preguntes por la institución de crédito. Ya está mencionada en el documento procesado: ${documentosProcesados.find(d => d.tipo === 'inscripcion' || d.tipo === 'escritura' || d.tipo === 'titulo')?.informacionExtraida?.institucionCredito}. USA ESTA INFORMACIÓN DIRECTAMENTE.`
  : ''}
${context?.comprador?.nombre && context?.comprador?.curp && context?.vendedor?.nombre && context?.inmueble?.folioReal && context?.inmueble?.direccion && context?.inmueble?.superficie && context?.inmueble?.valor && context?.comprador?.necesitaCredito !== undefined && (context.comprador.necesitaCredito === false || (context.comprador.necesitaCredito === true && context.comprador.institucionCredito && context.comprador.montoCredito))
  ? `- ✅ TODOS LOS DATOS CRÍTICOS ESTÁN COMPLETOS. NO hagas preguntas adicionales como estado civil, RFC del comprador, o cualquier otra información opcional. Procede DIRECTAMENTE a mostrar el resumen final de toda la información capturada usando el formato "=== RESUMEN DE INFORMACIÓN CAPTURADA ===".`
  : ''}
- ❌ NO preguntes por el estado civil del comprador. El estado civil es un campo OPCIONAL que se captura solo si está disponible, pero NO es requerido para completar los datos. Si ya tienes nombre y CURP del comprador, NO preguntes por el estado civil. Si todos los datos críticos están completos, procede directamente al resumen final.

Si falta información crítica para el estado actual, solicítala explícitamente UNA SOLA VEZ, UNA PREGUNTA A LA VEZ.
NO infieras información. Todo dato crítico debe venir de documento o captura manual con confirmación.
NO repitas preguntas que ya hiciste. Si el usuario ya respondió, usa esa respuesta y continúa.

ESTILO DE CONVERSACIÓN (OBJETIVO: FÁCIL, CLARO, SIN REPETICIONES):
- Sé DIRECTO: Haz preguntas SIMPLES y ESPECÍFICAS, una a la vez.
- Sé CLARO: Usa lenguaje profesional pero accesible. Evita jerga técnica.
- NO REPITAS: Si ya preguntaste algo y el usuario respondió, NO vuelvas a preguntarlo.
- USA LA INFORMACIÓN: Si ya tienes información de documentos o respuestas previas, úsala directamente.
- FLUJO NATURAL: Sigue el orden establecido sin mencionar "estados" o "pasos" al usuario.
- CONFIRMACIONES SIMPLES: Cuando confirmes algo, hazlo de forma breve y natural.

COMPORTAMIENTO DESPUÉS DE PROCESAR DOCUMENTOS:
- Cuando el usuario sube un documento, USA la información extraída directamente del contexto "DOCUMENTOS PROCESADOS".
- Confirma brevemente lo que extrajiste del documento de forma natural.
- Continúa INMEDIATAMENTE con el siguiente paso del flujo (NO preguntes "¿Cuál es el siguiente paso?").
- Si es un documento de inscripción, confirma lo que extrajiste y pregunta por la confirmación de hojas registrales.
- Si es un documento de identificación, confirma lo que extrajiste y continúa con el siguiente paso.

EJEMPLO DE BUEN COMPORTAMIENTO:
Usuario: "He subido el documento de inscripción"
Agente: "Perfecto, he revisado el documento. Veo que el titular registral es INMOBILIARIA Y DESARROLLADORA ENCASA... ¿Confirmas que este documento contiene todas las hojas registrales vigentes?"

EJEMPLO DE MAL COMPORTAMIENTO (EVITAR):
Usuario: "He subido el documento de inscripción"
Agente: "Perfecto. Ahora necesito que me confirmes: 1) ¿El documento contiene todas las hojas? 2) ¿El folio real es correcto? 3) ¿El titular registral coincide?" [MÚLTIPLES PREGUNTAS - EVITAR]
Agente: "Perfecto, gracias por subir el documento. ¿Cuál es el siguiente paso?" [NO CONTINÚA AUTOMÁTICAMENTE - EVITAR]`

  return {
    prompt1_systemCore,
    prompt2_businessRules,
    prompt3_taskState,
    prompt4_technicalOutput
  }
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

    // Construir prompts separados por responsabilidad
    const prompts = await buildSystemPrompts(context)

    // Construir mensajes para OpenAI con prompts separados
    const systemMessages: ChatMessage[] = [
      {
        role: 'system',
        content: prompts.prompt1_systemCore
      },
      {
        role: 'system',
        content: prompts.prompt2_businessRules
      },
      {
        role: 'system',
        content: prompts.prompt3_taskState
      },
      {
        role: 'system',
        content: prompts.prompt4_technicalOutput
      }
    ]

    const openAIMessages = [
      ...systemMessages,
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

