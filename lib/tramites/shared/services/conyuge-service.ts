/**
 * Servicio para obtener nombre del cónyuge
 * Fuente única de verdad para el cónyuge
 */

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

  /**
   * Normaliza nombres para comparación
   */
  static normalizeName(name: string): string {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }

  /**
   * Normalización tolerante para matching (ignora comas/orden y espacios).
   * Ej: "WU, JINWEI" ≈ "JINWEI WU"
   */
  static normalizeNameForMatch(name: string): string {
    const base = this.normalizeName(name)
    const tokens = base
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    // Quitar tokens muy cortos que suelen ser ruido (ej. iniciales)
    const filtered = tokens.filter(t => t.length >= 2)
    filtered.sort()
    return filtered.join(' ')
  }

  /**
   * Compara dos nombres (normalizados)
   */
  static namesMatch(name1: string, name2: string): boolean {
    const a = this.normalizeName(String(name1 || ''))
    const b = this.normalizeName(String(name2 || ''))
    if (!a || !b) return false
    if (a === b) return true
    // Fallback tolerante: comparar por tokens ordenados
    return this.normalizeNameForMatch(a) === this.normalizeNameForMatch(b)
  }
}
