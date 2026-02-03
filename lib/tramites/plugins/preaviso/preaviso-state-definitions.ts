import { StateDefinition } from '../../base/types'

/**
 * Obtiene estados del trámite de Preaviso de Compraventa
 */
export function getPreavisoStates(context: any): StateDefinition[] {
    // IMPORTANTE: El flujo v1.4 se basa en `creditos` (no en `operacion.tipo_pago`):
    // - creditos === undefined => forma de pago NO confirmada
    // - creditos === [] => contado confirmado
    // - creditos === [...] => crédito confirmado
    //
    // Este orden debe alinearse con `computePreavisoState` para evitar preguntas irrelevantes.
    return [
        {
            id: 'ESTADO_2',
            name: 'Inmueble y Registro',
            required: true,
            // Superficie NO debe bloquear (si el usuario no la tiene o dice que es irrelevante).
            // Dirección sí es deseable para el documento, pero idealmente viene de la inscripción.
            // IMPORTANTE: permitir captura manual (sin documentosProcesados[]).
            // NOTA: usar calle para evitar marcar completo cuando solo existe el objeto direccion vacío.
            fields: ['inmueble.folio_real', 'inmueble.partidas', 'inmueble.direccion.calle'],
            conditional: () => true,
        },
        {
            id: 'ESTADO_3',
            name: 'Vendedor(es)',
            required: true,
            fields: [
                'vendedores[]',
                'vendedores[].tipo_persona',
                // Nombre puede vivir en persona_fisica.nombre o persona_moral.denominacion_social
                'vendedores[].nombre',
            ],
            conditional: () => true,
        },
        {
            id: 'ESTADO_1',
            name: 'Operación y Forma de Pago',
            required: true,
            // En preaviso, la operación es SIEMPRE compraventa. NO se pregunta ni se captura como decisión.
            // `creditos` sirve como confirmación explícita: undefined => falta preguntar (contado vs crédito)
            fields: ['creditos'],
            conditional: () => true,
        },
        {
            id: 'ESTADO_4',
            name: 'Comprador(es)',
            required: true,
            fields: [
                'compradores[]',
                'compradores[].tipo_persona',
                'compradores[].nombre',
                'compradores[].persona_fisica.estado_civil',
            ],
            conditional: () => true,
        },
        {
            id: 'ESTADO_4B',
            name: 'Cónyuge (si aplica)',
            // Si el comprador es persona_fisica y está casado, necesitamos el nombre del cónyuge.
            // El acta de matrimonio es opcional; preferimos identificación o texto.
            required: (ctx) => ctx?.compradores?.[0]?.tipo_persona === 'persona_fisica' && ctx?.compradores?.[0]?.persona_fisica?.estado_civil === 'casado',
            fields: ['compradores[].persona_fisica.conyuge.nombre'],
            conditional: (ctx) => ctx?.compradores?.[0]?.tipo_persona === 'persona_fisica' && ctx?.compradores?.[0]?.persona_fisica?.estado_civil === 'casado',
        },
        {
            id: 'ESTADO_5',
            name: 'Crédito del Comprador',
            // Solo aplica si hay créditos (no si es contado o no está confirmado)
            required: (ctx) => Array.isArray(ctx?.creditos) && ctx.creditos.length > 0,
            fields: ['creditos[].institucion', 'creditos[].participantes[]'],
            conditional: (ctx) => Array.isArray(ctx?.creditos) && ctx.creditos.length > 0,
        },
        {
            id: 'ESTADO_6',
            name: 'Gravámenes / Hipoteca',
            required: true,
            fields: ['inmueble.existe_hipoteca'],
            conditional: () => true,
        },
        {
            id: 'ESTADO_6B',
            name: 'Cancelación de hipoteca/gravamen (si aplica)',
            // Solo aplica si el inmueble SÍ tiene hipoteca/gravamen y todavía no sabemos si se cancelará.
            required: (ctx) =>
                ctx?.inmueble?.existe_hipoteca === true &&
                Array.isArray(ctx?.gravamenes) &&
                ctx.gravamenes.length > 0 &&
                !!ctx.gravamenes[0]?.institucion &&
                (ctx.gravamenes[0]?.cancelacion_confirmada === null || ctx.gravamenes[0]?.cancelacion_confirmada === undefined),
            fields: ['gravamenes[].cancelacion_confirmada'],
            conditional: (ctx) =>
                ctx?.inmueble?.existe_hipoteca === true &&
                Array.isArray(ctx?.gravamenes) &&
                ctx.gravamenes.length > 0 &&
                !!ctx.gravamenes[0]?.institucion,
        },
        {
            id: 'ESTADO_8',
            name: 'Listo para Generar',
            required: false,
            fields: [],
            conditional: () => false,
        },
    ]
}
