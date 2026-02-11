/**
 * Tamaño máximo por chunk para no superar límite de tokens del modelo de embeddings (~8k tokens ≈ 32k chars).
 * Usamos 6000 caracteres por chunk para margen seguro.
 */
export const RAG_CHUNK_MAX_CHARS = 6000

/**
 * Helper para construir texto indexable desde extractedData para RAG
 * Convierte la estructura JSON extraída en texto legible que se puede indexar en documento_text_chunks
 */

export class DocumentExtractionTextBuilder {
  /**
   * Construye el documento completo como texto para RAG (todo lo extraído, sin resumir).
   * Incluye el JSON completo en formato legible para indexar todos los datos.
   */
  static buildFullTextFromExtractedData(extractedData: any): string {
    if (!extractedData || typeof extractedData !== 'object') {
      return ''
    }
    return JSON.stringify(extractedData, null, 2)
  }

  /**
   * Divide un texto largo en chunks de tamaño <= RAG_CHUNK_MAX_CHARS.
   * Intenta cortar en saltos de línea o espacios para no partir palabras.
   */
  static splitIntoChunks(text: string, maxChars: number = RAG_CHUNK_MAX_CHARS): string[] {
    if (!text || !text.trim()) return []
    const trimmed = text.trim()
    if (trimmed.length <= maxChars) return [trimmed]

    const chunks: string[] = []
    let start = 0

    while (start < trimmed.length) {
      let end = Math.min(start + maxChars, trimmed.length)
      if (end < trimmed.length) {
        const lastNewLine = trimmed.lastIndexOf('\n', end)
        const lastSpace = trimmed.lastIndexOf(' ', end)
        const breakAt = Math.max(lastNewLine, lastSpace, start)
        if (breakAt > start) {
          end = breakAt + (trimmed[breakAt] === '\n' || trimmed[breakAt] === ' ' ? 1 : 0)
        }
      }
      const chunk = trimmed.slice(start, end).trim()
      if (chunk) chunks.push(chunk)
      start = end
    }

    return chunks
  }

  /**
   * Construye un texto legible desde extractedData según el tipo de documento
   */
  static buildTextFromExtractedData(
    extractedData: any,
    documentType: string
  ): string {
    if (!extractedData || typeof extractedData !== 'object') {
      return ''
    }

    const parts: string[] = []

    switch (documentType) {
      case 'inscripcion':
      case 'escritura':
        parts.push(...this.buildInscripcionText(extractedData))
        break

      case 'identificacion':
        parts.push(...this.buildIdentificacionText(extractedData))
        break

      case 'acta_matrimonio':
        parts.push(...this.buildActaMatrimonioText(extractedData))
        break

      default:
        // Fallback genérico: convertir a texto legible
        parts.push(...this.buildGenericText(extractedData))
    }

    return parts.filter(Boolean).join('. ') + '.'
  }

  /**
   * Construye texto para documentos de inscripción/escritura
   */
  private static buildInscripcionText(extracted: any): string[] {
    const parts: string[] = []

    // Folios
    if (Array.isArray(extracted.foliosReales) && extracted.foliosReales.length > 0) {
      parts.push(`Folios reales: ${extracted.foliosReales.join(', ')}`)
    } else if (extracted.folioReal) {
      parts.push(`Folio real: ${extracted.folioReal}`)
    }

    // Partidas
    if (Array.isArray(extracted.partidas) && extracted.partidas.length > 0) {
      parts.push(`Partidas registrales: ${extracted.partidas.join(', ')}`)
    } else if (extracted.partida) {
      parts.push(`Partida registral: ${extracted.partida}`)
    }

    // Propietario/Titular
    if (extracted.propietario?.nombre) {
      parts.push(`Propietario o titular registral: ${extracted.propietario.nombre}`)
      if (extracted.propietario.rfc) {
        parts.push(`RFC del propietario: ${extracted.propietario.rfc}`)
      }
      if (extracted.propietario.curp) {
        parts.push(`CURP del propietario: ${extracted.propietario.curp}`)
      }
    }

    // Dirección
    if (extracted.direccion) {
      const dirParts: string[] = []
      if (extracted.direccion.calle) dirParts.push(extracted.direccion.calle)
      if (extracted.direccion.numero) dirParts.push(`número ${extracted.direccion.numero}`)
      if (extracted.direccion.colonia) dirParts.push(`colonia ${extracted.direccion.colonia}`)
      if (extracted.direccion.municipio) dirParts.push(`municipio ${extracted.direccion.municipio}`)
      if (extracted.direccion.estado) dirParts.push(`estado ${extracted.direccion.estado}`)
      if (extracted.direccion.codigo_postal) dirParts.push(`CP ${extracted.direccion.codigo_postal}`)
      
      if (dirParts.length > 0) {
        parts.push(`Dirección del inmueble: ${dirParts.join(', ')}`)
      }
    } else if (extracted.ubicacion) {
      parts.push(`Ubicación: ${extracted.ubicacion}`)
    }

    // Superficie
    if (extracted.superficie) {
      parts.push(`Superficie: ${extracted.superficie}`)
    }

    // Sección registral
    if (extracted.seccion) {
      parts.push(`Sección registral: ${extracted.seccion}`)
    }

    // Datos catastrales
    if (extracted.datosCatastrales) {
      const catParts: string[] = []
      if (extracted.datosCatastrales.lote) catParts.push(`lote ${extracted.datosCatastrales.lote}`)
      if (extracted.datosCatastrales.manzana) catParts.push(`manzana ${extracted.datosCatastrales.manzana}`)
      if (extracted.datosCatastrales.fraccionamiento) catParts.push(`fraccionamiento ${extracted.datosCatastrales.fraccionamiento}`)
      if (extracted.datosCatastrales.condominio) catParts.push(`condominio ${extracted.datosCatastrales.condominio}`)
      if (extracted.datosCatastrales.unidad) catParts.push(`unidad ${extracted.datosCatastrales.unidad}`)
      
      if (catParts.length > 0) {
        parts.push(`Datos catastrales: ${catParts.join(', ')}`)
      }
    }

    // Folios con información adicional
    if (Array.isArray(extracted.foliosConInfo) && extracted.foliosConInfo.length > 0) {
      extracted.foliosConInfo.forEach((folioInfo: any, idx: number) => {
        if (folioInfo.folio) {
          const infoParts: string[] = [`Folio ${folioInfo.folio}`]
          if (folioInfo.unidad) infoParts.push(`unidad ${folioInfo.unidad}`)
          if (folioInfo.condominio) infoParts.push(`condominio ${folioInfo.condominio}`)
          if (folioInfo.direccion) infoParts.push(`dirección ${folioInfo.direccion}`)
          if (folioInfo.superficie) infoParts.push(`superficie ${folioInfo.superficie}`)
          parts.push(infoParts.join(', '))
        }
      })
    }

    // Gravámenes
    if (extracted.gravamenes) {
      if (extracted.gravamenes === 'LIBRE') {
        parts.push('El inmueble está libre de gravámenes')
      } else if (Array.isArray(extracted.gravamenes) && extracted.gravamenes.length > 0) {
        extracted.gravamenes.forEach((grav: any) => {
          const gravParts: string[] = []
          if (grav.acreedor) gravParts.push(`acreedor ${grav.acreedor}`)
          if (grav.monto) gravParts.push(`monto ${grav.monto}`)
          if (grav.moneda) gravParts.push(`moneda ${grav.moneda}`)
          if (gravParts.length > 0) {
            parts.push(`Gravamen: ${gravParts.join(', ')}`)
          }
        })
      }
    }

    // Número de expediente
    if (extracted.numeroExpediente) {
      parts.push(`Número de expediente registral: ${extracted.numeroExpediente}`)
    }

    return parts
  }

  /**
   * Construye texto para documentos de identificación
   */
  private static buildIdentificacionText(extracted: any): string[] {
    const parts: string[] = []

    if (extracted.nombre) {
      parts.push(`Nombre completo: ${extracted.nombre}`)
    }
    if (extracted.rfc) {
      parts.push(`RFC: ${extracted.rfc}`)
    }
    if (extracted.curp) {
      parts.push(`CURP: ${extracted.curp}`)
    }

    return parts
  }

  /**
   * Construye texto para actas de matrimonio
   */
  private static buildActaMatrimonioText(extracted: any): string[] {
    const parts: string[] = []

    if (extracted.conyuge1?.nombre) {
      parts.push(`Cónyuge 1: ${extracted.conyuge1.nombre}`)
    }
    if (extracted.conyuge2?.nombre) {
      parts.push(`Cónyuge 2: ${extracted.conyuge2.nombre}`)
    }

    return parts
  }

  /**
   * Construye texto genérico desde cualquier objeto (fallback)
   */
  private static buildGenericText(extracted: any): string[] {
    const parts: string[] = []

    // Recorrer propiedades principales y construir texto
    for (const [key, value] of Object.entries(extracted)) {
      if (value === null || value === undefined || key.startsWith('_')) {
        continue
      }

      if (typeof value === 'string' && value.trim()) {
        parts.push(`${key}: ${value}`)
      } else if (typeof value === 'number') {
        parts.push(`${key}: ${value}`)
      } else if (Array.isArray(value) && value.length > 0) {
        const arrayText = value.map((v: any) => {
          if (typeof v === 'string' || typeof v === 'number') {
            return String(v)
          } else if (typeof v === 'object' && v !== null) {
            return JSON.stringify(v)
          }
          return ''
        }).filter(Boolean).join(', ')
        if (arrayText) {
          parts.push(`${key}: ${arrayText}`)
        }
      } else if (typeof value === 'object' && value !== null) {
        // Objeto anidado: construir texto recursivo
        const nestedParts: string[] = []
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedValue !== null && nestedValue !== undefined) {
            if (typeof nestedValue === 'string' || typeof nestedValue === 'number') {
              nestedParts.push(`${nestedKey} ${nestedValue}`)
            }
          }
        }
        if (nestedParts.length > 0) {
          parts.push(`${key}: ${nestedParts.join(', ')}`)
        }
      }
    }

    return parts
  }
}
