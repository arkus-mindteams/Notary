/**
 * Schema simplificado para JSON de Pre-Aviso
 * Solo contiene los campos necesarios para generar el documento
 */

export interface PreavisoSimplifiedJSON {
  // Información básica
  tipoOperacion: "compraventa" | null
  
  // Vendedor
  vendedor: {
    nombre: string | null
    rfc: string | null
    curp: string | null
    tipoPersona: "persona_fisica" | "persona_moral" | null
    denominacion_social?: string | null // solo si persona_moral
    estado_civil?: string | null // solo si persona_fisica
    tieneCredito: boolean | null
    institucionCredito?: string | null
    numeroCredito?: string | null
  } | null
  
  // Comprador
  comprador: {
    nombre: string | null
    rfc: string | null
    curp: string | null
    tipoPersona: "persona_fisica" | "persona_moral" | null
    denominacion_social?: string | null // solo si persona_moral
    estado_civil?: string | null // solo si persona_fisica
    necesitaCredito: boolean | null
    institucionCredito?: string | null
    montoCredito?: string | null
  } | null
  
  // Inmueble
  inmueble: {
    direccion: string | null
    folioReal: string | null
    seccion: string | null
    partida: string | null // o partidas: string[] si múltiples
    superficie: string | null
    valor: string | null
    unidad?: string | null
    modulo?: string | null
    condominio?: string | null
    lote?: string | null
    manzana?: string | null
    fraccionamiento?: string | null
    colonia?: string | null
  } | null
  
  // Actos notariales
  actos: {
    cancelacionCreditoVendedor: boolean
    compraventa: boolean
    aperturaCreditoComprador: boolean
  }
  
  // Metadata (se agrega en el generador, no viene del agente)
  fecha?: string // fecha actual formateada
  notaria?: {
    numero: string
    nombre: string
    ciudad: string
    estado: string
  }
}

