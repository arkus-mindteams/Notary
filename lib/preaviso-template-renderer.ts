"use client"

import Handlebars from 'handlebars'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { PreavisoSimplifiedJSON } from './types/preaviso-simplified'
import type { PreavisoData } from '@/components/preaviso-chat'

// Helper para convertir número a romano
Handlebars.registerHelper('toRoman', function(num: number) {
  const romanNumerals: { [key: number]: string } = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
    6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'
  }
  return romanNumerals[num] || num.toString()
})

// Helper para formatear fecha
Handlebars.registerHelper('formatDate', function(date: Date, format: string) {
  const day = date.getDate()
  const month = date.toLocaleDateString('es-MX', { month: 'long' })
  const year = date.getFullYear()
  
  if (format === 'dia') return day.toString()
  if (format === 'mes') return month
  if (format === 'ano') return year.toString()
  return date.toLocaleDateString('es-MX')
})

export type DocumentFormat = 'word' | 'pdf'

export interface PreavisoTemplateData extends PreavisoSimplifiedJSON {
  fecha: {
    dia: string
    mes: string
    ano: string
    completa: string
  }
  notaria: {
    numero: string
    nombre: string
    ciudad: string
    estado: string
  }
}

export class PreavisoTemplateRenderer {
  private static readonly NOTARIA = {
    numero: '3',
    nombre: 'XAVIER IBAÑEZ VERAMENDI',
    ciudad: 'Tijuana',
    estado: 'Baja California'
  }

  /**
   * Prepara los datos para el template agregando metadata
   */
  private static prepareTemplateData(data: PreavisoSimplifiedJSON): PreavisoTemplateData {
    const now = new Date()
    
    return {
      ...data,
      fecha: {
        dia: now.getDate().toString(),
        mes: now.toLocaleDateString('es-MX', { month: 'long' }),
        ano: now.getFullYear().toString(),
        completa: now.toLocaleDateString('es-MX', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      },
      notaria: this.NOTARIA
    }
  }

  /**
   * Carga y compila un template Handlebars
   */
  private static async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    try {
      // Intentar cargar desde /public/templates
      const response = await fetch(`/templates/preaviso/${templateName}.hbs`)
      if (!response.ok) {
        // Fallback: intentar cargar desde ruta relativa
        const fallbackResponse = await fetch(`./templates/preaviso/${templateName}.hbs`)
        if (!fallbackResponse.ok) {
          throw new Error(`Template ${templateName} not found in /public/templates/preaviso/ or ./templates/preaviso/`)
        }
        const templateSource = await fallbackResponse.text()
        return Handlebars.compile(templateSource)
      }
      const templateSource = await response.text()
      return Handlebars.compile(templateSource)
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error)
      throw error
    }
  }

  /**
   * Renderiza el documento a Word (.docx) y devuelve URL de descarga
   */
  static async renderToWord(data: PreavisoSimplifiedJSON): Promise<string> {
    try {
      const templateData = this.prepareTemplateData(data)
      const template = await this.loadTemplate('word')
      const renderedText = template(templateData)

      // Convertir texto renderizado a párrafos de Word
      const paragraphs: Paragraph[] = []
      const lines = renderedText.split('\n').filter(line => line.trim())

      lines.forEach((line) => {
        const trimmedLine = line.trim()
        
        // Detectar títulos
        if (trimmedLine.includes('SOLICITUD DE CERTIFICADO') || 
            trimmedLine.includes('OBJETO DE LA COMPRAVENTA') ||
            trimmedLine.includes('CERTIFICO:')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: trimmedLine.includes('SOLICITUD') ? 32 : 28,
                  font: 'Times New Roman'
                })
              ],
              heading: trimmedLine.includes('SOLICITUD') ? HeadingLevel.TITLE : undefined,
              alignment: trimmedLine.includes('SOLICITUD') ? AlignmentType.CENTER : AlignmentType.LEFT,
              spacing: { after: 300 }
            })
          )
        } else if (trimmedLine.startsWith('NOTARÍA') || trimmedLine.startsWith('C. DIRECTOR')) {
          // Encabezado y destinatario
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 }
            })
          )
        } else if (trimmedLine.match(/^[IVX]+\./)) {
          // Actos jurídicos (números romanos)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              spacing: { before: 200, after: 120 }
            })
          )
        } else if (trimmedLine.startsWith('-')) {
          // Lista de detalles
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              spacing: { after: 120 },
              indent: { left: 720 } // 0.5 inch
            })
          )
        } else if (trimmedLine.match(/^\d+\./)) {
          // Numeración de propiedades
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              spacing: { after: 120 }
            })
          )
        } else if (trimmedLine.includes('_________________________________')) {
          // Línea de firma
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '_________________________________',
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              spacing: { before: 400, after: 200 }
            })
          )
        } else if (trimmedLine) {
          // Párrafo normal
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              spacing: { after: 120 },
              alignment: trimmedLine.includes('TIJUANA') ? AlignmentType.CENTER : AlignmentType.JUSTIFIED
            })
          )
        }
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

      // Generar blob y crear URL de descarga
      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      return url
    } catch (error) {
      console.error('Error rendering to Word:', error)
      throw error
    }
  }

  /**
   * Renderiza el documento a Word (.docx) y descarga directamente (método legacy)
   */
  static async renderToWordAndDownload(data: PreavisoSimplifiedJSON): Promise<void> {
    const url = await this.renderToWord(data)
    const fileName = this.generateFileName(data, 'docx')
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Renderiza el documento a PDF y devuelve URL de descarga
   */
  static async renderToPDF(data: PreavisoSimplifiedJSON): Promise<string> {
    try {
      const templateData = this.prepareTemplateData(data)
      const template = await this.loadTemplate('pdf')
      const renderedHTML = template(templateData)

      // Crear elemento temporal para renderizar HTML
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = renderedHTML
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.width = '8.5in' // Letter size
      document.body.appendChild(tempDiv)

      // Capturar como canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 816, // 8.5in * 96 DPI
        height: tempDiv.scrollHeight
      })

      // Limpiar elemento temporal
      document.body.removeChild(tempDiv)

      // Crear PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = pdf.internal.pageSize.getWidth()
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Si la imagen es más alta que una página, dividirla
      const pageHeight = pdf.internal.pageSize.getHeight()
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      // Generar blob y crear URL de descarga
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      return url
    } catch (error) {
      console.error('Error rendering to PDF:', error)
      throw error
    }
  }

  /**
   * Renderiza el documento a PDF y descarga directamente (método legacy)
   */
  static async renderToPDFAndDownload(data: PreavisoSimplifiedJSON): Promise<void> {
    const url = await this.renderToPDF(data)
    const fileName = this.generateFileName(data, 'pdf')
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Renderiza el documento a texto plano
   */
  static async renderToText(data: PreavisoSimplifiedJSON): Promise<string> {
    try {
      const templateData = this.prepareTemplateData(data)
      const template = await this.loadTemplate('word') // Usar template de word para texto
      const renderedText = template(templateData)
      return renderedText
    } catch (error) {
      console.error('Error rendering to text:', error)
      throw error
    }
  }

  /**
   * Genera URL de descarga para texto plano
   */
  static generateTextDownloadUrl(text: string, data: PreavisoSimplifiedJSON): string {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    return url
  }

  /**
   * Genera el nombre del archivo
   */
  static generateFileName(data: PreavisoSimplifiedJSON, extension: 'docx' | 'pdf' | 'txt'): string {
    const date = new Date().toISOString().split('T')[0]
    const vendedorName = data.vendedor?.nombre?.split(' ')[0] || 'Vendedor'
    const compradorName = data.comprador?.nombre?.split(' ')[0] || 'Comprador'
    return `Pre-Aviso_${vendedorName}_${compradorName}_${date}.${extension}`
  }

  /**
   * Convierte PreavisoData (formato actual) a PreavisoSimplifiedJSON
   */
  static convertFromPreavisoData(data: PreavisoData): PreavisoSimplifiedJSON {
    return {
      tipoOperacion: data.tipoOperacion,
      vendedor: data.vendedor ? {
        nombre: data.vendedor.nombre || null,
        rfc: data.vendedor.rfc || null,
        curp: data.vendedor.curp || null,
        tipoPersona: null, // No está en PreavisoData actual
        tieneCredito: data.vendedor.tieneCredito,
        institucionCredito: data.vendedor.institucionCredito || null,
        numeroCredito: data.vendedor.numeroCredito || null
      } : null,
      comprador: data.comprador ? {
        nombre: data.comprador.nombre || null,
        rfc: data.comprador.rfc || null,
        curp: data.comprador.curp || null,
        tipoPersona: null, // No está en PreavisoData actual
        necesitaCredito: data.comprador.necesitaCredito,
        institucionCredito: data.comprador.institucionCredito || null,
        montoCredito: data.comprador.montoCredito || null
      } : null,
      inmueble: data.inmueble ? {
        direccion: data.inmueble.direccion || null,
        folioReal: data.inmueble.folioReal || null,
        seccion: data.inmueble.seccion || null,
        partida: data.inmueble.partida || null,
        superficie: data.inmueble.superficie || null,
        valor: data.inmueble.valor || null,
        unidad: data.inmueble.unidad || null,
        modulo: data.inmueble.modulo || null,
        condominio: data.inmueble.condominio || null,
        lote: data.inmueble.lote || null,
        manzana: data.inmueble.manzana || null,
        fraccionamiento: data.inmueble.fraccionamiento || null,
        colonia: data.inmueble.colonia || null
      } : null,
      actos: data.actosNotariales
    }
  }
}

