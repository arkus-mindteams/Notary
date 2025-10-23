"use client"

import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { GeneratedDocument } from './document-generator'

export interface ExportOptions {
  format: 'A4' | 'Letter'
  orientation: 'portrait' | 'landscape'
  margin: number
  fontSize: number
  includeMetadata: boolean
  includeTimestamp: boolean
}

export class PDFExporter {
  private static defaultOptions: ExportOptions = {
    format: 'A4',
    orientation: 'portrait',
    margin: 20,
    fontSize: 12,
    includeMetadata: true,
    includeTimestamp: true
  }

  static async exportDocument(
    document: GeneratedDocument, 
    options: Partial<ExportOptions> = {}
  ): Promise<void> {
    const config = { ...this.defaultOptions, ...options }
    
    // Crear nuevo documento PDF
    const pdf = new jsPDF({
      orientation: config.orientation,
      unit: 'mm',
      format: config.format
    })

    // Configurar fuente
    pdf.setFontSize(config.fontSize)

    // Agregar metadatos
    if (config.includeMetadata) {
      pdf.setProperties({
        title: document.title,
        subject: 'Documento Notarial - Pre-aviso',
        author: `Notaría ${document.metadata.notaria}`,
        creator: 'Sistema de Notaría Digital',
        producer: 'Sistema de Notaría Digital'
      })
    }

    // Agregar encabezado
    this.addHeader(pdf, document, config)
    
    // Agregar contenido
    this.addContent(pdf, document, config)
    
    // Agregar pie de página
    this.addFooter(pdf, document, config)

    // Generar nombre de archivo
    const fileName = this.generateFileName(document)
    
    // Descargar archivo
    pdf.save(fileName)
  }

  private static addHeader(pdf: jsPDF, document: GeneratedDocument, config: ExportOptions): void {
    const pageWidth = pdf.internal.pageSize.getWidth()
    const margin = config.margin

    // Título principal
    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'bold')
    pdf.text(document.title, pageWidth / 2, margin + 10, { align: 'center' })

    // Línea separadora
    pdf.setLineWidth(0.5)
    pdf.line(margin, margin + 15, pageWidth - margin, margin + 15)

    // Metadatos del documento
    if (config.includeMetadata) {
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      
      const metadataY = margin + 20
      pdf.text(`Notaría: ${document.metadata.notaria}`, margin, metadataY)
      pdf.text(`Folio: ${document.metadata.folio}`, pageWidth - margin - 30, metadataY)
      pdf.text(`Versión: ${document.metadata.version}`, pageWidth / 2, metadataY)
      
      if (config.includeTimestamp) {
        pdf.text(`Generado: ${document.metadata.generatedAt.toLocaleDateString()}`, margin, metadataY + 5)
        pdf.text(`Confianza: ${Math.round(document.metadata.confidence * 100)}%`, pageWidth - margin - 30, metadataY + 5)
      }
    }

    // Espacio antes del contenido
    pdf.setY(margin + (config.includeMetadata ? 35 : 25))
  }

  private static addContent(pdf: jsPDF, document: GeneratedDocument, config: ExportOptions): void {
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = config.margin
    const maxWidth = pageWidth - (margin * 2)
    let currentY = pdf.getY()

    // Procesar cada sección
    document.sections.forEach((section, index) => {
      // Verificar si necesitamos una nueva página
      if (currentY > pageHeight - 40) {
        pdf.addPage()
        currentY = margin
      }

      // Título de la sección
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text(section.title, margin, currentY)
      currentY += 8

      // Contenido de la sección
      pdf.setFontSize(config.fontSize)
      pdf.setFont('helvetica', 'normal')
      
      // Dividir el contenido en líneas que quepan en la página
      const lines = this.wrapText(section.content, maxWidth, pdf)
      
      lines.forEach(line => {
        if (currentY > pageHeight - 20) {
          pdf.addPage()
          currentY = margin
        }
        
        pdf.text(line, margin, currentY)
        currentY += 6
      })

      // Espacio entre secciones
      currentY += 10
    })
  }

  private static addFooter(pdf: jsPDF, document: GeneratedDocument, config: ExportOptions): void {
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = config.margin

    // Línea separadora
    pdf.setLineWidth(0.3)
    pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15)

    // Pie de página
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Sistema de Notaría Digital', margin, pageHeight - 10)
    pdf.text(`Página ${pdf.getCurrentPageInfo().pageNumber}`, pageWidth - margin - 20, pageHeight - 10)
    
    if (config.includeTimestamp) {
      pdf.text(`Generado: ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
    }
  }

  private static wrapText(text: string, maxWidth: number, pdf: jsPDF): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word
      const testWidth = pdf.getTextWidth(testLine)
      
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    })

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
  }

  private static generateFileName(document: GeneratedDocument): string {
    const date = new Date().toISOString().split('T')[0]
    const notaria = document.metadata.notaria
    const folio = document.metadata.folio
    
    return `PreAviso_Notaria${notaria}_Folio${folio}_${date}.pdf`
  }

  // Método para exportar desde HTML (para casos más complejos)
  static async exportFromHTML(
    elementId: string, 
    document: GeneratedDocument,
    options: Partial<ExportOptions> = {}
  ): Promise<void> {
    const config = { ...this.defaultOptions, ...options }
    
    try {
      const element = document.getElementById(elementId)
      if (!element) {
        throw new Error(`Elemento con ID ${elementId} no encontrado`)
      }

      // Capturar el elemento como canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true
      })

      // Crear PDF
      const pdf = new jsPDF({
        orientation: config.orientation,
        unit: 'mm',
        format: config.format
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = pdf.internal.pageSize.getWidth()
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Agregar imagen al PDF
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)

      // Generar nombre de archivo y descargar
      const fileName = this.generateFileName(document)
      pdf.save(fileName)

    } catch (error) {
      console.error('Error exportando desde HTML:', error)
      throw error
    }
  }
}


