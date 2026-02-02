import { Command } from '../../../../base/types'
import { PreavisoDocumentTypeHandler } from './index'
import { ConyugeService } from '../../../../shared/services/conyuge-service'

export class ActaMatrimonioHandler implements PreavisoDocumentTypeHandler {
    getType(): string {
        return 'acta_matrimonio'
    }

    getPrompts(): { systemPrompt: string; userPrompt: string } {
        return {
            systemPrompt: `Eres un experto en análisis de actas de matrimonio. Extrae información en formato JSON:
{
  "conyuge1": { "nombre": "nombre completo del cónyuge 1 (exactamente como aparece)" },
  "conyuge2": { "nombre": "nombre completo del cónyuge 2 (exactamente como aparece)" }
}

REGLAS:
- Devuelve nombres completos, con apellidos y nombres, tal como aparecen (respetando orden, comas si existieran).
- NO inventes nombres. Si un nombre no es legible, usa null.
- Si el documento usa etiquetas como "CONTRAYENTE", "CÓNYUGE", "ESPOSO/ESPOSA", extrae ambos.`,
            userPrompt: 'Analiza esta acta de matrimonio y extrae los nombres completos de AMBOS cónyuges exactamente como aparecen.'
        }
    }

    process(extracted: any, context: any): Command[] {
        const commands: Command[] = []

        const nombres = [
            extracted.conyuge1?.nombre,
            extracted.conyuge2?.nombre
        ].filter(Boolean)

        if (nombres.length >= 2) {
            const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
            const comprador = context.compradores?.[0]

            if (!compradorNombre) {
                commands.push({
                    type: 'document_people_detected',
                    timestamp: new Date(),
                    payload: {
                        source: 'acta_matrimonio',
                        persons: nombres.map((n: string) => ({
                            name: n,
                            source: 'documento_acta_matrimonio'
                        }))
                    }
                })
                return commands
            }

            const estadoCivilActual = comprador?.persona_fisica?.estado_civil
            if (comprador && estadoCivilActual !== 'casado') {
                commands.push({
                    type: 'estado_civil',
                    timestamp: new Date(),
                    payload: {
                        buyerIndex: 0,
                        estadoCivil: 'casado',
                        source: 'documento_acta_matrimonio'
                    }
                })
            }

            if (compradorNombre) {
                for (const nombre of nombres) {
                    if (nombre && !ConyugeService.namesMatch(nombre, compradorNombre)) {
                        commands.push({
                            type: 'conyuge_name',
                            timestamp: new Date(),
                            payload: {
                                buyerIndex: 0,
                                name: nombre,
                                source: 'documento_acta_matrimonio'
                            }
                        })
                    }
                }
            }
        } else if (nombres.length === 1) {
            const compradorNombre = context.compradores?.[0]?.persona_fisica?.nombre
            const comprador = context.compradores?.[0]
            const estadoCivilActual = comprador?.persona_fisica?.estado_civil
            if (comprador && estadoCivilActual !== 'casado') {
                commands.push({
                    type: 'estado_civil',
                    timestamp: new Date(),
                    payload: {
                        buyerIndex: 0,
                        estadoCivil: 'casado',
                        source: 'documento_acta_matrimonio'
                    }
                })
            }
            if (compradorNombre && !ConyugeService.namesMatch(nombres[0], compradorNombre)) {
                commands.push({
                    type: 'conyuge_name',
                    timestamp: new Date(),
                    payload: {
                        buyerIndex: 0,
                        name: nombres[0],
                        source: 'documento_acta_matrimonio'
                    }
                })
            }
        }

        return commands
    }
}
