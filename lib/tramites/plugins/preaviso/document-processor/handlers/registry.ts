import { PreavisoDocumentTypeHandler } from './index'
import { InscripcionHandler } from './inscripcion-handler'
import { IdentificacionHandler } from './identificacion-handler'
import { ActaMatrimonioHandler } from './acta-matrimonio-handler'
import { Command } from '../../../../base/types'

export class DefaultHandler implements PreavisoDocumentTypeHandler {
    getType(): string {
        return 'default'
    }
    getPrompts(): { systemPrompt: string; userPrompt: string } {
        return {
            systemPrompt: `Extrae información relevante del documento en formato JSON. Incluye siempre un campo "textoCompleto" con la transcripción literal de TODO el texto visible en el documento, en orden de lectura, conservando saltos de línea.`,
            userPrompt: 'Analiza este documento y extrae la información relevante. Incluye en textoCompleto todo el texto que puedas leer.'
        }
    }
    process(_extracted: any, _context: any): Command[] {
        return []
    }
}

const handlers: Record<string, PreavisoDocumentTypeHandler> = {
    'inscripcion': new InscripcionHandler(),
    'escritura': new InscripcionHandler(), // Escritura reuses Inscripcion logic
    'identificacion': new IdentificacionHandler(),
    'acta_matrimonio': new ActaMatrimonioHandler()
}

const defaultHandler = new DefaultHandler()

export const getHandler = (type: string): PreavisoDocumentTypeHandler => {
    return handlers[type] || defaultHandler
}
