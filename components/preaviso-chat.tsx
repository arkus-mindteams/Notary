"use client"

import { useState, useRef, useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  FolderOpen,
  MessageSquarePlus,
  ArrowUp,
  X,
  Square,
  Trash2
} from 'lucide-react'
import { PreavisoExportOptions } from './preaviso-export-options'
import { useIsMobile } from '@/hooks/use-mobile'
import { useIsTablet } from '@/hooks/use-tablet'
import type { Command, LastQuestionIntent } from '@/lib/tramites/base/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  ChatMessage,
  PersonaFisica,
  PersonaMoral,
  CompradorElement,
  VendedorElement,
  ParticipanteCredito,
  CreditoElement,
  GravamenElement,
  DireccionInmueble,
  DatosCatastrales,
  InmuebleV14,
  PreavisoData,
  ServerStateSnapshot,
  UploadedDocument
} from '@/lib/tramites/shared/types/preaviso-types'

import {
  stripDataUpdateBlocksForDisplay,
  toUserFacingAssistantText,
  determineActosNotariales,
  inferMarriageStatus
} from '@/lib/tramites/shared/utils/preaviso-data-utils'
import { ChatMessageItem } from './preaviso/chat-message-item'
import { DocumentSidebar } from './preaviso/document-sidebar'

interface PreavisoChatProps {
  onDataComplete: (data: PreavisoData) => void
  onGenerateDocument: (data: PreavisoData, uploadedDocuments?: UploadedDocument[], activeTramiteId?: string | null) => void
  onExportReady?: (data: PreavisoData, show: boolean) => void
  showExportButtons?: boolean
  exportData?: PreavisoData | null
  onViewFullDocument?: () => void
}

const INITIAL_MESSAGES = [
  "Buenos días. Bienvenido al sistema de Solicitud de Certificado con Efecto de Pre-Aviso de Compraventa.",
  "Para comenzar, ¿tienes la hoja de inscripción del inmueble? Necesito folio real, sección y partida. Si no la tienes, puedo capturar los datos manualmente."
]

// Componente para mostrar miniatura de imagen
function ImageThumbnail({ file, isProcessing = false, isProcessed = false, hasError = false, isCancelled = false }: {
  file: File
  isProcessing?: boolean
  isProcessed?: boolean
  hasError?: boolean
  isCancelled?: boolean
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setFileUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  if (!fileUrl) return null

  return (
    <>
      <div className="relative group">
        <img
          src={fileUrl}
          alt={file.name}
          className="h-20 w-20 object-cover rounded-lg border-2 border-gray-200 hover:border-blue-400 transition-all cursor-pointer shadow-sm"
          onClick={() => setIsDialogOpen(true)}
        />
        {/* Badge de estado */}
        {isProcessed ? (
          isCancelled ? (
            <div className="absolute top-1.5 right-1.5 bg-orange-500 rounded-full p-1 shadow-lg">
              <X className="h-2.5 w-2.5 text-white" />
            </div>
          ) : hasError ? (
            <div className="absolute top-1.5 right-1.5 bg-red-500 rounded-full p-1 shadow-lg">
              <AlertCircle className="h-2.5 w-2.5 text-white" />
            </div>
          ) : (
            <div className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-1 shadow-lg">
              <CheckCircle2 className="h-2.5 w-2.5 text-white" />
            </div>
          )
        ) : isProcessing ? (
          <div className="absolute top-1.5 right-1.5 bg-blue-500 rounded-full p-1 shadow-lg">
            <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
          </div>
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity truncate">
          {file.name}
        </div>
      </div>

      {/* Dialog para mostrar imagen en tamaño completo */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-transparent border-none">
          <DialogTitle className="sr-only">Vista previa de imagen: {file.name}</DialogTitle>
          <div className="relative w-full h-full flex items-center justify-center bg-black/90 rounded-lg">
            <img
              src={fileUrl}
              alt={file.name}
              className="max-w-full max-h-[95vh] object-contain"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
              onClick={() => setIsDialogOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="absolute bottom-4 left-4 right-4 bg-black/60 text-white text-sm px-3 py-2 rounded-lg">
              {file.name}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function PreavisoChat({
  onDataComplete,
  onGenerateDocument,
  onExportReady,
  showExportButtons = false,
  exportData = null,
  onViewFullDocument,
}: PreavisoChatProps) {
  const { user, session } = useAuth()
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const supabase = useMemo(() => createBrowserClient(), [])
  const messageIdCounterRef = useRef(0)
  const conversationIdRef = useRef<string | null>(null)
  const documentProcessCacheRef = useRef<Map<string, any>>(new Map())
  const getJobStorageKey = () => {
    const sessionId = conversationIdRef.current || 'no-session'
    return `preaviso:document-job:${sessionId}`
  }
  /** Para documentos ya en caché: siempre reprocesar (forceReprocess en backend) */
  const earlyAlreadyProcessedRef = useRef<{ choice: 'use' | 'reprocess'; fileNames: string[] } | null>(null)

  // Función helper para generar IDs únicos para mensajes
  const generateMessageId = (prefix: string = 'msg'): string => {
    messageIdCounterRef.current++
    return `${prefix}-${Date.now()}-${messageIdCounterRef.current}-${Math.random().toString(36).substr(2, 9)}`
  }
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [initialMessagesSent, setInitialMessagesSent] = useState(false)
  const initializationRef = useRef(false)
  const lastUserIdRef = useRef<string | null>(null)
  const isManualResetRef = useRef(false)
  const isSubmittingRef = useRef(false) // Lock para prevenir doble envío
  const [activeTramiteId, setActiveTramiteId] = useState<string | null>(null)
  const activeTramiteIdRef = useRef<string | null>(null)
  /** TramiteId recién creado en este batch; evita race donde processOne usa activeTramiteId aún null */
  const batchTramiteIdRef = useRef<string | null>(null)
  const withAuthHeaders = async (): Promise<HeadersInit> => {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (currentSession?.access_token) {
      headers['Authorization'] = `Bearer ${currentSession.access_token}`
    }
    return headers
  }

  const startDocumentJob = async (args: {
    totalDocs: number
    tramiteId?: string | null
    sessionId?: string | null
    metadata?: Record<string, any>
  }): Promise<string | null> => {
    try {
      const headers = await withAuthHeaders()
      const resp = await fetch('/api/ai/document-jobs/start', {
        method: 'POST',
        headers,
        body: JSON.stringify(args),
      })
      if (!resp.ok) return null
      const json = await resp.json()
      const jobId = String(json?.job?.id || '')
      if (!jobId) return null
      currentDocumentJobIdRef.current = jobId
      try { localStorage.setItem(getJobStorageKey(), jobId) } catch {}
      return jobId
    } catch {
      return null
    }
  }

  const updateDocumentJob = async (jobId: string | null, patch: Record<string, any>) => {
    if (!jobId) return
    try {
      const headers = await withAuthHeaders()
      await fetch(`/api/ai/document-jobs/${jobId}/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify(patch),
      })
    } catch {
      // ignore job progress errors
    }
  }

  const loadActiveDocumentJob = async () => {
    try {
      const headers = await withAuthHeaders()
      const params = new URLSearchParams()
      if (conversationIdRef.current) params.set('sessionId', conversationIdRef.current)
      const activeTramite = batchTramiteIdRef.current || activeTramiteIdRef.current || activeTramiteId
      if (activeTramite) params.set('tramiteId', activeTramite)
      const resp = await fetch(`/api/ai/document-jobs/active?${params.toString()}`, {
        method: 'GET',
        headers,
      })
      if (!resp.ok) return null
      const json = await resp.json()
      return json?.job || null
    } catch {
      return null
    }
  }
  useEffect(() => {
    activeTramiteIdRef.current = activeTramiteId
  }, [activeTramiteId])
  const [expedienteExistente, setExpedienteExistente] = useState<{
    compradorId: string
    compradorNombre: string
    tieneExpedientes: boolean
    cantidadTramites: number
    tramites: Array<{ id: string, tipo: string, estado: string, createdAt: string, updatedAt: string }>
  } | null>(null)
  const [data, setData] = useState<PreavisoData>({
    tipoOperacion: 'compraventa', // Siempre es compraventa en este sistema
    _document_intent: null,
    _document_people_pending: null,
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
  const [pendingRouterCommit, setPendingRouterCommit] = useState<{
    traceId: string | null
    count: number
    mode: 'updates' | 'document_generation'
  } | null>(null)

  // conversation_id estable (logging/QA): persiste en sessionStorage para sobrevivir refresh.
  // Manejo de Sesiones (Chat History)
  const searchParams = useSearchParams()
  const router = useRouter()
  //const chatIdParam = searchParams.get('chatId') // Esto causa re-renders, mejor usar window o ref si no queremos re-inicializar todo
  // Pero necesitamos re-inicializar si cambia el chat.

  // Ref para saber si estanos cargando un chat antiguo para evitar sobrescribir con INITIAL_MESSAGES
  const isLoadingSessionRef = useRef(false)
  const isCreatingSessionRef = useRef(false)

  const chatId = searchParams.get('chatId')
  const isNew = searchParams.get('new')

  /** true cuando hay chatId en URL o ya tenemos sesión creada; evita usar el chat sin id */
  const [sessionReady, setSessionReady] = useState(!!chatId)

  const createNewSession = async (): Promise<string | null> => {
        try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (currentSession?.access_token) {
        headers['Authorization'] = `Bearer ${currentSession.access_token}`
      }

      // Evitar duplicados por Strict Mode
      if (isCreatingSessionRef.current) return null
      isCreatingSessionRef.current = true

      const res = await fetch('/api/chat/sessions', { method: 'POST', headers })
      if (res.ok) {
        const json = await res.json()
        const newId = json.session?.id ?? null
        if (!newId) return null
        conversationIdRef.current = newId
        
        // Resetear estado completo
        setData({
          tipoOperacion: 'compraventa',
          _document_intent: null,
          _document_people_pending: null,
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

        const initialMsgs = INITIAL_MESSAGES.map((msg, i) => ({
          id: `init-${Date.now()}-${i}`,
          role: 'assistant' as const,
          content: msg,
          timestamp: new Date(Date.now() + i * 100)
        }))
        setMessages(initialMsgs)

        // Persistir saludos iniciales en la DB para que no desaparezcan al refrescar
        try {
          const { data: { session: freshSession } } = await supabase.auth.getSession()
          const headers: HeadersInit = { 'Content-Type': 'application/json' }
          if (freshSession?.access_token) {
            headers['Authorization'] = `Bearer ${freshSession.access_token}`
          }

          for (const msg of initialMsgs) {
            await fetch(`/api/chat/sessions/${newId}/messages`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                role: msg.role,
                content: msg.content,
                metadata: { is_initial_msg: true }
              })
            })
          }
        } catch (err) {
          console.error('[PreavisoChat] Error persistiendo saludos iniciales:', err)
        }

        setInitialMessagesSent(true)
        initializationRef.current = true
        setActiveTramiteId(null)
        setServerState(null)

        setUploadedDocuments([])
        setProcessingProgress(0)
        setIsProcessingDocument(false)

        setSessionReady(true)
        router.push(`/dashboard/preaviso?chatId=${newId}`)
        return newId
      }
      return null
    } catch (e) {
      console.error('Error creating session', e)
      return null
    } finally {
      isCreatingSessionRef.current = false
    }
  }

  useEffect(() => {
    // const chatId and isNew are now available from closure scope

    const loadSession = async (id: string) => {
            try {
        if (conversationIdRef.current !== id) {
          setMessages([]) // Limpiar UI solo si cambiamos de chat
        }
        isLoadingSessionRef.current = true

        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const headers: HeadersInit = {}
        if (currentSession?.access_token) {
          headers['Authorization'] = `Bearer ${currentSession.access_token}`
        }

        const res = await fetch(`/api/chat/sessions/${id}/messages`, { headers })
        if (!res.ok) throw new Error('Error cargando sesión')

        const json = await res.json()
        let resolvedTramiteId: string | null = null

        // Restaurar mensajes
        if (json.messages && Array.isArray(json.messages)) {
          // Mapear de DB structure a Frontend structure
          // Mapear de DB structure a Frontend structure
          const mapped = json.messages.map((m: any) => {
            let metadata: any = {}
            try {
              metadata = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {})
            } catch { }
            if (!resolvedTramiteId && metadata?.tramite_id) {
              resolvedTramiteId = String(metadata.tramite_id)
            }
            if (!resolvedTramiteId && metadata?.tramiteId) {
              resolvedTramiteId = String(metadata.tramiteId)
            }

            const msgAttachments = (metadata.attachments || []).map((att: any) => {
              // Reconstruct mock File object for display
              const f = new File([], att.name, { type: att.type || 'application/pdf' })
              // @ts-ignore
              f.originalSize = att.size
              return f
            })

            return {
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.created_at),
              attachments: msgAttachments
            }
          })
          setMessages(mapped)
          // Marcar como enviados para que no se re-envien los iniciales
          setInitialMessagesSent(true)
          initializationRef.current = true
        }

        // Restaurar contexto (data)
        if (json.session?.last_context) {
                    setData(json.session.last_context)
          if (!resolvedTramiteId && json.session?.last_context?.tramiteId) {
            resolvedTramiteId = String(json.session.last_context.tramiteId)
          }

          try {
            const { data: { session: stateSession } } = await supabase.auth.getSession()
            const stateHeaders: HeadersInit = { 'Content-Type': 'application/json' }
            if (stateSession?.access_token) {
              stateHeaders['Authorization'] = `Bearer ${stateSession.access_token}`
            }
            const stateResp = await fetch('/api/expedientes/preaviso/wizard-state', {
              method: 'POST',
              headers: stateHeaders,
              body: JSON.stringify({ context: json.session.last_context }),
            })
            if (stateResp.ok) {
              const stateJson = await stateResp.json()
              setServerState(stateJson as ServerStateSnapshot)
            }
          } catch (err) {
            console.error('[PreavisoChat] Error cargando estado inicial desde backend:', err)
          }
        }

        if (resolvedTramiteId) {
          setActiveTramiteId(resolvedTramiteId)
          activeTramiteIdRef.current = resolvedTramiteId
          batchTramiteIdRef.current = resolvedTramiteId

          if (!json.session?.last_context) {
            try {
              const { data: { session: tramiteSession } } = await supabase.auth.getSession()
              const tramiteHeaders: HeadersInit = {}
              if (tramiteSession?.access_token) {
                tramiteHeaders['Authorization'] = `Bearer ${tramiteSession.access_token}`
              }
              const tramiteResp = await fetch(`/api/expedientes/tramites?id=${resolvedTramiteId}`, {
                headers: tramiteHeaders,
              })
              if (tramiteResp.ok) {
                const tramiteJson = await tramiteResp.json()
                if (tramiteJson?.datos) {
                  setData(tramiteJson.datos)
                }

                const stateResp = await fetch('/api/expedientes/preaviso/wizard-state', {
                  method: 'POST',
                  headers: {
                    ...tramiteHeaders,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ tramiteId: resolvedTramiteId }),
                })
                if (stateResp.ok) {
                  const stateJson = await stateResp.json()
                  setServerState(stateJson as ServerStateSnapshot)
                }
              }
            } catch (err) {
              console.error('[PreavisoChat] Error rehidratando contexto desde tramite:', err)
            }
          }
        }

        conversationIdRef.current = id
      } catch (e) {
        console.error(e)
        // Si falla, quizás volver a new?
      } finally {
        isLoadingSessionRef.current = false
      }
    }

    if (chatId) {
      setSessionReady(true)
      if (conversationIdRef.current !== chatId) {
        loadSession(chatId)
      }
    } else {
      // Nueva sesión: crear primero para que el chat tenga siempre chatId
      if (!conversationIdRef.current || isNew) {
        setSessionReady(false)
        setMessages([])
        setInitialMessagesSent(false)
        initializationRef.current = false
        createNewSession()
      }
    }
  }, [chatId, isNew])

  // Enviar mensajes iniciales y crear nuevo trámite al iniciar
  useEffect(() => {
    let mounted = true
    // chatId is now from outer scope

    
    const initializeChat = async () => {
      // Si hay un chatId en la URL, asumimos que el primer useEffect se encarga de cargar la sesión.
      // No debemos inicializar un chat "nuevo" encima.
      if (chatId) {
                return
      }

      // Si estamos haciendo un reset manual, no interferir
      if (isManualResetRef.current) {
                return
      }

      if (!session?.access_token) {
        return
      }

      const effectiveUserId = user?.id ?? session?.user?.id
      if (!effectiveUserId) {
        return
      }

      // Si el usuario cambió, resetear flags de inicialización
      const userChanged = effectiveUserId !== lastUserIdRef.current
      if (userChanged) {
                initializationRef.current = false
        setInitialMessagesSent(false)
        setMessages([]) // Limpiar mensajes anteriores
        lastUserIdRef.current = effectiveUserId
        // Continuar con la inicialización después del reset
      } else if (lastUserIdRef.current === null && effectiveUserId) {
        // Primera carga: establecer el usuario actual
                lastUserIdRef.current = effectiveUserId
      }

      // Verificar si los mensajes están vacíos - si están vacíos, necesitamos inicializar
      // independientemente del estado de initializationRef (puede ser un remount)
      const messagesEmpty = messages.length === 0

      if (messagesEmpty) {
                initializationRef.current = false
        setInitialMessagesSent(false)
      }

      // Verificar si los mensajes iniciales ya están presentes
      const hasInitialMessages = messages.length > 0 && messages.some(m =>
        INITIAL_MESSAGES.some(initialMsg => m.content === initialMsg && m.role === 'assistant')
      )

      if (hasInitialMessages) {
                setInitialMessagesSent(true)
        initializationRef.current = true
        return
      }

      // Verificar si ya se inicializó para este usuario
      // FIX: Eliminamos el chequeo de !messagesEmpty que causaba doble ejecución cuando messages estaba vacío
      if (!userChanged && initializationRef.current) {
                return
      }

      
      // Marcar como inicializado ANTES de enviar mensajes para evitar ejecuciones duplicadas
      initializationRef.current = true

      // Enviar mensajes iniciales primero (no dependen de la creación del trámite)
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

      // Enviar mensajes iniciales inmediatamente
      try {
        await sendInitialMessages()
      } catch (error) {
        console.error('[PreavisoChat] Error enviando mensajes iniciales:', error)
        // Resetear el flag para permitir reintentos
        initializationRef.current = false
      }

      // Crear nuevo trámite (esto puede fallar sin afectar los mensajes iniciales)
      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (freshSession?.access_token) {
          headers['Authorization'] = `Bearer ${freshSession.access_token}`
        }

        const response = await fetch('/api/expedientes/tramites', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            compradorId: null,
            userId: user?.id || null,
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
          activeTramiteIdRef.current = String(tramite.id || '')
          batchTramiteIdRef.current = String(tramite.id || '')
        }
      } catch (error) {
        console.error('Error creando nuevo trámite:', error)

        // No bloquear la inicialización del chat si falla la creación del trámite
      }
    }

    // Ejecutar inicialización
    initializeChat()

    return () => {
      mounted = false
      // No resetear los refs aquí porque cuando el componente se desmonta completamente,
      // React los resetea automáticamente. Solo marcamos mounted como false para
      // cancelar cualquier operación async en curso.
    }
  }, [user?.id, session?.access_token])

  // Estado de procesamiento de documentos debe declararse ANTES de cualquier useEffect que lo use
  const [isProcessingDocument, setIsProcessingDocument] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingFileName, setProcessingFileName] = useState<string | null>(null)
  const cancelDocumentProcessing = () => {
    if (!isProcessingDocument) return
    cancelDocumentBatchRequestedRef.current = true
    void updateDocumentJob(currentDocumentJobIdRef.current, {
      status: 'cancelled',
      message: 'cancelled_by_user',
    })
    try {
      documentBatchAbortRef.current?.abort()
    } catch { }

    // Eliminar mensaje de procesamiento (buscar por contenido o por ID que empiece con 'processing')
    setMessages(prev => {
      const filtered = prev.filter(m => {
        // Eliminar mensajes de procesamiento del asistente
        if (m.role === 'assistant' && (m.content === 'Procesando documento...' || m.content.includes('Procesando'))) {
          return false
        }
        // Eliminar mensajes con ID que indique procesamiento
        if (m.id && m.id.includes('processing') && m.role === 'assistant') {
          return false
        }
        return true
      })

      // Agregar mensaje de cancelación solo si no existe ya
      const hasCancelMessage = filtered.some(m =>
        m.content.includes('cancelado') || m.content.includes('Cancelado')
      )
      if (!hasCancelMessage) {
        const cancelMessage: ChatMessage = {
          id: generateMessageId('cancel'),
          role: 'assistant',
          content: 'Proceso cancelado. Puedes volver a intentar cuando gustes.',
          timestamp: new Date()
        }
        return [...filtered, cancelMessage]
      }
      return filtered
    })

    // Marcar documentos no procesados como cancelados para quitar el círculo de procesamiento
    setUploadedDocuments(prev =>
      prev.map(doc =>
        !doc.processed ? { ...doc, processed: true, cancelled: true } : doc
      )
    )

    // Limpiar estado completamente
    setProcessingFileName(null)
    setProcessingProgress(0)
    setIsProcessingDocument(false)
    setIsProcessing(false)

    // Si había un mensaje pendiente, cancelarlo también
    try {
      messageAbortRef.current?.abort()
      messageAbortRef.current = null
    } catch { }
  }

  // Abort global para cancelar un batch completo de carga/procesamiento
  const documentBatchAbortRef = useRef<AbortController | null>(null)
  const cancelDocumentBatchRequestedRef = useRef(false)
  const currentDocumentJobIdRef = useRef<string | null>(null)

  // Abort controller para cancelar peticiones de mensajes de chat
  const messageAbortRef = useRef<AbortController | null>(null)

  // Rehidratar progreso de job activo tras refresh/reingreso.
  useEffect(() => {
    let mounted = true
    const run = async () => {
      if (!session?.access_token) return
      const job = await loadActiveDocumentJob()
      if (!mounted || !job) return
      const status = String(job.status || '')
      if (status === 'queued' || status === 'processing') {
        currentDocumentJobIdRef.current = String(job.id || '')
        try { localStorage.setItem(getJobStorageKey(), String(job.id || '')) } catch {}
        const total = Math.max(1, Number(job.total_docs || 1))
        const processed = Math.max(0, Number(job.processed_docs || 0))
        setIsProcessingDocument(true)
        setProcessingProgress(Math.min(95, Math.round((processed / total) * 90)))
        setProcessingFileName(
          job.current_document
            ? `${job.current_document} (${processed}/${total})`
            : `Procesando documentos (${processed}/${total})`
        )
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [session?.access_token, activeTramiteId])

  // Poll ligero del job activo para complementar barra de carga con progreso real.
  useEffect(() => {
    if (!isProcessingDocument) return
    const jobId = currentDocumentJobIdRef.current
    if (!jobId) return
    let cancelled = false
    const poll = async () => {
      try {
        const headers = await withAuthHeaders()
        const resp = await fetch(`/api/ai/document-jobs/${jobId}`, { method: 'GET', headers })
        if (!resp.ok || cancelled) return
        const json = await resp.json()
        const job = json?.job
        if (!job || cancelled) return
        const total = Math.max(1, Number(job.total_docs || 1))
        const processed = Math.max(0, Number(job.processed_docs || 0))
        setProcessingProgress(Math.min(95, Math.round((processed / total) * 90)))
        if (job.current_document) {
          setProcessingFileName(`${job.current_document} (${processed}/${total})`)
        }
      } catch {
        // ignore polling errors
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isProcessingDocument, session?.access_token])

  // Guardar progreso automáticamente cuando cambian los datos
  useEffect(() => {
    const saveProgress = async () => {
      // Evitar spam de updates mientras se procesan documentos (PDF multi-página dispara muchos merges).
      // Al terminar el procesamiento, este efecto correrá de nuevo y guardará una sola vez.
      if (isProcessingDocument) return

      // Solo guardar si hay datos significativos y hay un trámite activo o usuario
      const primerVendedor = data.vendedores?.[0]
      const primerComprador = data.compradores?.[0]
      const vendedorNombre = primerVendedor?.persona_fisica?.nombre || primerVendedor?.persona_moral?.denominacion_social
      const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social
      const direccion = typeof data.inmueble?.direccion === 'string' ? data.inmueble.direccion : data.inmueble?.direccion?.calle || ''

      if (!session?.access_token || (!vendedorNombre && !direccion && !compradorNombre)) {
        return
      }

      try {
        // Obtener token de la sesión para autenticación
        const { data: { session: freshSession } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (freshSession?.access_token) {
          headers['Authorization'] = `Bearer ${freshSession.access_token}`
        }

        // Si no hay trámite activo, crear uno
        const effectiveActiveTramiteId =
          activeTramiteIdRef.current || activeTramiteId || batchTramiteIdRef.current
        if (!effectiveActiveTramiteId) {
          const response = await fetch('/api/expedientes/tramites', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              compradorId: null, // Sin comprador aún
              userId: user?.id || null,
              tipo: 'preaviso',
              datos: data,
              estado: 'en_proceso',
            }),
          })

          if (response.ok) {
            const tramite = await response.json()
            setActiveTramiteId(tramite.id)
            activeTramiteIdRef.current = String(tramite.id || '')
            batchTramiteIdRef.current = String(tramite.id || '')
          }
        } else {
          // Actualizar trámite existente
          await fetch(`/api/expedientes/tramites?id=${effectiveActiveTramiteId}`, {
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
  }, [data, activeTramiteId, user?.id, session?.access_token, isProcessingDocument])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([])
  const uploadedDocumentsRef = useRef<UploadedDocument[]>([])
  useEffect(() => {
    uploadedDocumentsRef.current = uploadedDocuments
  }, [uploadedDocuments])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // Limpiar URLs de objetos cuando los archivos pendientes cambien
  useEffect(() => {
    return () => {
      // Los URLs se limpian cuando se eliminan archivos o cuando el componente se desmonta
      // La limpieza se hace en el botón de eliminar y en onLoad de las imágenes
    }
  }, [pendingFiles])
  const [showDataPanel, setShowDataPanel] = useState(!(isMobile || isTablet))

  // Sincronizar showDataPanel con el viewport inicial
  useEffect(() => {
    if (isMobile || isTablet) {
      setShowDataPanel(false)
    } else {
      setShowDataPanel(true)
    }
  }, [isMobile, isTablet])
  const [hidePanelsAfterMessage, setHidePanelsAfterMessage] = useState(false)
  const previousPendingFilesLengthRef = useRef(0)

  // Permitir que los paneles vuelvan a aparecer cuando se suben nuevos archivos pendientes (solo si aumenta)
  useEffect(() => {
    // Solo restablecer si los archivos pendientes AUMENTAN (nuevos archivos subidos)
    // No restablecer si disminuyen (archivos procesados)
    if (pendingFiles.length > previousPendingFilesLengthRef.current && hidePanelsAfterMessage) {
      setHidePanelsAfterMessage(false)
    }
    previousPendingFilesLengthRef.current = pendingFiles.length
  }, [pendingFiles.length, hidePanelsAfterMessage])
  const [isDragging, setIsDragging] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [showNewChatDialog, setShowNewChatDialog] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  // Back-end es la fuente de verdad para "completo"
  const isCompleteByServer = useMemo(() => {
    if (!serverState) return false
    if (serverState.wizard_state) return serverState.wizard_state.can_finalize
    if (serverState.current_state === 'ESTADO_8') return true
    const ss = serverState.state_status || {}
    const ok = (k: string) => ss[k] === 'completed' || ss[k] === 'not_applicable'
    return ok('ESTADO_1') && ok('ESTADO_2') && ok('ESTADO_3') && ok('ESTADO_4') && ok('ESTADO_5') && ok('ESTADO_6')
  }, [serverState])

  // Calcular progreso basado en datos completados (v1.4 - arrays)
  const progress = useMemo(() => {
    if (serverState?.wizard_state) {
      const total = serverState.wizard_state.total_steps
      const completed = serverState.wizard_state.steps.filter((s) => s.status === 'completed').length
      return {
        completed,
        total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      }
    }

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

  // Handler para pegar imágenes desde el portapapeles
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    // Buscar imagen en el portapapeles
    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      // Verificar si es una imagen
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault() // Prevenir que se pegue como texto

        const blob = item.getAsFile()
        if (!blob) continue

        // Convertir blob a File
        const file = new File([blob], `imagen-portapapeles-${Date.now()}.png`, {
          type: blob.type || 'image/png',
          lastModified: Date.now()
        })

        // Agregar a archivos pendientes en lugar de procesar inmediatamente
        setPendingFiles(prev => [...prev, file])
        return
      }
    }
  }

  const resetChat = async () => {
    // Marcar que estamos haciendo un reset manual
    isManualResetRef.current = true

    // Limpiar todos los mensajes
    setMessages([])

    // Resetear flags de inicialización
    initializationRef.current = false
    setInitialMessagesSent(false)
    messageIdCounterRef.current = 0
    documentProcessCacheRef.current.clear()

    // Limpiar archivos pendientes
    setPendingFiles([])

    // Resetear estado de procesamiento
    setIsProcessingDocument(false)
    setProcessingProgress(0)
    setProcessingFileName(null)

    // Resetear datos del preaviso a estado inicial
    const initialData: PreavisoData = {
      tipoOperacion: 'compraventa',
      _document_people_pending: null,
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
    }
    setData(initialData)

    // Limpiar documentos subidos
    setUploadedDocuments([])
    uploadedDocumentsRef.current = []

    // Resetear estado del servidor
    setServerState(null)

    // Resetear expediente existente
    setExpedienteExistente(null)

    // Resetear input
    setInput('')

    // Restablecer visibilidad de paneles
    setHidePanelsAfterMessage(false)

    // Obtener el userId correcto
    const effectiveUserId = user?.id ?? session?.user?.id

    // Crear nuevo trámite
    if (effectiveUserId) {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (currentSession?.access_token) {
          headers['Authorization'] = `Bearer ${currentSession.access_token}`
        }

        const response = await fetch('/api/expedientes/tramites', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            compradorId: null,
            userId: effectiveUserId,
            tipo: 'preaviso',
            datos: {
              tipoOperacion: 'compraventa',
              vendedores: [],
              compradores: [],
              creditos: undefined,
              gravamenes: [],
              inmueble: initialData.inmueble,
              control_impresion: initialData.control_impresion,
              validaciones: initialData.validaciones,
              actosNotariales: initialData.actosNotariales
            },
            estado: 'en_proceso',
          }),
        })

        if (response.ok) {
          const tramite = await response.json()
          setActiveTramiteId(tramite.id)
          activeTramiteIdRef.current = String(tramite.id || '')
          batchTramiteIdRef.current = String(tramite.id || '')
        }
      } catch (error) {
        console.error('Error creando nuevo trámite:', error)
      }
    }

    // Enviar mensajes iniciales directamente
    // Enviar el primer mensaje inmediatamente, luego los demás con delay
    const sendInitialMessages = async () => {
      // Enviar el primer mensaje inmediatamente
      const firstMessageId = generateMessageId('initial')
      setMessages(prev => {
        const exists = prev.some(m => m.content === INITIAL_MESSAGES[0] && m.role === 'assistant')
        if (exists) return prev
        return [...prev, {
          id: firstMessageId,
          role: 'assistant',
          content: INITIAL_MESSAGES[0],
          timestamp: new Date()
        }]
      })

      // Enviar los demás mensajes con delay
      for (let i = 1; i < INITIAL_MESSAGES.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 400))
        const initialMessageId = generateMessageId('initial')
        setMessages(prev => {
          // Verificar si el mensaje ya existe para evitar duplicados
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
      setInitialMessagesSent(true)
      initializationRef.current = true
      // Marcar que el reset manual terminó
      isManualResetRef.current = false
    }

    // Usar setTimeout con 0ms para asegurar que React haya procesado el setMessages([])
    // y luego enviar los mensajes en el siguiente tick del event loop
    setTimeout(() => {
      sendInitialMessages()
    }, 0)
  }

  const handleDeleteSession = async () => {
    if (!conversationIdRef.current) return
    if (!confirm('¿Estás seguro de eliminar esta conversación? Se borrarán todos los datos y mensajes.')) return

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const headers: HeadersInit = {}
      if (currentSession?.access_token) {
        headers['Authorization'] = `Bearer ${currentSession.access_token}`
      }

      await fetch(`/api/chat/sessions/${conversationIdRef.current}`, {
        method: 'DELETE',
        headers
      })

      // Iniciar nueva sesión limpia
      await createNewSession()
    } catch (e) {
      console.error('Error deleting session:', e)
    }
  }

  const handleNewChat = () => {
    setShowNewChatDialog(true)
  }

  const handleConfirmNewChat = async () => {
    setShowNewChatDialog(false)
    await createNewSession()
  }

  const cancelMessageRequest = () => {
    // Si se está procesando un documento, cancelar el procesamiento de documentos
    // (esto también puede cancelar un mensaje pendiente si se enviaron juntos)
    if (isProcessingDocument) {
      cancelDocumentProcessing()
      // Si también estaba procesando un mensaje, cancelarlo también
      if (isProcessing) {
        try {
          messageAbortRef.current?.abort()
        } catch { }
        setIsProcessing(false)
      }
      return
    }
    // Si se está procesando un mensaje, cancelar el mensaje
    if (!isProcessing) return
    try {
      messageAbortRef.current?.abort()
    } catch { }
    setIsProcessing(false)
    const cancelMessage: ChatMessage = {
      id: generateMessageId('cancel'),
      role: 'assistant',
      content: 'Solicitud cancelada. Puedes enviar un nuevo mensaje cuando gustes.',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, cancelMessage])
  }

  const ensureActiveTramiteId = async (): Promise<string | null> => {
    const existing = activeTramiteIdRef.current || activeTramiteId || batchTramiteIdRef.current
    if (existing) return existing
    if (!user?.id) return null

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (currentSession?.access_token) {
        headers['Authorization'] = `Bearer ${currentSession.access_token}`
      }

      const response = await fetch('/api/expedientes/tramites', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          compradorId: null,
          userId: user.id,
          tipo: 'preaviso',
          datos: {
            tipoOperacion: 'compraventa',
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
            }
          },
          estado: 'en_proceso',
        }),
      })

      if (!response.ok) return null
      const tramite = await response.json()
      const resolvedId = String(tramite?.id || '')
      if (!resolvedId) return null
      setActiveTramiteId(resolvedId)
      activeTramiteIdRef.current = resolvedId
      batchTramiteIdRef.current = resolvedId
      return resolvedId
    } catch (error) {
      console.error('Error creating tramite for RAG chat:', error)
      return null
    }
  }

  const syncRouterActionsFromResult = (result: any) => {
    const actions = Array.isArray(result?.actions) ? result.actions : []
    const proposedUpdates = Array.isArray(result?.proposed_updates) ? result.proposed_updates : []
    const hasConfirmCommit = actions.some((a: any) => a?.type === 'confirm_commit')
    const hasCommitApplied = actions.some((a: any) => a?.type === 'commit_applied')
    const hasNoPending = actions.some((a: any) => a?.type === 'no_pending_proposals')
    const hasPrepareGeneration = actions.some((a: any) => a?.type === 'prepare_document_generation')
    const hasDocumentGenerationCommitted = actions.some((a: any) => a?.type === 'document_generation_committed')
    const hasRequestMissingField = actions.some((a: any) => a?.type === 'request_missing_field')

    if (hasConfirmCommit && proposedUpdates.length > 0) {
      setPendingRouterCommit({
        traceId: typeof result?.trace_id === 'string' ? result.trace_id : null,
        count: proposedUpdates.length,
        mode: 'updates',
      })
      return
    }

    if (hasPrepareGeneration) {
      setPendingRouterCommit({
        traceId: typeof result?.trace_id === 'string' ? result.trace_id : null,
        count: 1,
        mode: 'document_generation',
      })
      return
    }

    if (hasCommitApplied || hasNoPending || hasDocumentGenerationCommitted || hasRequestMissingField) {
      setPendingRouterCommit(null)
    }
  }

  const handleConfirmProposedUpdates = async () => {
    if (isProcessing || isProcessingDocument || !pendingRouterCommit) return

    try {
      setIsProcessing(true)
      const effectiveTramiteId = await ensureActiveTramiteId()
      if (!effectiveTramiteId || !conversationIdRef.current) {
        throw new Error('No se pudo confirmar commit: falta tramiteId o chatId')
      }

      const userMessage: ChatMessage = {
        id: generateMessageId('user'),
        role: 'user',
        content: 'ejecuta',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (currentSession?.access_token) {
        headers['Authorization'] = `Bearer ${currentSession.access_token}`
      }

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId: conversationIdRef.current,
          tramiteId: effectiveTramiteId,
          message: 'ejecuta',
          uiContext: {
            pluginType: 'preaviso',
            uiAction: pendingRouterCommit.mode === 'document_generation'
              ? 'confirm_document_generation'
              : 'confirm_proposed_updates',
            currentStep: serverState?.current_state || undefined,
            hasDocument: false,
          },
        }),
      })

      if (!resp.ok) {
        throw new Error(`Error confirmando propuestas: ${resp.status}`)
      }

      const result = await resp.json()
      syncRouterActionsFromResult(result)
      if (result?.state) setServerState(result.state as ServerStateSnapshot)
      if (result?.data) {
        setData((prevData) => {
          const nextData = { ...prevData, ...(result.data || {}) }
          const actos = determineActosNotariales(nextData)
          nextData.actosNotariales = {
            cancelacionCreditoVendedor: actos.cancelacionCreditoVendedor,
            compraventa: actos.compraventa,
            aperturaCreditoComprador: actos.aperturaCreditoComprador ?? false,
          }
          return nextData
        })
      }

      const assistantText =
        typeof result?.answer === 'string' && result.answer.trim()
          ? result.answer
          : pendingRouterCommit.mode === 'document_generation'
            ? 'Documento generado y versionado correctamente.'
            : 'Cambios aplicados correctamente.'
      const assistantMessage: ChatMessage = {
        id: generateMessageId('assistant'),
        role: 'assistant',
        content: toUserFacingAssistantText(assistantText),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('[PreavisoChat] Error confirming proposed updates:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSend = async () => {
    // Ocultar paneles inmediatamente cuando se envía un mensaje
    setHidePanelsAfterMessage(true)

    const hasFiles = pendingFiles.length > 0
    const hasMessage = input.trim().length > 0

    if (!hasFiles && !hasMessage) return
    if (isProcessing || isProcessingDocument) return
    if (isSubmittingRef.current === true) return // Prevenir doble submit

    // Bloquear inmediatamente
    isSubmittingRef.current = true

    try {

      // Si hay archivos pendientes Y mensaje, marcar como procesando desde el inicio
      // para que se muestre como un solo proceso bloqueado
      if (hasFiles && hasMessage) {
        setIsProcessing(true)
      }

      // Esperar a que la sesión esté lista si es necesario
      if (!conversationIdRef.current) {
                // Pequeño retry loop (máx 3 segundos)
        for (let i = 0; i < 30; i++) {
          if (conversationIdRef.current) break
          await new Promise(r => setTimeout(r, 100))
        }
        if (!conversationIdRef.current) {
          console.error('No se pudo establecer sesión de chat')
          // Permitir continuar (quizás se crea al vuelo en backend?) pero advertir
        }
      }

      // Si hay archivos pendientes, procesarlos primero
      // Definimos variables para los datos frescos (si hubo upload) o actuales
      let freshData = data
      let freshDocs = uploadedDocuments

      if (hasFiles) {
        // Crear un FileList simulado para usar con handleFileUpload
        const dataTransfer = new DataTransfer()
        pendingFiles.forEach(file => dataTransfer.items.add(file))
        const fileList = dataTransfer.files

        // Guardar archivos antes de limpiar para incluirlos en el mensaje
        const filesToAttach = [...pendingFiles]

        // Limpiar archivos pendientes antes de procesar
        setPendingFiles([])

        // Si hay mensaje de texto, crear un solo mensaje multimodal con texto + archivos
        if (hasMessage) {
          const userMessage: ChatMessage = {
            id: generateMessageId('user'),
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
            attachments: filesToAttach
          }
          setMessages(prev => [...prev, userMessage])

          // Persistir mensaje del usuario (texto) si acompaña a un archivo
          if (conversationIdRef.current) {
            try {
              const { data: { session: currentSession } } = await supabase.auth.getSession()
              const headers: HeadersInit = { 'Content-Type': 'application/json' }
              if (currentSession?.access_token) {
                headers['Authorization'] = `Bearer ${currentSession.access_token}`
              }
              fetch(`/api/chat/sessions/${conversationIdRef.current}/messages`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  role: 'user',
                  content: input.trim(),
                  tramite_id: activeTramiteId,
                  metadata: {
                    attachments: filesToAttach.map(f => ({
                      name: f.name,
                      size: f.size,
                      type: f.type
                    }))
                  }
                })
              }).catch(e => console.error('Error persisting user text message with file:', e))
            } catch (e) {
              console.error('Error persisting user text message with file:', e)
            }
          }
        }

        // Procesar archivos (pasar true para no activar isProcessingDocument cuando hay mensaje pendiente,
        // y true para skipUserMessage cuando hay texto para evitar mensaje duplicado)
        // Recibir el estado actualizado para usarlo en el envío
        const uploadResult = await handleFileUpload(fileList, true, hasMessage, hasMessage ? input.trim() : null)

        // Si handleFileUpload retornó datos frescos, usarlos. Si no, usar los actuales state.
        freshData = uploadResult?.updatedData || data
        freshDocs = uploadResult?.updatedDocs || uploadedDocuments

        // Si no hay texto, solo procesar archivos y salir
        if (!hasMessage) {
          // Si estaba marcado como procesando, limpiarlo
          setIsProcessing(false)
          return
        }

        // IMPORTANTE: Si hay archivos, handleFileUpload YA envió el mensaje al backend con el contexto actualizado
        // y con el texto del usuario. NO debemos continuar aquí porque enviaríamos un segundo request con contexto stale.
        if (hasFiles) {
          const currentInput = input.trim()
          setInput('')
          // Liberar el lock de submit ya que handleFileUpload terminó (o retornó temprano)
          isSubmittingRef.current = false
          // Asegurar que el estado visual de "procesando mensaje" se limpie si no hubo envío real
          if (!isProcessingDocument) {
            setIsProcessing(false)
          }
          return
        }

        // Liberamos lock si no entramos al return anterior (aunque en teoría files si entra)
        // Pero si continuamos aqui, el lock se libera en el finally del bloque principal
        // NOTA: handleFileUpload es async, si retornanos arriba, el finally NO se ejecuta para este bloque padre si no lo envolvemos todo.
        // FIX CRITICO: El try/finally debe envolver TODO handleSend.

      } else {
        // Si solo hay mensaje (sin archivos), marcar como procesando ahora
        setIsProcessing(true)

        const userMessage: ChatMessage = {
          id: generateMessageId('user'),
          role: 'user',
          content: input.trim(),
          timestamp: new Date()
        }
        setMessages(prev => [...prev, userMessage])
      }

      // Si llegamos aqui y HABIA archivos, ya retornamos arriba. 
      // Si NO habia archivos (else block), continuamos con el envio normal.

      const currentInput = input.trim()
      setInput('')

      // Cancelar cualquier petición anterior
      if (messageAbortRef.current) {
        try { messageAbortRef.current.abort() } catch { }
      }
      const messageAbort = new AbortController()
      messageAbortRef.current = messageAbort

      try {
        const effectiveTramiteId = await ensureActiveTramiteId()
        if (!effectiveTramiteId) {
          throw new Error('No se pudo resolver tramiteId para chat RAG')
        }
        if (!conversationIdRef.current) {
          throw new Error('No se pudo resolver chatId para /api/ai/chat')
        }

        // Llamar al agente de IA (usando Plugin System V2)
        // Asegurarse de tener el token actualizado
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }
        if (currentSession?.access_token) {
          headers['Authorization'] = `Bearer ${currentSession.access_token}`
        }

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers,
          signal: messageAbort.signal,
          body: JSON.stringify({
            chatId: conversationIdRef.current,
            tramiteId: effectiveTramiteId,
            message: currentInput,
            uiContext: {
              pluginType: 'preaviso',
              uiAction: 'chat_message',
              currentStep: serverState?.current_state || undefined,
              hasDocument: false,
              lastQuestionIntent: (data as any)?._last_question_intent ?? undefined,
              detectedPeople: Array.isArray((data as any)?.personas_detectadas_no_clasificadas)
                ? ((data as any).personas_detectadas_no_clasificadas as any[])
                    .map((p: any) => String(p?.nombre || '').trim())
                    .filter(Boolean)
                    .slice(0, 6)
                : [],
            },
          })
        })

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`)
        }

        const result = await response.json()
        syncRouterActionsFromResult(result)
        const ragAnswer = typeof result?.answer === 'string' ? result.answer : null
        const legacyMessage = typeof result?.message === 'string' ? result.message : null
        const messagesToAdd = Array.isArray(result?.messages)
          ? result.messages
          : [ragAnswer || legacyMessage || 'No encontré suficiente evidencia para responder con certeza.']
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
            if (Object.prototype.hasOwnProperty.call(d, '_document_intent')) (nextData as any)._document_intent = (d as any)._document_intent
            if (Object.prototype.hasOwnProperty.call(d, '_document_people_pending')) (nextData as any)._document_people_pending = (d as any)._document_people_pending
            if (d.vendedores !== undefined) nextData.vendedores = inferMarriageStatus(d.vendedores as any)
            if (d.compradores !== undefined) nextData.compradores = inferMarriageStatus(d.compradores as any)
            if (Object.prototype.hasOwnProperty.call(d, 'creditos')) nextData.creditos = d.creditos as any
            if (d.gravamenes !== undefined) nextData.gravamenes = d.gravamenes as any
            // CRÍTICO: Merge profundo de inmueble (en chat) para no perder datos extraídos del documento
            // cuando el backend manda un update parcial (ej. solo existe_hipoteca).
            if (Object.prototype.hasOwnProperty.call(d, 'inmueble')) {
              const prevI: any = (nextData as any).inmueble || {}
              const nextI: any = (d as any).inmueble
              if (nextI && typeof nextI === 'object') {
                const mergedDireccion =
                  (prevI?.direccion && nextI?.direccion)
                    ? { ...prevI.direccion, ...nextI.direccion }
                    : (nextI?.direccion ?? prevI?.direccion)
                  ; (nextData as any).inmueble = {
                    ...prevI,
                    ...nextI,
                    direccion: mergedDireccion,
                    folio_real: nextI?.folio_real ?? prevI?.folio_real ?? null,
                    partidas: nextI?.partidas ?? prevI?.partidas ?? [],
                    superficie: nextI?.superficie ?? prevI?.superficie ?? null,
                    existe_hipoteca: (nextI?.existe_hipoteca !== undefined ? nextI.existe_hipoteca : prevI?.existe_hipoteca),
                  }
              } else if (nextI === null) {
                ; (nextData as any).inmueble = prevI
              }
            }
            // CRÍTICO: Merge estable de `folios` también en chat (handleSend), para no perder selection confirmada
            if (d.folios !== undefined) {
              const prevF: any = (nextData as any).folios || { candidates: [], selection: { selected_folio: null, selected_scope: null, confirmed_by_user: false } }
              const nextF: any = d.folios
              const map = new Map<string, any>()
              for (const c of [...(prevF.candidates || []), ...(nextF.candidates || [])]) {
                const folio = String(c?.folio || '').replace(/\D/g, '')
                const scope = c?.scope || 'otros'
                if (!folio) continue
                const key = `${scope}:${folio}`
                const prevC = map.get(key) || {}
                map.set(key, {
                  ...prevC,
                  ...c,
                  folio,
                  scope,
                  attrs: { ...(prevC.attrs || {}), ...(c.attrs || {}) },
                  sources: [...(prevC.sources || []), ...(c.sources || [])],
                })
              }
              const preserveSelection =
                prevF.selection?.confirmed_by_user === true &&
                (!nextF.selection?.confirmed_by_user || !nextF.selection?.selected_folio)
                ; (nextData as any).folios = {
                  candidates: Array.from(map.values()),
                  selection: preserveSelection ? prevF.selection : (nextF.selection || prevF.selection),
                }
            }
            if (d.control_impresion) nextData.control_impresion = d.control_impresion
            if (d.validaciones) nextData.validaciones = d.validaciones

            nextData.actosNotariales = {
              cancelacionCreditoVendedor: determineActosNotariales(nextData).cancelacionCreditoVendedor,
              compraventa: determineActosNotariales(nextData).compraventa,
              aperturaCreditoComprador: determineActosNotariales(nextData).aperturaCreditoComprador ?? false
            }
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
        // ─── 4. Algoritmo de concurrencia controlada con orden estricto de aplicación ───
        const batchAbort = new AbortController()

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
              newData.actosNotariales = {
                cancelacionCreditoVendedor: actos.cancelacionCreditoVendedor,
                compraventa: actos.compraventa,
                aperturaCreditoComprador: actos.aperturaCreditoComprador ?? false
              }

              return newData
            })
          }
        }

      } catch (error) {
        // No mostrar error si fue cancelado por el usuario
        if ((error as any)?.name === 'AbortError' || messageAbort.signal.aborted) {
          return
        }
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
        isSubmittingRef.current = false // Siempre liberar lock al terminar
        // Limpiar abort controller si es el actual
        if (messageAbortRef.current === messageAbort) {
          messageAbortRef.current = null
        }
        // Restaurar foco en el input después de procesar
        setTimeout(() => {
          textInputRef.current?.focus()
        }, 100)
      }
    } finally {
      // FIX CRÍTICO: Asegurar que siempre se libere el lock, incluso si hay retornos tempranos
      isSubmittingRef.current = false
    }
  }

  const sendQuickChatMessage = (value: string) => {
    const text = String(value || '').trim()
    if (!text) return
    if (isProcessing || isProcessingDocument) return
    flushSync(() => setInput(text))
    handleSend()
  }

  const handleSidebarFolioSelect = (folio: string) => {
    const cleanFolio = String(folio || '').replace(/\D/g, '')
    if (!cleanFolio) return
    sendQuickChatMessage(`el folio real es ${cleanFolio}`)
  }

  const handleSidebarPersonSelect = (name: string) => {
    const cleanName = String(name || '').trim()
    if (!cleanName) return
    const draft = `${cleanName} es `
    flushSync(() => setInput(draft))
    setTimeout(() => {
      textInputRef.current?.focus()
      const end = draft.length
      textInputRef.current?.setSelectionRange(end, end)
    }, 0)
  }

  const handleFileUpload = async (files: FileList | File[] | null, skipProcessingDocumentFlag = false, skipUserMessage = false, userText: string | null = null) => {
    if (!files || files.length === 0) return

    // Convertir FileList a array si es necesario
    const filesArray = Array.isArray(files) ? files : Array.from(files)

    // Esperar a que la sesión esté lista si es necesario (igual que handleSend)
    if (!conversationIdRef.current) {
      
      // ✅ FIX: Si no hay sesión, intentar crearla explícitamente primero
      if (!isCreatingSessionRef.current) {
        try {
          await createNewSession()
        } catch (e) {
          console.error("Error creating initial session during upload:", e)
        }
      }

      // Pequeño retry loop (máx 3 segundos) para asegurar que se estableció
      for (let i = 0; i < 30; i++) {
        if (conversationIdRef.current) break
        await new Promise(r => setTimeout(r, 100))
      }
    }

    // Sin sesión no se puede guardar documento ni indexar RAG; evitar procesar
    if (!conversationIdRef.current) {
      console.error('[PreavisoChat] No hay conversation_id tras esperar sesión; no se guardará el documento en BD ni RAG.')
      setIsProcessingDocument(false)
      setProcessingProgress(0)
      setMessages(prev => [...prev, {
        id: generateMessageId('error'),
        role: 'assistant',
        content: 'No se pudo iniciar la sesión de chat. Por favor, recarga la página e intenta de nuevo.',
        timestamp: new Date()
      }])
      return
    }

    // Verificar que activeTramiteId esté establecido antes de procesar
    if (!activeTramiteId && user?.id) {
      // ... (omitted for brevity, keep existing code until line 1771) ...
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (currentSession?.access_token) {
          headers['Authorization'] = `Bearer ${currentSession.access_token}`
        }

        const response = await fetch('/api/expedientes/tramites', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            compradorId: null,
            userId: user.id,
            tipo: 'preaviso',
            datos: {
              tipoOperacion: 'compraventa',
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
              }
            },
            estado: 'en_proceso',
          }),
        })

        if (response.ok) {
          const tramite = await response.json()
          setActiveTramiteId(tramite.id)
          activeTramiteIdRef.current = String(tramite.id || '')
          batchTramiteIdRef.current = tramite.id
        } else {
          console.error('Error creando trámite para carga de archivo')
          setIsProcessingDocument(false)
          setProcessingProgress(0)
          setMessages(prev => [...prev, {
            id: generateMessageId('error'),
            role: 'assistant',
            content: 'No se pudo inicializar el trámite. Por favor, intente nuevamente.',
            timestamp: new Date()
          }])
          return
        }
      } catch (error) {
        console.error('Error creando trámite para carga de archivo:', error)
        setIsProcessingDocument(false)
        setProcessingProgress(0)
        setMessages(prev => [...prev, {
          id: generateMessageId('error'),
          role: 'assistant',
          content: 'No se pudo inicializar el trámite. Por favor, intente nuevamente.',
          timestamp: new Date()
        }])
        return
      }
    }

    const effectiveBatchTramiteId = batchTramiteIdRef.current ?? activeTramiteId ?? null
    if (!effectiveBatchTramiteId) {
      setIsProcessingDocument(false)
      setProcessingProgress(0)
      setMessages(prev => [...prev, {
        id: generateMessageId('error'),
        role: 'assistant',
        content: 'No se pudo resolver el trámite activo para procesar documentos.',
        timestamp: new Date()
      }])
      return
    }
    batchTramiteIdRef.current = effectiveBatchTramiteId
    // Siempre establecer isProcessingDocument para mostrar la barra de progreso
    setIsProcessingDocument(true)
    setProcessingProgress(0)
    cancelDocumentBatchRequestedRef.current = false
    if (documentBatchAbortRef.current) {
      try { documentBatchAbortRef.current.abort() } catch { }
    }
    const batchAbort = new AbortController()
    documentBatchAbortRef.current = batchAbort

    // Filter out duplicates (already uploaded files)
    // Filter out duplicates (already uploaded files)
    const newFiles: File[] = []

    for (const file of filesArray) {
      // Simplificación: procesar siempre como nuevo archivo para evitar error de processCommand faltante
      newFiles.push(file)
    }

    if (newFiles.length === 0) {
      // Si todos eran duplicados (y ya los procesamos arriba), terminamos.
      setIsProcessingDocument(false)
      setProcessingProgress(0)
      return
    }

    const originalDocs: UploadedDocument[] = newFiles.map(file => ({
      id: generateMessageId('doc'),
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      processed: false
    }))
    setUploadedDocuments(prev => [...prev, ...originalDocs])

    const fileNames = newFiles.map(f => f.name)

    if (!skipUserMessage) {
      const content = userText || `He subido el siguiente documento: ${fileNames.join(', ')}`
      const fileMessage: ChatMessage = {
        id: generateMessageId('file'),
        role: 'user',
        content,
        timestamp: new Date(),
        attachments: filesArray
      }
      setMessages(prev => [...prev, fileMessage])

    }

    const processingMessage: ChatMessage = {
      id: generateMessageId('processing'),
      role: 'assistant',
      content: 'Procesando documento...',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, processingMessage])




    // Asegurar sesión válida antes de procesar (evita quedarse en 50% si la sesión expiró)
    const ensureSession = async () => {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        const refreshed = await supabase.auth.refreshSession()
        session = refreshed.data.session || null
      }
      return session
    }

    try {
      const session = await ensureSession()
      if (!session?.access_token) {
        setIsProcessingDocument(false)
        setProcessingProgress(0)
        setProcessingFileName(null)
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id).concat([{
          id: generateMessageId('session-expired'),
          role: 'assistant',
          content: 'Tu sesión expiró. Por favor actualiza la página e inicia sesión de nuevo.',
          timestamp: new Date()
        }]))
        return
      }
    } catch (e) {
      setIsProcessingDocument(false)
      setProcessingProgress(0)
      setProcessingFileName(null)
      setMessages(prev => prev.filter(m => m.id !== processingMessage.id).concat([{
        id: generateMessageId('session-error'),
        role: 'assistant',
        content: 'No se pudo validar tu sesión. Por favor actualiza la página e intenta de nuevo.',
        timestamp: new Date()
      }]))
      return
    }

    setProcessingProgress(10)
    const newDocuments = [...(data.documentos || []), ...fileNames]
    setData(prev => ({ ...prev, documentos: newDocuments }))
    let totalWorkItems = 0
    let completedCount = 0
    let errorCount = 0
    let batchJobId: string | null = null
    let jobFinalized = false

    // Procesar cada documento con IA
    try {
      if (batchAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      // Inferir tipo de documento esperado basado en la última pregunta del agente
      const inferExpectedDocumentType = (): string | null => {
        // Obtener último mensaje del asistente
        const lastAssistantMessage = [...messages]
          .reverse()
          .find(m => m.role === 'assistant')?.content || ''

        if (!lastAssistantMessage) return null

        const msg = lastAssistantMessage.toLowerCase()

        // Si pregunta por comprador o datos del comprador → esperar identificación
        if (msg.includes('comprador') || msg.includes('adquirente') ||
          msg.includes('quién será el comprador') || msg.includes('nombre del comprador') ||
          msg.includes('datos del comprador') || msg.includes('identificación del comprador')) {
          return 'identificacion'
        }

        // Si pregunta por cónyuge → esperar identificación (default). Si el usuario sube acta,
        // `detectDocumentType` la clasificará por nombre como acta_matrimonio.
        // CRÍTICO: esto debe ir ANTES que el bloque de "estado civil", porque frases como
        // "está casado" aparecen también en preguntas del cónyuge y causan falsos positivos.
        if (msg.includes('cónyuge') || msg.includes('conyuge') || msg.includes('esposa') || msg.includes('esposo') ||
          msg.includes('pareja') || msg.includes('nombre del cónyuge')) {
          return 'identificacion'
        }

        // Si pregunta por estado civil → aceptar texto. Si el usuario sube acta, la detectamos por nombre.
        // Nota: NO usar "está casado/soltero/..." como heurística aquí porque aparece en preguntas del cónyuge.
        if (msg.includes('estado civil') || msg.includes('estado civil del comprador')) {
          return 'acta_matrimonio'
        }

        // Si pregunta por vendedor o titular registral → esperar identificación o inscripción
        if (msg.includes('vendedor') || msg.includes('titular registral') || msg.includes('propietario')) {
          return 'identificacion'
        }

        // Si pregunta por folio real o inscripción → esperar inscripción
        if (msg.includes('folio real') || msg.includes('hoja de inscripción') || msg.includes('inscripción')) {
          return 'inscripcion'
        }

        return null
      }

      // Determinar tipo de documento basado en el nombre original, contenido visual, o contexto
      const detectDocumentType = async (fileName: string, file: File): Promise<string> => {
        const name = fileName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')

        // 1. Detección por nombre (prioridad alta)
        if (name.includes('inscripcion') || name.includes('hoja de inscripcion') || name.includes('folio real')) return 'inscripcion'
        if (name.includes('escritura') || name.includes('titulo') || name.includes('propiedad')) return 'escritura'
        if (name.includes('matrimonio') || name.includes('acta de matrimonio') || name.includes('acta_matrimonio')) return 'acta_matrimonio'
        if (name.includes('plano') || name.includes('croquis') || name.includes('catastral')) return 'plano'
        if (name.includes('ine') || name.includes('ife') || name.includes('identificacion') ||
          name.includes('pasaporte') || name.includes('licencia') || name.includes('curp') ||
          name.includes('generales') || name.includes('identidad') || name.includes('credencial')) return 'identificacion'

        // 2. Inferir del contexto (última pregunta del agente)
        const expectedType = inferExpectedDocumentType()
        if (expectedType) {
          return expectedType
        }

        // 3. Detección por tamaño/tipo (fallback)
        // Para imágenes pequeñas o genéricas, asumir que puede ser identificación
        if (file.type.startsWith('image/') && file.size < 5 * 1024 * 1024) {
          return 'identificacion'
        }

        return 'escritura' // default
      }

      // Preparar items (archivo original -> docType) antes de procesar
      type ImgItem = {
        index: number
        imageFile: File
        originalFile: File
        docType: string
        originalKey: string
        isArtifact: boolean
      }

      const items: ImgItem[] = []
      for (let i = 0; i < newFiles.length; i++) {
        if (batchAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const imageFile = newFiles[i]
        const isArtifact = false
        const originalFile = newFiles[i]
        const docType = await detectDocumentType(originalFile.name, originalFile)
        const originalKey = `${originalFile.name}:${originalFile.size}:${(originalFile as any).lastModified || ''}`
        items.push({ index: i, imageFile, originalFile, docType, originalKey, isArtifact })
      }

      const totalFiles = items.length
      totalWorkItems = totalFiles
      batchJobId = null
      jobFinalized = false
      if (totalFiles === 0) {
        setIsProcessingDocument(false)
        setProcessingProgress(0)
        setProcessingFileName(null)
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id).concat([{
          id: generateMessageId('no-pages'),
          role: 'assistant',
          content: 'No se detectaron archivos procesables en la carga.',
          timestamp: new Date()
        }]))
        return
      }

      batchJobId = await startDocumentJob({
        totalDocs: totalFiles,
        tramiteId: effectiveBatchTramiteId,
        sessionId: conversationIdRef.current,
        metadata: {
          via: 'preaviso_chat',
          file_names: items.map((i) => i.originalFile.name),
        },
      })
      if (batchJobId) {
        await updateDocumentJob(batchJobId, {
          status: 'processing',
          message: `Procesando ${totalFiles} documento(s)`,
          totalDocs: totalFiles,
          processedDocs: 0,
        })
      }
      completedCount = 0

      // Snapshot mutable para construir contexto correcto durante el flujo (evita usar "data" o "uploadedDocuments" viejos)
      let workingData: PreavisoData = dataRef.current
      let workingDocs: UploadedDocument[] = uploadedDocumentsRef.current

      // Upload S3: marcar "in-flight" para evitar duplicados en concurrencia
      const uploadedOriginalFilesThisBatch = new Set<string>()
      const extractedOriginalFilesThisBatch = new Set<string>()
      // OCR/RAG: mapear originalKey -> documentoId para persistir texto por página
      const documentoIdByOriginalKey = new Map<string, string>()
      // OCR pendiente cuando aún no existe documentoId (ej. primeras páginas antes del upload)
      const pendingOcrByOriginalKey = new Map<string, Array<{ pageNumber: number, text: string, metadata?: any }>>()

      // Aplicar resultados en orden, aunque se procesen en paralelo
      const pending = new Map<number, any>()
      let nextToApply = 0
      const consolidatedExtractionInputs: Array<{
        documentId: string
        rawText: string
        docType: string
        fileName: string
        intakeSummary?: string[]
        intakeFacts?: any[]
        intakeRules?: any
        intakeDetectedType?: string | null
        intakeConfidence?: number | null
        sourceDocumentType?: string | null
        sourceWarnings?: string[]
        sourceRefs?: Array<{ field?: string; evidence?: string }>
      }> = []
      const successfulOriginalKeys = new Set<string>()

      const isValidDetectedPersonName = (value: unknown): boolean => {
        const raw = String(value || '').trim()
        if (!raw) return false
        const normalized = raw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
        if (!normalized) return false
        if (
          normalized.includes('[redacted]') ||
          normalized.includes('redacted') ||
          normalized === 'n/a' ||
          normalized === 'na' ||
          normalized === 'null' ||
          normalized === 'undefined' ||
          normalized === 'desconocido' ||
          normalized === 'sin dato' ||
          normalized === 'no disponible'
        ) {
          return false
        }
        return /[a-z]/i.test(raw)
      }

      const mergeStructuredExtractionIntoData = (base: PreavisoData, structured: any): PreavisoData => {
        if (!structured || typeof structured !== 'object') return base
        const next: PreavisoData = { ...base }
        const inmueble = structured?.inmueble || {}
        const derivedFolioCandidates = Array.isArray(structured?.__derived?.folio_real_candidates)
          ? structured.__derived.folio_real_candidates
          : []
        const hasAmbiguousFolioCandidates = derivedFolioCandidates.length > 1
        const direccion = inmueble?.direccion || {}
        const datosCatastrales = inmueble?.datos_catastrales || {}

        next.inmueble = {
          ...(next.inmueble || {
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
          }),
          folio_real: hasAmbiguousFolioCandidates
            ? (next?.inmueble?.folio_real ?? null)
            : (inmueble?.folio_real ?? next?.inmueble?.folio_real ?? null),
          partidas: Array.isArray(inmueble?.partidas) && inmueble.partidas.length > 0
            ? inmueble.partidas
            : (next?.inmueble?.partidas || []),
          seccion: inmueble?.seccion ?? (next as any)?.inmueble?.seccion ?? null,
          numero_expediente: inmueble?.numero_expediente ?? (next as any)?.inmueble?.numero_expediente ?? null,
          direccion: {
            ...(next?.inmueble?.direccion || {}),
            calle: direccion?.calle ?? next?.inmueble?.direccion?.calle ?? null,
            numero: direccion?.numero ?? next?.inmueble?.direccion?.numero ?? null,
            colonia: direccion?.colonia ?? next?.inmueble?.direccion?.colonia ?? null,
            municipio: direccion?.municipio ?? next?.inmueble?.direccion?.municipio ?? null,
            estado: direccion?.estado ?? next?.inmueble?.direccion?.estado ?? null,
            codigo_postal: direccion?.codigo_postal ?? next?.inmueble?.direccion?.codigo_postal ?? null
          },
          superficie: inmueble?.superficie ?? next?.inmueble?.superficie ?? null,
          valor: inmueble?.valor ?? next?.inmueble?.valor ?? null,
          datos_catastrales: {
            ...(next?.inmueble?.datos_catastrales || {}),
            lote: datosCatastrales?.lote ?? next?.inmueble?.datos_catastrales?.lote ?? null,
            manzana: datosCatastrales?.manzana ?? next?.inmueble?.datos_catastrales?.manzana ?? null,
            fraccionamiento: datosCatastrales?.fraccionamiento ?? next?.inmueble?.datos_catastrales?.fraccionamiento ?? null,
            condominio: datosCatastrales?.condominio ?? next?.inmueble?.datos_catastrales?.condominio ?? null,
            unidad: datosCatastrales?.unidad ?? next?.inmueble?.datos_catastrales?.unidad ?? null,
            modulo: datosCatastrales?.modulo ?? next?.inmueble?.datos_catastrales?.modulo ?? null
          }
        } as any

        if (derivedFolioCandidates.length > 0) {
          const prevFolios = (next as any).folios || {
            candidates: [],
            selection: { selected_folio: null, selected_scope: null, confirmed_by_user: false }
          }
          const map = new Map<string, any>()
          const fromStructured = derivedFolioCandidates.map((folio: string) => ({
            folio: String(folio || '').replace(/\D/g, ''),
            scope: 'unidades',
            attrs: {
              unidad: structured?.inmueble?.datos_catastrales?.unidad || null,
              condominio: structured?.inmueble?.datos_catastrales?.condominio || null
            },
            sources: [{ docName: structured?.__derived?.source_file_name || null, docType: structured?.source_document_type || null }]
          }))
          for (const c of [...(prevFolios.candidates || []), ...fromStructured]) {
            const folio = String(c?.folio || '').replace(/\D/g, '')
            const scope = c?.scope || 'otros'
            if (!folio) continue
            map.set(`${scope}:${folio}`, { ...c, folio, scope })
          }
          ;(next as any).folios = {
            candidates: Array.from(map.values()),
            selection: prevFolios.selection || { selected_folio: null, selected_scope: null, confirmed_by_user: false }
          }
        }

        const normalizeName = (value: unknown): string =>
          String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase()

        const titularNombre = String(structured?.titular_registral?.nombre || '').trim()
        if (titularNombre) {
          const existing = Array.isArray(next.vendedores) ? [...next.vendedores] : []
          const vendedor = {
            ...(existing[0] || {}),
            party_id: (existing[0] as any)?.party_id || 'vendedor_1',
            tipo_persona: 'persona_fisica',
            persona_fisica: {
              ...((existing[0] as any)?.persona_fisica || {}),
              nombre: titularNombre,
              rfc: (existing[0] as any)?.persona_fisica?.rfc || structured?.titular_registral?.rfc || null,
              curp: (existing[0] as any)?.persona_fisica?.curp || structured?.titular_registral?.curp || null,
              estado_civil: (existing[0] as any)?.persona_fisica?.estado_civil || null
            },
            titular_registral_confirmado: true
          } as any
          existing[0] = vendedor
          next.vendedores = existing
        }

        const compradoresDetectados = Array.isArray(structured?.compradores_detectados)
          ? structured.compradores_detectados.filter((p: any) => String(p?.nombre || '').trim())
          : []
        if (compradoresDetectados.length > 0) {
          const existing = Array.isArray(next.compradores) ? [...next.compradores] : []
          compradoresDetectados.forEach((buyer: any, idx: number) => {
            const name = String(buyer?.nombre || '').trim()
            if (!name) return
            const prev = existing[idx] || {}
            existing[idx] = {
              ...prev,
              party_id: (prev as any).party_id || `comprador_${idx + 1}`,
              tipo_persona: 'persona_fisica',
              persona_fisica: {
                ...((prev as any).persona_fisica || {}),
                nombre: name,
                rfc: (prev as any).persona_fisica?.rfc || buyer?.rfc || null,
                curp: (prev as any).persona_fisica?.curp || buyer?.curp || null,
                estado_civil: (prev as any).persona_fisica?.estado_civil || null
              }
            } as any
          })
          next.compradores = existing
        }

        const buyerName = String(
          next?.compradores?.[0]?.persona_fisica?.nombre ||
          next?.compradores?.[0]?.persona_moral?.denominacion_social ||
          ''
        ).trim()
        const normalizedBuyer = normalizeName(buyerName)
        const conyugeCandidates = Array.isArray(structured?.conyuges_detectados)
          ? structured.conyuges_detectados
            .map((p: any) => String(p?.nombre || '').trim())
            .filter((name: string) => isValidDetectedPersonName(name))
          : []
        const conyuge =
          conyugeCandidates.find((name: string) => normalizeName(name) !== normalizedBuyer) || null
        if (conyuge) {
          const compradores = Array.isArray(next.compradores) ? [...next.compradores] : []
          const c0 = { ...(compradores[0] || {}) } as any
          c0.party_id = c0.party_id || 'comprador_1'
          c0.tipo_persona = c0.tipo_persona || 'persona_fisica'
          c0.persona_fisica = {
            ...(c0.persona_fisica || {}),
            nombre: c0.persona_fisica?.nombre || null,
            rfc: c0.persona_fisica?.rfc || null,
            curp: c0.persona_fisica?.curp || null,
            estado_civil: c0.persona_fisica?.estado_civil || 'casado',
            conyuge: {
              ...(c0.persona_fisica?.conyuge || {}),
              nombre: conyuge,
              participa: c0.persona_fisica?.conyuge?.participa ?? false
            }
          }
          compradores[0] = c0
          next.compradores = compradores
        }

        const classifiedNames = new Set<string>()
        if (titularNombre) classifiedNames.add(normalizeName(titularNombre))
        for (const p of compradoresDetectados) {
          const n = normalizeName(p?.nombre)
          if (n) classifiedNames.add(n)
        }
        const vendedoresActuales = Array.isArray(next?.vendedores) ? next.vendedores : []
        for (const v of vendedoresActuales) {
          const n = normalizeName(v?.persona_fisica?.nombre || v?.persona_moral?.denominacion_social)
          if (n) classifiedNames.add(n)
        }
        const compradoresActuales = Array.isArray(next?.compradores) ? next.compradores : []
        for (const c of compradoresActuales) {
          const n = normalizeName(c?.persona_fisica?.nombre || c?.persona_moral?.denominacion_social)
          if (n) classifiedNames.add(n)
        }
        const conyugesDetectados = Array.isArray(structured?.conyuges_detectados)
          ? structured.conyuges_detectados
          : []
        const conyugesDetectadosFiltrados = conyugesDetectados.filter((p: any) => {
          const name = String(p?.nombre || '').trim()
          if (!isValidDetectedPersonName(name)) return false
          const n = normalizeName(name)
          if (!n) return false
          return !classifiedNames.has(n)
        })
        // Persistir conyuges detectados accionables para UI.
        ;(next as any).conyuges_detectados = conyugesDetectadosFiltrados

        const rawNoClasificadas = Array.isArray(structured?.personas_detectadas_no_clasificadas)
          ? structured.personas_detectadas_no_clasificadas
          : []
        const rawNoClasificadasFiltradas = rawNoClasificadas.filter((person: any) => {
          const name = String(person?.nombre || '').trim()
          if (!isValidDetectedPersonName(name)) return false
          const n = normalizeName(name)
          if (!n) return false
          return !classifiedNames.has(n)
        })
        // Persistir solo personas realmente no clasificadas para UI.
        ;(next as any).personas_detectadas_no_clasificadas = rawNoClasificadasFiltradas

        for (const p of conyugesDetectados) {
          // Importante: NO marcar automaticamente como "clasificado".
          // Deben seguir visibles para que usuario asigne rol.
        }

        const noClasificadasRaw = rawNoClasificadasFiltradas
        const dedupNoClasificadas = new Map<string, any>()
        for (const person of noClasificadasRaw) {
          if (!isValidDetectedPersonName(person?.nombre)) continue
          const n = normalizeName(person?.nombre)
          if (!n || classifiedNames.has(n)) continue
          if (!dedupNoClasificadas.has(n)) {
            dedupNoClasificadas.set(n, {
              name: String(person?.nombre || '').trim(),
              rfc: person?.rfc ?? null,
              curp: person?.curp ?? null,
              source: 'documento'
            })
          }
        }
        // Tambien agregar conyuges detectados a lista accionable (si no estan duplicados)
        for (const spouse of conyugesDetectadosFiltrados) {
          if (!isValidDetectedPersonName(spouse?.nombre)) continue
          const n = normalizeName(spouse?.nombre)
          if (!n || classifiedNames.has(n)) continue
          if (!dedupNoClasificadas.has(n)) {
            dedupNoClasificadas.set(n, {
              name: String(spouse?.nombre || '').trim(),
              rfc: null,
              curp: null,
              source: 'documento'
            })
          }
        }
        const pendingPersons = Array.from(dedupNoClasificadas.values())
        if (pendingPersons.length > 0) {
          next._document_people_pending = {
            status: 'pending',
            source: 'documento',
            persons: pendingPersons
          }
        } else {
          next._document_people_pending = null
        }

        return next
      }

      const applyConsolidatedFolioHints = (
        base: PreavisoData,
        inputs: Array<{
          intakeRules?: any
          intakeFacts?: any[]
          documentId: string
          fileName: string
          rawText?: string
          sourceWarnings?: string[]
          sourceRefs?: Array<{ field?: string; evidence?: string }>
        }>
      ): PreavisoData => {
        const next: any = { ...(base as any) }
        const prevFolios = next.folios || {
          candidates: [],
          selection: { selected_folio: null, selected_scope: null, confirmed_by_user: false }
        }
        const extractFolios = (text: string): string[] => {
          const raw = String(text || '')
          if (!raw) return []
          const found = new Set<string>()
          const re = /\bfolio\s*real\s*[:#-]?\s*([0-9]{6,})\b/gi
          for (const m of raw.matchAll(re)) {
            const folio = String(m?.[1] || '').replace(/\D/g, '')
            if (folio) found.add(folio)
          }
          return Array.from(found)
        }
        const extractFoliosFromWarnings = (warnings: string[]): string[] => {
          const found = new Set<string>()
          for (const w of warnings) {
            const text = String(w || '')
            if (!/folio/i.test(text)) continue
            const nums = text.match(/\b[0-9]{6,}\b/g) || []
            for (const n of nums) {
              const folio = String(n || '').replace(/\D/g, '')
              if (folio) found.add(folio)
            }
          }
          return Array.from(found)
        }
        const extractFolioContext = (text: string): Record<string, any> => {
          const raw = String(text || '')
          const out: Record<string, any> = { direccion: {} }
          if (!raw) return out
          const unidad = raw.match(/\bUNIDAD\s*[:\-]?\s*([A-Z0-9]+)\b/i)
          if (unidad?.[1]) out.unidad = unidad[1].trim().toUpperCase()
          const cond = raw.match(/\bCONJ\.?\s*HABITACIONAL\s*[:\-]?\s*([^\n\r]+)/i)
          if (cond?.[1]) out.condominio = cond[1].replace(/\s+/g, ' ').trim()
          const lote = raw.match(/\bLOTE\s*[:\-]?\s*([^\n\r,;]+)/i)
          if (lote?.[1]) out.lote = lote[1].replace(/\s+/g, ' ').trim()
          const manzana = raw.match(/\bMANZANA\s*[:\-]?\s*([A-Z0-9]+)\b/i)
          if (manzana?.[1]) out.manzana = manzana[1].trim().toUpperCase()
          const frac = raw.match(/\b(DESARROLLO\s+HABITACIONAL\s+[A-Z0-9\sÁÉÍÓÚÑ.-]+)\b/i)
          if (frac?.[1]) out.fraccionamiento = frac[1].replace(/\s+/g, ' ').trim()
          const mun = raw.match(/\bMUNICIPIO\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ\s]+)\b/i)
          if (mun?.[1]) out.direccion.municipio = mun[1].replace(/\s+/g, ' ').trim().toUpperCase()
          if (/\bBAJA\s+CALIFORNIA\b/i.test(raw)) out.direccion.estado = 'BAJA CALIFORNIA'
          const sup = raw.match(/\bSUPERFICIE\s*[:\-]?\s*([0-9.,]+\s*M2)\b/i)
          if (sup?.[1]) out.superficie = sup[1].replace(/\s+/g, ' ').trim().toUpperCase()
          const ubic = raw.match(/\bCONJ\.?\s*HABITACIONAL\s*[:\-]?\s*([^\n\r]+)/i)
          if (ubic?.[1]) out.ubicacion = ubic[1].replace(/\s+/g, ' ').trim()
          return out
        }
        const extractFolioContextsByRawText = (text: string): Map<string, Record<string, any>> => {
          const raw = String(text || '')
          const out = new Map<string, Record<string, any>>()
          if (!raw) return out
          const re = /\bfolio\s*real\s*[:#-]?\s*([0-9]{6,})\b/gi
          const matches = Array.from(raw.matchAll(re))
          for (let i = 0; i < matches.length; i++) {
            const folio = String(matches[i]?.[1] || '').replace(/\D/g, '')
            if (!folio) continue
            const start = matches[i]?.index ?? 0
            const nextStart = matches[i + 1]?.index ?? raw.length
            const block = raw.slice(start, Math.min(nextStart, start + 1400))
            out.set(folio, extractFolioContext(block))
          }
          return out
        }

        const map = new Map<string, any>()
        for (const c of Array.isArray(prevFolios?.candidates) ? prevFolios.candidates : []) {
          const folio = String(c?.folio || '').replace(/\D/g, '')
          const scope = c?.scope || 'otros'
          if (!folio) continue
          map.set(`${scope}:${folio}`, { ...c, folio, scope })
        }

        for (const item of inputs || []) {
          const contextsByFolio = extractFolioContextsByRawText(String(item?.rawText || ''))
          const conflicts = Array.isArray(item?.intakeRules?.conflicts) ? item.intakeRules.conflicts : []
          const folioConflict = conflicts.find((x: any) => String(x?.key || '').toLowerCase() === 'folio_real')
          const values = Array.isArray(folioConflict?.values) ? folioConflict.values : []
          const fromFacts = Array.isArray(item?.intakeFacts)
            ? item.intakeFacts
              .filter((f: any) => String(f?.key || '').toLowerCase().includes('folio'))
              .map((f: any) => String(f?.value || ''))
            : []
          const fromRawText = extractFolios(String(item?.rawText || ''))
          const fromWarnings = extractFoliosFromWarnings(Array.isArray(item?.sourceWarnings) ? item.sourceWarnings : [])
          const fromSourceRefs = Array.isArray(item?.sourceRefs)
            ? item.sourceRefs.flatMap((r) => extractFolios(String(r?.evidence || '')))
            : []
          const allValues = Array.from(new Set([...values, ...fromFacts, ...fromRawText, ...fromWarnings, ...fromSourceRefs]))
          for (const v of allValues) {
            const folio = String(v || '').replace(/\D/g, '')
            if (!folio) continue
            const attrs = contextsByFolio.get(folio) || {}
            map.set(`unidades:${folio}`, {
              folio,
              scope: 'unidades',
              attrs,
              sources: [{ docName: item?.fileName || null, docType: 'inscripcion' }]
            })
          }
        }

        next.folios = {
          candidates: Array.from(map.values()),
          selection: prevFolios.selection || { selected_folio: null, selected_scope: null, confirmed_by_user: false }
        }
        return next as PreavisoData
      }

      const buildUncategorizedPeopleMessage = (current: any): string | null => {
        const classifiedNames = new Set<string>()
        const normalize = (value: unknown) =>
          String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        for (const v of Array.isArray(current?.vendedores) ? current.vendedores : []) {
          const n = normalize(v?.persona_fisica?.nombre || v?.persona_moral?.denominacion_social)
          if (n) classifiedNames.add(n)
        }
        for (const c of Array.isArray(current?.compradores) ? current.compradores : []) {
          const n = normalize(c?.persona_fisica?.nombre || c?.persona_moral?.denominacion_social)
          if (n) classifiedNames.add(n)
          const conyuge = normalize(c?.persona_fisica?.conyuge?.nombre)
          if (conyuge) classifiedNames.add(conyuge)
        }

        const pending = Array.isArray(current?._document_people_pending?.persons)
          ? current._document_people_pending.persons
          : []
        const raw = Array.isArray(current?.personas_detectadas_no_clasificadas)
          ? current.personas_detectadas_no_clasificadas
          : []
        const spouses = Array.isArray(current?.conyuges_detectados)
          ? current.conyuges_detectados
          : []
        const all = [...pending, ...raw, ...spouses]
        const dedup = new Map<string, string>()
        for (const p of all) {
          const name = String(p?.name || p?.nombre || '').trim()
          if (!isValidDetectedPersonName(name)) continue
          if (!name) continue
          const key = normalize(name)
          if (classifiedNames.has(key)) continue
          if (!key || dedup.has(key)) continue
          dedup.set(key, name)
        }
        const names = Array.from(dedup.values())
        if (names.length === 0) return null
        return `Informacion extra detectada sin categorizar:\n- ${names.join('\n- ')}\n\nIndica si cada persona es comprador, vendedor o conyuge.`
      }

      const buildFolioCandidatesMessage = (current: any): string | null => {
        const selectedFolio = String(current?.inmueble?.folio_real || '').trim()
        const candidatesRaw = Array.isArray(current?.folios?.candidates) ? current.folios.candidates : []
        const candidates = Array.from(
          new Set(
            candidatesRaw
              .map((c: any) => String(c?.folio || '').replace(/\D/g, ''))
              .filter(Boolean)
          )
        )
        if (selectedFolio) return null
        if (candidates.length <= 1) return null
        return `Detecte multiples folios reales candidatos en el documento:\n- ${candidates.join('\n- ')}\n\nIndica cual folio real corresponde al inmueble de esta operacion.`
      }

      let sessionExpired = false
      errorCount = 0
      const errorMessages: string[] = []
      const classifyProcessError = (res: any): string => {
        if (!res || !res.__error) return ''
        const status = res.status
        if (status === 401) {
          return 'Tu sesión expiró mientras se procesaba el documento. Por favor actualiza la página e inicia sesión de nuevo.'
        }
        if (status === 408) {
          return 'Timeout procesando el documento. Intenta de nuevo o sube imágenes individuales.'
        }
        if (status >= 500) {
          // Si el backend envió un mensaje específico (ya parseado en processOne), usarlo
          if (res.text && res.text.length < 300 && !res.text.includes('Unexpected token') && !res.text.startsWith('{')) {
            return res.text
          }
          return 'El backend no pudo procesar el documento. Intenta de nuevo en unos minutos.'
        }
        if (status === 0 || !status) {
          return 'No se pudo iniciar el procesamiento en el backend. Verifica tu conexión y vuelve a intentar.'
        }
        return 'Error procesando el documento. Por favor, intenta nuevamente.'
      }

      const applyResult = async (item: ImgItem, processResult: any) => {
        if (batchAbort.signal.aborted) return
        if (processResult?.__error && processResult?.status === 401) {
          sessionExpired = true
          try {
            documentBatchAbortRef.current?.abort()
          } catch { }
          return
        }
        if (processResult?.__error) {
          errorCount++
          const msg = classifyProcessError(processResult)
          if (msg) errorMessages.push(msg)
          return
        }
        const requiresOcr = processResult?.extractedData?._requires_ocr === true
        const needsOcrReason = String(processResult?.extractedData?._needs_ocr_reason || processResult?.meta?.needs_ocr_reason || '')
        const allowedOcrReasons = new Set(['pdf_text_not_usable', 'image_requires_ocr', 'no_usable_text', 'download_failed'])
        const extractedText = String(processResult?.extractedData?.textoCompleto || '').trim()
        const extractedFolio = String(processResult?.data?.inmueble?.folio_real || '').trim()
        const extractedPartidas = Array.isArray(processResult?.data?.inmueble?.partidas)
          ? processResult.data.inmueble.partidas.filter(Boolean)
          : []
        const hasUsefulExtraction =
          extractedText.length > 120 ||
          extractedFolio.length > 0 ||
          extractedPartidas.length > 0
        if (hasUsefulExtraction) {
          successfulOriginalKeys.add(item.originalKey)
        }
        const originalIsPdf =
          String(item.originalFile?.type || '').toLowerCase() === 'application/pdf' ||
          /\.pdf$/i.test(String(item.originalFile?.name || ''))
        if (
          !item.isArtifact &&
          originalIsPdf &&
          requiresOcr &&
          allowedOcrReasons.has(needsOcrReason) &&
          !hasUsefulExtraction &&
          !successfulOriginalKeys.has(item.originalKey)
        ) {
          console.info('[PreavisoChat] OCR/Vision fallback disabled for PDF', {
            file_name: item.originalFile.name,
            reason: needsOcrReason || 'pdf_text_not_usable',
          })
        }
        if (processResult?.state) setServerState(processResult.state as ServerStateSnapshot)
        if (processResult?.expedienteExistente) setExpedienteExistente(processResult.expedienteExistente)
        const effectiveTramiteId = batchTramiteIdRef.current ?? activeTramiteId

        const postJsonWithTimeout = async (
          input: string,
          body: any,
          timeoutMs: number,
          opts?: { signal?: AbortSignal; label?: string; requestId?: string }
        ) => {
          const controller = new AbortController()
          let abortReason: 'timeout' | 'parent_abort' | null = null
          const onAbort = () => {
            abortReason = 'parent_abort'
            controller.abort()
          }
          if (opts?.signal) {
            if (opts.signal.aborted) onAbort()
            else opts.signal.addEventListener('abort', onAbort, { once: true })
          }
          const timer = setTimeout(() => {
            abortReason = 'timeout'
            controller.abort()
          }, timeoutMs)
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
            if (opts?.requestId) headers['x-client-request-id'] = opts.requestId
            console.info('[PreavisoChat] request start', {
              label: opts?.label || input,
              request_id: opts?.requestId || null,
              timeout_ms: timeoutMs,
            })
            return await fetch(input, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
            })
          } catch (error: any) {
            if (error?.name === 'AbortError') {
              console.warn('[PreavisoChat] request aborted', {
                label: opts?.label || input,
                request_id: opts?.requestId || null,
                reason: abortReason || 'unknown_abort',
                timeout_ms: timeoutMs,
              })
              ;(error as any).__abortReason = abortReason || 'unknown_abort'
            }
            throw error
          } finally {
            clearTimeout(timer)
            if (opts?.signal) opts.signal.removeEventListener('abort', onAbort)
          }
        }

        // Marcar documento original como procesado (una vez basta; este setState es idempotente PERO debe hacer merge)
        setUploadedDocuments(prev => {
          const next = prev.map(d => {
            if (d.name !== item.originalFile.name) return d

            // Merge de extractedData (para soportar múltiples páginas que llegan en paralelo/secuencia)
            const prevData = d.extractedData || {}
            const nextData = processResult.extractedData || {}

            // Función helper para mergear arrays de strings únicos
            const mergeUnique = (a: any[], b: any[]) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])).filter(Boolean)

            // Función helper para mergear foliosConInfo (dedupe por folio)
            const mergeFoliosInfo = (a: any[], b: any[]) => {
              const map = new Map<string, any>()
              const normalize = (s: string) => String(s || '').replace(/\D/g, '')

              const listA = Array.isArray(a) ? a : []
              const listB = Array.isArray(b) ? b : []

              for (const item of [...listA, ...listB]) {
                const f = normalize(item?.folio)
                if (!f) continue
                const existing = map.get(f) || {}
                map.set(f, { ...existing, ...item }) // Merge de atributos, el último gana (podría mejorarse)
              }
              return Array.from(map.values())
            }

            const mergedData = {
              ...prevData,
              ...nextData,
              structuredExtraction: processResult.structuredExtraction || prevData.structuredExtraction || null,
              structuredExtractionWarnings: processResult.structuredExtractionWarnings || prevData.structuredExtractionWarnings || [],
              structuredExtractionTraceId: processResult.structuredExtractionTraceId || prevData.structuredExtractionTraceId || null,
              // Arrays críticos que deben acumularse
              foliosReales: mergeUnique(prevData.foliosReales, nextData.foliosReales),
              foliosRealesUnidades: mergeUnique(prevData.foliosRealesUnidades, nextData.foliosRealesUnidades),
              foliosRealesInmueblesAfectados: mergeUnique(prevData.foliosRealesInmueblesAfectados, nextData.foliosRealesInmueblesAfectados),
              foliosConInfo: mergeFoliosInfo(prevData.foliosConInfo, nextData.foliosConInfo),
              partidas: mergeUnique(prevData.partidas, nextData.partidas),
              partidasTitulo: mergeUnique(prevData.partidasTitulo, nextData.partidasTitulo),
              partidasAntecedentes: mergeUnique(prevData.partidasAntecedentes, nextData.partidasAntecedentes),
              // Objetos simples: preferir el nuevo si existe, o mantener el viejo (ya cubierto por Spread, pero cuidado con nulls)
              inmueble: { ...prevData.inmueble, ...nextData.inmueble },
              propietario: { ...prevData.propietario, ...nextData.propietario },
            }

            return {
              ...d,
              processed: true,
              extractedData: mergedData,
              documentType: item.docType
            }
          })
          workingDocs = next
          return next
        })

        // Aplicar `data` canónica desde backend
        if (processResult?.data) {
          setData(prev => {
            const updated = { ...prev }
            const d = processResult.data
            const extracted = processResult.extractedData || {}
            if (d.tipoOperacion !== undefined) updated.tipoOperacion = d.tipoOperacion
            if (Object.prototype.hasOwnProperty.call(d, '_document_intent')) (updated as any)._document_intent = (d as any)._document_intent
            if (Object.prototype.hasOwnProperty.call(d, '_document_people_pending')) {
              (updated as any)._document_people_pending = (d as any)._document_people_pending
            } else if (Object.prototype.hasOwnProperty.call(extracted, '_document_people_pending')) {
              ;(updated as any)._document_people_pending = (extracted as any)._document_people_pending
            }
            if (Array.isArray((d as any)?.personas_detectadas_no_clasificadas)) {
              ;(updated as any).personas_detectadas_no_clasificadas = (d as any).personas_detectadas_no_clasificadas
            } else if (Array.isArray((extracted as any)?.personas_detectadas_no_clasificadas)) {
              ;(updated as any).personas_detectadas_no_clasificadas = (extracted as any).personas_detectadas_no_clasificadas
            }
            if (Array.isArray((d as any)?.conyuges_detectados)) {
              ;(updated as any).conyuges_detectados = (d as any).conyuges_detectados
            } else if (Array.isArray((extracted as any)?.conyuges_detectados)) {
              ;(updated as any).conyuges_detectados = (extracted as any).conyuges_detectados
            }

            // CRÍTICO: Merge inteligente de vendedores (no sobrescribir si ya existen)
            if (d.vendedores !== undefined) {
              const prevVendedores = Array.isArray(updated.vendedores) ? updated.vendedores : []
              const nextVendedores = Array.isArray(d.vendedores) ? inferMarriageStatus(d.vendedores) : []

              // Si hay vendedores previos y nuevos, hacer merge preservando los previos
              if (prevVendedores.length > 0 && nextVendedores.length > 0) {
                // Merge: preferir vendedores nuevos si tienen más información, pero preservar los previos si tienen datos importantes
                const merged: any[] = []
                const prevMap = new Map<string, any>()
                prevVendedores.forEach((v: any, idx: number) => {
                  const key = v?.party_id || `vendedor_${idx}`
                  prevMap.set(key, v)
                })

                // Agregar/actualizar con los nuevos
                nextVendedores.forEach((v: any, idx: number) => {
                  const key = v?.party_id || `vendedor_${idx}`
                  const prev = prevMap.get(key)
                  if (prev) {
                    // Merge: preservar datos previos pero actualizar con nuevos
                    merged.push({
                      ...prev,
                      ...v,
                      // Preservar nombre si el nuevo no lo tiene
                      persona_fisica: v.persona_fisica || prev.persona_fisica,
                      persona_moral: v.persona_moral || prev.persona_moral,
                      // Preservar confirmación si ya estaba confirmado
                      titular_registral_confirmado: v.titular_registral_confirmado !== undefined
                        ? v.titular_registral_confirmado
                        : prev.titular_registral_confirmado
                    })
                    prevMap.delete(key)
                  } else {
                    merged.push(v)
                  }
                })

                // Agregar vendedores previos que no fueron actualizados
                prevMap.forEach((v) => merged.push(v))
                updated.vendedores = merged
              } else if (nextVendedores.length > 0) {
                // Si solo hay nuevos, usar esos
                updated.vendedores = nextVendedores
              }
              // Si solo hay previos, mantenerlos (no hacer nada)
            }

            // CRÍTICO: Merge inteligente de compradores (preservar cónyuge y otros datos importantes)
            if (d.compradores !== undefined) {
              const prevCompradores = Array.isArray(updated.compradores) ? updated.compradores : []
              const nextCompradores = Array.isArray(d.compradores) ? inferMarriageStatus(d.compradores) : []

              if (prevCompradores.length > 0 && nextCompradores.length > 0) {
                // Merge: preservar compradores previos pero actualizar con nuevos
                const merged: any[] = []
                const prevMap = new Map<string, any>()
                prevCompradores.forEach((c: any, idx: number) => {
                  const key = c?.party_id || `comprador_${idx}`
                  prevMap.set(key, c)
                })

                // Agregar/actualizar con los nuevos
                nextCompradores.forEach((c: any, idx: number) => {
                  const key = c?.party_id || `comprador_${idx}`
                  const prev = prevMap.get(key)
                  if (prev) {
                    // Merge profundo: preservar datos previos pero actualizar con nuevos
                    merged.push({
                      ...prev,
                      ...c,
                      // Preservar nombre si el nuevo no lo tiene
                      persona_fisica: c.persona_fisica ? {
                        ...prev.persona_fisica,
                        ...c.persona_fisica,
                        // CRÍTICO: Preservar cónyuge si ya existe y el nuevo no lo incluye
                        conyuge: c.persona_fisica?.conyuge || prev.persona_fisica?.conyuge
                      } : prev.persona_fisica,
                      persona_moral: c.persona_moral || prev.persona_moral
                    })
                    prevMap.delete(key)
                  } else {
                    merged.push(c)
                  }
                })

                // Agregar compradores previos que no fueron actualizados
                prevMap.forEach((c) => merged.push(c))
                updated.compradores = merged
              } else if (nextCompradores.length > 0) {
                // Si solo hay nuevos, usar esos
                updated.compradores = nextCompradores
              }
              // Si solo hay previos, mantenerlos (no hacer nada)
            }
            if (Object.prototype.hasOwnProperty.call(d, 'creditos')) updated.creditos = d.creditos as any
            if (d.gravamenes !== undefined) updated.gravamenes = d.gravamenes as any
            if (d.inmueble) updated.inmueble = d.inmueble as any
            if (d.control_impresion) updated.control_impresion = d.control_impresion
            if (d.validaciones) updated.validaciones = d.validaciones
            // IMPORTANTE: no sobrescribir ciegamente `documentosProcesados` porque pueden llegar respuestas
            // con contexto parcial (si hubo concurrencia). Siempre acumulamos y deduplicamos por tipo+nombre.
            if (d.documentosProcesados) {
              const prevDocs = Array.isArray(updated.documentosProcesados) ? updated.documentosProcesados : []
              const nextDocs = Array.isArray(d.documentosProcesados) ? d.documentosProcesados : []
              const map = new Map<string, any>()
              for (const doc of [...prevDocs, ...nextDocs]) {
                const key = `${String(doc?.tipo || '')}:${String(doc?.nombre || '')}`
                if (!key || key === ':') continue
                map.set(key, doc)
              }
              updated.documentosProcesados = Array.from(map.values())
            }
            if (d.folios) {
              // Merge estable de candidatos: dedupe por scope+folio, preferir attrs no vacíos.
              const prevF = updated.folios || { candidates: [], selection: { selected_folio: null, selected_scope: null, confirmed_by_user: false } }
              const nextF = d.folios
              const map = new Map<string, any>()
              for (const c of [...(prevF.candidates || []), ...(nextF.candidates || [])]) {
                const folio = String(c?.folio || '').replace(/\D/g, '')
                const scope = c?.scope || 'otros'
                if (!folio) continue
                const key = `${scope}:${folio}`
                const prevC = map.get(key) || {}
                map.set(key, {
                  ...prevC,
                  ...c,
                  folio,
                  scope,
                  attrs: { ...(prevC.attrs || {}), ...(c.attrs || {}) },
                  sources: [...(prevC.sources || []), ...(c.sources || [])],
                })
              }

              // CRÍTICO: Preservar selección de folio si ya fue confirmada por el usuario
              // Solo sobrescribir si el nuevo tiene una selección confirmada O si la previa no estaba confirmada
              const preserveSelection = prevF.selection?.confirmed_by_user === true &&
                (!nextF.selection?.confirmed_by_user || !nextF.selection?.selected_folio)

              updated.folios = {
                candidates: Array.from(map.values()),
                selection: preserveSelection
                  ? prevF.selection  // Preservar selección previa confirmada
                  : (nextF.selection || prevF.selection)  // Usar nueva selección o preservar previa
              }
              updated.folios = {
                candidates: Array.from(map.values()),
                // selection: el backend es autoridad (pero si no viene, conservar la previa)
                selection: nextF.selection || prevF.selection,
              }
            }
            const actos = determineActosNotariales(updated)
            updated.actosNotariales = {
              cancelacionCreditoVendedor: actos.cancelacionCreditoVendedor,
              compraventa: actos.compraventa,
              aperturaCreditoComprador: actos.aperturaCreditoComprador ?? false
            }
            // CRÍTICO: Actualizar workingData con la versión actualizada ANTES de continuar
            workingData = updated
            return updated
          })

          // Si processResult.data no existía, asegurarnos de que workingData refleje workingDocs
          // (esto es redundante si setUploadedDocuments se ejecuta, pero por seguridad)
        } else {
          // Si no hay data del backend, al menos actualizar workingDocs
          // workingDocs ya fue actualizado arriba
        }

        // CRÍTICO: También actualizar workingData directamente para que esté disponible inmediatamente
        // para el siguiente procesamiento (especialmente importante para documentos procesados secuencialmente)
        const d = processResult.data
        // CRÍTICO: Merge inteligente de compradores (preservar cónyuge y otros datos importantes)
        if (d.compradores !== undefined) {
          const prevCompradores = Array.isArray(workingData.compradores) ? workingData.compradores : []
          const nextCompradores = Array.isArray(d.compradores) ? d.compradores : []

          if (prevCompradores.length > 0 && nextCompradores.length > 0) {
            // Merge: preservar compradores previos pero actualizar con nuevos
            const merged: any[] = []
            const prevMap = new Map<string, any>()
            prevCompradores.forEach((c: any, idx: number) => {
              const key = c?.party_id || `comprador_${idx}`
              prevMap.set(key, c)
            })

            // Agregar/actualizar con los nuevos
            nextCompradores.forEach((c: any, idx: number) => {
              const key = c?.party_id || `comprador_${idx}`
              const prev = prevMap.get(key)
              if (prev) {
                // Merge profundo: preservar datos previos pero actualizar con nuevos
                merged.push({
                  ...prev,
                  ...c,
                  // Preservar nombre si el nuevo no lo tiene
                  persona_fisica: c.persona_fisica ? {
                    ...prev.persona_fisica,
                    ...c.persona_fisica,
                    // CRÍTICO: Preservar cónyuge si ya existe y el nuevo no lo incluye
                    conyuge: c.persona_fisica?.conyuge || prev.persona_fisica?.conyuge
                  } : prev.persona_fisica,
                  persona_moral: c.persona_moral || prev.persona_moral
                })
                prevMap.delete(key)
              } else {
                merged.push(c)
              }
            })

            // Agregar compradores previos que no fueron actualizados
            prevMap.forEach((c) => merged.push(c))
            workingData.compradores = merged
          } else if (nextCompradores.length > 0) {
            // Si solo hay nuevos, usar esos
            workingData.compradores = nextCompradores
          }
          // Si solo hay previos, mantenerlos (no hacer nada)
        }
        // CRÍTICO: Merge inteligente de vendedores (preservar existentes si el backend no los incluye)
        if (d.vendedores !== undefined) {
          const prevVendedores = Array.isArray(workingData.vendedores) ? workingData.vendedores : []
          const nextVendedores = Array.isArray(d.vendedores) ? d.vendedores : []

          if (prevVendedores.length > 0 && nextVendedores.length > 0) {
            // Merge: preservar vendedores previos pero actualizar con nuevos
            const merged: any[] = []
            const prevMap = new Map<string, any>()
            prevVendedores.forEach((v: any, idx: number) => {
              const key = v?.party_id || `vendedor_${idx}`
              prevMap.set(key, v)
            })

            nextVendedores.forEach((v: any, idx: number) => {
              const key = v?.party_id || `vendedor_${idx}`
              const prev = prevMap.get(key)
              if (prev) {
                merged.push({
                  ...prev,
                  ...v,
                  persona_fisica: v.persona_fisica || prev.persona_fisica,
                  persona_moral: v.persona_moral || prev.persona_moral,
                  titular_registral_confirmado: v.titular_registral_confirmado !== undefined
                    ? v.titular_registral_confirmado
                    : prev.titular_registral_confirmado
                })
                prevMap.delete(key)
              } else {
                merged.push(v)
              }
            })

            prevMap.forEach((v) => merged.push(v))
            workingData.vendedores = merged
          } else if (nextVendedores.length > 0) {
            workingData.vendedores = nextVendedores
          }
          // Si solo hay previos, mantenerlos (no hacer nada)
        }
        if (d.tipoOperacion !== undefined) {
          workingData.tipoOperacion = d.tipoOperacion
        }
        if (Object.prototype.hasOwnProperty.call(d, '_document_people_pending')) {
          (workingData as any)._document_people_pending = (d as any)._document_people_pending
        } else if (Object.prototype.hasOwnProperty.call(processResult.extractedData || {}, '_document_people_pending')) {
          ;(workingData as any)._document_people_pending = (processResult.extractedData as any)._document_people_pending
        }
        if (Array.isArray((d as any)?.personas_detectadas_no_clasificadas)) {
          ;(workingData as any).personas_detectadas_no_clasificadas = (d as any).personas_detectadas_no_clasificadas
        } else if (Array.isArray((processResult.extractedData as any)?.personas_detectadas_no_clasificadas)) {
          ;(workingData as any).personas_detectadas_no_clasificadas = (processResult.extractedData as any).personas_detectadas_no_clasificadas
        }
        if (Array.isArray((d as any)?.conyuges_detectados)) {
          ;(workingData as any).conyuges_detectados = (d as any).conyuges_detectados
        } else if (Array.isArray((processResult.extractedData as any)?.conyuges_detectados)) {
          ;(workingData as any).conyuges_detectados = (processResult.extractedData as any).conyuges_detectados
        }

        // S3 upload (solo 1 por archivo original)
        if (effectiveTramiteId && !uploadedOriginalFilesThisBatch.has(item.originalKey)) {
          // marcar antes para evitar carreras
          uploadedOriginalFilesThisBatch.add(item.originalKey)
          try {
            const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number, signal?: AbortSignal) => {
              const controller = new AbortController()
              const onAbort = () => controller.abort()
              if (signal) {
                if (signal.aborted) controller.abort()
                else signal.addEventListener('abort', onAbort, { once: true })
              }
              const timer = setTimeout(() => controller.abort(), timeoutMs)
              try {
                return await fetch(input, { ...init, signal: controller.signal })
              } finally {
                clearTimeout(timer)
                if (signal) signal.removeEventListener('abort', onAbort)
              }
            }

            const mapToExpedienteTipo = (t: string, serverData?: any): string => {
              if (t === 'inscripcion') return 'escritura'
              if (t === 'escritura') return 'escritura'
              if (t === 'plano') return 'plano'
              if (t === 'identificacion') {
                if (serverData && Object.prototype.hasOwnProperty.call(serverData, 'compradores')) return 'ine_comprador'
                if (serverData && Object.prototype.hasOwnProperty.call(serverData, 'vendedores')) return 'ine_vendedor'
                return 'ine_comprador'
              }
              return 'escritura'
            }
            const expedienteTipo = mapToExpedienteTipo(item.docType, processResult?.data)

            const { data: { session } } = await supabase.auth.getSession()
            const headers: HeadersInit = {}
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

            const uploadFormData = new FormData()
            uploadFormData.append('file', item.originalFile)
            uploadFormData.append('compradorId', '')
            uploadFormData.append('tipo', expedienteTipo)
            uploadFormData.append('tramiteId', effectiveTramiteId || '')
            uploadFormData.append('sessionId', conversationIdRef.current || '')
            uploadFormData.append('metadata', JSON.stringify({
              preaviso_subtype: item.docType,
              original_name: item.originalFile.name,
            }))

            // Timeout para evitar que el pipeline se quede colgado si S3/upload se bloquea.
            const uploadResp = await fetchWithTimeout('/api/expedientes/documentos/upload', {
              method: 'POST',
              headers,
              body: uploadFormData,
            }, 45_000, batchAbort.signal)

            try {
              if (uploadResp.ok) {
                const uploadedDoc = await uploadResp.json()
                if (uploadedDoc?.id) {
                  const docId = String(uploadedDoc.id)
                  documentoIdByOriginalKey.set(item.originalKey, docId)

                  // Acumular texto por documento para ejecutar una sola extraccion consolidada al final del lote.
                  if (!extractedOriginalFilesThisBatch.has(item.originalKey)) {
                    extractedOriginalFilesThisBatch.add(item.originalKey)
                    try {
                      const rawTextFromExtraction =
                        typeof processResult?.extractedData?.textoCompleto === 'string'
                          ? processResult.extractedData.textoCompleto.trim()
                          : ''
                      const requiresOcrFallback = processResult?.extractedData?._requires_ocr === true
                      const rawTextFromOcr =
                        typeof processResult?.ocrText === 'string'
                          ? processResult.ocrText.trim()
                          : ''
                      const rawTextForExtraction = rawTextFromExtraction || rawTextFromOcr
                      const tramiteIdForExtraction = effectiveTramiteId
                      if (tramiteIdForExtraction && rawTextForExtraction && !requiresOcrFallback) {
                        const intakeDebug = processResult?.extractedData?._intake_debug || null
                        const extractedSourceType =
                          typeof processResult?.extractedData?.source_document_type === 'string'
                            ? processResult.extractedData.source_document_type
                            : null
                        const extractedWarnings = Array.isArray(processResult?.extractedData?.warnings)
                          ? processResult.extractedData.warnings
                          : []
                        console.info('[PreavisoChat] consolidated_input_doc', {
                          document_id: docId,
                          file_name: item.originalFile.name,
                          doc_type: item.docType,
                          raw_text_length: rawTextForExtraction.length,
                          intake_detected_type: intakeDebug?.detected_type || null,
                          intake_summary_count: Array.isArray(intakeDebug?.summary) ? intakeDebug.summary.length : 0,
                          extracted_source_document_type: extractedSourceType,
                          extracted_warnings_count: extractedWarnings.length,
                        })
                        consolidatedExtractionInputs.push({
                          documentId: docId,
                          rawText: rawTextForExtraction,
                          docType: item.docType,
                          fileName: item.originalFile.name,
                          intakeSummary: Array.isArray(intakeDebug?.summary) ? intakeDebug.summary : [],
                          intakeFacts: Array.isArray(intakeDebug?.facts) ? intakeDebug.facts : [],
                          intakeRules: intakeDebug?.rules || null,
                          intakeDetectedType: intakeDebug?.detected_type || null,
                          intakeConfidence:
                            typeof intakeDebug?.confidence === 'number' ? intakeDebug.confidence : null,
                          sourceDocumentType: extractedSourceType,
                          sourceWarnings: extractedWarnings,
                          sourceRefs: Array.isArray(processResult?.extractedData?.source_refs)
                            ? processResult.extractedData.source_refs
                            : [],
                        })
                      }
                    } catch (extractError) {
                      console.warn('[PreavisoChat] Error preparing consolidated extraction', extractError)
                    }
                  }

                  // flush OCR pendiente
                  const pend = pendingOcrByOriginalKey.get(item.originalKey) || []
                  if (pend.length > 0) {
                    for (const p of pend) {
                      try {
                        await postJsonWithTimeout('/api/ai/preaviso-ocr-cache/upsert', {
                          tramiteId: effectiveTramiteId,
                          docName: item.originalFile.name,
                          docSubtype: item.docType,
                          docRole: null,
                          pageNumber: p.pageNumber,
                          text: p.text,
                        }, 15_000)
                      } catch { }
                    }
                    pendingOcrByOriginalKey.delete(item.originalKey)
                  }
                }
              }
            } catch {
              // no bloquear
            }
          } catch (uploadError) {
            console.error(`Error subiendo documento ${item.originalFile.name} a S3:`, uploadError)
            // No bloquear; no reintentar en este lote
          }
        }

        try {
          if (effectiveTramiteId && processResult?.ocrText && typeof processResult.ocrText === 'string') {
            const text = processResult.ocrText.trim()
            if (text) {
              const inferPageNumber = (): number => {
                const n = item.imageFile?.name || item.originalFile?.name || ''
                const m1 = n.match(/page[_-]?(\d{1,4})/i)
                if (m1?.[1]) return Math.max(1, Number(m1[1]))
                const m2 = n.match(/[_-](\d{1,4})\.(png|jpe?g|webp)$/i)
                if (m2?.[1]) return Math.max(1, Number(m2[1]))
                return 1
              }
              const pageNumber = inferPageNumber()
              const docId = documentoIdByOriginalKey.get(item.originalKey) || null
              const meta = { page_file: item.imageFile?.name || null }
              if (docId) {
                try {
                  await postJsonWithTimeout('/api/ai/preaviso-ocr-cache/upsert', {
                    tramiteId: effectiveTramiteId,
                    docName: item.originalFile.name,
                    docSubtype: item.docType,
                    docRole: null,
                    pageNumber,
                    text,
                  }, 15_000)
                } catch { }
              } else {
                const prev = pendingOcrByOriginalKey.get(item.originalKey) || []
                prev.push({ pageNumber, text, metadata: meta })
                pendingOcrByOriginalKey.set(item.originalKey, prev)
              }
            }
          }
        } catch (err) {
          console.warn("Error in batch processing item:", err)
        }
      }; // End of applyResult

      const onOneDone = async (idx: number, item: ImgItem, result: any) => {
        pending.set(idx, { item, result })
        // Aplicar en orden, drenando la cola
        while (pending.has(nextToApply)) {
          const { item: it, result: r } = pending.get(nextToApply)
          pending.delete(nextToApply)
          await applyResult(it, r)
          nextToApply++
        }
      }

      const processOne = async (item: ImgItem) => {
        if (batchAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        // CRÍTICO: Sincronizar workingData con dataRef.current justo antes de enviar contexto
        // Esto asegura que tengamos la última versión del contexto, incluyendo _document_intent
        // que se establece cuando el asistente pregunta por el cónyuge
        workingData = dataRef.current
        workingDocs = uploadedDocumentsRef.current

        const cacheableTypes = new Set(['inscripcion', 'escritura', 'plano'])
        const cacheKey = `${item.originalKey}:${item.imageFile.name}:${item.docType}`
        if (cacheableTypes.has(item.docType)) {
          const cached = documentProcessCacheRef.current.get(cacheKey)
          if (cached && !cached.__error) {
            return cached
          }
        }

        // DEBUG: verificar _document_intent en el momento exacto de procesar documento
        
        // Contexto actual (snapshot) para que el backend devuelva merge + state.
        // Para PDFs (inscripción/escritura/plano) la dependencia de contexto es baja.
        // Para identificaciones dejamos concurrencia=1 (ver pool abajo).
        const formData = new FormData()
        formData.append('file', item.imageFile)
        formData.append('documentType', item.docType)
        formData.append('needOcr', '1')
        const effectiveTramiteId = batchTramiteIdRef.current ?? activeTramiteId
        const forceReprocess =
          earlyAlreadyProcessedRef.current?.choice === 'reprocess' &&
          earlyAlreadyProcessedRef.current.fileNames.includes(item.originalFile.name)
        formData.append('context', JSON.stringify({
          conversation_id: conversationIdRef.current,
          is_processing_artifact: item.isArtifact,
          _bulk_fast_mode: totalFiles > 1,
          _defer_structured_extraction: totalFiles > 1,
          tipoOperacion: workingData.tipoOperacion,
          _document_intent: (workingData as any)._document_intent ?? null,
          _last_question_intent: (workingData as any)._last_question_intent ?? null,
          _document_people_pending: (workingData as any)._document_people_pending ?? null,
          tramiteId: effectiveTramiteId,
          forceReprocess: forceReprocess || undefined,
          vendedores: workingData.vendedores || [],
          compradores: workingData.compradores || [],
          creditos: workingData.creditos,
          gravamenes: workingData.gravamenes || [],
          inmueble: workingData.inmueble,
          folios: workingData.folios,
          documentos: workingData.documentos,
          documentosProcesados: workingData.documentosProcesados || workingDocs
            .filter(d => d.processed && d.extractedData)
            .map(d => ({
              nombre: d.name,
              tipo: d.documentType || 'desconocido',
              informacionExtraida: d.extractedData
            })),
          expedienteExistente: expedienteExistente || undefined
        }))

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          return { __error: true, status: 401, text: 'session_expired' }
        }
        const headers: HeadersInit = {}
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

        const fetchWithTimeout = async (
          input: RequestInfo | URL,
          init: RequestInit,
          timeoutMs?: number,
          signal?: AbortSignal
        ) => {
          const controller = new AbortController()
          const onAbort = () => controller.abort()
          if (signal) {
            if (signal.aborted) controller.abort()
            else signal.addEventListener('abort', onAbort, { once: true })
          }
          const hasTimeout = Number.isFinite(timeoutMs as number) && Number(timeoutMs) > 0
          const timer = hasTimeout ? setTimeout(() => controller.abort(), Number(timeoutMs)) : null
          try {
            return await fetch(input, { ...init, signal: controller.signal })
          } finally {
            if (timer) clearTimeout(timer)
            if (signal) signal.removeEventListener('abort', onAbort)
          }
        }

        let processResponse: Response
        try {
          console.info('[PreavisoChat] /api/ai/preaviso-process-document start', {
            file_name: item.originalFile?.name || item.imageFile?.name || 'unknown',
            timeout_ms: null,
          })
          processResponse = await fetchWithTimeout('/api/ai/preaviso-process-document', {
            method: 'POST',
            headers,
            body: formData
          }, undefined, batchAbort.signal)
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e
          const msg = e?.message || 'Error desconocido procesando documento.'
          return { __error: true, status: 408, text: msg }
        }

        if (!processResponse.ok) {
          let errorMsg = await processResponse.text()
          try {
            const errorJson = JSON.parse(errorMsg)
            if (errorJson.message) errorMsg = errorJson.message
          } catch { }
          return { __error: true, status: processResponse.status, text: errorMsg }
        }
        const json = await processResponse.json()
        if (cacheableTypes.has(item.docType) && !json?.__error) {
          documentProcessCacheRef.current.set(cacheKey, json)
        }
        return json
      }

      // Pool runner (concurrencia limitada)
      const runPool = async (poolItems: ImgItem[], concurrency: number) => {
        let cursor = 0
        const workers = Array.from({ length: concurrency }).map(async () => {
          while (cursor < poolItems.length) {
            if (batchAbort.signal.aborted) return
            const myIdx = cursor++
            const item = poolItems[myIdx]
            try {
              const result = await processOne(item)
              if (batchAbort.signal.aborted) return
              completedCount++
              setProcessingProgress(50 + (completedCount / Math.max(1, totalWorkItems)) * 40)
              setProcessingFileName(`${item.originalFile.name} (${completedCount}/${totalWorkItems})`)
              await updateDocumentJob(batchJobId, {
                status: 'processing',
                processedDocs: completedCount,
                totalDocs: totalWorkItems,
                currentDocument: item.originalFile.name,
              })
              await onOneDone(item.index, item, result)
            } catch (e) {
              if ((e as any)?.name === 'AbortError') return
              console.error(`Error procesando ${item.originalFile.name}:`, e)
              completedCount++
              setProcessingProgress(50 + (completedCount / Math.max(1, totalWorkItems)) * 40)
              setProcessingFileName(`${item.originalFile.name} (${completedCount}/${totalWorkItems})`)
              await updateDocumentJob(batchJobId, {
                status: 'processing',
                processedDocs: completedCount,
                failedDocs: errorCount + 1,
                totalDocs: totalWorkItems,
                currentDocument: item.originalFile.name,
              })
              await onOneDone(item.index, item, { __error: true })
            }
          }
        })
        await Promise.all(workers)
      }

      // Documentos ya procesados: comprobar GLOBAL (API) + conversación actual
      let checkResults: { fileName: string; fileHash: string; alreadyProcessed: boolean }[] = []
      try {
        const checkForm = new FormData()
        items.forEach((it: ImgItem) => checkForm.append('files', it.imageFile))
        const { data: { session } } = await supabase.auth.getSession()
        const checkRes = await fetch('/api/ai/preaviso-check-document', {
          method: 'POST',
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          body: checkForm
        })
        if (checkRes.ok) {
          const body = await checkRes.json()
          checkResults = body.results || []
        }
      } catch (e) {
        console.warn('[PreavisoChat] Check API error:', e)
      }

      const cacheableTypesSet = new Set(['inscripcion', 'escritura', 'plano'])
      const alreadyProcessedItems = items.filter((item: ImgItem, j: number) => {
        const fromApi = checkResults[j]?.alreadyProcessed === true
        const cacheKey = `${item.originalKey}:${item.imageFile.name}:${item.docType}`
        const fromCache = cacheableTypesSet.has(item.docType) && documentProcessCacheRef.current.get(cacheKey) && !documentProcessCacheRef.current.get(cacheKey)?.__error
        const fromConversation = !!uploadedDocumentsRef.current.find(
          d => d.name === item.originalFile.name && d.processed && d.extractedData
        )
        return fromApi || fromCache || fromConversation
      })

      const uniqueAlreadyProcessedNames = [...new Set(alreadyProcessedItems.map((i: ImgItem) => i.originalFile.name))]

      // Siempre reprocesar: no mostrar modal; forzar reproceso para los que ya estaban en caché
      if (alreadyProcessedItems.length > 0) {
        earlyAlreadyProcessedRef.current = { choice: 'reprocess', fileNames: uniqueAlreadyProcessedNames }
      }

      // Identificaciones: secuencial (context-sensitive). PDFs: concurrencia=2.
      const idItems = items.filter((it: ImgItem) => it.docType === 'identificacion')
      const otherItems = items.filter((it: ImgItem) => it.docType !== 'identificacion')

      // Inscripción/Escritura: secuencial para garantizar acumulación de `documentosProcesados` página a página.
      const sequentialItems = otherItems.filter((it: ImgItem) => it.docType === 'inscripcion' || it.docType === 'escritura')
      const parallelItems = otherItems.filter((it: ImgItem) => it.docType !== 'inscripcion' && it.docType !== 'escritura')

      if (parallelItems.length > 0) {
        await runPool(parallelItems, 2)
      }
      if (sequentialItems.length > 0) {
        // Ya hacemos merge estable de `documentosProcesados`/`folios` al aplicar resultados,
        // así que podemos procesar en paralelo para mejorar performance.
        await runPool(sequentialItems, 2)
      }
      if (idItems.length > 0) {
        await runPool(idItems, 1)
      }

      // OCR/Vision fallback for PDF is intentionally disabled.

      if (sessionExpired) {
        await updateDocumentJob(batchJobId, {
          status: 'failed',
          processedDocs: completedCount,
          failedDocs: errorCount || 1,
          totalDocs: totalWorkItems,
          message: 'session_expired',
        })
        jobFinalized = true
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id).concat([{
          id: generateMessageId('session-expired'),
          role: 'assistant',
          content: 'Tu sesión expiró mientras se procesaba el documento. Por favor actualiza la página e inicia sesión de nuevo.',
          timestamp: new Date()
        }]))
        // FIX: Liberar locks explícitamente en error
        setIsProcessingDocument(false)
        setProcessingProgress(0)
        setProcessingFileName(null)
        setIsProcessing(false)
        isSubmittingRef.current = false
        return
      }

      if (errorCount > 0) {
        await updateDocumentJob(batchJobId, {
          status: 'failed',
          processedDocs: completedCount,
          failedDocs: errorCount,
          totalDocs: totalWorkItems,
          message: 'partial_or_total_failure',
        })
        jobFinalized = true
        // ... (lines 2709-2720)
        const uniqueErrors = Array.from(new Set(errorMessages))
        const fallback = 'Error procesando el documento. Por favor, intenta nuevamente.'
        const message =
          errorCount >= totalFiles
            ? (uniqueErrors[0] || fallback)
            : `Algunas páginas no se procesaron (${errorCount}/${totalFiles}). ${uniqueErrors[0] || fallback}`
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id).concat([{
          id: generateMessageId('doc-error'),
          role: 'assistant',
          content: message,
          timestamp: new Date()
        }]))
        // FIX: Liberar locks explícitamente en error
        setIsProcessingDocument(false)
        setProcessingProgress(0)
        setProcessingFileName(null)
        setIsProcessing(false)
        isSubmittingRef.current = false
        return
      }

      const tramiteIdForFinalExtraction = batchTramiteIdRef.current ?? activeTramiteIdRef.current ?? activeTramiteId
      if (tramiteIdForFinalExtraction && totalFiles > 1 && consolidatedExtractionInputs.length > 0) {
        try {
          const primaryDocumentId = consolidatedExtractionInputs[0]?.documentId
          const consolidatedRawText = consolidatedExtractionInputs
            .map((item, idx) => {
              const docBody = String(item.rawText || '').trim()
              const docHeader =
                `<<<DOCUMENT_START>>>\n` +
                `index: ${idx + 1}\n` +
                `documentId: ${item.documentId}\n` +
                `fileName: ${item.fileName}\n` +
                `docType: ${item.docType}\n` +
                `detectedType: ${item.intakeDetectedType || 'N/A'}\n` +
                `textLength: ${docBody.length}\n`
              const docFooter = `\n<<<DOCUMENT_END>>>`
              return `${docHeader}\n${docBody}${docFooter}`
            })
            .join('\n\n')
            .trim()

          if (primaryDocumentId && consolidatedRawText) {
            console.info('[PreavisoChat] consolidated_input_batch', {
              documents_count: consolidatedExtractionInputs.length,
              consolidated_text_length: consolidatedRawText.length,
              docs: consolidatedExtractionInputs.map((d) => ({
                documentId: d.documentId,
                fileName: d.fileName,
                docType: d.docType,
                rawTextLength: String(d.rawText || '').length,
              })),
            })
            const consolidatedRequestId = `extract-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            const { data: { session } } = await supabase.auth.getSession()
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
            headers['x-client-request-id'] = consolidatedRequestId

            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 120_000)
            let extractResp: Response
            try {
              extractResp = await fetch(`/api/expedientes/tramites/${tramiteIdForFinalExtraction}/extract`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  documentId: primaryDocumentId,
                  tramiteType: 'preaviso',
                  rawText: consolidatedRawText,
                  fileMeta: {
                    source: 'preaviso-chat-consolidated',
                    documents_count: consolidatedExtractionInputs.length,
                    documents: consolidatedExtractionInputs.map((item) => ({
                      documentId: item.documentId,
                      docType: item.docType,
                      fileName: item.fileName,
                      intakeSummary: item.intakeSummary || [],
                      intakeDetectedType: item.intakeDetectedType || null,
                      intakeConfidence: item.intakeConfidence ?? null,
                      sourceDocumentType: item.sourceDocumentType || null,
                      sourceWarnings: Array.isArray(item.sourceWarnings) ? item.sourceWarnings : [],
                    })),
                    consolidated_facts: consolidatedExtractionInputs.flatMap((item) =>
                      Array.isArray(item.intakeFacts)
                        ? item.intakeFacts.map((f: any) => ({ ...f, documentId: item.documentId }))
                        : []
                    ),
                    consolidated_rules: consolidatedExtractionInputs
                      .map((item) => item.intakeRules)
                      .filter(Boolean),
                  },
                }),
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timer)
            }

            if (extractResp.ok) {
              const extractJson = await extractResp.json()
              console.info('[PreavisoChat] consolidated /extract ok', {
                request_id: consolidatedRequestId,
                trace_id: extractJson?.trace_id || null,
                documents_count: consolidatedExtractionInputs.length,
              })
              if (extractJson?.structured) {
                setData(prev => {
                  const mergedStructured = mergeStructuredExtractionIntoData(prev, extractJson.structured)
                  const merged = applyConsolidatedFolioHints(mergedStructured, consolidatedExtractionInputs)
                  workingData = merged
                  dataRef.current = merged
                  return merged
                })
              }
            } else {
              const errText = await extractResp.text().catch(() => '')
              console.warn('[PreavisoChat] consolidated /extract non-ok', {
                request_id: consolidatedRequestId,
                status: extractResp.status,
                body: errText?.slice(0, 350),
                documents_count: consolidatedExtractionInputs.length,
              })
            }
          }
        } catch (extractError: any) {
          console.warn('[PreavisoChat] consolidated /extract error', {
            message: extractError?.message || 'extract_error',
            documents_count: consolidatedExtractionInputs.length,
          })
        }
      }

      if (batchAbort.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      setProcessingProgress(90) // 90% después de procesar todos los archivos

      setProcessingProgress(95) // 95% consultando al agente

      // CRÍTICO: Sincronizar workingData con dataRef.current justo antes de enviar contexto al chat
      // Esto asegura que tengamos la última versión del contexto, incluyendo _document_intent
      // que se establece cuando el asistente pregunta por el cónyuge
      workingData = dataRef.current
      workingDocs = uploadedDocumentsRef.current

      // DEBUG: verificar que el chat reciba el contexto actualizado (incluye _document_intent y cónyuge si ya fue capturado)
      
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
          if (extracted.direccion || extracted.ubicacion) info += `Objeto de compraventa: ${extracted.direccion || extracted.ubicacion}\n`
          if (extracted.tipoDocumento) info += `Tipo: ${extracted.tipoDocumento}\n`
          return info.trim()
        })
        .join('\n\n')

      const { data: { session: chatSession } } = await supabase.auth.getSession()
      const chatHeaders: HeadersInit = { 'Content-Type': 'application/json' }
      if (chatSession?.access_token) {
        chatHeaders['Authorization'] = `Bearer ${chatSession.access_token}`
      }
      if (!conversationIdRef.current) {
        throw new Error('No se pudo resolver chatId para /api/ai/chat')
      }
      const effectiveTramiteIdForChat = batchTramiteIdRef.current ?? activeTramiteIdRef.current ?? activeTramiteId ?? null
      if (effectiveTramiteIdForChat) {
        try {
          const snapshotForChat = {
            ...workingData,
            documentos: Array.isArray(newDocuments) ? Array.from(new Set(newDocuments)) : (workingData.documentos || []),
          }
          await fetch(`/api/expedientes/tramites?id=${effectiveTramiteIdForChat}`, {
            method: 'PUT',
            headers: chatHeaders,
            signal: batchAbort.signal,
            body: JSON.stringify({
              datos: snapshotForChat,
            }),
          })
        } catch (persistError) {
          console.warn('[PreavisoChat] No se pudo persistir snapshot antes de /api/ai/chat', persistError)
        }
      }

      const chatResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: chatHeaders,
        signal: batchAbort.signal,
        body: JSON.stringify({
          chatId: conversationIdRef.current,
          tramiteId: effectiveTramiteIdForChat,
          message: userText || `He subido el siguiente documento: ${fileNames.join(', ')}`,
          uiContext: {
            pluginType: 'preaviso',
            uiAction: 'chat_after_document_process',
            currentStep: serverState?.current_state || undefined,
            hasDocument: false,
            lastQuestionIntent: (workingData as any)?._last_question_intent ?? undefined,
            detectedPeople: Array.isArray((workingData as any)?.personas_detectadas_no_clasificadas)
              ? ((workingData as any).personas_detectadas_no_clasificadas as any[])
                  .map((p: any) => String(p?.nombre || '').trim())
                  .filter(Boolean)
                  .slice(0, 6)
              : [],
          },
        })
      })
      console.info('[PreavisoChat] outgoing_context_summary', {
        conversation_id: conversationIdRef.current || null,
        tramite_id: batchTramiteIdRef.current ?? activeTramiteId ?? null,
        folio_real: workingData?.inmueble?.folio_real ?? null,
        partidas_count: Array.isArray(workingData?.inmueble?.partidas) ? workingData.inmueble.partidas.length : 0,
        vendedores_count: Array.isArray(workingData?.vendedores) ? workingData.vendedores.length : 0,
        documentos_count: Array.isArray(newDocuments) ? newDocuments.length : 0,
      })

      setProcessingProgress(100) // 100% completado

      if (chatResponse.ok) {
        const result = await chatResponse.json()
        syncRouterActionsFromResult(result)
        if (result?.state) {
          setServerState(result.state as ServerStateSnapshot)
        }
        // Aplicar `data` estructurada del backend (incluye flags runtime como _document_intent)
        if (result?.data) {
          setData(prevData => {
            const nextData = { ...prevData }
            const d = result.data
            if (d.tipoOperacion !== undefined) nextData.tipoOperacion = d.tipoOperacion
            if (Object.prototype.hasOwnProperty.call(d, '_document_intent')) (nextData as any)._document_intent = (d as any)._document_intent
            if (Object.prototype.hasOwnProperty.call(d, '_document_people_pending')) (nextData as any)._document_people_pending = (d as any)._document_people_pending
            if (Object.prototype.hasOwnProperty.call(d, '_last_question_intent')) (nextData as any)._last_question_intent = (d as any)._last_question_intent

            if (d.vendedores !== undefined) nextData.vendedores = inferMarriageStatus(d.vendedores as any)
            if (d.compradores !== undefined) nextData.compradores = inferMarriageStatus(d.compradores as any)
            if (Object.prototype.hasOwnProperty.call(d, 'creditos')) nextData.creditos = d.creditos as any
            if (d.gravamenes !== undefined) nextData.gravamenes = d.gravamenes as any
            if (d.inmueble) nextData.inmueble = d.inmueble as any
            if (d.folios !== undefined) nextData.folios = d.folios as any
            if (d.control_impresion) nextData.control_impresion = d.control_impresion
            if (d.validaciones) nextData.validaciones = d.validaciones
            const actos = determineActosNotariales(nextData)
            nextData.actosNotariales = {
              cancelacionCreditoVendedor: actos.cancelacionCreditoVendedor,
              compraventa: actos.compraventa,
              aperturaCreditoComprador: actos.aperturaCreditoComprador ?? false
            }

            // CRÍTICO: dataRef.current se actualiza automáticamente en el useEffect cuando data cambia
            // Pero necesitamos actualizar workingData inmediatamente para que esté disponible en este batch
            // Nota: dataRef.current se actualizará cuando React ejecute el useEffect, pero workingData
            // se actualiza aquí mismo porque está en el scope del handleFileUpload
            workingData = nextData
            dataRef.current = nextData

            return nextData
          })
        }
        const ragAnswer = typeof result?.answer === 'string' ? result.answer : null
        const legacyMessage = typeof result?.message === 'string' ? result.message : null
        const messagesToAdd = Array.isArray(result?.messages)
          ? result.messages
          : [ragAnswer || legacyMessage || 'No encontré suficiente evidencia para responder con certeza.']

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

        const uncategorizedMessage = buildUncategorizedPeopleMessage(workingData)
        if (uncategorizedMessage) {
          const helperMessage: ChatMessage = {
            id: `uncategorized-${Date.now()}`,
            role: 'assistant',
            content: uncategorizedMessage,
            timestamp: new Date()
          }
          setMessages(prev => {
            const exists = prev.some(m =>
              m.role === 'assistant' &&
              typeof m.content === 'string' &&
              m.content.trim() === uncategorizedMessage.trim()
            )
            if (exists) return prev
            return [...prev, helperMessage]
          })
        }

        const folioCandidatesMessage = buildFolioCandidatesMessage(workingData)
        if (folioCandidatesMessage) {
          const helperMessage: ChatMessage = {
            id: `folio-candidates-${Date.now()}`,
            role: 'assistant',
            content: folioCandidatesMessage,
            timestamp: new Date()
          }
          setMessages(prev => {
            const exists = prev.some(m =>
              m.role === 'assistant' &&
              typeof m.content === 'string' &&
              m.content.trim() === folioCandidatesMessage.trim()
            )
            if (exists) return prev
            return [...prev, helperMessage]
          })
        }
      }

      return { updatedData: workingData, updatedDocs: workingDocs }
    } catch (error) {
      if ((error as any)?.name === 'AbortError' || batchAbort.signal.aborted || cancelDocumentBatchRequestedRef.current) {
        await updateDocumentJob(batchJobId, {
          status: 'cancelled',
          processedDocs: completedCount,
          failedDocs: errorCount,
          totalDocs: totalWorkItems,
          message: 'cancelled_by_user',
        })
        jobFinalized = true
        // Cancelado por el usuario
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id))
        const cancelMessage: ChatMessage = {
          id: generateMessageId('cancel'),
          role: 'assistant',
          content: 'Proceso cancelado. Puedes volver a intentar cuando gustes.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, cancelMessage])
      } else {
        await updateDocumentJob(batchJobId, {
          status: 'failed',
          processedDocs: completedCount,
          failedDocs: Math.max(1, errorCount),
          totalDocs: totalWorkItems,
          message: 'unexpected_processing_error',
        })
        jobFinalized = true
        console.error('Error procesando documento:', error)
        setMessages(prev => prev.filter(m => m.id !== processingMessage.id))
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Error al procesar el documento. Por favor, intente nuevamente.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } finally {
      if (!jobFinalized && batchJobId) {
        await updateDocumentJob(batchJobId, {
          status: 'completed',
          processedDocs: completedCount,
          failedDocs: errorCount,
          totalDocs: totalWorkItems,
          message: 'completed',
        })
        jobFinalized = true
      }
      if (jobFinalized) {
        currentDocumentJobIdRef.current = null
        try { localStorage.removeItem(getJobStorageKey()) } catch {}
      }
      setIsProcessing(false)
      setIsProcessingDocument(false)
      isSubmittingRef.current = false // Liberar lock tambien aqui por si acaso
      setProcessingProgress(0)
      setProcessingProgress(0)
      setProcessingFileName(null)
      // Limpiar abort controller del batch actual
      if (documentBatchAbortRef.current === batchAbort) {
        documentBatchAbortRef.current = null
      }
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
      // Solo agregar a pendientes, no procesar aún
      setPendingFiles(prev => [...prev, ...Array.from(files)])
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
          // Función helper para validar institución
          const esInstitucionValida = (institucion: string | null | undefined): boolean => {
            if (!institucion || typeof institucion !== 'string') return false

            const valoresInvalidos = [
              'credito', 'crédito', 'el credito', 'el crédito', 'un credito', 'un crédito',
              'hipoteca', 'la hipoteca', 'un hipoteca', 'financiamiento', 'el financiamiento',
              'prestamo', 'préstamo', 'el prestamo', 'el préstamo', 'banco', 'el banco',
              'institucion', 'institución', 'la institucion', 'la institución', 'una institucion',
              'una institución', 'institución crediticia', 'institucion crediticia',
              'entidad', 'la entidad', 'una entidad', 'entidad financiera',
              'el credito del comprador', 'el crédito del comprador', 'credito del comprador',
              'crédito del comprador', 'el credito que', 'el crédito que', 'credito que', 'crédito que'
            ]

            const institucionNormalizada = institucion.toLowerCase().trim()
            const esInvalido = valoresInvalidos.some(invalido => {
              const regex = new RegExp(`^${invalido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$|[.,;:])`, 'i')
              return regex.test(institucionNormalizada)
            })

            // También validar si contiene solo palabras genéricas
            const palabrasGenericas = /\b(el|la|un|una|del|de|los|las|que|con|por|para|mediante|a través de)\b/gi
            const textoSinGenericos = institucionNormalizada.replace(palabrasGenericas, '').trim()
            const esSoloGenerico = textoSinGenericos.length === 0 ||
              ['credito', 'crédito', 'hipoteca', 'banco', 'institucion', 'institución', 'entidad', 'financiamiento'].includes(textoSinGenericos)

            return !esInvalido && !esSoloGenerico && institucion.length >= 3
          }

          const normalizedCreditos: CreditoElement[] = jsonData.creditos.map((c: any) => {
            // Validar institución antes de agregar - rechazar valores genéricos
            const institucionValida = esInstitucionValida(c.institucion) ? c.institucion : null

            return {
              credito_id: c?.credito_id ?? null,
              institucion: institucionValida,
              monto: c?.monto ?? null,
              participantes: Array.isArray(c?.participantes) ? c.participantes : [],
              tipo_credito: c?.tipo_credito ?? null
            }
          }).filter(c => c.institucion !== null) // Filtrar créditos sin institución válida

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
              ? (typeof jsonData.inmueble.direccion === 'string'
                ? jsonData.inmueble.direccion
                : (typeof inmuebleBase.direccion === 'object'
                  ? { ...inmuebleBase.direccion, ...jsonData.inmueble.direccion }
                  : jsonData.inmueble.direccion))
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

          if (jsonData.inmueble.folioReal) {
            inmuebleUpdates.folio_real = jsonData.inmueble.folioReal
          }
          if (jsonData.inmueble.partida) {
            inmuebleUpdates.partidas = [...inmuebleUpdates.partidas, jsonData.inmueble.partida]
          }
          if (jsonData.inmueble.direccion && typeof jsonData.inmueble.direccion === 'string') {
            if (typeof inmuebleUpdates.direccion === 'object') {
              inmuebleUpdates.direccion = { ...inmuebleUpdates.direccion, calle: jsonData.inmueble.direccion }
            } else {
              inmuebleUpdates.direccion = jsonData.inmueble.direccion
            }
          }
          if (jsonData.inmueble.lote) inmuebleUpdates.datos_catastrales.lote = jsonData.inmueble.lote
          if (jsonData.inmueble.manzana) inmuebleUpdates.datos_catastrales.manzana = jsonData.inmueble.manzana
          if (jsonData.inmueble.fraccionamiento) inmuebleUpdates.datos_catastrales.fraccionamiento = jsonData.inmueble.fraccionamiento
          if (jsonData.inmueble.condominio) inmuebleUpdates.datos_catastrales.condominio = jsonData.inmueble.condominio
          if (jsonData.inmueble.unidad) inmuebleUpdates.datos_catastrales.unidad = jsonData.inmueble.unidad
          if (jsonData.inmueble.modulo) inmuebleUpdates.datos_catastrales.modulo = jsonData.inmueble.modulo
          if (jsonData.inmueble.colonia && typeof inmuebleUpdates.direccion === 'object') {
            inmuebleUpdates.direccion.colonia = jsonData.inmueble.colonia
          }

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
      // Establecer creditos = [] cuando el usuario explícitamente confirma contado
      // Esto marca creditosProvided = true y ESTADO_1 como completed
      updates.creditos = []
      hasUpdates = true
    } else if (seraCreditoMatch || creditoMatch || (creditoSimpleMatch && userInput.match(/(?:sí|si|yes|correcto|afirmativo|de acuerdo|ok|okay|vale|está bien|confirmo|confirmado)/i))) {
      // Crédito detectado (v1.4)
      // Solo establecer creditos si el usuario explícitamente confirma crédito
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

        // VALIDACIÓN: Rechazar valores genéricos que NO son instituciones reales
        const valoresInvalidos = [
          'credito', 'crédito', 'el credito', 'el crédito', 'un credito', 'un crédito',
          'hipoteca', 'la hipoteca', 'un hipoteca', 'financiamiento', 'el financiamiento',
          'prestamo', 'préstamo', 'el prestamo', 'el préstamo', 'banco', 'el banco',
          'institucion', 'institución', 'la institucion', 'la institución', 'una institucion',
          'una institución', 'institución crediticia', 'institucion crediticia',
          'entidad', 'la entidad', 'una entidad', 'entidad financiera',
          'el credito del comprador', 'el crédito del comprador', 'credito del comprador',
          'crédito del comprador', 'el credito que', 'el crédito que', 'credito que', 'crédito que'
        ]

        const institucionNormalizada = institucion.toLowerCase().trim()
        const esInvalido = valoresInvalidos.some(invalido => {
          // Comparación exacta o que empiece con el valor inválido seguido de espacio/puntuación
          const regex = new RegExp(`^${invalido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$|[.,;:])`, 'i')
          return regex.test(institucionNormalizada)
        })

        // También validar si contiene solo palabras genéricas
        const palabrasGenericas = /\b(el|la|un|una|del|de|los|las|que|con|por|para|mediante|a través de)\b/gi
        const textoSinGenericos = institucionNormalizada.replace(palabrasGenericas, '').trim()
        const esSoloGenerico = textoSinGenericos.length === 0 ||
          ['credito', 'crédito', 'hipoteca', 'banco', 'institucion', 'institución', 'entidad', 'financiamiento'].includes(textoSinGenericos)

        // Si es un valor inválido o solo genérico, NO actualizar
        if (esInvalido || esSoloGenerico) {
          institucionMatch = null
        }
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


    const nombrePattern = /(?:nombre|vendedor|comprador)[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/gi
    const nombres = [...userInput.matchAll(nombrePattern)]


    const rfcPattern = /RFC[:\s]+([A-Z]{3,4}\d{6}[A-Z0-9]{3})/gi
    const rfcMatch = userInput.match(rfcPattern)


    const curpPattern = /CURP[:\s]+([A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d)/gi
    const curpMatch = userInput.match(curpPattern)


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

  if (!sessionReady) {
    return (
      <div className={`${(isMobile || isTablet) ? 'min-h-screen' : 'h-full'} flex flex-col items-center justify-center gap-4`}>
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <p className="text-sm text-gray-600">Preparando chat...</p>
      </div>
    )
  }

  return (
    <div
      className={`${(isMobile || isTablet) ? 'h-auto min-h-screen' : 'h-full'} flex flex-col gap-4 ${(isMobile || isTablet) ? '' : 'overflow-hidden'} relative`}
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

      {/* Botón para mostrar panel si está oculto - Arriba del chat */}
      {!showDataPanel && (
        <div className='flex justify-end mb-4'>
          <Button
            variant="outline"
            className="gap-2 h-9 px-4 shrink-0 hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm"
            onClick={() => {
              setShowDataPanel(true)
              setHidePanelsAfterMessage(false)
            }}
          >
            <Eye className="h-4 w-4" />
            <span className="text-sm font-medium">Mostrar informacion capturada</span>
          </Button>
        </div>
      )}

      <div className={`${(isMobile || isTablet) ? 'flex-none' : 'flex-1'} flex ${!showDataPanel
        ? 'flex-col'
        : (isMobile || isTablet)
          ? 'flex-col h-auto'
          : ''
        } gap-4 ${(isMobile || isTablet) ? 'min-h-0' : 'min-h-0 overflow-hidden'}`}>


        {/* Chat principal */}
        <Card className={`${(isMobile || isTablet) ? 'flex-none' : 'flex-1'} p-0 flex flex-col shadow-xl border border-gray-200 overflow-hidden bg-white ${(isMobile || isTablet) ? 'min-h-[550px]' : 'min-h-0'
          }`}>
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {/* Header moderno */}
            <div className="border-b border-gray-200/80 bg-gradient-to-r from-white via-gray-50/50 to-white backdrop-blur-sm px-6 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative group">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br f from-slate-100 to-slate-300 flex items-center justify-center shadow-lg ring-2 ring-blue-100  transition-all">
                      <Bot className="w-5 h-5 text-black" />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow-sm">
                      <div className="w-full h-full bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className={`font-semibold ${isMobile ? 'text-sm' : 'text-base'} text-gray-900`}>Asistente de Pre-Aviso</h3>
                      <span className={`px-2 py-0.5 ${isMobile ? 'text-[10px]' : 'text-xs'} font-medium bg-blue-100 text-blue-700 rounded-full`}>
                        En línea
                      </span>
                    </div>
                    <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-0.5 flex items-center space-x-1`}>
                      <span>Compraventa de Inmueble</span>
                      {!isMobile && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span>Notaría Pública #3</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
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
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={handleNewChat} className="cursor-pointer hover:!bg-gray-100 focus:!bg-gray-100 focus:!text-gray-900">
                        <MessageSquarePlus className="mr-2 h-4 w-4" />
                        Nuevo chat
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeleteSession} className="cursor-pointer text-red-600 hover:!bg-gray-100 focus:!bg-gray-100 focus:!text-red-700">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar conversación
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Messages con diseño moderno */}
            <div className="flex-1 overflow-hidden bg-gradient-to-b from-gray-50/50 to-white">
              <div className="h-full overflow-auto">
                <div className="p-6 space-y-4">
                  {messages.map((message) => (
                    <ChatMessageItem
                      key={message.id}
                      message={message}
                      isProcessingDocument={isProcessingDocument}
                      processingFileName={processingFileName}
                      processingProgress={processingProgress}
                      uploadedDocuments={uploadedDocuments}
                    />
                  ))}

                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="flex items-end space-x-2">
                        <div className="w-8 h-8 rounded-xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-300  flex items-center justify-center flex-shrink-0 shadow-sm mb-1 ring-1 ring-white/20">
                          <Bot className="w-5 h-5 text-black" />
                        </div>
                        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
                          <div className="flex space-x-1.5">
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}


                  <div ref={scrollRef} />
                </div>
              </div>
            </div>


            {/* Input moderno */}
            <div className="border-t border-gray-200 bg-white px-4 py-2.5">
              <div className="flex items-end">
                {/* Input de texto moderno con iconos dentro */}
                <div className="flex-1 relative">
                  {/* Contenedor del input con borde y fondo */}
                  <div className="border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 rounded-2xl bg-gray-50 focus-within:bg-white transition-all">

                    {/* Panel de archivos pendientes dentro del input */}
                    {pendingFiles.length > 0 && !hidePanelsAfterMessage && (
                      <div className="px-3 pt-3 pb-2 border-b border-gray-200">
                        <div className="mb-2">
                          <p className="text-xs text-gray-500 font-medium">Archivos pendientes (se procesarán al enviar):</p>
                        </div>
                        <div className="w-full overflow-y-auto overflow-x-hidden" style={{ maxHeight: '300px', width: '100%' }}>
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3 pb-2" style={{ width: '100%' }}>
                            {pendingFiles.map((file, index) => {
                              const fileUrl = URL.createObjectURL(file)
                              const isImage = file.type.startsWith('image/')
                              const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

                              return (
                                <div
                                  key={`pending-${index}-${file.name}`}
                                  className="group relative flex-shrink-0 w-24 bg-white rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-400 hover:shadow-lg transition-all duration-200 overflow-hidden"
                                >
                                  {/* Preview */}
                                  <div className="relative h-20 bg-gradient-to-br from-blue-50 to-blue-100">
                                    {isImage ? (
                                      <img
                                        src={fileUrl}
                                        alt={file.name}
                                        className="w-full h-full object-cover opacity-70"
                                        onLoad={() => URL.revokeObjectURL(fileUrl)}
                                      />
                                    ) : isPDF ? (
                                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
                                        <FileText className="h-6 w-6 text-red-500 opacity-70" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                                        <FileText className="h-6 w-6 text-blue-500 opacity-70" />
                                      </div>
                                    )}

                                    {/* Badge de pendiente */}
                                    <div className="absolute top-1.5 right-1.5 bg-blue-500 rounded-full p-1 shadow-lg">
                                      <Upload className="h-2.5 w-2.5 text-white" />
                                    </div>

                                    {/* Botón para eliminar */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        URL.revokeObjectURL(fileUrl)
                                        setPendingFiles(prev => prev.filter((_, i) => i !== index))
                                      }}
                                      className="absolute top-1.5 left-1.5 bg-red-500 hover:bg-red-600 rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Eliminar archivo"
                                    >
                                      <X className="h-2.5 w-2.5 text-white" />
                                    </button>
                                  </div>

                                  {/* Información */}
                                  <div className="p-2 bg-white">
                                    <p className="text-xs font-medium text-gray-900 truncate mb-0.5" title={file.name}>
                                      {file.name}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {pendingRouterCommit && (
                      <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-amber-900">
                          {pendingRouterCommit.mode === 'document_generation'
                            ? 'La generacion del documento esta lista para confirmar.'
                            : `Hay ${pendingRouterCommit.count} cambio(s) propuesto(s) pendientes por confirmar.`}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleConfirmProposedUpdates}
                          disabled={isProcessing || isProcessingDocument}
                          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {pendingRouterCommit.mode === 'document_generation' ? 'Generar documento' : 'Aplicar cambios'}
                        </Button>
                      </div>
                    )}

                    {/* Contenedor relativo para el textarea y los iconos */}
                    <div className="relative">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.docx"
                        onChange={(e) => {
                          const files = e.target.files
                          if (files && files.length > 0) {
                            // Solo agregar a pendientes, no procesar aún
                            setPendingFiles(prev => [...prev, ...Array.from(files)])
                          }
                          // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
                          // Usar setTimeout para asegurar que se resetee después de procesar los archivos
                          setTimeout(() => {
                            if (e.target) {
                              e.target.value = ''
                            }
                          }, 0)
                        }}
                        className="hidden"
                      />

                      <Textarea
                        ref={textInputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                          }
                        }}
                        placeholder="Escribe tu mensaje o pega una imagen (Ctrl+V / Cmd+V)..."
                        className="min-h-[44px] max-h-[120px] resize-none border-0 bg-transparent focus:ring-0 focus-visible:ring-0 pl-12 pr-12 py-3"
                        disabled={isProcessing || isProcessingDocument}
                      />

                      {/* Botón de adjuntar archivos dentro del input - izquierda */}
                      <Button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          // Asegurar que el input esté reseteado antes de abrir el diálogo
                          if (fileInputRef.current) {
                            fileInputRef.current.value = ''
                            fileInputRef.current.click()
                          }
                        }}
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 bottom-2 h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-blue-600 transition-colors"
                        title="Adjuntar documentos"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>

                      {/* Botón de enviar dentro del input - derecha */}
                      <Button
                        onClick={(isProcessing || isProcessingDocument) ? cancelMessageRequest : handleSend}
                        disabled={!(isProcessing || isProcessingDocument) && (!input.trim() && pendingFiles.length === 0)}
                        className="absolute right-2 bg-transparent bottom-2 h-8 w-8 rounded-lg hover:bg-gray-100 text-black disabled:opacity-50 disabled:cursor-not-allowed "
                        size="icon"
                        title={(isProcessing || isProcessingDocument) ? "Cancelar solicitud" : (pendingFiles.length > 0 ? "Procesar archivos y enviar" : "Enviar mensaje")}
                      >
                        {(isProcessing || isProcessingDocument) ? (
                          <Square className="h-4 w-4 fill-current" />
                        ) : (
                          <ArrowUp className="h-4 w-4" />
                        )}
                      </Button>

                      {/* Contador de caracteres o indicador */}
                      {input.length > 0 && (
                        <div className="absolute bottom-2 right-12 text-xs text-gray-400">
                          {input.length}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Indicador de tipos de archivo aceptados */}
              <div className="mt-2 flex items-center justify-start space-x-4 text-xs text-gray-400">
                <span className="flex items-center space-x-1">
                  <FileText className="h-3 w-3" />
                  <span>Sube tus archivos PDF, JPG, PNG, DOCX (Máx. 20MB)</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Panel de información extraída - Mobile/Tablet (abajo) o Desktop (derecha) */}
        {showDataPanel && (
          <DocumentSidebar
            data={data}
            serverState={serverState}
            isVisible={showDataPanel}
            onClose={(isMobile || isTablet) ? () => setShowDataPanel(false) : undefined}
            onSelectFolioCandidate={handleSidebarFolioSelect}
            onSelectUncategorizedPerson={handleSidebarPersonSelect}
            bottomActions={
              showExportButtons && exportData ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Documento listo</p>
                  <PreavisoExportOptions
                    data={exportData}
                    onExportComplete={() => {}}
                    onViewFullDocument={onViewFullDocument || (() => onGenerateDocument(exportData))}
                  />
                </div>
              ) : null
            }
          />
        )}
      </div>



      {/* Dialog de confirmación para nuevo chat */}
      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Iniciar un nuevo chat?</DialogTitle>
            <DialogDescription>
              Se guardará la conversación actual en el historial y comenzarás un trámite nuevo desde cero.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer bg-white border hover:bg-gray-100 text-black hover:text-black py-2.5"
              onClick={() => setShowNewChatDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmNewChat}
              className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
