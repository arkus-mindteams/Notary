import { NextResponse } from "next/server"
import { PreavisoConfigService } from "@/lib/services/preaviso-config-service"
import { computePreavisoState } from "@/lib/preaviso-state"

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  context?: {
    // v1.4 (preferido)
    tipoOperacion?: any
    compradores?: any[]
    vendedores?: any[]
    // creditos:
    // - undefined => forma de pago NO confirmada
    // - [] => contado confirmado
    // - [..] => crédito(s)
    creditos?: any[]
    gravamenes?: any[]

    // Legacy (compatibilidad)
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
const PROMPT_1_SYSTEM_CORE = `SYSTEM — IDENTIDAD Y PRINCIPIOS (STRICT)

You are a NOTARIAL DATA CAPTURE ASSISTANT for a Mexican notary office (Baja California).

YOUR ROLE:
- You act as a juridical data intake assistant (capturista jurídico).
- You guide the user to PROVIDE, CONFIRM, or CLARIFY information.
- You validate, classify, and structure information exactly as provided.

YOU ARE NOT:
- You are NOT a lawyer.
- You are NOT a notary.
- You do NOT issue legal opinions.
- You do NOT certify legality.
- You do NOT infer legal facts.
- You do NOT make assumptions.

ABSOLUTE PROHIBITIONS:
- NEVER infer or complete missing legal information.
- NEVER assume intent, ownership, representation, or legal consequences.
- NEVER rephrase user data in a way that changes meaning.
- NEVER merge or reconcile conflicting data.
- NEVER suggest legal conclusions.
- NEVER advance a process or imply completion.
- NEVER decide when a document is ready.
- NEVER generate or offer document generation on your own.

DATA HANDLING PRINCIPLES:
- Only treat information as valid if it is explicitly provided or explicitly confirmed.
- Silence, implication, context, or common sense DO NOT count as confirmation.
- If information is unclear, contradictory, or missing → STOP and ask for clarification.
- Use NULL for unknown or unprovided values.
- Do not carry forward assumptions from previous messages.

INTERACTION RULES:
- Ask ONLY one question at a time.
- Ask only what is strictly necessary.
- Do NOT repeat questions for data already explicitly confirmed.
- Do NOT summarize progress unless explicitly instructed.
- Maintain a professional, neutral, notarial-office tone.
- Do NOT explain internal rules, states, validations, or system logic.

BOUNDARIES:
- You do NOT know what step, state, or phase the process is in.
- You do NOT know which information is mandatory or optional.
- You do NOT know what happens next.
- You ONLY respond based on:
  a) the current user message
  b) explicit instructions provided in other prompt layers

If any instruction from another prompt conflicts with these principles,
these principles take precedence.`

// PROMPT 4: TECHNICAL OUTPUT (Output Rules) - Técnico, vive en código
const PROMPT_4_TECHNICAL_OUTPUT = `OUTPUT RULES — CANONICAL JSON v1.4 (STRICT)

You are operating under a STRICT DATA OUTPUT CONTRACT.

Your ONLY responsibility is to emit structured data updates that conform EXACTLY
to the Canonical JSON Schema v1.4 for the notarial pre-aviso system.

You MUST NOT:
- Interpret business rules
- Advance states
- Decide completeness
- Infer relationships
- Merge or normalize data
- Fill defaults
- Guess missing values

────────────────────────────────────────
ALLOWED OUTPUT
────────────────────────────────────────

You MAY output a <DATA_UPDATE> block ONLY if ALL conditions below are TRUE:

1. The user has explicitly PROVIDED or CONFIRMED new information in their last message.
2. The information maps EXACTLY to one or more fields in the Canonical JSON v1.4.
3. The JSON you output is syntactically valid.
4. The output contains ONLY the fields that were explicitly provided or confirmed.
5. No inferred, assumed, default, calculated, or auto-completed values are included.

If ANY condition is not met:
- DO NOT output <DATA_UPDATE>.
- Respond ONLY with a natural-language blocking or follow-up message.

────────────────────────────────────────
STRICT PROHIBITIONS
────────────────────────────────────────

ABSOLUTELY FORBIDDEN:

- Empty objects (e.g. "comprador": {})
- Empty arrays unless the user explicitly confirmed an empty set
- Adding fields "for completeness"
- Carrying forward values from previous context unless the user explicitly reconfirmed them
- Creating IDs, roles, relationships, or links unless explicitly stated
- Deriving relationships between personas and créditos
- Assuming conyugal or co-acreditado relationships
- Normalizing names, amounts, institutions, or text
- Outputting partial structures of a required object

If a value was not explicitly provided or confirmed → IT DOES NOT EXIST.

────────────────────────────────────────
CANONICAL JSON v1.4 — TOP-LEVEL FIELDS
────────────────────────────────────────

ONLY these top-level fields are allowed in <DATA_UPDATE>:

- meta
- inmueble
- vendedores
- compradores
- creditos
- gravamenes
- control_impresion
- validaciones

Do NOT include any other fields.

────────────────────────────────────────
FIELD-SPECIFIC RULES
────────────────────────────────────────

INMUEBLE:
- Only include subfields explicitly provided or confirmed.
- DO NOT infer address completeness.
- partidas must be emitted ONLY if explicitly listed or confirmed by the user.
- all_registry_pages_confirmed may be TRUE only with explicit confirmation.

VENDEDORES / COMPRADORES:
- Emit as ARRAY ITEMS only.
- Each person must be explicitly introduced by the user.
- tipo_persona must be explicitly stated or confirmed.
- denominacion_social (persona moral) must match user-provided or CSF-confirmed value EXACTLY.
- estado_civil may be captured but MUST NOT trigger inference.

CREDITOS:
- Emit ONLY if the user explicitly states a credit exists.
- Each credit is an independent object.
- Multiple credits are allowed.
- Multiple institutions are allowed.
- A single person may appear in multiple credits ONLY if explicitly stated.
- participantes MUST be explicitly defined by the user (no assumptions).
- DO NOT infer coacreditados, conyugal relationships, or shared liability.

GRAVAMENES:
- Emit ONLY if explicitly mentioned or confirmed.
- No inference from credit presence.
- No default gravamen creation.

CONTROL_IMPRESION:
- Emit ONLY if explicitly configured by business logic or user confirmation.
- Defaults MUST NOT be assumed.

VALIDACIONES:
- Emit ONLY boolean flags explicitly set by system logic.
- DO NOT flip bloqueado or datos_completos unless explicitly instructed by system context.

────────────────────────────────────────
BLOCKED STATE BEHAVIOR
────────────────────────────────────────

If the system is in a BLOCKED state (missing data, conflict, ambiguity):

- DO NOT output <DATA_UPDATE>.
- Respond ONLY with a blocking message explaining:
  - What specific data is missing or conflicting
  - Why it is required
  - What the user must do next

DO NOT mix narrative text with structured output.

────────────────────────────────────────
FORMAT RULES
────────────────────────────────────────

- <DATA_UPDATE> must be the ONLY structured output.
- No markdown.
- No explanations.
- No comments.
- No trailing commas.
- JSON must be strictly valid.

VALID EXAMPLE:

<DATA_UPDATE>
{
  "creditos": [
    {
      "institucion": "FOVISSSTE",
      "monto": "1500000",
      "participantes": [
        {
          "rol": "acreditado",
          "persona_ref": "comprador_1"
        }
      ]
    }
  ]
}
</DATA_UPDATE>

INVALID EXAMPLES (DO NOT DO THIS):

- Including empty arrays or objects
- Including inferred participants
- Including fields not explicitly confirmed
- Including previous context data
- Mixing text with <DATA_UPDATE>

────────────────────────────────────────
LANGUAGE
────────────────────────────────────────

Respond ALWAYS in Spanish.
Use professional, neutral, notarial tone.
Guide the user step by step when blocked, but NEVER output data unless explicitly allowed above.`

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
  state: {
    current_state: string
    state_status: Record<string, string>
    required_missing: string[]
    blocking_reasons: string[]
    allowed_actions: string[]
  }
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

  // Calcular estado (fuente de verdad) y valores derivados compartidos
  const computed = computePreavisoState(context)
  const {
    documentosProcesados,
    docInscripcion,
    infoInscripcion,
    creditosProvided,
    necesitaCredito,
    compradores,
    capturedData,
  } = computed.derived
  const { current_state: currentState, required_missing: requiredMissing, blocking_reasons: blockingReasons, allowed_actions: allowedActions } = computed.state

  // Construir PROMPT 3 (TASK / STATE) — FLOW CONTROL ONLY (estructura solicitada)
  const expedienteNotice =
    context?.expedienteExistente
      ? `EXPEDIENTE EXISTENTE NOTICE:\n- compradorNombre: ${context.expedienteExistente.compradorNombre}\n- tieneExpedientes: ${context.expedienteExistente.tieneExpedientes}\n- cantidadTramites: ${context.expedienteExistente.cantidadTramites}`
      : `EXPEDIENTE EXISTENTE NOTICE:\n- (none)`
  const anyBuyerCasado = computed.derived.anyBuyerCasado

  const prompt3_taskState = `=== PROMPT 3: TASK / STATE ===
DYNAMIC CONTEXT — FLOW CONTROL ONLY

This prompt provides the CURRENT SESSION CONTEXT.
It defines WHAT to ask NEXT and WHEN to STOP.
It does NOT define legal rules or output format.

IMPORTANT:
- This prompt is INTERNAL ONLY.
- NEVER mention states, steps, JSON, or internal logic to the user.
- Speak naturally as a notarial assistant.

────────────────────────────────────────
CURRENT CONTEXT (DYNAMIC)
────────────────────────────────────────

${expedienteNotice}

CURRENT FLOW STATUS (INTERNAL REFERENCE ONLY):
- current_state: ${currentState}
- allowed_actions:
${allowedActions.map(a => `  - ${a}`).join('\n')}

BLOCKING (STOP IF ANY):
- blocking_reasons:
${blockingReasons.length > 0 ? blockingReasons.map(r => `  - ${r}`).join('\n') : '  - (none)'}

MISSING (ASK ONE FIELD ONLY):
- required_missing:
${requiredMissing.length > 0 ? requiredMissing.map(f => `  - ${f}`).join('\n') : '  - (none)'}

CAPTURED INFORMATION (SOURCE OF TRUTH):
${JSON.stringify(capturedData, null, 2)}

────────────────────────────────────────
GLOBAL FLOW ORDER (MANDATORY)
────────────────────────────────────────

1. REGISTRY & PROPERTY (incluye titular registral detectado)
2. SELLER (TITULAR REGISTRAL / VENDEDOR)
3. PAYMENT METHOD
4. BUYERS
5. MARITAL DECISION (IF APPLICABLE)
6. CREDITS (ITERATIVE)
7. ENCUMBRANCES / FINAL CHECK
8. GENERATION

DO NOT skip steps.
DO NOT reorder steps.

────────────────────────────────────────
STEP 1 — REGISTRY & PROPERTY
────────────────────────────────────────

registry_document_processed: ${docInscripcion ? 'true' : 'false'}
all_registry_pages_confirmed: ${capturedData?.inmueble?.all_registry_pages_confirmed === true ? 'true' : 'false'}

If registry document not processed:
- Request registry document upload.
- STOP.

If registry document processed:
- Use extracted data immediately.
- If the user confirms they reviewed all pages, capture it (inmueble.all_registry_pages_confirmed = true).
- This confirmation is helpful but MUST NOT block progression.
- Capture missing property data ONE FIELD AT A TIME:
  - address (inmueble.direccion.*)
  - surface (inmueble.superficie)
  - value (inmueble.valor) — OPTIONAL (do not block if missing)
  - cadastral data (inmueble.datos_catastrales.*) if required

────────────────────────────────────────
STEP 2 — SELLER (TITULAR REGISTRAL / VENDEDOR)
────────────────────────────────────────

titular_registral_detected: ${computed.derived.titularRegistral ? 'true' : 'false'}
titular_registral_name: ${computed.derived.titularRegistral ? JSON.stringify(computed.derived.titularRegistral) : 'null'}
vendedor_capturado_en_contexto: ${computed.derived.vendedores?.length > 0 ? 'true' : 'false'}
vendedor_nombre_capturado: ${computed.derived.vendedorNombre ? JSON.stringify(computed.derived.vendedorNombre) : 'null'}

RULES:
- If titular registral was detected from the registry document, DO NOT ask the user to type it from zero.
- If seller name is already captured in the session context, DO NOT ask the user to type it from zero.
- Ask the user to CONFIRM the name (verbatim) and specify tipo_persona (persona_fisica/persona_moral).
- Ask ONLY one question; phrase it so the user can answer both confirmation + tipo_persona in one reply.

MANDATORY QUESTION (ONE QUESTION ONLY):
If titular_registral_detected == true:
"En la hoja de inscripción aparece como titular registral: {titular_registral_name}. ¿Confirmas que es correcto y me indicas si es persona física o persona moral?"

If titular_registral_detected == false AND vendedor_nombre_capturado != null:
"Tengo capturado como posible vendedor: {vendedor_nombre_capturado}. ¿Confirmas que es el titular registral y me indicas si es persona física o persona moral?"

If titular_registral_detected == false:
- Request the seller's full name as per registry + ask tipo_persona.
- STOP.

BLOCKING:
- Do NOT proceed until seller name is explicitly confirmed AND tipo_persona is provided.

────────────────────────────────────────
STEP 3 — PAYMENT METHOD
────────────────────────────────────────

payment_confirmed: ${creditosProvided ? 'true' : 'false'}
credit_required: ${necesitaCredito === true ? 'true' : necesitaCredito === false ? 'false' : 'unknown'}

Ask explicitly (ONE QUESTION ONLY):
"¿La compraventa será de contado o con crédito?"

WAIT for response.

If credit == false:
- Skip STEP 5 (Credits)
- Continue to STEP 3

If credit == true:
- Enable credit flow
- Continue to STEP 3

────────────────────────────────────────
STEP 4 — BUYERS
────────────────────────────────────────

buyers_count: ${compradores.length}

If buyers_count > 0 and buyer[0] already has a detected name and tipo_persona in CAPTURED INFORMATION:
- DO NOT ask the user to type the name again.
- Ask the user to CONFIRM the detected buyer (yes/no) and (if missing) confirm tipo_persona.
- If confirmed and tipo_persona == persona_fisica, ask estado_civil next.

If buyers_count == 0:
- Capture buyers ONE BY ONE.

For EACH buyer:
- Ask full name as per official ID
- Ask tipo_persona (persona_fisica / persona_moral)

If persona_fisica:
- Ask estado_civil

After first buyer ask explicitly:
"¿Habrá otro comprador o participante?"

BLOCKING:
- Do NOT proceed without at least one buyer.

────────────────────────────────────────
STEP 5 — MARITAL DECISION (CRITICAL BRANCH)
────────────────────────────────────────

marital_decision_required: ${anyBuyerCasado ? 'true' : 'false'}

If ANY buyer.tipo_persona == persona_fisica AND buyer.estado_civil == casado:
ASK explicitly (ONE QUESTION ONLY):
"¿La operación o el crédito se realizará de manera conjunta con su cónyuge?"

WAIT for explicit answer.

If answer == NO:
- Do NOT capture spouse
- Do NOT ask marital regime
- Continue to STEP 5

If answer == YES:
- Capture spouse as a NEW persona (only after explicit YES)
- Ask spouse full name and identification
- Ask spouse role explicitly: comprador | coacreditado | otro (specify)

BLOCKING:
- Do NOT proceed until this question is answered.

────────────────────────────────────────
STEP 6 — CREDITS (ITERATIVE — STRICT)
────────────────────────────────────────

If credit == false:
- Skip this step entirely.
- Continue to STEP 6.

If credit == true:

creditos[] is captured in Canonical JSON.

REPEAT for EACH credit (ASK ONLY WHAT IS MISSING):
1) Ask institution name (creditos[i].institucion)
2) Ask participants in THIS credit (creditos[i].participantes):
   - Reference existing personas when possible (e.g., buyer[0])
   - Define role explicitly: acreditado | coacreditado
3) credit amount (creditos[i].monto) is OPTIONAL (may be null if user does not have it)
4) credit type (creditos[i].tipo_credito) is OPTIONAL — do NOT ask unless the user offers it or it is explicitly missing by required_missing

RULES:
- NEVER assume shared credits
- NEVER infer participants
- NEVER merge credits

DEFAULT (to avoid unnecessary questions):
- If there is exactly one buyer and the user says "solo el comprador", register that buyer as the acreditado by default.

After completing one credit ask explicitly:
"¿Existe algún otro crédito adicional?"

BLOCKING:
- Do NOT proceed until current credit has institution + at least one participant (monto/tipo_credito do NOT block).

────────────────────────────────────────
STEP 7 — ENCUMBRANCES / FINAL CHECK
────────────────────────────────────────

Only ask about encumbrances if:
- the registry indicates encumbrance, OR
- gravamenes[] already exists, OR
- the seller explicitly confirms there is a mortgage/encumbrance to cancel.

If cancellation required and not confirmed:
- STOP

────────────────────────────────────────
STEP 8 — GENERATION
────────────────────────────────────────

Before generation:
- Verify ALL required data is complete.
- No blocking conditions active.

If complete:
- Do NOT ask additional questions.
`

  return {
    prompt1_systemCore,
    prompt2_businessRules,
    prompt3_taskState,
    prompt4_technicalOutput,
    state: computed.state
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
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || ''

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

    // Construir mensajes completos: system messages + user messages
    const openAIMessages: ChatMessage[] = [
      ...systemMessages,
      ...messages
    ]

    // Llamar a OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: openAIMessages,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[api/ai/preaviso-chat] OpenAI error:', errorData)
      return NextResponse.json(
        { error: 'openai_error', message: errorData.error?.message || 'Error al procesar la solicitud' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const assistantMessage = data.choices[0]?.message?.content || ''

    // Extraer datos actualizados del mensaje del asistente
    const updatedData = extractDataFromMessage(assistantMessage, context)

    // Aplicar actualizaciones deterministas basadas en el input del usuario (para evitar loops cuando el LLM no emite DATA_UPDATE)
    const deterministicUpdate = applyDeterministicUserInputUpdate(lastUserMessage, context, updatedData)
    const mergedUpdate = mergeContextUpdates(updatedData, deterministicUpdate)

    // Recalcular estado "server-truth" con el contexto actualizado (si hay cambios)
    const nextContext = mergedUpdate ? { ...(context || {}), ...(mergedUpdate || {}) } : (context || {})
    const next = await buildSystemPrompts(nextContext)

    const strippedAssistant = assistantMessage.replace(/<DATA_UPDATE>[\s\S]*<\/DATA_UPDATE>/g, '').trim()
    const isPureDataUpdate = /<DATA_UPDATE>[\s\S]*<\/DATA_UPDATE>/.test(assistantMessage) && strippedAssistant.length === 0
    // "Ack" robusto: algunos modelos agregan frases extra o encabezados. Mientras no haya pregunta, considerarlo ack.
    const looksLikeAck =
      strippedAssistant.length === 0 ||
      /\binformaci[oó]n registrada\b/i.test(strippedAssistant) ||
      /^gracias\b/i.test(strippedAssistant) ||
      /\bgracias por la aclaraci[oó]n\b/i.test(strippedAssistant)
    const isAckOnly = looksLikeAck && !/[¿?]/.test(strippedAssistant) && strippedAssistant.length < 180

    const followUp = buildDeterministicFollowUp(next.state, nextContext)

    // Detectar si el asistente YA está solicitando datos/confirmación aunque no use signos "¿?"
    // Esto evita duplicar preguntas (ej. "Por favor indícame..." seguido de un follow-up determinista).
    const assistantAlreadyAsks =
      /[¿?]/.test(strippedAssistant) ||
      /\b(por\s+favor|porfavor)\b/i.test(strippedAssistant) ||
      /\b(ind[ií]ca(me|nos)|dime|confirma(s|r)?|necesito|requiero|responde)\b/i.test(strippedAssistant) ||
      /:\s*\n-\s+/m.test(strippedAssistant) // lista de campos solicitados

    const shouldAddFollowUp = !!followUp && !assistantAlreadyAsks && (mergedUpdate || isAckOnly || isPureDataUpdate)

    return NextResponse.json({
      message: assistantMessage,
      messages: shouldAddFollowUp ? [assistantMessage, followUp] : undefined,
      data: mergedUpdate,
      state: next.state
    })
  } catch (error: any) {
    console.error('[api/ai/preaviso-chat] Error:', error)
    return NextResponse.json(
      { error: 'internal_error', message: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

function mergeContextUpdates(a: any, b: any): any {
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  // b tiene prioridad sobre a
  return { ...a, ...b }
}

function applyDeterministicUserInputUpdate(userTextRaw: string, context: any, parsedUpdate: any): any | null {
  const userText = (userTextRaw || '').trim()
  if (!userText) return null

  // Usar el contexto más reciente disponible para decidir (context + parsedUpdate si existe)
  const baseContext = parsedUpdate ? { ...(context || {}), ...(parsedUpdate || {}) } : (context || {})
  const computed = computePreavisoState(baseContext)
  const currentState = computed.state.current_state
  const missing: string[] = computed.state.required_missing || []
  const ss: Record<string, string> = computed.state.state_status || {}
  const blocking: string[] = Array.isArray(computed.state.blocking_reasons) ? computed.state.blocking_reasons : []

  // Helper: detectar confirmación simple
  const isConfirm = /^(sí|si|confirmo|confirmado|correcto|afirmativo|de acuerdo)\b/i.test(userText) || /\bconfirmo\b/i.test(userText)
  const mentionsPM = /\bpersona\s+moral\b/i.test(userText) || /\bempresa\b/i.test(userText)
  const mentionsPF = /\bpersona\s+f[ií]sica\b/i.test(userText)

  // Helper: detectar estado civil (persona física)
  const estadoCivilMatch = userText.match(/\b(solter[oa]|casad[oa]|divorciad[oa]|viud[oa])\b/i)
  const normalizedEstadoCivil =
    estadoCivilMatch
      ? (estadoCivilMatch[1].toLowerCase().startsWith('solter')
          ? 'soltero'
          : estadoCivilMatch[1].toLowerCase().startsWith('casad')
            ? 'casado'
            : estadoCivilMatch[1].toLowerCase().startsWith('divorc')
              ? 'divorciado'
              : 'viudo')
      : null

  // 0.5) Corrección explícita del comprador: "el comprador debe ser X" / "el comprador es X"
  // Esto evita que se quede un comprador equivocado en contexto cuando el usuario corrige.
  const compradorNameMatch =
    userText.match(/\bel\s+comprador\s+(?:debe\s+de\s+ser|debe\s+ser|es)\s+(.+?)\s*$/i) ||
    userText.match(/\bcomprador\s*:\s*(.+?)\s*$/i)
  if (compradorNameMatch && compradorNameMatch[1]) {
    const nombre = compradorNameMatch[1].trim().replace(/^["“]|["”]$/g, '')
    if (nombre.length >= 6) {
      const compradores = Array.isArray(baseContext?.compradores) ? [...baseContext.compradores] : []
      const c0 = compradores[0] || { party_id: null, tipo_persona: null }
      compradores[0] = {
        ...c0,
        // No forzar tipo_persona aquí si no está ya confirmado; pero si ya es persona_fisica, conservar.
        tipo_persona: c0?.tipo_persona || 'persona_fisica',
        persona_fisica: {
          ...(c0?.persona_fisica || {}),
          nombre,
        },
      }
      return { compradores }
    }
  }

  // 0) Confirmación explícita de titular registral (aunque el usuario solo responda "sí")
  // Si el backend está bloqueado por falta/mismatch de titular y el usuario confirma, marcar el vendedor como titular confirmado.
  if (
    isConfirm &&
    currentState === 'ESTADO_3' &&
    (blocking.includes('titular_registral_missing') || blocking.includes('vendedor_titular_mismatch'))
  ) {
    const vendedores = Array.isArray(baseContext?.vendedores) ? [...baseContext.vendedores] : []
    const vendedor0 = vendedores[0]
    const nombre =
      vendedor0?.persona_fisica?.nombre ||
      vendedor0?.persona_moral?.denominacion_social ||
      computed.derived?.titularRegistral ||
      null

    if (nombre && vendedor0) {
      const updatedVendedor = {
        ...vendedor0,
        titular_registral_confirmado: true,
      }
      const nextVendedores = [updatedVendedor, ...vendedores.slice(1)]
      return { vendedores: nextVendedores }
    }
  }

  // 1) Confirmación de vendedor + tipo_persona (evita que se pregunte dos veces)
  // Nota: no amarrar estrictamente a currentState, porque el modelo a veces pregunta fuera de orden.
  // Si detectamos "persona moral/física" + confirmación, y ESTADO_3 está incompleto o falta tipo_persona, aplicar.
  const sellerNeedsTipoPersona =
    missing.includes('vendedores[].tipo_persona') ||
    ss['ESTADO_3'] === 'incomplete' ||
    currentState === 'ESTADO_3'

  if (sellerNeedsTipoPersona && isConfirm && (mentionsPM || mentionsPF)) {
    const isPM = mentionsPM
    const isPF = mentionsPF

    const vendedores = Array.isArray(baseContext?.vendedores) ? [...baseContext.vendedores] : []
    const vendedor0 = vendedores[0]
    const nombre =
      vendedor0?.persona_fisica?.nombre ||
      vendedor0?.persona_moral?.denominacion_social ||
      computed.derived?.titularRegistral ||
      null

    if (nombre) {
      const updatedVendedor = {
        ...(vendedor0 || {}),
        // bandera explícita (no-legal) para indicar que el usuario confirmó que este vendedor es el titular registral
        titular_registral_confirmado: true,
        tipo_persona: isPM ? 'persona_moral' : 'persona_fisica',
        persona_fisica: isPM
          ? undefined
          : {
              ...(vendedor0?.persona_fisica || {}),
              nombre: nombre,
            },
        persona_moral: isPM
          ? {
              ...(vendedor0?.persona_moral || {}),
              denominacion_social: nombre,
            }
          : undefined,
      }
      const nextVendedores = vendedores.length > 0 ? [updatedVendedor, ...vendedores.slice(1)] : [updatedVendedor]
      return { vendedores: nextVendedores }
    }
  }

  // 2) Forma de pago (si el usuario contesta directo "crédito"/"contado" y aún no está confirmado)
  // Nota: también no amarrar estrictamente a currentState para evitar resets.
  const creditosProvided = baseContext?.creditos !== undefined
  if (!creditosProvided) {
    const saysContado = /\bcontado\b/i.test(userText)
    const saysCredito = /\bcr[eé]dito\b/i.test(userText) || /\bhipoteca\b/i.test(userText) || /\binfonavit\b/i.test(userText) || /\bfovissste\b/i.test(userText)
    if (saysContado) return { creditos: [] }
    if (saysCredito) {
      return {
        creditos: [
          {
            credito_id: null,
            institucion: null,
            monto: null,
            participantes: [],
            tipo_credito: null,
          },
        ],
      }
    }
  }

  // 2.6) Estado civil del comprador (persona física) — capturar aunque el modelo no emita <DATA_UPDATE>
  // Evita loops en ESTADO_4 cuando el usuario ya respondió "soltero/casado/etc.".
  if (normalizedEstadoCivil) {
    const compradores = Array.isArray(baseContext?.compradores) ? [...baseContext.compradores] : []
    const c0 = compradores[0]
    const tipo = c0?.tipo_persona
    const nombre = c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social
    const estadoActual = c0?.persona_fisica?.estado_civil || null
    const needsEstadoCivil =
      missing.includes('compradores[0].persona_fisica.estado_civil') ||
      ss['ESTADO_4'] === 'incomplete' ||
      currentState === 'ESTADO_4'

    if (needsEstadoCivil && (tipo === 'persona_fisica' || (!tipo && nombre))) {
      if (!estadoActual || estadoActual.toLowerCase() !== normalizedEstadoCivil) {
        const base = c0 || { party_id: null, tipo_persona: 'persona_fisica' }
        compradores[0] = {
          ...base,
          tipo_persona: base?.tipo_persona || 'persona_fisica',
          persona_fisica: {
            ...(base?.persona_fisica || {}),
            estado_civil: normalizedEstadoCivil,
          },
        }
        return { compradores }
      }
    }
  }

  // 2.1) Institución de crédito (si ya existe un crédito placeholder)
  if (Array.isArray(baseContext?.creditos) && baseContext.creditos.length > 0) {
    const institucionesComunes = ['FOVISSSTE', 'INFONAVIT', 'BBVA', 'BANCOMER', 'SANTANDER', 'BANORTE', 'HSBC', 'SCOTIABANK', 'BANAMEX']
    const found = institucionesComunes.find(i => new RegExp(`\\b${i}\\b`, 'i').test(userText))
    if (found) {
      const c0 = baseContext.creditos[0]
      return { creditos: [{ ...c0, institucion: found }, ...baseContext.creditos.slice(1)] }
    }
  }

  // 2.2) Participantes del crédito: "solo el comprador"
  if (/\bsolo\b/i.test(userText) && /\bcomprador\b/i.test(userText) && Array.isArray(baseContext?.creditos) && baseContext.creditos.length > 0) {
    const comprador0 = baseContext?.compradores?.[0]
    const personaId = comprador0?.party_id || 'comprador_1'
    const c0 = baseContext.creditos[0]
    return {
      creditos: [
        {
          ...c0,
          participantes: [{ party_id: personaId, rol: 'acreditado' }],
        },
        ...baseContext.creditos.slice(1),
      ],
    }
  }

  // 2.3) Rol en crédito: "titular" => acreditado
  if (/\btitular\b/i.test(userText) && Array.isArray(baseContext?.creditos) && baseContext.creditos.length > 0) {
    const c0 = baseContext.creditos[0]
    const participantes = Array.isArray(c0?.participantes) ? [...c0.participantes] : []
    if (participantes.length > 0) {
      participantes[0] = { ...participantes[0], rol: 'acreditado' }
      return { creditos: [{ ...c0, participantes }, ...baseContext.creditos.slice(1)] }
    }
  }

  // 2.4) Rol en crédito: respuesta directa "acreditado" / "coacreditado"
  if (
    /^(acreditado|coacreditado)\b/i.test(userText) &&
    Array.isArray(baseContext?.creditos) &&
    baseContext.creditos.length > 0
  ) {
    const c0 = baseContext.creditos[0]
    const participantes = Array.isArray(c0?.participantes) ? [...c0.participantes] : []
    if (participantes.length > 0 && !participantes[0]?.rol) {
      const rol = /^coacreditado\b/i.test(userText) ? 'coacreditado' : 'acreditado'
      participantes[0] = { ...participantes[0], rol }
      return { creditos: [{ ...c0, participantes }, ...baseContext.creditos.slice(1)] }
    }
  }

  // 2.5) Tipo de crédito (opcional): si el usuario lo proporciona, capturarlo para evitar repreguntas
  if (Array.isArray(baseContext?.creditos) && baseContext.creditos.length > 0) {
    const c0 = baseContext.creditos[0]
    if (!c0?.tipo_credito) {
      const tipoMatch = userText.match(/\b(hipotecario|bancario|infonavit|fovissste|cofinavit)\b/i)
      if (tipoMatch) {
        return { creditos: [{ ...c0, tipo_credito: tipoMatch[1].toLowerCase() }, ...baseContext.creditos.slice(1)] }
      }
    }
  }

  // 4) Confirmación de revisión de hojas registrales (no bloqueante pero evita loops)
  if (/\b(ya\s+las\s+revis(e|é)|ya\s+se\s+revisaron\s+todas|ya\s+se\s+revisaron)\b/i.test(userText)) {
    const inmueble = baseContext?.inmueble || {}
    return { inmueble: { ...inmueble, all_registry_pages_confirmed: true } }
  }

  // 5) Gravámenes / hipoteca (PASO 6): evitar reinicios capturando respuestas típicas aunque el LLM no emita DATA_UPDATE
  const inEncumbrancePhase =
    currentState === 'ESTADO_6' || (ss['ESTADO_6'] === 'pending' || ss['ESTADO_6'] === 'incomplete')

  if (inEncumbrancePhase) {
    const vendedores = Array.isArray(baseContext?.vendedores) ? [...baseContext.vendedores] : []
    const vendedor0 = vendedores[0]
    const saysNo = /^(no|no\.?)$/i.test(userText) || /\bno\b/i.test(userText)
    const saysCancelada = /\bcancelad[ao]\b/i.test(userText)
    const saysVigente = /\bvigent[ea]\b/i.test(userText)
    const saysYes = /^(sí|si)\b/i.test(userText)

    // Caso: "no" => no hay hipoteca/gravamen por cancelar
    if (saysNo && !saysCancelada && !saysVigente) {
      return {
        gravamenes: [],
        vendedores: vendedor0 ? [{ ...vendedor0, tiene_credito: false }, ...vendedores.slice(1)] : vendedores,
      }
    }

    // Caso: "está cancelada" => capturar un gravamen ya cancelado/confirmado
    if (saysCancelada) {
      return {
        gravamenes: [
          {
            gravamen_id: null,
            tipo: 'hipoteca',
            institucion: null,
            numero_credito: null,
            cancelacion_confirmada: true,
          },
        ],
        vendedores: vendedor0 ? [{ ...vendedor0, tiene_credito: true }, ...vendedores.slice(1)] : vendedores,
      }
    }

    // Caso: confirmación simple "sí" cuando está pendiente cancelacion_confirmada
    if (saysYes && Array.isArray(baseContext?.gravamenes) && baseContext.gravamenes.length > 0) {
      const g0 = baseContext.gravamenes[0]
      if (g0?.cancelacion_confirmada !== true) {
        const nextG = [{ ...g0, cancelacion_confirmada: true }, ...baseContext.gravamenes.slice(1)]
        return { gravamenes: nextG }
      }
    }
  }

  // 3) Crédito del vendedor (tiene_credito) — si el usuario contesta explícitamente
  // Ej: "no tiene ninguno", "no tiene crédito", "sí tiene crédito puente"
  if (Array.isArray(baseContext?.vendedores) && baseContext.vendedores.length > 0) {
    const vendedor0 = baseContext.vendedores[0]
    const asksCreditoVendedor = /\bcr[eé]dito\b/i.test(userText) || /\bcr[eé]dito puente\b/i.test(userText) || /\bhipoteca\b/i.test(userText) || /\bno tiene ninguno\b/i.test(userText)
    if (asksCreditoVendedor) {
      const saysNo = /\bno\b/i.test(userText) && (/\btiene\b/i.test(userText) || /\bcr[eé]dito\b/i.test(userText) || /\bningun[oa]?\b/i.test(userText))
      const saysYes = /\bs[ií]\b/i.test(userText) && /\btiene\b/i.test(userText)
      if (saysNo || /no tiene ninguno/i.test(userText)) {
        return { vendedores: [{ ...vendedor0, tiene_credito: false }, ...baseContext.vendedores.slice(1)] }
      }
      if (saysYes) {
        return { vendedores: [{ ...vendedor0, tiene_credito: true }, ...baseContext.vendedores.slice(1)] }
      }
    }
  }

  return null
}

function buildDeterministicFollowUp(state: any, context: any): string | null {
  if (!state) return null
  const missing: string[] = Array.isArray(state.required_missing) ? state.required_missing : []
  const ss: Record<string, string> = state.state_status || {}
  const current = state.current_state as string | undefined
  const blocking: string[] = Array.isArray(state.blocking_reasons) ? state.blocking_reasons : []

  // Si ya está listo para generación, NO preguntar más: orientar al usuario a los botones de exportación.
  if (current === 'ESTADO_8' || ss['ESTADO_8'] === 'ready') {
    return 'Listo: ya quedó capturada la información necesaria. Puedes ver el documento o descargarlo usando los botones de arriba (Ver Texto / Descargar Word / Descargar PDF).'
  }

  // Si por cualquier razón current_state no trae missing, selecciona el siguiente estado pendiente por state_status.
  const pickNextByStatus = (): string | null => {
    if (current === 'ESTADO_8') return null
    const isDone = (k: string) => ss[k] === 'completed' || ss[k] === 'not_applicable'
    if (!isDone('ESTADO_2')) return 'ESTADO_2'
    if (!isDone('ESTADO_3')) return 'ESTADO_3'
    if (!isDone('ESTADO_1')) return 'ESTADO_1'
    if (!isDone('ESTADO_4')) return 'ESTADO_4'
    if (ss['ESTADO_5'] === 'incomplete' || ss['ESTADO_5'] === 'pending') return 'ESTADO_5'
    if (ss['ESTADO_6'] === 'incomplete' || ss['ESTADO_6'] === 'pending') return 'ESTADO_6'
    return null
  }

  const s = current || pickNextByStatus()
  if (!s) return null
  const askOne = (q: string) => q

  // Vendedor (confirmación + tipo persona)
  if (s === 'ESTADO_3') {
    if (blocking.includes('titular_registral_missing')) {
      return askOne('No logro ver el titular registral en la inscripción. ¿Me indicas el nombre del titular registral tal como aparece y si es persona física o persona moral?')
    }
    if (blocking.includes('vendedor_titular_mismatch')) {
      return askOne('Detecto una posible diferencia entre el titular registral del documento y el vendedor capturado. ¿Confirmas cuál es el titular registral exacto tal como aparece en la inscripción y si es persona física o persona moral?')
    }
    const vendedor = context?.vendedores?.[0]
    const nombre = vendedor?.persona_fisica?.nombre || vendedor?.persona_moral?.denominacion_social || null
    if (nombre && missing.includes('vendedores[].tipo_persona')) {
      return askOne(`Tengo capturado como posible vendedor: "${nombre}". ¿Confirmas que es el titular registral y me indicas si es persona física o persona moral?`)
    }
    if (missing.includes('vendedores[]')) {
      return askOne('Por favor indícame el nombre completo del titular registral (vendedor) tal como aparece en la inscripción y si es persona física o persona moral.')
    }
    if (missing.includes('vendedores[].tipo_persona')) {
      return askOne('¿El vendedor (titular registral) es persona física o persona moral?')
    }
    // Si ya no falta nada en ESTADO_3 pero el current_state no avanzó, sigue al siguiente por state_status:
    const next = pickNextByStatus()
    if (next && next !== 'ESTADO_3') return buildDeterministicFollowUp({ ...state, current_state: next }, context)
  }

  // Forma de pago
  if (s === 'ESTADO_1') {
    return askOne('¿La compraventa será de contado o con crédito?')
  }

  // Registro/inmueble (pedir un campo a la vez)
  if (s === 'ESTADO_2') {
    const order = ['inmueble.folio_real', 'inmueble.partidas', 'inmueble.direccion', 'inmueble.superficie']
    const nextMissing = order.find(f => missing.includes(f)) || missing[0]
    if (nextMissing === 'inmueble.partidas') return askOne('Por favor indícame las partidas de inscripción tal como aparecen en la hoja registral (pueden ser una o varias).')
    if (nextMissing === 'inmueble.folio_real') return askOne('¿Cuál es el folio real del inmueble tal como aparece en la inscripción?')
    if (nextMissing === 'inmueble.direccion') return askOne('¿Cuál es la dirección del inmueble (calle, número, colonia, municipio/estado) tal como aparece o como la confirmas?')
    if (nextMissing === 'inmueble.superficie') return askOne('¿Cuál es la superficie del inmueble tal como aparece en la inscripción?')
  }

  // Compradores
  if (s === 'ESTADO_4') {
    const comprador0 = context?.compradores?.[0]
    const nombre =
      comprador0?.persona_fisica?.nombre ||
      comprador0?.persona_moral?.denominacion_social ||
      null
    const tipo = comprador0?.tipo_persona || null

    if (nombre && tipo) {
      // Ya está capturado: no pedirlo de nuevo; pedir lo siguiente.
      if (tipo === 'persona_fisica' && missing.includes('compradores[0].persona_fisica.estado_civil')) {
        return askOne(`¿Me indicas el estado civil de ${nombre}? (soltero, casado, divorciado o viudo)`)
      }
      // Si ya hay estado_civil o es persona moral, continuar a créditos o siguiente paso.
      return askOne('Continuamos. ¿La compraventa será de contado o con crédito?')
    }

    // Falta algo esencial del comprador: pedir confirmación si hay nombre pero falta tipo, si no pedir ambos.
    if (nombre && !tipo) {
      return askOne(`Tengo capturado como comprador: "${nombre}". ¿Confirmas si es persona física o persona moral?`)
    }
    return askOne('Ahora, por favor indícame el nombre completo del comprador (adquirente) tal como aparece en su identificación oficial y si es persona física o persona moral.')
  }

  // Créditos
  if (s === 'ESTADO_5') {
    const creditos = Array.isArray(context?.creditos) ? context.creditos : []
    const c0 = creditos[0]
    const inst = c0?.institucion || null
    const participantes = Array.isArray(c0?.participantes) ? c0.participantes : []
    const comprador0 = context?.compradores?.[0]
    const compradorNombre = comprador0?.persona_fisica?.nombre || comprador0?.persona_moral?.denominacion_social || null

    if (!inst) {
      return askOne('Para el crédito, indícame la institución (banco, INFONAVIT, FOVISSSTE, etc.).')
    }
    if (participantes.length === 0) {
      // Si ya hay comprador, sugerir flujo mínimo
      if (compradorNombre) {
        return askOne(`Para el crédito con ${inst}, ¿confirmas si el único participante será el comprador "${compradorNombre}" como acreditado (titular)? Responde: "sí" o indica los participantes.`)
      }
      return askOne(`Para el crédito con ${inst}, dime quién(es) participan y si serán acreditado o coacreditado.`)
    }
    // Si ya hay institución + participantes, continuar (no re-pedir institución/monto)
    return askOne('Continuamos. ¿Existe algún otro crédito adicional? (sí/no)')
  }

  // Gravámenes
  if (s === 'ESTADO_6') {
    const gravamenes = Array.isArray(context?.gravamenes) ? context.gravamenes : []
    if (gravamenes.length === 0) {
      return askOne('En el folio real, ¿hay algún gravamen/hipoteca vigente que deba cancelarse? (sí/no)')
    }
    const g0 = gravamenes[0]
    if (g0?.cancelacion_confirmada !== true) {
      return askOne('Confirmación rápida: ¿la cancelación de esa hipoteca/gravamen ya está inscrita en el Registro Público? (sí/no)')
    }
    // Si ya está confirmado, seguir al siguiente estado pendiente
    const next = pickNextByStatus()
    if (next && next !== 'ESTADO_6') return buildDeterministicFollowUp({ ...state, current_state: next }, context)
    return null
  }

  // Fallback: si por algún motivo no mapeamos el estado, elegir el siguiente por status o preguntar forma de pago.
  const next = pickNextByStatus()
  if (next && next !== s) return buildDeterministicFollowUp({ ...state, current_state: next }, context)
  if (current !== 'ESTADO_8') return askOne('¿La compraventa será de contado o con crédito?')
  return null
}

// Función auxiliar para extraer datos del mensaje del asistente (v1.4 compatible)
function extractDataFromMessage(message: string, currentContext?: ChatRequest['context']): any {
  // Buscar bloque <DATA_UPDATE>
  const dataUpdateMatch = message.match(/<DATA_UPDATE>([\s\S]*?)<\/DATA_UPDATE>/)
  
  if (!dataUpdateMatch) {
    return null
  }

  try {
    const jsonStr = dataUpdateMatch[1].trim()
    const parsed = JSON.parse(jsonStr)
    
    // Inicializar resultado con estructura v1.4
    const result: any = {
      tipoOperacion: currentContext?.tipoOperacion || 'compraventa',
      compradores: currentContext?.compradores || [],
      vendedores: currentContext?.vendedores || [],
      // IMPORTANT: preserve undefined (forma de pago no confirmada)
      creditos: currentContext?.creditos,
      gravamenes: currentContext?.gravamenes || [],
      inmueble: currentContext?.inmueble || {
        folio_real: null,
        partidas: [],
        all_registry_pages_confirmed: false,
        direccion: {
          calle: null,
          numero: null,
          colonia: null,
          municipio: null,
          estado: null,
          codigo_postal: null
        },
        superficie: null,
        valor: null,
        datos_catastrales: {
          lote: null,
          manzana: null,
          fraccionamiento: null,
          condominio: null,
          unidad: null,
          modulo: null
        }
      }
    }

    // Procesar compradores (array)
    if (parsed.compradores && Array.isArray(parsed.compradores)) {
      // Si hay compradores nuevos, agregarlos al array
      result.compradores = [...(result.compradores || []), ...parsed.compradores]
    } else if (parsed.comprador) {
      // Compatibilidad: si viene en formato antiguo (singular), agregar/mergear como array
      result.compradores = [...(result.compradores || []), parsed.comprador]
    }

    const mergeNonNullDeep = (base: any, incoming: any): any => {
      if (!incoming || typeof incoming !== 'object') return base
      const out: any = Array.isArray(base) ? [...base] : { ...(base || {}) }
      for (const [k, v] of Object.entries(incoming)) {
        if (v === null || v === undefined) continue
        const prev = (out as any)[k]
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          ;(out as any)[k] = mergeNonNullDeep(prev && typeof prev === 'object' ? prev : {}, v)
        } else {
          ;(out as any)[k] = v
        }
      }
      return out
    }

    const normalizeSellerShape = (v: any): any => {
      if (!v || typeof v !== 'object') return v
      const tipo = v.tipo_persona
      if (tipo === 'persona_moral') {
        // No mezclar persona_fisica si ya es moral
        const denom =
          v.persona_moral?.denominacion_social ||
          v.persona_fisica?.nombre ||
          null
        return {
          ...v,
          persona_fisica: undefined,
          persona_moral: mergeNonNullDeep(v.persona_moral || {}, denom ? { denominacion_social: denom } : {})
        }
      }
      if (tipo === 'persona_fisica') {
        const nombre =
          v.persona_fisica?.nombre ||
          v.persona_moral?.denominacion_social ||
          null
        return {
          ...v,
          persona_moral: undefined,
          persona_fisica: mergeNonNullDeep(v.persona_fisica || {}, nombre ? { nombre } : {})
        }
      }
      return v
    }

    // Procesar vendedores (array)
    if (parsed.vendedores && Array.isArray(parsed.vendedores)) {
      const existing = Array.isArray(result.vendedores) ? [...result.vendedores] : []

      const normalizeKey = (value: any): string | null => {
        if (!value) return null
        return String(value)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[“”"']/g, '')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      const getNameKey = (v: any): string | null => {
        const n =
          v?.persona_fisica?.nombre ||
          v?.persona_moral?.denominacion_social ||
          v?.persona?.nombre_completo ||
          v?.persona?.nombre ||
          null
        return normalizeKey(n)
      }

      const getPartyKey = (v: any): string | null => {
        const id = v?.party_id || v?.persona_id || v?.id || null
        return id ? String(id) : null
      }

      for (const incoming of parsed.vendedores) {
        const partyKey = getPartyKey(incoming)
        const nameKey = getNameKey(incoming)

        // Si el update de vendedor viene "sin llave" (solo tipo_persona u otros flags),
        // aplicarlo al vendedor existente cuando hay exactamente uno.
        if (!partyKey && !nameKey && existing.length === 1) {
          existing[0] = normalizeSellerShape(mergeNonNullDeep(existing[0], incoming))
          continue
        }

        const idx = existing.findIndex(e => {
          const eParty = getPartyKey(e)
          if (partyKey && eParty && partyKey === eParty) return true
          const eName = getNameKey(e)
          return !!(nameKey && eName && nameKey === eName)
        })

        if (idx >= 0) {
          // Merge no-null: NO sobrescribir datos confirmados con null/undefined
          existing[idx] = normalizeSellerShape(mergeNonNullDeep(existing[idx], incoming))
        } else {
          existing.push(normalizeSellerShape(incoming))
        }
      }

      // Deduplicar por nombre normalizado / party_id, quedándonos con el más completo
      const score = (v: any): number => {
        let s = 0
        if (v?.titular_registral_confirmado === true) s += 5
        if (v?.tipo_persona) s += 3
        if (v?.persona_moral?.denominacion_social) s += 2
        if (v?.persona_fisica?.nombre) s += 2
        if (v?.persona_fisica?.rfc || v?.persona_moral?.rfc) s += 1
        return s
      }
      const byKey = new Map<string, any>()
      for (const v0 of existing) {
        const v = normalizeSellerShape(v0)
        const k = (getPartyKey(v) || getNameKey(v) || '').trim()
        if (!k) continue
        const prev = byKey.get(k)
        if (!prev) byKey.set(k, v)
        else byKey.set(k, score(v) >= score(prev) ? mergeNonNullDeep(prev, v) : mergeNonNullDeep(v, prev))
      }
      // Conservar orden lo más cercano posible al original
      const deduped: any[] = []
      const seen = new Set<string>()
      for (const v of existing) {
        const k = (getPartyKey(v) || getNameKey(v) || '').trim()
        if (!k || seen.has(k)) continue
        seen.add(k)
        deduped.push(byKey.get(k))
      }
      result.vendedores = deduped.length > 0 ? deduped : existing
    } else if (parsed.vendedor) {
      // Compatibilidad: si viene en formato antiguo (singular), mergear sobre existentes
      const existing = Array.isArray(result.vendedores) ? [...result.vendedores] : []

      const incomingArr = [parsed.vendedor]
      const normalizeKey = (value: any): string | null => {
        if (!value) return null
        return String(value)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[“”"']/g, '')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      const getNameKey = (v: any): string | null => {
        const n =
          v?.persona_fisica?.nombre ||
          v?.persona_moral?.denominacion_social ||
          v?.persona?.nombre_completo ||
          v?.persona?.nombre ||
          null
        return normalizeKey(n)
      }
      const getPartyKey = (v: any): string | null => {
        const id = v?.party_id || v?.persona_id || v?.id || null
        return id ? String(id) : null
      }

      for (const incoming of incomingArr) {
        const partyKey = getPartyKey(incoming)
        const nameKey = getNameKey(incoming)

        if (!partyKey && !nameKey && existing.length === 1) {
          existing[0] = normalizeSellerShape(mergeNonNullDeep(existing[0], incoming))
          continue
        }

        const idx = existing.findIndex(e => {
          const eParty = getPartyKey(e)
          if (partyKey && eParty && partyKey === eParty) return true
          const eName = getNameKey(e)
          return !!(nameKey && eName && nameKey === eName)
        })
        if (idx >= 0) {
          existing[idx] = normalizeSellerShape(mergeNonNullDeep(existing[idx], incoming))
        } else {
          existing.push(normalizeSellerShape(incoming))
        }
      }

      result.vendedores = existing
    }

    // Procesar créditos (array)
    // IMPORTANTE: si el usuario (o el sistema) envía explícitamente creditos (incluso []),
    // debe REEMPLAZAR el arreglo (no append), para evitar quedarse con placeholders.
    if (Object.prototype.hasOwnProperty.call(parsed, 'creditos') && Array.isArray(parsed.creditos)) {
      result.creditos = parsed.creditos
    }

    // Procesar gravámenes (array)
    if (parsed.gravamenes && Array.isArray(parsed.gravamenes)) {
      const base = Array.isArray(result.gravamenes) ? result.gravamenes : []
      result.gravamenes = [...base, ...parsed.gravamenes]
    }

    // Procesar inmueble (estructura v1.4)
    if (parsed.inmueble) {
      result.inmueble = {
        ...result.inmueble,
        ...parsed.inmueble,
        // Mergear direccion si viene
        direccion: parsed.inmueble.direccion 
          ? { ...result.inmueble.direccion, ...parsed.inmueble.direccion }
          : result.inmueble.direccion,
        // Mergear datos_catastrales si viene
        datos_catastrales: parsed.inmueble.datos_catastrales
          ? { ...result.inmueble.datos_catastrales, ...parsed.inmueble.datos_catastrales }
          : result.inmueble.datos_catastrales,
        // Mergear partidas (array)
        partidas: parsed.inmueble.partidas 
          ? [...(result.inmueble.partidas || []), ...parsed.inmueble.partidas]
          : result.inmueble.partidas
      }
    }

    // Procesar control_impresion
    if (parsed.control_impresion) {
      result.control_impresion = {
        ...(result.control_impresion || {}),
        ...parsed.control_impresion
      }
    }

    // Procesar validaciones
    if (parsed.validaciones) {
      result.validaciones = {
        ...(result.validaciones || {}),
        ...parsed.validaciones
      }
    }

    return result
  } catch (error) {
    console.error('[extractDataFromMessage] Error parsing JSON:', error)
    return null
  }
}

