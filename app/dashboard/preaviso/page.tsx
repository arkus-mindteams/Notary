"use client"

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { PreavisoChat, type PreavisoData } from '@/components/preaviso-chat'
import type { PreavisoDocument } from '@/lib/preaviso-generator'
import { PreavisoTemplateRenderer } from '@/lib/preaviso-template-renderer'
import { PreavisoExportOptions } from '@/components/preaviso-export-options'
import { WordLikeEditor } from '@/components/preaviso/word-like-editor'
import { createBrowserClient } from '@/lib/supabase'
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Download,
  Edit,
  CheckCircle2,
  ArrowLeft,
  Save,
  FileText as FileTextIcon,
  ChevronDown
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ChatHistory } from '@/components/chat-history'
import { History } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AppState = 'chat' | 'document' | 'editing'

function extractBodyHtml(fullHtml: string, textFallback: string): string {
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch?.[1]) {
    return bodyMatch[1]
  }
  return textFallback
    .split('\n')
    .map((line) => `<p>${line || '&nbsp;'}</p>`)
    .join('')
}

function buildWordLikeHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { background: #f5f5f5; margin: 0; padding: 24px; }
    .page {
      background: #fff;
      max-width: 816px;
      margin: 0 auto;
      min-height: 1056px;
      padding: 72px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
      color: #111827;
      font-family: "Times New Roman", serif;
      font-size: 14pt;
      line-height: 1.55;
    }
    p { margin: 0 0 12px; }
    h1, h2, h3 { margin: 0 0 16px; }
  </style>
</head>
<body>
  <div class="page">${bodyHtml}</div>
</body>
</html>`
}

function htmlToPlainText(html: string): string {
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim()
  }
  const temp = window.document.createElement('div')
  temp.innerHTML = html
  return (temp.innerText || temp.textContent || '').trim()
}

export default function PreavisoPage() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const [appState, setAppState] = useState<AppState>('chat')
  const [preavisoData, setPreavisoData] = useState<PreavisoData | null>(null)
  const [document, setDocument] = useState<PreavisoDocument | null>(null)
  const [editedDocument, setEditedDocument] = useState<string>('')
  const [editedDocumentText, setEditedDocumentText] = useState<string>('')
  const [showExportButtons, setShowExportButtons] = useState(false)
  const [exportData, setExportData] = useState<PreavisoData | null>(null)
  const [showNewPreavisoDialog, setShowNewPreavisoDialog] = useState(false)

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
      setEditedDocument(extractBodyHtml(html, text))
      setEditedDocumentText(text)
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
    _uploadedDocuments?: any[],
    existingTramiteId?: string | null
  ) => {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }

    const response = await fetch('/api/expedientes/preaviso/finalize', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        preavisoData: data,
        tramiteId: existingTramiteId || null,
        generatedDocument: {
          formato: 'docx',
          titulo: doc.title,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Error finalizando preaviso: ${response.status} - ${errorBody}`)
    }
  }

  const handleEdit = () => {
    if (document?.html) {
      setEditedDocument(extractBodyHtml(document.html, document.text || ''))
      setEditedDocumentText(document.text || '')
    }
    setAppState('editing')
  }

  const handleSaveEdit = () => {
    if (document) {
      // Actualizar el documento con el texto editado
      const updatedDocument: PreavisoDocument = {
        ...document,
        text: editedDocumentText || htmlToPlainText(editedDocument),
        html: buildWordLikeHtml(editedDocument)
      }
      setDocument(updatedDocument)
      setAppState('document')
    }
  }

  const handleDownloadWord = async () => {
    if (!preavisoData) return

    try {
      const simplifiedData = PreavisoTemplateRenderer.convertFromPreavisoData(preavisoData)
      // Usar el texto actual del documento (incluye ediciones del usuario) para que el Word exportado refleje los cambios
      await PreavisoTemplateRenderer.renderToWordAndDownload(simplifiedData, {
        customRenderedText: document?.text
      })
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
    setShowNewPreavisoDialog(false)
    setAppState('chat')
    setPreavisoData(null)
    setDocument(null)
    setEditedDocument('')
    setEditedDocumentText('')
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
                <div className="flex flex-col gap-2 items-end">
                  {showExportButtons && exportData ? (
                    <PreavisoExportOptions
                      leadingButtons={
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3">
                              <History className="h-3.5 w-3.5" />
                              <span className="text-xs sm:text-sm">Historial</span>
                            </Button>
                          </SheetTrigger>
                          <SheetContent side="left" className="w-[300px] sm:w-[400px] bg-gray-900 border-r-gray-800 p-0 text-white">
                            <SheetHeader className="p-4 border-b border-gray-800">
                              <SheetTitle className="text-gray-100">Historial de Chats</SheetTitle>
                            </SheetHeader>
                            <div className="p-0">
                              <ChatHistory isCollapsed={false} onSelectSession={() => {}} />
                            </div>
                          </SheetContent>
                        </Sheet>
                      }
                      data={exportData}
                      onExportComplete={() => {}}
                      onViewFullDocument={() => handleGenerateDocument(exportData)}
                    />
                  ) : (
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3">
                          <History className="h-3.5 w-3.5" />
                          <span className="text-xs sm:text-sm">Historial</span>
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="w-[300px] sm:w-[400px] bg-gray-900 border-r-gray-800 p-0 text-white">
                        <SheetHeader className="p-4 border-b border-gray-800">
                          <SheetTitle className="text-gray-100">Historial de Chats</SheetTitle>
                        </SheetHeader>
                        <div className="p-0">
                          <ChatHistory isCollapsed={false} onSelectSession={() => {}} />
                        </div>
                      </SheetContent>
                    </Sheet>
                  )}
                </div>
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
                <Button variant="outline" onClick={() => setShowNewPreavisoDialog(true)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Nuevo Pre-Aviso
                </Button>
                <Dialog open={showNewPreavisoDialog} onOpenChange={setShowNewPreavisoDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>¿Iniciar un nuevo chat?</DialogTitle>
                      <DialogDescription>
                        Se guardará la conversación actual en el historial y comenzarás un trámite nuevo desde cero.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewPreavisoDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleNewPreaviso}>
                        Confirmar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                    {/*
                    <DropdownMenuItem onClick={handleDownloadPDF}>
                      <File className="h-4 w-4 mr-2" />
                      Descargar PDF (.pdf)
                    </DropdownMenuItem>
                    */}
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
                  {preavisoData.actosNotariales?.cancelacionCreditoVendedor && (
                    <Badge variant="secondary" className="text-sm">
                      Cancelación del crédito del vendedor
                    </Badge>
                  )}
                  {preavisoData.actosNotariales?.compraventa && (
                    <Badge variant="secondary" className="text-sm">
                      Compraventa
                    </Badge>
                  )}
                  {preavisoData.actosNotariales?.aperturaCreditoComprador && (
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
                <div className="rounded-lg border bg-muted/20 p-2">
                  <iframe
                    title="Vista previa del documento"
                    srcDoc={document.html}
                    className="h-[900px] w-full rounded-md border bg-white"
                  />
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
                  Editor enriquecido estilo Word para ajustar formato y contenido.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WordLikeEditor
                  initialHtml={editedDocument}
                  onChange={(html, plainText) => {
                    setEditedDocument(html)
                    setEditedDocumentText(plainText)
                  }}
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

