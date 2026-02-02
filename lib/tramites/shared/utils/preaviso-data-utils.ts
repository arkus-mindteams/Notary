import { PreavisoData } from '../types/preaviso-types';

/**
 * Strips the technical <DATA_UPDATE> blocks from the AI's response for display in the chat.
 */
export const stripDataUpdateBlocksForDisplay = (text: string): string => {
    if (!text) return '';
    const cleaned = text.replace(/<DATA_UPDATE>[\s\S]*?<\/DATA_UPDATE>/g, '').trim();
    return cleaned;
};

/**
 * Converts the raw AI response into a user-facing string, providing a fallback if only data updates were sent.
 */
export const toUserFacingAssistantText = (raw: string): string => {
    const cleaned = stripDataUpdateBlocksForDisplay(raw);
    // Si el modelo solo mandó <DATA_UPDATE>, no mostramos el bloque técnico.
    // Mostramos una confirmación neutra y corta para no “desaparecer” el mensaje.
    return cleaned.length > 0 ? cleaned : 'Información registrada.';
};

/**
 * Automatically infers marital status to 'casado' if a spouse is present.
 */
export const inferMarriageStatus = (persons: any[]): any[] => {
    if (!Array.isArray(persons)) return persons;
    return persons.map(p => {
        if (p?.persona_fisica?.conyuge?.nombre?.trim()) {
            return {
                ...p,
                persona_fisica: {
                    ...p.persona_fisica,
                    estado_civil: 'casado'
                }
            };
        }
        return p;
    });
};

/**
 * Determines the relevant notary acts (actos notariales) based on the current preaviso data.
 */
export const determineActosNotariales = (data: PreavisoData) => {
    const primerVendedor = data.vendedores?.[0];
    const tieneCreditos = data.creditos && data.creditos.length > 0;

    return {
        cancelacionCreditoVendedor: primerVendedor?.tiene_credito === true || false,
        compraventa: true,
        aperturaCreditoComprador: tieneCreditos || false
    };
};
