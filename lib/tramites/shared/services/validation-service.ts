/**
 * Servicio de validación centralizado
 * Validaciones reutilizables para todos los trámites
 */

export class ValidationService {
  /**
   * Valida si un nombre es válido
   */
  static isValidName(name: string): boolean {
    if (!name || typeof name !== 'string') return false
    if (name.length < 6) return false
    if (/\d{3,}/.test(name)) return false // No debe tener muchos números

    const invalidWords = [
      'coacreditado', 'coacreditada', 'acreditado', 'acreditada',
      'comprador', 'compradora', 'vendedor', 'vendedora',
      'casado', 'casada', 'soltero', 'soltera', 'divorciado', 'divorciada', 'viudo', 'viuda',
      'moral', 'fisica', 'física', 'persona',
      'como', 'es', 'será', 'sí', 'no', 'si',
      // Address keywords (guardrails against misinterpretation)
      'calle', 'avenida', 'boulevard', 'blvd', 'colonia', 'fraccionamiento',
      'lote', 'manzana', 'municipio', 'estado', 'cp', 'c.p.', 'postal',
      'interior', 'exterior', 'numero', 'número'
    ]

    const nameLower = name.toLowerCase().trim()
    if (invalidWords.includes(nameLower)) return false

    // Evitar frases que contengan palabras inválidas (si el nombre es corto)
    if (nameLower.length < 20) {
      if (invalidWords.some(word => nameLower.includes(word))) {
        return false
      }
    }

    return true
  }

  /**
   * Valida si una institución de crédito es válida
   */
  static isValidInstitution(institution: string): boolean {
    if (!institution || typeof institution !== 'string') return false

    const invalidValues = [
      'credito', 'crédito', 'el credito', 'el crédito',
      'hipoteca', 'banco', 'institucion', 'institución',
      'entidad', 'financiamiento'
    ]

    const normalized = institution.toLowerCase().trim()
    if (invalidValues.includes(normalized)) return false

    // Rechazar si contiene señales claras de corrección o ruido conversacional
    // Incluso después de sanitizar, si quedó algo de esto, la cadena no es válida.
    const repairKeywords = /\b(perdon|perd[oó]n|disculpa|error|equivoqu[eé]|no era|es con|sera con|ser[aá] con|corrijo|actualizar|cambiar|pero|redito|credito|cr[eé]dito|banco|institucion|instituci[oó]n)\b/i
    if (repairKeywords.test(normalized)) {
      return false
    }

    // Los nombres de bancos suelen ser cortos (1-3 palabras). 
    // Si es muy largo (>30) y no tiene sufijos legales, es sospechoso.
    if (normalized.length > 30) {
      const isLegalEntity = /\b(s\.?a\.?|sociedad|anonima|banco|institucion|credit|finan)\b/i.test(normalized)
      if (!isLegalEntity) return false
    }

    // No debe ser solo números o caracteres especiales
    if (!/[a-z]{3,}/i.test(normalized)) return false

    return normalized.length >= 3 && normalized.length <= 60
  }

  /**
   * Infiere tipo de persona por nombre
   */
  static inferTipoPersona(name: string): 'persona_moral' | null {
    const suffixes = [
      /\bs\.?\s*a\.?\b/i,              // S.A.
      /\bs\.?\s*a\.?\s*de\s*c\.?\s*v\.?\b/i, // S.A. de C.V.
      /\bsociedad\s+anonima/i,
      /\binmobiliaria\b/i,
      /\bdesarrolladora\b/i,
      /\bs\.?\s*a\.?\s*p\.?\s*i\.?\b/i, // S.A.P.I.
      /\bsapi\b/i,
      /\bsociedad\s+de\s+capital\s+variable\b/i,
      /\bsociedad\s+anonima\s+promotora\s+de\s+inversion\s+de\s+capital\s+variable\b/i
    ]

    return suffixes.some(pattern => pattern.test(name)) ? 'persona_moral' : null
  }

  /**
   * Valida estado civil
   */
  static validateEstadoCivil(estadoCivil: string): { valid: boolean; error?: string } {
    const normalized = this.normalizeEstadoCivil(estadoCivil)
    const valid = ['soltero', 'casado', 'divorciado', 'viudo']
    if (!valid.includes(normalized)) {
      return { valid: false, error: `Estado civil "${estadoCivil}" no válido` }
    }
    return { valid: true }
  }

  /**
   * Normaliza estado civil
   */
  static normalizeEstadoCivil(input: string): 'soltero' | 'casado' | 'divorciado' | 'viudo' {
    const normalized = input.toLowerCase().trim()

    if (normalized.startsWith('solter')) return 'soltero'
    if (normalized.startsWith('casad')) return 'casado'
    if (normalized.startsWith('divorc')) return 'divorciado'
    if (normalized.startsWith('viud')) return 'viudo'

    return 'soltero' // Default
  }
}
