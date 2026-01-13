# Mapeo Completo: Sistema Actual → Sistema Nuevo

## Todos los Casos del Sistema Actual Convertidos a Handlers

### 1. Identificación de Vendedor / Titular Registral

**Sistema Actual** (líneas ~1268-1298):
```typescript
// En applyDeterministicUserInputUpdate
if (currentState === 'ESTADO_3' && titularNameMatch) {
  // Detectar nombre del titular
  // Inferir tipo persona
  // Actualizar vendedores
}
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface TitularRegistralCommand extends Command {
  type: 'titular_registral'
  payload: {
    name: string
    inferredTipoPersona?: 'persona_fisica' | 'persona_moral'
    confirmed: boolean  // true si confirma que es el titular
  }
}

// lib/handlers/titular-registral-handler.ts
export class TitularRegistralHandler {
  static async handle(
    command: TitularRegistralCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    // 1. Validar nombre
    if (!ValidationService.isValidName(command.payload.name)) {
      throw new Error('Nombre inválido')
    }

    // 2. Inferir tipo persona si no está especificado
    const tipoPersona = command.payload.inferredTipoPersona || 
      ValidationService.inferTipoPersona(command.payload.name)

    // 3. Actualizar vendedores
    const updatedContext = { ...context }
    const vendedores = [...(context.vendedores || [])]
    
    if (vendedores.length === 0) {
      vendedores.push({
        party_id: null,
        tipo_persona: tipoPersona,
        titular_registral_confirmado: command.payload.confirmed,
        persona_fisica: tipoPersona === 'persona_fisica' 
          ? { nombre: command.payload.name } 
          : undefined,
        persona_moral: tipoPersona === 'persona_moral'
          ? { denominacion_social: command.payload.name }
          : undefined
      })
    } else {
      // Mergear con vendedor existente
      vendedores[0] = {
        ...vendedores[0],
        tipo_persona: tipoPersona,
        titular_registral_confirmado: command.payload.confirmed,
        persona_fisica: tipoPersona === 'persona_fisica'
          ? { ...vendedores[0].persona_fisica, nombre: command.payload.name }
          : undefined,
        persona_moral: tipoPersona === 'persona_moral'
          ? { ...vendedores[0].persona_moral, denominacion_social: command.payload.name }
          : undefined
      }
    }

    updatedContext.vendedores = vendedores

    // 4. Emitir eventos
    const events = ['TitularRegistralUpdated']
    if (command.payload.confirmed) {
      events.push('TitularRegistralConfirmed')
    }

    return { updatedContext, events }
  }
}
```

**InputParser detecta**:
```typescript
// lib/parsers/input-parser.ts
static parse(userInput: string, context: any, lastAssistantMessage?: string): Command[] {
  const commands: Command[] = []
  
  // Detectar confirmación de titular registral
  const titularMatch = userInput.match(/\btitular\s+registral\s*:\s*(.+?)\s*$/i) ||
                       userInput.match(/\bel\s+titular\s+registral\s+es\s+(.+?)\s*$/i)
  
  if (titularMatch && this.isTitularRegistralContext(context)) {
    const name = this.extractName(titularMatch[1])
    if (name) {
      commands.push({
        type: 'titular_registral',
        timestamp: new Date(),
        payload: {
          name,
          inferredTipoPersona: this.inferTipoPersona(name),
          confirmed: /^(sí|si|confirmo)\b/i.test(userInput)
        }
      })
    }
  }

  // Detectar respuesta negativa a confirmación de titular
  if (/^no\b/i.test(userInput) && this.isAskingTitularConfirmation(lastAssistantMessage)) {
    commands.push({
      type: 'titular_registral_rejected',
      timestamp: new Date(),
      payload: {}
    })
  }

  return commands
}
```

---

### 2. Selección de Folio Real

**Sistema Actual** (líneas ~1383-1493):
```typescript
// Selección de folio con múltiples folios detectados
if (blocking.includes('multiple_folio_real_detected')) {
  // Extraer folio del texto
  // Validar que existe en candidatos
  // Copiar información asociada
  // Actualizar inmueble
}
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface FolioSelectionCommand extends Command {
  type: 'folio_selection'
  payload: {
    selectedFolio: string
    scope?: 'unidades' | 'inmuebles_afectados' | 'otros'
    confirmedByUser: boolean
  }
}

// lib/handlers/folio-selection-handler.ts
export class FolioSelectionHandler {
  static async handle(
    command: FolioSelectionCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    // 1. Validar que el folio existe en candidatos
    const folios = context.folios?.candidates || []
    const folioExists = folios.some((f: any) => {
      const folioValue = typeof f === 'string' ? f : f.folio
      return this.normalizeFolio(folioValue) === this.normalizeFolio(command.payload.selectedFolio)
    })

    if (!folioExists) {
      throw new Error(`Folio ${command.payload.selectedFolio} no encontrado en candidatos`)
    }

    // 2. Obtener información asociada al folio
    const folioInfo = FolioService.getFolioInfo(
      command.payload.selectedFolio,
      folios,
      context.documentosProcesados
    )

    // 3. Determinar scope si no está especificado
    const scope = command.payload.scope || this.inferScope(
      command.payload.selectedFolio,
      context.folios
    )

    // 4. Actualizar inmueble
    const updatedContext = { ...context }
    updatedContext.inmueble = {
      ...updatedContext.inmueble,
      folio_real: command.payload.selectedFolio,
      folio_real_confirmed: command.payload.confirmedByUser,
      folio_real_scope: scope,
      // Auto-popular datos asociados
      superficie: folioInfo?.superficie || updatedContext.inmueble?.superficie,
      direccion: {
        ...updatedContext.inmueble?.direccion,
        calle: folioInfo?.ubicacion || updatedContext.inmueble?.direccion?.calle
      },
      datos_catastrales: {
        ...updatedContext.inmueble?.datos_catastrales,
        ...folioInfo?.datos_catastrales
      }
    }

    // Actualizar selección de folio
    updatedContext.folios = {
      ...updatedContext.folios,
      selection: {
        selected_folio: command.payload.selectedFolio,
        selected_scope: scope,
        confirmed_by_user: command.payload.confirmedByUser
      }
    }

    // 5. Emitir eventos
    const events = ['FolioSelected', 'InmuebleUpdated']
    if (folioInfo) {
      events.push('FolioInfoAutoPopulated')
    }

    return { updatedContext, events }
  }

  private static normalizeFolio(folio: string): string {
    return String(folio || '').replace(/\D/g, '')
  }

  private static inferScope(folio: string, folios: any): string {
    // Inferir scope basado en qué lista contiene el folio
    if (folios?.unidades?.includes(folio)) return 'unidades'
    if (folios?.inmuebles_afectados?.includes(folio)) return 'inmuebles_afectados'
    return 'otros'
  }
}
```

**InputParser detecta**:
```typescript
// Detectar selección de folio
const folioMatch = userInput.match(/\b(\d{6,})\b/)
if (folioMatch && this.isFolioSelectionContext(context)) {
  const folio = folioMatch[1]
  commands.push({
    type: 'folio_selection',
    timestamp: new Date(),
    payload: {
      selectedFolio: folio,
      scope: this.inferFolioScope(folio, context),
      confirmedByUser: true
    }
  })
}

// Detectar selección por scope (A/B)
if (/^\s*[ab]\s*$/i.test(userInput) && this.hasMultipleFolioScopes(context)) {
  commands.push({
    type: 'folio_scope_selection',
    timestamp: new Date(),
    payload: {
      scope: userInput.trim().toLowerCase() === 'a' 
        ? 'inmuebles_afectados' 
        : 'unidades'
    }
  })
}
```

---

### 3. Información de Crédito (Institución, Monto, Participantes)

**Sistema Actual** (líneas ~1594-1957):
```typescript
// Captura de institución de crédito
if (Array.isArray(baseContext?.creditos) && baseContext.creditos.length > 0) {
  const found = institucionesComunes.find(i => /* ... */)
  // Actualizar crédito
}

// Captura de participantes
if (/\b(acreditado|coacreditado)\b/i.test(userText)) {
  // Parsear participantes
  // Resolver nombres
  // Actualizar crédito
}
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface CreditInstitutionCommand extends Command {
  type: 'credit_institution'
  payload: {
    creditIndex: number
    institution: string
  }
}

export interface CreditParticipantCommand extends Command {
  type: 'credit_participant'
  payload: {
    creditIndex: number
    participant: {
      name?: string
      partyId?: string
      role: 'acreditado' | 'coacreditado'
      isConyuge?: boolean
    }
  }
}

export interface CreditAmountCommand extends Command {
  type: 'credit_amount'
  payload: {
    creditIndex: number
    amount: string
  }
}

// lib/handlers/credit-institution-handler.ts
export class CreditInstitutionHandler {
  static async handle(
    command: CreditInstitutionCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    // 1. Validar institución
    if (!ValidationService.isValidInstitution(command.payload.institution)) {
      throw new Error(`Institución "${command.payload.institution}" no válida`)
    }

    // 2. Actualizar crédito
    const updatedContext = { ...context }
    const creditos = [...(context.creditos || [])]
    
    if (!creditos[command.payload.creditIndex]) {
      // Crear crédito si no existe
      creditos[command.payload.creditIndex] = {
        credito_id: null,
        institucion: command.payload.institution,
        monto: null,
        participantes: [],
        tipo_credito: null
      }
    } else {
      creditos[command.payload.creditIndex] = {
        ...creditos[command.payload.creditIndex],
        institucion: command.payload.institution
      }
    }

    updatedContext.creditos = creditos

    return { 
      updatedContext, 
      events: ['CreditInstitutionUpdated'] 
    }
  }
}

// lib/handlers/credit-participant-handler.ts
export class CreditParticipantHandler {
  static async handle(
    command: CreditParticipantCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    const participant = command.payload.participant
    const updatedContext = { ...context }
    const creditos = [...(context.creditos || [])]
    
    // 1. Resolver nombre si es necesario
    let finalName = participant.name
    if (!finalName && participant.isConyuge) {
      finalName = ConyugeService.getConyugeNombre(context)
      if (!finalName) {
        throw new Error('Nombre del cónyuge no encontrado. Debe ser capturado primero.')
      }
    }

    if (!finalName && participant.partyId) {
      finalName = PartyService.getNameByPartyId(participant.partyId, context)
    }

    // 2. Validar nombre si está presente
    if (finalName && !ValidationService.isValidName(finalName)) {
      throw new Error(`Nombre "${finalName}" no válido`)
    }

    // 3. Actualizar participantes del crédito
    const credito = creditos[command.payload.creditIndex] || {
      credito_id: null,
      institucion: null,
      monto: null,
      participantes: [],
      tipo_credito: null
    }

    const participantes = [...(credito.participantes || [])]
    
    // Verificar si ya existe
    const existingIndex = participantes.findIndex(p => {
      if (participant.partyId && p.party_id === participant.partyId) return true
      if (finalName && p.nombre && this.normalizeName(p.nombre) === this.normalizeName(finalName)) {
        return true
      }
      return false
    })

    const newParticipant = {
      party_id: participant.partyId || null,
      rol: participant.role,
      nombre: finalName || null
    }

    if (existingIndex >= 0) {
      participantes[existingIndex] = newParticipant
    } else {
      participantes.push(newParticipant)
    }

    creditos[command.payload.creditIndex] = {
      ...credito,
      participantes
    }

    updatedContext.creditos = creditos

    // 4. Si es cónyuge, asegurar que existe como comprador
    if (participant.isConyuge && finalName) {
      const compradores = [...(updatedContext.compradores || [])]
      const conyugeExists = compradores.some(c => {
        const nombre = c?.persona_fisica?.nombre || c?.persona_moral?.denominacion_social
        return nombre && this.normalizeName(nombre) === this.normalizeName(finalName)
      })

      if (!conyugeExists) {
        compradores.push({
          party_id: null,
          tipo_persona: 'persona_fisica',
          persona_fisica: {
            nombre: finalName,
            rfc: null,
            curp: null,
            estado_civil: null
          }
        })
        updatedContext.compradores = compradores
      }
    }

    // 5. Emitir eventos
    const events = ['CreditParticipantUpdated']
    if (participant.isConyuge) {
      events.push('ConyugeAddedAsBuyer')
    }

    return { updatedContext, events }
  }

  private static normalizeName(name: string): string {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }
}
```

**InputParser detecta participantes**:
```typescript
// Detectar participantes de crédito
// Ejemplo: "WU, JINWEI como acreditado y su conyugue como coacreditado"
const participantPattern = /(.+?)\s+(?:como|es)\s+(acreditado|coacreditado)/gi
let match

while ((match = participantPattern.exec(userInput)) !== null) {
  const nameOrRef = match[1].trim()
  const role = match[2].toLowerCase() as 'acreditado' | 'coacreditado'
  
  // Detectar si es referencia o nombre
  const isConyuge = /\b(su\s+)?(c[oó]nyuge|conyugue)\b/i.test(nameOrRef)
  const isBuyer = /\b(el\s+)?comprador\b/i.test(nameOrRef)
  
  if (isConyuge || isBuyer || this.isValidName(nameOrRef)) {
    commands.push({
      type: 'credit_participant',
      timestamp: new Date(),
      payload: {
        creditIndex: 0, // Por defecto primer crédito
        participant: {
          name: isConyuge || isBuyer ? undefined : nameOrRef,
          partyId: isBuyer ? 'comprador_1' : undefined,
          role,
          isConyuge: isConyuge || false
        }
      }
    })
  }
}
```

---

### 4. Captura de Nombre del Comprador

**Sistema Actual** (líneas ~1100-1141):
```typescript
// Captura determinista de comprador por "texto libre"
if (currentState === 'ESTADO_4' && assistantAskedBuyerName && looksLikeFreeName) {
  // Capturar nombre
  // Inferir tipo persona
  // Actualizar compradores
}
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface BuyerNameCommand extends Command {
  type: 'buyer_name'
  payload: {
    buyerIndex: number
    name: string
    inferredTipoPersona?: 'persona_fisica' | 'persona_moral'
  }
}

// lib/handlers/buyer-name-handler.ts
export class BuyerNameHandler {
  static async handle(
    command: BuyerNameCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    // 1. Validar nombre
    if (!ValidationService.isValidName(command.payload.name)) {
      throw new Error(`Nombre "${command.payload.name}" no válido`)
    }

    // 2. Inferir tipo persona si no está especificado
    const tipoPersona = command.payload.inferredTipoPersona || 
      ValidationService.inferTipoPersona(command.payload.name)

    // 3. Actualizar compradores
    const updatedContext = { ...context }
    const compradores = [...(context.compradores || [])]
    
    if (!compradores[command.payload.buyerIndex]) {
      compradores[command.payload.buyerIndex] = {
        party_id: null,
        tipo_persona: tipoPersona,
        persona_fisica: {},
        persona_moral: undefined
      }
    }

    const buyer = compradores[command.payload.buyerIndex]
    
    compradores[command.payload.buyerIndex] = {
      ...buyer,
      tipo_persona: tipoPersona,
      persona_fisica: tipoPersona === 'persona_fisica'
        ? { ...buyer.persona_fisica, nombre: command.payload.name }
        : undefined,
      persona_moral: tipoPersona === 'persona_moral'
        ? { ...buyer.persona_moral, denominacion_social: command.payload.name }
        : undefined
    }

    updatedContext.compradores = compradores

    return { 
      updatedContext, 
      events: ['BuyerNameUpdated'] 
    }
  }
}
```

---

### 5. Gravámenes / Hipoteca (PASO 6)

**Sistema Actual** (líneas ~2001-2087):
```typescript
// Gravámenes / hipoteca (PASO 6)
if (inEncumbrancePhase) {
  // Detectar sí/no
  // Crear/actualizar gravamen
  // Actualizar existe_hipoteca
}
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface EncumbranceCommand extends Command {
  type: 'encumbrance'
  payload: {
    exists: boolean
    cancellationConfirmed?: boolean  // null = no confirmado, true = ya inscrita, false = se cancelará
    tipo?: 'hipoteca' | 'embargo' | 'gravamen'
  }
}

// lib/handlers/encumbrance-handler.ts
export class EncumbranceHandler {
  static async handle(
    command: EncumbranceCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    const updatedContext = { ...context }

    if (!command.payload.exists) {
      // No hay gravamen
      updatedContext.inmueble = {
        ...updatedContext.inmueble,
        existe_hipoteca: false
      }
      updatedContext.gravamenes = []

      return { 
        updatedContext, 
        events: ['EncumbranceConfirmedNone'] 
      }
    }

    // Hay gravamen
    const gravamenes = [...(context.gravamenes || [])]
    
    if (gravamenes.length === 0) {
      // Crear gravamen
      gravamenes.push({
        gravamen_id: null,
        tipo: command.payload.tipo || 'hipoteca',
        institucion: null,
        numero_credito: null,
        cancelacion_confirmada: command.payload.cancellationConfirmed ?? null
      })
    } else {
      // Actualizar gravamen existente
      gravamenes[0] = {
        ...gravamenes[0],
        cancelacion_confirmada: command.payload.cancellationConfirmed ?? gravamenes[0].cancelacion_confirmada
      }
    }

    updatedContext.inmueble = {
      ...updatedContext.inmueble,
      existe_hipoteca: true
    }
    updatedContext.gravamenes = gravamenes

    const events = ['EncumbranceUpdated']
    if (command.payload.cancellationConfirmed !== null) {
      events.push('EncumbranceCancellationConfirmed')
    }

    return { updatedContext, events }
  }
}
```

**InputParser detecta**:
```typescript
// Detectar respuestas de PASO 6
if (this.isEncumbranceContext(context, lastAssistantMessage)) {
  const saysNo = /^(no|no\.?)$/i.test(userInput)
  const saysYes = /^(sí|si|sí\.|si\.)$/i.test(userInput)
  const saysCancelada = /\bcancelad[ao]\b/i.test(userInput)
  const saysVigente = /\bvigent[ea]\b/i.test(userInput)

  if (saysNo) {
    commands.push({
      type: 'encumbrance',
      timestamp: new Date(),
      payload: { exists: false }
    })
  } else if (saysYes || saysVigente) {
    commands.push({
      type: 'encumbrance',
      timestamp: new Date(),
      payload: { 
        exists: true,
        cancellationConfirmed: saysCancelada ? true : false
      }
    })
  }
}
```

---

### 6. Forma de Pago (Contado vs Crédito)

**Sistema Actual** (líneas ~1594-1614):
```typescript
// Forma de pago
const saysContado = /\bcontado\b/i.test(userText)
const saysCredito = /\bcr[eé]dito\b/i.test(userText)
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface PaymentMethodCommand extends Command {
  type: 'payment_method'
  payload: {
    method: 'contado' | 'credito'
  }
}

// lib/handlers/payment-method-handler.ts
export class PaymentMethodHandler {
  static async handle(
    command: PaymentMethodCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    const updatedContext = { ...context }

    if (command.payload.method === 'contado') {
      // Contado: creditos = []
      updatedContext.creditos = []
    } else {
      // Crédito: crear placeholder de crédito si no existe
      if (!updatedContext.creditos || updatedContext.creditos.length === 0) {
        updatedContext.creditos = [{
          credito_id: null,
          institucion: null,
          monto: null,
          participantes: [],
          tipo_credito: null
        }]
      }
    }

    const events = [
      command.payload.method === 'contado' ? 'PaymentMethodContado' : 'PaymentMethodCredito'
    ]

    return { updatedContext, events }
  }
}
```

---

### 7. Confirmación de Titular Registral

**Sistema Actual** (líneas ~1524-1547):
```typescript
// Confirmación explícita de titular registral
if (isConfirm && currentState === 'ESTADO_3') {
  // Marcar titular_registral_confirmado = true
}
```

**Sistema Nuevo**:
```typescript
// lib/commands/types.ts
export interface TitularConfirmationCommand extends Command {
  type: 'titular_confirmation'
  payload: {
    confirmed: boolean
    tipoPersona?: 'persona_fisica' | 'persona_moral'
  }
}

// lib/handlers/titular-confirmation-handler.ts
export class TitularConfirmationHandler {
  static async handle(
    command: TitularConfirmationCommand,
    context: any
  ): Promise<{ updatedContext: any; events: string[] }> {
    const updatedContext = { ...context }
    const vendedores = [...(context.vendedores || [])]
    
    if (vendedores.length === 0) {
      throw new Error('No hay vendedor para confirmar')
    }

    vendedores[0] = {
      ...vendedores[0],
      titular_registral_confirmado: command.payload.confirmed,
      ...(command.payload.tipoPersona && {
        tipo_persona: command.payload.tipoPersona
      })
    }

    updatedContext.vendedores = vendedores

    return { 
      updatedContext, 
      events: ['TitularRegistralConfirmationUpdated'] 
    }
  }
}
```

---

## Servicios Helper Centralizados

### ConyugeService (Para resolver nombres de cónyuges)

```typescript
// lib/services/conyuge-service.ts
export class ConyugeService {
  /**
   * Obtiene el nombre del cónyuge de múltiples fuentes
   * Fuente única de verdad para el cónyuge
   */
  static getConyugeNombre(context: any): string | null {
    // 1. compradores[0].persona_fisica.conyuge.nombre (schema v1.4)
    const comprador0 = context.compradores?.[0]
    if (comprador0?.persona_fisica?.conyuge?.nombre) {
      return comprador0.persona_fisica.conyuge.nombre
    }

    // 2. compradores[1+] si el nombre coincide con cónyuge
    if (comprador0?.persona_fisica?.estado_civil === 'casado') {
      const compradorNombre = comprador0.persona_fisica.nombre
      const compradores = context.compradores || []
      
      for (let i = 1; i < compradores.length; i++) {
        const nombre = compradores[i]?.persona_fisica?.nombre
        if (nombre && nombre !== compradorNombre) {
          return nombre
        }
      }
    }

    // 3. documentosProcesados recientes (últimos 5 minutos)
    const documentos = context.documentosProcesados || []
    const ahora = Date.now()
    const cincoMinutos = 5 * 60 * 1000

    for (const doc of documentos.reverse()) {
      if (doc.tipo === 'identificacion' && doc.informacionExtraida?.nombre) {
        const nombre = doc.informacionExtraida.nombre
        const compradorNombre = comprador0?.persona_fisica?.nombre
        
        // Si el nombre no es del comprador, probablemente es del cónyuge
        if (nombre !== compradorNombre && nombre.length >= 6) {
          return nombre
        }
      }
    }

    return null
  }
}
```

### ValidationService (Validaciones centralizadas)

```typescript
// lib/services/validation-service.ts
export class ValidationService {
  static isValidName(name: string): boolean {
    if (!name || typeof name !== 'string') return false
    if (name.length < 6) return false
    if (/\d{3,}/.test(name)) return false // No debe tener muchos números

    const invalidWords = [
      'coacreditado', 'coacreditada', 'acreditado', 'acreditada',
      'comprador', 'compradora', 'vendedor', 'vendedora',
      'casado', 'casada', 'soltero', 'soltera',
      'moral', 'fisica', 'física', 'persona',
      'como', 'es', 'será', 'sí', 'no', 'si'
    ]

    const nameLower = name.toLowerCase().trim()
    if (invalidWords.includes(nameLower)) return false
    if (invalidWords.some(word => nameLower.includes(word) && nameLower.length < 20)) {
      return false
    }

    return true
  }

  static isValidInstitution(institution: string): boolean {
    if (!institution || typeof institution !== 'string') return false
    
    const invalidValues = [
      'credito', 'crédito', 'el credito', 'el crédito',
      'hipoteca', 'banco', 'institucion', 'institución',
      'entidad', 'financiamiento'
    ]

    const normalized = institution.toLowerCase().trim()
    return !invalidValues.includes(normalized) && normalized.length >= 3
  }

  static inferTipoPersona(name: string): 'persona_moral' | null {
    const suffixes = [
      /\bs\.?\s*a\.?\b/i,              // S.A.
      /\bs\.?\s*a\.?\s*de\s*c\.?\s*v\.?\b/i, // S.A. de C.V.
      /\bsociedad\s+anonima/i,
      /\binmobiliaria\b/i,
      /\bdesarrolladora\b/i,
      // ... más patrones
    ]

    return suffixes.some(pattern => pattern.test(name)) ? 'persona_moral' : null
  }

  static validateEstadoCivil(estadoCivil: string): { valid: boolean; error?: string } {
    const valid = ['soltero', 'casado', 'divorciado', 'viudo']
    if (!valid.includes(estadoCivil.toLowerCase())) {
      return { valid: false, error: `Estado civil "${estadoCivil}" no válido` }
    }
    return { valid: true }
  }
}
```

---

## InputParser Completo (Coordinador Principal)

```typescript
// lib/parsers/input-parser.ts
export class InputParser {
  /**
   * Analiza el input del usuario y genera comandos específicos
   * Esta es la única función que "decide" qué comandos generar
   */
  static parse(
    userInput: string,
    context: any,
    lastAssistantMessage?: string
  ): Command[] {
    const commands: Command[] = []
    const normalized = userInput.trim().toLowerCase()

    // 1. Detectar estado civil
    const estadoCivilMatch = normalized.match(/\b(soltero|casado|divorciado|viudo)\b/i)
    if (estadoCivilMatch && this.isEstadoCivilContext(context)) {
      commands.push({
        type: 'estado_civil',
        timestamp: new Date(),
        payload: {
          buyerIndex: 0,
          estadoCivil: this.normalizeEstadoCivil(estadoCivilMatch[1])
        }
      })
    }

    // 2. Detectar selección de folio
    if (this.isFolioSelectionContext(context)) {
      const folioMatch = normalized.match(/\b(\d{6,})\b/)
      if (folioMatch) {
        commands.push({
          type: 'folio_selection',
          timestamp: new Date(),
          payload: {
            selectedFolio: folioMatch[1],
            scope: this.inferFolioScope(folioMatch[1], context),
            confirmedByUser: true
          }
        })
      }
    }

    // 3. Detectar nombre del comprador
    if (this.isBuyerNameContext(context, lastAssistantMessage)) {
      const name = this.extractName(userInput)
      if (name && ValidationService.isValidName(name)) {
        commands.push({
          type: 'buyer_name',
          timestamp: new Date(),
          payload: {
            buyerIndex: 0,
            name,
            inferredTipoPersona: ValidationService.inferTipoPersona(name)
          }
        })
      }
    }

    // 4. Detectar titular registral
    const titularMatch = this.extractTitularRegistral(userInput)
    if (titularMatch && this.isTitularRegistralContext(context)) {
      commands.push({
        type: 'titular_registral',
        timestamp: new Date(),
        payload: {
          name: titularMatch.name,
          inferredTipoPersona: ValidationService.inferTipoPersona(titularMatch.name),
          confirmed: titularMatch.confirmed
        }
      })
    }

    // 5. Detectar forma de pago
    const paymentMethod = this.extractPaymentMethod(normalized)
    if (paymentMethod) {
      commands.push({
        type: 'payment_method',
        timestamp: new Date(),
        payload: { method: paymentMethod }
      })
    }

    // 6. Detectar institución de crédito
    if (this.isCreditContext(context)) {
      const institution = this.extractCreditInstitution(userInput)
      if (institution && ValidationService.isValidInstitution(institution)) {
        commands.push({
          type: 'credit_institution',
          timestamp: new Date(),
          payload: {
            creditIndex: 0,
            institution
          }
        })
      }
    }

    // 7. Detectar participantes de crédito
    if (this.isCreditParticipantContext(context, lastAssistantMessage)) {
      const participants = this.extractCreditParticipants(userInput, context)
      participants.forEach(participant => {
        commands.push({
          type: 'credit_participant',
          timestamp: new Date(),
          payload: {
            creditIndex: 0,
            participant
          }
        })
      })
    }

    // 8. Detectar gravámenes (PASO 6)
    if (this.isEncumbranceContext(context, lastAssistantMessage)) {
      const encumbrance = this.extractEncumbrance(userInput)
      if (encumbrance) {
        commands.push({
          type: 'encumbrance',
          timestamp: new Date(),
          payload: encumbrance
        })
      }
    }

    // ... más detecciones

    return commands
  }

  // Helpers privados para detectar contexto y extraer información
  private static isEstadoCivilContext(context: any): boolean {
    const state = computePreavisoState(context)
    return state.current_state === 'ESTADO_4' ||
           state.required_missing.includes('compradores[0].persona_fisica.estado_civil')
  }

  private static isFolioSelectionContext(context: any): boolean {
    const state = computePreavisoState(context)
    return state.blocking_reasons.includes('multiple_folio_real_detected') ||
           state.blocking_reasons.includes('folio_real_confirmation_required')
  }

  // ... más helpers
}
```

---

## Resumen: Todos los Handlers Necesarios

1. ✅ **EstadoCivilHandler** - Maneja estado civil del comprador
2. ✅ **FolioSelectionHandler** - Maneja selección de folio real
3. ✅ **BuyerNameHandler** - Maneja nombre del comprador
4. ✅ **TitularRegistralHandler** - Maneja nombre del titular registral
5. ✅ **TitularConfirmationHandler** - Maneja confirmación de titular
6. ✅ **PaymentMethodHandler** - Maneja forma de pago (contado/crédito)
7. ✅ **CreditInstitutionHandler** - Maneja institución de crédito
8. ✅ **CreditParticipantHandler** - Maneja participantes de crédito
9. ✅ **CreditAmountHandler** - Maneja monto de crédito (si lo necesitamos)
10. ✅ **EncumbranceHandler** - Maneja gravámenes/hipoteca
11. **PartidaSelectionHandler** - Maneja selección de partida (similar a folio)
12. **ConyugeNameHandler** - Maneja nombre del cónyuge específicamente
13. **AddressHandler** - Maneja dirección del inmueble (si lo necesitamos)
14. **SurfaceHandler** - Maneja superficie del inmueble (si lo necesitamos)

**Total: ~14 handlers** (cada uno pequeño, enfocado, testeable)

---

## Ventajas de Este Enfoque

1. **Cobertura completa**: Todos los casos del sistema actual están cubiertos
2. **Mantenible**: Cada handler es independiente
3. **Testeable**: Cada handler tiene tests específicos
4. **Extensible**: Agregar nuevo caso = agregar nuevo handler
5. **Predecible**: Un comando → un handler → un resultado

¿Te parece bien este enfoque? ¿Hay algún caso específico que quieras que detalle más?
