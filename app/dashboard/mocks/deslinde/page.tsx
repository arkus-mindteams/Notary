"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    ArrowLeft,
    Upload,
    FileText,
    ShieldCheck,
    Zap,
    Maximize2,
    ZoomIn,
    ZoomOut,
    RotateCw,
    Download,
    CheckCircle2,
    MessageSquare,
    AlertCircle,
    Info,
    ChevronRight,
    ChevronLeft,
    Search,
    Map,
    Eye,
    EyeOff,
    Loader2,
    X,
    Play,
    ImageIcon
} from 'lucide-react'
import Link from 'next/link'
import { useMock } from '../mock-context'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'

// --- Mock Types & Data ---

interface PropertyUnit {
    id: string
    name: string
    surface: string
    colindancias: string
    notarialText?: string
}

const MOCK_UNITS: PropertyUnit[] = [
    {
        id: 'lote_privativo',
        name: 'Lote Privativo',
        surface: '900.00 m²',
        colindancias: `NORTE: 20.00 metros con Calle Primera
SUR: 20.00 metros con Lote 5
ESTE: 45.00 metros con Ave. Revolución
OESTE: 45.00 metros con Propiedad Privada`,
        notarialText: `AL NORTE, en veinte metros cero centímetros, linda con Calle Primera;
AL SUR, en veinte metros cero centímetros, linda con Lote cinco;
AL ESTE, en cuarenta y cinco metros cero centímetros, linda con Avenida Revolución;
AL OESTE, en cuarenta y cinco metros cero centímetros, linda con Propiedad Privada.`
    },
    {
        id: 'area_comun',
        name: 'Área Común',
        surface: '120.50 m²',
        colindancias: `NORTE: 5.00 m con Pasillo
SUR: 5.00 m con Acceso
ESTE: 24.10 m con Lote Privativo
OESTE: 24.10 m con Muro Perimetral`,
        notarialText: `AL NORTE, en cinco metros cero centímetros, linda con Pasillo;
AL SUR, en cinco metros cero centímetros, linda con Acceso;
AL ESTE, en veinticuatro metros diez centímetros, linda con Lote Privativo;
AL OESTE, en veinticuatro metros diez centímetros, linda con Muro Perimetral.`
    }
]

// --- Mock Components (Visual Replicas) ---

// 1. Upload Zone Replica
function UploadZoneSimulator({ onProcess }: { onProcess: () => void }) {
    const [isDragging, setIsDragging] = useState(false)
    const [files, setFiles] = useState<File[]>([])

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false)
        // Mock file add
        setFiles([new File(["mock"], "plano_arquitectonico.pdf", { type: "application/pdf" })])
    }

    return (
        <Card
            className={`relative border-2 border-dashed transition-all duration-200 bg-background p-8 flex flex-col items-center justify-center gap-4 text-center ${isDragging ? "border-primary bg-primary/10 scale-[1.02] shadow-lg" : "border-primary/30 hover:border-primary/50 hover:bg-muted/50"
                }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            <div className="rounded-full bg-primary/20 p-6 flex-shrink-0">
                <Upload className="h-12 w-12 text-blue-600" />
            </div>
            <div className="space-y-2 max-w-md">
                <h3 className="text-xl font-bold text-foreground">Sube tus archivos para comenzar</h3>
                <p className="text-sm text-muted-foreground">Arrastra archivos, selecciona o pega desde el portapapeles (Ctrl+V) PDF, PNG o JPG (Máx. 20MB)</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
                <Button
                    size="lg"
                    className="w-full sm:w-auto bg-blue-950 hover:bg-blue-900 text-white font-bold"
                    onClick={() => setFiles([new File(["mock"], "plano_arquitectonico.pdf", { type: "application/pdf" })])}
                >
                    Seleccionar archivos
                </Button>
                {files.length > 0 && (
                    <Button
                        onClick={onProcess}
                        className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white font-bold"
                    >
                        <Play className="h-4 w-4 mr-2" />
                        Procesar imágenes ({files.length})
                    </Button>
                )}
            </div>

            {/* Simulated File List */}
            {files.length > 0 && (
                <div className="w-full flex gap-3 overflow-x-auto mt-4 justify-center">
                    {files.map((f, i) => (
                        <Card key={i} className="p-2 relative border w-[180px] shrink-0 text-left">
                            <div className="aspect-video rounded-md bg-muted flex items-center justify-center mb-2">
                                <FileText className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <p className="text-xs font-medium truncate">{f.name}</p>
                            <p className="text-[10px] text-muted-foreground">1.2 MB</p>
                            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setFiles([])}>
                                <X className="h-3 w-3" />
                            </Button>
                        </Card>
                    ))}
                </div>
            )}
        </Card>
    )
}

// 2. Processing Screen Replica
function ProcessingScreenSimulator({ onComplete }: { onComplete: () => void }) {
    const [progress, setProgress] = useState(0)
    const [step, setStep] = useState(0) // 0: OCR, 1: AI

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(p => {
                if (p >= 100) {
                    clearInterval(interval)
                    return 100
                }
                return p + 2
            })
        }, 50)

        // Simulate step change
        setTimeout(() => setStep(1), 1500)
        setTimeout(onComplete, 3000)

        return () => clearInterval(interval)
    }, [onComplete])

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="w-full max-w-2xl p-8 space-y-8">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
                        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                    </div>
                    <h2 className="text-2xl font-semibold">Procesando documento</h2>
                    <p className="text-sm text-muted-foreground">plano_arquitectonico.pdf</p>
                </div>

                <div className="space-y-4">
                    <Progress value={progress} className="h-2" />
                    <p className="text-center text-sm font-medium">{progress}%</p>
                </div>

                <div className="space-y-3">
                    <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${step === 0 ? "bg-blue-50 text-blue-700" : "text-green-600"}`}>
                        <Loader2 className={`h-5 w-5 ${step === 0 ? "animate-spin" : "opacity-0"}`} />
                        <span className="text-sm font-medium">OCR (Textract)</span>
                        {step > 0 && <CheckCircle2 className="h-4 w-4 ml-auto" />}
                    </div>
                    <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${step === 1 ? "bg-blue-50 text-blue-700" : "text-gray-400"}`}>
                        <Loader2 className={`h-5 w-5 ${step === 1 ? "animate-spin" : "opacity-0"}`} />
                        <span className="text-sm font-medium">AI (Structure)</span>
                    </div>
                </div>
            </Card>
        </div>
    )
}

// 3. Validation Wizard Replica
function ValidationWizardSimulator({ onBack }: { onBack: () => void }) {
    const { completedStages, setCompletedStages } = useMock()
    const [currentUnitIndex, setCurrentUnitIndex] = useState(0)
    const [isViewerCollapsed, setIsViewerCollapsed] = useState(false)
    const [authorizedUnits, setAuthorizedUnits] = useState<Set<string>>(new Set())

    // Local editable state
    const [unitsData, setUnitsData] = useState(MOCK_UNITS)

    const currentUnit = unitsData[currentUnitIndex]
    const isLastUnit = currentUnitIndex === unitsData.length - 1
    const isAuthorized = authorizedUnits.has(currentUnit.id)
    const allAuthorized = unitsData.every(u => authorizedUnits.has(u.id))

    const handleAuthorize = () => {
        const next = new Set(authorizedUnits)
        next.add(currentUnit.id)
        setAuthorizedUnits(next)
        toast.success(`Unidad ${currentUnit.name} autorizada`)

        if (!isLastUnit) {
            setCurrentUnitIndex(prev => prev + 1)
        } else {
            // If last unit authorized, mark stage complete
            if (!completedStages.includes('deslinde')) {
                setCompletedStages(prev => [...prev, 'deslinde'])
            }
        }
    }

    const handleExport = () => {
        toast.success("Documento exportado con éxito")
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header with Progress */}
            <header className="border-b bg-card">
                <div className="container mx-auto px-3 sm:px-4 py-2">
                    <div className="flex items-center justify-between gap-2 pb-2">
                        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 h-8">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleExport}
                                size="sm"
                                className="bg-gray-800 hover:bg-gray-700 text-white font-bold"
                                disabled={!allAuthorized}
                            >
                                <Download className="h-3.5 w-3.5 mr-2" /> Exportar
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pb-4 pt-2 border-b">
                        <div>
                            <h1 className="text-lg font-semibold">Validación de Plantas Arquitectónicas</h1>
                            <p className="text-xs text-muted-foreground hidden lg:block">Revisa y autoriza cada unidad antes de exportar</p>
                        </div>
                    </div>

                    {/* Progress Bar & Pills */}
                    <div className="space-y-1.5 py-4">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">Unidad {currentUnitIndex + 1} de {unitsData.length}</span>
                            <span className="text-muted-foreground">{authorizedUnits.size}/{unitsData.length} autorizadas</span>
                        </div>
                        <Progress value={(authorizedUnits.size / unitsData.length) * 100} className="h-1.5" />

                        <div className="flex gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-thin">
                            {unitsData.map((unit, idx) => {
                                const isAuth = authorizedUnits.has(unit.id)
                                const isCurr = idx === currentUnitIndex
                                return (
                                    <button
                                        key={unit.id}
                                        onClick={() => setCurrentUnitIndex(idx)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 flex items-center gap-1 border ${isCurr && isAuth ? "bg-green-600 text-white border-green-600" :
                                                isCurr ? "bg-blue-600 text-white border-blue-600" :
                                                    isAuth ? "bg-green-50 text-green-700 border-green-200" :
                                                        "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                                            }`}
                                    >
                                        {isAuth && <CheckCircle2 className="h-3 w-3" />}
                                        {unit.name}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </header>

            {/* Split View Content */}
            <div className="flex-1 overflow-hidden min-h-0">
                <div className="container mx-auto px-3 sm:px-4 py-2 h-full overflow-hidden">
                    <div className={`grid gap-3 h-full transition-all duration-300 ${isViewerCollapsed ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[40%_60%]"}`}>

                        {/* Left: Document Viewer Simulator */}
                        {!isViewerCollapsed && (
                            <div className="h-full bg-gray-100 rounded-lg border border-gray-200 relative overflow-hidden flex flex-col items-center justify-center p-8 group">
                                <Button
                                    variant="outline" size="sm"
                                    className="absolute top-2 right-2 bg-white/90"
                                    onClick={() => setIsViewerCollapsed(true)}
                                >
                                    <EyeOff className="h-3.5 w-3.5" />
                                </Button>
                                <Map className="h-24 w-24 text-gray-300 mb-4" />
                                <div className="text-center space-y-1">
                                    <p className="text-xs font-bold text-gray-500">VISTA PREVIA DE PLANO</p>
                                    <p className="text-[10px] text-gray-400">Página 1 de 1</p>
                                </div>
                                {/* Mock selection overlay */}
                                <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 border-2 border-blue-500 bg-blue-500/10 rounded-lg pointer-events-none" />
                            </div>
                        )}

                        {/* Right: Validation Inputs */}
                        <div className="h-full flex flex-col gap-3 overflow-hidden">
                            {isViewerCollapsed && (
                                <Button variant="outline" size="sm" onClick={() => setIsViewerCollapsed(false)} className="w-fit">
                                    <Eye className="h-3.5 w-3.5 mr-2" /> Mostrar documento
                                </Button>
                            )}

                            <Card className="flex flex-col h-full overflow-hidden">
                                <div className="py-2 px-4 border-b bg-muted/30">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-bold">{currentUnit.name}</h2>
                                        <Badge variant="outline" className="bg-white">{currentUnit.surface}</Badge>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-gray-700">Colindancias (IA)</label>
                                            <Badge variant="secondary" className="text-[10px]">98% Confianza</Badge>
                                        </div>
                                        <textarea
                                            className="w-full h-32 p-3 text-xs font-mono border rounded-md bg-slate-50 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                                            value={currentUnit.colindancias}
                                            readOnly={isAuthorized}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                setUnitsData(prev => prev.map((u, i) => i === currentUnitIndex ? { ...u, colindancias: val } : u))
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-gray-700">Redacción Notarial (Automática)</label>
                                            <Zap className="h-3 w-3 text-amber-500" />
                                        </div>
                                        <textarea
                                            className="w-full h-32 p-3 text-sm leading-relaxed border rounded-md bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                                            value={currentUnit.notarialText}
                                            readOnly={isAuthorized}
                                            onChange={(e) => {
                                                const val = e.target.value
                                                setUnitsData(prev => prev.map((u, i) => i === currentUnitIndex ? { ...u, notarialText: val } : u))
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="p-3 border-t bg-gray-50 flex justify-between items-center">
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => setCurrentUnitIndex(Math.max(0, currentUnitIndex - 1))}
                                            disabled={currentUnitIndex === 0}
                                        >
                                            <ChevronLeft className="h-4 w-4" /> Anterior
                                        </Button>
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => setCurrentUnitIndex(Math.min(unitsData.length - 1, currentUnitIndex + 1))}
                                            disabled={currentUnitIndex === unitsData.length - 1}
                                        >
                                            Siguiente <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {!isAuthorized ? (
                                        <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-sm"
                                            onClick={handleAuthorize}
                                        >
                                            <CheckCircle2 className="h-4 w-4 mr-2" /> Autorizar Unidad
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="text-green-700 bg-green-100 hover:bg-green-200 border border-green-200"
                                            onClick={() => {
                                                const next = new Set(authorizedUnits)
                                                next.delete(currentUnit.id)
                                                setAuthorizedUnits(next)
                                            }}
                                        >
                                            <CheckCircle2 className="h-4 w-4 mr-2" /> Autorizada
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- Main Page Component ---

export default function DeslindePage() {
    // State machine: 'upload' -> 'processing' -> 'validation'
    const [appState, setAppState] = useState<'upload' | 'processing' | 'validation'>('upload')

    // Simulate navigation/auth context
    const { preavisoType, completedStages } = useMock()

    // Handlers
    const handleProcess = () => setAppState('processing')
    const handleCompleteProcessing = () => setAppState('validation')
    const handleBack = () => {
        if (appState === 'validation') setAppState('upload')
        else window.history.back() // Or use router
    }

    // Direct render based on state
    if (appState === 'upload') {
        return (
            <div className="container mx-auto p-8 max-w-4xl py-20">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Lectura de Plantas Arquitectónicas</h1>
                        <p className="text-muted-foreground">Sube los planos para extraer medidas y colindancias</p>
                    </div>
                    <Link href="/dashboard/mocks/proyecto-detalle">
                        <Button variant="ghost"><ArrowLeft className="mr-2 h-4 w-4" /> Volver al Hub</Button>
                    </Link>
                </div>
                <UploadZoneSimulator onProcess={handleProcess} />
            </div>
        )
    }

    if (appState === 'processing') {
        return <ProcessingScreenSimulator onComplete={handleCompleteProcessing} />
    }

    if (appState === 'validation') {
        return <ValidationWizardSimulator onBack={() => setAppState('upload')} />
    }

    return null
}
