"use client"

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useFileUpload } from '@/hooks/use-file-upload'
import { AIProcessingScreen } from '@/components/ai-processing-screen'
import { AIProcessor } from '@/lib/ai-processor'
import { DocumentGenerator, GeneratedDocument } from '@/lib/document-generator'
import { DocumentPreview } from '@/components/document-preview'
import { DocumentWithVerification } from '@/components/document-with-verification'
import { SessionManager } from '@/lib/session-manager'
import { ValidationInterface } from '@/components/validation-interface'
import { FieldHighlighter } from '@/components/field-highlighter'
import dynamic from 'next/dynamic'

const PDFViewer = dynamic(
  () => import('@/components/pdf-viewer').then(mod => ({ default: mod.PDFViewer })),
  { ssr: false }
)
import { 
  FileText, 
  MapPin, 
  User, 
  CreditCard, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Plus
} from 'lucide-react'

type DocumentType = 'escritura' | 'plano' | 'identificacion' | 'rfc_curp'

interface DocumentStatus {
  type: DocumentType
  name: string
  icon: React.ReactNode
  status: 'pending' | 'uploaded' | 'validated' | 'error'
  file?: File
  confidence?: number
  error?: string
}

const DOCUMENT_TYPES: DocumentStatus[] = [
  {
    type: 'escritura',
    name: 'Escritura o título de propiedad',
    icon: <FileText className="h-6 w-6" />,
    status: 'pending'
  },
  {
    type: 'plano',
    name: 'Plano o croquis catastral',
    icon: <MapPin className="h-6 w-6" />,
    status: 'pending'
  },
  {
    type: 'identificacion',
    name: 'Identificación del propietario',
    icon: <User className="h-6 w-6" />,
    status: 'pending'
  },
  {
    type: 'rfc_curp',
    name: 'RFC / CURP de las partes',
    icon: <CreditCard className="h-6 w-6" />,
    status: 'pending'
  }
]

type AppState = 'upload' | 'processing' | 'validation' | 'generation'

// Función para detectar tipo de documento por nombre de archivo
const detectDocumentType = (fileName: string): DocumentType | null => {
  const name = fileName.toLowerCase()
  
  // Patrones de detección para cada tipo de documento
  const patterns = {
    escritura: ['escritura', 'titulo', 'compraventa', 'propiedad', 'notario', 'folio', 'deed', 'title'],
    plano: ['plano', 'croquis', 'catastral', 'medidas', 'superficie', 'lote', 'manzana', 'plan', 'sketch'],
    identificacion: ['ine', 'identificacion', 'credencial', 'pasaporte', 'cedula', 'id', 'identification'],
    rfc_curp: ['rfc', 'curp', 'registro', 'clave', 'homoclave', 'tax', 'fiscal']
  }
  
  // Buscar coincidencias y retornar el tipo con más matches
  let bestMatch: DocumentType | null = null
  let maxMatches = 0
  
  Object.entries(patterns).forEach(([type, keywords]) => {
    const matches = keywords.filter(keyword => name.includes(keyword)).length
    if (matches > maxMatches) {
      maxMatches = matches
      bestMatch = type as DocumentType
    }
  })
  
  return maxMatches > 0 ? bestMatch : null
}

export default function PreavisoPage() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [documents, setDocuments] = useState<DocumentStatus[]>(DOCUMENT_TYPES)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionResults, setDetectionResults] = useState<string[]>([])
  const [processingResults, setProcessingResults] = useState<any>(null)
  const [generatedDocument, setGeneratedDocument] = useState<GeneratedDocument | null>(null)
  const [validatedFields, setValidatedFields] = useState<any>(null)
  const [selectedField, setSelectedField] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<File | null>(null)
  const [showFilePreview, setShowFilePreview] = useState(false)
  const [selectedDocumentForVerification, setSelectedDocumentForVerification] = useState<DocumentStatus | null>(null)
  const [showDocumentVerification, setShowDocumentVerification] = useState(false)
  const { createFileInput } = useFileUpload()

  const handleFileUpload = (file: File, documentType: DocumentType) => {
    // Validar extensión
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.docx']
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    
    if (!allowedExtensions.includes(fileExtension)) {
      setDocuments(prev => prev.map(doc => 
        doc.type === documentType 
          ? { ...doc, status: 'error', error: 'Tipo de archivo no permitido' }
          : doc
      ))
      return
    }

    // Simular validación de legibilidad con IA
    const confidence = Math.random() * 20 + 80 // 80-100%
    
    setDocuments(prev => prev.map(doc => 
      doc.type === documentType 
        ? { 
            ...doc, 
            status: confidence > 90 ? 'validated' : 'uploaded',
            file,
            confidence: Math.round(confidence)
          }
        : doc
    ))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    
    // Activar estado de detección
    setIsDetecting(true)
    setDetectionResults([])
    
    // Simular delay para efecto visual (1.5 segundos)
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const results: string[] = []
    
    // Procesar cada archivo
    for (const file of files) {
      const detectedType = detectDocumentType(file.name)
      
      if (detectedType) {
        // Verificar si ya hay un documento de este tipo
        const existingDoc = documents.find(doc => doc.type === detectedType)
        if (existingDoc && existingDoc.status === 'pending') {
          handleFileUpload(file, detectedType)
          results.push(`✅ ${file.name} → ${DOCUMENT_TYPES.find(d => d.type === detectedType)?.name}`)
        } else {
          results.push(`⚠️ ${file.name} → ${DOCUMENT_TYPES.find(d => d.type === detectedType)?.name} (ya existe)`)
        }
      } else {
        // Si no se puede detectar, mostrar selector manual
        setPendingFile(file)
        setShowTypeSelector(true)
        results.push(`❓ ${file.name} → Requiere selección manual`)
      }
    }
    
    setDetectionResults(results)
    setIsDetecting(false)
  }

  const getStatusIcon = (status: DocumentStatus['status']) => {
    switch (status) {
      case 'validated':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'uploaded':
        return <Upload className="h-5 w-5 text-blue-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
    }
  }

  const getStatusColor = (status: DocumentStatus['status']) => {
    switch (status) {
      case 'validated':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'uploaded':
        return 'bg-blue-50 border-blue-200 text-blue-800'
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-600'
    }
  }

  const completedDocuments = documents.filter(doc => doc.status === 'validated' || doc.status === 'uploaded').length
  const totalDocuments = documents.length
  const progressPercentage = (completedDocuments / totalDocuments) * 100

  const canProceed = completedDocuments === totalDocuments

  const handleProcessWithAI = async () => {
    if (!canProceed) return
    
    setAppState('processing')
    
    // Crear sesión
    const session = SessionManager.createSession(
      'preaviso',
      'Pre-aviso - ' + new Date().toLocaleDateString(),
      {
        notaria: '3',
        folio: '12345',
        confidence: 0.92
      }
    )
    setCurrentSessionId(session.id)
    
    // Simular resultado de procesamiento para ir directo al documento generado
    const mockResult = {
      success: true,
      extractedData: {
        notario: {
          nombre: "XAVIER IBAÑEZ VERAMENDI",
          numero: "3",
          ubicacion: "Tijuana, Baja California"
        },
        partes: {
          vendedor: "MARÍA GONZÁLEZ RODRÍGUEZ",
          comprador: "CARLOS MÉNDEZ LÓPEZ"
        },
        actoJuridico: {
          tipo: "COMPRAVENTA DE INMUEBLE",
          descripcion: "Compraventa de inmueble ubicado en Fraccionamiento San Marino"
        },
        folioReal: {
          numero: "12345",
          seccion: "PRIMERA",
          partida: "67890"
        },
        inmueble: {
          unidad: "B-2",
          lote: "15",
          manzana: "8",
          fraccionamiento: "San Marino",
          municipio: "Tijuana, Baja California",
          direccion: "Fraccionamiento San Marino, Unidad B-2, Lote 15, Manzana 8"
        },
        confianza: 0.92
      }
    }
    
    // Simular delay de procesamiento
    setTimeout(() => {
      handleProcessingComplete(mockResult)
    }, 2000)
  }

  const handleProcessingComplete = async (result: any) => {
    setProcessingResults(result)
    
    // Generar documento automáticamente después del procesamiento
    try {
      const extractedFields = Array.isArray(result) 
        ? result.map((r: any) => r.extractedFields).filter(Boolean) || []
        : result.extractedData ? [result.extractedData] : []
      
      if (extractedFields.length === 0) {
        // Usar datos de ejemplo si no hay extractedFields
        extractedFields.push({
          notario: {
            nombre: "XAVIER IBAÑEZ VERAMENDI",
            numero: "3",
            ubicacion: "Tijuana, Baja California"
          },
          partes: {
            vendedor: "MARÍA GONZÁLEZ RODRÍGUEZ",
            comprador: "CARLOS MÉNDEZ LÓPEZ"
          },
          actoJuridico: {
            tipo: "COMPRAVENTA DE INMUEBLE",
            descripcion: "Compraventa de inmueble ubicado en Fraccionamiento San Marino"
          },
          folioReal: {
            numero: "12345",
            seccion: "PRIMERA",
            partida: "67890"
          },
          inmueble: {
            unidad: "B-2",
            lote: "15",
            manzana: "8",
            fraccionamiento: "San Marino",
            municipio: "Tijuana, Baja California",
            direccion: "Fraccionamiento San Marino, Unidad B-2, Lote 15, Manzana 8"
          },
          confianza: 0.92
        })
      }
      
      const document = DocumentGenerator.generatePreAvisoRequest(extractedFields)
      setGeneratedDocument(document)
      
      // Actualizar sesión con documento generado
      if (currentSessionId) {
        const session = SessionManager.getSession(currentSessionId)
        if (session) {
          session.document = document
          session.status = 'completed'
          session.updatedAt = new Date()
          SessionManager.saveSession(session)
        }
      }
      
      setAppState('generation')
    } catch (error) {
      console.error('Error generando documento:', error)
      setAppState('validation')
    }
  }

  const handleProcessingError = (error: string) => {
    console.error('Error en procesamiento:', error)
    setAppState('upload')
  }

  const handleBack = () => {
    setAppState('upload')
    setProcessingResults(null)
  }

  const handleNewPreaviso = () => {
    // Resetear todos los documentos a estado pendiente
    setDocuments(DOCUMENT_TYPES)
    setProcessingResults(null)
    setGeneratedDocument(null)
    setValidatedFields(null)
    setSelectedField(null)
    setAppState('upload')
  }

  const handleValidationComplete = async (validatedFields: any) => {
    setValidatedFields(validatedFields)
    
    // Generar documento notarial con campos validados
    try {
      const document = DocumentGenerator.generatePreAvisoRequest(validatedFields)
      setGeneratedDocument(document)
      setAppState('generation')
    } catch (error) {
      console.error('Error generando documento:', error)
      setAppState('validation')
    }
  }

  const handleFieldClick = (field: any) => {
    setSelectedField(field.id)
  }

  const handleManualTypeSelection = (documentType: DocumentType) => {
    if (pendingFile) {
      handleFileUpload(pendingFile, documentType)
      setDetectionResults(prev => 
        prev.map(result => 
          result.includes(pendingFile.name) 
            ? `✅ ${pendingFile.name} → ${DOCUMENT_TYPES.find(d => d.type === documentType)?.name}`
            : result
        )
      )
    }
    setShowTypeSelector(false)
    setPendingFile(null)
  }

  const handleCancelTypeSelection = () => {
    setShowTypeSelector(false)
    setPendingFile(null)
  }

  const handleFilePreview = (file: File) => {
    setSelectedFileForPreview(file)
    setShowFilePreview(true)
  }

  const handleCloseFilePreview = () => {
    setShowFilePreview(false)
    setSelectedFileForPreview(null)
  }

  const handleDocumentVerification = (document: DocumentStatus) => {
    setSelectedDocumentForVerification(document)
    setShowDocumentVerification(true)
  }

  const handleCloseDocumentVerification = () => {
    setShowDocumentVerification(false)
    setSelectedDocumentForVerification(null)
  }

  // Renderizar pantalla de procesamiento
  if (appState === 'processing') {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <AIProcessingScreen
            fileName="Documentos de Pre-aviso"
            onComplete={handleProcessingComplete}
            onError={handleProcessingError}
          />
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  // Renderizar pantalla de validación (placeholder por ahora)
  if (appState === 'validation') {
    console.log('Processing results:', processingResults)
    
    let extractedFields: any[] = []
    
    // Verificar si processingResults es un array o un objeto
    if (Array.isArray(processingResults)) {
      // Formato de array (desde handleProcessWithAI)
      extractedFields = processingResults?.map((r: any) => r.extractedFields).filter(Boolean) || []
      
      // Si no hay extractedFields, usar los datos directamente
      if (extractedFields.length === 0 && processingResults?.length > 0) {
        // Crear un objeto ExtractedFields consolidado desde los resultados
        const consolidatedFields = {
          notario: {
            nombre: "XAVIER IBAÑEZ VERAMENDI",
            numero: "3",
            ubicacion: "Tijuana, Baja California"
          },
          partes: {
            vendedor: "MARÍA GONZÁLEZ RODRÍGUEZ",
            comprador: "CARLOS MÉNDEZ LÓPEZ"
          },
          actoJuridico: {
            tipo: "COMPRAVENTA DE INMUEBLE",
            descripcion: "Compraventa de inmueble ubicado en Fraccionamiento San Marino"
          },
          folioReal: {
            numero: "12345",
            seccion: "PRIMERA",
            partida: "67890"
          },
          inmueble: {
            unidad: "B-2",
            lote: "15",
            manzana: "8",
            fraccionamiento: "San Marino",
            municipio: "Tijuana, Baja California",
            direccion: "Fraccionamiento San Marino, Unidad B-2, Lote 15, Manzana 8"
          },
          confianza: 0.92
        }
        extractedFields.push(consolidatedFields)
      }
    } else if (processingResults && typeof processingResults === 'object') {
      // Formato de objeto (desde AIProcessingScreen)
      if (processingResults.extractedData) {
        extractedFields = [processingResults.extractedData]
      } else {
        // Fallback con datos de ejemplo
        extractedFields = [{
          notario: {
            nombre: "XAVIER IBAÑEZ VERAMENDI",
            numero: "3",
            ubicacion: "Tijuana, Baja California"
          },
          partes: {
            vendedor: "MARÍA GONZÁLEZ RODRÍGUEZ",
            comprador: "CARLOS MÉNDEZ LÓPEZ"
          },
          actoJuridico: {
            tipo: "COMPRAVENTA DE INMUEBLE",
            descripcion: "Compraventa de inmueble ubicado en Fraccionamiento San Marino"
          },
          folioReal: {
            numero: "12345",
            seccion: "PRIMERA",
            partida: "67890"
          },
          inmueble: {
            unidad: "B-2",
            lote: "15",
            manzana: "8",
            fraccionamiento: "San Marino",
            municipio: "Tijuana, Baja California",
            direccion: "Fraccionamiento San Marino, Unidad B-2, Lote 15, Manzana 8"
          },
          confianza: 0.92
        }]
      }
    }
    
    console.log('Extracted fields:', extractedFields)
    
    // Filtrar documentos que tienen archivos subidos
    const uploadedDocuments = documents.filter(doc => doc.file && (doc.status === 'uploaded' || doc.status === 'validated'))
    
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Validación de Datos</h1>
                <p className="text-gray-600 mt-1">
                  Revisa y corrige los datos extraídos por IA antes de generar el documento
                </p>
              </div>
              <Button variant="outline" onClick={handleBack}>
                Volver
              </Button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interfaz de validación */}
              <div className="lg:col-span-1">
                <ValidationInterface
                  extractedFields={extractedFields}
                  onValidate={handleValidationComplete}
                  onBack={handleBack}
                />
              </div>
              
              {/* Resaltado de campos */}
              <div className="lg:col-span-1">
                <FieldHighlighter
                  extractedFields={extractedFields}
                  onFieldClick={handleFieldClick}
                  selectedField={selectedField}
                />
              </div>

              {/* Verificación de Fuente - Archivos Subidos */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                      <FileText className="h-5 w-5 mr-2" />
                      Verificación de Fuente
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Documentos originales subidos para validación
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {uploadedDocuments.length > 0 ? (
                      <div className="space-y-3">
                        {uploadedDocuments.map((document) => (
                          <div key={document.type} className="border rounded-lg p-3">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                {document.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm text-gray-900 truncate">
                                  {document.name}
                                </h4>
                                <p className="text-xs text-gray-500">
                                  {document.file?.name}
                                </p>
                              </div>
                              <div className="flex-shrink-0">
                                {document.status === 'validated' && (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                )}
                                {document.status === 'uploaded' && (
                                  <Upload className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                            </div>
                            
                            {/* Preview del archivo */}
                            <div className="mt-3">
                              {document.file && (
                                <div className="border rounded-lg p-2 bg-gray-50">
                                  {document.file.type.startsWith('image/') ? (
                                    <div className="space-y-2">
                                      <img 
                                        src={URL.createObjectURL(document.file)} 
                                        alt={document.file.name}
                                        className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => handleFilePreview(document.file!)}
                                      />
                                      <p className="text-xs text-gray-600 text-center">
                                        Vista previa de imagen
                                      </p>
                                    </div>
                                  ) : document.file.type === 'application/pdf' ? (
                                    <div className="space-y-2">
                                      <div 
                                        className="w-full h-32 bg-red-100 rounded border flex items-center justify-center cursor-pointer hover:bg-red-200 transition-colors"
                                        onClick={() => handleFilePreview(document.file!)}
                                      >
                                        <div className="text-center">
                                          <FileText className="h-8 w-8 text-red-600 mx-auto mb-1" />
                                          <p className="text-xs text-red-600 font-medium">PDF</p>
                                        </div>
                                      </div>
                                      <p className="text-xs text-gray-600 text-center">
                                        {document.file.name}
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div 
                                        className="w-full h-32 bg-blue-100 rounded border flex items-center justify-center cursor-pointer hover:bg-blue-200 transition-colors"
                                        onClick={() => handleFilePreview(document.file!)}
                                      >
                                        <div className="text-center">
                                          <FileText className="h-8 w-8 text-blue-600 mx-auto mb-1" />
                                          <p className="text-xs text-blue-600 font-medium">
                                            {document.file.name.split('.').pop()?.toUpperCase()}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="text-xs text-gray-600 text-center">
                                        {document.file.name}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Información adicional */}
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="flex justify-between items-center">
                                      <div className="flex justify-between text-xs text-gray-500 flex-1">
                                        <span>Tamaño: {(document.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                        {document.confidence && (
                                          <span>Confianza: {document.confidence}%</span>
                                        )}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleFilePreview(document.file!)}
                                          className="h-6 px-2 text-xs"
                                        >
                                          Ver
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="default"
                                          onClick={() => handleDocumentVerification(document)}
                                          className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                                        >
                                          Verificar
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">No hay documentos subidos</p>
                        <p className="text-xs">Los archivos aparecerán aquí después de la subida</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  // Renderizar pantalla de generación de documento
  if (appState === 'generation' && generatedDocument) {
    return (
      <ProtectedRoute>
        <DocumentWithVerification
          document={generatedDocument}
          sessionId={currentSessionId || undefined}
          onEdit={() => setAppState('validation')}
          onExport={() => {
            // Implementar exportación
            console.log('Exportar documento')
          }}
          onBack={() => setAppState('upload')}
        />
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Pre-aviso</h1>
            <p className="text-gray-600">
              Generación automática de Solicitud de Certificado con Efecto de Pre-Aviso
            </p>
          </div>

          {/* Document Upload Section - Nueva UI */}
          <div className="space-y-6">
            {/* Progress Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Documentos Requeridos</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {completedDocuments} de {totalDocuments} documentos completados
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {Math.round(progressPercentage)}%
                </span>
              </div>
            </div>

            {/* Upload Zone */}
            <div 
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
                isDragOver 
                  ? 'border-blue-400 bg-blue-50 scale-[1.02]' 
                  : isDetecting
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50/30'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="space-y-4">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                  isDetecting ? 'bg-blue-200' : 'bg-blue-100'
                }`}>
                  {isDetecting ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  ) : (
                    <Upload className="h-8 w-8 text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {isDetecting ? 'Analizando documentos...' : 'Arrastra múltiples documentos aquí'}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {isDetecting 
                      ? 'El sistema está detectando automáticamente el tipo de cada documento'
                      : 'O haz clic en cada documento específico abajo'
                    }
                  </p>
                  <div className="text-xs text-gray-500">
                    Formatos: PDF, JPG, PNG, DOCX
                  </div>
                </div>
              </div>
            </div>

            {/* Detection Results */}
            {detectionResults.length > 0 && (
              <div className="bg-gray-50 border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                  Resultados de la Detección Automática
                </h4>
                <div className="space-y-2">
                  {detectionResults.map((result, index) => (
                    <div key={index} className="text-sm text-gray-700">
                      {result}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document List - Nueva UI */}
            <div className="space-y-3">
              {documents.map((document, index) => (
                <div
                  key={document.type}
                  className={`group relative bg-white border rounded-lg p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
                    document.status === 'validated' 
                      ? 'border-green-200 bg-green-50' 
                      : document.status === 'uploaded'
                      ? 'border-blue-200 bg-blue-50'
                      : document.status === 'error'
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => {
                    createFileInput((file) => {
                      handleFileUpload(file, document.type)
                    })
                  }}
                >
                  <div className="flex items-center space-x-4">
                    {/* Step Number */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      document.status === 'validated' || document.status === 'uploaded'
                        ? 'bg-green-500 text-white'
                        : document.status === 'error'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-200 text-gray-600 group-hover:bg-blue-500 group-hover:text-white'
                    }`}>
                      {document.status === 'validated' || document.status === 'uploaded' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : document.status === 'error' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    {/* Document Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                          document.status === 'validated' 
                            ? 'bg-green-100 text-green-600' 
                            : document.status === 'uploaded'
                            ? 'bg-blue-100 text-blue-600'
                            : document.status === 'error'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                        }`}>
                          {document.icon}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {document.name}
                          </h3>
                          <div className="flex items-center space-x-2 mt-1">
                            {document.status === 'validated' && document.confidence && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                {document.confidence}% confianza
                              </Badge>
                            )}
                            {document.status === 'error' && document.error && (
                              <span className="text-red-600 text-xs">{document.error}</span>
                            )}
                            {document.status === 'pending' && (
                              <span className="text-gray-500 text-xs">Haz clic para subir</span>
                            )}
                            {document.status === 'uploaded' && (
                              <span className="text-blue-600 text-xs">Listo para procesar</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div className="flex-shrink-0">
                      {document.status === 'validated' && (
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      )}
                      {document.status === 'uploaded' && (
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      )}
                      {document.status === 'error' && (
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      )}
                      {document.status === 'pending' && (
                        <div className="w-3 h-3 border-2 border-gray-300 rounded-full group-hover:border-blue-500"></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={handleNewPreaviso}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Pre-aviso</span>
            </Button>
            
            <Button 
              disabled={!canProceed}
              onClick={handleProcessWithAI}
              className="flex items-center space-x-2"
            >
              <span>Generar Documento con IA</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información del Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Documentos Requeridos:</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Escritura o título de propiedad</li>
                    <li>• Plano o croquis catastral</li>
                    <li>• Identificación del propietario</li>
                    <li>• RFC / CURP de las partes</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Formatos Soportados:</h4>
                  <ul className="space-y-1 text-gray-600">
                    <li>• PDF (.pdf)</li>
                    <li>• Imágenes (.jpg, .png)</li>
                    <li>• Documentos Word (.docx)</li>
                    <li>• Confianza mínima: 90%</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Modal para selección manual de tipo de documento */}
        {showTypeSelector && pendingFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Selecciona el tipo de documento
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                No pudimos detectar automáticamente el tipo de: <strong>{pendingFile.name}</strong>
              </p>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                {DOCUMENT_TYPES.map((doc) => (
                  <button
                    key={doc.type}
                    onClick={() => handleManualTypeSelection(doc.type)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                        {doc.icon}
                      </div>
                      <span className="text-sm font-medium text-gray-900 text-center">
                        {doc.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              
              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={handleCancelTypeSelection}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para vista previa de archivos */}
        {showFilePreview && selectedFileForPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  Vista previa: {selectedFileForPreview.name}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseFilePreview}
                >
                  Cerrar
                </Button>
              </div>
              
              <div className="p-4 max-h-[calc(90vh-80px)] overflow-auto">
                {selectedFileForPreview.type.startsWith('image/') ? (
                  <div className="text-center">
                    <img 
                      src={URL.createObjectURL(selectedFileForPreview)} 
                      alt={selectedFileForPreview.name}
                      className="max-w-full max-h-[70vh] object-contain mx-auto rounded border"
                    />
                  </div>
                ) : selectedFileForPreview.type === 'application/pdf' ? (
                  <div className="text-center py-8">
                    <FileText className="h-24 w-24 text-red-500 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Documento PDF</h4>
                    <p className="text-gray-600 mb-4">
                      {selectedFileForPreview.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      Tamaño: {(selectedFileForPreview.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <div className="mt-4">
                      <Button
                        onClick={() => {
                          const url = URL.createObjectURL(selectedFileForPreview)
                          window.open(url, '_blank')
                        }}
                        className="mr-2"
                      >
                        Abrir en nueva pestaña
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const url = URL.createObjectURL(selectedFileForPreview)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = selectedFileForPreview.name
                          a.click()
                        }}
                      >
                        Descargar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-24 w-24 text-blue-500 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      Documento {selectedFileForPreview.name.split('.').pop()?.toUpperCase()}
                    </h4>
                    <p className="text-gray-600 mb-4">
                      {selectedFileForPreview.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      Tamaño: {(selectedFileForPreview.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <div className="mt-4">
                      <Button
                        onClick={() => {
                          const url = URL.createObjectURL(selectedFileForPreview)
                          window.open(url, '_blank')
                        }}
                        className="mr-2"
                      >
                        Abrir en nueva pestaña
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const url = URL.createObjectURL(selectedFileForPreview)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = selectedFileForPreview.name
                          a.click()
                        }}
                      >
                        Descargar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal para verificación de documentos con resaltado */}
        {showDocumentVerification && selectedDocumentForVerification && selectedDocumentForVerification.file && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-7xl w-full mx-4 max-h-[95vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    {selectedDocumentForVerification.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Verificación de Fuente: {selectedDocumentForVerification.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedDocumentForVerification.file.name}
                    </p>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseDocumentVerification}
                >
                  Cerrar
                </Button>
              </div>
              
              <div className="p-4 max-h-[calc(95vh-80px)] overflow-auto">
                {selectedDocumentForVerification.file.type === 'application/pdf' ? (
                  <div className="h-full">
                    <PDFViewer
                      fileUrl={URL.createObjectURL(selectedDocumentForVerification.file)}
                      fileName={selectedDocumentForVerification.file.name}
                      highlightedRegion={null}
                    />
                  </div>
                ) : selectedDocumentForVerification.file.type.startsWith('image/') ? (
                  <div className="text-center">
                    <div className="relative inline-block">
                      <img 
                        src={URL.createObjectURL(selectedDocumentForVerification.file)} 
                        alt={selectedDocumentForVerification.file.name}
                        className="max-w-full max-h-[70vh] object-contain mx-auto rounded border shadow-lg"
                      />
                      {/* Overlay para resaltado en imágenes */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div
                          className="absolute border-2 border-yellow-400 rounded-lg shadow-lg transition-all duration-200"
                          style={{
                            left: "10%",
                            top: "10%",
                            width: "30%",
                            height: "20%",
                            backgroundColor: "rgba(250, 204, 21, 0.25)",
                            boxShadow: "0 0 30px rgba(250, 204, 21, 0.5), inset 0 0 20px rgba(250, 204, 21, 0.2)",
                          }}
                        >
                          <div className="absolute -top-6 left-0 bg-yellow-500 text-yellow-950 px-2 py-1 rounded-md text-xs font-medium shadow-lg">
                            Región resaltada
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-24 w-24 text-blue-500 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      Documento {selectedDocumentForVerification.file.name.split('.').pop()?.toUpperCase()}
                    </h4>
                    <p className="text-gray-600 mb-4">
                      {selectedDocumentForVerification.file.name}
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Tamaño: {(selectedDocumentForVerification.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-sm text-yellow-800">
                        <strong>Información extraída:</strong> UNIDAD B-2: Al oeste, en dos tramos, el primero de...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  )
}