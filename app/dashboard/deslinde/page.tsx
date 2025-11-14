"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { UploadZone } from "@/components/upload-zone"
import { ProcessingScreen } from "@/components/processing-screen"
import { ValidationWizard } from "@/components/validation-wizard"
import { DocumentViewer } from "@/components/document-viewer"
import { simulateOCR, type PropertyUnit } from "@/lib/ocr-simulator"
import { createStructuredSegments, type TransformedSegment } from "@/lib/text-transformer"
import { FileText, Scale, Shield, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { extractTextWithTextract } from "@/lib/ocr-client"

type AppState = "upload" | "processing" | "validation"

export default function DeslindePage() {
  const [appState, setAppState] = useState<AppState>("upload")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string>("")
  const [units, setUnits] = useState<PropertyUnit[]>([])
  const [unitSegments, setUnitSegments] = useState<Map<string, TransformedSegment[]>>(new Map())
  const [processingStarted, setProcessingStarted] = useState(false)
  const [aiStructuredText, setAiStructuredText] = useState<string | null>(null)

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)

    if (documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
    }
    const url = URL.createObjectURL(file)
    setDocumentUrl(url)

    // Iniciar procesamiento inmediatamente al cargar
    setProcessingStarted(false)
    setAiStructuredText(null)
    setUnits([])
    setUnitSegments(new Map())
    setAppState("processing")
  }

  const handleProcessingComplete = async (update?: (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => void) => {
    if (!selectedFile) return
    if (processingStarted) {
      console.log("[deslinde] processing already started, skipping duplicate run")
      return
    }
    setProcessingStarted(true)

    // Paso 1: OCR real (con fallback a simulación si falla)
    let text = ""
    try {
      const isPdf = selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf")
      const res = await extractTextWithTextract(selectedFile, {
        timeoutMs: isPdf ? 300000 : 60000,
        onProgress: (key, status, detail) => update?.(key, status, detail),
      })
      text = res.text || ""
    } catch (e) {
      const sim = await simulateOCR(selectedFile)
      const segmentsMap = new Map<string, TransformedSegment[]>()
      setUnits(sim.extractedData.units)
      sim.extractedData.units.forEach((unit) => {
        const segments = createStructuredSegments(unit)
        segmentsMap.set(unit.id, segments)
      })
      setUnitSegments(segmentsMap)
      setAppState("validation")
      return
    }

    // Paso 2: Pasar texto a la IA para estructurar (con fallback a OCR crudo)
    try {
      update?.("ai", "in_progress")
      const resp = await fetch("/api/ai/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrText: text }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json() as { result: { unit: { name: string }, boundaries: any[], surfaces?: { name: string, value_m2: number }[] } }
      update?.("ai", "done")
      try {
        const dirEs: Record<string, string> = {
          WEST: "OESTE",
          NORTHWEST: "NOROESTE",
          NORTH: "NORTE",
          NORTHEAST: "NORESTE",
          EAST: "ESTE",
          SOUTHEAST: "SURESTE",
          SOUTH: "SUR",
          SOUTHWEST: "SUROESTE",
          UP: "ARRIBA",
          DOWN: "ABAJO",
        }
        const boundaries = (data as any).result?.boundaries || []
        boundaries.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
        const lines = boundaries.map((b: any) => {
          const d = (b.direction || "").toUpperCase()
          const name = dirEs[d] || d
          const len = typeof b.length_m === "number" ? b.length_m.toFixed(3) : String(b.length_m || "")
          const who = (b.abutter || "").toString().trim()
          return `${name}: EN ${len} m CON ${who}`
        })
        setAiStructuredText(lines.join("\n"))
      } catch {
        setAiStructuredText(null)
      }
      const unitName = data?.result?.unit?.name || "UNIDAD"
      // Superficie: usar SOLO la superficie del LOTE (si existe) y formatear a 3 decimales
      const surfaces = (data as any)?.result?.surfaces as { name: string; value_m2: number }[] | undefined
      let lotSurface = 0
      if (Array.isArray(surfaces)) {
        // 1) Prefer explicit "LOTE"
        const lot = surfaces.find((s) => typeof s?.name === "string" && /\bLOTE\b/i.test(s.name))
        if (lot && typeof lot.value_m2 === "number") {
          lotSurface = lot.value_m2
        } else {
          // 2) Fallback: a "TOTAL" surface that is not PRIVATIVA/EDIFICADA/CONSTRUIDA/PATIO/PASILLO/ESTACIONAMIENTO/JUNTA/BALCON/AZOTEA
          const blacklist = /(PRIVATIVA|EDIFICAD|CONSTRUID|PATIO|PASILLO|ESTACIONAMIENTO|JUNTA|BALC[ÓO]N|AZOTEA)/i
          const totalCandidate = surfaces.find((s) => {
            if (typeof s?.name !== "string") return false
            const name = s.name.toUpperCase()
            return /TOTAL/.test(name) && !blacklist.test(name)
          })
          if (totalCandidate && typeof totalCandidate.value_m2 === "number") {
            lotSurface = totalCandidate.value_m2
          }
        }
      }
      const surfaceLabel = lotSurface > 0 ? `${lotSurface.toFixed(3)} m²` : ""
      const newUnit: PropertyUnit = {
        id: unitName.toLowerCase().replace(/\s+/g, "-"),
        name: unitName,
        surface: surfaceLabel,
        boundaries: { west: [], north: [], east: [], south: [] },
      }
      const dirMap: Record<string, keyof PropertyUnit["boundaries"]> = {
        WEST: "west",
        NORTH: "north",
        EAST: "east",
        SOUTH: "south",
      }
      for (const b of data?.result?.boundaries || []) {
        const key = dirMap[(b.direction || "").toUpperCase()]
        if (!key) continue
        newUnit.boundaries[key].push({
          id: `${newUnit.id}-${key}-${newUnit.boundaries[key].length}`,
          measurement: String(b.length_m ?? ""),
          unit: "M",
          description: `CON ${b.abutter || ""}`.trim(),
          regionId: "",
        })
      }
      setUnits([newUnit])
      const segmentsMap = new Map<string, TransformedSegment[]>()
      const segments = createStructuredSegments(newUnit)
      segmentsMap.set(newUnit.id, segments)
      setUnitSegments(segmentsMap)
    } catch {
      setAiStructuredText(null)
      const unit: PropertyUnit = {
        id: "unit-ocr",
        name: "UNIDAD",
        surface: "",
        boundaries: { west: [], north: [], east: [], south: [] },
      }
      setUnits([unit])
      const segmentsMap = new Map<string, TransformedSegment[]>()
      segmentsMap.set(unit.id, [
        {
          id: "unit-ocr-0",
          originalText: text || "No se extrajo texto.",
          notarialText: text || "No se extrajo texto.",
          regionId: "",
          direction: "OCR",
        },
      ])
      setUnitSegments(segmentsMap)
    }

    setAppState("validation")
    setProcessingStarted(false)
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
    const isPdf = !!selectedFile && (selectedFile.type === "application/pdf" || selectedFile.name.toLowerCase().endsWith(".pdf"))
    const watchdogMs = isPdf ? 300000 : 60000
    const processSteps = isPdf
      ? [
          { key: "ocr_raster", label: "OCR (Raster + Rotación)" },
          { key: "ocr_upload", label: "Textract Upload S3" },
          { key: "ocr_start", label: "Textract Start" },
          { key: "ocr_status", label: "Textract Status" },
          { key: "ai", label: "AI (Structure)" },
        ]
      : [
          { key: "ocr_image", label: "OCR (Textract Imagen)" },
          { key: "ocr_image_rotate", label: "OCR (Rotación Imagen)" },
          { key: "ai", label: "AI (Structure)" },
        ]
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
            <ProcessingScreen
              fileName={selectedFile?.name || ""}
              onRun={async (update) => {
                try {
                  await handleProcessingComplete(update)
                } catch {
                  update("ocr", "error")
                  update("ocr_upload", "error")
                  update("ocr_start", "error")
                  update("ocr_status", "error")
                  update("ai", "error")
                }
              }}
              onComplete={() => setAppState("validation")}
              watchdogMs={watchdogMs}
              steps={processSteps}
            />
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
            aiStructuredText={aiStructuredText || undefined}
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

        {/* Ya no se muestra preview ni botón de Procesar; el flujo inicia automáticamente */}

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
