"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    FileText,
    ArrowRight,
    CheckCircle2,
    FileCheck,
    Settings2,
    ListChecks,
    History,
    Clock,
    Zap
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMock } from '../mock-context'

export default function EscrituracionNuevaPage() {
    const { preavisoType, completedStages, setCompletedStages } = useMock()
    const router = useRouter()

    const handleStartDrafting = () => {
        if (!completedStages.includes('redaccion')) {
            setCompletedStages([...completedStages, 'redaccion'])
        }
        router.push('/dashboard/mocks/escrituracion-editor')
    }

    const templates = [
        { name: "Escritura Base - Estándar MN", description: "Plantilla institucional para actos de dominio comunes.", version: "v2.1", type: "Word (DOCX)" },
        { name: "Escritura - Crédito Hipotecario", description: "Incluye cláusulas específicas para instituciones financieras.", version: "v1.8", type: "Word (DOCX)" },
        { name: "Proyecto de Escritura - Simple", description: "Versión ligera para revisión preliminar.", version: "v1.0", type: "PDF" },
    ]

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Generación de Proyecto de Escritura</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Inicia la formalización del acto jurídico basándote en los datos validados del Pre-Aviso.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Status Card */}
                <Card className="md:col-span-2 border-none shadow-sm ring-1 ring-gray-100 bg-white">
                    <CardHeader className="p-6 pb-2 border-b border-gray-50 flex flex-row items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-sm font-bold flex items-center">
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                                Datos Listos para Instrumentación
                            </CardTitle>
                            <CardDescription className="text-xs">Validado satisfactoriamente por el Abogado.</CardDescription>
                        </div>
                        <Badge className="bg-blue-50 text-blue-700 border-none uppercase text-[10px] tracking-widest">{preavisoType}</Badge>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Objeto</span>
                                <span className="text-sm font-semibold text-gray-800">Casa Habitación - Vista Hermosa</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Partes</span>
                                <span className="text-sm font-semibold text-gray-800">2 Partes involucradas detectadas</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Folio Real</span>
                                <span className="text-sm font-semibold text-gray-800">123456</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Ultima Validación</span>
                                <span className="text-sm font-semibold text-gray-800 flex items-center">
                                    <Clock className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                                    Hace 15 minutos
                                </span>
                            </div>
                        </div>
                    </CardContent>
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex items-center text-xs text-gray-500">
                            <History className="h-3.5 w-3.5 mr-2" />
                            Sesión de Chat ID: #PRE-2024-88
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 font-bold">
                            Ver Trazabilidad de Captura
                        </Button>
                    </div>
                </Card>

                {/* Action Sidebar */}
                <div className="space-y-4">
                    <div className="p-6 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-100 flex flex-col justify-between h-full space-y-4">
                        <div className="space-y-3">
                            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                                <Zap className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-lg font-bold leading-tight">Generar Proyecto Automáticamente</h3>
                            <p className="text-xs text-blue-100 leading-relaxed">
                                Nuestra IA redactará el primer borrador de la escritura utilizando las cláusulas más actualizadas y tus preferencias de estilo.
                            </p>
                        </div>
                        <Button
                            className="w-full bg-white text-blue-600 hover:bg-blue-50 font-bold border-none h-11"
                            onClick={handleStartDrafting}
                        >
                            Iniciar Redacción IA
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center">
                    <Settings2 className="h-4 w-4 mr-2 text-blue-600" />
                    Configuración y Plantillas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {templates.map((template, idx) => (
                        <Card key={idx} className="hover:ring-1 hover:ring-blue-100 transition-all border-gray-100 shadow-sm cursor-pointer group">
                            <CardContent className="p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                        <FileText className="h-4 w-4" />
                                    </div>
                                    <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-200">
                                        {template.version}
                                    </Badge>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-gray-800">{template.name}</h4>
                                    <p className="text-[11px] text-gray-500 mt-1">{template.description}</p>
                                </div>
                                <div className="pt-2 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    <span>FORMATO: {template.type}</span>
                                    <FileCheck className="h-3.5 w-3.5 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
