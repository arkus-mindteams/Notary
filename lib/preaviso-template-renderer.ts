"use client"

import Handlebars from 'handlebars'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { PreavisoSimplifiedJSON } from './types/preaviso-simplified'
import type { PreavisoData } from '@/lib/tramites/shared/types/preaviso-types'

// Helper para convertir número a romano
Handlebars.registerHelper('toRoman', function (num: number) {
  const romanNumerals: { [key: number]: string } = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V',
    6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X'
  }
  return romanNumerals[num] || num.toString()
})

// Helper para comparar valores (expresión helper para usar en {{#if}})
Handlebars.registerHelper('eq', function (this: any, a: any, b: any, options?: any) {
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

export interface PreavisoTemplateData extends Omit<PreavisoSimplifiedJSON, 'fecha'> {
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
    nombre: 'XAVIER IBAÑEZ VERAMENDI',
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
      const gravamenesArr = data.gravamenes ?? []
      if (gravamenesArr.length === 0) {
        errors.push('Acto de cancelación de hipoteca requiere al menos un gravamen capturado')
      } else if (!gravamenesArr.some((g: any) => g?.cancelacion_confirmada === false)) {
        errors.push('Acto de cancelación de hipoteca requiere que la cancelación esté pendiente (cancelacion_confirmada=false) en al menos un gravamen')
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
    const compradorRaw = data.compradores?.[0] || null
    // Nombre del comprador (soporta estructura persona_fisica/moral o aplanada)
    const compradorNombre = compradorRaw?.nombre || (compradorRaw as any)?.persona_fisica?.nombre || (compradorRaw as any)?.persona_moral?.denominacion_social || null
    // Nombre del cónyuge cuando comprador está casado y cónyuge participa en la compra
    // Fuentes: 1) persona_fisica.conyuge, 2) conyuge_nombre, 3) compradores[1],
    // 4) coacreditado en creditos (por si solo se capturó en acreditado)
    let conyugeNombre = (compradorRaw as any)?.persona_fisica?.conyuge?.nombre ||
      (compradorRaw as any)?.conyuge_nombre ||
      (((compradorRaw as any)?.persona_fisica?.estado_civil === 'casado' || (compradorRaw as any)?.estado_civil === 'casado') && data.compradores?.[1])
      ? ((data.compradores[1] as any)?.nombre || (data.compradores[1] as any)?.persona_fisica?.nombre || (data.compradores[1] as any)?.persona_moral?.denominacion_social)
      : (data.compradores?.length && data.compradores.length > 1 && (data.compradores[1] as any)?.nombre && (data.compradores[1] as any).nombre !== compradorNombre)
        ? (data.compradores[1] as any).nombre
        : null
    const comprador = compradorRaw ? {
      ...compradorRaw,
      nombre: compradorNombre,
      nombre_display: (compradorNombre && conyugeNombre)
        ? `${compradorNombre} Y SU CONYUGUE ${conyugeNombre}`
        : compradorNombre
    } : null

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

    const normalize = (s: string) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    // Acto 3: Apertura de crédito (UN SOLO ACTO) con listado de créditos y participantes
    // Requisito: no generar múltiples actos, sino un solo contrato con varios créditos dentro.
    if (data.actos.aperturaCreditoComprador && data.creditos && data.creditos.length > 0) {
      const creditosConParticipantes = data.creditos.map(credito => {
        let participantesConNombres = (credito.participantes || []).map(p => {
          const rawNombre = (p as any)?.nombre ? String((p as any).nombre).trim() : ''
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

            // Buscar el nombre del cónyuge en el contexto (soporta PreavisoData y PreavisoSimplifiedJSON)
            const comprador0 = data.compradores[0] as any
            const conyugeNombreContext = comprador0?.persona_fisica?.conyuge?.nombre ||
              comprador0?.conyuge_nombre ||
              (data.compradores?.length > 1 ? (data.compradores[1] as any)?.nombre : null) || null

            if (conyugeNombreContext) {
              // Buscar si ya existe como comprador separado
              const conyugeComprador = data.compradores.find((c, idx) => {
                if (idx === 0) return false
                const nm = c.nombre || (c as any).denominacion_social || null
                return nm && nm.toLowerCase().trim() === conyugeNombreContext.toLowerCase().trim()
              })

              if (conyugeComprador) {
                return {
                  ...p,
                  // Si ya tiene nombre, preservarlo; si no, usar el del cónyuge
                  nombre: (p as any)?.nombre || conyugeComprador.nombre || (conyugeComprador as any).denominacion_social || conyugeNombreContext
                }
              }

              // Si no existe como comprador separado, usar el nombre del cónyuge
              // CRÍTICO: Incluir nombre incluso si tiene party_id (para cónyuges que fueron creados como compradores)
              return {
                ...p,
                // Si ya tiene nombre, preservarlo; si no, usar el del contexto
                nombre: (p as any)?.nombre || conyugeNombreContext
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
            const c0 = data.compradores?.[0] as any
            const c0Nombre = c0?.nombre || c0?.denominacion_social || c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social || null
            if (c0Nombre) {
              return { ...p, nombre: c0Nombre }
            }
          }

          return p
        })

        // REQUISITO NOTARIA 3: Si hay ACREDITADO y COACREDITADO que es el cónyuge, fusionar en una sola línea
        // "ACREDITADO: [PRIMARIO] Y SU CONYUGUE [SPOUSE]"
        const acreditado = participantesConNombres.find(p => p.rol === 'acreditado')
        const coacreditado = participantesConNombres.find(p => p.rol === 'coacreditado')

        if (acreditado && coacreditado && conyugeNombre &&
          (normalize(String(coacreditado.nombre)) === normalize(conyugeNombre) ||
            normalize(String(coacreditado.nombre)) === normalize(String((compradorRaw as any)?.persona_fisica?.conyuge?.nombre)))) {

          acreditado.nombre = `${acreditado.nombre} Y SU CONYUGUE ${coacreditado.nombre}`
          // Eliminar el coacreditado de la lista para que no se imprima en línea aparte
          participantesConNombres = participantesConNombres.filter(p => p !== coacreditado)
        }

        return {
          ...credito,
          participantes: participantesConNombres
        }
      })

      // Si comprador no tiene nombre_display con cónyuge pero el coacreditado SÍ tiene nombre
      // (ej. solo se capturó en acreditado), usar ese nombre para COMPRADOR también
      if (comprador && comprador.nombre_display === comprador.nombre && comprador.nombre) {
        for (const cred of creditosConParticipantes) {
          const coacr = (cred.participantes || []).find((p: any) => p?.rol === 'coacreditado')
          const nm = coacr?.nombre || (coacr as any)?.nombre || (coacr as any)?.name
          if (nm && String(nm).trim().length >= 3) {
            const n = String(nm).trim()
            if (n.toLowerCase() !== String(comprador.nombre || '').toLowerCase()) {
              comprador.nombre_display = `${comprador.nombre} Y SU CONYUGUE ${n}`
              break
            }
          }
        }
      }

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

    const templateData = {
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

    // REQUISITO NOTARIA 3: Proporcionar helper para forzar mayúsculas en todo el objeto
    const toUpperCaseRecursive = (obj: any): any => {
      if (obj === null || obj === undefined) return obj
      if (typeof obj === 'string') return obj.toUpperCase()
      if (Array.isArray(obj)) return obj.map(toUpperCaseRecursive)
      if (typeof obj === 'object') {
        const result: any = {}
        for (const key in obj) {
          // No convertir a mayúsculas IDs internos o propiedades específicas que deban mantener su caso
          if (key === 'party_id' || key === 'tipo' || key === 'rol' || key === 'numeroRomano' || key === 'numero') {
            result[key] = obj[key]
          } else {
            result[key] = toUpperCaseRecursive(obj[key])
          }
        }
        return result
      }
      return obj
    }

    return toUpperCaseRecursive(templateData)
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
   * @param data - Datos del preaviso (para validación y nombre de archivo)
   * @param options - Si se pasa customRenderedText, se usa ese texto (p. ej. documento editado) en lugar del template
   */
  static async renderToWord(data: PreavisoSimplifiedJSON, options?: { customRenderedText?: string }): Promise<string> {
    try {
      // VALIDACIÓN FINAL (OBLIGATORIA)
      const validation = this.validateBeforeRender(data)
      if (!validation.isValid) {
        throw new Error(`No se puede generar el documento. Errores: ${validation.errors.join(', ')}`)
      }

      let renderedText: string
      if (options?.customRenderedText != null && options.customRenderedText.trim() !== '') {
        renderedText = options.customRenderedText
      } else {
        const templateData = this.prepareTemplateData(data)
        const template = await this.loadTemplate('word')
        renderedText = template(templateData)
      }

      const DEFAULT_FONT = 'Tahoma'
      const DEFAULT_FONT_SIZE = 20
      const HEADER_FONT_SIZE = 24
      const DEFAULT_SPACING_AFTER = 120
      const TITLE_SPACING_AFTER = 300
      const HEADER_SPACING_AFTER = 200
      const ACT_SPACING_BEFORE = 200
      const SIGNATURE_SPACING_BEFORE = 400
      const LIST_INDENT_LEFT = 720
      const HEADER_LINE1_FONT_SIZE = 36
      const HEADER_LINE2_FONT_SIZE = 28
      const HEADER_LINE3_FONT_SIZE = 20
      const HEADER_LINE4_FONT_SIZE = 20
      const ANTECEDENTE_FONT_SIZE = 22
      const PARTIDA_SECCION_FOLIO_FONT_SIZE = 20
      const DESTINATARIO_LINE1_FONT_SIZE = 24
      const DESTINATARIO_LINE2_FONT_SIZE = 22
      const DESTINATARIO_LINE3_FONT_SIZE = 24
      const PARRAFO_NOTARIO_FONT_SIZE = 20
      const OBJETO_FONT_SIZE = 20

      // Convertir texto renderizado a párrafos de Word
      const paragraphs: Paragraph[] = []
      const lines = renderedText.split('\n').filter(line => line.trim())

      // Procesar líneas con índice para identificar las primeras 4 líneas
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex]
        const trimmedLine = line.trim()
        const currentLineNumber = lineIndex + 1 // Línea 1, 2, 3, 4...

        // Primeras 4 líneas del encabezado del notario
        // Línea 1: LIC. XAVIER IBAÑEZ VERAMENDI - 18pts, negrita, centrado
        if (currentLineNumber === 1 && trimmedLine.includes('LIC.')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: HEADER_LINE1_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue // Saltar al siguiente ciclo para no procesar esta línea en otros bloques
        }

        // Línea 2: NOTARIO ADSCRITO... - 14pts, negrita, centrado
        if (currentLineNumber === 2 && trimmedLine.includes('NOTARIO ADSCRITO')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: HEADER_LINE2_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue // Saltar al siguiente ciclo
        }

        // Línea 3: CALLE ANTONIO CASO... - 10pts, negrita, centrado
        if (currentLineNumber === 3 && trimmedLine.includes('CALLE ANTONIO CASO')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: HEADER_LINE3_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue // Saltar al siguiente ciclo
        }

        // Línea 4: TEL:... - 10pts, negrita, centrado
        if (currentLineNumber === 4 && trimmedLine.startsWith('TEL:')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: HEADER_LINE4_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue // Saltar al siguiente ciclo
        }

        // Línea "ANTECEDENTE REGISTRAL"
        if (trimmedLine.includes('ANTECEDENTE REGISTRAL')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: ANTECEDENTE_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue // Saltar al siguiente ciclo para no procesar esta línea en otros bloques
        }

        // PARTIDA NO, SECCIÓN CIVIL, FOLIO REAL
        if (trimmedLine.startsWith('PARTIDA NO:') || trimmedLine.startsWith('SECCIÓN') || trimmedLine.startsWith('FOLIO REAL:')) {
          const sizeTwips = PARTIDA_SECCION_FOLIO_FONT_SIZE
          let children: TextRun[] = []
          if (trimmedLine.startsWith('PARTIDA NO:')) {
            const label = 'PARTIDA NO: '
            const numbers = trimmedLine.slice(label.length).trim()
            children = [
              new TextRun({ text: label, bold: true, size: sizeTwips, font: DEFAULT_FONT }),
              new TextRun({ text: numbers, bold: false, size: sizeTwips, font: DEFAULT_FONT })
            ]
          } else if (trimmedLine.startsWith('FOLIO REAL:')) {
            const label = 'FOLIO REAL: '
            const numbers = trimmedLine.slice(label.length).trim()
            children = [
              new TextRun({ text: label, bold: true, size: sizeTwips, font: DEFAULT_FONT }),
              new TextRun({ text: numbers, bold: false, size: sizeTwips, font: DEFAULT_FONT })
            ]
          } else {
            // SECCIÓN CIVIL (o SECCIÓN ...) - todo en negrita, sin números
            children = [
              new TextRun({ text: trimmedLine, bold: true, size: sizeTwips, font: DEFAULT_FONT })
            ]
          }
          paragraphs.push(
            new Paragraph({
              children,
              alignment: AlignmentType.CENTER,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue
        }

        // Párrafo legal del notario (LICENCIADO... NOTARIO ADSCRITO...)
        // 10pt; LIC. y nombre en negrita; solo "NOTARIO ADSCRITO" subrayado; "NÚMERO X" en negrita; "siguientes actos jurídicos" en negrita; resto normal
        if (
          trimmedLine.startsWith('LICENCIADO') &&
          trimmedLine.includes('NOTARIO ADSCRITO') &&
          trimmedLine.includes('NÚMERO') &&
          trimmedLine.includes('SE PRETENDEN OTORGAR')
        ) {
          const sizeTwips = PARRAFO_NOTARIO_FONT_SIZE
          const runs: TextRun[] = []
          let iComma1 = trimmedLine.indexOf(',')
          if (iComma1 === -1) iComma1 = trimmedLine.length
          const partLicNombre = trimmedLine.substring(0, iComma1 + 1) // "LICENCIADO XAVIER...,"
          runs.push(new TextRun({ text: partLicNombre, bold: true, size: sizeTwips, font: DEFAULT_FONT }))
          const iNotarioAdscrito = trimmedLine.indexOf('NOTARIO ADSCRITO', iComma1)
          const iNumero = trimmedLine.indexOf('NÚMERO ', iComma1)
          if (iNotarioAdscrito !== -1 && iNumero !== -1) {
            const beforeNotarioAdscrito = trimmedLine.substring(iComma1 + 1, iNotarioAdscrito) // " " o " "
            if (beforeNotarioAdscrito) runs.push(new TextRun({ text: beforeNotarioAdscrito, size: sizeTwips, font: DEFAULT_FONT }))
            runs.push(new TextRun({ text: 'NOTARIO ADSCRITO', underline: {}, size: sizeTwips, font: DEFAULT_FONT }))
            const afterNotarioAdscrito = trimmedLine.substring(iNotarioAdscrito + 'NOTARIO ADSCRITO'.length, iNumero) // " A LA NOTARÍA "
            if (afterNotarioAdscrito) runs.push(new TextRun({ text: afterNotarioAdscrito, size: sizeTwips, font: DEFAULT_FONT }))
            const iDeAfterNum = trimmedLine.indexOf(' DE ', iNumero)
            const endNumero = iDeAfterNum !== -1 ? iDeAfterNum : trimmedLine.indexOf(',', iNumero)
            const partNumero = endNumero !== -1 ? trimmedLine.substring(iNumero, endNumero) : trimmedLine.substring(iNumero)
            if (partNumero) runs.push(new TextRun({ text: partNumero, bold: true, size: sizeTwips, font: DEFAULT_FONT }))
            const iPara = trimmedLine.indexOf(', PARA LOS EFECTOS', iNumero)
            if (iDeAfterNum !== -1 && iPara !== -1) {
              const partDeMunicipalidad = trimmedLine.substring(iDeAfterNum, iPara)
              if (partDeMunicipalidad) runs.push(new TextRun({ text: partDeMunicipalidad, size: sizeTwips, font: DEFAULT_FONT }))
            }
            if (iPara !== -1) {
              const iSePretenden = trimmedLine.indexOf('SE PRETENDEN OTORGAR', iPara)
              const partParaEfectos = iSePretenden !== -1 ? trimmedLine.substring(iPara, iSePretenden) : trimmedLine.substring(iPara)
              if (partParaEfectos) runs.push(new TextRun({ text: partParaEfectos, size: sizeTwips, font: DEFAULT_FONT }))
              if (iSePretenden !== -1) {
                const iCuyas = trimmedLine.indexOf(', CUYAS CARACTERÍSTICAS', iSePretenden)
                const partActos = iCuyas !== -1 ? trimmedLine.substring(iSePretenden, iCuyas) : trimmedLine.substring(iSePretenden)
                if (partActos) runs.push(new TextRun({ text: partActos, bold: true, size: sizeTwips, font: DEFAULT_FONT }))
                if (iCuyas !== -1) {
                  const partCuyas = trimmedLine.substring(iCuyas)
                  if (partCuyas) runs.push(new TextRun({ text: partCuyas, size: sizeTwips, font: DEFAULT_FONT }))
                }
              }
            }
          }
          if (runs.length === 1) {
            runs.push(new TextRun({ text: trimmedLine.substring(partLicNombre.length), size: sizeTwips, font: DEFAULT_FONT }))
          }
          paragraphs.push(
            new Paragraph({
              children: runs,
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
          continue
        }

        // Detectar títulos y encabezados centrados (para líneas que no son las primeras 4 ni ANTECEDENTE REGISTRAL ni PARTIDA/SECCIÓN/FOLIO)
        const isCenteredHeader =
          (currentLineNumber > 4 && trimmedLine.includes('LIC.')) ||
          (currentLineNumber > 4 && trimmedLine.includes('NOTARIO ADSCRITO')) ||
          trimmedLine.includes('NOTARIO TITULAR') ||
          (currentLineNumber > 4 && trimmedLine.includes('CALLE ANTONIO CASO')) ||
          (currentLineNumber > 4 && trimmedLine.startsWith('TEL:')) ||
          trimmedLine.includes('SOLICITUD DE CERTIFICADO')

        // Detectar títulos (OBJETO DE LA COMPRAVENTA se procesa más abajo en su propio bloque: justificado, 10pt, solo etiqueta en negrita)
        if (trimmedLine.includes('SOLICITUD DE CERTIFICADO') ||
          trimmedLine.includes('CERTIFICO:')) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: trimmedLine.includes('SOLICITUD') ? HEADER_FONT_SIZE : HEADER_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              heading: trimmedLine.includes('SOLICITUD') ? HeadingLevel.TITLE : undefined,
              alignment: isCenteredHeader ? AlignmentType.CENTER : AlignmentType.CENTER,
              spacing: { after: TITLE_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.startsWith('C. DIRECTOR')) {
          // C. DIRECTOR DEL REGISTRO PÚBLICO
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: DESTINATARIO_LINE1_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.startsWith('DE LA PROPIEDAD')) {
          // DE LA PROPIEDAD Y DEL COMERCIO.
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: DESTINATARIO_LINE2_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.includes('P R E S E N T E')) {
          // P R E S E N T E.
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: DESTINATARIO_LINE3_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: HEADER_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.startsWith('NOTARÍA')) {
          // Encabezado NOTARÍA (solo cuando no es C. DIRECTOR)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: HEADER_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: HEADER_SPACING_AFTER }
            })
          )
        } else if (isCenteredHeader) {
          // Líneas de encabezado centradas
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: false,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.match(/^[IVX]+\./)) {
          // Actos jurídicos (número romano + título en negrita)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              spacing: { before: ACT_SPACING_BEFORE, after: DEFAULT_SPACING_AFTER }
            })
          )
        } else if (
          /^(ACREEDOR|DEUDOR|VENDEDOR|COMPRADOR|ACREDITANTE|ACREDITADO|COACREDITADO|OBLIGADO SOLIDARIO Y GARANTE HIPOTECARIO):/i.test(trimmedLine) ||
          /\(PROPIETARIO\(S\)\)VENDEDOR:/i.test(trimmedLine)
        ) {
          // Etiquetas de actos (solo etiqueta en negrita)
          const labelPatterns = [
            'OBLIGADO SOLIDARIO Y GARANTE HIPOTECARIO:',
            '(PROPIETARIO(S))VENDEDOR:',
            'ACREEDOR:',
            'DEUDOR:',
            'VENDEDOR:',
            'COMPRADOR:',
            'ACREDITANTE:',
            'COACREDITADO:',
            'ACREDITADO:'
          ]
          let labelStart = -1
          let labelLen = 0
          for (const lab of labelPatterns) {
            const idx = trimmedLine.indexOf(lab)
            if (idx !== -1) {
              labelStart = idx
              labelLen = lab.length
              break
            }
            const idxUpper = trimmedLine.toUpperCase().indexOf(lab.toUpperCase())
            if (idxUpper !== -1) {
              labelStart = idxUpper
              labelLen = lab.length
              break
            }
          }
          const sizeTwips = DEFAULT_FONT_SIZE
          if (labelStart !== -1) {
            const beforeLabel = trimmedLine.substring(0, labelStart)
            const labelText = trimmedLine.substring(labelStart, labelStart + labelLen)
            const afterLabel = trimmedLine.substring(labelStart + labelLen)
            const children: TextRun[] = []
            if (beforeLabel) children.push(new TextRun({ text: beforeLabel, size: sizeTwips, font: DEFAULT_FONT }))
            children.push(new TextRun({ text: labelText, bold: true, size: sizeTwips, font: DEFAULT_FONT }))
            if (afterLabel) children.push(new TextRun({ text: afterLabel, size: sizeTwips, font: DEFAULT_FONT }))
            paragraphs.push(
              new Paragraph({
                children,
                spacing: { after: DEFAULT_SPACING_AFTER }
              })
            )
          } else {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun({ text: trimmedLine, size: sizeTwips, font: DEFAULT_FONT })],
                spacing: { after: DEFAULT_SPACING_AFTER }
              })
            )
          }
        } else if (trimmedLine.startsWith('-')) {
          // Lista de detalles
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT,
                  bold: false
                })
              ],
              spacing: { after: 240 },
              indent: { left: LIST_INDENT_LEFT }
            })
          )
        } else if (trimmedLine.match(/^\d+\./)) {
          // Numeración de propiedades
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT,
                  bold: false
                })
              ],
              spacing: { after: 240 }
            })
          )
        } else if (trimmedLine === '4501E') {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.includes('_________________________________')) {
          // Línea de firma
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '_________________________________',
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              spacing: { before: SIGNATURE_SPACING_BEFORE, after: HEADER_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.startsWith('OBJETO DE LA COMPRAVENTA')) {
          // OBJETO DE LA COMPRAVENTA + descripción (un solo párrafo, solo etiqueta en negrita)
          // La plantilla (punto 7) emite todo en una sola línea (sin \n), igual que el párrafo 4; si vinieran varias líneas, se unen aquí.
          let merged = trimmedLine
          let nextIndex = lineIndex + 1
          while (nextIndex < lines.length) {
            const nextLine = lines[nextIndex].trim()
            if (!nextLine || nextLine.startsWith('Asimismo') || nextLine.startsWith('TIJUANA') || nextLine.startsWith('LIC. ')) break
            merged += ' ' + nextLine
            nextIndex++
          }
          lineIndex = nextIndex - 1
          const sizeTwips = OBJETO_FONT_SIZE
          // Buscar específicamente "OBJETO DE LA COMPRAVENTA Y GARANTIA HIPOTECARIA:" (hasta ese dos puntos)
          const labelPattern = 'OBJETO DE LA COMPRAVENTA Y GARANTIA HIPOTECARIA:'
          const mergedUpper = merged.toUpperCase()
          const labelPatternUpper = labelPattern.toUpperCase()
          let labelText = ''
          let restText = ''
          if (mergedUpper.startsWith(labelPatternUpper)) {
            // La línea empieza exactamente con el patrón
            labelText = merged.substring(0, labelPattern.length)
            restText = merged.substring(labelPattern.length).trim()
            // Asegurar espacio después del dos puntos si no hay
            if (restText && !restText.startsWith(' ')) {
              restText = ' ' + restText
            }
          } else {
            // Buscar el patrón en cualquier posición (por si hay espacios antes)
            const labelIdx = mergedUpper.indexOf(labelPatternUpper)
            if (labelIdx !== -1) {
              labelText = merged.substring(labelIdx, labelIdx + labelPattern.length)
              restText = (merged.substring(0, labelIdx) + merged.substring(labelIdx + labelPattern.length)).trim()
              if (restText && !restText.startsWith(' ')) {
                restText = ' ' + restText
              }
            } else {
              // Fallback: buscar hasta el primer ":" después de "OBJETO DE LA COMPRAVENTA"
              const colonIdx = merged.indexOf(':')
              if (colonIdx !== -1) {
                labelText = merged.substring(0, colonIdx + 1)
                restText = merged.substring(colonIdx + 1).trim()
                if (restText && !restText.startsWith(' ')) {
                  restText = ' ' + restText
                }
              } else {
                labelText = merged
                restText = ''
              }
            }
          }
          const children: TextRun[] = [
            new TextRun({ text: labelText, bold: true, size: sizeTwips, font: DEFAULT_FONT })
          ]
          if (restText) {
            children.push(new TextRun({ text: restText, bold: false, size: sizeTwips, font: DEFAULT_FONT }))
          }
          paragraphs.push(
            new Paragraph({
              children,
              alignment: AlignmentType.JUSTIFIED, // 10pt, solo etiqueta en negrita
              spacing: { after: DEFAULT_SPACING_AFTER }
            })
          )
        } else if (trimmedLine.startsWith('MUNICIPIO:')) {
          // MUNICIPIO: ya se incluyó en el párrafo OBJETO si venía después; si aparece solo, mostrar normal
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              spacing: { after: DEFAULT_SPACING_AFTER },
              alignment: AlignmentType.JUSTIFIED
            })
          )
        } else if (trimmedLine.startsWith('Asimismo') && trimmedLine.includes('Artículo 139')) {
          // Párrafo Artículo 139 (subrayado)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  underline: {},
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              spacing: { after: 240 },
              alignment: AlignmentType.JUSTIFIED
            })
          )
        } else if (
          (trimmedLine.includes('TIJUANA') && trimmedLine.includes('MOMENTO DE SU PRESENTACION')) ||
          (currentLineNumber > 1 && trimmedLine.startsWith('LIC. ') && !trimmedLine.includes('NOTARIO ADSCRITO'))
        ) {
          // Puntos 8 y 9: cierre y firma del notario (negrita)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: true,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              spacing: { after: 1200 },
              alignment: AlignmentType.JUSTIFIED
            })
          )
        } else if (trimmedLine) {
          // Párrafo normal
          const isLeft = trimmedLine.startsWith('MUNICIPIO:')
          const isBoldLabel =
            /^(ACREEDOR|DEUDOR|VENDEDOR|COMPRADOR|ACREDITANTE|ACREDITADO|COACREDITADO)/.test(trimmedLine)
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmedLine,
                  bold: isBoldLabel,
                  size: DEFAULT_FONT_SIZE,
                  font: DEFAULT_FONT
                })
              ],
              spacing: { after: DEFAULT_SPACING_AFTER },
              alignment: isLeft
                ? AlignmentType.JUSTIFIED
                : trimmedLine.includes('TIJUANA')
                  ? AlignmentType.JUSTIFIED
                  : AlignmentType.JUSTIFIED
            })
          )
        }
      }

      // Crear documento Word
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1440,
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
   * @param options.customRenderedText - Si se pasa, se exporta este texto (p. ej. documento editado) en lugar de regenerar desde el template
   */
  static async renderToWordAndDownload(data: PreavisoSimplifiedJSON, options?: { customRenderedText?: string }): Promise<void> {
    const url = await this.renderToWord(data, options)
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
    const compradorName = data.compradores?.[0]?.nombre?.split(' ')[0] ||
      data.compradores?.[0]?.denominacion_social?.split(' ')[0] ||
      'Comprador'
    return `Pre-Aviso_COMPRADOR_${compradorName}_${date}.${extension}`
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
      vendedores: data.vendedores?.map((v: any) => ({
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
      compradores: (() => {
        const mapped = data.compradores?.map((c: any) => ({
          party_id: c.party_id || null,
          nombre: c.persona_fisica?.nombre || c.persona_moral?.denominacion_social || null,
          conyuge_nombre: c.persona_fisica?.conyuge?.nombre || null,
          rfc: c.persona_fisica?.rfc || c.persona_moral?.rfc || null,
          curp: c.persona_fisica?.curp || null,
          tipoPersona: c.tipo_persona || null,
          denominacion_social: c.persona_moral?.denominacion_social || null,
          estado_civil: c.persona_fisica?.estado_civil || null,
          necesitaCredito: tieneCreditos ? true : null,
          institucionCredito: data.creditos?.[0]?.institucion || null,
          montoCredito: data.creditos?.[0]?.monto || null
        })) || []
        // Solo tratar al segundo comprador como cónyuge cuando: (1) esté especificado que es cónyuge
        // (ya viene en conyuge_nombre del primero), o (2) el comprador principal sea casado y no se
        // haya dicho lo contrario — es decir, cuando el chatbot preguntó por el cónyuge y el segundo
        // comprador es quien se capturó. Si el principal no es casado, no asumir que el segundo es cónyuge.
        const comprador0Casado = (data.compradores?.[0] as any)?.persona_fisica?.estado_civil?.toLowerCase?.() === 'casado'
        const segundoEsConyuge = mapped.length > 1 &&
          !mapped[0].conyuge_nombre &&
          mapped[1].nombre &&
          mapped[1].nombre !== mapped[0].nombre &&
          comprador0Casado
        if (segundoEsConyuge) {
          mapped[0] = { ...mapped[0], conyuge_nombre: mapped[1].nombre }
        }
        return mapped
      })(),
      creditos: data.creditos?.map((c: any) => ({
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
      gravamenes: data.gravamenes?.map((g: any) => ({
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

