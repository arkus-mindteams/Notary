import { Command } from '../../../../base/types'

export interface PreavisoDocumentTypeHandler {
    getType(): string
    getPrompts(): { systemPrompt: string; userPrompt: string }
    process(extracted: any, context: any): Command[]
}
