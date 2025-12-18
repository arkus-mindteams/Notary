import type { StructuredUnit } from '@/lib/ai-structuring-types'

// Tipos base de Supabase
export interface Comprador {
  id: string
  nombre: string
  rfc: string
  curp: string
  direccion?: string | null
  telefono?: string | null
  email?: string | null
  created_at: string
  updated_at: string
}

export type TipoTramite = 'preaviso' | 'plano_arquitectonico' | 'otro'
export type EstadoTramite = 'en_proceso' | 'completado' | 'archivado'

export interface Tramite {
  id: string
  comprador_id: string | null // NULL para trámites en borrador
  user_id?: string | null // ID del usuario que está trabajando en el trámite
  tipo: TipoTramite
  datos: PreavisoDatos | PlanoArquitectonicoDatos | Record<string, any>
  estado: EstadoTramite
  documento_generado?: DocumentoGenerado | null
  notas?: string | null
  created_at: string
  updated_at: string
}

export interface Documento {
  id: string
  comprador_id: string
  tipo: TipoDocumento
  nombre: string
  s3_key: string
  s3_bucket: string
  url?: string | null
  tamaño: number
  mime_type: string
  file_hash?: string | null
  metadata?: Record<string, any> | null
  uploaded_at: string
}

export interface TramiteDocumento {
  id: string
  tramite_id: string
  documento_id: string
  notas?: string | null
  created_at: string
}

export type TipoDocumento = 
  | 'escritura' 
  | 'plano' 
  | 'ine_vendedor' 
  | 'ine_comprador' 
  | 'rfc' 
  | 'documento_generado'
  | 'plano_arquitectonico'
  | 'croquis_catastral'

// Tipos específicos por tipo de trámite
export interface PreavisoDatos {
  tipoOperacion: 'compraventa'
  vendedor: {
    nombre: string
    rfc: string
    curp: string
    tieneCredito: boolean
    institucionCredito?: string
    numeroCredito?: string
  }
  inmueble: {
    direccion: string
    folioReal: string
    seccion: string
    partida: string
    superficie: string
    valor: string
  }
  actosNotariales: {
    cancelacionCreditoVendedor: boolean
    compraventa: boolean
    aperturaCreditoComprador: boolean
  }
}

export interface PlanoArquitectonicoDatos {
  unidades: StructuredUnit[]
  lotLocation?: string
  totalLotSurface?: number
}

export interface DocumentoGenerado {
  s3_key: string
  url: string
  formato: 'docx' | 'pdf'
}

// Tipos para requests/responses de API
export interface CreateCompradorRequest {
  nombre: string
  rfc: string
  curp: string
  direccion?: string
  telefono?: string
  email?: string
}

export interface CreateTramiteRequest {
  compradorId?: string | null // NULL para trámites en borrador
  userId?: string | null // ID del usuario que está trabajando en el trámite
  tipo: TipoTramite
  datos: PreavisoDatos | PlanoArquitectonicoDatos | Record<string, any>
  estado?: EstadoTramite
  notas?: string
}

export interface UpdateTramiteRequest {
  compradorId?: string | null // NULL para trámites en borrador
  datos?: PreavisoDatos | PlanoArquitectonicoDatos | Record<string, any>
  estado?: EstadoTramite
  documento_generado?: DocumentoGenerado | null
  notas?: string
}

export interface UploadDocumentoRequest {
  compradorId?: string | null // NULL para documentos en borrador
  tipo: TipoDocumento
  file: File
  metadata?: Record<string, any>
}

export interface AsociarDocumentoRequest {
  tramiteId: string
  documentoId: string
  notas?: string
}

// Tipos para respuestas de API
export interface ExpedienteCompleto {
  comprador: Comprador
  tramites: (Tramite & { documentos: Documento[] })[]
  documentos: Documento[]
}

export interface TramiteConDocumentos extends Tramite {
  documentos: Documento[]
}

