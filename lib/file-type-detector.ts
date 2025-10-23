export interface FileTypeInfo {
  type: 'image' | 'pdf' | 'docx' | 'unknown'
  mimeType: string
  extension: string
  isSupported: boolean
}

export function detectFileType(fileUrl: string, fileName?: string): FileTypeInfo {
  // Detectar por MIME type en data URLs
  if (fileUrl.startsWith('data:')) {
    const mimeType = fileUrl.split(';')[0].split(':')[1]
    
    if (mimeType.startsWith('image/')) {
      return {
        type: 'image',
        mimeType,
        extension: mimeType.split('/')[1] || 'unknown',
        isSupported: true
      }
    }
    
    if (mimeType === 'application/pdf') {
      return {
        type: 'pdf',
        mimeType,
        extension: 'pdf',
        isSupported: true
      }
    }
    
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return {
        type: 'docx',
        mimeType,
        extension: 'docx',
        isSupported: true
      }
    }
  }
  
  // Detectar por extensión de archivo
  if (fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase() || ''
    
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']
    const pdfExtensions = ['pdf']
    const docxExtensions = ['docx', 'doc']
    
    if (imageExtensions.includes(extension)) {
      return {
        type: 'image',
        mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        extension,
        isSupported: true
      }
    }
    
    if (pdfExtensions.includes(extension)) {
      return {
        type: 'pdf',
        mimeType: 'application/pdf',
        extension,
        isSupported: true
      }
    }
    
    if (docxExtensions.includes(extension)) {
      return {
        type: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension,
        isSupported: true
      }
    }
  }
  
  // Detectar por contenido de URL
  if (fileUrl.toLowerCase().includes('.pdf')) {
    return {
      type: 'pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      isSupported: true
    }
  }
  
  if (fileUrl.toLowerCase().includes('.docx') || fileUrl.toLowerCase().includes('.doc')) {
    return {
      type: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      isSupported: true
    }
  }
  
  // Verificar si es imagen por extensión en URL
  const imagePattern = /\.(jpeg|jpg|gif|png|bmp|webp|svg)$/i
  if (imagePattern.test(fileUrl)) {
    const extension = fileUrl.match(imagePattern)?.[1]?.toLowerCase() || 'unknown'
    return {
      type: 'image',
      mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      extension,
      isSupported: true
    }
  }
  
  return {
    type: 'unknown',
    mimeType: 'application/octet-stream',
    extension: 'unknown',
    isSupported: false
  }
}

