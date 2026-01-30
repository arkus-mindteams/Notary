
/**
 * Prompts for Document Analysis via Vision/OCR
 */

export const PROMPT_DOC_ESCRITURA = `Eres un experto en análisis de documentos notariales. Analiza la Escritura o título de propiedad y extrae la siguiente información en formato JSON:
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

export const PROMPT_DOC_PLANO = `Eres un experto en análisis de planos catastrales. Analiza el plano y extrae la siguiente información en formato JSON:
{
  "superficie": "superficie en metros cuadrados",
  "lote": "número de lote si está disponible",
  "manzana": "número de manzana si está disponible",
  "fraccionamiento": "nombre del fraccionamiento si está disponible",
  "medidas": "medidas del terreno si están disponibles"
}

Extrae SOLO la información que puedas leer claramente.`

export const PROMPT_DOC_IDENTIFICACION = `Eres un experto en análisis de documentos de identificación oficial mexicana. Analiza el documento (puede ser INE/IFE, Pasaporte, Licencia de conducir, CURP, o cualquier otro documento oficial) y extrae TODA la información disponible en formato JSON:
{
  "nombre": "nombre completo como aparece en el documento",
  "rfc": "RFC si está visible en el documento",
  "curp": "CURP si está visible en el documento",
  "direccion": "dirección completa si está visible",
  "fechaNacimiento": "fecha de nacimiento si está visible",
  "tipoDocumento": "INE/IFE, Pasaporte, Licencia, CURP, etc.",
  "numeroDocumento": "número de credencial/pasaporte/etc si está visible"
}

IMPORTANTE:
- Extrae TODA la información que puedas leer claramente del documento
- Si es una INE/IFE, busca nombre completo en el frente, CURP y dirección en el reverso
- Si es un pasaporte, extrae nombre, fecha de nacimiento, número de pasaporte
- Si es una CURP, extrae nombre, CURP, fecha de nacimiento
- Si es una licencia, extrae nombre, dirección, número de licencia
- Lee cuidadosamente todos los campos visibles en el documento
- NO infieras si esta identificación corresponde a comprador o vendedor. No incluyas ese campo.`

export const PROMPT_DOC_ACTA_MATRIMONIO = `Eres un experto en análisis de actas de matrimonio. Analiza el documento y extrae la siguiente información en formato JSON:
{
  "conyuge1": { "nombre": "nombre completo del cónyuge 1 tal como aparece" },
  "conyuge2": { "nombre": "nombre completo del cónyuge 2 tal como aparece" },
  "fechaMatrimonio": "fecha del matrimonio si está visible",
  "lugarRegistro": "lugar/registro/oficialía si está visible"
}

IMPORTANTE:
- Extrae SOLO lo que puedas leer claramente. Si no estás seguro, usa null.
- NO infieras roles (comprador/vendedor). Solo extrae datos del acta.`

export const PROMPT_DOC_INSCRIPCION = `Eres un experto en análisis de documentos registrales (hojas de inscripción, certificados registrales, etc.). Analiza el documento METICULOSAMENTE y extrae TODA la información disponible en formato JSON:

{
  "folioReal": "número del folio real si está visible (solo si hay un único folio)",
  "foliosReales": ["lista de TODOS los folios reales detectados (strings). Si detectas más de uno, inclúyelos todos aquí. Si detectas solo uno, incluye ese único valor. Si no detectas ninguno, usa []"],
  "foliosRealesUnidades": ["lista de folios reales detectados en secciones de UNIDADES (p.ej. 'DEPARTAMENTO/LOCAL/ESTACIONAMIENTO', 'UNIDAD', 'CONJ. HABITACIONAL'). Si no hay, []"],
  "foliosRealesInmueblesAfectados": ["lista de folios reales detectados específicamente bajo el encabezado 'INMUEBLE(S) AFECTADO(S)'. Si no hay, []"],
  "foliosConInfo": [
    {
      "folio": "número del folio real (OBLIGATORIO si hay múltiples folios)",
      "unidad": "número o identificador de unidad/condominio asociado a este folio si está visible",
      "condominio": "nombre del condominio asociado a este folio si está visible",
      "partida": "partida registral asociada a este folio si está visible",
      "ubicacion": "dirección completa del inmueble asociado a este folio si está visible",
      "superficie": "superficie del inmueble asociado a este folio si está disponible (con unidad: m², m2, metros, etc.)",
      "lote": "número de lote asociado a este folio si está visible",
      "manzana": "número de manzana asociado a este folio si está visible",
      "fraccionamiento": "nombre del fraccionamiento asociado a este folio si está visible",
      "colonia": "nombre de la colonia asociado a este folio si está visible"
    }
  ],
  "seccion": "sección registral si está visible (CIVIL, MIXTA, etc.)",
  "partidasTitulo": ["lista de partidas detectadas en la sección TÍTULO / INSCRIPCIÓN (NO en ANTECEDENTES). Si hay múltiples, inclúyelas todas. Si no hay, []"],
  "partidasAntecedentes": ["lista de partidas detectadas SOLO en la sección ANTECEDENTES REGISTRALES (si existen). Si no hay, []"],
  "partidas": ["lista de TODAS las partidas registrales detectadas (strings). Si hay múltiples, inclúyelas todas. Si hay una sola, inclúyela. Si no hay, usa []"],
  "partida": "partida registral si está visible (para folio único, usar solo si partidas[] está vacío)",
  "ubicacion": "dirección completa del inmueble si está visible (para folio único)",
  "direccion": {
    "calle": "nombre de la calle si está visible",
    "numero": "número exterior si está visible",
    "colonia": "nombre de la colonia si está visible",
    "municipio": "municipio si está visible",
    "estado": "estado si está visible",
    "codigo_postal": "código postal si está visible"
  },
  "datosCatastrales": {
    "lote": "número de lote si está visible",
    "manzana": "número de manzana si está visible",
    "fraccionamiento": "nombre del fraccionamiento si está visible",
    "condominio": "nombre del condominio si está visible",
    "unidad": "número de unidad si está visible",
    "modulo": "módulo si está visible"
  },
  "propietario": {
    "nombre": "nombre completo del propietario/titular registral si está visible (exactamente como aparece)",
    "rfc": "RFC si está disponible",
    "curp": "CURP si está disponible"
  },
  "propietario_contexto": "de dónde se extrajo el nombre del propietario. Valores: \"PROPIETARIO(S)\", \"TITULAR REGISTRAL\", \"DESCONOCIDO\"",
  "superficie": "superficie del inmueble si está disponible (para folio único, con unidad: m², m2, metros, etc.)",
  "valor": "valor del inmueble si está disponible",
  "gravamenes": "información sobre gravámenes o hipotecas si está visible, o null si no hay",
  "numeroExpediente": "número de expediente registral si está visible"
}

INSTRUCCIONES CRÍTICAS:
1. Extrae SOLO la información que puedas leer CLARAMENTE en el documento. Si no estás seguro, usa null.
1.1 PROPIETARIO/TITULAR (CRÍTICO):
   - El campo propietario.nombre SOLO puede salir de la sección rotulada como "PROPIETARIO(S)" o "TITULAR REGISTRAL" (si existe).
   - NO uses nombres de personal del registro/notaría: ignora "EJECUTIVO", "ANALISTA", "SUBREGISTRADOR", "COTEJADO", "COTEJADO CONTRA ORIGINAL", "MÉTODO DE AUTENTICIDAD", "FIRMA ELECTRÓNICA", "CÓDIGO DE AUTENTICIDAD".
   - Si no encuentras claramente el propietario bajo PROPIETARIO(S)/TITULAR REGISTRAL, deja propietario.nombre = null y propietario_contexto = "DESCONOCIDO".
   - Si lo encuentras, llena propietario_contexto como "PROPIETARIO(S)" o "TITULAR REGISTRAL" según el encabezado.
2. FOLIOS REALES (CRÍTICO): recorre TODA la página y detecta TODAS las ocurrencias del patrón "FOLIO REAL:" (puede aparecer múltiples veces).
   - Si encuentras más de un folio real, ponlos TODOS en foliosReales[] (sin omitir ninguno) y pon "folioReal": null.
   - Si solo encuentras uno, ponlo en foliosReales[] y también en "folioReal".
   - NO te quedes con el primero: debes escanear el documento completo antes de responder.
   - Además clasifica los folios según su sección: llena foliosRealesUnidades[] y foliosRealesInmueblesAfectados[] cuando aplique.
3. Si detectas múltiples folios, intenta extraer información del inmueble asociada a cada folio en foliosConInfo[].
   - Si el documento muestra claramente qué información corresponde a cada folio, asóciala correctamente.
   - Si no puedes asociar información específica a cada folio, usa los campos generales (ubicacion, superficie, partida, datosCatastrales).
   - Si puedes, incluye una entrada en foliosConInfo[] por CADA folio detectado (al menos con { folio }).
4. Para partidas: prioriza las partidas que aparecen en la sección TÍTULO / INSCRIPCIÓN (esas van en partidasTitulo[]). NO uses las de ANTECEDENTES como partida principal.
   - Si encuentras partidas en ANTECEDENTES, colócalas en partidasAntecedentes[].
   - En partidas[] incluye TODAS las partidas detectadas, pero asegúrate de incluir las de partidasTitulo[] si existen.
5. Para dirección: si está disponible como objeto estructurado, usa direccion{}. Si solo está como texto, usa ubicacion.
6. NO extraigas ni infieras forma de pago o institución de crédito desde la inscripción (eso se confirma con el usuario en el chat).
7. Si algún campo no está disponible o no es legible, usa null (no inventes valores).`

export const PROMPT_DOC_DEFAULT = `Eres un experto en análisis de documentos notariales. Analiza el documento y extrae toda la información relevante que puedas identificar relacionada con:
- Folio real, sección, partida
- Datos de personas (nombres, RFC, CURP)
- Información del inmueble (dirección, superficie, valor)
- Información crediticia si está presente (forma de pago, institución de crédito)

Devuelve la información en formato JSON estructurado, incluyendo un campo "formaPago" si el documento menciona si la operación será de contado o con crédito.`

export const PROMPT_OCR_SYSTEM = `Eres un OCR extractor. Devuelve SOLO JSON con este shape:
{
  "text": "transcripción del texto visible en la imagen, en orden de lectura. Si hay secciones/tablas, conserva saltos de línea. No inventes texto."
}

REGLAS:
- Incluye TODO el texto legible.
- No agregues comentarios ni interpretación.
- Si no se ve claro una palabra, omítela o usa [ilegible].`

export const PROMPT_FOLIO_SCAN = `Eres un extractor especializado. Tu ÚNICA tarea es:
1) encontrar TODOS los "FOLIO REAL:" en esta imagen y
2) extraer, si está visible cerca de cada folio, datos básicos (unidad y/o superficie y/o ubicación).

Devuelve SOLO este JSON:
{
  "folios": [
    {
      "folio": "número de folio real (string)",
      "unidad": "unidad si aplica (string o null)",
      "condominio": "condominio/conjunto si aplica (string o null)",
      "ubicacion": "ubicación/dirección si aplica (string o null)",
      "superficie": "superficie si aplica (string con unidad) o null"
    }
  ],
  "foliosReales": ["lista de TODOS los folios reales detectados como strings, sin omitir ninguno. Si no encuentras ninguno, []"]
}

REGLAS:
- Escanea TODA la imagen (arriba, en medio y abajo). No te quedes con el primero.
- Incluye TODOS, incluso si aparecen en distintas secciones (p.ej. unidades y luego "INMUEBLE(S) AFECTADO(S)").
- Si hay varios, deben ir todos en el array.
- NO inventes datos: si no se ve claro, usa null.`
