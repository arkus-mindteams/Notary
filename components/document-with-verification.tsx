"use client"

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  FileText, 
  Eye, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Search,
  Download,
  Edit3,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MapPin,
  Calendar,
  User,
  X
} from 'lucide-react'
import { GeneratedDocument } from '@/lib/document-generator'
import { SourceVerificationPanel } from '@/components/source-verification-panel'
import { PDFExporter } from '@/lib/pdf-exporter'
import { WordExporter } from '@/lib/word-exporter'
import { SessionManager } from '@/lib/session-manager'
import { DashboardLayout } from '@/components/dashboard-layout'

interface DocumentSection {
  id: string
  title: string
  content: string
  confidence: number
  source: {
    document: string
    page: number
    coordinates: { x: number; y: number; width: number; height: number }
    extractedText: string
    timestamp: Date
  }
  type: 'header' | 'body' | 'legal' | 'signature'
}

interface DocumentWithVerificationProps {
  document: GeneratedDocument
  onEdit?: () => void
  onExport?: () => void
  onBack?: () => void
  sessionId?: string
}

export function DocumentWithVerification({ 
  document, 
  onEdit, 
  onExport, 
  onBack,
  sessionId
}: DocumentWithVerificationProps) {
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState<Record<string, string>>({})

  const getDocumentName = (type: string) => {
    const names = {
      'header': 'Escritura Pública',
      'body': 'Plano Catastral',
      'legal': 'Marco Legal',
      'signature': 'Identificación'
    }
    return names[type as keyof typeof names] || 'Documento'
  }

  const generateExtractedText = (type: string) => {
    const texts = {
      'header': 'NOTARÍA PÚBLICA NÚMERO 3 DE TIJUANA, BAJA CALIFORNIA',
      'body': 'UNIDAD B-2: Al oeste, en dos tramos, el primero de seis metros setecientos cincuenta milímetros...',
      'legal': 'Artículo 123 de la Ley del Notariado del Estado de Baja California',
      'signature': 'XAVIER IBAÑEZ VERAMENDI - NOTARIO PÚBLICO NÚMERO 3'
    }
    return texts[type as keyof typeof texts] || 'Texto extraído'
  }

  // Simular datos de fuente para cada sección
  const sectionsWithSources: DocumentSection[] = document.sections.map((section, index) => ({
    id: section.id,
    title: section.title,
    content: section.content,
    confidence: Math.random() * 0.3 + 0.7, // 70-100%
    source: {
      document: getDocumentName(section.type),
      page: Math.floor(Math.random() * 3) + 1,
      coordinates: {
        x: Math.random() * 50 + 10,
        y: Math.random() * 50 + 10,
        width: Math.random() * 30 + 20,
        height: Math.random() * 20 + 10
      },
      extractedText: generateExtractedText(section.type),
      timestamp: new Date()
    },
    type: section.type
  }))

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.95) return 'bg-green-100 text-green-800 border-green-200'
    if (confidence >= 0.85) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-red-100 text-red-800 border-red-200'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.95) return <CheckCircle2 className="h-4 w-4" />
    if (confidence >= 0.85) return <AlertCircle className="h-4 w-4" />
    return <AlertCircle className="h-4 w-4" />
  }

  const getSectionIcon = (type: string) => {
    switch (type) {
      case 'header': return <FileText className="h-5 w-5" />
      case 'body': return <BookOpen className="h-5 w-5" />
      case 'legal': return <MapPin className="h-5 w-5" />
      case 'signature': return <User className="h-5 w-5" />
      default: return <FileText className="h-5 w-5" />
    }
  }

  const filteredSections = sectionsWithSources

  const handleSectionClick = useCallback((sectionId: string) => {
    setSelectedSection(selectedSection === sectionId ? null : sectionId)
  }, [selectedSection])

  const handleExportPDF = async () => {
    try {
      await PDFExporter.exportDocument(document, {
        format: 'A4',
        orientation: 'portrait',
        includeMetadata: true,
        includeTimestamp: true
      })
      
      // Actualizar estado de sesión si existe
      if (sessionId) {
        SessionManager.updateSessionStatus(sessionId, 'exported')
      }
      
      onExport?.()
    } catch (error) {
      console.error('Error exportando PDF:', error)
    }
  }

  const handleExportWord = async () => {
    try {
      await WordExporter.exportNotarialDocument(document, {
        includeMetadata: true,
        includeTimestamp: true
      })
      
      // Actualizar estado de sesión si existe
      if (sessionId) {
        SessionManager.updateSessionStatus(sessionId, 'exported')
      }
      
      onExport?.()
    } catch (error) {
      console.error('Error exportando Word:', error)
    }
  }

  const handleStartEdit = () => {
    setIsEditing(true)
    // Inicializar contenido editado con el contenido actual
    const initialContent: Record<string, string> = {}
    sectionsWithSources.forEach(section => {
      initialContent[section.id] = section.content
    })
    setEditedContent(initialContent)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingSection(null)
    setEditedContent({})
  }

  const handleSaveEdit = () => {
    // Aquí se podría implementar la lógica para guardar los cambios
    // Por ahora solo salimos del modo de edición
    setIsEditing(false)
    setEditingSection(null)
    console.log('Cambios guardados:', editedContent)
  }

  const handleSectionEdit = (sectionId: string) => {
    setEditingSection(sectionId)
  }

  const handleContentChange = (sectionId: string, newContent: string) => {
    setEditedContent(prev => ({
      ...prev,
      [sectionId]: newContent
    }))
  }

  const selectedSectionData = selectedSection 
    ? sectionsWithSources.find(s => s.id === selectedSection)
    : null

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-background">
        {/* Header con estilo de Deslinde */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Volver</span>
                </Button>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-semibold truncate">{document.title}</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                    {document.metadata.notaria} • Folio: {document.metadata.folio} • 
                    Confianza: {Math.round(document.metadata.confidence * 100)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {!isEditing ? (
                  <>
                    <Button variant="outline" onClick={handleStartEdit} size="sm" className="gap-2">
                      <Edit3 className="h-4 w-4" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button onClick={handleExportWord} size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Exportar</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleCancelEdit} size="sm" className="gap-2">
                      <X className="h-4 w-4" />
                      <span className="hidden sm:inline">Cancelar</span>
                    </Button>
                    <Button onClick={handleSaveEdit} size="sm" className="gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Guardar</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content - Split View con estilo de Deslinde */}
        <div className="flex-1 overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 h-full">
              {/* Source Verification Panel - Left Side */}
              <div className="h-[300px] sm:h-[400px] lg:h-full overflow-auto">
                <Card className="flex flex-col h-full">
                  <div className="p-4 sm:p-6 border-b bg-muted/30 shrink-0">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base sm:text-lg font-semibold">Verificación de Fuente</h2>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            {selectedSectionData ? `Fuente: ${selectedSectionData.source.document}` : 'Selecciona una sección'}
                          </p>
                        </div>
                        {selectedSectionData && (
                          <div className="flex items-center gap-2 text-success shrink-0">
                            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span className="text-xs sm:text-sm font-medium hidden sm:inline">
                              {Math.round(selectedSectionData.confidence * 100)}% confianza
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto">
                    <SourceVerificationPanel
                      selectedSection={selectedSectionData}
                      onClose={() => setSelectedSection(null)}
                    />
                  </div>
                </Card>
              </div>

              {/* Document Preview - Right Side */}
              <div className="h-[400px] sm:h-[500px] lg:h-full overflow-hidden">
                <Card className="flex flex-col h-full">
                  <div className="p-4 sm:p-6 border-b bg-muted/30 shrink-0">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base sm:text-lg font-semibold">Documento Notarial</h2>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            {filteredSections.length} secciones • 
                            {Math.round(sectionsWithSources.reduce((acc, s) => acc + s.confidence, 0) / sectionsWithSources.length * 100)}% confianza promedio
                          </p>
                        </div>
                        {isEditing && (
                          <div className="flex items-center gap-2 text-primary shrink-0">
                            <Edit3 className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span className="text-xs sm:text-sm font-medium hidden sm:inline">Modo Edición</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto">
                    <ScrollArea className="h-full">
                      <div className="p-4 sm:p-6 space-y-4">
                        {filteredSections.map((section) => (
                          <div
                            key={section.id}
                            className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                              selectedSection === section.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => handleSectionClick(section.id)}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                {getSectionIcon(section.type)}
                                <h3 className="font-semibold text-foreground">{section.title}</h3>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge className={getConfidenceColor(section.confidence)}>
                                  {getConfidenceIcon(section.confidence)}
                                  <span className="ml-1">{Math.round(section.confidence * 100)}%</span>
                                </Badge>
                                {isEditing && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSectionEdit(section.id)}
                                    className="h-6 px-2"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </Button>
                                )}
                                {selectedSection === section.id && (
                                  <Badge variant="outline" className="text-primary border-primary">
                                    <Info className="h-3 w-3 mr-1" />
                                    Seleccionado
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            <div className="prose prose-sm max-w-none">
                              {isEditing && editingSection === section.id ? (
                                <textarea
                                  value={editedContent[section.id] || section.content}
                                  onChange={(e) => handleContentChange(section.id, e.target.value)}
                                  className="w-full p-3 border border-input rounded-md resize-none min-h-[100px] text-foreground leading-relaxed"
                                  placeholder="Edita el contenido de esta sección..."
                                />
                              ) : (
                                <div 
                                  className="text-foreground leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: editedContent[section.id] || section.content }}
                                />
                              )}
                            </div>

                            {selectedSection === section.id && (
                              <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-md">
                                <div className="flex items-center space-x-2 text-sm text-primary">
                                  <FileText className="h-4 w-4" />
                                  <span>Fuente: {section.source.document} - Página {section.source.page}</span>
                                  <span>•</span>
                                  <span>Extraído: {section.source.timestamp.toLocaleTimeString()}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
