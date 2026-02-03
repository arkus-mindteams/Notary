import { Command } from '../../../../base/types'
import { PreavisoDocumentTypeHandler } from './index'
import { ValidationService } from '../../../../shared/services/validation-service'
import { ConyugeService } from '../../../../shared/services/conyuge-service'

export class IdentificacionHandler implements PreavisoDocumentTypeHandler {
    getType(): string {
        return 'identificacion'
    }

    getPrompts(): { systemPrompt: string; userPrompt: string } {
        return {
            systemPrompt: `Eres un experto en análisis de documentos de identificación (INE, pasaporte, licencia, etc.). Extrae información en formato JSON:
{
  "nombre": "nombre completo tal como aparece en el documento (ej: "WU, JINWEI" o "QIAOZHEN ZHANG")",
  "rfc": "RFC si está visible",
  "curp": "CURP si está visible"
}

IMPORTANTE:
- Extrae el nombre EXACTAMENTE como aparece en el documento, incluyendo comas, apellidos primero, etc.
- Si es un pasaporte, el nombre puede aparecer en formato "APELLIDO, NOMBRE" o "NOMBRE APELLIDO"
- Si el nombre tiene comas, inclúyelas en la extracción
- Si no puedes leer el nombre claramente, usa null`,
            userPrompt: 'Analiza este documento de identificación METICULOSAMENTE y extrae el nombre completo exactamente como aparece en el documento.'
        }
    }

    process(extracted: any, context: any): Command[] {
        const commands: Command[] = []
        const nombre = extracted.nombre

        if (!nombre || !ValidationService.isValidName(nombre)) {
            console.warn('[IdentificacionHandler] Nombre no válido o no extraído:', nombre)
            return commands
        }

        const intent = this.determineDocumentIntent(nombre, context)

        const hasBuyer = !!context.compradores?.[0]?.persona_fisica?.nombre
        const explicitIntent = (context as any)?._document_intent

        if (!hasBuyer && !explicitIntent) {
            commands.push({
                type: 'document_people_detected',
                timestamp: new Date(),
                payload: {
                    source: 'identificacion',
                    persons: [
                        {
                            name: nombre,
                            rfc: extracted.rfc,
                            curp: extracted.curp,
                            source: 'documento_identificacion'
                        }
                    ]
                }
            })
            return commands
        }

        switch (intent) {
            case 'buyer':
                commands.push({
                    type: 'buyer_name',
                    timestamp: new Date(),
                    payload: {
                        buyerIndex: 0,
                        name: nombre,
                        rfc: extracted.rfc,
                        curp: extracted.curp,
                        inferredTipoPersona: 'persona_fisica',
                        source: 'documento_identificacion'
                    }
                })
                break

            case 'conyuge':
                commands.push({
                    type: 'conyuge_name',
                    timestamp: new Date(),
                    payload: {
                        buyerIndex: 0,
                        name: nombre,
                        rfc: extracted.rfc,
                        curp: extracted.curp,
                        source: 'documento_identificacion'
                    }
                })
                break

            case 'seller':
                const tipoPersona = ValidationService.inferTipoPersona(nombre) || 'persona_fisica'
                commands.push({
                    type: 'titular_registral',
                    timestamp: new Date(),
                    payload: {
                        name: nombre,
                        rfc: extracted.rfc,
                        curp: extracted.curp,
                        inferredTipoPersona: tipoPersona,
                        confirmed: false,
                        source: 'documento_identificacion'
                    }
                })
                break
        }

        return commands
    }

    private determineDocumentIntent(nombre: string, context: any): 'buyer' | 'conyuge' | 'seller' | 'unknown' {
        const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
        const vendedorNombre = context.vendedores?.[0]?.persona_fisica?.nombre ||
            context.vendedores?.[0]?.persona_moral?.denominacion_social
        const conyugeNombre = ConyugeService.getConyugeNombre(context)
        const compradorCasado = context.compradores?.[0]?.persona_fisica?.estado_civil === 'casado'
        const nombreNoEsComprador = compradorNombre && !ConyugeService.namesMatch(nombre, compradorNombre)

        const documentIntent = (context as any)?._document_intent
        if (documentIntent === 'conyuge' && compradorCasado && nombreNoEsComprador) {
            return 'conyuge'
        }

        if (compradorNombre && ConyugeService.namesMatch(nombre, compradorNombre)) {
            return 'buyer'
        }

        if (conyugeNombre && ConyugeService.namesMatch(nombre, conyugeNombre)) {
            return 'conyuge'
        }

        if (vendedorNombre && ConyugeService.namesMatch(nombre, vendedorNombre)) {
            return 'seller'
        }

        if (compradorCasado && nombreNoEsComprador && !conyugeNombre) {
            return 'conyuge'
        }

        if (!compradorNombre) {
            return 'unknown'
        }

        if (compradorCasado && nombreNoEsComprador) {
            return 'conyuge'
        }

        if (compradorNombre && !vendedorNombre) {
            return 'seller'
        }

        return 'buyer'
    }
}
