"use client"

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { PreavisoChat, type PreavisoData } from '@/components/preaviso-chat'
import type { PreavisoDocument } from '@/lib/preaviso-generator'
import { PreavisoTemplateRenderer } from '@/lib/preaviso-template-renderer'
import { PreavisoExportOptions } from '@/components/preaviso-export-options'
import { createBrowserClient } from '@/lib/supabase'
import { useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
  FileText, 
  Download, 
  Edit, 
  CheckCircle2,
  ArrowLeft,
  Save,
  File,
  FileText as FileTextIcon,
  ChevronDown
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type AppState = 'chat' | 'document' | 'editing'

export default function PreavisoPage() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const { user: authUser } = useAuth()
  const [appState, setAppState] = useState<AppState>('chat')
  const [preavisoData, setPreavisoData] = useState<PreavisoData | null>(null)
  const [document, setDocument] = useState<PreavisoDocument | null>(null)
  const [editedDocument, setEditedDocument] = useState<string>('')
  const [showExportButtons, setShowExportButtons] = useState(false)
  const [exportData, setExportData] = useState<PreavisoData | null>(null)

  const handleDataComplete = (data: PreavisoData) => {
    setPreavisoData(data)
  }

  const handleGenerateDocument = async (data: PreavisoData, uploadedDocuments?: any[], activeTramiteId?: string | null) => {
    try {
      // Asegurar que preavisoData esté establecido antes de cambiar el estado
      setPreavisoData(data)
      
      // Generar documento usando los mismos templates que Word/PDF
      const simplifiedData = PreavisoTemplateRenderer.convertFromPreavisoData(data)
      const text = await PreavisoTemplateRenderer.renderToText(simplifiedData)
      const html = await PreavisoTemplateRenderer.renderToHTML(simplifiedData)
      
      // Crear documento compatible con PreavisoDocument usando el texto generado
      const generatedDoc: PreavisoDocument = {
        title: 'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO',
        sections: [
          {
            id: 'documento',
            title: 'Documento Completo',
            content: text,
            type: 'body',
            order: 1
          }
        ],
        html: html,
        text: text
      }
      
      setDocument(generatedDoc)
      setEditedDocument(text)
      setAppState('document')

      // Guardar en expedientes (async, no bloquea la UI)
      try {
        await savePreavisoToExpedientes(data, generatedDoc, uploadedDocuments, activeTramiteId)
      } catch (error) {
        console.error('Error guardando en expedientes (no crítico):', error)
        // No mostrar error al usuario, es opcional
      }
    } catch (error) {
      console.error('Error generando documento:', error)
      alert('Error al generar el documento. Por favor, intenta de nuevo.')
    }
  }

  const savePreavisoToExpedientes = async (
    data: PreavisoData, 
    doc: PreavisoDocument,
    uploadedDocuments?: any[],
    existingTramiteId?: string | null
  ) => {
    // 1. Buscar o crear comprador usando findOrCreate
    let comprador
    try {
      // Intentar crear primero
      // Obtener token de la sesión
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      // Validar que tengamos al menos nombre o CURP para crear/buscar comprador (v1.4)
      const primerComprador = data.compradores?.[0]
      const compradorNombre = primerComprador?.persona_fisica?.nombre || primerComprador?.persona_moral?.denominacion_social
      const compradorCurp = primerComprador?.persona_fisica?.curp
      const compradorRfc = primerComprador?.persona_fisica?.rfc || primerComprador?.persona_moral?.rfc
      
      if (!compradorNombre && !compradorCurp) {
        throw new Error('No se puede crear/buscar comprador sin nombre o CURP')
      }

      const createResponse = await fetch('/api/expedientes/compradores', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nombre: compradorNombre || '',
          rfc: compradorRfc || null,
          curp: compradorCurp || '',
        }),
      })

      if (createResponse.ok) {
        comprador = await createResponse.json()
      } else if (createResponse.status === 409) {
        // Ya existe, buscarlo por CURP o nombre
        const { data: { session: searchSession } } = await supabase.auth.getSession()
        const searchHeaders: HeadersInit = {}
        if (searchSession?.access_token) {
          searchHeaders['Authorization'] = `Bearer ${searchSession.access_token}`
        }

        // Intentar buscar por CURP primero, luego por RFC, luego por nombre
        let searchResponse
        if (compradorCurp) {
          searchResponse = await fetch(`/api/expedientes/compradores?curp=${encodeURIComponent(compradorCurp)}`, {
            headers: searchHeaders,
          })
        } else if (compradorRfc) {
          searchResponse = await fetch(`/api/expedientes/compradores?rfc=${encodeURIComponent(compradorRfc)}`, {
            headers: searchHeaders,
          })
        } else if (compradorNombre) {
          searchResponse = await fetch(`/api/expedientes/compradores?nombre=${encodeURIComponent(compradorNombre)}`, {
            headers: searchHeaders,
          })
        }

        if (searchResponse && searchResponse.ok) {
          comprador = await searchResponse.json()
        } else {
          throw new Error('No se pudo obtener el comprador existente')
        }
      } else {
        const errorText = await createResponse.text()
        // Caso conocido (mientras no se aplique la migración que hace RFC nullable en Supabase):
        // Evitar que la vista previa falle/ensucie consola si el RFC aún es NOT NULL en la BD.
        if (
          createResponse.status >= 500 &&
          /violates not-null constraint/i.test(errorText) &&
          /column\s+\\"rfc\\"/i.test(errorText)
        ) {
          console.warn('[preaviso] No se pudo crear comprador porque RFC aún es NOT NULL en BD. Omitiendo guardado en expedientes para no bloquear vista previa.')
          return
        }

        console.error('Error creando comprador:', createResponse.status, errorText)
        throw new Error(`Error creando/buscando comprador: ${createResponse.status} - ${errorText}`)
      }
    } catch (error) {
      console.error('Error en comprador:', error)
      throw error
    }

    // 2. Si hay trámite existente, actualizarlo; si no, crear uno nuevo
    let tramite
    if (existingTramiteId) {
      // Actualizar trámite existente con comprador y datos finales
      // Obtener token para actualizar trámite
      const { data: { session: updateSession } } = await supabase.auth.getSession()
      const updateHeaders: HeadersInit = { 'Content-Type': 'application/json' }
      if (updateSession?.access_token) {
        updateHeaders['Authorization'] = `Bearer ${updateSession.access_token}`
      }

      const updateResponse = await fetch(`/api/expedientes/tramites?id=${existingTramiteId}`, {
        method: 'PUT',
        headers: updateHeaders,
        body: JSON.stringify({
          compradorId: comprador.id,
          datos: {
            tipoOperacion: data.tipoOperacion,
            vendedores: data.vendedores,
            compradores: data.compradores,
            creditos: data.creditos,
            gravamenes: data.gravamenes,
            inmueble: data.inmueble,
            actosNotariales: data.actosNotariales,
          },
          estado: 'completado',
        }),
      })

      if (!updateResponse.ok) {
        throw new Error('Error actualizando trámite')
      }

      tramite = await updateResponse.json()
    } else {
      // Crear nuevo trámite
      // Obtener token para crear trámite
      const { data: { session: tramiteSession } } = await supabase.auth.getSession()
      const tramiteHeaders: HeadersInit = { 'Content-Type': 'application/json' }
      if (tramiteSession?.access_token) {
        tramiteHeaders['Authorization'] = `Bearer ${tramiteSession.access_token}`
      }

      const tramiteResponse = await fetch('/api/expedientes/tramites', {
        method: 'POST',
        headers: tramiteHeaders,
        body: JSON.stringify({
          compradorId: comprador.id,
          tipo: 'preaviso',
          datos: {
            tipoOperacion: data.tipoOperacion,
            vendedores: data.vendedores,
            compradores: data.compradores,
            creditos: data.creditos,
            gravamenes: data.gravamenes,
            inmueble: data.inmueble,
            actosNotariales: data.actosNotariales,
          },
          estado: 'completado',
        }),
      })

      if (!tramiteResponse.ok) {
        throw new Error('Error creando trámite')
      }

      tramite = await tramiteResponse.json()
    }

    // 3. Actualizar comprador_id de documentos que fueron subidos durante el borrador
    if (existingTramiteId) {
      try {
        const { DocumentoService } = await import('@/lib/services/documento-service')
        await DocumentoService.updateDocumentosCompradorId(tramite.id, comprador.id)
      } catch (error) {
        console.error('Error actualizando comprador_id de documentos:', error)
        // Continuar aunque falle
      }
    }

    // 4. Subir documentos si existen (solo los que no fueron subidos durante el borrador)
    if (uploadedDocuments && uploadedDocuments.length > 0) {
      for (const uploadedDoc of uploadedDocuments) {
        if (uploadedDoc.file && uploadedDoc.processed) {
          try {
            // Determinar tipo de documento
            const detectDocumentType = (fileName: string): string => {
              const name = fileName.toLowerCase()
              if (name.includes('escritura') || name.includes('titulo') || name.includes('propiedad')) return 'escritura'
              if (name.includes('plano') || name.includes('croquis') || name.includes('catastral')) return 'plano'
              if (name.includes('ine') || name.includes('ife') || name.includes('identificacion')) {
                // Determinar si es vendedor o comprador basado en el contexto
                return 'ine_comprador' // Por defecto comprador, se puede mejorar
              }
              return 'escritura'
            }

            const docType = detectDocumentType(uploadedDoc.name)

            // Subir documento (si no fue subido durante el borrador)
            // Los documentos ya subidos durante el borrador solo necesitan actualizar comprador_id
            const formData = new FormData()
            formData.append('file', uploadedDoc.file)
            formData.append('compradorId', comprador.id)
            formData.append('tipo', docType)
            formData.append('tramiteId', tramite.id)

            const uploadResponse = await fetch('/api/expedientes/documentos/upload', {
              method: 'POST',
              body: formData,
            })

            if (uploadResponse.ok) {
              const documento = await uploadResponse.json()
              
              // Asociar documento al trámite
              // Obtener token para asociar documento
              const { data: { session: associateSession } } = await supabase.auth.getSession()
              const associateHeaders: HeadersInit = { 'Content-Type': 'application/json' }
              if (associateSession?.access_token) {
                associateHeaders['Authorization'] = `Bearer ${associateSession.access_token}`
              }

              await fetch(`/api/expedientes/tramites/${tramite.id}/documentos`, {
                method: 'POST',
                headers: associateHeaders,
                body: JSON.stringify({
                  documentoId: documento.id,
                }),
              })
            }
          } catch (error) {
            console.error(`Error subiendo documento ${uploadedDoc.name}:`, error)
            // Continuar con los demás documentos
          }
        }
      }
    }

    // 4. Guardar referencia del documento generado
    if (doc) {
      // Obtener token para actualizar documento generado
      const { data: { session: docSession } } = await supabase.auth.getSession()
      const docHeaders: HeadersInit = { 'Content-Type': 'application/json' }
      if (docSession?.access_token) {
        docHeaders['Authorization'] = `Bearer ${docSession.access_token}`
      }

      await fetch(`/api/expedientes/tramites?id=${tramite.id}`, {
        method: 'PUT',
        headers: docHeaders,
        body: JSON.stringify({
          documento_generado: {
            formato: 'docx',
            // URL se generará cuando se descargue
          },
        }),
      })
    }
  }

  const handleEdit = () => {
    setAppState('editing')
  }

  const handleSaveEdit = () => {
    if (document) {
      // Actualizar el documento con el texto editado
      const updatedDocument: PreavisoDocument = {
        ...document,
        text: editedDocument,
        html: editedDocument.replace(/\n/g, '<br>')
      }
      setDocument(updatedDocument)
      setAppState('document')
    }
  }

  const handleDownloadWord = async () => {
    if (!preavisoData) return
    
    try {
      const simplifiedData = PreavisoTemplateRenderer.convertFromPreavisoData(preavisoData)
      await PreavisoTemplateRenderer.renderToWordAndDownload(simplifiedData)
    } catch (error) {
      console.error('Error descargando Word:', error)
      alert('Error al descargar el documento. Por favor, intenta de nuevo.')
    }
  }

  const handleDownloadPDF = async () => {
    if (!preavisoData) return
    
    try {
      const simplifiedData = PreavisoTemplateRenderer.convertFromPreavisoData(preavisoData)
      await PreavisoTemplateRenderer.renderToPDFAndDownload(simplifiedData)
    } catch (error) {
      console.error('Error descargando PDF:', error)
      alert('Error al descargar el documento. Por favor, intenta de nuevo.')
    }
  }

  const handleNewPreaviso = () => {
    setAppState('chat')
    setPreavisoData(null)
    setDocument(null)
    setEditedDocument('')
  }

  // Estado: Chat
  if (appState === 'chat') {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6 h-full flex flex-col">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Pre-Aviso de Compraventa</h1>
                  <p className="text-gray-600">
                    Sistema interactivo para generar solicitudes de certificado con efecto de pre-aviso
                  </p>
                </div>
                {showExportButtons && exportData && (
                  <div className="flex gap-2">
                    <PreavisoExportOptions 
                      data={exportData}
                      onExportComplete={() => {
                        // Opcional: ocultar después de exportar
                      }}
                      onViewFullDocument={() => {
                        handleGenerateDocument(exportData)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <PreavisoChat
                onDataComplete={handleDataComplete}
                onGenerateDocument={handleGenerateDocument}
                onExportReady={(data, show) => {
                  setShowExportButtons(show)
                  setExportData(show ? data : null)
                }}
              />
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  // Estado: Documento generado
  if (appState === 'document') {
    // Si no hay documento o datos, volver al chat
    if (!document || !preavisoData) {
      return (
        <ProtectedRoute>
          <DashboardLayout>
            <div className="p-6 space-y-6">
              <div className="text-center py-12">
                <p className="text-gray-600">Generando documento...</p>
              </div>
            </div>
          </DashboardLayout>
        </ProtectedRoute>
      )
    }
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Documento Generado</h1>
                <p className="text-gray-600 mt-1">
                  Revisa el documento y descárgalo en el formato que prefieras
                </p>
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={handleNewPreaviso}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Nuevo Pre-Aviso
                </Button>
                <Button variant="outline" onClick={handleEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>
                      <Download className="h-4 w-4 mr-2" />
                      Descargar
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDownloadWord}>
                      <FileTextIcon className="h-4 w-4 mr-2" />
                      Descargar Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPDF}>
                      <File className="h-4 w-4 mr-2" />
                      Descargar PDF (.pdf)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Resumen de actos notariales */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                  Actos Notariales Determinados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {preavisoData.actosNotariales.cancelacionCreditoVendedor && (
                    <Badge variant="secondary" className="text-sm">
                      Cancelación del crédito del vendedor
                    </Badge>
                  )}
                  {preavisoData.actosNotariales.compraventa && (
                    <Badge variant="secondary" className="text-sm">
                      Compraventa
                    </Badge>
                  )}
                  {preavisoData.actosNotariales.aperturaCreditoComprador && (
                    <Badge variant="secondary" className="text-sm">
                      Apertura de crédito del comprador
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Vista previa del documento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Vista Previa del Documento
                </CardTitle>
                <CardDescription>
                  El documento incluye fundamento legal conforme a la Ley del Notariado y Código Civil de Baja California
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-white border rounded-lg p-6 font-serif text-sm leading-relaxed whitespace-pre-wrap">
                  {document.text}
                </div>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  // Estado: Editando documento
  if (appState === 'editing' && document && preavisoData) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Editar Documento</h1>
                <p className="text-gray-600 mt-1">
                  Modifica el contenido del documento según sea necesario
                </p>
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setAppState('document')}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Cambios
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Contenido del Documento</CardTitle>
                <CardDescription>
                  Edita el texto directamente. Los cambios se guardarán en el documento.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editedDocument}
                  onChange={(e) => setEditedDocument(e.target.value)}
                  className="min-h-[600px] font-mono text-sm"
                  placeholder="Contenido del documento..."
                />
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  return null
}
