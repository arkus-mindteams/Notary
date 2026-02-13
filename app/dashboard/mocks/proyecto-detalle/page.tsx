"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Folder,
    File,
    ChevronRight,
    ChevronDown,
    ArrowLeft,
    Search,
    Filter,
    Clock,
    User,
    ClipboardCheck,
    MapPin,
    Users,
    Activity,
    MessageSquare,
    CheckCircle2,
    FileText,
    FileCheck,
    Maximize2,
    ShieldCheck,
    Zap,
    Download,
    Share2,
    Building,
    Calendar,
    AlertCircle
} from 'lucide-react'
import Link from 'next/link'
import { useMock } from '../mock-context'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

interface FileItem {
    name: string
    size: string
    date: string
    source?: 'IA' | 'Manual'
}

interface FolderItem {
    name: string
    items: (FolderItem | FileItem)[]
}

const MOCK_FILES: (FolderItem | FileItem)[] = [
    {
        name: '01 Pre-Aviso',
        items: [
            { name: 'Solicitud_Preaviso_Generada.docx', size: '45 KB', date: 'Hace 2 horas', source: 'IA' },
            { name: 'Solicitud_Preaviso_Generada.pdf', size: '1.2 MB', date: 'Hace 2 horas', source: 'IA' },
        ]
    },
    {
        name: '02 Documentos Inmueble',
        items: [
            { name: 'Hoja_Inscripción_RPP.pdf', size: '2.4 MB', date: 'Ayer', source: 'Manual' },
            { name: 'Asignacion_Numero_Oficial.pdf', size: '0.8 MB', date: 'Ayer', source: 'Manual' },
            { name: 'Avaluó_Comercial.pdf', size: '4.1 MB', date: 'Ayer', source: 'Manual' },
        ]
    },
    {
        name: '03 Identificaciones',
        items: [
            { name: 'INE_Vendedor_JuanPerez.jpg', size: '1.1 MB', date: 'Hace 3 días', source: 'Manual' },
            { name: 'Pasaporte_Comprador_RobertoS.jpg', size: '1.5 MB', date: 'Hace 3 días', source: 'Manual' },
        ]
    },
    {
        name: '04 Proyecto de Escritura',
        items: [
            { name: 'Borrador_Primera_Revision.docx', size: '65 KB', date: 'Pendiente', source: 'IA' },
        ]
    }
]

export default function ExpedienteHubPage() {
    const { preavisoType, completedStages, extractedData } = useMock()
    const [isPdfOpen, setIsPdfOpen] = useState(false)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['01 Pre-Aviso', '02 Documentos Inmueble']))

    const stageOrder = ['captura', 'deslinde', 'validacion', 'redaccion', 'firma']

    // Helper to check if a stage should be considered complete (if it or any later stage is complete)
    const isStageComplete = (stageId: string) => {
        if (completedStages.includes(stageId)) return true
        const stageIndex = stageOrder.indexOf(stageId)
        const highestCompletedIndex = Math.max(...completedStages.map(s => stageOrder.indexOf(s)))
        return highestCompletedIndex > stageIndex
    }

    const stages = [
        { id: 'captura', label: 'Pre-Aviso (Captura)', status: isStageComplete('captura') ? 'completado' : 'en_proceso', link: '/dashboard/mocks/chat-asistente', icon: MessageSquare },
        { id: 'deslinde', label: 'Deslinde (Plantas)', status: isStageComplete('deslinde') ? 'completado' : (isStageComplete('captura') ? 'en_proceso' : 'pendiente'), link: '/dashboard/mocks/deslinde', icon: Building },
        { id: 'validacion', label: 'Validación (Cotejo)', status: isStageComplete('validacion') ? 'completado' : (isStageComplete('deslinde') ? 'en_proceso' : 'pendiente'), link: '/dashboard/mocks/direct-review', icon: ShieldCheck },
        { id: 'redaccion', label: 'Instrumentación', status: isStageComplete('redaccion') ? 'completado' : (isStageComplete('validacion') ? 'en_proceso' : 'pendiente'), link: '/dashboard/mocks/escrituracion-nueva', icon: Zap },
        { id: 'firma', label: 'Firma y Cierre', status: isStageComplete('firma') ? 'completado' : (isStageComplete('redaccion') ? 'en_proceso' : 'pendiente'), link: '/dashboard/mocks/cotejamiento-revision', icon: CheckCircle2 },
    ]

    // Filter files based on completed stages
    const visibleFiles = React.useMemo(() => {
        return MOCK_FILES.filter(folder => {
            if (folder.name.includes('01')) return true // Always show Pre-Aviso
            if (folder.name.includes('02')) return isStageComplete('captura')
            if (folder.name.includes('03')) return isStageComplete('captura')
            if (folder.name.includes('04')) return isStageComplete('redaccion')
            return false
        })
    }, [completedStages])

    const toggleFolder = (name: string) => {
        const next = new Set(expandedFolders)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        setExpandedFolders(next)
    }

    const renderItems = (items: (FolderItem | FileItem)[], depth = 0) => {
        return items.map((item, idx) => {
            const isFolder = 'items' in item
            const isOpen = expandedFolders.has(item.name)

            if (isFolder) {
                return (
                    <div key={`${item.name}-${idx}`} className="select-none mb-1">
                        <div
                            className={`flex items-center py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${isOpen ? 'bg-blue-50/50 text-blue-900' : 'hover:bg-gray-100 text-gray-700'
                                }`}
                            style={{ paddingLeft: `${depth * 12 + 12}px` }}
                            onClick={() => toggleFolder(item.name)}
                        >
                            <div className={`mr-2 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                            </div>
                            <Folder className={`h-4 w-4 mr-2 ${isOpen ? 'text-blue-500 fill-blue-500/20' : 'text-gray-400 fill-gray-400/20'}`} />
                            <span className="text-sm font-medium tracking-tight">{item.name}</span>
                        </div>
                        {isOpen && (
                            <div className="mt-1 relative">
                                {item.items && renderItems(item.items, depth + 1)}
                            </div>
                        )}
                    </div>
                )
            } else {
                const file = item as FileItem
                const isPdf = file.name.endsWith('.pdf')
                const isDoc = file.name.endsWith('.docx')
                const isImg = file.name.match(/\.(jpg|jpeg|png)$/)

                return (
                    <div
                        key={`${file.name}-${idx}`}
                        className="group flex items-start py-2 px-3 rounded-lg cursor-pointer hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all duration-200 mb-1"
                        style={{ paddingLeft: `${depth * 12 + 28}px` }}
                    >
                        <div className="w-5 flex justify-center shrink-0 mr-3 mt-0.5">
                            {isPdf && <FileText className="h-4 w-4 text-red-500" />}
                            {isDoc && <FileText className="h-4 w-4 text-blue-500" />}
                            {isImg && <FileCheck className="h-4 w-4 text-purple-500" />}
                            {!isPdf && !isDoc && !isImg && <File className="h-4 w-4 text-gray-400" />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-700 transition-colors">
                                    {file.name}
                                </span>
                            </div>
                            <div className="flex items-center text-xs text-gray-500 mt-1 space-x-2">
                                <span>{file.size}</span>
                                <span className="text-gray-300">•</span>
                                <span>{file.date}</span>
                                {file.source && (
                                    <>
                                        <span className="text-gray-300">•</span>
                                        <Badge variant="secondary" className={`h-4 px-1.5 text-[10px] border-none font-medium ${file.source === 'IA' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {file.source}
                                        </Badge>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        })
    }

    // Helper to check if a stage tab should be enabled (i.e., previous stage is complete)
    const isTabEnabled = (stageId: string) => {
        if (stageId === 'resumen') return true
        if (stageId === 'captura') return true
        if (stageId === 'deslinde') return isStageComplete('captura')
        if (stageId === 'validacion') return isStageComplete('deslinde')
        if (stageId === 'redaccion') return isStageComplete('validacion')
        if (stageId === 'firma') return isStageComplete('redaccion')
        return false
    }

    const handleOpenPdf = () => {
        setIsPdfOpen(true)
    }

    const renderResumenContent = () => {
        const isCapturaComplete = isStageComplete('captura')
        const isDeslindeComplete = isStageComplete('deslinde')
        const isValidacionComplete = isStageComplete('validacion')
        const isRedaccionComplete = isStageComplete('redaccion')

        if (!isCapturaComplete) {
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <Card className="border-none shadow-sm ring-1 ring-gray-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center text-gray-500">
                                    <ClipboardCheck className="h-4 w-4 mr-2" />
                                    Documentación Pendiente
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center p-2 rounded bg-gray-50 border border-gray-100">
                                    <div className="h-4 w-4 border-2 border-gray-300 rounded mr-3" />
                                    <span className="text-sm text-gray-600">Título de Propiedad (Escritura Anterior)</span>
                                </div>
                                <div className="flex items-center p-2 rounded bg-gray-50 border border-gray-100">
                                    <div className="h-4 w-4 border-2 border-gray-300 rounded mr-3" />
                                    <span className="text-sm text-gray-600">Identificaciones Oficiales (INE/Pasaporte)</span>
                                </div>
                                <div className="flex items-center p-2 rounded bg-gray-50 border border-gray-100">
                                    <div className="h-4 w-4 border-2 border-gray-300 rounded mr-3" />
                                    <span className="text-sm text-gray-600">Boleta Predial Vigente</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 text-white shadow-xl">
                            <h3 className="text-lg font-bold mb-2 flex items-center">
                                <MessageSquare className="h-5 w-5 mr-2" />
                                Iniciar Captura
                            </h3>
                            <p className="text-sm text-gray-300 leading-relaxed mb-6">
                                El expediente está en fase inicial. Utiliza el Asistente IA para capturar los datos generales y recibir los documentos preliminares.
                            </p>
                            <Link href="/dashboard/mocks/chat-asistente">
                                <Button className="w-full bg-white text-gray-900 hover:bg-gray-100 font-bold border-none shadow-lg">
                                    IR AL CHAT ASISTENTE
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )
        }

        if (isCapturaComplete && !isDeslindeComplete) {
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <Card className="border-none shadow-sm ring-1 ring-gray-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center text-blue-600">
                                    <Users className="h-4 w-4 mr-2" />
                                    Datos Capturados (Pre-Aviso)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex justify-between items-center p-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 uppercase font-bold">Vendedor</span>
                                    <span className="text-sm font-medium">Juan Pérez Maldonado</span>
                                </div>
                                <div className="flex justify-between items-center p-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 uppercase font-bold">Comprador</span>
                                    <span className="text-sm font-medium">Roberto Sánchez García</span>
                                </div>
                                <div className="flex justify-between items-center p-2 border-b border-gray-50">
                                    <span className="text-xs text-gray-500 uppercase font-bold">Precio</span>
                                    <span className="text-sm font-bold text-green-600">$2,500,000.00</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-xl">
                            <h3 className="text-lg font-bold mb-2 flex items-center">
                                <Building className="h-5 w-5 mr-2" />
                                Requiere Deslinde
                            </h3>
                            <p className="text-sm text-indigo-100 leading-relaxed mb-6">
                                La captura inicial está completa. El siguiente paso es procesar los planos arquitectónicos para obtener las medidas y colindancias exactas.
                            </p>
                            <Link href="/dashboard/mocks/deslinde">
                                <Button className="w-full bg-white text-indigo-700 hover:bg-indigo-50 font-bold border-none shadow-lg">
                                    REALIZAR DESLINDE
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )
        }

        if (isDeslindeComplete && !isValidacionComplete) {
            return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <Card className="border-none shadow-sm ring-1 ring-gray-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold flex items-center">
                                    <AlertCircle className="h-4 w-4 mr-2 text-orange-500" />
                                    Alertas de Validación (Cotejo)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-3 rounded-lg bg-orange-50 border border-orange-100 flex items-start space-x-3">
                                    <div className="h-5 w-5 rounded-full bg-orange-200 flex items-center justify-center mt-0.5 shrink-0">
                                        <Activity className="h-3 w-3 text-orange-700" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-orange-800">Inconsistencia en Folio Real</p>
                                        <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">
                                            La superficie en la Hoja de Inscripción (85.5 m²) difiere del Avalúo (86.0 m²). Requiere revisión manual.
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-700 font-bold hover:bg-orange-100">REVISAR</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-xl">
                            <h3 className="text-lg font-bold mb-2 flex items-center">
                                <ShieldCheck className="h-5 w-5 mr-2" />
                                Validación Pendiente
                            </h3>
                            <p className="text-sm text-orange-50 leading-relaxed mb-6">
                                Se han detectado discrepancias entre los documentos fuente. Es necesario validar la información antes de generar la escritura.
                            </p>
                            <Link href="/dashboard/mocks/direct-review">
                                <Button className="w-full bg-white text-orange-600 hover:bg-orange-50 font-bold border-none shadow-lg">
                                    RESOLVER DISCREPANCIAS
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )
        }

        // Ready for Drafting (Validacion Complete)
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Summary & Alerts */}
                <div className="space-y-6">
                    <Card className="border-none shadow-sm ring-1 ring-gray-100">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center">
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                Estado de Validación
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-3 rounded-lg bg-green-50 border border-green-100 flex items-start space-x-3">
                                <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center mt-0.5 shrink-0">
                                    <CheckCircle2 className="h-3 w-3 text-green-700" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-green-800">Expediente Validado</p>
                                    <p className="text-xs text-green-600 mt-0.5 leading-relaxed">
                                        Todas las discrepancias han sido resueltas. Identidad y Propiedad confirmadas.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm ring-1 ring-gray-100">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold flex items-center">
                                <Users className="h-4 w-4 mr-2 text-blue-600" />
                                Partes Involucradas (Generado por IA)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/30">
                                <div className="flex items-center space-x-3">
                                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">JP</div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-900">Juan Pérez Maldonado</p>
                                        <p className="text-xs text-gray-500 uppercase">Enajenante (Vendedor)</p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="bg-white text-[10px] text-green-600">VALIDADO</Badge>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/30">
                                <div className="flex items-center space-x-3">
                                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">RS</div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-900">Roberto Sánchez García</p>
                                        <p className="text-xs text-gray-500 uppercase">Adquirente (Comprador)</p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="bg-white text-[10px] text-green-600">VALIDADO</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Timeline & Actions */}
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-100">
                        <h3 className="text-lg font-bold mb-2 flex items-center">
                            <Zap className="h-5 w-5 mr-2" />
                            Próxima Acción IA
                        </h3>
                        <p className="text-sm text-blue-50 leading-relaxed mb-6">
                            Todos los datos del pre-aviso han sido capturados. Ya puedes iniciar la redacción automatizada del proyecto de escritura basándote en la plantilla de Compraventa Residencial.
                        </p>
                        <Link href="/dashboard/mocks/escrituracion-nueva">
                            <Button className="w-full bg-white text-blue-600 hover:bg-blue-50 font-bold border-none shadow-lg">
                                GENERAR PROYECTO DE ESCRITURA
                            </Button>
                        </Link>
                    </div>

                    <div className="p-4 space-y-4">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center">
                            <Clock className="h-3 w-3 mr-2" />
                            Actividad Reciente
                        </h3>
                        <div className="space-y-4">
                            {[
                                { user: 'IA Assistant', action: 'Extracción de datos completada', time: 'Hace 2 horas', icon: Zap, color: 'text-purple-500 bg-purple-50' },
                                { user: 'Carlos (Abogado)', action: 'Subió Hoja de Inscripción RPP', time: 'Ayer, 4:30 PM', icon: Folder, color: 'text-blue-500 bg-blue-50' },
                                { user: preavisoType.toUpperCase(), action: 'Expediente Iniciado', time: 'Hace 3 días', icon: ClipboardCheck, color: 'text-green-500 bg-green-50' },
                            ].map((log, i) => (
                                <div key={i} className="flex items-start space-x-3">
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${log.color}`}>
                                        <log.icon className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-900">{log.action}</p>
                                        <p className="text-xs text-gray-500">{log.user} • {log.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Detail Header */}
            <div className="bg-gray-50/50 border-b border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                        <Link href="/dashboard/mocks/kanban">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-blue-600">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center space-x-3">
                                <h1 className="text-xl font-bold text-gray-900">Expediente: PÉREZ vs SÁNCHEZ</h1>
                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none px-3 py-0.5">
                                    Folio Notarial: 2024/088-A
                                </Badge>
                            </div>
                            <div className="flex items-center mt-1 text-xs text-gray-500 space-x-4">
                                <span className="flex items-center"><MapPin className="h-3 w-3 mr-1" /> Folio Real: 123456</span>
                                <span className="flex items-center"><User className="h-3 w-3 mr-1" /> Responsable: Carlos (Abogado)</span>
                                <span className="flex items-center font-bold text-blue-600 uppercase tracking-tighter">Acto: {preavisoType}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-3">
                        <Button variant="outline" size="sm" className="gap-2 font-bold text-gray-600">
                            <Share2 className="h-4 w-4" />
                            Compartir
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100 gap-2 font-bold">
                            <Download className="h-4 w-4" />
                            Descargar Todo
                        </Button>
                    </div>
                </div>

                {/* E2E Stage Stepper */}
                <div className="grid grid-cols-5 gap-4 mt-8">
                    {stages.map((stage, idx) => (
                        <div key={stage.id} className={`group ${!isTabEnabled(stage.id) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                            <Link href={isTabEnabled(stage.id) ? stage.link : '#'} onClick={(e) => !isTabEnabled(stage.id) && e.preventDefault()}>
                                <div className={`relative p-4 rounded-xl border-2 transition-all ${stage.status === 'completado' ? 'bg-green-50 border-green-100' :
                                    stage.status === 'en_proceso' ? 'bg-white border-blue-400 shadow-lg shadow-blue-50 ring-1 ring-blue-100' : 'bg-gray-50 border-gray-100 border-dashed opacity-70'
                                    }`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${stage.status === 'completado' ? 'bg-green-200 text-green-700' :
                                            stage.status === 'en_proceso' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                                            }`}>
                                            <stage.icon className="h-4 w-4" />
                                        </div>
                                        <Badge className={`text-[10px] uppercase border-none ${stage.status === 'completado' ? 'bg-green-100 text-green-700' :
                                            stage.status === 'en_proceso' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            {stage.status.replace('_', ' ')}
                                        </Badge>
                                    </div>
                                    <h3 className={`text-xs font-bold ${stage.status === 'en_proceso' ? 'text-blue-700' : 'text-gray-700'}`}>
                                        {stage.label}
                                    </h3>
                                    {stage.status === 'en_proceso' && (
                                        <div className="absolute -bottom-1 left-4 right-4 h-1 bg-blue-600 rounded-full" />
                                    )}
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* File Explorer (Left) */}
                <div className="w-[320px] border-r border-gray-100 bg-gray-50/30 flex flex-col">
                    <div className="p-4 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar en expediente..."
                                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {renderItems(visibleFiles)}
                    </div>
                </div>

                {/* Main Action Area (Right) */}
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                    <Tabs defaultValue="resumen" className="w-full">
                        <TabsList className="grid w-full grid-cols-6 mb-8">
                            <TabsTrigger value="resumen">Resumen</TabsTrigger>
                            <TabsTrigger value="captura" disabled={!isTabEnabled('captura')}>Pre-Aviso</TabsTrigger>
                            <TabsTrigger value="deslinde" disabled={!isTabEnabled('deslinde')}>Deslinde</TabsTrigger>
                            <TabsTrigger value="validacion" disabled={!isTabEnabled('validacion')}>Validación</TabsTrigger>
                            <TabsTrigger value="redaccion" disabled={!isTabEnabled('redaccion')}>Redacción</TabsTrigger>
                            <TabsTrigger value="firma" disabled={!isTabEnabled('firma')}>Firma</TabsTrigger>
                        </TabsList>

                        <TabsContent value="resumen" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {renderResumenContent()}
                        </TabsContent>

                        <TabsContent value="captura" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <div className="flex items-center space-x-4">
                                    <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900">Pre-Aviso Generado</h3>
                                        <p className="text-sm text-gray-500">Creado el 14 Feb 2024 • Versión Final</p>
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    <Link href="/dashboard/mocks/chat-asistente">
                                        <Button variant="outline" size="sm" className="h-9">
                                            <MessageSquare className="h-4 w-4 mr-2" />
                                            Ver Chat Origen
                                        </Button>
                                    </Link>
                                    <Button onClick={handleOpenPdf} className="bg-blue-600 hover:bg-blue-700 h-9">
                                        <Maximize2 className="h-4 w-4 mr-2" />
                                        Ver Documento PDF
                                    </Button>
                                </div>
                            </div>

                            <Card className="border-none shadow-sm ring-1 ring-gray-100">
                                <CardHeader>
                                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-gray-500">Datos Capturados (Extracto)</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-bold text-gray-400 uppercase">Vendedor</label>
                                            <div className="flex items-center mt-1 p-2 bg-gray-50 rounded-lg border border-gray-100">
                                                <User className="h-4 w-4 text-gray-400 mr-2" />
                                                <span className="text-sm font-medium text-gray-900">Juan Pérez Maldonado</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-gray-400 uppercase">Comprador</label>
                                            <div className="flex items-center mt-1 p-2 bg-gray-50 rounded-lg border border-gray-100">
                                                <User className="h-4 w-4 text-gray-400 mr-2" />
                                                <span className="text-sm font-medium text-gray-900">Roberto Sánchez García</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-sm font-bold text-gray-400 uppercase">Inmueble</label>
                                            <div className="flex items-center mt-1 p-2 bg-gray-50 rounded-lg border border-gray-100">
                                                <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                                                <span className="text-sm font-medium text-gray-900">Calle Roble 45, Col. Jardines</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-bold text-gray-400 uppercase">Precio Pactado</label>
                                            <div className="flex items-center mt-1 p-2 bg-gray-50 rounded-lg border border-gray-100">
                                                <span className="text-base font-bold text-green-600">$2,500,000.00 M.N.</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-span-2 pt-4 border-t border-gray-100">
                                        <label className="text-sm font-bold text-gray-400 uppercase mb-2 block">Documentos Recibidos para Pre-Aviso</label>
                                        <div className="flex space-x-2">
                                            <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100">Identificación Oficial</Badge>
                                            <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100">Título de Propiedad</Badge>
                                            <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100">Boleta Predial</Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>


                        <TabsContent value="deslinde" className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            <Card className="border-none shadow-sm ring-1 ring-gray-100">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center">
                                        <Building className="h-5 w-5 mr-2 text-blue-600" />
                                        Deslinde y Levantamiento
                                    </CardTitle>
                                    <CardDescription>Medidas extraídas del plano arquitectónico</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-gray-100 rounded-lg flex items-center justify-center h-48 border-2 border-dashed border-gray-200">
                                            <div className="text-center text-gray-400">
                                                <MapPin className="h-8 w-8 mx-auto mb-2" />
                                                <span className="text-xs">Vista Previa Plano (20.00 x 45.00)</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center p-2 rounded bg-blue-50 border border-blue-100">
                                                <span className="text-sm font-bold text-blue-800">Superficie Total</span>
                                                <span className="text-sm font-mono font-bold">900.00 m²</span>
                                            </div>
                                            <div className="text-xs text-gray-500 space-y-1 p-2">
                                                <p><span className="font-bold">Norte:</span> 20.00m con Calle Primera</p>
                                                <p><span className="font-bold">Sur:</span> 20.00m con Lote 5</p>
                                                <p><span className="font-bold">Este:</span> 45.00m con Ave. Revolución</p>
                                                <p><span className="font-bold">Oeste:</span> 45.00m con Privada</p>
                                            </div>
                                        </div>
                                    </div>
                                    <Link href="/dashboard/mocks/deslinde">
                                        <Button className="w-full mt-4" variant="outline">
                                            <Building className="h-4 w-4 mr-2" />
                                            Abrir Herramienta de Deslinde
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="validacion" className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            <Card className="border-none shadow-sm ring-1 ring-gray-100">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center">
                                        <ShieldCheck className="h-5 w-5 mr-2 text-blue-600" />
                                        Cotejamiento y Validación
                                    </CardTitle>
                                    <CardDescription>Estado de validación de documentos y datos</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Document Comparison Example */}
                                    <div className="border border-green-100 bg-green-50/50 rounded-xl p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold text-green-900 flex items-center">
                                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                                Validación de Identidad
                                            </h4>
                                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 px-3">
                                                100% COINCIDENCIA
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                                            {/* Source 1 */}
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-center space-y-2">
                                                <div className="mx-auto h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center">
                                                    <FileText className="h-5 w-5 text-blue-600" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900">INE (Vendedor)</p>
                                                    <p className="text-[10px] text-gray-500">Documento Escaneado</p>
                                                </div>
                                            </div>

                                            {/* Match Visual */}
                                            <div className="flex flex-col items-center justify-center space-y-1">
                                                <div className="w-16 h-0.5 bg-green-300 relative">
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-green-100 p-1 rounded-full">
                                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                    </div>
                                                </div>
                                                <span className="text-[9px] font-bold text-green-600 uppercase tracking-wider">Match</span>
                                            </div>

                                            {/* Source 2 */}
                                            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-center space-y-2">
                                                <div className="mx-auto h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center">
                                                    <MessageSquare className="h-5 w-5 text-purple-600" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-gray-900">Datos Chat</p>
                                                    <p className="text-[10px] text-gray-500">Información Extraída</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Comparison Details */}
                                        <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-2">
                                            <div className="flex justify-between items-center text-xs pb-2 border-b border-gray-50">
                                                <span className="text-gray-500">Nombre Completo</span>
                                                <span className="font-mono text-gray-700">{extractedData?.vendedor?.nombre || 'Juan Pérez Maldonado'}</span>
                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            </div>
                                            <div className="flex justify-between items-center text-xs pb-2 border-b border-gray-50">
                                                <span className="text-gray-500">Clave de Elector / ID</span>
                                                <span className="font-mono text-gray-700">PMEJ800101HDFRRN09</span>
                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500">Vigencia</span>
                                                <span className="font-mono text-gray-700">2028</span>
                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Warnings Section (if needed) */}
                                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg flex items-start space-x-3">
                                        <div className="h-5 w-5 rounded-full bg-orange-200 flex items-center justify-center mt-0.5 shrink-0">
                                            <Activity className="h-3 w-3 text-orange-700" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-orange-800">Pendiente: Constancia de Situación Fiscal</p>
                                            <p className="text-xs text-orange-600 mt-1">
                                                No se ha podido validar el RFC automáticamente. Se requiere subir el PDF original de la constancia.
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-8 text-xs text-orange-700 hover:bg-orange-100 font-bold">
                                            SUBIR
                                        </Button>
                                    </div>

                                    <Link href="/dashboard/mocks/direct-review">
                                        <Button className="w-full mt-4" variant="outline">
                                            <ShieldCheck className="h-4 w-4 mr-2" />
                                            Ver Detalle Completo de Validaciones
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="redaccion" className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            <Card className="border-none shadow-sm ring-1 ring-gray-100 flex flex-col h-[600px]">
                                <CardHeader className="pb-4 border-b border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-lg flex items-center">
                                                <Zap className="h-5 w-5 mr-2 text-blue-600" />
                                                Instrumentación (Escritura)
                                            </CardTitle>
                                            <CardDescription>Visualización del proyecto completo</CardDescription>
                                        </div>
                                        <div className="flex space-x-2">
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">
                                                BORRADOR FINAL
                                            </Badge>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <Download className="h-4 w-4 text-gray-500" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                                    <div className="max-w-3xl mx-auto bg-white shadow-sm border border-gray-200 p-12 min-h-full">
                                        <div className="font-serif text-justify text-sm leading-relaxed text-gray-800 space-y-6">
                                            <div className="text-right font-bold text-xs uppercase text-gray-500 mb-8">
                                                <p>Volumen: 1,240</p>
                                                <p>Instrumento: 45,201</p>
                                                <p>Libro: 4</p>
                                            </div>

                                            <p>
                                                <span className="font-bold">EN LA CIUDAD DE MÉXICO</span>, a los catorce días del mes de febrero del año dos mil veinticuatro,
                                                <span className="font-bold"> YO, EL LICENCIADO CARLOS ESTAVILLO</span>, Notario Público número 245 de la Ciudad de México,
                                                hago constar:
                                            </p>

                                            <p className="font-bold text-center uppercase tracking-widest my-4">EL CONTRATO DE COMPRAVENTA</p>

                                            <p>
                                                Que celebran por una parte, el señor <span className="font-bold">JUAN PÉREZ MALDONADO</span>, a quien en lo sucesivo se le denominará
                                                "LA PARTE VENDEDORA", y por la otra parte, el señor <span className="font-bold">ROBERTO SÁNCHEZ GARCÍA</span>, a quien en lo sucesivo se le denominará
                                                "LA PARTE COMPRADORA", al tenor de los siguientes Antecedentes y Cláusulas:
                                            </p>

                                            <div className="space-y-4">
                                                <h3 className="font-bold text-center uppercase text-xs tracking-widest border-b border-gray-200 pb-2 mx-12">A N T E C E D E N T E S</h3>
                                                <p>
                                                    <span className="font-bold">PRIMERO.</span> Declara "LA PARTE VENDEDORA", bajo protesta de decir verdad, que es legítima propietaria
                                                    del inmueble ubicado en <span className="uppercase">{extractedData?.inmueble?.direccion || 'CALLE PRINCIPAL NÚMERO 123, COLONIA CENTRO, CIUDAD DE MÉXICO'}</span>,
                                                    con la superficie, medidas y colindancias que constan en el Título de Propiedad correspondiente.
                                                </p>
                                                <p>
                                                    <span className="font-bold">SEGUNDO.</span> Manifiesta "LA PARTE VENDEDORA" que el inmueble descrito en el antecedente inmediato anterior
                                                    se encuentra libre de todo gravamen y responsabilidad, y al corriente en el pago de sus contribuciones prediales y de derechos por servicio de agua.
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <h3 className="font-bold text-center uppercase text-xs tracking-widest border-b border-gray-200 pb-2 mx-12">C L Á U S U L A S</h3>
                                                <p>
                                                    <span className="font-bold">PRIMERA. COMPRAVENTA.</span> "LA PARTE VENDEDORA" vende, cede y traspasa, sin reserva ni limitación alguna,
                                                    a favor de "LA PARTE COMPRADORA", quien adquiere para sí, el inmueble descrito en el Antecedente Primero de este instrumento,
                                                    con todo lo que de hecho y por derecho le corresponde.
                                                </p>
                                                <p>
                                                    <span className="font-bold">SEGUNDA. PRECIO.</span> El precio fijado para esta operación es la cantidad de
                                                    <span className="font-bold"> $4,500,000.00 (CUATRO MILLONES QUINIENTOS MIL PESOS 00/100 MONEDA NACIONAL)</span>,
                                                    que "LA PARTE COMPRADORA" paga a "LA PARTE VENDEDORA" en este acto, mediante transferencia electrónica de fondos, dándose esta última por recibida
                                                    a su entera satisfacción, otorgando el recibo más eficaz que en derecho proceda.
                                                </p>
                                                <p>
                                                    <span className="font-bold">TERCERA. ENTREGA.</span> "LA PARTE VENDEDORA" se obliga a entregar la posesión material y jurídica del inmueble
                                                    objeto de esta compraventa a "LA PARTE COMPRADORA", libre de todo ocupante y gravamen, al momento de la firma de la presente escritura.
                                                </p>
                                                <p>
                                                    <span className="font-bold">CUARTA. GASTOS E IMPUESTOS.</span> Todos los gastos, derechos, impuestos y honorarios que se causen con motivo
                                                    de esta escritura, serán por cuenta exclusiva de "LA PARTE COMPRADORA", con excepción del Impuesto Sobre la Renta por Enajenación,
                                                    que será a cargo de "LA PARTE VENDEDORA".
                                                </p>
                                            </div>

                                            <div className="space-y-4 pt-4 border-t border-gray-200 mt-8">
                                                <p>
                                                    <span className="font-bold">YO, EL NOTARIO, CERTIFICO:</span>
                                                </p>
                                                <ol className="list-decimal pl-8 space-y-2">
                                                    <li>Que me he cerciorado de la identidad, capacidad y legitimación de los comparecientes.</li>
                                                    <li>Que les leí y expliqué el valor, las consecuencias y alcances legales del contenido de este instrumento.</li>
                                                    <li>Que manifestaron su conformidad con el mismo, firmándolo en mi presencia y ante mi fe.</li>
                                                </ol>
                                            </div>

                                            <div className="pt-12 flex justify-between px-12 text-center text-xs uppercase font-bold text-gray-400">
                                                <div className="border-t border-gray-300 pt-2 w-40">
                                                    Juan Pérez M.
                                                    <br />
                                                    Vendedor
                                                </div>
                                                <div className="border-t border-gray-300 pt-2 w-40">
                                                    Carlos Estavillo
                                                    <br />
                                                    Notario Autorizante
                                                </div>
                                                <div className="border-t border-gray-300 pt-2 w-40">
                                                    Roberto Sánchez G.
                                                    <br />
                                                    Comprador
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 flex justify-center">
                                        <Link href="/dashboard/mocks/escrituracion-nueva">
                                            <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg font-bold px-8">
                                                <FileText className="h-4 w-4 mr-2" />
                                                Abrir Editor Completo y Modificar
                                            </Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="firma" className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            <Card className="border-none shadow-sm ring-1 ring-gray-100">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center">
                                        <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                                        Firma y Cierre
                                    </CardTitle>
                                    <CardDescription>Programación de firma y entrega</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="p-6 text-center border-2 border-dashed border-gray-200 rounded-xl">
                                        <Calendar className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                                        <h3 className="font-bold text-gray-900">Firma Programada</h3>
                                        <p className="text-sm text-gray-500 mb-4">Viernes, 14 de Febrero - 11:00 AM</p>
                                        <Button size="sm">Reprogramar</Button>
                                    </div>
                                    <Link href="/dashboard/mocks/cotejamiento-revision">
                                        <Button className="w-full mt-4" variant="outline">
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Gestionar Firma
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        </TabsContent>

                    </Tabs >
                </div >
            </div >

            <Dialog open={isPdfOpen} onOpenChange={setIsPdfOpen}>
                <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0">
                    <div className="flex items-center justify-between p-4 border-b bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-bold text-gray-900">Pre-Aviso de Compraventa.pdf</DialogTitle>
                                <DialogDescription className="text-xs text-gray-400">Generado el 14 Feb 2024 • 1.2 MB</DialogDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8 gap-2">
                                <Download className="h-4 w-4" />
                                Descargar
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 bg-gray-100/50">
                        <div className="max-w-[21cm] mx-auto bg-white shadow-lg p-[2.5cm] min-h-[29.7cm] text-[11pt] leading-relaxed text-justify text-gray-800 font-serif">
                            <div className="text-right font-bold mb-8">
                                <p>ASUNTO: SE EMITE PRE-AVISO DE TRANSMISIÓN DE PROPIEDAD.</p>
                                <p>FOLIO: 2024/088-A</p>
                                <p>CIUDAD DE MÉXICO, A 14 DE FEBRERO DE 2024</p>
                            </div>

                            <p className="font-bold mb-4">
                                C. REGISTRADOR PÚBLICO DE LA PROPIEDAD Y DE COMERCIO<br />
                                DE LA CIUDAD DE MÉXICO.<br />
                                PRESENTE.
                            </p>

                            <p className="mb-6 indent-8">
                                <strong>LIC. CARLOS ESTAVILLO</strong>, Notario Público número 245 de la Ciudad de México, con domicilio en Calle de la Notaría número 123, Colonia Centro, Alcaldía Cuauhtémoc, C.P. 06000, ante usted con el debido respeto comparezco y expongo:
                            </p>

                            <p className="mb-6 indent-8">
                                Que con fundamento en lo dispuesto por el artículo 3016 del Código Civil para el Distrito Federal, hoy Ciudad de México, solicito se sirva realizar la <strong>ANOTACIÓN PREVENTIVA</strong> respecto de la operación de <strong>COMPRAVENTA</strong> que se proyecta celebrar bajo mi fe, con los siguientes datos:
                            </p>

                            <div className="mb-6 pl-8 border-l-4 border-gray-200">
                                <p className="mb-2"><strong>I. ANTECEDENTE REGISTRAL:</strong><br />
                                    Folio Real Electrónico: <strong>123456</strong>.</p>

                                <p className="mb-2"><strong>II. UBICACIÓN DEL INMUEBLE:</strong><br />
                                    Calle Roble número 45, Colonia Jardines, Alcaldía Coyoacán, Ciudad de México.</p>

                                <p className="mb-2"><strong>III. TITULAR REGISTRAL (VENDEDOR):</strong><br />
                                    SR. JUAN PÉREZ MALDONADO.</p>

                                <p className="mb-2"><strong>IV. ADQUIRENTE (COMPRADOR):</strong><br />
                                    SR. ROBERTO SÁNCHEZ GARCÍA.</p>
                            </div>

                            <p className="mb-6 indent-8">
                                La presente operación se tiene proyectada para su firma dentro de los próximos 30 días naturales.
                            </p>

                            <p className="mb-12 indent-8">
                                Agradeciendo de antemano la atención que se sirva prestar al presente, quedo de usted.
                            </p>

                            <div className="text-center mt-20">
                                <div className="inline-block border-t border-gray-400 w-64 pt-2">
                                    <p className="font-bold">LIC. CARLOS ESTAVILLO</p>
                                    <p className="text-sm">NOTARIO PÚBLICO No. 245</p>
                                    <p className="text-sm">CIUDAD DE MÉXICO</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    )
}
