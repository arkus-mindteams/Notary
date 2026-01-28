# Flujo Completo: Ejemplo Real desde Inicio hasta Generación de Documento

## Caso de Uso Completo

**Escenario**: Compraventa con crédito, comprador casado con cónyuge coacreditado, hipoteca a cancelar.

---

## PASO 0: Inicio del Chat (Contexto Vacío)

### Estado Inicial
```json
{
  "tipoOperacion": null,
  "vendedores": [],
  "compradores": [],
  "creditos": undefined,
  "gravamenes": [],
  "inmueble": {
    "folio_real": null,
    "partidas": [],
    "direccion": {
      "calle": null,
      "numero": null,
      "colonia": null,
      "municipio": null,
      "estado": null
    },
    "superficie": null,
    "valor": null,
    "datos_catastrales": {},
    "all_registry_pages_confirmed": false
  },
  "folios": {
    "candidates": [],
    "selection": {
      "selected_folio": null,
      "selected_scope": null,
      "confirmed_by_user": false
    }
  }
}
```

### Estado Calculado
```json
{
  "current_state": "ESTADO_2",
  "required_missing": ["inmueble.folio_real"],
  "blocking_reasons": [],
  "state_status": {
    "ESTADO_1": "incomplete",
    "ESTADO_2": "incomplete",
    "ESTADO_3": "pending",
    "ESTADO_4": "pending",
    "ESTADO_5": "pending",
    "ESTADO_6": "pending"
  }
}
```

**Asistente pregunta**: "Para continuar necesito que subas la hoja de inscripción del inmueble."

---

## PASO 1: Usuario Sube Hoja de Inscripción

### Documento Procesado (preaviso-process-document)
```json
{
  "folioReal": null,
  "foliosReales": ["1782480", "1782481", "1782482", "1782483", "1782484", "1782485", "1782486"],
  "foliosRealesUnidades": ["1782480", "1782481", "1782482"],
  "foliosRealesInmueblesAfectados": ["1782484", "1782485", "1782486"],
  "foliosConInfo": [
    {
      "folio": "1782480",
      "unidad": "A-101",
      "condominio": "Torre del Sol",
      "ubicacion": "Av. Revolución 123, Zona Centro, Tijuana, B.C.",
      "superficie": "85.5 m²",
      "partida": "123456"
    },
    {
      "folio": "1782483",
      "unidad": "A-102",
      "condominio": "Torre del Sol",
      "ubicacion": "Av. Revolución 123, Zona Centro, Tijuana, B.C.",
      "superficie": "85.5 m²",
      "partida": "123456"
    },
    // ... más folios
  ],
  "partidas": ["123456"],
  "seccion": "CIVIL",
  "propietario": {
    "nombre": "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE",
    "rfc": null,
    "curp": null
  },
  "propietario_contexto": "PROPIETARIO(S)",
  "direccion": {
    "calle": "Av. Revolución",
    "numero": "123",
    "colonia": "Zona Centro",
    "municipio": "Tijuana",
    "estado": "Baja California",
    "codigo_postal": "22000"
  },
  "superficie": "85.5 m²",
  "valor": null,
  "gravamenes": "Hip. BBVA folio 1234"
}
```

### Contexto Actualizado
```json
{
  "inmueble": {
    "folio_real": null, // Aún no seleccionado
    "partidas": ["123456"],
    "seccion": "CIVIL",
    "direccion": {
      "calle": "Av. Revolución",
      "numero": "123",
      "colonia": "Zona Centro",
      "municipio": "Tijuana",
      "estado": "Baja California"
    },
    "superficie": "85.5 m²",
    "datos_catastrales": {
      "condominio": "Torre del Sol"
    }
  },
  "folios": {
    "candidates": [
      { "folio": "1782480", "scope": "unidades", "attrs": { "unidad": "A-101", "superficie": "85.5 m²", "ubicacion": "Av. Revolución 123..." } },
      { "folio": "1782481", "scope": "unidades", "attrs": { /* ... */ } },
      { "folio": "1782482", "scope": "unidades", "attrs": { /* ... */ } },
      { "folio": "1782484", "scope": "inmuebles_afectados", "attrs": { /* ... */ } },
      { "folio": "1782485", "scope": "inmuebles_afectados", "attrs": { /* ... */ } },
      { "folio": "1782486", "scope": "inmuebles_afectados", "attrs": { /* ... */ } }
    ],
    "selection": {
      "selected_folio": null,
      "selected_scope": null,
      "confirmed_by_user": false
    }
  },
  "vendedores": [{
    "party_id": null,
    "tipo_persona": null,
    "titular_registral_confirmado": false,
    "persona_moral": {
      "denominacion_social": "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE"
    }
  }]
}
```

### Estado Calculado
```json
{
  "current_state": "ESTADO_2",
  "blocking_reasons": ["multiple_folio_real_detected", "folio_real_scope_selection_required"],
  "required_missing": ["inmueble.folio_real", "vendedores[].tipo_persona"]
}
```

**Asistente pregunta**: "En la hoja de inscripción detecté más de un folio real. Por favor, indícame exactamente cuál es el folio real que vamos a utilizar para este trámite:

- Folio 1782480 (Unidades)
- Folio 1782481 (Unidades)
- Folio 1782482 (Unidades)
- Folio 1782484 (Inmuebles Afectados)
- Folio 1782485 (Inmuebles Afectados)
- Folio 1782486 (Inmuebles Afectados)

(responde con el número del folio exactamente)"

---

## PASO 2: Usuario Selecciona Folio

**Usuario**: "1782483"

### Sistema Nuevo (Con Handlers)

#### 1. InputParser.parse()
```typescript
// Detecta: número de 7 dígitos en contexto de selección de folio
// Genera: FolioSelectionCommand
{
  type: 'folio_selection',
  timestamp: new Date(),
  payload: {
    selectedFolio: "1782483",
    scope: "unidades", // Inferido porque está en foliosRealesUnidades
    confirmedByUser: true
  }
}
```

#### 2. FolioSelectionHandler.handle()
```typescript
// Valida: folio existe en candidatos ✓
// Busca info: folioInfo para "1782483"
// Actualiza contexto:
{
  inmueble: {
    folio_real: "1782483",
    folio_real_confirmed: true,
    folio_real_scope: "unidades",
    superficie: "85.5 m²", // Auto-populado
    direccion: { ... }, // Auto-populado
    datos_catastrales: {
      unidad: "A-102",
      condominio: "Torre del Sol"
    }
  },
  folios: {
    selection: {
      selected_folio: "1782483",
      selected_scope: "unidades",
      confirmed_by_user: true
    }
  }
}
// Emite eventos: ['FolioSelected', 'InmuebleUpdated']
```

#### 3. StateManager
```typescript
// Actualiza contexto
// Recalcula estado
// Estado nuevo:
{
  current_state: "ESTADO_3",
  blocking_reasons: ["titular_registral_missing"],
  required_missing: ["vendedores[].tipo_persona"]
}
```

#### 4. ResponseGenerator
```typescript
// Estado cambió a ESTADO_3
// Genera pregunta: "Tengo capturado como posible vendedor: 'INMOBILIARIA Y DESARROLLADORA ENCASA...' ¿Confirmas que es el titular registral y me indicas si es persona física o persona moral?"
```

**Asistente pregunta**: "Tengo capturado como posible vendedor: 'INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE'. ¿Confirmas que es el titular registral y me indicas si es persona física o persona moral?"

---

## PASO 3: Usuario Confirma Vendedor

**Usuario**: "sí, es persona moral"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: confirmación (sí) + persona moral
// Genera: TitularConfirmationCommand + TitularRegistralCommand
[
  {
    type: 'titular_confirmation',
    payload: { confirmed: true, tipoPersona: 'persona_moral' }
  },
  {
    type: 'titular_registral',
    payload: {
      name: "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE",
      inferredTipoPersona: 'persona_moral',
      confirmed: true
    }
  }
]
```

#### 2. Handlers Ejecutados
```typescript
// TitularConfirmationHandler
// TitularRegistralHandler
// Actualizan:
{
  vendedores: [{
    party_id: null,
    tipo_persona: "persona_moral",
    titular_registral_confirmado: true,
    persona_moral: {
      denominacion_social: "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE"
    }
  }]
}
// Eventos: ['TitularRegistralConfirmed', 'TitularRegistralUpdated']
```

#### 3. Estado Nuevo
```json
{
  "current_state": "ESTADO_1",
  "required_missing": [],
  "state_status": {
    "ESTADO_2": "completed",
    "ESTADO_3": "completed",
    "ESTADO_1": "incomplete"
  }
}
```

**Asistente pregunta**: "¿La compraventa será de contado o con crédito?"

---

## PASO 4: Usuario Indica Forma de Pago

**Usuario**: "crédito"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: "crédito"
// Genera: PaymentMethodCommand
{
  type: 'payment_method',
  payload: { method: 'credito' }
}
```

#### 2. PaymentMethodHandler.handle()
```typescript
// Crea placeholder de crédito:
{
  creditos: [{
    credito_id: null,
    institucion: null,
    monto: null,
    participantes: [],
    tipo_credito: null
  }]
}
// Eventos: ['PaymentMethodCredito']
```

#### 3. Estado Nuevo
```json
{
  "current_state": "ESTADO_4",
  "state_status": {
    "ESTADO_1": "completed",
    "ESTADO_4": "incomplete"
  }
}
```

**Asistente pregunta**: "¿Quién o quiénes serán los compradores en esta operación? Indícame el nombre completo del primer comprador y si es persona física o persona moral."

---

## PASO 5: Usuario Sube Pasaporte del Comprador

### Documento Procesado
```json
{
  "nombre": "WU, JINWEI",
  "tipoDocumento": "PASAPORTE",
  "rfc": null,
  "curp": null,
  "pais": "CHINA"
}
```

### Sistema Nuevo

#### 1. DocumentHandler (procesa documento)
```typescript
// Detecta: documento de identificación
// Genera: BuyerNameCommand (desde documento)
{
  type: 'buyer_name',
  payload: {
    buyerIndex: 0,
    name: "WU, JINWEI",
    inferredTipoPersona: 'persona_fisica' // Por tipo de documento
  }
}
```

#### 2. BuyerNameHandler.handle()
```typescript
// Actualiza:
{
  compradores: [{
    party_id: "comprador_1",
    tipo_persona: "persona_fisica",
    persona_fisica: {
      nombre: "WU, JINWEI",
      rfc: null,
      curp: null,
      estado_civil: null
    }
  }]
}
// Eventos: ['BuyerNameUpdated']
```

#### 3. Estado Nuevo
```json
{
  "current_state": "ESTADO_4",
  "required_missing": ["compradores[0].persona_fisica.estado_civil"]
}
```

**Asistente pregunta**: "Del pasaporte que subiste tengo identificado al comprador como persona física con nombre: 'WU, JINWEI'. Para poder continuar necesito que me indiques el estado civil de WU, JINWEI (soltero, casado, divorciado o viudo)."

---

## PASO 6: Usuario Indica Estado Civil

**Usuario**: "casado"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: "casado"
// Genera: EstadoCivilCommand
{
  type: 'estado_civil',
  payload: {
    buyerIndex: 0,
    estadoCivil: 'casado'
  }
}
```

#### 2. EstadoCivilHandler.handle()
```typescript
// Actualiza:
{
  compradores: [{
    ...compradores[0],
    persona_fisica: {
      ...compradores[0].persona_fisica,
      estado_civil: 'casado'
    }
  }]
}
// Eventos: ['BuyerEstadoCivilUpdated', 'BuyerCasadoDetected']
```

#### 3. Estado Nuevo
```json
{
  "current_state": "ESTADO_4",
  "required_missing": []
}
// Pero el sistema detecta: comprador casado → necesita información del cónyuge
```

**Asistente pregunta**: "Al ser WU, JINWEI de estado civil casado, necesito aclarar lo siguiente: ¿La operación o el crédito se realizará de manera conjunta con su cónyuge? Responde sí o no."

---

## PASO 7: Usuario Confirma Participación del Cónyuge

**Usuario**: "sí"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: confirmación "sí" en contexto de cónyuge
// Genera: ConyugeParticipationCommand
{
  type: 'conyuge_participation',
  payload: {
    buyerIndex: 0,
    participa: true
  }
}
```

#### 2. ConyugeParticipationHandler.handle()
```typescript
// Actualiza:
{
  compradores: [{
    ...compradores[0],
    persona_fisica: {
      ...compradores[0].persona_fisica,
      conyuge: {
        participa: true,
        nombre: null // Aún no capturado
      }
    }
  }]
}
// Eventos: ['ConyugeParticipationConfirmed']
```

**Asistente pregunta**: "Perfecto. En este crédito donde participa WU, JINWEI y su cónyuge, ¿con qué institución será el crédito? (por ejemplo: BBVA, Santander, Banorte, Infonavit, Fovissste, etc.)"

---

## PASO 8: Usuario Indica Institución de Crédito

**Usuario**: "BBVA"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: "BBVA" en contexto de crédito
// Genera: CreditInstitutionCommand
{
  type: 'credit_institution',
  payload: {
    creditIndex: 0,
    institution: "BBVA"
  }
}
```

#### 2. CreditInstitutionHandler.handle()
```typescript
// Valida: "BBVA" es válido ✓
// Actualiza:
{
  creditos: [{
    credito_id: null,
    institucion: "BBVA",
    monto: null,
    participantes: [],
    tipo_credito: null
  }]
}
// Eventos: ['CreditInstitutionUpdated']
```

**Asistente pregunta**: "Para el crédito con BBVA, ¿quiénes participarán específicamente en ese crédito y con qué carácter? Por favor indícame, para cada persona: nombre y rol dentro del crédito (acreditado o coacreditado)."

---

## PASO 9: Usuario Sube Pasaporte del Cónyuge

### Documento Procesado
```json
{
  "nombre": "QIAOZHEN ZHANG",
  "tipoDocumento": "PASAPORTE",
  "pais": "CHINA"
}
```

### Sistema Nuevo

#### 1. DocumentHandler (detecta que es cónyuge)
```typescript
// Detecta: nombre diferente al comprador principal
// Detecta: comprador casado y cónyuge participa
// Genera: ConyugeNameCommand
{
  type: 'conyuge_name',
  payload: {
    buyerIndex: 0,
    name: "QIAOZHEN ZHANG"
  }
}
```

#### 2. ConyugeNameHandler.handle()
```typescript
// Actualiza:
{
  compradores: [{
    ...compradores[0],
    persona_fisica: {
      ...compradores[0].persona_fisica,
      conyuge: {
        participa: true,
        nombre: "QIAOZHEN ZHANG"
      }
    }
  }]
}
// Eventos: ['ConyugeNameUpdated']
```

**Asistente pregunta**: "Del pasaporte que subiste tengo identificada a la cónyuge como 'QIAOZHEN ZHANG'. Para el crédito con BBVA, ¿quiénes participarán específicamente en ese crédito y con qué carácter? (acreditado o coacreditado)"

---

## PASO 10: Usuario Indica Participantes del Crédito

**Usuario**: "el comprador como acreditado y su conyugue como coacreditado"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: patrón "el comprador como acreditado y su conyugue como coacreditado"
// Genera: 2 comandos
[
  {
    type: 'credit_participant',
    payload: {
      creditIndex: 0,
      participant: {
        partyId: "comprador_1", // Resuelto: "el comprador"
        role: "acreditado",
        isConyuge: false
      }
    }
  },
  {
    type: 'credit_participant',
    payload: {
      creditIndex: 0,
      participant: {
        name: "QIAOZHEN ZHANG", // Resuelto por ConyugeService
        role: "coacreditado",
        isConyuge: true
      }
    }
  }
]
```

#### 2. CreditParticipantHandler.handle() (ejecuta 2 veces)

**Primera ejecución (acreditado)**:
```typescript
// Resuelve party_id: "comprador_1" → nombre: "WU, JINWEI"
// Actualiza:
{
  creditos: [{
    ...creditos[0],
    participantes: [{
      party_id: "comprador_1",
      rol: "acreditado",
      nombre: null // No necesario porque tiene party_id
    }]
  }]
}
```

**Segunda ejecución (coacreditado)**:
```typescript
// Resuelve nombre del cónyuge: ConyugeService.getConyugeNombre(context)
// → Retorna: "QIAOZHEN ZHANG"
// Actualiza:
{
  creditos: [{
    ...creditos[0],
    participantes: [
      {
        party_id: "comprador_1",
        rol: "acreditado",
        nombre: null
      },
      {
        party_id: null, // Cónyuge aún no es comprador separado
        rol: "coacreditado",
        nombre: "QIAOZHEN ZHANG" // SIEMPRE incluir nombre para cónyuge
      }
    ]
  }],
  compradores: [
    compradores[0], // Comprador principal
    {
      // Crea segundo comprador para el cónyuge
      party_id: null,
      tipo_persona: "persona_fisica",
      persona_fisica: {
        nombre: "QIAOZHEN ZHANG",
        rfc: null,
        curp: null,
        estado_civil: null
      }
    }
  ],
  control_impresion: {
    imprimir_conyuges: true,
    imprimir_coacreditados: true,
    imprimir_creditos: true
  }
}
// Eventos: ['CreditParticipantUpdated', 'ConyugeAddedAsBuyer']
```

#### 3. Estado Nuevo
```json
{
  "current_state": "ESTADO_5",
  "state_status": {
    "ESTADO_4": "completed",
    "ESTADO_5": "completed" // Crédito completo
  }
}
```

#### 4. Estado Nuevo → Avanza a ESTADO_6
```json
{
  "current_state": "ESTADO_6",
  "state_status": {
    "ESTADO_6": "pending"
  }
}
```

**Asistente pregunta**: "PASO 6 (Gravamen): ¿hay algún gravamen/hipoteca VIGENTE o PENDIENTE por cancelar? (sí/no)"

---

## PASO 11: Usuario Confirma Gravámenes

**Usuario**: "sí"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: "sí" en contexto de ESTADO_6
// Genera: EncumbranceCommand
{
  type: 'encumbrance',
  payload: {
    exists: true,
    cancellationConfirmed: null // Aún no confirmado
  }
}
```

#### 2. EncumbranceHandler.handle()
```typescript
// Crea gravamen placeholder:
{
  inmueble: {
    ...inmueble,
    existe_hipoteca: true
  },
  gravamenes: [{
    gravamen_id: null,
    tipo: "hipoteca",
    institucion: null,
    numero_credito: null,
    cancelacion_confirmada: null // Pendiente de confirmación
  }]
}
// Eventos: ['EncumbranceUpdated']
```

**Asistente pregunta**: "¿La hipoteca o gravamen que está vigente quedará cancelada con esta operación? Responde sí o no, por favor."

---

## PASO 12: Usuario Confirma Cancelación

**Usuario**: "sí"

### Sistema Nuevo

#### 1. InputParser.parse()
```typescript
// Detecta: "sí" en contexto de cancelación de gravamen
// Genera: EncumbranceCommand (actualización)
{
  type: 'encumbrance',
  payload: {
    exists: true,
    cancellationConfirmed: false // "sí" = se cancelará (false = pendiente de cancelar)
  }
}
```

#### 2. EncumbranceHandler.handle()
```typescript
// Actualiza:
{
  gravamenes: [{
    gravamen_id: null,
    tipo: "hipoteca",
    institucion: null,
    numero_credito: null,
    cancelacion_confirmada: false // Se cancelará en esta escritura
  }]
}
// Eventos: ['EncumbranceCancellationConfirmed']
```

#### 3. Estado Final
```json
{
  "current_state": "ESTADO_8",
  "state_status": {
    "ESTADO_1": "completed",
    "ESTADO_2": "completed",
    "ESTADO_3": "completed",
    "ESTADO_4": "completed",
    "ESTADO_5": "completed",
    "ESTADO_6": "completed",
    "ESTADO_8": "ready"
  },
  "required_missing": [],
  "blocking_reasons": []
}
```

**Asistente responde**: "Listo: ya quedó capturada la información necesaria. Puedes ver el documento o descargarlo usando los botones de arriba (Ver Texto / Descargar Word / Descargar PDF)."

---

## PASO 13: Generación del Documento

### Contexto Final (PreavisoData)
```json
{
  "tipoOperacion": "compraventa",
  "vendedores": [{
    "party_id": null,
    "tipo_persona": "persona_moral",
    "titular_registral_confirmado": true,
    "persona_moral": {
      "denominacion_social": "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE"
    }
  }],
  "compradores": [
    {
      "party_id": "comprador_1",
      "tipo_persona": "persona_fisica",
      "persona_fisica": {
        "nombre": "WU, JINWEI",
        "rfc": null,
        "curp": null,
        "estado_civil": "casado",
        "conyuge": {
          "nombre": "QIAOZHEN ZHANG",
          "participa": true
        }
      }
    },
    {
      "party_id": null,
      "tipo_persona": "persona_fisica",
      "persona_fisica": {
        "nombre": "QIAOZHEN ZHANG",
        "rfc": null,
        "curp": null,
        "estado_civil": null
      }
    }
  ],
  "creditos": [{
    "credito_id": null,
    "institucion": "BBVA",
    "monto": null,
    "tipo_credito": null,
    "participantes": [
      {
        "party_id": "comprador_1",
        "rol": "acreditado",
        "nombre": null
      },
      {
        "party_id": null,
        "rol": "coacreditado",
        "nombre": "QIAOZHEN ZHANG"
      }
    ]
  }],
  "gravamenes": [{
    "gravamen_id": null,
    "tipo": "hipoteca",
    "institucion": null,
    "numero_credito": null,
    "cancelacion_confirmada": false
  }],
  "inmueble": {
    "folio_real": "1782483",
    "folio_real_confirmed": true,
    "folio_real_scope": "unidades",
    "partidas": ["123456"],
    "seccion": "CIVIL",
    "direccion": {
      "calle": "Av. Revolución",
      "numero": "123",
      "colonia": "Zona Centro",
      "municipio": "Tijuana",
      "estado": "Baja California",
      "codigo_postal": "22000"
    },
    "superficie": "85.5 m²",
    "valor": null,
    "datos_catastrales": {
      "unidad": "A-102",
      "condominio": "Torre del Sol"
    },
    "existe_hipoteca": true,
    "all_registry_pages_confirmed": false
  },
  "control_impresion": {
    "imprimir_conyuges": true,
    "imprimir_coacreditados": true,
    "imprimir_creditos": true
  }
}
```

### Conversión a PreavisoSimplifiedJSON (para template)
```json
{
  "tipoOperacion": "compraventa",
  "vendedores": [{
    "nombre": "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE",
    "tipoPersona": "persona_moral",
    "denominacion_social": "INMOBILIARIA Y DESARROLLADORA ENCASA, SOCIEDAD ANONIMA PROMOTORA DE INVERSION DE CAPITAL VARIABLE"
  }],
  "compradores": [
    {
      "nombre": "WU, JINWEI",
      "tipoPersona": "persona_fisica",
      "estado_civil": "casado",
      "necesitaCredito": true
    },
    {
      "nombre": "QIAOZHEN ZHANG",
      "tipoPersona": "persona_fisica"
    }
  ],
  "creditos": [{
    "institucion": "BBVA",
    "monto": null,
    "tipo_credito": null,
    "participantes": [
      {
        "nombre": "WU, JINWEI", // Resuelto desde party_id
        "rol": "acreditado"
      },
      {
        "nombre": "QIAOZHEN ZHANG", // Ya tiene nombre
        "rol": "coacreditado"
      }
    ]
  }],
  "inmueble": {
    "direccion": "Av. Revolución 123, Zona Centro, Tijuana, B.C.",
    "folioReal": "1782483",
    "partidas": ["123456"],
    "seccion": "CIVIL",
    "superficie": "85.5 m²",
    "valor": null,
    "unidad": "A-102",
    "condominio": "Torre del Sol"
  },
  "gravamenes": [{
    "tipo": "hipoteca",
    "cancelacion_confirmada": false
  }],
  "actos": {
    "compraventa": true,
    "aperturaCreditoComprador": true,
    "cancelacionHipoteca": true // Porque existe_hipoteca=true y cancelacion_confirmada=false
  }
}
```

### Documento Generado (Template Handlebars)

**SECCIÓN I - CONTRATO DE COMPRAVENTA**
- Vendedor: INMOBILIARIA Y DESARROLLADORA ENCASA...
- Compradores: WU, JINWEI y QIAOZHEN ZHANG
- Inmueble: Folio 1782483, Unidad A-102, Torre del Sol, Av. Revolución 123...

**SECCIÓN II - CONTRATO DE APERTURA DE CRÉDITO CON GARANTÍA HIPOTECARIA**
- Acreedor: BBVA
- Deudor: WU, JINWEI (ACREDITADO) y QIAOZHEN ZHANG (COACREDITADO)

**SECCIÓN III - CANCELACIÓN DE HIPOTECA**
- Hipoteca a cancelar con esta operación

---

## Resumen: Todos los Datos Capturados

### 1. **Inmueble**
- ✅ Folio real: 1782483
- ✅ Scope: unidades
- ✅ Partidas: 123456
- ✅ Sección: CIVIL
- ✅ Dirección completa
- ✅ Superficie: 85.5 m²
- ✅ Datos catastrales (unidad, condominio)

### 2. **Vendedor**
- ✅ Nombre/denominación social
- ✅ Tipo persona: moral
- ✅ Confirmación de titular registral

### 3. **Compradores** (2)
- ✅ Comprador 1: WU, JINWEI
  - Tipo persona: física
  - Estado civil: casado
  - Cónyuge: QIAOZHEN ZHANG (participa)
- ✅ Comprador 2: QIAOZHEN ZHANG (cónyuge)
  - Tipo persona: física

### 4. **Crédito**
- ✅ Institución: BBVA
- ✅ Participantes:
  - WU, JINWEI (acreditado)
  - QIAOZHEN ZHANG (coacreditado)

### 5. **Gravámenes**
- ✅ Existe hipoteca: sí
- ✅ Cancelación confirmada: se cancelará en esta operación

### 6. **Control de Impresión**
- ✅ Imprimir cónyuges
- ✅ Imprimir coacreditados
- ✅ Imprimir créditos

---

## Handlers Utilizados en Este Flujo

1. **FolioSelectionHandler** - Selección de folio
2. **TitularRegistralHandler** - Nombre del titular
3. **TitularConfirmationHandler** - Confirmación de titular
4. **PaymentMethodHandler** - Forma de pago
5. **BuyerNameHandler** - Nombre del comprador (desde documento)
6. **EstadoCivilHandler** - Estado civil
7. **ConyugeParticipationHandler** - Participación del cónyuge
8. **ConyugeNameHandler** - Nombre del cónyuge (desde documento)
9. **CreditInstitutionHandler** - Institución de crédito
10. **CreditParticipantHandler** - Participantes del crédito (2 veces)
11. **EncumbranceHandler** - Gravámenes (2 veces: creación y confirmación)

**Total: 11 handlers diferentes, algunos ejecutados múltiples veces**

---

## Comparación: Sistema Actual vs Sistema Nuevo

### Sistema Actual:
- 1 función de 1100+ líneas procesando todo
- Triple procesamiento del mismo input
- Múltiples merges de contexto
- Difícil de debuggear qué pasa en cada paso

### Sistema Nuevo:
- 11 handlers pequeños (30-120 líneas cada uno)
- Un comando → un handler → un resultado
- Un solo merge (StateManager)
- Fácil de debuggear: cada paso es independiente

¿Te queda claro ahora cómo funciona TODO el flujo completo? ¿Hay algún paso específico que quieras que detalle más?
