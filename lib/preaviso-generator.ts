"use client"

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, WidthType } from 'docx'
import { saveAs } from 'file-saver'
import type { PreavisoData } from '@/components/preaviso-chat'

export interface PreavisoDocument {
  title: string
  sections: PreavisoSection[]
  html: string
  text: string
}

export interface PreavisoSection {
  id: string
  title: string
  content: string
  type: 'header' | 'body' | 'legal' | 'signature'
  order: number
}

export class PreavisoGenerator {
  /**
   * Genera el documento de Pre-Aviso de Compraventa con fundamento legal correcto
   * según la Ley del Notariado y el Código Civil de Baja California
   */
  static generatePreavisoDocument(data: PreavisoData): PreavisoDocument {
    const sections = this.generateDocumentSections(data)
    
    const html = this.generateHTML(sections, data)
    const text = this.generateText(sections, data)
    
    return {
      title: 'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO',
      sections,
      html,
      text
    }
  }

  private static generateDocumentSections(data: PreavisoData): PreavisoSection[] {
    return [
      {
        id: 'header',
        title: 'ENCABEZADO',
        content: this.generateHeaderSection(data),
        type: 'header',
        order: 1
      },
      {
        id: 'antecedentes',
        title: 'ANTECEDENTES',
        content: this.generateAntecedentesSection(data),
        type: 'body',
        order: 2
      },
      {
        id: 'partes',
        title: 'IDENTIFICACIÓN DE LAS PARTES',
        content: this.generatePartesSection(data),
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
        id: 'actos',
        title: 'ACTOS JURÍDICOS PROPUESTOS',
        content: this.generateActosSection(data),
        type: 'body',
        order: 5
      },
      {
        id: 'fundamento',
        title: 'FUNDAMENTO LEGAL',
        content: this.generateFundamentoSection(),
        type: 'legal',
        order: 6
      },
      {
        id: 'solicitud',
        title: 'SOLICITUD',
        content: this.generateSolicitudSection(data),
        type: 'body',
        order: 7
      },
      {
        id: 'firma',
        title: 'FIRMA Y AUTORIZACIÓN',
        content: this.generateFirmaSection(data),
        type: 'signature',
        order: 8
      }
    ]
  }

  private static generateHeaderSection(data: PreavisoData): string {
    const fecha = this.getCurrentDate()
    return `SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO

NOTARÍA PÚBLICA NÚMERO 3
XAVIER IBAÑEZ VERAMENDI
Tijuana, Baja California

En Tijuana, Baja California, a los ${this.getCurrentDay()} días del mes de ${this.getCurrentMonth()} de ${this.getCurrentYear()}.

A QUIEN CORRESPONDA:
`
  }

  private static generateAntecedentesSection(data: PreavisoData): string {
    return `Por medio del presente documento, me dirijo a ustedes para solicitar la certificación de libertad de gravamen o existencia de afectaciones del inmueble que a continuación se describe, conforme a lo dispuesto en el artículo 2885 del Código Civil del Estado de Baja California y demás disposiciones aplicables.

ANTECEDENTES:

1. El inmueble objeto de la presente solicitud se encuentra inscrito en el Registro Público de la Propiedad y del Comercio del Estado de Baja California bajo el folio real número ${data.inmueble.folioReal}${data.inmueble.seccion ? `, sección ${data.inmueble.seccion}` : ''}${data.inmueble.partida ? `, partida ${data.inmueble.partida}` : ''}.

2. El acto jurídico que motiva la presente solicitud es una COMPRAVENTA DE INMUEBLE, que se pretende celebrar entre las partes que se identifican en el apartado siguiente.

3. Dicho acto jurídico se encuentra en proceso de documentación y autorización ante esta Notaría Pública.
`
  }

  private static generatePartesSection(data: PreavisoData): string {
    let partes = `IDENTIFICACIÓN DE LAS PARTES:

VENDEDOR:
- Nombre: ${data.vendedor.nombre}
- RFC: ${data.vendedor.rfc}
- CURP: ${data.vendedor.curp}
`

    if (data.vendedor.tieneCredito) {
      partes += `- Crédito pendiente: Sí
- Institución: ${data.vendedor.institucionCredito || 'No especificada'}
- Número de crédito: ${data.vendedor.numeroCredito || 'No especificado'}
`
    } else {
      partes += `- Crédito pendiente: No
`
    }

    partes += `
COMPRADOR:
- Nombre: ${data.comprador.nombre}
- RFC: ${data.comprador.rfc}
- CURP: ${data.comprador.curp}
`

    if (data.comprador.necesitaCredito) {
      partes += `- Requiere crédito: Sí
- Institución: ${data.comprador.institucionCredito || 'No especificada'}
- Monto del crédito: ${data.comprador.montoCredito || 'No especificado'}
`
    } else {
      partes += `- Requiere crédito: No
`
    }

    return partes
  }

  private static generateInmuebleSection(data: PreavisoData): string {
    return `IDENTIFICACIÓN DEL INMUEBLE:

El inmueble objeto de la presente solicitud se identifica de la siguiente manera:

1. UBICACIÓN: ${data.inmueble.direccion}
2. FOLIO REAL: ${data.inmueble.folioReal}${data.inmueble.seccion ? `, Sección ${data.inmueble.seccion}` : ''}${data.inmueble.partida ? `, Partida ${data.inmueble.partida}` : ''}
3. SUPERFICIE: ${data.inmueble.superficie} metros cuadrados
4. VALOR DE LA OPERACIÓN: $${data.inmueble.valor}

El inmueble se encuentra debidamente inscrito en el Registro Público de la Propiedad y del Comercio del Estado de Baja California.
`
  }

  private static generateActosSection(data: PreavisoData): string {
    const actos = []
    
    if (data.actosNotariales.cancelacionCreditoVendedor) {
      actos.push(`1. CANCELACIÓN DEL CRÉDITO DEL VENDEDOR:
   - Vendedor: ${data.vendedor.nombre}
   - Institución crediticia: ${data.vendedor.institucionCredito || 'No especificada'}
   - Número de crédito: ${data.vendedor.numeroCredito || 'No especificado'}
   - Objeto: Cancelar el crédito o hipoteca que grava el inmueble objeto de la compraventa.`)
    }
    
    actos.push(`2. COMPRAVENTA DE INMUEBLE:
   - Vendedor: ${data.vendedor.nombre}
   - Comprador: ${data.comprador.nombre}
   - Inmueble: ${data.inmueble.direccion}
   - Valor: $${data.inmueble.valor}
   - Objeto: Transmitir la propiedad del inmueble del vendedor al comprador.`)
    
    if (data.actosNotariales.aperturaCreditoComprador) {
      actos.push(`3. APERTURA DE CRÉDITO DEL COMPRADOR:
   - Comprador: ${data.comprador.nombre}
   - Institución crediticia: ${data.comprador.institucionCredito || 'No especificada'}
   - Monto: ${data.comprador.montoCredito || 'No especificado'}
   - Objeto: Constituir hipoteca o garantía sobre el inmueble adquirido para garantizar el crédito otorgado.`)
    }

    return `ACTOS JURÍDICOS PROPUESTOS:

El inmueble objeto de la presente solicitud será materia de los siguientes actos jurídicos notariales:

${actos.join('\n\n')}

Estos actos jurídicos se encuentran en proceso de documentación y autorización ante esta Notaría Pública.
`
  }

  private static generateFundamentoSection(): string {
    return `FUNDAMENTO LEGAL:

La presente solicitud se fundamenta en las siguientes disposiciones legales:

1. Artículo 2885 del Código Civil del Estado de Baja California, que establece la obligación de certificar la libertad de gravamen o existencia de afectaciones de los inmuebles objeto de actos jurídicos.

2. Artículo 2886 del Código Civil del Estado de Baja California, que regula el procedimiento para la certificación de inmuebles y establece los requisitos que deben cumplirse.

3. Artículo 2887 del Código Civil del Estado de Baja California, que establece los efectos de la certificación y su validez.

4. Ley del Notariado del Estado de Baja California, que regula las funciones notariales en materia de certificaciones y actos jurídicos.

5. Reglamento del Registro Público de la Propiedad y del Comercio del Estado de Baja California, que establece los procedimientos para la certificación de inmuebles y el efecto de pre-aviso.

6. Código Civil Federal, en lo relativo a la compraventa de inmuebles y la transmisión de la propiedad.

7. Ley Federal de Instituciones de Crédito, en lo relativo a las operaciones crediticias y garantías hipotecarias.

La certificación con efecto de pre-aviso tiene por objeto garantizar que el inmueble se encuentra libre de gravámenes y afectaciones al momento de la celebración del acto jurídico, protegiendo los derechos de las partes y de terceros.
`
  }

  private static generateSolicitudSection(data: PreavisoData): string {
    return `SOLICITUD:

Por lo anteriormente expuesto, respetuosamente SOLICITO a ustedes:

1. Certificar la libertad de gravamen o existencia de afectaciones del inmueble identificado como ${data.inmueble.direccion}, inscrito en el folio real número ${data.inmueble.folioReal}${data.inmueble.seccion ? `, sección ${data.inmueble.seccion}` : ''}${data.inmueble.partida ? `, partida ${data.inmueble.partida}` : ''}.

2. Emitir el certificado correspondiente con efecto de pre-aviso, conforme a lo establecido en el artículo 2885 del Código Civil del Estado de Baja California.

3. Incluir en el certificado la información relativa a:
   - Folio real: ${data.inmueble.folioReal}${data.inmueble.seccion ? `, Sección ${data.inmueble.seccion}` : ''}${data.inmueble.partida ? `, Partida ${data.inmueble.partida}` : ''}
   - Ubicación del inmueble: ${data.inmueble.direccion}
   - Actos jurídicos propuestos: ${this.getActosList(data)}
   - Partes involucradas: ${data.vendedor.nombre} (vendedor) y ${data.comprador.nombre} (comprador)

4. Entregar el certificado en las oficinas de esta Notaría Pública, ubicadas en Tijuana, Baja California.

La presente solicitud se presenta con el propósito de dar cumplimiento a las obligaciones legales establecidas para la celebración de los actos jurídicos mencionados y garantizar la seguridad jurídica de la operación.
`
  }

  private static generateFirmaSection(data: PreavisoData): string {
    return `FIRMA Y AUTORIZACIÓN:

Por lo anteriormente expuesto, se autoriza la presente solicitud y se solicita su trámite correspondiente.

Tijuana, Baja California, ${this.getCurrentDate()}

_________________________________
XAVIER IBAÑEZ VERAMENDI
NOTARIO PÚBLICO NÚMERO 3
Tijuana, Baja California

CERTIFICO: Que la presente solicitud ha sido debidamente autorizada y firmada en mi presencia, en la fecha y lugar antes señalados.

_________________________________
XAVIER IBAÑEZ VERAMENDI
NOTARIO PÚBLICO NÚMERO 3
Tijuana, Baja California
`
  }

  private static getActosList(data: PreavisoData): string {
    const actos = []
    if (data.actosNotariales.cancelacionCreditoVendedor) {
      actos.push('Cancelación del crédito del vendedor')
    }
    actos.push('Compraventa')
    if (data.actosNotariales.aperturaCreditoComprador) {
      actos.push('Apertura de crédito del comprador')
    }
    return actos.join(', ')
  }

  private static generateHTML(sections: PreavisoSection[], data: PreavisoData): string {
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
        <title>Pre-Aviso de Compraventa</title>
        <style>
          body { font-family: 'Times New Roman', serif; line-height: 1.6; margin: 40px; }
          .document-header { text-align: center; margin-bottom: 30px; }
          .section { margin-bottom: 25px; }
          .section-title { font-weight: bold; text-decoration: underline; margin-bottom: 10px; }
          .section-content { text-align: justify; }
        </style>
      </head>
      <body>
        <div class="document-header">
          <h1>SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO</h1>
        </div>
        ${sectionsHTML}
      </body>
      </html>
    `
  }

  private static generateText(sections: PreavisoSection[], data: PreavisoData): string {
    return sections.map(section => 
      `${section.title}\n${section.content}\n`
    ).join('\n')
  }

  /**
   * Exporta el documento a Word (.docx) de forma editable
   */
  static async exportToWord(document: PreavisoDocument, data: PreavisoData): Promise<void> {
    try {
      const paragraphs: Paragraph[] = []

      // Título
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: document.title,
              bold: true,
              size: 32, // 16pt
              font: 'Times New Roman'
            })
          ],
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      )

      // Secciones
      document.sections.forEach((section) => {
        // Título de sección
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.title,
                bold: true,
                size: 28, // 14pt
                font: 'Times New Roman'
              })
            ],
            spacing: { before: 300, after: 200 }
          })
        )

        // Contenido de sección
        const lines = section.content.split('\n').filter(line => line.trim())
        lines.forEach((line) => {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 24, // 12pt
                  font: 'Times New Roman'
                })
              ],
              spacing: { after: 120 },
              alignment: line.includes('SOLICITUD') || line.includes('CERTIFICO') 
                ? AlignmentType.JUSTIFIED 
                : AlignmentType.LEFT
            })
          )
        })
      })

      // Crear documento Word
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                bottom: 1440,
                left: 1440,
                right: 1440
              }
            }
          },
          children: paragraphs
        }]
      })

      // Generar y descargar
      const blob = await Packer.toBlob(doc)
      const fileName = `Pre-Aviso_Compraventa_${data.vendedor.nombre.split(' ')[0]}_${data.comprador.nombre.split(' ')[0]}_${new Date().toISOString().split('T')[0]}.docx`
      saveAs(blob, fileName)
    } catch (error) {
      console.error('Error exportando a Word:', error)
      throw error
    }
  }

  private static getCurrentDate(): string {
    return new Date().toLocaleDateString('es-MX', { 
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

