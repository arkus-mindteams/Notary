import { Command } from '../../../../base/types'
import { PreavisoDocumentTypeHandler } from './index'
import { ValidationService } from '../../../../shared/services/validation-service'

export class InscripcionHandler implements PreavisoDocumentTypeHandler {
    getType(): string {
        return 'inscripcion'
    }

    getPrompts(): { systemPrompt: string; userPrompt: string } {
        return {
            systemPrompt: `Eres un experto en análisis de documentos registrales (hojas de inscripción, certificados registrales, etc.). Analiza el documento METICULOSAMENTE y extrae TODA la información disponible en formato JSON:

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
      "ubicacion": "dirección completa del inmueble asociado a este folio (string simple para fallback)",
      "direccion": {
        "calle": "nombre de la calle",
        "numero": "número exterior",
        "colonia": "colonia",
        "municipio": "municipio",
        "codigo_postal": "CP"
      },
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
  "gravamenes": "Array de objetos con detalles de gravámenes si existen, EJEMPLO: [{ acreedor: 'BANCO...', monto: '...', moneda: 'MXN' }]. Si el documento dice explícitamente 'LIBRE DE GRAVAMEN', 'SIN GRAVAMEN' o 'NO SE REPORTAN GRAVÁMENES', retorna el string exacto 'LIBRE'. Si no hay información, retornar null",
  "numeroExpediente": "número de expediente registral si está visible",
  "textoCompleto": "Transcripción literal de TODO el texto visible en el documento, en orden de lectura (arriba a abajo). Incluye encabezados, tablas, sellos legibles, notas al pie y cualquier texto. Conserva saltos de línea entre párrafos. No omitas nada de lo que se pueda leer. Si hay varias secciones, transcríbelas en orden."
}

INSTRUCCIONES CRÍTICAS:
1. Extrae SOLO la información que puedas leer CLARAMENTE en el documento. Si no estás seguro, usa null.
1.1 PROPIETARIO/TITULAR (CRÍTICO):
   - El campo propietario.nombre SOLO puede salir de la sección rotulada como "PROPIETARIO(S)" o "TITULAR REGISTRAL" (si existe).
   - NO uses nombres de personal del registro/notaría: ignora "EJECUTIVO", "ANALISTA", "SUBREGISTRADOR", "COTEJADO", "COTEJADO CONTRA ORIGINAL", "MÉTODO DE AUTENTICIDAD", "FIRMA ELECTRÓNICA", "CÓDIGO DE AUTENTICIDAD".
   - Si no encuentras claramente el propietario bajo PROPIETARIO(S)/TITULAR REGISTRAL, deja propietario.nombre = null y propietario_contexto = "DESCONOCIDO".
   - Si lo encuentras, llena propietario_contexto como "PROPIETARIO(S)" o "TITULAR REGISTRAL" según el encabezado.
2. FOLIOS REALES (CRÍTICO): recorre TODA la página METICULOSAMENTE y detecta TODAS las ocurrencias del patrón "FOLIO REAL:" (puede aparecer múltiples veces).
   - Busca en TODAS las secciones: UNIDADES, "INMUEBLE(S) AFECTADO(S)", y cualquier otra sección.
   - Si encuentras más de un folio real, ponlos TODOS en foliosReales[] (sin omitir ninguno) y pon "folioReal": null.
   - NO omitas folios consecutivos (ej: si ves 1782480, 1782481, 1782482, 1782483, 1782484, 1782485, 1782486, incluye TODOS).
   - Si solo encuentras uno, ponlo en foliosReales[] y también en "folioReal".
   - NO te quedes con el primero: debes escanear el documento completo (arriba, medio, abajo, todas las secciones) antes de responder.
   - Además clasifica los folios según su sección: llena foliosRealesUnidades[] y foliosRealesInmueblesAfectados[] cuando aplique.
   - Si un folio aparece bajo el encabezado "INMUEBLE(S) AFECTADO(S)" o "INMUEBLES AFECTADOS", debe ir en foliosRealesInmueblesAfectados[].
3. Si detectas múltiples folios, intenta extraer información del inmueble asociada a cada folio en foliosConInfo[].
   - Si el documento muestra claramente qué información corresponde a cada folio, asóciala correctamente.
   - Si no puedes asociar información específica a cada folio, usa los campos generales (ubicacion, superficie, partida, datosCatastrales).
   - Si puedes, incluye una entrada en foliosConInfo[] por CADA folio detectado (al menos con { folio }).
4. Para partidas: prioriza las partidas que aparecen en la sección TÍTULO / INSCRIPCIÓN (esas van en partidasTitulo[]). NO uses las de ANTECEDENTES como partida principal.
   - Si encuentras partidas en ANTECEDENTES, colócalas en partidasAntecedentes[].
   - En partidas[] incluye TODAS las partidas detectadas, pero asegúrate de incluir las de partidasTitulo[] si existen.
5. Para dirección: si está disponible como objeto estructurado, usa direccion{}. Si solo está como texto, usa ubicacion.
6. NO extraigas ni infieras forma de pago o institución de crédito desde la inscripción (eso se confirma con el usuario en el chat).
7. Si algún campo no está disponible o no es legible, usa null (no inventes valores).
8. textoCompleto (OBLIGATORIO): Transcribe TODO el texto que puedas leer en el documento, sin resumir. Es para conservar el contenido completo; inclúyelo siempre que haya texto visible.`,
            userPrompt: 'Analiza este documento de inscripción registral METICULOSAMENTE. Extrae TODA la información que puedas leer claramente. IMPORTANTE: Busca TODOS los folios reales en TODAS las secciones del documento (UNIDADES, INMUEBLE(S) AFECTADO(S), y cualquier otra). NO omitas ningún folio, incluso si son números consecutivos. Incluye también: partidas registrales (todas si hay múltiples), sección, dirección completa del inmueble, datos catastrales (lote, manzana, fraccionamiento, condominio, unidad), superficie, propietario/titular registral, y cualquier gravamen o hipoteca visible. Si hay múltiples folios, intenta asociar la información del inmueble a cada folio según cómo aparezca en el documento.'
        }
    }

    process(extracted: any, context: any): Command[] {
        const commands: Command[] = []

        // Folios: usar foliosReales del extracted
        const mainList = Array.isArray(extracted.foliosReales) ? extracted.foliosReales : []
        const unidadesList = Array.isArray(extracted.foliosRealesUnidades) ? extracted.foliosRealesUnidades : []
        const afectadosList = Array.isArray(extracted.foliosRealesInmueblesAfectados) ? extracted.foliosRealesInmueblesAfectados : []

        const combined = new Set([...mainList, ...unidadesList, ...afectadosList])
        const folios = Array.from(combined).filter(Boolean).map((f: any) => String(f))

        // Asegurar que todos los folios de foliosConInfo también estén en la lista
        const foliosFromInfo = Array.isArray(extracted.foliosConInfo)
            ? extracted.foliosConInfo.map((f: any) => String(f?.folio || '')).filter(Boolean)
            : []

        // Mergear ambas listas (dedupe)
        const allFolios = new Set([...folios, ...foliosFromInfo])
        const mergedFolios = Array.from(allFolios).filter(Boolean)


        const existingSelection = context.folios?.selection
        const existingFolioConfirmed = existingSelection?.confirmed_by_user === true &&
            existingSelection?.selected_folio

        const hasPreviousCandidates = Array.isArray(context.folios?.candidates) && context.folios.candidates.length > 0

        if (mergedFolios.length > 1) {
            commands.push({
                type: 'multiple_folios_detected',
                timestamp: new Date(),
                payload: {
                    folios: mergedFolios,
                    foliosConInfo: extracted.foliosConInfo || [],
                    scope: {
                        unidades: extracted.foliosRealesUnidades || [],
                        inmuebles_afectados: extracted.foliosRealesInmueblesAfectados || []
                    }
                }
            })
        } else if (mergedFolios.length === 1) {
            const detectedFolio = mergedFolios[0]
            const normalizeFolio = (f: any) => String(f || '').replace(/\D/g, '')
            const normalizedDetected = normalizeFolio(detectedFolio)
            const normalizedExisting = existingFolioConfirmed ? normalizeFolio(existingFolioConfirmed) : null

            if (hasPreviousCandidates && normalizedExisting && normalizedDetected === normalizedExisting) {
                const folioInfo = extracted.foliosConInfo?.find((f: any) =>
                    normalizeFolio(f?.folio) === normalizedDetected
                ) || extracted.foliosConInfo?.[0]

                commands.push({
                    type: 'folio_selection',
                    timestamp: new Date(),
                    payload: {
                        selectedFolio: detectedFolio,
                        folioInfo: folioInfo,
                        confirmedByUser: true
                    }
                })
            } else {
                commands.push({
                    type: 'multiple_folios_detected',
                    timestamp: new Date(),
                    payload: {
                        folios: mergedFolios,
                        foliosConInfo: extracted.foliosConInfo || [],
                        scope: {
                            unidades: extracted.foliosRealesUnidades || [],
                            inmuebles_afectados: extracted.foliosRealesInmueblesAfectados || []
                        }
                    }
                })
            }
        }

        if (extracted.propietario?.nombre) {
            const tipoPersona = ValidationService.inferTipoPersona(extracted.propietario.nombre) || 'persona_fisica'
            commands.push({
                type: 'titular_registral',
                timestamp: new Date(),
                payload: {
                    name: extracted.propietario.nombre,
                    rfc: extracted.propietario.rfc,
                    curp: extracted.propietario.curp,
                    inferredTipoPersona: tipoPersona,
                    confirmed: true,
                    source: 'documento_inscripcion'
                }
            })
        }

        if (extracted.gravamenes) {
            if (extracted.gravamenes === 'LIBRE' || extracted.gravamenes === 'SIN GRAVAMEN') {
                commands.push({
                    type: 'encumbrance',
                    timestamp: new Date(),
                    payload: { exists: false, source: 'documento_inscripcion' }
                })
            } else if (Array.isArray(extracted.gravamenes) && extracted.gravamenes.length > 0) {
                commands.push({
                    type: 'encumbrance',
                    timestamp: new Date(),
                    payload: { exists: true, source: 'documento_inscripcion' }
                })

                extracted.gravamenes.forEach((g: any, idx: number) => {
                    if (g && (g.acreedor || g.monto)) {
                        commands.push({
                            type: 'gravamen_acreedor',
                            timestamp: new Date(),
                            payload: {
                                gravamenIndex: idx,
                                institution: g.acreedor || 'ACREEDOR DESCONOCIDO',
                                monto: g.monto || null,
                                moneda: g.moneda || 'MXN',
                                source: 'documento_inscripcion'
                            }
                        })
                    }
                })
            }
        }

        return commands
    }
}
