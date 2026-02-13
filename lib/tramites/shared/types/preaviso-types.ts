import type { LastQuestionIntent } from '@/lib/tramites/base/types';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    attachments?: File[];
}

export interface PersonaFisica {
    nombre: string | null;
    rfc: string | null;
    curp: string | null;
    estado_civil: string | null;
    conyuge?: {
        nombre: string | null;
        participa: boolean;
    };
}

export interface PersonaMoral {
    denominacion_social: string | null;
    rfc: string | null;
    csf_provided: boolean;
    csf_reference: string | null;
    name_confirmed_exact: boolean;
}

export interface CompradorElement {
    party_id: string | null;
    tipo_persona: 'persona_fisica' | 'persona_moral' | null;
    persona_fisica?: PersonaFisica;
    persona_moral?: PersonaMoral;
}

export interface VendedorElement {
    party_id: string | null;
    tipo_persona: 'persona_fisica' | 'persona_moral' | null;
    persona_fisica?: PersonaFisica;
    persona_moral?: PersonaMoral;
    tiene_credito: boolean | null;
    credito_vendedor?: {
        institucion: string | null;
        numero_credito: string | null;
    };
}

export interface ParticipanteCredito {
    party_id: string | null;
    rol: 'acreditado' | 'coacreditado' | null;
    nombre?: string | null;
}

export interface CreditoElement {
    credito_id: string | null;
    institucion: string | null;
    monto: string | null;
    participantes: ParticipanteCredito[];
    tipo_credito: string | null;
}

export interface GravamenElement {
    gravamen_id: string | null;
    tipo: string | null;
    institucion: string | null;
    numero_credito: string | null;
    cancelacion_confirmada: boolean;
}

export interface DireccionInmueble {
    calle: string | null;
    numero: string | null;
    colonia: string | null;
    municipio: string | null;
    estado: string | null;
    codigo_postal: string | null;
}

export interface DatosCatastrales {
    lote: string | null;
    manzana: string | null;
    fraccionamiento: string | null;
    condominio: string | null;
    unidad: string | null;
    modulo: string | null;
}

export interface InmuebleV14 {
    folio_real: string | null;
    partidas: string[];
    folio_real_confirmed?: boolean;
    seccion?: string | null;
    numero_expediente?: string | null;
    all_registry_pages_confirmed: boolean;
    direccion: string | DireccionInmueble;
    superficie: string | null;
    valor: string | null;
    datos_catastrales: DatosCatastrales;
    existe_hipoteca?: boolean;
}

export interface PreavisoData {
    tipoOperacion: 'compraventa' | null;
    _document_intent?: 'conyuge' | null;
    _last_question_intent?: LastQuestionIntent | null;
    _document_people_pending?: {
        status: 'pending' | 'resolved';
        source?: 'identificacion' | 'acta_matrimonio' | 'documento';
        persons: Array<{
            name: string;
            rfc?: string | null;
            curp?: string | null;
            source?: string | null;
        }>;
        other_person?: { name: string; relation?: string | null } | null;
        other_relationship?: string | null;
    } | null;
    vendedores: VendedorElement[];
    compradores: CompradorElement[];
    creditos?: CreditoElement[];
    gravamenes: GravamenElement[];
    inmueble: InmuebleV14;
    control_impresion?: {
        imprimir_conyuges: boolean;
        imprimir_coacreditados: boolean;
        imprimir_creditos: boolean;
    };
    validaciones?: {
        expediente_existente: boolean;
        datos_completos: boolean;
        bloqueado: boolean;
    };
    actosNotariales?: {
        cancelacionCreditoVendedor: boolean;
        compraventa: boolean;
        aperturaCreditoComprador: boolean;
    };
    documentosProcesados?: Array<{
        nombre: string;
        tipo: string;
        informacionExtraida: any;
    }>;
    folios?: {
        candidates: Array<{
            folio: string;
            scope: 'unidades' | 'inmuebles_afectados' | 'otros';
            attrs?: {
                unidad?: string | null;
                condominio?: string | null;
                lote?: string | null;
                manzana?: string | null;
                fraccionamiento?: string | null;
                colonia?: string | null;
                superficie?: string | null;
                ubicacion?: string | null;
                partida?: string | null;
            };
            sources?: Array<{
                docName?: string;
                docType?: string;
            }>;
        }>;
        selection: {
            selected_folio: string | null;
            selected_scope: 'unidades' | 'inmuebles_afectados' | 'otros' | null;
            confirmed_by_user: boolean;
        };
    };
    documentos: string[];
}

export interface ServerStateSnapshot {
    current_state: string | null;
    state_status: Record<string, string>;
    required_missing: string[];
    blocking_reasons: string[];
    allowed_actions: string[];
    wizard_state?: {
        current_step: number;
        total_steps: number;
        can_finalize: boolean;
        steps: Array<{
            id: string;
            state_id: string;
            status: 'pending' | 'completed' | 'blocked';
        }>;
    };
}

export interface UploadedDocument {
    id: string;
    file: File;
    name: string;
    type: string;
    size: number;
    processed: boolean;
    cancelled?: boolean;
    extractedData?: any;
    error?: string;
    documentType?: string;
}
