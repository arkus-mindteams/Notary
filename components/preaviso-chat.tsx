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
    unidad?: string
    modulo?: string
    condominio?: string
    conjuntoHabitacional?: string
    lote?: string
    manzana?: string
    fraccionamiento?: string
    colonia?: string
    tipoPredio?: string
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
  documentType?: string // Tipo detectado: 'escritura', 'plano', 'identificacion', etc.
}

interface PreavisoChatProps {
  onDataComplete: (data: PreavisoData) => void
  onGenerateDocument: (data: PreavisoData, uploadedDocuments?: UploadedDocument[], activeTramiteId?: string | null) => void
}

const INITIAL_MESSAGES = [
  "Buenos días. Bienvenido al sistema de Solicitud de Certificado con Efecto de Pre-Aviso de Compraventa.",
  "Para comenzar, ¿tienes la hoja de inscripción del inmueble? Necesito folio real, sección y partida. Si no la tienes, puedo capturar los datos manualmente."
]

export function PreavisoChat({ onDataComplete, onGenerateDocument }: PreavisoChatProps) {
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
  const [isCheckingDraft, setIsCheckingDraft] = useState(true)
  const checkingDraftRef = useRef(false) // Ref para evitar llamadas duplicadas
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
      necesitaCredito: false // Se actualizará cuando se capture
    },
    inmueble: {
      direccion: '',
      folioReal: '',
      seccion: '',
      partida: '',
      superficie: '',
      valor: '',
      unidad: '',
      modulo: '',
      condominio: '',
      conjuntoHabitacional: '',
      lote: '',
      manzana: '',
      fraccionamiento: '',
      colonia: '',
      tipoPredio: ''
    },
    actosNotariales: {
      cancelacionCreditoVendedor: false,
      compraventa: false,
      aperturaCreditoComprador: false
    },
    documentos: []
  })

  // Verificar si hay trámite guardado al iniciar
  useEffect(() => {
    let mounted = true

    const checkDraftTramite = async () => {
      // Evitar llamadas duplicadas
      if (checkingDraftRef.current) {
        return
      }

      if (!user?.id) {
        if (mounted) {
          setIsCheckingDraft(false)
        }
        return
      }

      checkingDraftRef.current = true

      try {
        // Obtener token de la sesión para autenticación
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = {}
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }
        
        const response = await fetch(`/api/expedientes/tramites/active-draft?userId=${user.id}&tipo=preaviso`, {
          headers
        })
        
        if (!mounted) {
          checkingDraftRef.current = false
          return
        }
        
        if (response.ok) {
          const tramite = await response.json()
          
          if (mounted) {
            setActiveTramiteId(tramite.id)
            
            // Cargar datos guardados
            if (tramite.datos) {
              const savedData = tramite.datos as any
              
              // Normalizar datos para asegurar que todos los campos string sean realmente strings
              setData(prev => {
                const normalizedData: PreavisoData = {
                  tipoOperacion: savedData.tipoOperacion || null,
                  vendedor: {
                    nombre: typeof savedData.vendedor?.nombre === 'string' ? savedData.vendedor.nombre : String(savedData.vendedor?.nombre || ''),
                    rfc: typeof savedData.vendedor?.rfc === 'string' ? savedData.vendedor.rfc : String(savedData.vendedor?.rfc || ''),
                    curp: typeof savedData.vendedor?.curp === 'string' ? savedData.vendedor.curp : String(savedData.vendedor?.curp || ''),
                    tieneCredito: savedData.vendedor?.tieneCredito || false,
                    institucionCredito: typeof savedData.vendedor?.institucionCredito === 'string' ? savedData.vendedor.institucionCredito : (savedData.vendedor?.institucionCredito ? String(savedData.vendedor.institucionCredito) : undefined),
                    numeroCredito: typeof savedData.vendedor?.numeroCredito === 'string' ? savedData.vendedor.numeroCredito : (savedData.vendedor?.numeroCredito ? String(savedData.vendedor.numeroCredito) : undefined)
                  },
                  comprador: {
                    nombre: typeof savedData.comprador?.nombre === 'string' ? savedData.comprador.nombre : String(savedData.comprador?.nombre || ''),
                    rfc: typeof savedData.comprador?.rfc === 'string' ? savedData.comprador.rfc : String(savedData.comprador.rfc || ''),
                    curp: typeof savedData.comprador?.curp === 'string' ? savedData.comprador.curp : String(savedData.comprador?.curp || ''),
                    necesitaCredito: savedData.comprador?.necesitaCredito ?? false,
                    institucionCredito: typeof savedData.comprador?.institucionCredito === 'string' ? savedData.comprador.institucionCredito : (savedData.comprador?.institucionCredito ? String(savedData.comprador.institucionCredito) : undefined),
                    montoCredito: typeof savedData.comprador?.montoCredito === 'string' ? savedData.comprador.montoCredito : (savedData.comprador?.montoCredito ? String(savedData.comprador.montoCredito) : undefined)
                  },
                  inmueble: {
                    direccion: typeof savedData.inmueble?.direccion === 'string' ? savedData.inmueble.direccion : String(savedData.inmueble?.direccion || ''),
                    folioReal: typeof savedData.inmueble?.folioReal === 'string' ? savedData.inmueble.folioReal : String(savedData.inmueble?.folioReal || ''),
                    seccion: typeof savedData.inmueble?.seccion === 'string' ? savedData.inmueble.seccion : String(savedData.inmueble?.seccion || ''),
                    partida: typeof savedData.inmueble?.partida === 'string' ? savedData.inmueble.partida : String(savedData.inmueble?.partida || ''),
                    superficie: typeof savedData.inmueble?.superficie === 'string' ? savedData.inmueble.superficie : (savedData.inmueble?.superficie ? String(savedData.inmueble.superficie) : ''),
                    valor: typeof savedData.inmueble?.valor === 'string' ? savedData.inmueble.valor : (savedData.inmueble?.valor ? String(savedData.inmueble.valor) : ''),
                    unidad: typeof savedData.inmueble?.unidad === 'string' ? savedData.inmueble.unidad : (savedData.inmueble?.unidad ? String(savedData.inmueble.unidad) : ''),
                    modulo: typeof savedData.inmueble?.modulo === 'string' ? savedData.inmueble.modulo : (savedData.inmueble?.modulo ? String(savedData.inmueble.modulo) : ''),
                    condominio: typeof savedData.inmueble?.condominio === 'string' ? savedData.inmueble.condominio : (savedData.inmueble?.condominio ? String(savedData.inmueble.condominio) : ''),
                    conjuntoHabitacional: typeof savedData.inmueble?.conjuntoHabitacional === 'string' ? savedData.inmueble.conjuntoHabitacional : (savedData.inmueble?.conjuntoHabitacional ? String(savedData.inmueble.conjuntoHabitacional) : ''),
                    lote: typeof savedData.inmueble?.lote === 'string' ? savedData.inmueble.lote : (savedData.inmueble?.lote ? String(savedData.inmueble.lote) : ''),
                    manzana: typeof savedData.inmueble?.manzana === 'string' ? savedData.inmueble.manzana : (savedData.inmueble?.manzana ? String(savedData.inmueble.manzana) : ''),
                    fraccionamiento: typeof savedData.inmueble?.fraccionamiento === 'string' ? savedData.inmueble.fraccionamiento : (savedData.inmueble?.fraccionamiento ? String(savedData.inmueble.fraccionamiento) : ''),
                    colonia: typeof savedData.inmueble?.colonia === 'string' ? savedData.inmueble.colonia : (savedData.inmueble?.colonia ? String(savedData.inmueble.colonia) : ''),
                    tipoPredio: typeof savedData.inmueble?.tipoPredio === 'string' ? savedData.inmueble.tipoPredio : (savedData.inmueble?.tipoPredio ? String(savedData.inmueble.tipoPredio) : '')
                  },
                  actosNotariales: savedData.actosNotariales || prev.actosNotariales,
                  documentos: Array.isArray(savedData.documentos) ? savedData.documentos : []
                }
                return normalizedData
              })
            }

            // Cargar documentos guardados
            if (tramite.documentos && Array.isArray(tramite.documentos) && tramite.documentos.length > 0) {
              // Crear objetos UploadedDocument virtuales para documentos ya procesados
              const savedDocs: UploadedDocument[] = tramite.documentos.map((doc: any) => {
                // Crear un File virtual (blob vacío) para documentos ya guardados
                const virtualFile = new File([], doc.nombre, { type: doc.mime_type || 'application/pdf' })
                
                // Mapear tipo de documento de BD a tipo esperado por la IA
                let docType = 'escritura'
                const dbType = doc.tipo?.toLowerCase() || ''
                const name = doc.nombre.toLowerCase()
                
                // Si el tipo en BD es específico, usarlo
                if (dbType === 'ine_vendedor' || dbType === 'ine_comprador' || 
                    name.includes('ine') || name.includes('ife') || name.includes('identificacion') || name.includes('pasaporte')) {
                  docType = 'identificacion'
                } else if (dbType === 'plano' || dbType === 'plano_arquitectonico' || dbType === 'croquis_catastral' ||
                           name.includes('plano') || name.includes('croquis') || name.includes('catastral')) {
                  docType = 'plano'
                } else if (dbType === 'escritura' || name.includes('escritura') || name.includes('titulo') || 
                           name.includes('propiedad') || name.includes('inscripcion') || name.includes('hoja')) {
                  docType = 'escritura'
                }

                return {
                  id: doc.id,
                  file: virtualFile,
                  name: doc.nombre,
                  type: doc.mime_type || 'application/pdf',
                  size: doc.tamaño || 0,
                  processed: true, // Ya están procesados
                  extractedData: doc.metadata || null, // Usar metadata como extractedData
                  documentType: docType
                }
              })
              
              setUploadedDocuments(savedDocs)
            }

            // Agregar mensaje de la IA preguntando si continuar
            const continueMessage: ChatMessage = {
              id: generateMessageId('draft-detected'),
              role: 'assistant',
              content: `He detectado que tienes un pre-aviso en progreso guardado. ¿Deseas continuar con ese trámite o prefieres iniciar uno nuevo? Responde "continuar" o "nuevo".`,
              timestamp: new Date()
            }
            setMessages([continueMessage])
          }
        } else {
          // No hay trámite guardado, enviar mensajes iniciales normales
          if (mounted) {
            sendInitialMessages()
          }
        }
      } catch (error) {
        console.error('Error verificando trámite guardado:', error)
        if (mounted) {
          sendInitialMessages()
        }
      } finally {
        if (mounted) {
          setIsCheckingDraft(false)
        }
        checkingDraftRef.current = false
      }
    }

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

    checkDraftTramite()

    return () => {
      mounted = false
      checkingDraftRef.current = false
    }
  }, [user?.id])

  // Guardar progreso automáticamente cuando cambian los datos
  useEffect(() => {
    const saveProgress = async () => {
      // Solo guardar si hay datos significativos y hay un trámite activo o usuario
      if (!user?.id || (!data.vendedor.nombre && !data.inmueble.direccion && !data.comprador.nombre)) {
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
  const [isProcessingDocument, setIsProcessingDocument] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingFileName, setProcessingFileName] = useState<string | null>(null)
  const [showDataPanel, setShowDataPanel] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  // Verificar si todos los datos críticos están completos
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

  // Calcular progreso basado en datos completados (9 pasos: PASO 1-9)
  const getProgress = () => {
    let completed = 0
    let total = 9

    // PASO 1: Expediente (comprador)
    if (data.comprador.nombre) completed++
    
    // PASO 2: Operación y Forma de Pago
    if (data.tipoOperacion && (data.comprador.institucionCredito || data.comprador.necesitaCredito === false)) completed++
    
    // PASO 3: Inmueble y Registro
    if (data.inmueble.folioReal && data.inmueble.seccion && data.inmueble.partida) completed++
    
    // PASO 4: Vendedor(es)
    if (data.vendedor.nombre && data.vendedor.rfc && data.vendedor.curp) completed++
    
    // PASO 5: Comprador(es)
    if (data.comprador.nombre && data.comprador.rfc && data.comprador.curp) completed++
    
    // PASO 6: Crédito del Comprador (si aplica)
    if (data.tipoOperacion) {
      if (data.comprador.necesitaCredito) {
        // Si necesita crédito, debe tener institución y monto
        if (data.comprador.institucionCredito && data.comprador.montoCredito) completed++
      } else if (data.comprador.necesitaCredito === false) {
        // Si no necesita crédito (pago de contado), el paso está completo
        completed++
      }
    }
    
    // PASO 7: Cancelación de Hipoteca (si aplica)
    if (data.vendedor.nombre) {
      if (data.vendedor.tieneCredito !== undefined || data.vendedor.institucionCredito) {
        // Si tiene crédito, debe tener institución y número
        if (data.vendedor.tieneCredito) {
          if (data.vendedor.institucionCredito && data.vendedor.numeroCredito) completed++
        } else {
          // Si no tiene crédito, el paso está completo
          completed++
        }
      }
    }
    
    // PASO 8: Objeto del Acto
    if (data.inmueble.direccion && data.inmueble.superficie && data.inmueble.valor) completed++
    
    // PASO 9: Revisión Final (se considera completo cuando todos los datos críticos están presentes)
    if (isDataComplete(data)) completed++

    return { completed, total, percentage: Math.round((completed / total) * 100) }
  }

  const progress = getProgress()

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

    // Manejar respuesta de continuar/nuevo trámite
    const lowerInput = currentInput.toLowerCase().trim()
    if (lowerInput === 'continuar' || lowerInput === 'seguir' || lowerInput === 'sí' || lowerInput === 'si') {
      if (activeTramiteId) {
        const continueMessage: ChatMessage = {
          id: generateMessageId('continue'),
          role: 'assistant',
          content: 'Perfecto, continuemos con tu trámite guardado. ¿Qué información necesitas agregar o modificar?',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, continueMessage])
        setIsProcessing(false)
        return
      }
    } else if (lowerInput === 'nuevo' || lowerInput === 'nuevo trámite' || lowerInput === 'empezar nuevo') {
      // Crear nuevo trámite
      if (user?.id) {
        try {
          // Obtener token de la sesión
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
                tipoOperacion: null,
                vendedor: { nombre: '', rfc: '', curp: '', tieneCredito: false },
                comprador: { nombre: '', rfc: '', curp: '', necesitaCredito: false },
                inmueble: { direccion: '', folioReal: '', seccion: '', partida: '', superficie: '', valor: '', unidad: '', modulo: '', condominio: '', conjuntoHabitacional: '', lote: '', manzana: '', fraccionamiento: '', colonia: '', tipoPredio: '' },
                actosNotariales: { cancelacionCreditoVendedor: false, compraventa: false, aperturaCreditoComprador: false }
              },
              estado: 'en_proceso',
            }),
          })

          if (response.ok) {
            const tramite = await response.json()
            setActiveTramiteId(tramite.id)
            setData({
              tipoOperacion: null,
              vendedor: { nombre: '', rfc: '', curp: '', tieneCredito: false },
              comprador: { nombre: '', rfc: '', curp: '', necesitaCredito: false },
              inmueble: { direccion: '', folioReal: '', seccion: '', partida: '', superficie: '', valor: '' },
              actosNotariales: { cancelacionCreditoVendedor: false, compraventa: false, aperturaCreditoComprador: false },
              documentos: []
            })
          }
        } catch (error) {
          console.error('Error creando nuevo trámite:', error)
        }
      }

      // Enviar mensajes iniciales
      for (let i = 0; i < INITIAL_MESSAGES.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 400))
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
      setIsProcessing(false)
      return
    }

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
            documentos: data.documentos,
            documentosProcesados: uploadedDocuments
              .filter(d => d.processed && d.extractedData)
              .map(d => ({
                nombre: d.name,
                tipo: d.documentType || 'desconocido',
                informacionExtraida: d.extractedData
              })),
            hasDraftTramite: !!activeTramiteId
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const result = await response.json()
      const messagesToAdd = result.messages || [result.message]
      
      // Agregar mensajes con delay para efecto conversacional
      for (let i = 0; i < messagesToAdd.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 300)) // 300ms entre mensajes
        const assistantMessage: ChatMessage = {
          id: generateMessageId('ai'),
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
      // Procesar todos los mensajes de la IA para extraer información
      const allAIMessages = messagesToAdd.join('\n\n')
      const extractedData = extractDataFromMessage(allAIMessages, currentInput, data)
      if (extractedData) {
        setData(prevData => {
          const newData = { ...prevData }
          
          // Actualizar tipoOperacion
          if (extractedData.tipoOperacion !== undefined) {
            newData.tipoOperacion = extractedData.tipoOperacion
          }
          
          // Actualizar comprador (merge profundo)
          if (extractedData.comprador) {
            newData.comprador = { ...prevData.comprador, ...extractedData.comprador }
          }
          
          // Actualizar vendedor (merge profundo)
          if (extractedData.vendedor) {
            newData.vendedor = { ...prevData.vendedor, ...extractedData.vendedor }
          }
          
          // Actualizar inmueble (merge profundo)
          if (extractedData.inmueble) {
            newData.inmueble = { ...prevData.inmueble, ...extractedData.inmueble }
          }
          
          // Determinar actos notariales
          const actos = determineActosNotariales(newData)
          newData.actosNotariales = actos
          
          // Verificar si está completo
          if (isDataComplete(newData)) {
            onDataComplete(newData)
            // Llamar a onGenerateDocument con los documentos subidos y el trámite activo
            onGenerateDocument(newData, uploadedDocuments.filter(d => d.processed), activeTramiteId)
          }
          
          return newData
        })
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
                ? { ...d, processed: true, extractedData: processResult.extractedData, documentType: docType }
                : d
            ))

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
                  // Campos adicionales del inmueble
                  if (extracted.unidad) updated.inmueble.unidad = extracted.unidad
                  if (extracted.modulo) updated.inmueble.modulo = extracted.modulo
                  if (extracted.condominio) updated.inmueble.condominio = extracted.condominio
                  if (extracted.conjuntoHabitacional) updated.inmueble.conjuntoHabitacional = extracted.conjuntoHabitacional
                  if (extracted.lote) updated.inmueble.lote = extracted.lote
                  if (extracted.manzana) updated.inmueble.manzana = extracted.manzana
                  if (extracted.fraccionamiento) updated.inmueble.fraccionamiento = extracted.fraccionamiento
                  if (extracted.colonia) updated.inmueble.colonia = extracted.colonia
                  if (extracted.tipoPredio) updated.inmueble.tipoPredio = extracted.tipoPredio
                } else if (docType === 'plano') {
                  if (extracted.superficie) updated.inmueble.superficie = extracted.superficie
                } else if (docType === 'identificacion') {
                  // Para identificaciones, intentar determinar si es vendedor o comprador
                  // basándose en el contexto (qué datos faltan) o el campo 'tipo' extraído
                  const isVendedor = extracted.tipo === 'vendedor' || (!data.vendedor.nombre && data.comprador.nombre)
                  const isComprador = extracted.tipo === 'comprador' || (!data.comprador.nombre && data.vendedor.nombre)
                  
                  // Si no se puede determinar, usar el primero que falte (vendedor primero)
                  const targetPerson = isVendedor ? 'vendedor' : (isComprador ? 'comprador' : (!data.vendedor.nombre ? 'vendedor' : 'comprador'))
                  
                  if (extracted.nombre) {
                    if (targetPerson === 'vendedor') {
                      updated.vendedor.nombre = extracted.nombre
                      if (extracted.rfc) updated.vendedor.rfc = extracted.rfc
                      if (extracted.curp) updated.vendedor.curp = extracted.curp
                    } else {
                      updated.comprador.nombre = extracted.nombre
                      if (extracted.rfc) updated.comprador.rfc = extracted.rfc
                      if (extracted.curp) updated.comprador.curp = extracted.curp
                    }
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
      
      // Recopilar información extraída de los documentos procesados
      const processedDocsInfo = uploadedDocuments
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
              content: processedDocsInfo 
                ? `He subido ${fileNames.length} documento(s) y he procesado la información extraída automáticamente:\n\n${processedDocsInfo}\n\n¿Cuál es el siguiente paso?`
                : `He subido ${fileNames.length} documento(s). ¿Cuál es el siguiente paso?`
            }
          ],
          context: {
            vendedor: data.vendedor.nombre ? data.vendedor : undefined,
            comprador: data.comprador.nombre ? data.comprador : undefined,
            inmueble: data.inmueble.direccion ? data.inmueble : undefined,
            documentos: newDocuments,
            documentosProcesados: uploadedDocuments
              .filter(d => d.processed && d.extractedData)
              .map(d => ({
                nombre: d.name,
                tipo: d.documentType || 'desconocido',
                informacionExtraida: d.extractedData
              })),
            hasDraftTramite: !!activeTramiteId
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
    const updates: Partial<PreavisoData> = {}
    let hasUpdates = false

    // Intentar extraer JSON estructurado del mensaje de la IA
    const dataUpdateMatch = aiMessage.match(/<DATA_UPDATE>([\s\S]*?)<\/DATA_UPDATE>/)
    
    if (dataUpdateMatch) {
      try {
        const jsonData = JSON.parse(dataUpdateMatch[1].trim())
        
        // Actualizar tipoOperacion
        if (jsonData.tipoOperacion !== undefined && jsonData.tipoOperacion !== null) {
          updates.tipoOperacion = jsonData.tipoOperacion
          hasUpdates = true
        }

        // Actualizar comprador
        if (jsonData.comprador) {
          const compradorUpdates: Partial<PreavisoData['comprador']> = {}
          if (jsonData.comprador.nombre !== undefined && jsonData.comprador.nombre !== null) {
            compradorUpdates.nombre = jsonData.comprador.nombre
            hasUpdates = true
          }
          if (jsonData.comprador.rfc !== undefined && jsonData.comprador.rfc !== null) {
            compradorUpdates.rfc = jsonData.comprador.rfc
            hasUpdates = true
          }
          if (jsonData.comprador.curp !== undefined && jsonData.comprador.curp !== null) {
            compradorUpdates.curp = jsonData.comprador.curp
            hasUpdates = true
          }
          if (jsonData.comprador.necesitaCredito !== undefined && jsonData.comprador.necesitaCredito !== null) {
            compradorUpdates.necesitaCredito = jsonData.comprador.necesitaCredito
            hasUpdates = true
          }
          if (jsonData.comprador.institucionCredito !== undefined && jsonData.comprador.institucionCredito !== null) {
            compradorUpdates.institucionCredito = jsonData.comprador.institucionCredito
            hasUpdates = true
          }
          if (jsonData.comprador.montoCredito !== undefined && jsonData.comprador.montoCredito !== null) {
            compradorUpdates.montoCredito = jsonData.comprador.montoCredito
            hasUpdates = true
          }
          if (Object.keys(compradorUpdates).length > 0) {
            updates.comprador = { ...currentData.comprador, ...compradorUpdates }
          }
        }

        // Actualizar vendedor
        if (jsonData.vendedor) {
          const vendedorUpdates: Partial<PreavisoData['vendedor']> = {}
          if (jsonData.vendedor.nombre !== undefined && jsonData.vendedor.nombre !== null) {
            vendedorUpdates.nombre = jsonData.vendedor.nombre
            hasUpdates = true
          }
          if (jsonData.vendedor.rfc !== undefined && jsonData.vendedor.rfc !== null) {
            vendedorUpdates.rfc = jsonData.vendedor.rfc
            hasUpdates = true
          }
          if (jsonData.vendedor.curp !== undefined && jsonData.vendedor.curp !== null) {
            vendedorUpdates.curp = jsonData.vendedor.curp
            hasUpdates = true
          }
          if (jsonData.vendedor.tieneCredito !== undefined && jsonData.vendedor.tieneCredito !== null) {
            vendedorUpdates.tieneCredito = jsonData.vendedor.tieneCredito
            hasUpdates = true
          }
          if (jsonData.vendedor.institucionCredito !== undefined && jsonData.vendedor.institucionCredito !== null) {
            vendedorUpdates.institucionCredito = jsonData.vendedor.institucionCredito
            hasUpdates = true
          }
          if (jsonData.vendedor.numeroCredito !== undefined && jsonData.vendedor.numeroCredito !== null) {
            vendedorUpdates.numeroCredito = jsonData.vendedor.numeroCredito
            hasUpdates = true
          }
          if (Object.keys(vendedorUpdates).length > 0) {
            updates.vendedor = { ...currentData.vendedor, ...vendedorUpdates }
          }
        }

        // Actualizar inmueble
        if (jsonData.inmueble) {
          const inmuebleUpdates: Partial<PreavisoData['inmueble']> = {}
          if (jsonData.inmueble.direccion !== undefined && jsonData.inmueble.direccion !== null) {
            inmuebleUpdates.direccion = jsonData.inmueble.direccion
            hasUpdates = true
          }
          if (jsonData.inmueble.folioReal !== undefined && jsonData.inmueble.folioReal !== null) {
            inmuebleUpdates.folioReal = jsonData.inmueble.folioReal
            hasUpdates = true
          }
          if (jsonData.inmueble.seccion !== undefined && jsonData.inmueble.seccion !== null) {
            inmuebleUpdates.seccion = jsonData.inmueble.seccion
            hasUpdates = true
          }
          if (jsonData.inmueble.partida !== undefined && jsonData.inmueble.partida !== null) {
            inmuebleUpdates.partida = jsonData.inmueble.partida
            hasUpdates = true
          }
          if (jsonData.inmueble.superficie !== undefined && jsonData.inmueble.superficie !== null) {
            // Asegurar que superficie sea un string, no un objeto
            inmuebleUpdates.superficie = typeof jsonData.inmueble.superficie === 'string' 
              ? jsonData.inmueble.superficie 
              : String(jsonData.inmueble.superficie)
            hasUpdates = true
          }
          if (jsonData.inmueble.valor !== undefined && jsonData.inmueble.valor !== null) {
            // Asegurar que valor sea un string, no un objeto
            inmuebleUpdates.valor = typeof jsonData.inmueble.valor === 'string' 
              ? jsonData.inmueble.valor 
              : String(jsonData.inmueble.valor)
            hasUpdates = true
          }
          if (jsonData.inmueble.unidad !== undefined && jsonData.inmueble.unidad !== null) {
            inmuebleUpdates.unidad = jsonData.inmueble.unidad
            hasUpdates = true
          }
          if (jsonData.inmueble.modulo !== undefined && jsonData.inmueble.modulo !== null) {
            inmuebleUpdates.modulo = jsonData.inmueble.modulo
            hasUpdates = true
          }
          if (jsonData.inmueble.condominio !== undefined && jsonData.inmueble.condominio !== null) {
            inmuebleUpdates.condominio = jsonData.inmueble.condominio
            hasUpdates = true
          }
          if (jsonData.inmueble.conjuntoHabitacional !== undefined && jsonData.inmueble.conjuntoHabitacional !== null) {
            inmuebleUpdates.conjuntoHabitacional = jsonData.inmueble.conjuntoHabitacional
            hasUpdates = true
          }
          if (jsonData.inmueble.lote !== undefined && jsonData.inmueble.lote !== null) {
            inmuebleUpdates.lote = jsonData.inmueble.lote
            hasUpdates = true
          }
          if (jsonData.inmueble.manzana !== undefined && jsonData.inmueble.manzana !== null) {
            inmuebleUpdates.manzana = jsonData.inmueble.manzana
            hasUpdates = true
          }
          if (jsonData.inmueble.fraccionamiento !== undefined && jsonData.inmueble.fraccionamiento !== null) {
            inmuebleUpdates.fraccionamiento = jsonData.inmueble.fraccionamiento
            hasUpdates = true
          }
          if (jsonData.inmueble.colonia !== undefined && jsonData.inmueble.colonia !== null) {
            inmuebleUpdates.colonia = jsonData.inmueble.colonia
            hasUpdates = true
          }
          if (Object.keys(inmuebleUpdates).length > 0) {
            updates.inmueble = { ...currentData.inmueble, ...inmuebleUpdates }
          }
        }

      } catch (error) {
        console.error('Error parseando JSON de actualización de datos:', error)
        // Si falla el parseo, continuar con métodos de fallback
      }
    }

    // Fallback: Detectar información básica usando patrones simples si no hay JSON
    if (!hasUpdates) {
      // Detectar tipo de operación
      const operacionMatch = userInput.match(/(?:operación|tipo)[:\s]+(compraventa|compra-venta)/i)
      if (operacionMatch && !currentData.tipoOperacion) {
        updates.tipoOperacion = 'compraventa'
        hasUpdates = true
      }

      // Detectar forma de pago
      const contadoMatch = userInput.match(/(?:pago|pagar|forma de pago)[:\s]+(?:de\s+)?contado/i)
      const creditoMatch = userInput.match(/(?:pago|pagar|forma de pago|crédito|hipoteca)[:\s]+(?:mediante\s+)?(?:crédito|hipoteca)/i)
      
      if (contadoMatch && currentData.comprador.necesitaCredito === false) {
        // Ya está en false, no actualizar
      } else if (contadoMatch) {
        if (!updates.comprador) updates.comprador = { ...currentData.comprador }
        updates.comprador.necesitaCredito = false
        hasUpdates = true
      } else if (creditoMatch) {
        if (!updates.comprador) updates.comprador = { ...currentData.comprador }
        updates.comprador.necesitaCredito = true
        hasUpdates = true
      }

      // Detectar nombres (patrones comunes)
      const nombrePattern = /(?:nombre|vendedor|comprador)[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/gi
      const nombres = [...userInput.matchAll(nombrePattern)]
      
      // Detectar RFC
      const rfcPattern = /RFC[:\s]+([A-Z]{3,4}\d{6}[A-Z0-9]{3})/gi
      const rfcMatch = userInput.match(rfcPattern)
      
      // Detectar CURP
      const curpPattern = /CURP[:\s]+([A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d)/gi
      const curpMatch = userInput.match(curpPattern)

      // Actualizar datos si se encuentran
      if (nombres.length > 0 && !currentData.vendedor.nombre) {
        if (!updates.vendedor) updates.vendedor = { ...currentData.vendedor }
        updates.vendedor.nombre = nombres[0][1]
        hasUpdates = true
      }

      if (rfcMatch && !currentData.vendedor.rfc) {
        if (!updates.vendedor) updates.vendedor = { ...currentData.vendedor }
        updates.vendedor.rfc = rfcMatch[1]
        hasUpdates = true
      }

      if (curpMatch && !currentData.vendedor.curp) {
        if (!updates.vendedor) updates.vendedor = { ...currentData.vendedor }
        updates.vendedor.curp = curpMatch[1]
        hasUpdates = true
      }
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

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
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
                {/* PASO 1 – EXPEDIENTE */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.comprador.nombre ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <FolderOpen className="h-4 w-4" />
                      <span>PASO 1: Expediente</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.comprador.nombre ? (
                      <div><span className="font-medium">Comprador:</span> {data.comprador.nombre}</div>
                    ) : (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 2 – OPERACIÓN Y FORMA DE PAGO */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.tipoOperacion && (data.comprador.institucionCredito || (data.comprador.necesitaCredito === false && data.tipoOperacion)) ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <CreditCard className="h-4 w-4" />
                      <span>PASO 2: Operación y Forma de Pago</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.tipoOperacion ? (
                      <>
                        <div><span className="font-medium">Tipo de operación:</span> {data.tipoOperacion}</div>
                        {data.comprador.institucionCredito || (data.comprador.necesitaCredito === false && data.tipoOperacion) ? (
                          <div><span className="font-medium">Forma de pago:</span> {data.comprador.necesitaCredito ? 'Crédito' : 'Contado'}</div>
                        ) : (
                          <div className="text-gray-400 italic">Forma de pago: Pendiente</div>
                        )}
                      </>
                    ) : (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 3 – INMUEBLE Y REGISTRO */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.inmueble.folioReal && data.inmueble.seccion && data.inmueble.partida ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <Building2 className="h-4 w-4" />
                      <span>PASO 3: Inmueble y Registro</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.inmueble.folioReal && (
                      <div><span className="font-medium">Folio Real:</span> {data.inmueble.folioReal}</div>
                    )}
                    {data.inmueble.partida && (
                      <div><span className="font-medium">Partida(s):</span> {data.inmueble.partida}</div>
                    )}
                    {data.inmueble.seccion && (
                      <div><span className="font-medium">Sección:</span> {data.inmueble.seccion}</div>
                    )}
                    {data.inmueble.direccion && (
                      <div><span className="font-medium">Ubicación:</span> {data.inmueble.direccion}</div>
                    )}
                    {!data.inmueble.folioReal && !data.inmueble.partida && (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 4 – VENDEDOR(ES) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.vendedor.nombre && data.vendedor.rfc && data.vendedor.curp ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <UserCircle className="h-4 w-4" />
                      <span>PASO 4: Vendedor(es)</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.vendedor.nombre && (
                      <div><span className="font-medium">Nombre:</span> {data.vendedor.nombre}</div>
                    )}
                    {data.vendedor.rfc && (
                      <div><span className="font-medium">RFC:</span> {data.vendedor.rfc}</div>
                    )}
                    {data.vendedor.curp && (
                      <div><span className="font-medium">CURP:</span> {data.vendedor.curp}</div>
                    )}
                    {data.vendedor.tieneCredito !== undefined && (
                      <div><span className="font-medium">Crédito pendiente:</span> {data.vendedor.tieneCredito ? 'Sí' : 'No'}</div>
                    )}
                    {!data.vendedor.nombre && !data.vendedor.rfc && (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 5 – COMPRADOR(ES) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.comprador.nombre && data.comprador.rfc && data.comprador.curp ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <Users className="h-4 w-4" />
                      <span>PASO 5: Comprador(es)</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.comprador.nombre && (
                      <div><span className="font-medium">Nombre:</span> {data.comprador.nombre}</div>
                    )}
                    {data.comprador.rfc && (
                      <div><span className="font-medium">RFC:</span> {data.comprador.rfc}</div>
                    )}
                    {data.comprador.curp && (
                      <div><span className="font-medium">CURP:</span> {data.comprador.curp}</div>
                    )}
                    {!data.comprador.nombre && !data.comprador.rfc && (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 6 – CRÉDITO DEL COMPRADOR (si aplica) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.tipoOperacion && (data.comprador.institucionCredito || data.comprador.necesitaCredito === false) ? (
                      data.comprador.necesitaCredito && data.comprador.institucionCredito && data.comprador.montoCredito ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : data.comprador.necesitaCredito ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-gray-400" />
                      )
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <CreditCard className="h-4 w-4" />
                      <span>PASO 6: Crédito del Comprador</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.tipoOperacion ? (
                      data.comprador.institucionCredito || data.comprador.necesitaCredito === false ? (
                        data.comprador.necesitaCredito ? (
                          <>
                            {data.comprador.institucionCredito && (
                              <div><span className="font-medium">Institución:</span> {data.comprador.institucionCredito}</div>
                            )}
                            {data.comprador.montoCredito && (
                              <div><span className="font-medium">Monto:</span> {data.comprador.montoCredito}</div>
                            )}
                            {!data.comprador.institucionCredito && (
                              <div className="text-yellow-600 italic">Información pendiente</div>
                            )}
                          </>
                        ) : (
                          <div className="text-gray-500">No aplica (pago de contado)</div>
                        )
                      ) : (
                        <div className="text-gray-400 italic">Pendiente (definir forma de pago primero)</div>
                      )
                    ) : (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 7 – CANCELACIÓN DE HIPOTECA (si existe) */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.vendedor.nombre && (data.vendedor.tieneCredito !== undefined || data.vendedor.institucionCredito) ? (
                      data.vendedor.tieneCredito ? (
                        data.vendedor.institucionCredito && data.vendedor.numeroCredito ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        )
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-gray-400" />
                      )
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <FileCheck2 className="h-4 w-4" />
                      <span>PASO 7: Cancelación de Hipoteca</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.vendedor.nombre ? (
                      data.vendedor.tieneCredito !== undefined || data.vendedor.institucionCredito ? (
                        data.vendedor.tieneCredito ? (
                          <>
                            {data.vendedor.institucionCredito && (
                              <div><span className="font-medium">Institución:</span> {data.vendedor.institucionCredito}</div>
                            )}
                            {data.vendedor.numeroCredito && (
                              <div><span className="font-medium">Número de crédito:</span> {data.vendedor.numeroCredito}</div>
                            )}
                            {!data.vendedor.institucionCredito && (
                              <div className="text-yellow-600 italic">Pendiente confirmación</div>
                            )}
                          </>
                        ) : (
                          <div className="text-gray-500">No aplica (sin hipoteca)</div>
                        )
                      ) : (
                        <div className="text-gray-400 italic">Pendiente (verificar en escritura)</div>
                      )
                    ) : (
                      <div className="text-gray-400 italic">Pendiente (requiere información del vendedor)</div>
                    )}
                  </div>
                </div>

                {/* PASO 8 – OBJETO DEL ACTO */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    {data.inmueble.direccion && data.inmueble.superficie && data.inmueble.valor ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <FileText className="h-4 w-4" />
                      <span>PASO 8: Objeto del Acto</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    {data.inmueble.direccion && (
                      <div><span className="font-medium">Ubicación:</span> {data.inmueble.direccion}</div>
                    )}
                    {data.inmueble.superficie && (
                      <div><span className="font-medium">Superficie:</span> {typeof data.inmueble.superficie === 'string' ? data.inmueble.superficie : String(data.inmueble.superficie)}</div>
                    )}
                    {data.inmueble.valor && (
                      <div><span className="font-medium">Valor:</span> ${typeof data.inmueble.valor === 'string' ? data.inmueble.valor : String(data.inmueble.valor)}</div>
                    )}
                    {!data.inmueble.direccion && !data.inmueble.superficie && (
                      <div className="text-gray-400 italic">Pendiente</div>
                    )}
                  </div>
                </div>

                {/* PASO 9 – REVISIÓN FINAL */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                    <h4 className="font-medium text-sm text-gray-900 flex items-center space-x-1">
                      <FileCheck2 className="h-4 w-4" />
                      <span>PASO 9: Revisión Final</span>
                    </h4>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-600">
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <div className="font-medium mb-1">Actos determinados:</div>
                      <div className="space-y-0.5">
                        {data.actosNotariales.compraventa && (
                          <div className="text-green-600">✓ Compraventa</div>
                        )}
                        {data.actosNotariales.cancelacionCreditoVendedor && (
                          <div className="text-blue-600">✓ Cancelación crédito vendedor</div>
                        )}
                        {data.actosNotariales.aperturaCreditoComprador && (
                          <div className="text-purple-600">✓ Apertura crédito comprador</div>
                        )}
                        {!data.actosNotariales.compraventa && (
                          <div className="text-gray-400 italic">Pendiente determinación</div>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-400 italic mt-2">Pendiente confirmación final</div>
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
