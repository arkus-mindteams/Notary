"use client"

import Handlebars from 'handlebars'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { PreavisoSimplifiedJSON } from './types/preaviso-simplified'
import type { PreavisoData } from '@/components/preaviso-chat'

// Helper para convertir número a romano
Handlebars.registerHelper('toRoman', function (num: number) {
  const romanNumerals: { [key: number]: string } = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
    6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'
  }
  return romanNumerals[num] || num.toString()
})

// Helper para comparar valores (expresión helper para usar en {{#if}})
Handlebars.registerHelper('eq', function (a: any, b: any, options?: any) {
  // Si se usa como bloque helper ({{#eq a b}}...{{/eq}})
  if (options && typeof options === 'object' && 'fn' in options) {
    return a === b ? options.fn(this) : options.inverse(this)
  }
  // Si se usa como expresión helper ({{#if (eq a b)}})
  return a === b
})

// Helper para verificar si un array tiene elementos
Handlebars.registerHelper('hasItems', function (array: any) {
  return Array.isArray(array) && array.length > 0
})

// Helper para incrementar (útil para @index en templates)
Handlebars.registerHelper('inc', function (value: any) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n + 1 : value
})

// Helper para formatear fecha
Handlebars.registerHelper('formatDate', function (date: Date, format: string) {
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
  include_urban_dev_article_139: boolean
  gravamenPrincipal?: PreavisoSimplifiedJSON['gravamenes'] extends Array<infer T> ? T : any
}

export class PreavisoTemplateRenderer {
  private static readonly NOTARIA = {
    numero: '3',
    nombre: 'PEDRO CHÁVEZ SÁNCHEZ',
    ciudad: 'Tijuana',
    estado: 'Baja California'
  }

  /**
   * Valida que los datos sean suficientes para generar el documento
   */
  static validateBeforeRender(data: PreavisoSimplifiedJSON): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    // Validar que existe al menos un vendedor
    if (!data.vendedores || data.vendedores.length === 0) {
      errors.push('Falta al menos un vendedor')
    } else {
      const vendedor = data.vendedores[0]
      if (!vendedor.nombre && !vendedor.denominacion_social) {
        errors.push('El vendedor requiere nombre o denominación social')
      }
    }

    // Validar que existe al menos un comprador
    if (!data.compradores || data.compradores.length === 0) {
      errors.push('Falta al menos un comprador')
    } else {
      const comprador = data.compradores[0]
      if (!comprador.nombre && !comprador.denominacion_social) {
        errors.push('El comprador requiere nombre o denominación social')
      }
    }

    // Validar que existe inmueble
    if (!data.inmueble) {
      errors.push('Falta información del inmueble')
    } else {
      if (!data.inmueble.folioReal && !data.inmueble.direccion) {
        errors.push('El inmueble requiere folio real o dirección')
      }
    }

    // Validar que los actos tienen los datos necesarios
    if (data.actos.cancelacionHipoteca) {
      const g0 = data.gravamenes?.[0]
      if (!g0) {
        errors.push('Acto de cancelación de hipoteca requiere al menos un gravamen capturado')
      }
      if (g0 && g0.cancelacion_confirmada !== false) {
        errors.push('Acto de cancelación de hipoteca requiere que la cancelación esté pendiente (cancelacion_confirmada=false)')
      }
    }

    if (data.actos.aperturaCreditoComprador) {
      if (!data.creditos || data.creditos.length === 0) {
        errors.push('Acto de apertura de crédito requiere al menos un crédito')
      } else {
        // Validar que cada crédito tiene institución
        data.creditos.forEach((c, idx) => {
          if (!c.institucion) {
            errors.push(`Crédito ${idx + 1} requiere institución crediticia`)
          }
        })
      }
    }

    const normalizePartida = (p: any): string | null => {
      if (typeof p === 'string') return p
      if (!p) return null
      const v = p.partida || p.numero || p.folio || p.value
      return v ? String(v) : null
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Prepara los datos para el template agregando metadata
   * Convierte arrays (vendedores[], compradores[]) a singular (vendedor, comprador) para compatibilidad con templates
   * Calcula la numeración de actos jurídicos
   * Resuelve party_id a nombres en participantes de créditos
   */
  public static prepareTemplateData(data: PreavisoSimplifiedJSON): PreavisoTemplateData & {
    vendedor: PreavisoSimplifiedJSON['vendedores'][0] | null
    comprador: PreavisoSimplifiedJSON['compradores'][0] | null
    actosNumerados: Array<{
      numero: number
      numeroRomano: string
      tipo: 'cancelacionHipoteca' | 'compraventa' | 'aperturaCreditoComprador'
      creditos?: Array<PreavisoSimplifiedJSON['creditos'][0] & {
        participantes?: Array<{
          party_id: string | null
          rol: string | null
          nombre?: string | null
        }>
      }>
    }>
  } {
    const now = new Date()

    // Extraer primer vendedor y comprador para compatibilidad con templates
    const vendedor = data.vendedores?.[0] || null
    const comprador = data.compradores?.[0] || null

    // Calcular numeración de actos jurídicos
    const actosNumerados: Array<{
      numero: number
      numeroRomano: string
      tipo: 'cancelacionHipoteca' | 'compraventa' | 'aperturaCreditoComprador'
      creditos?: Array<PreavisoSimplifiedJSON['creditos'][0]>
    }> = []

    let actoNum = 1
    const romanNumerals: { [key: number]: string } = {
      1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
      6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'
    }

    // Acto 1: Cancelación de hipoteca (si aplica)
    if (data.actos.cancelacionHipoteca) {
      actosNumerados.push({
        numero: actoNum,
        numeroRomano: romanNumerals[actoNum] || actoNum.toString(),
        tipo: 'cancelacionHipoteca'
      })
      actoNum++
    }

    // Acto 2: Compraventa (siempre presente)
    if (data.actos.compraventa) {
      actosNumerados.push({
        numero: actoNum,
        numeroRomano: romanNumerals[actoNum] || actoNum.toString(),
        tipo: 'compraventa'
      })
      actoNum++
    }

    // Acto 3: Apertura de crédito (UN SOLO ACTO) con listado de créditos y participantes
    // Requisito: no generar múltiples actos, sino un solo contrato con varios créditos dentro.
    if (data.actos.aperturaCreditoComprador && data.creditos && data.creditos.length > 0) {
      const creditosConParticipantes = data.creditos.map(credito => {
        let participantesConNombres = (credito.participantes || []).map(p => {
          const rawNombre = (p as any)?.nombre ? String((p as any).nombre).trim() : ''
          const normalize = (s: string) =>
            String(s || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          const nNorm = normalize(rawNombre)
          const looksLikePlaceholder =
            nNorm === 'el comprador' ||
            nNorm === 'la compradora' ||
            nNorm.startsWith('el comprad') ||
            nNorm.startsWith('la comprad') ||
            nNorm === 'el conyuge' ||
            nNorm === 'la conyuge' ||
            nNorm.startsWith('el conyug') ||
            nNorm.startsWith('la conyug')

          // Si ya tenemos nombre explícito y NO es placeholder, respetarlo (no sobrescribir)
          if (rawNombre && rawNombre.length >= 3 && !looksLikePlaceholder) {
            return p
          }

          // Si tiene party_id, buscar en compradores/vendedores
          if (p.party_id) {
            // Buscar en compradores
            const comprador = data.compradores.find(c => c.party_id === p.party_id)
            if (comprador) {
              return {
                ...p,
                // Si ya tiene nombre, preservarlo; si no, usar el del comprador
                nombre: (p as any)?.nombre || comprador.nombre || comprador.denominacion_social || null
              }
            }
            // Buscar en vendedores si no está en compradores
            const vendedor = data.vendedores.find(v => v.party_id === p.party_id)
            if (vendedor) {
              return {
                ...p,
                // Si ya tiene nombre, preservarlo; si no, usar el del vendedor
                nombre: (p as any)?.nombre || vendedor.nombre || vendedor.denominacion_social || null
              }
            }
          }

          // Si no tiene party_id pero es coacreditado, buscar por nombre en compradores[0].persona_fisica.conyuge
          // o buscar en todos los compradores por nombre si ya existe
          // IMPORTANTE: También verificar si tiene party_id pero es coacreditado (puede ser cónyuge con party_id)
          if (p.rol === 'coacreditado') {
            // CRÍTICO: Si ya tiene nombre válido, preservarlo (no sobrescribir)
            if ((p as any)?.nombre && String((p as any).nombre).trim().length >= 3) {
              return p
            }

            // Buscar el nombre del cónyuge en el contexto
            const comprador0 = data.compradores[0]
            const conyugeNombre = comprador0?.persona_fisica?.conyuge?.nombre || null

            if (conyugeNombre) {
              // Buscar si ya existe como comprador separado
              const conyugeComprador = data.compradores.find((c, idx) => {
                if (idx === 0) return false
                const nm = c.nombre || c.denominacion_social || null
                return nm && nm.toLowerCase().trim() === conyugeNombre.toLowerCase().trim()
              })

              if (conyugeComprador) {
                return {
                  ...p,
                  // Si ya tiene nombre, preservarlo; si no, usar el del cónyuge
                  nombre: (p as any)?.nombre || conyugeComprador.nombre || conyugeComprador.denominacion_social || conyugeNombre
                }
              }

              // Si no existe como comprador separado, usar el nombre del cónyuge
              // CRÍTICO: Incluir nombre incluso si tiene party_id (para cónyuges que fueron creados como compradores)
              return {
                ...p,
                // Si ya tiene nombre, preservarlo; si no, usar el del contexto
                nombre: (p as any)?.nombre || conyugeNombre
              }
            }

            // Si no hay nombre del cónyuge en el contexto pero el participante es coacreditado,
            // buscar en todos los compradores (puede ser que el cónyuge esté como segundo comprador)
            if (data.compradores.length > 1) {
              const segundoComprador = data.compradores[1]
              const segundoNombre = segundoComprador?.nombre || segundoComprador?.denominacion_social || null
              if (segundoNombre) {
                return {
                  ...p,
                  nombre: (p as any)?.nombre || segundoNombre
                }
              }
            }
          }

          // Fallback final: si sigue sin nombre y es acreditado principal, usar comprador[0]
          if (p.rol === 'acreditado') {
            const c0 = data.compradores?.[0]
            const c0Nombre = (c0 as any)?.nombre || (c0 as any)?.denominacion_social || c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social || null
            if (c0Nombre) {
              return { ...p, nombre: c0Nombre }
            }
          }

          return p
        })
        // Guardrail: si no hay acreditado explícito, usar comprador principal
        const hasAcreditado = participantesConNombres.some(p => p?.rol === 'acreditado')
        if (!hasAcreditado && data.compradores?.[0]) {
          const comprador0 = data.compradores[0]
          const nombre = comprador0.nombre || comprador0.denominacion_social || null
          if (nombre) {
            participantesConNombres = [
              {
                party_id: comprador0.party_id || null,
                rol: 'acreditado',
                nombre
              },
              ...participantesConNombres
            ]
          }
        }

        return {
          ...credito,
          participantes: participantesConNombres
        }
      })

      actosNumerados.push({
        numero: actoNum,
        numeroRomano: romanNumerals[actoNum] || actoNum.toString(),
        tipo: 'aperturaCreditoComprador',
        creditos: creditosConParticipantes
      })
      actoNum++
    }
    // NOTA: No hay fallback - si no hay créditos en el array, no se muestra el acto

    // Determinar si se incluye Artículo 139
    const includeArticle139 = data.inmueble?.all_registry_pages_confirmed === true || false

    return {
      ...data,
      vendedor,
      comprador,
      actosNumerados,
      include_urban_dev_article_139: includeArticle139,
      gravamenPrincipal: data.gravamenes?.[0] || null,
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
      // VALIDACIÓN FINAL (OBLIGATORIA)
      const validation = this.validateBeforeRender(data)
      if (!validation.isValid) {
        throw new Error(`No se puede generar el documento. Errores: ${validation.errors.join(', ')}`)
      }

      const templateData = this.prepareTemplateData(data)
      const template = await this.loadTemplate('word')
      const renderedText = template(templateData)

      // Convertir texto renderizado a párrafos de Word
      const paragraphs: Paragraph[] = []
      const lines = renderedText.split('\n').filter(line => line.trim())

      lines.forEach((line) => {
        const trimmedLine = line.trim()

        // Detectar títulos y encabezados centrados
        const isCenteredHeader =
          trimmedLine.includes('LIC.') ||
          trimmedLine.includes('NOTARIO ADSCRITO') ||
          trimmedLine.includes('NOTARIO TITULAR') ||
          trimmedLine.includes('CALLE ANTONIO CASO') ||
          trimmedLine.startsWith('TEL:') ||
          trimmedLine.includes('SOLICITUD DE CERTIFICADO') ||
          trimmedLine.includes('ANTECEDENTE REGISTRAL') ||
          trimmedLine.startsWith('PARTIDA NO:') ||
          trimmedLine.startsWith('SECCIÓN') ||
          trimmedLine.startsWith('FOLIO REAL:')

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
              alignment: isCenteredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
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
        } else if (isCenteredHeader) {
          // Líneas de encabezado centradas
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
              spacing: { after: 120 }
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
        } else if (trimmedLine === '4501E') {
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
              alignment: AlignmentType.RIGHT,
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
          const isLeft =
            trimmedLine.startsWith('OBJETO DE LA COMPRAVENTA') ||
            trimmedLine.startsWith('MUNICIPIO:')
          const isBoldLabel =
            /^(ACREEDOR|DEUDOR|VENDEDOR|COMPRADOR|ACREDITANTE|ACREDITADO|COACREDITADO|OBJETO DE LA COMPRAVENTA)/.test(trimmedLine)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: isBoldLabel,
                  size: 24,
                  font: 'Times New Roman'
                })
              ],
              spacing: { after: 120 },
              alignment: isLeft
                ? AlignmentType.LEFT
                : trimmedLine.includes('TIJUANA')
                  ? AlignmentType.CENTER
                  : AlignmentType.JUSTIFIED
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
      // VALIDACIÓN FINAL (OBLIGATORIA)
      const validation = this.validateBeforeRender(data)
      if (!validation.isValid) {
        throw new Error(`No se puede generar el documento. Errores: ${validation.errors.join(', ')}`)
      }

      const templateData = this.prepareTemplateData(data)
      const template = await this.loadTemplate('pdf')
      const renderedHTML = template(templateData)

      // Renderizar en un iframe aislado para evitar que html2canvas herede estilos globales del app
      // (Tailwind v4 / oklch puede serializarse como lab() en estilos computados, lo que html2canvas no soporta).
      const iframe = document.createElement('iframe')
      iframe.style.position = 'absolute'
      iframe.style.left = '-9999px'
      iframe.style.top = '0'
      iframe.style.width = '900px'
      iframe.style.height = '10px'
      iframe.style.border = '0'
        // Aislar del CSS del sitio
        ; (iframe as any).sandbox = 'allow-same-origin'
      document.body.appendChild(iframe)

      const loadIframe = async () => {
        return await new Promise<void>((resolve) => {
          // srcdoc dispara onload en la mayoría de navegadores
          iframe.onload = () => resolve()
          // Asegurar background blanco dentro del HTML (por si el template no lo define)
          const safeHTML = renderedHTML.replace(
            /<body([^>]*)>/i,
            (_m, attrs) => `<body${attrs} style="background:#ffffff;color:#000;">`
          )
          iframe.srcdoc = safeHTML
          // Fallback: por si onload no dispara
          setTimeout(() => resolve(), 50)
        })
      }

      await loadIframe()

      const doc = iframe.contentDocument
      if (!doc?.body) {
        document.body.removeChild(iframe)
        throw new Error('No se pudo inicializar el iframe para generar PDF')
      }

      // Capturar como canvas desde el documento aislado
      const canvas = await html2canvas(doc.body, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 816, // 8.5in * 96 DPI
        height: doc.body.scrollHeight
      })

      // Limpiar iframe temporal
      document.body.removeChild(iframe)

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
      // VALIDACIÓN FINAL (OBLIGATORIA)
      const validation = this.validateBeforeRender(data)
      if (!validation.isValid) {
        throw new Error(`No se puede generar el documento. Errores: ${validation.errors.join(', ')}`)
      }

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
   * Renderiza el documento a HTML (para vista previa)
   * Usa el mismo template que PDF para mantener consistencia
   */
  static async renderToHTML(data: PreavisoSimplifiedJSON): Promise<string> {
    try {
      // VALIDACIÓN FINAL (OBLIGATORIA)
      const validation = this.validateBeforeRender(data)
      if (!validation.isValid) {
        throw new Error(`No se puede generar el documento. Errores: ${validation.errors.join(', ')}`)
      }

      const templateData = this.prepareTemplateData(data)
      const template = await this.loadTemplate('pdf') // Usar template de PDF para HTML
      const renderedHTML = template(templateData)
      return renderedHTML
    } catch (error) {
      console.error('Error rendering to HTML:', error)
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
    const vendedorName = data.vendedores?.[0]?.nombre?.split(' ')[0] ||
      data.vendedores?.[0]?.denominacion_social?.split(' ')[0] ||
      'Vendedor'
    const compradorName = data.compradores?.[0]?.nombre?.split(' ')[0] ||
      data.compradores?.[0]?.denominacion_social?.split(' ')[0] ||
      'Comprador'
    return `Pre-Aviso_${vendedorName}_${compradorName}_${date}.${extension}`
  }

  /**
   * Convierte PreavisoData (formato actual) a PreavisoSimplifiedJSON
   * Calcula automáticamente los actos notariales basándose en los datos si no están definidos
   */
  static convertFromPreavisoData(data: PreavisoData): PreavisoSimplifiedJSON {
    const normalizePartida = (p: any): string | null => {
      if (typeof p === 'string') return p
      if (!p) return null
      const v = p.partida || p.numero || p.folio || p.value
      return v ? String(v) : null
    }

    // Convertir v1.4 (arrays) a PreavisoSimplifiedJSON
    const primerVendedor = data.vendedores?.[0]
    const primerComprador = data.compradores?.[0]
    const tieneCreditos = data.creditos && data.creditos.length > 0
    const gravamenesArr = Array.isArray(data.gravamenes) ? data.gravamenes : []
    const tieneGravamen =
      gravamenesArr.length > 0 || data.inmueble?.existe_hipoteca === true
    const cancelacionPendiente =
      gravamenesArr.length > 0 &&
      gravamenesArr.some(
        (g: any) => g?.cancelacion_confirmada === false || g?.cancelacion_confirmada === null || g?.cancelacion_confirmada === undefined
      )
    const cancelacionYaInscrita =
      gravamenesArr.length > 0 &&
      gravamenesArr.every((g: any) => g?.cancelacion_confirmada === true)
    const necesitaCancelacionHipoteca = tieneGravamen && !cancelacionYaInscrita

    // Calcular actos notariales para el renderer (NO usar data.actosNotariales directo,
    // porque ese objeto legacy no incluye cancelacionHipoteca y causaba omitir el acto).
    const actos = {
      compraventa: true, // Siempre presente en pre-aviso
      aperturaCreditoComprador: !!tieneCreditos,
      cancelacionHipoteca: !!necesitaCancelacionHipoteca
    }

    // Construir direccion como string
    const direccion = data.inmueble?.direccion
    const direccionStr = typeof direccion === 'string'
      ? direccion
      : direccion?.calle
        ? `${direccion.calle}${direccion.numero ? ' ' + direccion.numero : ''}${direccion.colonia ? ', ' + direccion.colonia : ''}${direccion.municipio ? ', ' + direccion.municipio : ''}${direccion.estado ? ', ' + direccion.estado : ''}`.trim()
        : null

    return {
      tipoOperacion: data.tipoOperacion,
      vendedores: data.vendedores?.map(v => ({
        party_id: v.party_id || null,
        nombre: v.persona_fisica?.nombre || v.persona_moral?.denominacion_social || null,
        rfc: v.persona_fisica?.rfc || v.persona_moral?.rfc || null,
        curp: v.persona_fisica?.curp || null,
        tipoPersona: v.tipo_persona || null,
        denominacion_social: v.persona_moral?.denominacion_social || null,
        estado_civil: v.persona_fisica?.estado_civil || null,
        tieneCredito: v.tiene_credito !== null ? v.tiene_credito : null,
        institucionCredito: v.credito_vendedor?.institucion || null,
        numeroCredito: v.credito_vendedor?.numero_credito || null
      })) || [],
      compradores: data.compradores?.map(c => ({
        party_id: c.party_id || null,
        nombre: c.persona_fisica?.nombre || c.persona_moral?.denominacion_social || null,
        rfc: c.persona_fisica?.rfc || c.persona_moral?.rfc || null,
        curp: c.persona_fisica?.curp || null,
        tipoPersona: c.tipo_persona || null,
        denominacion_social: c.persona_moral?.denominacion_social || null,
        estado_civil: c.persona_fisica?.estado_civil || null,
        necesitaCredito: tieneCreditos ? true : null,
        // Nota: institucionCredito y montoCredito solo se usan para compatibilidad con formato antiguo
        // Los créditos reales están en el array creditos[]
        institucionCredito: data.creditos?.[0]?.institucion || null,
        montoCredito: data.creditos?.[0]?.monto || null
      })) || [],
      creditos: data.creditos?.map(c => ({
        institucion: c.institucion || null,
        monto: c.monto || null,
        tipo_credito: c.tipo_credito || null,
        participantes: c.participantes || []
      })) || [],
      inmueble: data.inmueble ? {
        direccion: direccionStr,
        folioReal: data.inmueble.folio_real || null,
        partidas: (data.inmueble.partidas || []).map(normalizePartida).filter(Boolean) as string[],
        seccion: data.inmueble.seccion || null,
        numero_expediente: data.inmueble.numero_expediente || null,
        superficie: data.inmueble.superficie || null,
        valor: data.inmueble.valor || null,
        unidad: data.inmueble.datos_catastrales?.unidad || null,
        modulo: data.inmueble.datos_catastrales?.modulo || null,
        condominio: data.inmueble.datos_catastrales?.condominio || null,
        lote: data.inmueble.datos_catastrales?.lote || null,
        manzana: data.inmueble.datos_catastrales?.manzana || null,
        fraccionamiento: data.inmueble.datos_catastrales?.fraccionamiento || null,
        colonia: data.inmueble.direccion?.colonia || null,
        municipio: data.inmueble.direccion?.municipio || null,
        all_registry_pages_confirmed: data.inmueble.all_registry_pages_confirmed || false
      } : null,
      gravamenes: data.gravamenes?.map(g => ({
        tipo: g.tipo || null,
        institucion: g.institucion || null,
        numero_credito: g.numero_credito || null,
        cancelacion_confirmada: g.cancelacion_confirmada || false
      })) || [],
      actos,
      include_urban_dev_article_139: data.inmueble?.all_registry_pages_confirmed === true || false
    }
  }
}

