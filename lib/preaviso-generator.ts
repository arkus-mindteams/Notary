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
    const folioReal = data.inmueble?.folio_real || ''
    const partidas = data.inmueble?.partidas || []
    const partidasStr = partidas.length > 0 ? partidas.join(', ') : ''
    
    return `Por medio del presente documento, me dirijo a ustedes para solicitar la certificación de libertad de gravamen o existencia de afectaciones del inmueble que a continuación se describe, conforme a lo dispuesto en el artículo 2885 del Código Civil del Estado de Baja California y demás disposiciones aplicables.

ANTECEDENTES:

1. El inmueble objeto de la presente solicitud se encuentra inscrito en el Registro Público de la Propiedad y del Comercio del Estado de Baja California bajo el folio real número ${folioReal}${partidasStr ? `, partida(s) ${partidasStr}` : ''}.

2. El acto jurídico que motiva la presente solicitud es una COMPRAVENTA DE INMUEBLE, que se pretende celebrar entre las partes que se identifican en el apartado siguiente.

3. Dicho acto jurídico se encuentra en proceso de documentación y autorización ante esta Notaría Pública.
`
  }

  private static generatePartesSection(data: PreavisoData): string {
    const primerVendedor = data.vendedores?.[0]
    const primerComprador = data.compradores?.[0]
    const vendedorNombre = primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social || 'No especificado'
    const vendedorRfc = primerVendedor?.persona_fisica?.rfc || primerVendedor?.persona_moral?.rfc || 'No especificado'
    const vendedorCurp = primerVendedor?.persona_fisica?.curp || 'No especificado'
    const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social || 'No especificado'
    const compradorRfc = primerComprador?.persona_fisica?.rfc || primerComprador?.persona_moral?.rfc || 'No especificado'
    const compradorCurp = primerComprador?.persona_fisica?.curp || 'No especificado'
    
    let partes = `IDENTIFICACIÓN DE LAS PARTES:

VENDEDOR:
- Nombre: ${vendedorNombre}
- RFC: ${vendedorRfc}
- CURP: ${vendedorCurp}
`

    if (primerVendedor?.tiene_credito) {
      partes += `- Crédito pendiente: Sí
- Institución: ${primerVendedor.credito_vendedor?.institucion || 'No especificada'}
- Número de crédito: ${primerVendedor.credito_vendedor?.numero_credito || 'No especificado'}
`
    } else {
      partes += `- Crédito pendiente: No
`
    }

    partes += `
COMPRADOR:
- Nombre: ${compradorNombre}
- RFC: ${compradorRfc}
- CURP: ${compradorCurp}
`

    const tieneCreditos = data.creditos && data.creditos.length > 0
    if (tieneCreditos) {
      partes += `- Requiere crédito: Sí\n`
      data.creditos.forEach((credito, index) => {
        partes += `- Crédito ${index + 1} - Institución: ${credito.institucion || 'No especificada'}\n`
        partes += `- Crédito ${index + 1} - Monto: ${credito.monto || 'No especificado'}\n`
      })
    } else {
      partes += `- Requiere crédito: No
`
    }

    return partes
  }

  private static generateInmuebleSection(data: PreavisoData): string {
    const direccion = data.inmueble?.direccion
    const direccionStr = typeof direccion === 'string' 
      ? direccion 
      : direccion?.calle 
        ? `${direccion.calle} ${direccion.numero || ''} ${direccion.colonia || ''}`.trim()
        : 'No especificada'
    const folioReal = data.inmueble?.folio_real || ''
    const partidas = data.inmueble?.partidas || []
    const partidasStr = partidas.length > 0 ? partidas.join(', ') : ''
    
    return `IDENTIFICACIÓN DEL INMUEBLE:

El inmueble objeto de la presente solicitud se identifica de la siguiente manera:

1. UBICACIÓN: ${direccionStr}
2. FOLIO REAL: ${folioReal}${partidasStr ? `, Partida(s) ${partidasStr}` : ''}
3. SUPERFICIE: ${data.inmueble?.superficie || 'No especificada'} metros cuadrados
4. VALOR DE LA OPERACIÓN: $${data.inmueble?.valor || 'No especificado'}

El inmueble se encuentra debidamente inscrito en el Registro Público de la Propiedad y del Comercio del Estado de Baja California.
`
  }

  private static generateActosSection(data: PreavisoData): string {
    const primerVendedor = data.vendedores?.[0]
    const primerComprador = data.compradores?.[0]
    const vendedorNombre = primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social || 'No especificado'
    const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social || 'No especificado'
    const direccion = data.inmueble?.direccion
    const direccionStr = typeof direccion === 'string' 
      ? direccion 
      : direccion?.calle 
        ? `${direccion.calle} ${direccion.numero || ''} ${direccion.colonia || ''}`.trim()
        : 'No especificada'
    
    const actos = []
    let actoNum = 1
    
    if (primerVendedor?.tiene_credito || (data.gravamenes && data.gravamenes.length > 0)) {
      actos.push(`${actoNum}. CANCELACIÓN DEL CRÉDITO DEL VENDEDOR:
   - Vendedor: ${vendedorNombre}
   - Institución crediticia: ${primerVendedor?.credito_vendedor?.institucion || 'No especificada'}
   - Número de crédito: ${primerVendedor?.credito_vendedor?.numero_credito || 'No especificado'}
   - Objeto: Cancelar el crédito o hipoteca que grava el inmueble objeto de la compraventa.`)
      actoNum++
    }
    
    actos.push(`${actoNum}. COMPRAVENTA DE INMUEBLE:
   - Vendedor: ${vendedorNombre}
   - Comprador: ${compradorNombre}
   - Inmueble: ${direccionStr}
   - Valor: $${data.inmueble?.valor || 'No especificado'}
   - Objeto: Transmitir la propiedad del inmueble del vendedor al comprador.`)
    actoNum++
    
    if (data.creditos && data.creditos.length > 0) {
      data.creditos.forEach((credito, index) => {
        actos.push(`${actoNum}. APERTURA DE CRÉDITO ${data.creditos.length > 1 ? `(${index + 1})` : ''}:
   - Comprador: ${compradorNombre}
   - Institución crediticia: ${credito.institucion || 'No especificada'}
   - Monto: ${credito.monto || 'No especificado'}
   - Tipo: ${credito.tipo_credito || 'No especificado'}
   - Objeto: Constituir hipoteca o garantía sobre el inmueble adquirido para garantizar el crédito otorgado.`)
        actoNum++
      })
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
    const direccion = data.inmueble?.direccion
    const direccionStr = typeof direccion === 'string' 
      ? direccion 
      : direccion?.calle 
        ? `${direccion.calle} ${direccion.numero || ''} ${direccion.colonia || ''}`.trim()
        : 'No especificada'
    const folioReal = data.inmueble?.folio_real || ''
    const partidas = data.inmueble?.partidas || []
    const partidasStr = partidas.length > 0 ? partidas.join(', ') : ''
    
    return `SOLICITUD:

Por lo anteriormente expuesto, respetuosamente SOLICITO a ustedes:

1. Certificar la libertad de gravamen o existencia de afectaciones del inmueble identificado como ${direccionStr}, inscrito en el folio real número ${folioReal}${partidasStr ? `, partida(s) ${partidasStr}` : ''}.

2. Emitir el certificado correspondiente con efecto de pre-aviso, conforme a lo establecido en el artículo 2885 del Código Civil del Estado de Baja California.

3. Incluir en el certificado la información relativa a:
   - Folio real: ${data.inmueble.folioReal}${data.inmueble.seccion ? `, Sección ${data.inmueble.seccion}` : ''}${data.inmueble.partida ? `, Partida ${data.inmueble.partida}` : ''}
   - Ubicación del inmueble: ${data.inmueble.direccion}
   - Actos jurídicos propuestos: ${this.getActosList(data)}
   - Partes involucradas: ${data.vendedores?.[0]?.persona_fisica?.nombre || data.vendedores?.[0]?.persona_moral?.denominacion_social || 'N/A'} (vendedor) y ${data.compradores?.[0]?.persona_fisica?.nombre || data.compradores?.[0]?.persona_moral?.denominacion_social || 'N/A'} (comprador)

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
    // Mantener compatibilidad: la cancelación de hipoteca ahora vive en PASO 6 (gravámenes).
    const needsCancelacionHipoteca =
      Array.isArray(data.gravamenes) &&
      data.gravamenes.length > 0 &&
      data.gravamenes.some((g: any) => g?.cancelacion_confirmada === false)
    if (needsCancelacionHipoteca) actos.push('Cancelación de hipoteca')
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
      const primerVendedor = data.vendedores?.[0]
      const primerComprador = data.compradores?.[0]
      const vendedorName = (primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social || 'Vendedor').split(' ')[0]
      const compradorName = (primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social || 'Comprador').split(' ')[0]
      const fileName = `Pre-Aviso_Compraventa_${vendedorName}_${compradorName}_${new Date().toISOString().split('T')[0]}.docx`
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

