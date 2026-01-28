"use client"

export interface ValidationError {
  field: string
  message: string
  type: 'error' | 'warning' | 'info'
  severity: 'high' | 'medium' | 'low'
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  score: number // 0-100
}

export class DataValidator {
  // Validación de RFC (OPCIONAL - solo valida formato si existe)
  static validateRFC(rfc: string | null | undefined): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    // RFC es OPCIONAL: si está vacío o null, es válido (no es error)
    if (!rfc || rfc.trim() === '') {
      return { isValid: true, errors: [], warnings: [], score: 100 }
    }

    const cleanRFC = rfc.trim().toUpperCase()
    
    // Validar longitud (12 para persona física, 13 para persona moral)
    if (cleanRFC.length !== 12 && cleanRFC.length !== 13) {
      errors.push({
        field: 'rfc',
        message: 'RFC debe tener 12 caracteres (persona física) o 13 caracteres (persona moral)',
        type: 'error',
        severity: 'high'
      })
    }

    // Validar formato básico
    const rfcPattern = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
    if (!rfcPattern.test(cleanRFC)) {
      errors.push({
        field: 'rfc',
        message: 'Formato de RFC inválido',
        type: 'error',
        severity: 'high'
      })
    }

    const score = errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 30))
    return { isValid: errors.length === 0, errors, warnings, score }
  }

  // Validación de CURP
  static validateCURP(curp: string): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    if (!curp || curp.trim() === '') {
      errors.push({
        field: 'curp',
        message: 'CURP es requerida',
        type: 'error',
        severity: 'high'
      })
      return { isValid: false, errors, warnings, score: 0 }
    }

    const cleanCURP = curp.trim().toUpperCase()
    
    // Validar longitud
    if (cleanCURP.length !== 18) {
      errors.push({
        field: 'curp',
        message: 'CURP debe tener exactamente 18 caracteres',
        type: 'error',
        severity: 'high'
      })
    }

    // Validar formato básico
    const curpPattern = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$/
    if (!curpPattern.test(cleanCURP)) {
      errors.push({
        field: 'curp',
        message: 'Formato de CURP inválido',
        type: 'error',
        severity: 'high'
      })
    }

    const score = errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 30))
    return { isValid: errors.length === 0, errors, warnings, score }
  }

  // Validación de fecha
  static validateDate(dateString: string, fieldName: string): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    if (!dateString || dateString.trim() === '') {
      errors.push({
        field: fieldName,
        message: `${fieldName} es requerida`,
        type: 'error',
        severity: 'high'
      })
      return { isValid: false, errors, warnings, score: 0 }
    }

    const date = new Date(dateString)
    
    if (isNaN(date.getTime())) {
      errors.push({
        field: fieldName,
        message: 'Formato de fecha inválido',
        type: 'error',
        severity: 'high'
      })
    }

    // Validar que la fecha no sea futura
    if (date > new Date()) {
      warnings.push({
        field: fieldName,
        message: 'La fecha no puede ser futura',
        type: 'warning',
        severity: 'medium'
      })
    }

    // Validar que la fecha no sea muy antigua (más de 100 años)
    const hundredYearsAgo = new Date()
    hundredYearsAgo.setFullYear(hundredYearsAgo.getFullYear() - 100)
    if (date < hundredYearsAgo) {
      warnings.push({
        field: fieldName,
        message: 'La fecha parece ser muy antigua',
        type: 'warning',
        severity: 'low'
      })
    }

    const score = errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 30) - (warnings.length * 10))
    return { isValid: errors.length === 0, errors, warnings, score }
  }

  // Validación de número de folio
  static validateFolio(folio: string): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    if (!folio || folio.trim() === '') {
      errors.push({
        field: 'folio',
        message: 'Número de folio es requerido',
        type: 'error',
        severity: 'high'
      })
      return { isValid: false, errors, warnings, score: 0 }
    }

    const cleanFolio = folio.trim()
    
    // Validar que sea numérico
    if (!/^\d+$/.test(cleanFolio)) {
      errors.push({
        field: 'folio',
        message: 'El folio debe contener solo números',
        type: 'error',
        severity: 'high'
      })
    }

    // Validar longitud mínima
    if (cleanFolio.length < 3) {
      warnings.push({
        field: 'folio',
        message: 'El folio parece ser muy corto',
        type: 'warning',
        severity: 'medium'
      })
    }

    const score = errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 30) - (warnings.length * 10))
    return { isValid: errors.length === 0, errors, warnings, score }
  }

  // Validación de nombre completo
  static validateFullName(name: string, fieldName: string): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    if (!name || name.trim() === '') {
      errors.push({
        field: fieldName,
        message: `${fieldName} es requerido`,
        type: 'error',
        severity: 'high'
      })
      return { isValid: false, errors, warnings, score: 0 }
    }

    const cleanName = name.trim()
    
    // Validar longitud mínima
    if (cleanName.length < 3) {
      errors.push({
        field: fieldName,
        message: `${fieldName} debe tener al menos 3 caracteres`,
        type: 'error',
        severity: 'high'
      })
    }

    // Validar que contenga al menos un espacio (nombre y apellido)
    if (!cleanName.includes(' ')) {
      warnings.push({
        field: fieldName,
        message: `${fieldName} debería incluir nombre y apellido`,
        type: 'warning',
        severity: 'medium'
      })
    }

    // Validar caracteres permitidos (letras, espacios, acentos)
    const namePattern = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/
    if (!namePattern.test(cleanName)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} contiene caracteres no válidos`,
        type: 'error',
        severity: 'high'
      })
    }

    const score = errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 30) - (warnings.length * 10))
    return { isValid: errors.length === 0, errors, warnings, score }
  }

  // Validación de dirección
  static validateAddress(address: string): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    
    if (!address || address.trim() === '') {
      errors.push({
        field: 'direccion',
        message: 'Dirección es requerida',
        type: 'error',
        severity: 'high'
      })
      return { isValid: false, errors, warnings, score: 0 }
    }

    const cleanAddress = address.trim()
    
    // Validar longitud mínima
    if (cleanAddress.length < 10) {
      warnings.push({
        field: 'direccion',
        message: 'La dirección parece ser muy corta',
        type: 'warning',
        severity: 'medium'
      })
    }

    // Validar que contenga elementos típicos de dirección
    const addressElements = ['calle', 'avenida', 'blvd', 'colonia', 'fraccionamiento', 'número', 'no.']
    const hasAddressElements = addressElements.some(element => 
      cleanAddress.toLowerCase().includes(element)
    )
    
    if (!hasAddressElements) {
      warnings.push({
        field: 'direccion',
        message: 'La dirección podría estar incompleta',
        type: 'warning',
        severity: 'low'
      })
    }

    const score = errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 30) - (warnings.length * 10))
    return { isValid: errors.length === 0, errors, warnings, score }
  }

  // Validación completa de campos extraídos
  static validateExtractedFields(fields: any): ValidationResult {
    const allErrors: ValidationError[] = []
    const allWarnings: ValidationError[] = []
    let totalScore = 0
    let fieldCount = 0

    // Validar notario
    if (fields.notario) {
      const notarioValidation = this.validateFullName(fields.notario.nombre, 'Nombre del notario')
      allErrors.push(...notarioValidation.errors)
      allWarnings.push(...notarioValidation.warnings)
      totalScore += notarioValidation.score
      fieldCount++

      if (fields.notario.numero) {
        const folioValidation = this.validateFolio(fields.notario.numero)
        allErrors.push(...folioValidation.errors)
        allWarnings.push(...folioValidation.warnings)
        totalScore += folioValidation.score
        fieldCount++
      }
    }

    // Validar partes
    if (fields.partes) {
      if (fields.partes.vendedor) {
        const vendedorValidation = this.validateFullName(fields.partes.vendedor, 'Nombre del vendedor')
        allErrors.push(...vendedorValidation.errors)
        allWarnings.push(...vendedorValidation.warnings)
        totalScore += vendedorValidation.score
        fieldCount++
      }

      if (fields.partes.comprador) {
        const compradorValidation = this.validateFullName(fields.partes.comprador, 'Nombre del comprador')
        allErrors.push(...compradorValidation.errors)
        allWarnings.push(...compradorValidation.warnings)
        totalScore += compradorValidation.score
        fieldCount++
      }
    }

    // Validar folio real
    if (fields.folioReal) {
      if (fields.folioReal.numero) {
        const folioValidation = this.validateFolio(fields.folioReal.numero)
        allErrors.push(...folioValidation.errors)
        allWarnings.push(...folioValidation.warnings)
        totalScore += folioValidation.score
        fieldCount++
      }
    }

    // Validar inmueble
    if (fields.inmueble) {
      if (fields.inmueble.direccion) {
        const direccionValidation = this.validateAddress(fields.inmueble.direccion)
        allErrors.push(...direccionValidation.errors)
        allWarnings.push(...direccionValidation.warnings)
        totalScore += direccionValidation.score
        fieldCount++
      }
    }

    const averageScore = fieldCount > 0 ? totalScore / fieldCount : 0
    const isValid = allErrors.length === 0

    return {
      isValid,
      errors: allErrors,
      warnings: allWarnings,
      score: Math.round(averageScore)
    }
  }
}


