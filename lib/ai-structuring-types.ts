export type StructuredUnit = {
  /**
   * Nombre de la unidad según aparece en el plano
   * Ejemplos: "UNIDAD X", "COCHERA 1", "ESTACIONAMIENTO"
   */
  unit_name: string
  boundaries: Array<{
    /**
     * Dirección original tal como aparece en el texto (ej: "SURESTE", "NORTE", "ARRIBA")
     */
    raw_direction: string
    /**
     * Dirección normalizada a código corto:
     * Cardinales: "N", "S", "E", "W"
     * Intercardinales: "NE", "NW", "SE", "SW"
     * Verticales: "UP", "DOWN"
     */
    normalized_direction: "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW" | "UP" | "DOWN"
    /**
     * Longitud en metros. Puede ser null si no hay medida disponible
     */
    length_m: number | null
    /**
     * Nombre del colindante
     */
    abutter: string
    /**
     * Orden de aparición en el documento (inicia en 0)
     */
    order_index: number
  }>
  /**
   * Superficies de la unidad (opcional)
   */
  surfaces?: Array<{ name: string; value_m2: number }>
  /**
   * Anomalías detectadas (opcional)
   */
  anomalies?: string[]
}

/**
 * Tipo legacy para compatibilidad hacia atrás
 * @deprecated Usar StructuredUnit con unit_name directamente
 */
export type StructuredUnitLegacy = {
  unit: {
    name: string
    model?: string
    location?: string
  }
  boundaries: Array<{
    direction: "WEST" | "NORTHWEST" | "NORTH" | "NORTHEAST" | "EAST" | "SOUTHEAST" | "SOUTH" | "SOUTHWEST" | string
    length_m: number
    abutter: string
    order_index: number
  }>
  surfaces: Array<{ name: string; value_m2: number }>
  anomalies?: string[]
}

export type StructuringRequest = {
  ocrText: string
  hints?: { language?: "es" | "en"; unitNameHint?: string }
}

export type StructuringResponse = {
  results: StructuredUnit[]
  /**
   * Ubicación del lote extraída del documento (manzana, lote, dirección, etc.)
   * Ejemplo: "MANZANA 114, LOTE 5-A, TIJUANA, B.C."
   */
  lotLocation?: string
  /**
   * Superficie total del lote en m² (no la suma de unidades, sino la superficie total del lote)
   * Ejemplo: 145.600
   */
  totalLotSurface?: number
}

