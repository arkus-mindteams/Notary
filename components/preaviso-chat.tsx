"use client"

import { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/lib/auth-context'
import { createBrowserClient } from '@/lib/supabase'
import { 
  Send, 
  Bot, 
  User, 
  FileText, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  FileCheck,
  Building2,
  UserCircle,
  CreditCard,
  Users,
  FileCheck2,
  Eye,
  EyeOff,
  FolderOpen
} from 'lucide-react'
import { PreavisoExportOptions } from './preaviso-export-options'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: File[]
}

// Interfaces alineadas con Canonical JSON v1.4
export interface PersonaFisica {
  nombre: string | null
  rfc: string | null
  curp: string | null
  estado_civil: string | null
  conyuge?: {
    nombre: string | null
    participa: boolean
  }
}

export interface PersonaMoral {
  denominacion_social: string | null
  rfc: string | null
  csf_provided: boolean
  csf_reference: string | null
  name_confirmed_exact: boolean
}

export interface CompradorElement {
  party_id: string | null
  tipo_persona: 'persona_fisica' | 'persona_moral' | null
  persona_fisica?: PersonaFisica
  persona_moral?: PersonaMoral
}

export interface VendedorElement {
  party_id: string | null
  tipo_persona: 'persona_fisica' | 'persona_moral' | null
  persona_fisica?: PersonaFisica
  persona_moral?: PersonaMoral
  tiene_credito: boolean | null
  credito_vendedor?: {
    institucion: string | null
    numero_credito: string | null
  }
}

export interface ParticipanteCredito {
  party_id: string | null
  rol: 'acreditado' | 'coacreditado' | null
}

export interface CreditoElement {
  credito_id: string | null
  institucion: string | null
  monto: string | null
  participantes: ParticipanteCredito[]
  tipo_credito: string | null
}

export interface GravamenElement {
  gravamen_id: string | null
  tipo: string | null
  institucion: string | null
  numero_credito: string | null
  cancelacion_confirmada: boolean
}

export interface DireccionInmueble {
  calle: string | null
  numero: string | null
  colonia: string | null
  municipio: string | null
  estado: string | null
  codigo_postal: string | null
}

export interface DatosCatastrales {
  lote: string | null
  manzana: string | null
  fraccionamiento: string | null
  condominio: string | null
  unidad: string | null
  modulo: string | null
}

export interface InmuebleV14 {
  folio_real: string | null
  partidas: string[]
  all_registry_pages_confirmed: boolean
  direccion: DireccionInmueble
  superficie: string | null
  valor: string | null
  datos_catastrales: DatosCatastrales
}

export interface PreavisoData {
  // Meta (opcional, se puede agregar después)
  tipoOperacion: 'compraventa' | null
  
  // Arrays según v1.4
  vendedores: VendedorElement[]
  compradores: CompradorElement[]
  // creditos:
  // - undefined => forma de pago DESCONOCIDA (aún no confirmada por el usuario)
  // - []        => CONTADO confirmado
  // - [..]      => CRÉDITO(s) (deben estar completos)
  creditos?: CreditoElement[]
  gravamenes: GravamenElement[]
  
  // Inmueble según v1.4
  inmueble: InmuebleV14
  
  // Control de impresión
  control_impresion?: {
    imprimir_conyuges: boolean
    imprimir_coacreditados: boolean
    imprimir_creditos: boolean
  }
  
  // Validaciones
  validaciones?: {
    expediente_existente: boolean
    datos_completos: boolean
    bloqueado: boolean
  }
  
  // Actos notariales (mantener por compatibilidad con generador)
  actosNotariales?: {
    cancelacionCreditoVendedor: boolean
    compraventa: boolean
    aperturaCreditoComprador: boolean
  }
  
  // Documentos (mantener por compatibilidad)
  documentos: string[]
}

// Estado "fuente de verdad" calculado por el backend
export interface ServerStateSnapshot {
  current_state: string | null
  state_status: Record<string, string>
  required_missing: string[]
  blocking_reasons: string[]
  allowed_actions: string[]
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
  documentType?: string // Tipo detectado: 'escritura', 'plano', 'identificacion', etc.
}

interface PreavisoChatProps {
  onDataComplete: (data: PreavisoData) => void
  onGenerateDocument: (data: PreavisoData, uploadedDocuments?: UploadedDocument[], activeTramiteId?: string | null) => void
  onExportReady?: (data: PreavisoData, show: boolean) => void
}

const INITIAL_MESSAGES = [
  "Buenos días. Bienvenido al sistema de Solicitud de Certificado con Efecto de Pre-Aviso de Compraventa.",
  "Para comenzar, ¿tienes la hoja de inscripción del inmueble? Necesito folio real, sección y partida. Si no la tienes, puedo capturar los datos manualmente."
]

export function PreavisoChat({ onDataComplete, onGenerateDocument, onExportReady }: PreavisoChatProps) {
  const stripDataUpdateBlocksForDisplay = (text: string): string => {
    if (!text) return ''
    // Ocultar SIEMPRE el bloque técnico del usuario final
    const cleaned = text.replace(/<DATA_UPDATE>[\s\S]*?<\/DATA_UPDATE>/g, '').trim()
    return cleaned
  }

  const toUserFacingAssistantText = (raw: string): string => {
    const cleaned = stripDataUpdateBlocksForDisplay(raw)
    // Si el modelo solo mandó <DATA_UPDATE>, no mostramos el bloque técnico.
    // Mostramos una confirmación neutra y corta para no “desaparecer” el mensaje.
    return cleaned.length > 0 ? cleaned : 'Información registrada.'
  }
  const { user } = useAuth()
  const supabase = useMemo(() => createBrowserClient(), [])
  const messageIdCounterRef = useRef(0)
  
  // Función helper para generar IDs únicos para mensajes
  const generateMessageId = (prefix: string = 'msg'): string => {
    messageIdCounterRef.current++
    return `${prefix}-${Date.now()}-${messageIdCounterRef.current}-${Math.random().toString(36).substr(2, 9)}`
  }
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [initialMessagesSent, setInitialMessagesSent] = useState(false)
  const [activeTramiteId, setActiveTramiteId] = useState<string | null>(null)
  const [expedienteExistente, setExpedienteExistente] = useState<{
    compradorId: string
    compradorNombre: string
    tieneExpedientes: boolean
    cantidadTramites: number
    tramites: Array<{ id: string, tipo: string, estado: string, createdAt: string, updatedAt: string }>
  } | null>(null)
  const [data, setData] = useState<PreavisoData>({
    tipoOperacion: 'compraventa', // Siempre es compraventa en este sistema
    vendedores: [],
    compradores: [],
    creditos: undefined,
    gravamenes: [],
    inmueble: {
      folio_real: null,
      partidas: [],
      all_registry_pages_confirmed: false,
      direccion: {
        calle: null,
        numero: null,
        colonia: null,
        municipio: null,
        estado: null,
        codigo_postal: null
      },
      superficie: null,
      valor: null,
      datos_catastrales: {
        lote: null,
        manzana: null,
        fraccionamiento: null,
        condominio: null,
        unidad: null,
        modulo: null
      }
    },
    control_impresion: {
      imprimir_conyuges: false,
      imprimir_coacreditados: false,
      imprimir_creditos: false
    },
    validaciones: {
      expediente_existente: false,
      datos_completos: false,
      bloqueado: true
    },
    actosNotariales: {
      cancelacionCreditoVendedor: false,
      compraventa: false,
      aperturaCreditoComprador: false
    },
    documentos: []
  })

  // Evitar "stale closures" en flujos async (subida de documentos / chat)
  const dataRef = useRef<PreavisoData>(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Fuente de verdad del progreso/estado (viene del backend)
  const [serverState, setServerState] = useState<ServerStateSnapshot | null>(null)

  // Enviar mensajes iniciales y crear nuevo trámite al iniciar
  useEffect(() => {
    let mounted = true

    const initializeChat = async () => {
      if (!user?.id) {
        return
      }

      // Crear nuevo trámite siempre
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const response = await fetch('/api/expedientes/tramites', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            compradorId: null,
            userId: user.id,
            tipo: 'preaviso',
            datos: {
              tipoOperacion: 'compraventa', // Siempre es compraventa
              vendedores: [],
              compradores: [],
              creditos: undefined,
              gravamenes: [],
              inmueble: {
                folio_real: null,
                partidas: [],
                all_registry_pages_confirmed: false,
                direccion: {
                  calle: null,
                  numero: null,
                  colonia: null,
                  municipio: null,
                  estado: null,
                  codigo_postal: null
                },
                superficie: null,
                valor: null,
                datos_catastrales: {
                  lote: null,
                  manzana: null,
                  fraccionamiento: null,
                  condominio: null,
                  unidad: null,
                  modulo: null
                }
              },
              control_impresion: {
                imprimir_conyuges: false,
                imprimir_coacreditados: false,
                imprimir_creditos: false
              },
              validaciones: {
                expediente_existente: false,
                datos_completos: false,
                bloqueado: true
              },
              actosNotariales: { cancelacionCreditoVendedor: false, compraventa: false, aperturaCreditoComprador: false }
            },
            estado: 'en_proceso',
          }),
        })

        if (response.ok && mounted) {
          const tramite = await response.json()
          setActiveTramiteId(tramite.id)
        }
      } catch (error) {
        console.error('Error creando nuevo trámite:', error)
      }

      // Enviar mensajes iniciales
      const sendInitialMessages = async () => {
        for (let i = 0; i < INITIAL_MESSAGES.length; i++) {
          if (!mounted) break
          
          await new Promise(resolve => setTimeout(resolve, i * 400))
          
          if (!mounted) break
          
          const initialMessageId = generateMessageId('initial')
          setMessages(prev => {
            const exists = prev.some(m => m.content === INITIAL_MESSAGES[i] && m.role === 'assistant')
            if (exists) return prev
            return [...prev, {
              id: initialMessageId,
              role: 'assistant',
              content: INITIAL_MESSAGES[i],
              timestamp: new Date()
            }]
          })
        }
        if (mounted) {
          setInitialMessagesSent(true)
        }
      }

      sendInitialMessages()
    }

    initializeChat()

    return () => {
      mounted = false
    }
  }, [user?.id])

  // Guardar progreso automáticamente cuando cambian los datos
  useEffect(() => {
    const saveProgress = async () => {
      // Solo guardar si hay datos significativos y hay un trámite activo o usuario
      const primerVendedor = data.vendedores?.[0]
      const primerComprador = data.compradores?.[0]
      const vendedorNombre = primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social
      const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social
      const direccion = data.inmueble?.direccion?.calle || (data.inmueble?.direccion as any)
      
      if (!user?.id || (!vendedorNombre && !direccion && !compradorNombre)) {
        return
      }

      try {
        // Obtener token de la sesión para autenticación
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        // Si no hay trámite activo, crear uno
        if (!activeTramiteId) {
          const response = await fetch('/api/expedientes/tramites', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              compradorId: null, // Sin comprador aún
              userId: user.id,
              tipo: 'preaviso',
              datos: data,
              estado: 'en_proceso',
            }),
          })

          if (response.ok) {
            const tramite = await response.json()
            setActiveTramiteId(tramite.id)
          }
        } else {
          // Actualizar trámite existente
          await fetch(`/api/expedientes/tramites?id=${activeTramiteId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              datos: data,
            }),
          })
        }
      } catch (error) {
        console.error('Error guardando progreso (no crítico):', error)
        // No mostrar error al usuario, es guardado en background
      }
    }

    // Debounce: guardar después de 2 segundos de inactividad
    const timer = setTimeout(saveProgress, 2000)
    return () => clearTimeout(timer)
  }, [data, activeTramiteId, user?.id])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([])
  const uploadedDocumentsRef = useRef<UploadedDocument[]>([])
  useEffect(() => {
    uploadedDocumentsRef.current = uploadedDocuments
  }, [uploadedDocuments])
  const [isProcessingDocument, setIsProcessingDocument] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingFileName, setProcessingFileName] = useState<string | null>(null)
  const [showDataPanel, setShowDataPanel] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  // Back-end es la fuente de verdad para "completo"
  const isCompleteByServer = useMemo(() => {
    if (!serverState) return false
    if (serverState.current_state === 'ESTADO_8') return true
    const ss = serverState.state_status || {}
    const ok = (k: string) => ss[k] === 'completed' || ss[k] === 'not_applicable'
    return ok('ESTADO_1') && ok('ESTADO_2') && ok('ESTADO_3') && ok('ESTADO_4') && ok('ESTADO_5') && ok('ESTADO_6')
  }, [serverState])

  // Calcular progreso basado en datos completados (v1.4 - arrays)
  const progress = useMemo(() => {
    const total = 6
    const ss = serverState?.state_status || {}
    const ok = (k: string) => ss[k] === 'completed' || ss[k] === 'not_applicable'
    const completed =
      (ok('ESTADO_1') ? 1 : 0) +
      (ok('ESTADO_2') ? 1 : 0) +
      (ok('ESTADO_3') ? 1 : 0) +
      (ok('ESTADO_4') ? 1 : 0) +
      (ok('ESTADO_5') ? 1 : 0) +
      (ok('ESTADO_6') ? 1 : 0)
    return { completed, total, percentage: Math.round((completed / total) * 100) }
  }, [serverState])

  // Efecto para notificar cuando los datos estén completos (fuera del render)
  // Usar useRef para evitar llamadas múltiples
  const dataCompleteNotifiedRef = useRef(false)
  useEffect(() => {
    if (isCompleteByServer && !dataCompleteNotifiedRef.current) {
      dataCompleteNotifiedRef.current = true
      // Usar setTimeout para evitar actualizar durante el render
      const timer = setTimeout(() => {
        onDataComplete(data)
      }, 0)
      return () => clearTimeout(timer)
    } else if (!isCompleteByServer) {
      // Resetear el flag si los datos ya no están completos
      dataCompleteNotifiedRef.current = false
    }
  }, [data, onDataComplete, isCompleteByServer])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Efecto para mostrar opciones de exportación cuando los datos estén completos
  useEffect(() => {
    // Mostrar opciones siempre que los datos estén completos
    if (isCompleteByServer) {
      setShowExportOptions(true)
      if (onExportReady) {
        onExportReady(data, true)
      }
    } else {
      setShowExportOptions(false)
      if (onExportReady) {
        onExportReady(data, false)
      }
    }
  }, [data, onExportReady, isCompleteByServer])

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return

    const userMessage: ChatMessage = {
      id: generateMessageId('user'),
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
            // Enviar SIEMPRE el contexto completo, incluso si algunos campos están vacíos (v1.4)
            // Esto permite que el backend detecte correctamente qué información ya está capturada
            vendedores: data.vendedores || [],
            compradores: data.compradores || [],
            // IMPORTANTE: no forzar [] si no está confirmado; undefined se omite en JSON.stringify
            creditos: data.creditos,
            gravamenes: data.gravamenes || [],
            inmueble: data.inmueble,
            documentos: data.documentos,
            documentosProcesados: uploadedDocuments
              .filter(d => d.processed && d.extractedData)
              .map(d => ({
                nombre: d.name,
                tipo: d.documentType || 'desconocido',
                informacionExtraida: d.extractedData
              })),
            expedienteExistente: expedienteExistente || undefined
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const result = await response.json()
      const messagesToAdd = result.messages || [result.message]
      if (result?.state) {
        setServerState(result.state as ServerStateSnapshot)
      }

      // Fuente de verdad de datos estructurados: si el backend ya pudo parsear <DATA_UPDATE>,
      // aplicarlo directo al estado para que el panel "Información Capturada" refleje confirmaciones.
      const hasServerData = !!result?.data
      if (hasServerData) {
        setData(prevData => {
          const nextData = { ...prevData }
          const d = result.data

          if (d.tipoOperacion !== undefined) nextData.tipoOperacion = d.tipoOperacion
          if (d.vendedores !== undefined) nextData.vendedores = d.vendedores as any
          if (d.compradores !== undefined) nextData.compradores = d.compradores as any
          if (Object.prototype.hasOwnProperty.call(d, 'creditos')) nextData.creditos = d.creditos as any
          if (d.gravamenes !== undefined) nextData.gravamenes = d.gravamenes as any
          if (d.inmueble) nextData.inmueble = d.inmueble as any
          if (d.control_impresion) nextData.control_impresion = d.control_impresion
          if (d.validaciones) nextData.validaciones = d.validaciones

          nextData.actosNotariales = determineActosNotariales(nextData)
          return nextData
        })
      }
      
      // Detectar si el mensaje contiene el resumen final
      const hasSummary = messagesToAdd.some((msg: string) => 
        msg.includes('RESUMEN DE INFORMACIÓN CAPTURADA') || 
        msg.includes('=== RESUMEN DE INFORMACIÓN CAPTURADA ===')
      )
      
      if (hasSummary && isCompleteByServer) {
        setShowExportOptions(true)
      }
      
      // Agregar mensajes con delay para efecto conversacional
      for (let i = 0; i < messagesToAdd.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 300)) // 300ms entre mensajes
        const assistantMessage: ChatMessage = {
          id: generateMessageId('ai'),
          role: 'assistant',
          content: toUserFacingAssistantText(messagesToAdd[i]),
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
      // Incluir mensajes previos de la IA para detectar confirmaciones
      const previousAIMessages = messages
        .filter(m => m.role === 'assistant')
        .slice(-3) // Últimos 3 mensajes de la IA
        .map(m => m.content)
        .join('\n\n')
      // IMPORTANTE: No re-extraer/reescribir datos en frontend si el backend ya entregó `data`.
      // El extractor local no conserva banderas internas (ej. titular_registral_confirmado) y puede revertir pasos.
      if (!hasServerData) {
        const allAIMessages = (previousAIMessages ? previousAIMessages + '\n\n' : '') + messagesToAdd.join('\n\n')
        const extractedData = extractDataFromMessage(allAIMessages, currentInput, data)
        if (extractedData) {
          setData(prevData => {
            const newData = { ...prevData }
            
            // Actualizar tipoOperacion
            if (extractedData.tipoOperacion !== undefined) {
              newData.tipoOperacion = extractedData.tipoOperacion
            }

            // v1.4: arrays y estructura de inmueble
            if (extractedData.vendedores !== undefined) {
              newData.vendedores = extractedData.vendedores as any
            }
            if (extractedData.compradores !== undefined) {
              newData.compradores = extractedData.compradores as any
            }
            // creditos puede ser [] (contado) o [..] (crédito) o undefined (no confirmado)
            if (Object.prototype.hasOwnProperty.call(extractedData, 'creditos')) {
              newData.creditos = extractedData.creditos as any
            }
            if (extractedData.gravamenes !== undefined) {
              newData.gravamenes = extractedData.gravamenes as any
            }
            if (extractedData.inmueble) {
              newData.inmueble = extractedData.inmueble as any
            }
            
            // Determinar actos notariales
            const actos = determineActosNotariales(newData)
            newData.actosNotariales = actos
            
            return newData
          })
        }
      }

    } catch (error) {
      console.error('Error en chat:', error)
      const errorMessage: ChatMessage = {
        id: generateMessageId('error'),
        role: 'assistant',
        content: 'Disculpe, ha ocurrido un error al procesar su mensaje. Por favor, intente nuevamente o proporcione la información de otra manera.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
      // Restaurar foco en el input después de procesar
      setTimeout(() => {
        textInputRef.current?.focus()
      }, 100)
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
      id: generateMessageId('doc'),
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
      id: generateMessageId('file'),
      role: 'user',
      content: `He subido el siguiente documento: ${fileNames.join(', ')}`,
      timestamp: new Date(),
      attachments: Array.from(files)
    }
    setMessages(prev => [...prev, fileMessage])

    // Mensaje de procesamiento
    const processingMessage: ChatMessage = {
      id: generateMessageId('processing'),
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
          id: generateMessageId('pdf-error'),
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
      // Determinar tipo de documento basado en el nombre original o contenido visual
      const detectDocumentType = async (fileName: string, file: File): Promise<string> => {
        const name = fileName.toLowerCase()
        // Detección por nombre
        if (name.includes('inscripcion') || name.includes('inscripción') || name.includes('hoja de inscripcion') || name.includes('folio real')) return 'inscripcion'
        if (name.includes('escritura') || name.includes('titulo') || name.includes('propiedad')) return 'escritura'
        if (name.includes('plano') || name.includes('croquis') || name.includes('catastral')) return 'plano'
        if (name.includes('ine') || name.includes('ife') || name.includes('identificacion') || 
            name.includes('pasaporte') || name.includes('licencia') || name.includes('curp')) return 'identificacion'
        
        // Si no se puede determinar por nombre, intentar detectar visualmente
        // Para imágenes pequeñas o genéricas, asumir que puede ser identificación
        // La IA Vision detectará automáticamente el tipo al procesar
        if (file.type.startsWith('image/') && file.size < 5 * 1024 * 1024) { // Archivos pequeños probablemente son IDs
          return 'identificacion'
        }
        
        return 'escritura' // default
      }

      // Procesar cada imagen (archivos convertidos)
      const totalFiles = allImageFiles.length
      let processedCount = 0
      // Snapshot mutable para construir contexto correcto durante el flujo (evita usar "data" o "uploadedDocuments" viejos)
      let workingData: PreavisoData = dataRef.current
      let workingDocs: UploadedDocument[] = uploadedDocumentsRef.current
      
      for (let i = 0; i < allImageFiles.length; i++) {
        const imageFile = allImageFiles[i]
        // Usar el nombre del documento original para determinar el tipo
        const originalFile = Array.from(files).find(f => 
          imageFile.name.includes(f.name.replace(/\.[^.]+$/, ''))
        ) || files[0]
        const docType = await detectDocumentType(originalFile.name, originalFile)
        
        setProcessingProgress(50 + (i / totalFiles) * 40) // 50-90% para procesamiento
        
        try {
          // Procesar documento con IA para extraer información
          const formData = new FormData()
          formData.append('file', imageFile)
          formData.append('documentType', docType)
          // Enviar contexto actual para que el backend pueda devolver state (fuente de verdad)
          formData.append('context', JSON.stringify({
            tipoOperacion: workingData.tipoOperacion,
            vendedores: workingData.vendedores || [],
            compradores: workingData.compradores || [],
            creditos: workingData.creditos,
            gravamenes: workingData.gravamenes || [],
            inmueble: workingData.inmueble,
            documentos: workingData.documentos,
            documentosProcesados: workingDocs
              .filter(d => d.processed && d.extractedData)
              .map(d => ({
                nombre: d.name,
                tipo: d.documentType || 'desconocido',
                informacionExtraida: d.extractedData
              })),
            expedienteExistente: expedienteExistente || undefined
          }))

          // Obtener token de sesión para autenticación (necesario para buscar expedientes)
          const { data: { session } } = await supabase.auth.getSession()
          const headers: HeadersInit = {}
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }

          const processResponse = await fetch('/api/ai/preaviso-process-document', {
            method: 'POST',
            headers,
            body: formData
          })

          if (processResponse.ok) {
            const processResult = await processResponse.json()
            processedCount++

            if (processResult?.state) {
              setServerState(processResult.state as ServerStateSnapshot)
            }
            
            // Si hay información de expediente existente, guardarla
            if (processResult.expedienteExistente) {
              setExpedienteExistente(processResult.expedienteExistente)
            }
            
            // Actualizar documento original como procesado
            setUploadedDocuments(prev => {
              const next = prev.map(d =>
                d.name === originalFile.name
                  ? { ...d, processed: true, extractedData: processResult.extractedData, documentType: docType }
                  : d
              )
              workingDocs = next
              return next
            })

            // Subir documento a S3 y asociarlo al trámite activo (si existe)
            // Esto permite que los documentos estén disponibles incluso si el usuario sale
            if (activeTramiteId) {
              try {
                // Obtener token de la sesión para autenticación
                const { data: { session } } = await supabase.auth.getSession()
                const headers: HeadersInit = {}
                if (session?.access_token) {
                  headers['Authorization'] = `Bearer ${session.access_token}`
                }

                const uploadFormData = new FormData()
                uploadFormData.append('file', originalFile) // Usar archivo original, no imagen convertida
                uploadFormData.append('compradorId', '') // Sin comprador aún
                uploadFormData.append('tipo', docType)
                uploadFormData.append('tramiteId', activeTramiteId)

                const uploadResponse = await fetch('/api/expedientes/documentos/upload', {
                  method: 'POST',
                  headers,
                  body: uploadFormData,
                })

                if (uploadResponse.ok) {
                  console.log(`[PreavisoChat] Documento ${originalFile.name} subido a S3 y asociado al trámite`)
                }
              } catch (uploadError) {
                console.error(`Error subiendo documento ${originalFile.name} a S3:`, uploadError)
                // No bloquear el flujo si falla la subida
              }
            }

            // Actualizar datos con información extraída
            if (processResult.extractedData) {
              const extracted = processResult.extractedData
              setData(prev => {
                const updated = { ...prev }
                
                if (docType === 'escritura' || docType === 'inscripcion') {
                  // Actualizar inmueble (v1.4)
                  if (extracted.folioReal) updated.inmueble.folio_real = extracted.folioReal
                  if (extracted.partida) {
                    if (!updated.inmueble.partidas) updated.inmueble.partidas = []
                    if (!updated.inmueble.partidas.includes(extracted.partida)) {
                      updated.inmueble.partidas = [...updated.inmueble.partidas, extracted.partida]
                    }
                  }
                  // Soportar partidas[] si vienen en array
                  if (Array.isArray(extracted.partidas) && extracted.partidas.length > 0) {
                    if (!updated.inmueble.partidas) updated.inmueble.partidas = []
                    for (const p of extracted.partidas) {
                      if (p && !updated.inmueble.partidas.includes(p)) {
                        updated.inmueble.partidas = [...updated.inmueble.partidas, p]
                      }
                    }
                  }
                  if (extracted.ubicacion) {
                    // Si viene como string, intentar parsear o usar como calle
                    if (typeof extracted.ubicacion === 'string') {
                      updated.inmueble.direccion = {
                        ...updated.inmueble.direccion,
                        calle: extracted.ubicacion
                      }
                    } else {
                      updated.inmueble.direccion = {
                        ...updated.inmueble.direccion,
                        ...extracted.ubicacion
                      }
                    }
                  }
                  
                  // Actualizar vendedor (v1.4 - array)
                  if (extracted.propietario?.nombre) {
                    if (!updated.vendedores || updated.vendedores.length === 0) {
                      updated.vendedores = [{
                        party_id: null,
                        tipo_persona: null,
                        persona_fisica: {
                          nombre: extracted.propietario.nombre || null,
                          rfc: extracted.propietario.rfc || null,
                          // En inscripción puede no venir CURP; conservar si existe
                          curp: extracted.propietario.curp || null,
                          estado_civil: null
                        },
                        tiene_credito: null
                      }]
                    } else {
                      // Actualizar primer vendedor
                      updated.vendedores[0] = {
                        ...updated.vendedores[0],
                        persona_fisica: {
                          ...updated.vendedores[0].persona_fisica,
                          nombre: extracted.propietario.nombre || updated.vendedores[0].persona_fisica?.nombre || null,
                          rfc: extracted.propietario.rfc || updated.vendedores[0].persona_fisica?.rfc || null,
                          curp: extracted.propietario.curp || updated.vendedores[0].persona_fisica?.curp || null
                        }
                      }
                    }
                  }
                  
                  // Superficie y valor
                  if (extracted.superficie) {
                    if (typeof extracted.superficie === 'object') {
                      const superficieObj = extracted.superficie as any
                      updated.inmueble.superficie = superficieObj.superficieEdificada 
                        ? String(superficieObj.superficieEdificada)
                        : superficieObj.privativa 
                          ? String(superficieObj.privativa)
                          : superficieObj.total 
                            ? String(superficieObj.total)
                            : JSON.stringify(superficieObj)
                    } else {
                      updated.inmueble.superficie = String(extracted.superficie)
                    }
                  }
                  if (extracted.valor) {
                    updated.inmueble.valor = typeof extracted.valor === 'object' 
                      ? JSON.stringify(extracted.valor) 
                      : String(extracted.valor)
                  }
                  
                  // Datos catastrales (v1.4)
                  if (extracted.unidad) updated.inmueble.datos_catastrales.unidad = extracted.unidad
                  if (extracted.modulo) updated.inmueble.datos_catastrales.modulo = extracted.modulo
                  if (extracted.condominio) updated.inmueble.datos_catastrales.condominio = extracted.condominio
                  if (extracted.lote) updated.inmueble.datos_catastrales.lote = extracted.lote
                  if (extracted.manzana) updated.inmueble.datos_catastrales.manzana = extracted.manzana
                  if (extracted.fraccionamiento) updated.inmueble.datos_catastrales.fraccionamiento = extracted.fraccionamiento
                  if (extracted.colonia) updated.inmueble.direccion.colonia = extracted.colonia
                } else if (docType === 'plano') {
                  // Asegurar que superficie sea un string, no un objeto
                  if (extracted.superficie) {
                    if (typeof extracted.superficie === 'object') {
                      const superficieObj = extracted.superficie as any
                      if (superficieObj.superficieEdificada) {
                        updated.inmueble.superficie = String(superficieObj.superficieEdificada)
                      } else if (superficieObj.privativa) {
                        updated.inmueble.superficie = String(superficieObj.privativa)
                      } else if (superficieObj.total) {
                        updated.inmueble.superficie = String(superficieObj.total)
                      } else {
                        updated.inmueble.superficie = JSON.stringify(superficieObj)
                      }
                    } else {
                      updated.inmueble.superficie = String(extracted.superficie)
                    }
                  }
                } else if (docType === 'identificacion') {
                  // Para identificaciones, intentar determinar si es vendedor o comprador (v1.4)
                  const primerVendedor = data.vendedores?.[0]
                  const primerComprador = data.compradores?.[0]
                  const vendedorNombre = primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social
                  const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social
                  
                  const isVendedor = extracted.tipo === 'vendedor' || (!vendedorNombre && compradorNombre)
                  const isComprador = extracted.tipo === 'comprador' || (!compradorNombre && vendedorNombre)
                  
                  const targetPerson = isVendedor ? 'vendedor' : (isComprador ? 'comprador' : (!vendedorNombre ? 'vendedor' : 'comprador'))
                  
                  if (extracted.nombre) {
                    if (targetPerson === 'vendedor') {
                      if (!updated.vendedores || updated.vendedores.length === 0) {
                        updated.vendedores = [{
                          party_id: null,
                          tipo_persona: 'persona_fisica',
                          persona_fisica: {
                            nombre: extracted.nombre || null,
                            rfc: extracted.rfc || null,
                            curp: extracted.curp || null,
                            estado_civil: null
                          },
                          tiene_credito: null
                        }]
                      } else {
                        updated.vendedores[0] = {
                          ...updated.vendedores[0],
                          persona_fisica: {
                            ...updated.vendedores[0].persona_fisica,
                            nombre: extracted.nombre || updated.vendedores[0].persona_fisica?.nombre || null,
                            rfc: extracted.rfc || updated.vendedores[0].persona_fisica?.rfc || null,
                            curp: extracted.curp || updated.vendedores[0].persona_fisica?.curp || null
                          }
                        }
                      }
                    } else {
                      if (!updated.compradores || updated.compradores.length === 0) {
                        updated.compradores = [{
                          party_id: null,
                          tipo_persona: 'persona_fisica',
                          persona_fisica: {
                            nombre: extracted.nombre || null,
                            rfc: extracted.rfc || null,
                            curp: extracted.curp || null,
                            estado_civil: null
                          }
                        }]
                      } else {
                        updated.compradores[0] = {
                          ...updated.compradores[0],
                          persona_fisica: {
                            ...updated.compradores[0].persona_fisica,
                            nombre: extracted.nombre || updated.compradores[0].persona_fisica?.nombre || null,
                            rfc: extracted.rfc || updated.compradores[0].persona_fisica?.rfc || null,
                            curp: extracted.curp || updated.compradores[0].persona_fisica?.curp || null
                          }
                        }
                      }
                    }
                  }
                }
                
                // Mantener workingData sincronizado para construir contextos correctos durante este flujo
                workingData = updated
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
      const newDocuments = [...workingData.documentos, ...fileNames]
      
      // Recopilar información extraída de los documentos procesados
      const processedDocsInfo = workingDocs
        .filter(d => d.processed && d.extractedData)
        .map(d => {
          const extracted = d.extractedData
          let info = `Documento: ${d.name}\n`
          if (extracted.nombre) info += `Nombre: ${extracted.nombre}\n`
          if (extracted.rfc) info += `RFC: ${extracted.rfc}\n`
          if (extracted.curp) info += `CURP: ${extracted.curp}\n`
          if (extracted.folioReal) info += `Folio Real: ${extracted.folioReal}\n`
          if (extracted.direccion || extracted.ubicacion) info += `Dirección: ${extracted.direccion || extracted.ubicacion}\n`
          if (extracted.tipoDocumento) info += `Tipo: ${extracted.tipoDocumento}\n`
          return info.trim()
        })
        .join('\n\n')

      const chatResponse = await fetch('/api/ai/preaviso-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.filter(m => m.id !== processingMessage.id).map(m => ({ role: m.role, content: m.content })),
            { 
              role: 'user' as const, 
              content: `He subido el siguiente documento: ${fileNames.join(', ')}`
            }
          ],
          context: {
            // Enviar SIEMPRE el contexto completo, incluso si algunos campos están vacíos (v1.4)
            vendedores: workingData.vendedores || [],
            compradores: workingData.compradores || [],
            // IMPORTANTE: no forzar [] si no está confirmado; undefined se omite en JSON.stringify
            creditos: workingData.creditos,
            gravamenes: workingData.gravamenes || [],
            inmueble: workingData.inmueble,
            documentos: newDocuments,
            documentosProcesados: workingDocs
              .filter(d => d.processed && d.extractedData)
              .map(d => ({
                nombre: d.name,
                tipo: d.documentType || 'desconocido',
                informacionExtraida: d.extractedData
              }))
          }
        })
      })

      setProcessingProgress(100) // 100% completado

      if (chatResponse.ok) {
        const result = await chatResponse.json()
        if (result?.state) {
          setServerState(result.state as ServerStateSnapshot)
        }
        const messagesToAdd = result.messages || [result.message]
        
        // Remover mensaje de procesamiento y agregar respuesta del agente
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id))
        
        const baseTimestamp = Date.now()
        for (let i = 0; i < messagesToAdd.length; i++) {
          await new Promise(resolve => setTimeout(resolve, i * 300))
          const assistantMessage: ChatMessage = {
            id: `file-${baseTimestamp}-${i}`,
            role: 'assistant',
            content: toUserFacingAssistantText(messagesToAdd[i]),
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

  // Handlers para drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Solo ocultar el overlay si salimos del contenedor principal
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFileUpload(files)
    }
  }

  const extractDataFromMessage = (aiMessage: string, userInput: string, currentData: PreavisoData): Partial<PreavisoData> | null => {
    const updates: Partial<PreavisoData> = {}
    let hasUpdates = false

    // Intentar extraer JSON estructurado del mensaje de la IA (v1.4 compatible)
    const dataUpdateMatch = aiMessage.match(/<DATA_UPDATE>([\s\S]*?)<\/DATA_UPDATE>/)
    
    if (dataUpdateMatch) {
      try {
        const jsonData = JSON.parse(dataUpdateMatch[1].trim())
        
        // Actualizar tipoOperacion
        if (jsonData.tipoOperacion !== undefined && jsonData.tipoOperacion !== null) {
          updates.tipoOperacion = jsonData.tipoOperacion
          hasUpdates = true
        }

        // Procesar compradores (array v1.4)
        if (jsonData.compradores && Array.isArray(jsonData.compradores)) {
          // Agregar nuevos compradores al array existente
          updates.compradores = [...(currentData.compradores || []), ...jsonData.compradores]
          hasUpdates = true
        } else if (jsonData.comprador) {
          // Compatibilidad: convertir formato antiguo (singular) a array
          const compradorElement: CompradorElement = {
            party_id: null,
            tipo_persona: jsonData.comprador.tipoPersona || null,
            persona_fisica: jsonData.comprador.tipoPersona === 'persona_fisica' ? {
              nombre: jsonData.comprador.nombre || null,
              rfc: jsonData.comprador.rfc || null,
              curp: jsonData.comprador.curp || null,
              estado_civil: jsonData.comprador.estado_civil || null
            } : undefined,
            persona_moral: jsonData.comprador.tipoPersona === 'persona_moral' ? {
              denominacion_social: jsonData.comprador.denominacion_social || null,
              rfc: jsonData.comprador.rfc || null,
              csf_provided: false,
              csf_reference: null,
              name_confirmed_exact: false
            } : undefined
          }
          updates.compradores = [...(currentData.compradores || []), compradorElement]
          hasUpdates = true
        }

        // Procesar vendedores (array v1.4)
        if (jsonData.vendedores && Array.isArray(jsonData.vendedores)) {
          updates.vendedores = [...(currentData.vendedores || []), ...jsonData.vendedores]
          hasUpdates = true
        } else if (jsonData.vendedor) {
          // Compatibilidad: convertir formato antiguo (singular) a array
          const vendedorElement: VendedorElement = {
            party_id: null,
            tipo_persona: jsonData.vendedor.tipoPersona || null,
            persona_fisica: jsonData.vendedor.tipoPersona === 'persona_fisica' ? {
              nombre: jsonData.vendedor.nombre || null,
              rfc: jsonData.vendedor.rfc || null,
              curp: jsonData.vendedor.curp || null,
              estado_civil: null
            } : undefined,
            persona_moral: jsonData.vendedor.tipoPersona === 'persona_moral' ? {
              denominacion_social: jsonData.vendedor.denominacion_social || null,
              rfc: jsonData.vendedor.rfc || null,
              csf_provided: false,
              csf_reference: null,
              name_confirmed_exact: false
            } : undefined,
            tiene_credito: jsonData.vendedor.tieneCredito !== undefined ? jsonData.vendedor.tieneCredito : null,
            credito_vendedor: jsonData.vendedor.institucionCredito ? {
              institucion: jsonData.vendedor.institucionCredito,
              numero_credito: jsonData.vendedor.numeroCredito || null
            } : undefined
          }
          updates.vendedores = [...(currentData.vendedores || []), vendedorElement]
          hasUpdates = true
        }

        // Procesar créditos (array v1.4)
        if (jsonData.creditos && Array.isArray(jsonData.creditos)) {
          const normalizedCreditos: CreditoElement[] = jsonData.creditos.map((c: any) => ({
            credito_id: c?.credito_id ?? null,
            institucion: c?.institucion ?? null,
            monto: c?.monto ?? null,
            participantes: Array.isArray(c?.participantes) ? c.participantes : [],
            tipo_credito: c?.tipo_credito ?? null
          }))

          updates.creditos = [...(currentData.creditos || []), ...normalizedCreditos]
          hasUpdates = true
        }

        // Procesar gravámenes (array v1.4)
        if (jsonData.gravamenes && Array.isArray(jsonData.gravamenes)) {
          updates.gravamenes = [...(currentData.gravamenes || []), ...jsonData.gravamenes]
          hasUpdates = true
        }

        // Procesar inmueble (estructura v1.4)
        if (jsonData.inmueble) {
          const inmuebleBase = currentData.inmueble || {
            folio_real: null,
            partidas: [],
            all_registry_pages_confirmed: false,
            direccion: {
              calle: null,
              numero: null,
              colonia: null,
              municipio: null,
              estado: null,
              codigo_postal: null
            },
            superficie: null,
            valor: null,
            datos_catastrales: {
              lote: null,
              manzana: null,
              fraccionamiento: null,
              condominio: null,
              unidad: null,
              modulo: null
            }
          }

          const inmuebleUpdates: InmuebleV14 = {
            ...inmuebleBase,
            folio_real: jsonData.inmueble.folio_real !== undefined ? jsonData.inmueble.folio_real : inmuebleBase.folio_real,
            partidas: jsonData.inmueble.partidas ? [...inmuebleBase.partidas, ...jsonData.inmueble.partidas] : inmuebleBase.partidas,
            all_registry_pages_confirmed: jsonData.inmueble.all_registry_pages_confirmed !== undefined 
              ? jsonData.inmueble.all_registry_pages_confirmed 
              : inmuebleBase.all_registry_pages_confirmed,
            direccion: jsonData.inmueble.direccion 
              ? { ...inmuebleBase.direccion, ...jsonData.inmueble.direccion }
              : inmuebleBase.direccion,
            superficie: jsonData.inmueble.superficie !== undefined 
              ? (typeof jsonData.inmueble.superficie === 'string' ? jsonData.inmueble.superficie : String(jsonData.inmueble.superficie))
              : inmuebleBase.superficie,
            valor: jsonData.inmueble.valor !== undefined
              ? (typeof jsonData.inmueble.valor === 'string' ? jsonData.inmueble.valor : String(jsonData.inmueble.valor))
              : inmuebleBase.valor,
            datos_catastrales: jsonData.inmueble.datos_catastrales
              ? { ...inmuebleBase.datos_catastrales, ...jsonData.inmueble.datos_catastrales }
              : inmuebleBase.datos_catastrales
          }

          // Compatibilidad: si viene en formato antiguo, convertir
          if (jsonData.inmueble.folioReal) {
            inmuebleUpdates.folio_real = jsonData.inmueble.folioReal
          }
          if (jsonData.inmueble.partida) {
            inmuebleUpdates.partidas = [...inmuebleUpdates.partidas, jsonData.inmueble.partida]
          }
          if (jsonData.inmueble.direccion && typeof jsonData.inmueble.direccion === 'string') {
            // Si viene como string, intentar parsear o usar como calle
            inmuebleUpdates.direccion.calle = jsonData.inmueble.direccion
          }
          if (jsonData.inmueble.lote) inmuebleUpdates.datos_catastrales.lote = jsonData.inmueble.lote
          if (jsonData.inmueble.manzana) inmuebleUpdates.datos_catastrales.manzana = jsonData.inmueble.manzana
          if (jsonData.inmueble.fraccionamiento) inmuebleUpdates.datos_catastrales.fraccionamiento = jsonData.inmueble.fraccionamiento
          if (jsonData.inmueble.condominio) inmuebleUpdates.datos_catastrales.condominio = jsonData.inmueble.condominio
          if (jsonData.inmueble.unidad) inmuebleUpdates.datos_catastrales.unidad = jsonData.inmueble.unidad
          if (jsonData.inmueble.modulo) inmuebleUpdates.datos_catastrales.modulo = jsonData.inmueble.modulo
          if (jsonData.inmueble.colonia) inmuebleUpdates.direccion.colonia = jsonData.inmueble.colonia

          updates.inmueble = inmuebleUpdates
          hasUpdates = true
        }

        // Procesar control_impresion
        if (jsonData.control_impresion) {
          updates.control_impresion = {
            ...(currentData.control_impresion || {
              imprimir_conyuges: false,
              imprimir_coacreditados: false,
              imprimir_creditos: false
            }),
            ...jsonData.control_impresion
          }
          hasUpdates = true
        }

        // Procesar validaciones
        if (jsonData.validaciones) {
          updates.validaciones = {
            ...(currentData.validaciones || {
              expediente_existente: false,
              datos_completos: false,
              bloqueado: true
            }),
            ...jsonData.validaciones
          }
          hasUpdates = true
        }

      } catch (error) {
        console.error('Error parseando JSON de actualización de datos:', error)
        // Si falla el parseo, continuar con métodos de fallback
      }
    }

    // Fallback: Detectar información básica usando patrones simples si no hay JSON
    if (!hasUpdates) {
      // Detectar confirmaciones: si el usuario responde "sí", "si", "correcto", etc., extraer datos de la pregunta previa de la IA
      // También detectar confirmaciones más largas como "sí, confirmo" o "si, confirmo que son todas"
      const confirmacionMatch = userInput.match(/^(sí|si|yes|correcto|afirmativo|de acuerdo|ok|okay|vale|está bien|está correcto|confirmo|confirmado|sí\s*,\s*confirmo|si\s*,\s*confirmo)/i) ||
                                userInput.match(/(?:sí|si|yes|correcto|afirmativo|de acuerdo|ok|okay|vale|está bien|está correcto|confirmo|confirmado).*(?:confirmo|son todas|hojas registrales|titular registral)/i)
      if (confirmacionMatch && aiMessage) {
        // Extraer información de la pregunta previa de la IA que contiene los datos a confirmar
        
        // Detectar Folio Real (v1.4)
        const folioMatch = aiMessage.match(/folio\s+real\s+(\d+)/i)
        if (folioMatch && !currentData.inmueble?.folio_real) {
          if (!updates.inmueble) {
            updates.inmueble = {
              ...currentData.inmueble,
              folio_real: null,
              partidas: currentData.inmueble?.partidas || [],
              all_registry_pages_confirmed: currentData.inmueble?.all_registry_pages_confirmed || false,
              direccion: currentData.inmueble?.direccion || {
                calle: null,
                numero: null,
                colonia: null,
                municipio: null,
                estado: null,
                codigo_postal: null
              },
              superficie: currentData.inmueble?.superficie || null,
              valor: currentData.inmueble?.valor || null,
              datos_catastrales: currentData.inmueble?.datos_catastrales || {
                lote: null,
                manzana: null,
                fraccionamiento: null,
                condominio: null,
                unidad: null,
                modulo: null
              }
            }
          }
          updates.inmueble.folio_real = folioMatch[1]
          hasUpdates = true
        }
        
        // Detectar Partida (v1.4)
        const partidaMatch = aiMessage.match(/partida\s+(\d+)/i)
        if (partidaMatch) {
          const partida = partidaMatch[1]
          const partidasActuales = currentData.inmueble?.partidas || []
          if (!partidasActuales.includes(partida)) {
            if (!updates.inmueble) {
              updates.inmueble = {
                ...currentData.inmueble,
                partidas: [...partidasActuales]
              }
            }
            updates.inmueble.partidas = [...(updates.inmueble.partidas || partidasActuales), partida]
            hasUpdates = true
          }
        }
          hasUpdates = true
        }
        
        // Detectar superficie (con diferentes formatos)
        const superficieMatch = aiMessage.match(/superficie\s+de\s+([\d,.]+)\s*m[²2]/i) || aiMessage.match(/([\d,.]+)\s*m[²2]/i)
        if (superficieMatch && !currentData.inmueble.superficie) {
          if (!updates.inmueble) updates.inmueble = { ...currentData.inmueble }
          updates.inmueble.superficie = superficieMatch[1].replace(/,/g, '')
          hasUpdates = true
        }
        
        // Detectar valor
        const valorMatch = aiMessage.match(/valor\s+de\s+(\$?[\d,.]+)/i) || aiMessage.match(/\$\s*([\d,.]+)/i)
        if (valorMatch && !currentData.inmueble.valor) {
          if (!updates.inmueble) updates.inmueble = { ...currentData.inmueble }
          updates.inmueble.valor = valorMatch[1].replace(/,/g, '')
          hasUpdates = true
        }
        
        // Detectar dirección (buscando patrones como "LOTE X MANZANA Y", "DESARROLLO", etc.)
        const direccionPatterns = [
          /(lote\s+\d+\s+manzana\s+\d+[^.]*)/i,
          /(desarrollo[^.,]*)/i,
          /(fraccionamiento[^.,]*)/i,
          /(colonia[^.,]*)/i
        ]
        for (const pattern of direccionPatterns) {
          const direccionMatch = aiMessage.match(pattern)
          if (direccionMatch && !currentData.inmueble.direccion) {
            if (!updates.inmueble) updates.inmueble = { ...currentData.inmueble }
            // Extraer más contexto alrededor del match
            const matchIndex = aiMessage.toLowerCase().indexOf(direccionMatch[1].toLowerCase())
            const start = Math.max(0, matchIndex - 50)
            const end = Math.min(aiMessage.length, matchIndex + direccionMatch[1].length + 100)
            const contexto = aiMessage.substring(start, end)
            // Buscar municipio también
            const municipioMatch = contexto.match(/municipio[:\s]+([A-ZÁÉÍÓÚÑ\s]+?)(?:,|\.|$)/i)
            const municipio = municipioMatch ? municipioMatch[1].trim() : 'TIJUANA'
            updates.inmueble.direccion = direccionMatch[1].trim() + (municipio ? `, ${municipio}` : '')
            hasUpdates = true
            break
          }
        }
        
        // Extraer LOTE y MANZANA específicos (v1.4)
        const loteMatch = aiMessage.match(/lote\s+(\d+)/i)
        if (loteMatch && !currentData.inmueble?.datos_catastrales?.lote) {
          if (!updates.inmueble) {
            updates.inmueble = {
              ...currentData.inmueble,
              datos_catastrales: {
                ...currentData.inmueble?.datos_catastrales,
                lote: null,
                manzana: null,
                fraccionamiento: null,
                condominio: null,
                unidad: null,
                modulo: null
              }
            }
          }
          if (!updates.inmueble.datos_catastrales) {
            updates.inmueble.datos_catastrales = {
              ...currentData.inmueble?.datos_catastrales,
              lote: null,
              manzana: null,
              fraccionamiento: null,
              condominio: null,
              unidad: null,
              modulo: null
            }
          }
          updates.inmueble.datos_catastrales.lote = loteMatch[1]
          hasUpdates = true
        }
        
        const manzanaMatch = aiMessage.match(/manzana\s+(\d+)/i)
        if (manzanaMatch && !currentData.inmueble?.datos_catastrales?.manzana) {
          if (!updates.inmueble) {
            updates.inmueble = {
              ...currentData.inmueble,
              datos_catastrales: {
                ...currentData.inmueble?.datos_catastrales,
                lote: null,
                manzana: null,
                fraccionamiento: null,
                condominio: null,
                unidad: null,
                modulo: null
              }
            }
          }
          if (!updates.inmueble.datos_catastrales) {
            updates.inmueble.datos_catastrales = {
              ...currentData.inmueble?.datos_catastrales,
              lote: null,
              manzana: null,
              fraccionamiento: null,
              condominio: null,
              unidad: null,
              modulo: null
            }
          }
          updates.inmueble.datos_catastrales.manzana = manzanaMatch[1]
          hasUpdates = true
        }
        
        // Extraer fraccionamiento (v1.4)
        const fraccionamientoMatch = aiMessage.match(/(?:desarrollo|fraccionamiento)\s+([A-ZÁÉÍÓÚÑ0-9\s]+?)(?:,|\.|municipio|$)/i)
        if (fraccionamientoMatch && !currentData.inmueble?.datos_catastrales?.fraccionamiento) {
          if (!updates.inmueble) {
            updates.inmueble = {
              ...currentData.inmueble,
              datos_catastrales: {
                ...currentData.inmueble?.datos_catastrales,
                lote: null,
                manzana: null,
                fraccionamiento: null,
                condominio: null,
                unidad: null,
                modulo: null
              }
            }
          }
          if (!updates.inmueble.datos_catastrales) {
            updates.inmueble.datos_catastrales = {
              ...currentData.inmueble?.datos_catastrales,
              lote: null,
              manzana: null,
              fraccionamiento: null,
              condominio: null,
              unidad: null,
              modulo: null
            }
          }
          updates.inmueble.datos_catastrales.fraccionamiento = fraccionamientoMatch[1].trim()
          hasUpdates = true
        }
        
        // Tipo de operación siempre es compraventa (no se detecta, ya está establecido)
        
        // Detectar forma de pago:
        // IMPORTANTE: NO inferir del texto del asistente (aiMessage), solo del userInput confirmado.
        // La detección basada en aiMessage causaba falsos positivos ("contado" por pregunta tipo "¿contado o crédito?").

        // Detectar institución de crédito del comprador
        // PRIMERO: Buscar instituciones comunes directamente (más confiable)
        const institucionesComunes = ['FOVISSSTE', 'INFONAVIT', 'HSBC', 'BANAMEX', 'BANCOMER', 'BBVA', 'SANTANDER', 'BANORTE', 'SCOTIABANK', 'BANCO AZTECA', 'BANCO DEL BAJIO']
        let institucionEncontrada = false
        for (const inst of institucionesComunes) {
          // Buscar en ambos: mensaje de IA y input del usuario (v1.4 - arrays)
          if (userInput.match(new RegExp(`\\b${inst}\\b`, 'i'))) {
            // Actualizar o crear crédito con institución
            const creditosActuales = currentData.creditos || []
            if (creditosActuales.length === 0) {
              updates.creditos = [{
                credito_id: null,
                institucion: inst,
                monto: null,
                participantes: [],
                tipo_credito: null
              }]
            } else {
              updates.creditos = creditosActuales.map((c, i) => 
                i === 0 ? { ...c, institucion: inst } : c
              )
            }
            hasUpdates = true
            institucionEncontrada = true
            break
          }
        }
        
        // Si no se encontró una institución común, buscar con patrones más flexibles
        if (!institucionEncontrada) {
          // Patrón 1: "crédito FOVISSSTE" o "a crédito FOVISSSTE" (institución después de "crédito")
          let institucionMatch = userInput.match(/(?:totalmente\s+)?(?:a\s+)?(?:crédito|credito)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s&.,-]{2,})(?:\s|\.|,|$|por|será|es)/i)
          
          // Patrón 2: "institución: X" o "banco: X" (más estricto para evitar capturar "qu" o RFC/CURP)
          // Detenerse antes de encontrar "RFC", "CURP" o un punto seguido de espacio y mayúscula (nueva oración)
          if (!institucionMatch) {
            institucionMatch = userInput.match(/(?:institución|institucion|banco|entidad)[\s\w]*?[:\s]+(?:es|será|es\s+)?\*?\*?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s&.,-]{3,}?)(?:\s*(?:RFC|CURP)|\s*\.\s+[A-ZÁÉÍÓÚÑ]|\s*$)\*?\*?/i)
          }
          
          // Patrón 3: "con FOVISSSTE" o "mediante FOVISSSTE"
          if (!institucionMatch) {
            institucionMatch = userInput.match(/(?:con|mediante|por|a través de)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s&.,-]{3,})(?:\s|\.|,|$)/i)
          }
          
          if (institucionMatch && institucionMatch[1]) {
            let institucion = institucionMatch[1].trim().replace(/\*\*/g, '')
            
            // Limpiar: remover cualquier texto que contenga "RFC" o "CURP" y todo lo que sigue
            institucion = institucion.replace(/\s*(?:RFC|CURP).*$/i, '').trim()
            // Limpiar: remover punto final y cualquier texto después de un punto seguido de espacio (nueva oración)
            institucion = institucion.replace(/\s*\.\s+[A-ZÁÉÍÓÚÑ].*$/, '').replace(/[.,]$/, '')
            // Limpiar: remover "Y" o "AND" seguido de texto (ej: "FOVISSSTE Y CURP...")
            institucion = institucion.replace(/\s+(?:Y|AND)\s+.*$/i, '').trim()
            
            // Validar que tenga al menos 3 caracteres y NO sea un CURP (formato: 4 letras + 6 dígitos + 3 letras + 2 dígitos)
            const esCURP = /^[A-Z]{4}\d{6}[A-Z]{3}\d{2}$/.test(institucion.replace(/\s/g, ''))
            // También validar que no sea un RFC (formato: 4 letras + 6 dígitos + 3 caracteres)
            const esRFC = /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/.test(institucion.replace(/\s/g, ''))
            // Validar que no contenga "CURP" o "RFC" en el texto
            const contieneCURP = /\bCURP\b/i.test(institucion)
            const contieneRFC = /\bRFC\b/i.test(institucion)
            // Validar que no empiece con "CURP" o "RFC"
            const empiezaConCURP = /^CURP\s/i.test(institucion)
            const empiezaConRFC = /^RFC\s/i.test(institucion)
            // Validar que no contenga formato de RFC o CURP en cualquier parte
            const contieneFormatoRFC = /[A-Z]{4}\d{6}[A-Z0-9]{3}/.test(institucion.replace(/\s/g, ''))
            const contieneFormatoCURP = /[A-Z]{4}\d{6}[A-Z]{3}\d{2}/.test(institucion.replace(/\s/g, ''))
            // Validar que no contenga frases comunes que no son nombres de instituciones
            const contieneFraseInvalida = /\b(?:QUE|QUE\s+UTILIZARÁ|UTILIZARÁ|EL\s+COMPRADOR|COMPRADOR|SERÁ|SERA|ES|POR|PARA|DEL|DE|LA|LAS|LOS|UN|UNA)\b/i.test(institucion)
            // Validar que no sea solo palabras comunes
            const esSoloPalabrasComunes = /^(?:QUE|UTILIZARÁ|EL|COMPRADOR|SERÁ|SERA|ES|POR|PARA|DEL|DE|LA|LAS|LOS|UN|UNA|Y|O|A|CON|MEDIANTE)(?:\s+(?:QUE|UTILIZARÁ|EL|COMPRADOR|SERÁ|SERA|ES|POR|PARA|DEL|DE|LA|LAS|LOS|UN|UNA|Y|O|A|CON|MEDIANTE))*$/i.test(institucion)
            
            if (institucion && institucion.length >= 3 && !esCURP && !esRFC && !contieneCURP && !contieneRFC && !empiezaConCURP && !empiezaConRFC && !contieneFormatoRFC && !contieneFormatoCURP && !contieneFraseInvalida && !esSoloPalabrasComunes) {
              // Actualizar o crear crédito con institución (v1.4)
              const creditosActuales = currentData.creditos || []
              if (creditosActuales.length === 0) {
                updates.creditos = [{
                  credito_id: null,
                  institucion: institucion.toUpperCase(),
                  monto: null,
                  participantes: [],
                  tipo_credito: null
                }]
              } else {
                updates.creditos = creditosActuales.map((c, i) => 
                  i === 0 ? { ...c, institucion: institucion.toUpperCase() } : c
                )
              }
              hasUpdates = true
            }
          }
        }

        // Detectar monto de crédito del comprador en mensaje de IA
        // Patrón mejorado: busca "monto del crédito será por $X" o "crédito será por $X"
        // NOTA: el monto/institución deben venir del usuario o de <DATA_UPDATE>.
      }

      // Tipo de operación siempre es compraventa (no se detecta, ya está establecido)

      // Detectar forma de pago (permitir actualización incluso si ya tiene valor)
      const contadoMatch = userInput.match(/(?:pago|pagar|forma de pago|se paga|se pagará|será pagado|sera pagado)[:\s]+(?:de\s+)?contado/i)
      // Detectar "será a crédito", "sera a credito", "será con crédito", etc.
      const seraCreditoMatch = userInput.match(/(?:será|sera|es|ser)\s+(?:a|con|mediante|por|totalmente\s+a)\s+(?:crédito|credito|hipoteca|bancario|financiamiento|préstamo)/i)
      const creditoMatch = userInput.match(/(?:pago|pagar|forma de pago|se paga|se pagará|será pagado|sera pagado|mediante|con|a través de)[:\s]+(?:mediante\s+)?(?:crédito|credito|hipoteca|bancario|financiamiento|préstamo)/i)
      const creditoSimpleMatch = userInput.match(/(?:crédito|credito|hipoteca|bancario|financiamiento|préstamo)/i)

      if (contadoMatch) {
        // Contado = sin créditos (v1.4)
        if (currentData.creditos && currentData.creditos.length > 0) {
          updates.creditos = []
          hasUpdates = true
        }
      } else if (seraCreditoMatch || creditoMatch || (creditoSimpleMatch && userInput.match(/(?:sí|si|yes|correcto|afirmativo|de acuerdo|ok|okay|vale|está bien|confirmo|confirmado)/i))) {
        // Crédito detectado (v1.4)
        if (!currentData.creditos || currentData.creditos.length === 0) {
          updates.creditos = [{
            credito_id: null,
            institucion: null,
            monto: null,
            participantes: [],
            tipo_credito: null
          }]
          hasUpdates = true
        }
      }

      // Detectar institución de crédito del comprador (fuera del bloque de confirmación)
      // PRIMERO: Buscar instituciones comunes directamente
      const institucionesComunes2 = ['FOVISSSTE', 'INFONAVIT', 'HSBC', 'BANAMEX', 'BANCOMER', 'BBVA', 'SANTANDER', 'BANORTE', 'SCOTIABANK', 'BANCO AZTECA', 'BANCO DEL BAJIO']
      let institucionEncontrada2 = false
      for (const inst of institucionesComunes2) {
        if (aiMessage.match(new RegExp(`\\b${inst}\\b`, 'i')) || userInput.match(new RegExp(`\\b${inst}\\b`, 'i'))) {
          // Actualizar o crear crédito con institución (v1.4)
          const creditosActuales = currentData.creditos || []
          if (creditosActuales.length === 0) {
            updates.creditos = [{
              credito_id: null,
              institucion: inst,
              monto: null,
              participantes: [],
              tipo_credito: null
            }]
          } else {
            updates.creditos = creditosActuales.map((c, i) => 
              i === 0 ? { ...c, institucion: inst } : c
            )
          }
          hasUpdates = true
          institucionEncontrada2 = true
          break
        }
      }
      
      // Si no se encontró, buscar con patrones más flexibles
      if (!institucionEncontrada2) {
        // Patrón 1: "crédito FOVISSSTE" o "a crédito FOVISSSTE"
        let institucionMatch = (aiMessage + ' ' + userInput).match(/(?:totalmente\s+)?(?:a\s+)?(?:crédito|credito)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s&.,-]{2,})(?:\s|\.|,|$|por|será|es)/i)
        
        // Patrón 2: "institución: X" o "banco: X" (mínimo 3 caracteres)
        // Detenerse antes de encontrar "RFC", "CURP" o un punto seguido de espacio y mayúscula (nueva oración)
        if (!institucionMatch) {
          institucionMatch = (aiMessage + ' ' + userInput).match(/(?:institución|institucion|banco|entidad)[\s\w]*?[:\s]+(?:es|será|es\s+)?\*?\*?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s&.,-]{3,}?)(?:\s*(?:RFC|CURP)|\s*\.\s+[A-ZÁÉÍÓÚÑ]|\s*$)\*?\*?/i)
        }
        
        // Patrón 3: "con FOVISSSTE" o "mediante FOVISSSTE"
        if (!institucionMatch) {
          institucionMatch = (aiMessage + ' ' + userInput).match(/(?:con|mediante|por|a través de)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s&.,-]{3,})(?:\s|\.|,|$)/i)
        }
        
        if (institucionMatch && institucionMatch[1]) {
          let institucion = institucionMatch[1].trim().replace(/\*\*/g, '')
          
          // Limpiar: remover cualquier texto que contenga "RFC" o "CURP" y todo lo que sigue
          institucion = institucion.replace(/\s*(?:RFC|CURP).*$/i, '').trim()
          // Limpiar: remover punto final y cualquier texto después de un punto seguido de espacio (nueva oración)
          institucion = institucion.replace(/\s*\.\s+[A-ZÁÉÍÓÚÑ].*$/, '').replace(/[.,]$/, '')
          // Limpiar: remover "Y" o "AND" seguido de texto (ej: "FOVISSSTE Y CURP...")
          institucion = institucion.replace(/\s+(?:Y|AND)\s+.*$/i, '').trim()
          
          // Validar que tenga al menos 3 caracteres y NO sea un CURP (formato: 4 letras + 6 dígitos + 3 letras + 2 dígitos)
          const esCURP = /^[A-Z]{4}\d{6}[A-Z]{3}\d{2}$/.test(institucion.replace(/\s/g, ''))
          // También validar que no sea un RFC (formato: 4 letras + 6 dígitos + 3 caracteres)
          const esRFC = /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/.test(institucion.replace(/\s/g, ''))
          // Validar que no contenga "CURP" o "RFC" en el texto
          const contieneCURP = /\bCURP\b/i.test(institucion)
          const contieneRFC = /\bRFC\b/i.test(institucion)
          // Validar que no empiece con "CURP" o "RFC"
          const empiezaConCURP = /^CURP\s/i.test(institucion)
          const empiezaConRFC = /^RFC\s/i.test(institucion)
          // Validar que no contenga formato de RFC o CURP en cualquier parte
          const contieneFormatoRFC = /[A-Z]{4}\d{6}[A-Z0-9]{3}/.test(institucion.replace(/\s/g, ''))
          const contieneFormatoCURP = /[A-Z]{4}\d{6}[A-Z]{3}\d{2}/.test(institucion.replace(/\s/g, ''))
          // Validar que no contenga frases comunes que no son nombres de instituciones
          const contieneFraseInvalida = /\b(?:QUE|QUE\s+UTILIZARÁ|UTILIZARÁ|EL\s+COMPRADOR|COMPRADOR|SERÁ|SERA|ES|POR|PARA|DEL|DE|LA|LAS|LOS|UN|UNA)\b/i.test(institucion)
          // Validar que no sea solo palabras comunes
          const esSoloPalabrasComunes = /^(?:QUE|UTILIZARÁ|EL|COMPRADOR|SERÁ|SERA|ES|POR|PARA|DEL|DE|LA|LAS|LOS|UN|UNA|Y|O|A|CON|MEDIANTE)(?:\s+(?:QUE|UTILIZARÁ|EL|COMPRADOR|SERÁ|SERA|ES|POR|PARA|DEL|DE|LA|LAS|LOS|UN|UNA|Y|O|A|CON|MEDIANTE))*$/i.test(institucion)
          
          if (institucion && institucion.length >= 3 && !esCURP && !esRFC && !contieneCURP && !contieneRFC && !empiezaConCURP && !empiezaConRFC && !contieneFormatoRFC && !contieneFormatoCURP && !contieneFraseInvalida && !esSoloPalabrasComunes) {
            // Actualizar o crear crédito con institución (v1.4)
            const creditosActuales = currentData.creditos || []
            if (creditosActuales.length === 0) {
              updates.creditos = [{
                credito_id: null,
                institucion: institucion.toUpperCase(),
                monto: null,
                participantes: [],
                tipo_credito: null
              }]
            } else {
              updates.creditos = creditosActuales.map((c, i) => 
                i === 0 ? { ...c, institucion: institucion.toUpperCase() } : c
              )
            }
            hasUpdates = true
          }
        }
      }

      // Detectar monto de crédito del comprador (v1.4)
      // Patrón 1: "el mismo que el valor" o "igual al valor" - usar valor del inmueble
      const mismoValorMatch = userInput.match(/(?:el\s+mismo|igual|mismo\s+que|igual\s+que|el\s+mismo\s+que)\s+(?:el\s+)?(?:valor|precio|casa|inmueble|operación)/i) ||
                              userInput.match(/(?:será|es)\s+(?:el\s+mismo|igual)\s+(?:que\s+)?(?:el\s+)?(?:valor|precio)/i)
      if (mismoValorMatch && currentData.inmueble?.valor) {
        const creditosActuales = currentData.creditos || []
        if (creditosActuales.length === 0) {
          updates.creditos = [{
            credito_id: null,
            institucion: null,
            monto: currentData.inmueble.valor,
            participantes: [],
            tipo_credito: null
          }]
        } else {
          updates.creditos = creditosActuales.map((c, i) => 
            i === 0 ? { ...c, monto: currentData.inmueble?.valor || null } : c
          )
        }
        hasUpdates = true
      }
      // Patrón 2: Monto explícito en mensaje de IA o input del usuario
      if (!mismoValorMatch || !currentData.inmueble?.valor) {
        const montoMatch = aiMessage.match(/(?:monto|cantidad|importe|crédito)[\s\w]*?[:\s]+(?:es|será|es\s+)?(?:por\s+)?\*?\*?\$?\s*([\d,]+(?:\s*[\d,]+)*)\s*(?:pesos|mxn|mxp)?\*?\*?/i) ||
                          userInput.match(/(?:monto|cantidad|importe|crédito)[\s\w]*?[:\s]+(?:de\s+)?\$?\s*([\d,]+(?:\s*[\d,]+)*)\s*(?:pesos|mxn|mxp)?/i) ||
                          aiMessage.match(/\$\s*([\d,]+(?:\s*[\d,]+)*)\s*(?:pesos|mxn|mxp)?/i)
        if (montoMatch && montoMatch[1]) {
          let monto = montoMatch[1].trim().replace(/\*\*/g, '').replace(/\s+/g, '')
          // Formatear monto: agregar $ y mantener comas
          if (monto && !monto.startsWith('$')) {
            monto = `$${monto}`
          }
          if (monto && monto.length > 1) {
            // Actualizar monto en crédito (v1.4)
            const creditosActuales = currentData.creditos || []
            if (creditosActuales.length === 0) {
              updates.creditos = [{
                credito_id: null,
                institucion: null,
                monto: monto,
                participantes: [],
                tipo_credito: null
              }]
            } else {
              updates.creditos = creditosActuales.map((c, i) => 
                i === 0 ? { ...c, monto: monto } : c
              )
            }
            hasUpdates = true
          }
        }
      }

      // Detectar nombres (patrones comunes) - v1.4
      const nombrePattern = /(?:nombre|vendedor|comprador)[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/gi
      const nombres = [...userInput.matchAll(nombrePattern)]
      
      // Detectar RFC
      const rfcPattern = /RFC[:\s]+([A-Z]{3,4}\d{6}[A-Z0-9]{3})/gi
      const rfcMatch = userInput.match(rfcPattern)
      
      // Detectar CURP
      const curpPattern = /CURP[:\s]+([A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d)/gi
      const curpMatch = userInput.match(curpPattern)

      // Actualizar datos si se encuentran (v1.4 - arrays)
      const primerVendedor = currentData.vendedores?.[0]
      const vendedorNombre = primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social
      
      if (nombres.length > 0 && !vendedorNombre) {
        if (!updates.vendedores) {
          updates.vendedores = currentData.vendedores ? [...currentData.vendedores] : []
        }
        if (updates.vendedores.length === 0) {
          updates.vendedores = [{
            party_id: null,
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              nombre: nombres[0][1] || null,
              rfc: null,
              curp: null,
              estado_civil: null
            },
            tiene_credito: null
          }]
        } else {
          updates.vendedores[0] = {
            ...updates.vendedores[0],
            persona_fisica: {
              ...updates.vendedores[0].persona_fisica,
              nombre: nombres[0][1] || updates.vendedores[0].persona_fisica?.nombre || null
            }
          }
        }
        hasUpdates = true
      }

      if (rfcMatch && !primerVendedor?.persona_fisica?.rfc && !primerVendedor?.persona_moral?.rfc) {
        if (!updates.vendedores) {
          updates.vendedores = currentData.vendedores ? [...currentData.vendedores] : []
        }
        if (updates.vendedores.length === 0) {
          updates.vendedores = [{
            party_id: null,
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              nombre: null,
              rfc: rfcMatch[1] || null,
              curp: null,
              estado_civil: null
            },
            tiene_credito: null
          }]
        } else {
          updates.vendedores[0] = {
            ...updates.vendedores[0],
            persona_fisica: {
              ...updates.vendedores[0].persona_fisica,
              rfc: rfcMatch[1] || updates.vendedores[0].persona_fisica?.rfc || null
            }
          }
        }
        hasUpdates = true
      }

      if (curpMatch && !primerVendedor?.persona_fisica?.curp) {
        if (!updates.vendedores) {
          updates.vendedores = currentData.vendedores ? [...currentData.vendedores] : []
        }
        if (updates.vendedores.length === 0) {
          updates.vendedores = [{
            party_id: null,
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              nombre: null,
              rfc: null,
              curp: curpMatch[1] || null,
              estado_civil: null
            },
            tiene_credito: null
          }]
        } else {
          updates.vendedores[0] = {
            ...updates.vendedores[0],
            persona_fisica: {
              ...updates.vendedores[0].persona_fisica,
              curp: curpMatch[1] || updates.vendedores[0].persona_fisica?.curp || null
            }
          }
        }
        hasUpdates = true
      }

    return hasUpdates ? updates : null
  }

  const determineActosNotariales = (data: PreavisoData) => {
    const primerVendedor = data.vendedores?.[0]
    const tieneCreditos = data.creditos && data.creditos.length > 0
    
    return {
      cancelacionCreditoVendedor: primerVendedor?.tiene_credito === true || false,
      compraventa: true,
      aperturaCreditoComprador: tieneCreditos
    }
  }

  return (
    <div 
      className="h-full flex flex-col gap-4 overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Overlay de drag and drop */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-4 border-dashed border-blue-500 rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 shadow-2xl border border-blue-200">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <Upload className="h-8 w-8 text-blue-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Suelta los archivos aquí</h3>
                <p className="text-sm text-gray-600">Arrastra y suelta documentos para subirlos</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Layout con panel de información - Parte superior */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Chat principal */}
        <Card className="flex-1 flex flex-col shadow-xl border border-gray-200 min-h-0 overflow-hidden bg-white">
        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          {/* Header moderno */}
          <div className="border-b border-gray-200/80 bg-gradient-to-r from-white via-gray-50/50 to-white backdrop-blur-sm px-6 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="relative group">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg ring-2 ring-blue-100 group-hover:ring-blue-200 transition-all">
                      <Image
                        src="/ai-img.png"
                        alt="Asistente Legal"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        priority
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
                          src="/ai-img.png"
                          alt="Asistente Legal"
                          width={32}
                          height={32}
                          className="w-full h-full object-cover"
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
                      <Bot className="w-5 h-5 text-white" />
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
                  ref={textInputRef}
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

      {/* Panel de información extraída */}
      {showDataPanel && (
        <Card className="w-80 flex flex-col shadow-xl border border-gray-200 min-h-0 overflow-hidden bg-white">
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {/* Header del panel */}
            <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-900">Información Capturada</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowDataPanel(false)}
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>Progreso</span>
                  <span>{progress.completed}/{progress.total} pasos</span>
                </div>
                <Progress value={progress.percentage} className="h-2" />
              </div>
            </div>

            {/* Contenido del panel */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                {/* PASO 1 – OPERACIÓN Y FORMA DE PAGO */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {serverState?.state_status?.ESTADO_1 === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <CreditCard className="h-4 w-4" />
                      <span>PASO 1: Operación y Forma de Pago</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.tipoOperacion ? (
                      <>
                        <div><span className="font-medium">Tipo de operación:</span> {data.tipoOperacion}</div>
                        {data.creditos && data.creditos.length > 0 ? (
                          <div><span className="font-medium">Forma de pago:</span> Crédito</div>
                        ) : data.creditos && data.creditos.length === 0 ? (
                          <div><span className="font-medium">Forma de pago:</span> Contado</div>
                        ) : (
                          <div className="text-gray-400 italic">Forma de pago: Pendiente</div>
                        )}
                      </>
                    ) : (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 2 – INMUEBLE Y REGISTRO (CONSOLIDADO) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {serverState?.state_status?.ESTADO_2 === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <Building2 className="h-4 w-4" />
                      <span>PASO 2: Inmueble y Registro</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.inmueble?.folio_real && (
                      <div><span className="font-medium">Folio Real:</span> {data.inmueble.folio_real}</div>
                    )}
                    {data.inmueble?.partidas && data.inmueble.partidas.length > 0 && (
                      <div><span className="font-medium">Partida(s):</span> {data.inmueble.partidas.join(', ')}</div>
                    )}
                    {data.inmueble?.direccion?.calle && (
                      <div><span className="font-medium">Dirección:</span> {
                        typeof data.inmueble.direccion === 'string' 
                          ? data.inmueble.direccion 
                          : `${data.inmueble.direccion.calle || ''} ${data.inmueble.direccion.numero || ''} ${data.inmueble.direccion.colonia || ''}`.trim()
                      }</div>
                    )}
                    {data.inmueble?.superficie && (
                      <div><span className="font-medium">Superficie:</span> {
                        typeof data.inmueble.superficie === 'string' 
                          ? data.inmueble.superficie 
                          : String(data.inmueble.superficie)
                      }</div>
                    )}
                    {data.inmueble?.valor && (
                      <div><span className="font-medium">Valor:</span> {
                        typeof data.inmueble.valor === 'string' 
                          ? data.inmueble.valor 
                          : String(data.inmueble.valor)
                      }</div>
                    )}
                    {!data.inmueble?.folio_real && (!data.inmueble?.partidas || data.inmueble.partidas.length === 0) && (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 3 – VENDEDOR(ES) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {serverState?.state_status?.ESTADO_3 === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <UserCircle className="h-4 w-4" />
                      <span>PASO 3: Vendedor(es)</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.vendedores && data.vendedores.length > 0 && (
                      <>
                        {data.vendedores[0].persona_fisica?.nombre && (
                          <div><span className="font-medium">Nombre:</span> {data.vendedores[0].persona_fisica.nombre}</div>
                        )}
                        {data.vendedores[0].persona_moral?.denominacion_social && (
                          <div><span className="font-medium">Denominación Social:</span> {data.vendedores[0].persona_moral.denominacion_social}</div>
                        )}
                        {(data.vendedores[0].persona_fisica?.rfc || data.vendedores[0].persona_moral?.rfc) && (
                          <div><span className="font-medium">RFC:</span> {data.vendedores[0].persona_fisica?.rfc || data.vendedores[0].persona_moral?.rfc}</div>
                        )}
                        {data.vendedores[0].persona_fisica?.curp && (
                          <div><span className="font-medium">CURP:</span> {data.vendedores[0].persona_fisica.curp}</div>
                        )}
                        {data.vendedores[0].tiene_credito !== null && (
                          <div><span className="font-medium">Crédito pendiente:</span> {data.vendedores[0].tiene_credito ? 'Sí' : 'No'}</div>
                        )}
                      </>
                    )}
                    {(!data.vendedores || data.vendedores.length === 0 || (!data.vendedores[0].persona_fisica?.nombre && !data.vendedores[0].persona_moral?.denominacion_social)) && (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 4 – COMPRADOR(ES) (CONSOLIDADO CON EXPEDIENTE) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {serverState?.state_status?.ESTADO_4 === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <Users className="h-4 w-4" />
                      <span>PASO 4: Comprador(es)</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.compradores && data.compradores.length > 0 && (
                      <>
                        {data.compradores[0].persona_fisica?.nombre && (
                          <div><span className="font-medium">Nombre:</span> {data.compradores[0].persona_fisica.nombre}</div>
                        )}
                        {data.compradores[0].persona_moral?.denominacion_social && (
                          <div><span className="font-medium">Denominación Social:</span> {data.compradores[0].persona_moral.denominacion_social}</div>
                        )}
                        {(data.compradores[0].persona_fisica?.rfc || data.compradores[0].persona_moral?.rfc) && (
                          <div><span className="font-medium">RFC:</span> {data.compradores[0].persona_fisica?.rfc || data.compradores[0].persona_moral?.rfc}</div>
                        )}
                        {data.compradores[0].persona_fisica?.curp && (
                          <div><span className="font-medium">CURP:</span> {data.compradores[0].persona_fisica.curp}</div>
                        )}
                      </>
                    )}
                    {(!data.compradores || data.compradores.length === 0 || (!data.compradores[0].persona_fisica?.nombre && !data.compradores[0].persona_moral?.denominacion_social)) && (
                      <div className="text-gray-400 italic">Pendiente (requiere identificación oficial)</div>
                    )}
                  </div>
                </div>

                {/* PASO 5 – CRÉDITO DEL COMPRADOR (si aplica) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {serverState?.state_status?.ESTADO_5 === 'completed' || serverState?.state_status?.ESTADO_5 === 'not_applicable' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : serverState?.state_status?.ESTADO_5 === 'incomplete' ? (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <CreditCard className="h-4 w-4" />
                      <span>PASO 5: Crédito del Comprador</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.tipoOperacion ? (
                      data.creditos && data.creditos.length > 0 ? (
                        <>
                          {data.creditos.map((credito, idx) => (
                            <div key={idx} className="mb-2">
                              {credito.institucion && (
                                <div><span className="font-medium">Institución {data.creditos.length > 1 ? `(${idx + 1})` : ''}:</span> {credito.institucion}</div>
                              )}
                              {credito.monto && (
                                <div><span className="font-medium">Monto {data.creditos.length > 1 ? `(${idx + 1})` : ''}:</span> {credito.monto}</div>
                              )}
                              {!credito.institucion && (
                                <div className="text-yellow-600 italic">Información pendiente</div>
                              )}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="text-gray-500">No aplica (pago de contado)</div>
                      )
                    ) : (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 6 – CANCELACIÓN DE HIPOTECA (si existe) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {serverState?.state_status?.ESTADO_6 === 'completed' || serverState?.state_status?.ESTADO_6 === 'not_applicable' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : serverState?.state_status?.ESTADO_6 === 'incomplete' ? (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <FileCheck2 className="h-4 w-4" />
                      <span>PASO 6: Cancelación de Hipoteca</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.vendedores && data.vendedores.length > 0 && (
                      data.vendedores[0].tiene_credito !== null || data.vendedores[0].credito_vendedor
                    ) ? (
                      data.vendedores[0].tiene_credito === true ? (
                        <>
                          {data.vendedores[0].credito_vendedor?.institucion && (
                            <div><span className="font-medium">Institución:</span> {data.vendedores[0].credito_vendedor.institucion}</div>
                          )}
                          {data.vendedores[0].credito_vendedor?.numero_credito && (
                            <div><span className="font-medium">Número de crédito:</span> {data.vendedores[0].credito_vendedor.numero_credito}</div>
                          )}
                          {!data.vendedores[0].credito_vendedor?.institucion && (
                            <div className="text-yellow-600 italic">Pendiente confirmación</div>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-500">No aplica (sin hipoteca)</div>
                      )
                    ) : (
                      <div className="text-gray-400 italic">Pendiente (verificar en escritura)</div>
                    )}
                    {(!data.vendedores || data.vendedores.length === 0) && (
                      <div className="text-gray-400 italic">Pendiente (requiere información del vendedor)</div>
                    )}
                  </div>
                </div>

                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Panel de documentos debajo del chat y panel de información */}
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

      {/* Botón para mostrar panel si está oculto */}
      {!showDataPanel && (
        <Button
          variant="outline"
          size="icon"
          className="fixed right-6 top-1/2 -translate-y-1/2 z-10 shadow-lg"
          onClick={() => setShowDataPanel(true)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
