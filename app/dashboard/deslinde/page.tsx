"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { UploadZone } from "@/components/upload-zone"
import { ProcessingScreen } from "@/components/processing-screen"
import { ValidationWizard } from "@/components/validation-wizard"
import { simulateOCR, type PropertyUnit } from "@/lib/ocr-simulator"
import { createStructuredSegments, type TransformedSegment } from "@/lib/text-transformer"
import { FileText, Scale, Shield, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

type AppState = "upload" | "processing" | "validation"

export default function DeslindePage() {
  const [appState, setAppState] = useState<AppState>("upload")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string>("")
  const [units, setUnits] = useState<PropertyUnit[]>([])
  const [unitSegments, setUnitSegments] = useState<Map<string, TransformedSegment[]>>(new Map())

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)

    const url = URL.createObjectURL(file)
    setDocumentUrl(url)

    setAppState("processing")
  }

  const handleProcessingComplete = async () => {
    if (!selectedFile) return

    const ocrResult = await simulateOCR(selectedFile)

    setUnits(ocrResult.extractedData.units)

    const segmentsMap = new Map<string, TransformedSegment[]>()
    ocrResult.extractedData.units.forEach((unit) => {
      const segments = createStructuredSegments(unit)
      segmentsMap.set(unit.id, segments)
    })
    setUnitSegments(segmentsMap)

    setAppState("validation")
  }

  const handleBack = () => {
    setAppState("upload")
    setSelectedFile(null)
    if (documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
    }
  }

  const handleExport = () => {
    const notarialText = Array.from(unitSegments.values())
      .flatMap((segments) => segments.map((seg) => seg.notarialText))
      .join("\n\n")

    const blob = new Blob([notarialText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "documento-notarial.txt"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (appState === "processing") {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6">
            <div className="mb-6">
              <Button variant="ghost" onClick={handleBack} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </div>
            <ProcessingScreen fileName={selectedFile?.name || ""} onComplete={handleProcessingComplete} />
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  if (appState === "validation") {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <ValidationWizard 
            documentUrl={documentUrl} 
            units={units} 
            unitSegments={unitSegments} 
            onBack={handleBack} 
            fileName={selectedFile?.name}
          />
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lectura de Deslinde</h1>
          <p className="text-gray-600 mt-1">
            Procesa documentos de deslindes y genera texto notarial automáticamente
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center text-center gap-3 p-6 rounded-lg bg-card border">
            <div className="rounded-full bg-primary/10 p-3">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Extracción Automática</h3>
            <p className="text-sm text-muted-foreground">
              Extrae medidas y colindancias de documentos PDF e imágenes
            </p>
          </div>

          <div className="flex flex-col items-center text-center gap-3 p-6 rounded-lg bg-card border">
            <div className="rounded-full bg-primary/10 p-3">
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Conversión Notarial</h3>
            <p className="text-sm text-muted-foreground">Transforma automáticamente a lenguaje notarial formal</p>
          </div>

          <div className="flex flex-col items-center text-center gap-3 p-6 rounded-lg bg-card border">
            <div className="rounded-full bg-primary/10 p-3">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Validación Visual</h3>
            <p className="text-sm text-muted-foreground">Compara y valida con resaltado sincronizado</p>
          </div>
        </div>

        {/* Upload Zone */}
        <UploadZone onFileSelect={handleFileSelect} />

        {/* Instructions */}
        <div className="bg-muted/30 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-lg">Cómo funciona</h3>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                1
              </span>
              <span>Sube tu documento con información de deslindes (planos, PDF, imágenes)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                2
              </span>
              <span>El sistema extrae automáticamente las medidas y colindancias</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                3
              </span>
              <span>Revisa y edita el texto notarial generado en la vista de validación</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                4
              </span>
              <span>Exporta el documento final en formato notarial</span>
            </li>
          </ol>
        </div>
      </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}
