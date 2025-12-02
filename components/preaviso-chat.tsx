"use client"

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { 
  Send, 
  Bot, 
  User, 
  FileText, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  FileCheck
} from 'lucide-react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: File[]
}

export interface PreavisoData {
  tipoOperacion: 'compraventa' | null
  vendedor: {
    nombre: string
    rfc: string
    curp: string
    tieneCredito: boolean
    institucionCredito?: string
    numeroCredito?: string
  }
  comprador: {
    nombre: string
    rfc: string
    curp: string
    necesitaCredito: boolean
    institucionCredito?: string
    montoCredito?: string
  }
  inmueble: {
    direccion: string
    folioReal: string
    seccion: string
    partida: string
    superficie: string
    valor: string
  }
  actosNotariales: {
    cancelacionCreditoVendedor: boolean
    compraventa: boolean
    aperturaCreditoComprador: boolean
  }
  documentos: string[]
}

interface UploadedDocument {
  id: string
  file: File
  name: string
  type: string
  size: number
  processed: boolean
  extractedData?: any
  error?: string
}

interface PreavisoChatProps {
  onDataComplete: (data: PreavisoData) => void
  onGenerateDocument: (data: PreavisoData) => void
}

const INITIAL_MESSAGES = [
  "Buenos días. Bienvenido al sistema de Solicitud de Certificado con Efecto de Pre-Aviso de Compraventa.",
  "Iniciaré el proceso de captura de información. Comenzamos con la información del inmueble.",
  "Necesito la Escritura o título de propiedad. Extraeré: folio real, sección, partida, ubicación y propietario. Si no la tiene, puede proporcionar la información manualmente. Debe ser exacta. ¿Tiene disponible la Escritura?"
]

export function PreavisoChat({ onDataComplete, onGenerateDocument }: PreavisoChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [initialMessagesSent, setInitialMessagesSent] = useState(false)

  // Enviar mensajes iniciales con delay
  useEffect(() => {
    if (!initialMessagesSent) {
      const sendInitialMessages = async () => {
        for (let i = 0; i < INITIAL_MESSAGES.length; i++) {
          await new Promise(resolve => setTimeout(resolve, i * 400)) // Delay de 400ms entre mensajes
          setMessages(prev => {
            // Verificar que no esté duplicado
            const exists = prev.some(m => m.id === `initial-${i}`)
            if (exists) return prev
            return [...prev, {
              id: `initial-${i}`,
              role: 'assistant',
              content: INITIAL_MESSAGES[i],
              timestamp: new Date()
            }]
          })
        }
        setInitialMessagesSent(true)
      }
      sendInitialMessages()
    }
  }, [initialMessagesSent])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([])
  const [isProcessingDocument, setIsProcessingDocument] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingFileName, setProcessingFileName] = useState<string | null>(null)
  const [data, setData] = useState<PreavisoData>({
    tipoOperacion: null,
    vendedor: {
      nombre: '',
      rfc: '',
      curp: '',
      tieneCredito: false
    },
    comprador: {
      nombre: '',
      rfc: '',
      curp: '',
      necesitaCredito: false
    },
    inmueble: {
      direccion: '',
      folioReal: '',
      seccion: '',
      partida: '',
      superficie: '',
      valor: ''
    },
    actosNotariales: {
      cancelacionCreditoVendedor: false,
      compraventa: false,
      aperturaCreditoComprador: false
    },
    documentos: []
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = input.trim()
    setInput('')
    setIsProcessing(true)

    try {
      // Llamar al agente de IA
      const response = await fetch('/api/ai/preaviso-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: currentInput }
          ],
          context: {
            vendedor: data.vendedor.nombre ? data.vendedor : undefined,
            comprador: data.comprador.nombre ? data.comprador : undefined,
            inmueble: data.inmueble.direccion ? data.inmueble : undefined,
            documentos: data.documentos
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const result = await response.json()
      const messagesToAdd = result.messages || [result.message]
      
      // Agregar mensajes con delay para efecto conversacional
      // Usar un timestamp único para evitar duplicados
      const baseTimestamp = Date.now()
      for (let i = 0; i < messagesToAdd.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 300)) // 300ms entre mensajes
        const assistantMessage: ChatMessage = {
          id: `msg-${baseTimestamp}-${i}`,
          role: 'assistant',
          content: messagesToAdd[i],
          timestamp: new Date()
        }
        setMessages(prev => {
          // Verificar que no esté duplicado
          const exists = prev.some(m => m.id === assistantMessage.id || 
            (m.role === 'assistant' && m.content === assistantMessage.content && 
             Math.abs(m.timestamp.getTime() - assistantMessage.timestamp.getTime()) < 1000))
          if (exists) return prev
          return [...prev, assistantMessage]
        })
      }

      // Intentar extraer información estructurada de la respuesta
      const lastMessage = messagesToAdd[messagesToAdd.length - 1] || ''
      const extractedData = extractDataFromMessage(lastMessage, currentInput, data)
      if (extractedData) {
        const newData = { ...data, ...extractedData }
        
        // Determinar actos notariales
        const actos = determineActosNotariales(newData)
        newData.actosNotariales = actos
        setData(newData)

        // Verificar si está completo
        if (isDataComplete(newData)) {
          onDataComplete(newData)
        }
      }

    } catch (error) {
      console.error('Error en chat:', error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Disculpe, ha ocurrido un error al procesar su mensaje. Por favor, intente nuevamente o proporcione la información de otra manera.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setIsProcessingDocument(true)
    setProcessingProgress(0)
    
    // Separar PDFs e imágenes
    const pdfFiles = Array.from(files).filter(
      file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    const imageFiles = Array.from(files).filter(file => !pdfFiles.includes(file))

    // Agregar documentos originales a la lista (sin mostrar imágenes convertidas)
    const originalDocs: UploadedDocument[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      processed: false
    }))
    setUploadedDocuments(prev => [...prev, ...originalDocs])

    // Mensaje de usuario
    const fileNames = Array.from(files).map(f => f.name)
    const fileMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `He subido el siguiente documento: ${fileNames.join(', ')}`,
      timestamp: new Date(),
      attachments: Array.from(files)
    }
    setMessages(prev => [...prev, fileMessage])

    // Mensaje de procesamiento
    const processingMessage: ChatMessage = {
      id: `${Date.now()}-processing`,
      role: 'assistant',
      content: 'Procesando documento...',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, processingMessage])

    // Convertir PDFs a imágenes en segundo plano
    let allImageFiles: File[] = [...imageFiles]
    if (pdfFiles.length > 0) {
      try {
        const { convertPdfToImages } = await import('@/lib/ocr-client')
        let totalPages = 0
        let convertedPages = 0
        
        // Contar páginas totales
        for (const pdfFile of pdfFiles) {
          setProcessingFileName(pdfFile.name)
          const images = await convertPdfToImages(pdfFile, 0, (current, total) => {
            convertedPages++
            if (totalPages === 0) totalPages = total
            const progress = Math.min(50, (convertedPages / (totalPages || 1)) * 50) // 0-50% para conversión
            setProcessingProgress(progress)
          })
          allImageFiles = [...allImageFiles, ...images]
        }
      } catch (error) {
        console.error('Error convirtiendo PDFs:', error)
        setIsProcessingDocument(false)
        setProcessingProgress(0)
        setProcessingFileName(null)
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Error al convertir PDFs a imágenes. Por favor, intente con imágenes directamente.',
          timestamp: new Date()
        }
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id).concat([errorMessage]))
        return
      }
    }

    setProcessingProgress(50) // 50% después de conversión
    const newDocuments = [...data.documentos, ...fileNames]
    setData(prev => ({ ...prev, documentos: newDocuments }))

    // Procesar cada documento con IA
    try {
      // Determinar tipo de documento basado en el nombre original
      const detectDocumentType = (fileName: string): string => {
        const name = fileName.toLowerCase()
        if (name.includes('escritura') || name.includes('titulo') || name.includes('propiedad')) return 'escritura'
        if (name.includes('plano') || name.includes('croquis') || name.includes('catastral')) return 'plano'
        if (name.includes('ine') || name.includes('ife') || name.includes('identificacion')) return 'identificacion'
        return 'escritura' // default
      }

      // Procesar cada imagen (archivos convertidos)
      const totalFiles = allImageFiles.length
      let processedCount = 0
      
      for (let i = 0; i < allImageFiles.length; i++) {
        const imageFile = allImageFiles[i]
        // Usar el nombre del documento original para determinar el tipo
        const originalFile = Array.from(files).find(f => 
          imageFile.name.includes(f.name.replace(/\.[^.]+$/, ''))
        ) || files[0]
        const docType = detectDocumentType(originalFile.name)
        
        setProcessingProgress(50 + (i / totalFiles) * 40) // 50-90% para procesamiento
        
        try {
          const formData = new FormData()
          formData.append('file', imageFile)
          formData.append('documentType', docType)

          const processResponse = await fetch('/api/ai/preaviso-process-document', {
            method: 'POST',
            body: formData
          })

          if (processResponse.ok) {
            const processResult = await processResponse.json()
            processedCount++
            
            // Actualizar documento original como procesado
            setUploadedDocuments(prev => prev.map(d => 
              d.name === originalFile.name
                ? { ...d, processed: true, extractedData: processResult.extractedData }
                : d
            ))

            // Actualizar datos con información extraída
            if (processResult.extractedData) {
              const extracted = processResult.extractedData
              setData(prev => {
                const updated = { ...prev }
                
                if (docType === 'escritura') {
                  if (extracted.folioReal) updated.inmueble.folioReal = extracted.folioReal
                  if (extracted.seccion) updated.inmueble.seccion = extracted.seccion
                  if (extracted.partida) updated.inmueble.partida = extracted.partida
                  if (extracted.ubicacion) updated.inmueble.direccion = extracted.ubicacion
                  if (extracted.propietario?.nombre) updated.vendedor.nombre = extracted.propietario.nombre
                  if (extracted.propietario?.rfc) updated.vendedor.rfc = extracted.propietario.rfc
                  if (extracted.propietario?.curp) updated.vendedor.curp = extracted.propietario.curp
                  if (extracted.superficie) updated.inmueble.superficie = extracted.superficie
                  if (extracted.valor) updated.inmueble.valor = extracted.valor
                } else if (docType === 'plano') {
                  if (extracted.superficie) updated.inmueble.superficie = extracted.superficie
                } else if (docType === 'identificacion') {
                  if (extracted.nombre && extracted.tipo === 'vendedor') {
                    updated.vendedor.nombre = extracted.nombre
                    if (extracted.rfc) updated.vendedor.rfc = extracted.rfc
                    if (extracted.curp) updated.vendedor.curp = extracted.curp
                  } else if (extracted.nombre && extracted.tipo === 'comprador') {
                    updated.comprador.nombre = extracted.nombre
                    if (extracted.rfc) updated.comprador.rfc = extracted.rfc
                    if (extracted.curp) updated.comprador.curp = extracted.curp
                  }
                }
                
                return updated
              })
            }
          } else {
            setUploadedDocuments(prev => prev.map(d => 
              d.name === originalFile.name
                ? { ...d, processed: true, error: 'Error al procesar' }
                : d
            ))
          }
        } catch (error) {
          console.error(`Error procesando ${originalFile.name}:`, error)
          setUploadedDocuments(prev => prev.map(d => 
            d.name === originalFile.name
              ? { ...d, processed: true, error: 'Error al procesar' }
              : d
          ))
        }
      }

      setProcessingProgress(90) // 90% después de procesar todos los archivos

      setProcessingProgress(95) // 95% consultando al agente

      // Después de procesar, consultar al agente de IA para determinar siguientes pasos
      const newDocuments = [...data.documentos, ...fileNames]
      const chatResponse = await fetch('/api/ai/preaviso-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.filter(m => m.id !== processingMessage.id).map(m => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: `He subido ${fileNames.length} documento(s). He procesado la información extraída. ¿Cuál es el siguiente paso?` }
          ],
          context: {
            vendedor: data.vendedor.nombre ? data.vendedor : undefined,
            comprador: data.comprador.nombre ? data.comprador : undefined,
            inmueble: data.inmueble.direccion ? data.inmueble : undefined,
            documentos: newDocuments
          }
        })
      })

      setProcessingProgress(100) // 100% completado

      if (chatResponse.ok) {
        const result = await chatResponse.json()
        const messagesToAdd = result.messages || [result.message]
        
        // Remover mensaje de procesamiento y agregar respuesta del agente
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id))
        
        const baseTimestamp = Date.now()
        for (let i = 0; i < messagesToAdd.length; i++) {
          await new Promise(resolve => setTimeout(resolve, i * 300))
          const assistantMessage: ChatMessage = {
            id: `file-${baseTimestamp}-${i}`,
            role: 'assistant',
            content: messagesToAdd[i],
            timestamp: new Date()
          }
          setMessages(prev => {
            const exists = prev.some(m => m.id === assistantMessage.id || 
              (m.role === 'assistant' && m.content === assistantMessage.content && 
               Math.abs(m.timestamp.getTime() - assistantMessage.timestamp.getTime()) < 1000))
            if (exists) return prev
            return [...prev, assistantMessage]
          })
        }
      }
    } catch (error) {
      console.error('Error procesando documento:', error)
      setMessages(prev => prev.filter(m => m.id !== processingMessage.id))
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error al procesar el documento. Por favor, intente nuevamente.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
      setIsProcessingDocument(false)
      setProcessingProgress(0)
      setProcessingFileName(null)
    }
  }

  const extractDataFromMessage = (aiMessage: string, userInput: string, currentData: PreavisoData): Partial<PreavisoData> | null => {
    // Extraer información básica usando patrones simples
    const updates: Partial<PreavisoData> = {}
    let hasUpdates = false

    // Detectar nombres (patrones comunes)
    const nombrePattern = /(?:nombre|vendedor|comprador)[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/gi
    const nombres = [...userInput.matchAll(nombrePattern)]
    
    // Detectar RFC
    const rfcPattern = /RFC[:\s]+([A-Z]{3,4}\d{6}[A-Z0-9]{3})/gi
    const rfcMatch = userInput.match(rfcPattern)
    
    // Detectar CURP
    const curpPattern = /CURP[:\s]+([A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d)/gi
    const curpMatch = userInput.match(curpPattern)

    // Detectar folio real
    const folioPattern = /folio[:\s]+(?:real[:\s]+)?(\d+)/gi
    const folioMatch = userInput.match(folioPattern)

    // Detectar crédito
    const creditoPattern = /(?:tiene|tiene|necesita)[\s]+(?:crédito|hipoteca)/gi
    const tieneCredito = creditoPattern.test(userInput.toLowerCase())

    // Actualizar datos si se encuentran
    if (nombres.length > 0 && !currentData.vendedor.nombre) {
      updates.vendedor = { ...currentData.vendedor, nombre: nombres[0][1] }
      hasUpdates = true
    }

    return hasUpdates ? updates : null
  }

  const determineActosNotariales = (data: PreavisoData) => {
    return {
      cancelacionCreditoVendedor: data.vendedor.tieneCredito || false,
      compraventa: true,
      aperturaCreditoComprador: data.comprador.necesitaCredito || false
    }
  }

  const isDataComplete = (data: PreavisoData): boolean => {
    return !!(
      data.vendedor.nombre &&
      data.vendedor.rfc &&
      data.vendedor.curp &&
      data.comprador.nombre &&
      data.comprador.rfc &&
      data.comprador.curp &&
      data.inmueble.direccion &&
      data.inmueble.folioReal &&
      data.inmueble.superficie &&
      data.inmueble.valor
    )
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Chat principal */}
      <Card className="flex-1 flex flex-col shadow-xl border border-gray-200 min-h-0 overflow-hidden bg-white">
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          {/* Header moderno */}
          <div className="border-b border-gray-200/80 bg-gradient-to-r from-white via-gray-50/50 to-white backdrop-blur-sm px-6 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="relative group">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg ring-2 ring-blue-100 group-hover:ring-blue-200 transition-all">
                    {/* Imagen del asistente legal - Reemplazar con imagen real en /public/assistant-lawyer.png */}
                    <Image
                      src="/assistant-lawyer.png"
                      alt="Asistente Legal"
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback a icono de balanza de justicia si la imagen no existe
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent && !parent.querySelector('svg')) {
                          parent.innerHTML = `
                            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                              <path d="M9 11h6v2H9zm0-4h6v2H9z" opacity="0.3"/>
                            </svg>
                          `
                        }
                      }}
                    />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow-sm">
                    <div className="w-full h-full bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-base text-gray-900">Asistente de Pre-Aviso</h3>
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                      En línea
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center space-x-1">
                    <span>Compraventa de Inmueble</span>
                    <span className="text-gray-300">•</span>
                    <span>Notaría Pública #3</span>
                  </p>
                </div>
              </div>
              
              {/* Acciones del header */}
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                  title="Más opciones"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>

          {/* Messages con diseño moderno */}
          <div className="flex-1 overflow-hidden bg-gradient-to-b from-gray-50/50 to-white">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}
                >
                  <div
                    className={`flex items-end space-x-2 max-w-[80%] ${
                      message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    {/* Avatar moderno */}
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm mb-1 ring-1 ring-white/20">
                        <Image
                          src="/assistant-lawyer.png"
                          alt="Asistente Legal"
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback a icono de balanza si la imagen no existe
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            const parent = target.parentElement
                            if (parent && !parent.querySelector('svg')) {
                              parent.innerHTML = `
                                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                                </svg>
                              `
                            }
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Mensaje moderno */}
                    <div
                      className={`rounded-2xl px-4 py-2.5 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                          : 'bg-white text-gray-900 shadow-sm border border-gray-100'
                      }`}
                    >
                      <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        message.role === 'user' ? 'text-white' : 'text-gray-800'
                      }`}>{message.content}</p>
                      
                      {/* Adjuntos */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className={`mt-3 pt-3 ${
                          message.role === 'user' ? 'border-t border-white/20' : 'border-t border-gray-100'
                        }`}>
                          {message.attachments.map((file, idx) => (
                            <div key={idx} className={`flex items-center space-x-2 text-xs ${
                              message.role === 'user' ? 'text-blue-50' : 'text-gray-600'
                            }`}>
                              <FileCheck className="h-3.5 w-3.5" />
                              <span className="truncate">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Timestamp moderno */}
                      <p className={`text-[10px] mt-1.5 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                      }`}>
                        {message.timestamp.toLocaleTimeString('es-MX', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                    
                    {/* Avatar usuario */}
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center flex-shrink-0 shadow-sm mb-1">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="flex items-end space-x-2">
                    <div className="w-8 h-8 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm mb-1 ring-1 ring-white/20">
                      <Image
                        src="/assistant-lawyer.png"
                        alt="Asistente Legal"
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback a icono de balanza si la imagen no existe
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const parent = target.parentElement
                          if (parent && !parent.querySelector('svg')) {
                            parent.innerHTML = `
                              <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                              </svg>
                            `
                          }
                        }}
                      />
                    </div>
                    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
                      <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </div>


          {/* Indicador de progreso de procesamiento */}
          {isProcessingDocument && (
            <div className="border-t border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-medium flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>{processingFileName ? `Procesando: ${processingFileName}` : 'Procesando documento...'}</span>
                  </span>
                  <span className="text-blue-600 font-semibold">{Math.round(processingProgress)}%</span>
                </div>
                <Progress value={processingProgress} className="h-1.5 bg-blue-100" />
              </div>
            </div>
          )}

          {/* Input moderno */}
          <div className="border-t border-gray-200 bg-white px-4 py-2.5">
            <div className="flex items-end space-x-2">
              {/* Botón de adjuntar archivos - estilo moderno */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl hover:bg-gray-100 text-gray-600 hover:text-blue-600 transition-colors flex-shrink-0"
                title="Adjuntar documentos"
              >
                <Upload className="h-5 w-5" />
              </Button>

              {/* Input de texto moderno */}
              <div className="flex-1 relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Escribe tu mensaje..."
                  className="min-h-[44px] max-h-[120px] resize-none border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-2xl bg-gray-50 focus:bg-white transition-all pr-12"
                  disabled={isProcessing}
                />
                {/* Contador de caracteres o indicador */}
                {input.length > 0 && (
                  <div className="absolute bottom-2 right-3 text-xs text-gray-400">
                    {input.length}
                  </div>
                )}
              </div>

              {/* Botón de enviar moderno */}
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
                size="icon"
                title="Enviar mensaje"
              >
                {isProcessing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            
            {/* Indicador de tipos de archivo aceptados */}
            <div className="mt-2 flex items-center justify-center space-x-4 text-xs text-gray-400">
              <span className="flex items-center space-x-1">
                <FileText className="h-3 w-3" />
                <span>PDF, JPG, PNG, DOCX</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Panel de documentos debajo del chat */}
      {uploadedDocuments.length > 0 && (
        <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Header moderno */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Documentos subidos</h4>
                  <p className="text-xs text-gray-500">{uploadedDocuments.length} {uploadedDocuments.length === 1 ? 'documento' : 'documentos'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de documentos horizontal con diseño moderno */}
          <div className="p-4">
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {uploadedDocuments.map((doc) => {
                  const fileUrl = URL.createObjectURL(doc.file)
                  const isImage = doc.type.startsWith('image/')
                  const isPDF = doc.type === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf')
                  
                  return (
                    <div
                      key={doc.id}
                      className="group relative flex-shrink-0 w-24 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200 overflow-hidden"
                    >
                      {/* Preview */}
                      <div className="relative h-20 bg-gradient-to-br from-gray-50 to-gray-100">
                        {isImage ? (
                          <img
                            src={fileUrl}
                            alt={doc.name}
                            className="w-full h-full object-cover"
                          />
                        ) : isPDF ? (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
                            <FileText className="h-6 w-6 text-red-500" />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                            <FileText className="h-6 w-6 text-blue-500" />
                          </div>
                        )}
                        
                        {/* Overlay con estado */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                        
                        {/* Badge de estado */}
                        {doc.processed ? (
                          doc.error ? (
                            <div className="absolute top-1.5 right-1.5 bg-red-500 rounded-full p-1 shadow-lg">
                              <AlertCircle className="h-2.5 w-2.5 text-white" />
                            </div>
                          ) : (
                            <div className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-1 shadow-lg">
                              <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                            </div>
                          )
                        ) : (
                          <div className="absolute top-1.5 right-1.5 bg-blue-500 rounded-full p-1 shadow-lg">
                            <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                      
                      {/* Información */}
                      <div className="p-2 bg-white">
                        <p className="text-xs font-medium text-gray-900 truncate mb-0.5" title={doc.name}>
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {(doc.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  )
}
