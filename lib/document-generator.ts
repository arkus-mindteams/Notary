"use client"

import { ExtractedFields } from './ai-processor'

// Interfaz para el documento generado
export interface GeneratedDocument {
  title: string
  sections: DocumentSection[]
  metadata: DocumentMetadata
  html: string
  text: string
}

export interface DocumentSection {
  id: string
  title: string
  content: string
  type: 'header' | 'body' | 'signature' | 'legal'
  order: number
}

export interface DocumentMetadata {
  generatedAt: Date
  notaria: string
  folio: string
  version: string
  confidence: number
}

// Generador de documentos notariales
export class DocumentGenerator {
  static generatePreAvisoRequest(extractedFields: ExtractedFields[]): GeneratedDocument {
    // Consolidar datos de todos los documentos
    const consolidatedData = this.consolidateExtractedFields(extractedFields)
    
    // Generar secciones del documento
    const sections = this.generateDocumentSections(consolidatedData)
    
    // Crear metadatos
    const metadata: DocumentMetadata = {
      generatedAt: new Date(),
      notaria: consolidatedData.notario.numero,
      folio: consolidatedData.folioReal.numero,
      version: '1.0',
      confidence: this.calculateOverallConfidence(extractedFields)
    }
    
    // Generar HTML y texto
    const html = this.generateHTML(sections, metadata)
    const text = this.generateText(sections, metadata)
    
    return {
      title: 'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO',
      sections,
      metadata,
      html,
      text
    }
  }
  
  private static consolidateExtractedFields(extractedFields: ExtractedFields[]): ExtractedFields {
    // Tomar el primer documento como base y consolidar datos de otros
    const base = extractedFields[0] || this.getDefaultFields()
    
    // Consolidar datos de todos los documentos
    for (const fields of extractedFields.slice(1)) {
      // Consolidar datos del notario (priorizar el más confiable)
      if (fields.confianza > base.confianza) {
        base.notario = fields.notario
      }
      
      // Consolidar partes (combinar información)
      if (fields.partes.vendedor && !base.partes.vendedor) {
        base.partes.vendedor = fields.partes.vendedor
      }
      if (fields.partes.comprador && !base.partes.comprador) {
        base.partes.comprador = fields.partes.comprador
      }
      
      // Consolidar datos del inmueble
      if (fields.inmueble.unidad && !base.inmueble.unidad) {
        base.inmueble = { ...base.inmueble, ...fields.inmueble }
      }
      
      // Consolidar folio real
      if (fields.folioReal.numero && !base.folioReal.numero) {
        base.folioReal = fields.folioReal
      }
    }
    
    return base
  }
  
  private static getDefaultFields(): ExtractedFields {
    return {
      notario: {
        nombre: "XAVIER IBAÑEZ VERAMENDI",
        numero: "3",
        ubicacion: "Tijuana, Baja California"
      },
      partes: {
        vendedor: "MARÍA GONZÁLEZ RODRÍGUEZ",
        comprador: "CARLOS MÉNDEZ LÓPEZ"
      },
      actoJuridico: {
        tipo: "COMPRAVENTA DE INMUEBLE",
        descripcion: "Compraventa de inmueble"
      },
      folioReal: {
        numero: "12345",
        seccion: "PRIMERA",
        partida: "67890"
      },
      inmueble: {
        unidad: "B-2",
        lote: "15",
        manzana: "8",
        fraccionamiento: "San Marino",
        municipio: "Tijuana, Baja California",
        direccion: "Fraccionamiento San Marino, Unidad B-2, Lote 15, Manzana 8"
      },
      confianza: 0.85
    }
  }
  
  private static generateDocumentSections(data: ExtractedFields): DocumentSection[] {
    return [
      {
        id: 'header',
        title: 'ENCABEZADO NOTARIAL',
        content: this.generateHeaderSection(data),
        type: 'header',
        order: 1
      },
      {
        id: 'antecedentes',
        title: 'ANTECEDENTES REGISTRALES',
        content: this.generateAntecedentesSection(data),
        type: 'body',
        order: 2
      },
      {
        id: 'actos',
        title: 'ACTOS JURÍDICOS',
        content: this.generateActosSection(data),
        type: 'body',
        order: 3
      },
      {
        id: 'inmueble',
        title: 'IDENTIFICACIÓN DEL INMUEBLE',
        content: this.generateInmuebleSection(data),
        type: 'body',
        order: 4
      },
      {
        id: 'fundamento',
        title: 'FUNDAMENTO LEGAL',
        content: this.generateFundamentoSection(),
        type: 'legal',
        order: 5
      },
      {
        id: 'solicitud',
        title: 'SOLICITUD',
        content: this.generateSolicitudSection(data),
        type: 'body',
        order: 6
      },
      {
        id: 'firma',
        title: 'FIRMA Y AUTORIZACIÓN',
        content: this.generateFirmaSection(data),
        type: 'signature',
        order: 7
      }
    ]
  }
  
  private static generateHeaderSection(data: ExtractedFields): string {
    return `
SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO

NOTARÍA PÚBLICA NÚMERO ${data.notario.numero}
${data.notario.nombre}
${data.notario.ubicacion}

En ${data.notario.ubicacion}, a los ${this.getCurrentDay()} días del mes de ${this.getCurrentMonth()} de ${this.getCurrentYear()}.

A QUIEN CORRESPONDA:
`
  }
  
  private static generateAntecedentesSection(data: ExtractedFields): string {
    return `
Por medio del presente documento, me dirijo a ustedes para solicitar la certificación de libertad de gravamen o existencia de afectaciones del inmueble que a continuación se describe, conforme al artículo 2885 del Código Civil del Estado de Baja California.

ANTECEDENTES REGISTRALES:

1. El inmueble objeto de la presente solicitud se encuentra inscrito en el Registro Público de la Propiedad y del Comercio del Estado de Baja California bajo el folio real número ${data.folioReal.numero}, sección ${data.folioReal.seccion}, partida ${data.folioReal.partida}.

2. El acto jurídico que motiva la presente solicitud es una ${data.actoJuridico.tipo.toLowerCase()}, celebrada entre ${data.partes.vendedor} como vendedor y ${data.partes.comprador} como comprador.

3. Dicho acto jurídico se encuentra debidamente documentado y autorizado ante esta Notaría Pública.
`
  }
  
  private static generateActosSection(data: ExtractedFields): string {
    return `
ACTOS JURÍDICOS:

El inmueble objeto de la presente solicitud es materia de los siguientes actos jurídicos:

1. ${data.actoJuridico.tipo}: ${data.actoJuridico.descripcion}
   - Vendedor: ${data.partes.vendedor}
   - Comprador: ${data.partes.comprador}
   - Fecha: ${this.getCurrentDate()}
   - Notaría: ${data.notario.numero}
`
  }
  
  private static generateInmuebleSection(data: ExtractedFields): string {
    return `
IDENTIFICACIÓN DEL INMUEBLE:

El inmueble objeto de la presente solicitud se identifica de la siguiente manera:

1. UBICACIÓN: ${data.inmueble.direccion}
2. FRACCIONAMIENTO: ${data.inmueble.fraccionamiento}
3. UNIDAD: ${data.inmueble.unidad}
4. LOTE: ${data.inmueble.lote}
5. MANZANA: ${data.inmueble.manzana}
6. MUNICIPIO: ${data.inmueble.municipio}

El inmueble se encuentra debidamente inscrito en el Registro Público de la Propiedad y del Comercio del Estado de Baja California.
`
  }
  
  private static generateFundamentoSection(): string {
    return `
FUNDAMENTO LEGAL:

La presente solicitud se fundamenta en las siguientes disposiciones legales:

1. Artículo 2885 del Código Civil del Estado de Baja California, que establece la obligación de certificar la libertad de gravamen o existencia de afectaciones de los inmuebles objeto de actos jurídicos.

2. Artículo 2886 del mismo ordenamiento legal, que regula el procedimiento para la certificación de inmuebles.

3. Artículo 2887 del Código Civil del Estado de Baja California, que establece los efectos de la certificación.

4. Ley del Notariado del Estado de Baja California, que regula las funciones notariales en materia de certificaciones.

5. Reglamento del Registro Público de la Propiedad y del Comercio del Estado de Baja California, que establece los procedimientos para la certificación de inmuebles.
`
  }
  
  private static generateSolicitudSection(data: ExtractedFields): string {
    return `
SOLICITUD:

Por lo anteriormente expuesto, respetuosamente SOLICITO a ustedes:

1. Certificar la libertad de gravamen o existencia de afectaciones del inmueble identificado como ${data.inmueble.direccion}.

2. Emitir el certificado correspondiente con efecto de pre-aviso, conforme a lo establecido en el artículo 2885 del Código Civil del Estado de Baja California.

3. Incluir en el certificado la información relativa a:
   - Folio real: ${data.folioReal.numero}
   - Sección: ${data.folioReal.seccion}
   - Partida: ${data.folioReal.partida}
   - Ubicación del inmueble: ${data.inmueble.direccion}
   - Acto jurídico: ${data.actoJuridico.tipo}

4. Entregar el certificado en las oficinas de esta Notaría Pública, ubicadas en ${data.notario.ubicacion}.

La presente solicitud se presenta con el propósito de dar cumplimiento a las obligaciones legales establecidas para la celebración del acto jurídico mencionado.
`
  }
  
  private static generateFirmaSection(data: ExtractedFields): string {
    return `
FIRMA Y AUTORIZACIÓN:

Por lo anteriormente expuesto, se autoriza la presente solicitud y se solicita su trámite correspondiente.

${data.notario.ubicacion}, ${this.getCurrentDate()}

_________________________________
${data.notario.nombre}
NOTARIO PÚBLICO NÚMERO ${data.notario.numero}
${data.notario.ubicacion}

CERTIFICO: Que la presente solicitud ha sido debidamente autorizada y firmada en mi presencia, en la fecha y lugar antes señalados.

_________________________________
${data.notario.nombre}
NOTARIO PÚBLICO NÚMERO ${data.notario.numero}
`
  }
  
  private static generateHTML(sections: DocumentSection[], metadata: DocumentMetadata): string {
    const sectionsHTML = sections.map(section => `
      <div class="section" data-section-id="${section.id}">
        <h2 class="section-title">${section.title}</h2>
        <div class="section-content">${section.content.replace(/\n/g, '<br>')}</div>
      </div>
    `).join('')
    
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${metadata.notaria} - Solicitud de Certificado con Efecto de Pre-Aviso</title>
        <style>
          body { font-family: 'Times New Roman', serif; line-height: 1.6; margin: 40px; }
          .document-header { text-align: center; margin-bottom: 30px; }
          .section { margin-bottom: 25px; }
          .section-title { font-weight: bold; text-decoration: underline; margin-bottom: 10px; }
          .section-content { text-align: justify; }
          .highlight { background-color: yellow; padding: 2px; }
          .metadata { font-size: 12px; color: #666; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="document-header">
          <h1>SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO</h1>
          <p>NOTARÍA PÚBLICA NÚMERO ${metadata.notaria}</p>
        </div>
        ${sectionsHTML}
        <div class="metadata">
          <p>Generado el: ${metadata.generatedAt.toLocaleDateString('es-MX')}</p>
          <p>Confianza: ${Math.round(metadata.confidence * 100)}%</p>
        </div>
      </body>
      </html>
    `
  }
  
  private static generateText(sections: DocumentSection[], metadata: DocumentMetadata): string {
    const sectionsText = sections.map(section => 
      `${section.title}\n${section.content}\n`
    ).join('\n')
    
    return `
SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO
NOTARÍA PÚBLICA NÚMERO ${metadata.notaria}

${sectionsText}

---
Generado el: ${metadata.generatedAt.toLocaleDateString('es-MX')}
Confianza: ${Math.round(metadata.confidence * 100)}%
    `.trim()
  }
  
  private static calculateOverallConfidence(extractedFields: ExtractedFields[]): number {
    if (extractedFields.length === 0) return 0
    const totalConfidence = extractedFields.reduce((sum, fields) => sum + fields.confianza, 0)
    return totalConfidence / extractedFields.length
  }
  
  private static getCurrentDate(): string {
    const now = new Date()
    return now.toLocaleDateString('es-MX', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }
  
  private static getCurrentDay(): string {
    return new Date().getDate().toString()
  }
  
  private static getCurrentMonth(): string {
    return new Date().toLocaleDateString('es-MX', { month: 'long' })
  }
  
  private static getCurrentYear(): string {
    return new Date().getFullYear().toString()
  }
}



