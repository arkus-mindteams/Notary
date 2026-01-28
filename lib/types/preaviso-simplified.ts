/**
 * Schema simplificado para JSON de Pre-Aviso (v1.4 compatible)
 * Solo contiene los campos necesarios para generar el documento
 */

export interface PreavisoSimplifiedJSON {
  // Información básica
  tipoOperacion: "compraventa" | null
  
  // Arrays según v1.4 (para compatibilidad, se toma el primer elemento)
  vendedores: Array<{
    party_id?: string | null
    nombre: string | null
    rfc: string | null
    curp: string | null
    tipoPersona: "persona_fisica" | "persona_moral" | null
    denominacion_social?: string | null
    estado_civil?: string | null
    tieneCredito: boolean | null
    institucionCredito?: string | null
    numeroCredito?: string | null
  }>
  
  compradores: Array<{
    party_id?: string | null
    nombre: string | null
    rfc: string | null
    curp: string | null
    tipoPersona: "persona_fisica" | "persona_moral" | null
    denominacion_social?: string | null
    estado_civil?: string | null
    necesitaCredito: boolean | null
    institucionCredito?: string | null
    montoCredito?: string | null
  }>
  
  creditos: Array<{
    institucion: string | null
    monto: string | null
    tipo_credito: string | null
    participantes: Array<{
      party_id: string | null
      rol: string | null
      nombre?: string | null
    }>
  }>
  
  // Inmueble (v1.4)
  inmueble: {
    direccion: string | null // Dirección completa como string para compatibilidad
    folioReal: string | null
    partidas: string[]
    seccion: string | null
    numero_expediente?: string | null
    superficie: string | null
    valor: string | null
    unidad?: string | null
    modulo?: string | null
    condominio?: string | null
    lote?: string | null
    manzana?: string | null
    fraccionamiento?: string | null
    colonia?: string | null
    municipio?: string | null
    all_registry_pages_confirmed?: boolean
  } | null
  
  // Gravámenes
  gravamenes?: Array<{
    tipo: string | null
    institucion: string | null
    numero_credito: string | null
    cancelacion_confirmada: boolean
  }>
  
  // Actos notariales
  actos: {
    cancelacionHipoteca: boolean
    compraventa: boolean
    aperturaCreditoComprador: boolean
  }
  
  // Flag para Artículo 139
  include_urban_dev_article_139?: boolean
  
  // Metadata (se agrega en el generador, no viene del agente)
  fecha?: string
  notaria?: {
    numero: string
    nombre: string
    ciudad: string
    estado: string
  }
}

