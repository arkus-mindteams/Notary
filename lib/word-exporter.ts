"use client"

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx'
import { saveAs } from 'file-saver'
import { GeneratedDocument } from './document-generator'

export interface WordExportOptions {
  includeMetadata: boolean
  includeTimestamp: boolean
  fontSize: number
  fontFamily: string
  lineSpacing: number
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

export class WordExporter {
  private static defaultOptions: WordExportOptions = {
    includeMetadata: true,
    includeTimestamp: true,
    fontSize: 12,
    fontFamily: 'Arial',
    lineSpacing: 1.5,
    margins: {
      top: 720, // 0.5 inch in twips
      bottom: 720,
      left: 720,
      right: 720
    }
  }

  static async exportDocument(
    document: GeneratedDocument,
    options: Partial<WordExportOptions> = {}
  ): Promise<void> {
    const config = { ...this.defaultOptions, ...options }

    try {
      // Crear documento Word
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: config.margins
            }
          },
          children: [
            // Título principal
            new Paragraph({
              children: [
                new TextRun({
                  text: document.title,
                  bold: true,
                  size: 32, // 16pt
                  font: config.fontFamily
                })
              ],
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
              spacing: {
                after: 400
              }
            }),

            // Línea separadora
            new Paragraph({
              children: [
                new TextRun({
                  text: "─".repeat(50),
                  size: 20,
                  color: "666666"
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: {
                after: 200
              }
            }),

            // Metadatos (si se incluyen)
            ...(config.includeMetadata ? this.createMetadataSection(document, config) : []),

            // Contenido de las secciones
            ...this.createContentSections(document, config),

            // Pie de página
            ...(config.includeTimestamp ? this.createFooterSection(config) : [])
          ]
        }]
      })

      // Generar archivo
      const buffer = await Packer.toBlob(doc)
      
      // Generar nombre de archivo
      const fileName = this.generateFileName(document)
      
      // Descargar archivo
      saveAs(buffer, fileName)

    } catch (error) {
      console.error('Error exportando a Word:', error)
      throw error
    }
  }

  private static createMetadataSection(document: GeneratedDocument, config: WordExportOptions): Paragraph[] {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "INFORMACIÓN DEL DOCUMENTO",
            bold: true,
            size: 24, // 12pt
            font: config.fontFamily
          })
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: {
          before: 200,
          after: 200
        }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Notaría: ${document.metadata.notaria}`,
            size: config.fontSize * 2,
            font: config.fontFamily
          })
        ],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Folio: ${document.metadata.folio}`,
            size: config.fontSize * 2,
            font: config.fontFamily
          })
        ],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Versión: ${document.metadata.version}`,
            size: config.fontSize * 2,
            font: config.fontFamily
          })
        ],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Generado: ${document.metadata.generatedAt.toLocaleDateString()}`,
            size: config.fontSize * 2,
            font: config.fontFamily
          })
        ],
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Confianza: ${Math.round(document.metadata.confidence * 100)}%`,
            size: config.fontSize * 2,
            font: config.fontFamily
          })
        ],
        spacing: { after: 200 }
      })
    ]
  }

  private static createContentSections(document: GeneratedDocument, config: WordExportOptions): Paragraph[] {
    const sections: Paragraph[] = []

    document.sections.forEach((section, index) => {
      // Título de la sección
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.title,
              bold: true,
              size: 28, // 14pt
              font: config.fontFamily
            })
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: {
            before: index === 0 ? 0 : 400,
            after: 200
          }
        })
      )

      // Contenido de la sección
      const contentParagraphs = this.parseContentToParagraphs(section.content, config)
      sections.push(...contentParagraphs)

      // Espacio entre secciones
      if (index < document.sections.length - 1) {
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            spacing: { after: 200 }
          })
        )
      }
    })

    return sections
  }

  private static parseContentToParagraphs(content: string, config: WordExportOptions): Paragraph[] {
    // Dividir el contenido en párrafos
    const paragraphs = content.split('\n').filter(p => p.trim())
    
    return paragraphs.map(text => 
      new Paragraph({
        children: [
          new TextRun({
            text: text.trim(),
            size: config.fontSize * 2,
            font: config.fontFamily
          })
        ],
        spacing: {
          line: config.lineSpacing * 240, // Convert to twips
          after: 100
        },
        alignment: AlignmentType.JUSTIFIED
      })
    )
  }

  private static createFooterSection(config: WordExportOptions): Paragraph[] {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "─".repeat(50),
            size: 20,
            color: "666666"
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          before: 400,
          after: 200
        }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Sistema de Notaría Digital",
            size: 16, // 8pt
            font: config.fontFamily,
            italics: true
          })
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 100 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Generado: ${new Date().toLocaleString()}`,
            size: 16, // 8pt
            font: config.fontFamily,
            italics: true
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      })
    ]
  }

  private static generateFileName(document: GeneratedDocument): string {
    const date = new Date().toISOString().split('T')[0]
    const notaria = document.metadata.notaria
    const folio = document.metadata.folio
    
    return `PreAviso_Notaria${notaria}_Folio${folio}_${date}.docx`
  }

  // Método para exportar con formato específico para documentos notariales
  static async exportNotarialDocument(
    document: GeneratedDocument,
    options: Partial<WordExportOptions> = {}
  ): Promise<void> {
    const notarialOptions: WordExportOptions = {
      ...this.defaultOptions,
      ...options,
      fontSize: 12,
      fontFamily: 'Times New Roman',
      lineSpacing: 1.5,
      margins: {
        top: 1440, // 1 inch
        bottom: 1440,
        left: 1440,
        right: 1440
      }
    }

    await this.exportDocument(document, notarialOptions)
  }
}


