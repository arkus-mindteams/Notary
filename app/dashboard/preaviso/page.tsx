"use client"

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { PreavisoChat, type PreavisoData } from '@/components/preaviso-chat'
import { PreavisoGenerator, type PreavisoDocument } from '@/lib/preaviso-generator'
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
  Save
} from 'lucide-react'

type AppState = 'chat' | 'document' | 'editing'

export default function PreavisoPage() {
  const [appState, setAppState] = useState<AppState>('chat')
  const [preavisoData, setPreavisoData] = useState<PreavisoData | null>(null)
  const [document, setDocument] = useState<PreavisoDocument | null>(null)
  const [editedDocument, setEditedDocument] = useState<string>('')

  const handleDataComplete = (data: PreavisoData) => {
    setPreavisoData(data)
  }

  const handleGenerateDocument = async (data: PreavisoData, uploadedDocuments?: any[], activeTramiteId?: string | null) => {
    try {
      // Generar documento
      const generatedDoc = PreavisoGenerator.generatePreavisoDocument(data)
      setDocument(generatedDoc)
      setEditedDocument(generatedDoc.text)
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
      const createResponse = await fetch('/api/expedientes/compradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: data.comprador.nombre,
          rfc: data.comprador.rfc,
          curp: data.comprador.curp,
        }),
      })

      if (createResponse.ok) {
        comprador = await createResponse.json()
      } else if (createResponse.status === 409) {
        // Ya existe, buscarlo por RFC
        const searchResponse = await fetch(`/api/expedientes/compradores?rfc=${encodeURIComponent(data.comprador.rfc)}`)
        if (searchResponse.ok) {
          comprador = await searchResponse.json()
        } else {
          throw new Error('No se pudo obtener el comprador')
        }
      } else {
        throw new Error('Error creando/buscando comprador')
      }
    } catch (error) {
      console.error('Error en comprador:', error)
      throw error
    }

    // 2. Si hay trámite existente, actualizarlo; si no, crear uno nuevo
    let tramite
    if (existingTramiteId) {
      // Actualizar trámite existente con comprador y datos finales
      const updateResponse = await fetch(`/api/expedientes/tramites?id=${existingTramiteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comprador_id: comprador.id,
          datos: {
            tipoOperacion: data.tipoOperacion,
            vendedor: data.vendedor,
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
      const tramiteResponse = await fetch('/api/expedientes/tramites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compradorId: comprador.id,
          tipo: 'preaviso',
          datos: {
            tipoOperacion: data.tipoOperacion,
            vendedor: data.vendedor,
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
              await fetch(`/api/expedientes/tramites/${tramite.id}/documentos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/expedientes/tramites?id=${tramite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    if (!document || !preavisoData) return
    
    try {
      await PreavisoGenerator.exportToWord(document, preavisoData)
    } catch (error) {
      console.error('Error descargando Word:', error)
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
              <h1 className="text-3xl font-bold text-gray-900">Pre-Aviso de Compraventa</h1>
              <p className="text-gray-600">
                Sistema interactivo para generar solicitudes de certificado con efecto de pre-aviso
              </p>
            </div>

            <div className="flex-1 min-h-0">
              <PreavisoChat
                onDataComplete={handleDataComplete}
                onGenerateDocument={handleGenerateDocument}
              />
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  // Estado: Documento generado
  if (appState === 'document' && document && preavisoData) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Documento Generado</h1>
                <p className="text-gray-600 mt-1">
                  Revisa el documento y descárgalo en formato Word
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
                <Button onClick={handleDownloadWord}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Word
                </Button>
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
