"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    BarChart3,
    MessageSquare,
    FileEdit,
    ShieldCheck,
    ArrowRight,
    LayoutDashboard,
    Bot,
    Zap,
    FileText
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default function MockOverviewPage() {
    const modules = [
        {
            title: "Lectura de Plantas",
            description: "Interpretación visual de medidas y colindancias con IA.",
            icon: <FileText className="h-5 w-5 text-blue-600" />,
            link: "/dashboard/mocks/deslinde",
            status: "Completado",
            phase: "Módulo Técnico"
        },
        {
            title: "Expediente Digital",
            description: "Tablero Kanban y gestión de archivos estructurada por PRD.",
            icon: <LayoutDashboard className="h-5 w-5 text-blue-600" />,
            link: "/dashboard/mocks/kanban",
            status: "Completado",
            phase: "Fase 1"
        },
        {
            title: "Asistente de Pre-Aviso",
            description: "Chat IA adaptativo con simulación de actos jurídicos múltiples.",
            icon: <Bot className="h-5 w-5 text-purple-600" />,
            link: "/dashboard/mocks/chat-asistente",
            status: "Completado",
            phase: "Fase 2"
        },
        {
            title: "Generación de Escritura",
            description: "Editor con trazabilidad total a documentos fuente.",
            icon: <FileEdit className="h-5 w-5 text-orange-600" />,
            link: "/dashboard/mocks/escrituracion-editor",
            status: "Completado",
            phase: "Fase 3"
        },
        {
            title: "Cotejamiento Inteligente",
            description: "Revisión automática de discrepancias en split-view.",
            icon: <BarChart3 className="h-5 w-5 text-green-600" />,
            link: "/dashboard/mocks/cotejamiento-revision",
            status: "Completado",
            phase: "Fase 4"
        }
    ]

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Centro de Demostración</h1>
                <p className="text-gray-500 max-w-2xl">
                    Bienvenido al entorno de simulación de la Notaría Digital. Selecciona un módulo para explorar las futuras capacidades del sistema.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {modules.map((module, idx) => (
                    <Card key={idx} className="group hover:shadow-md transition-all border-gray-200 overflow-hidden">
                        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                            <div className="bg-gray-50 p-2.5 rounded-lg mr-4 group-hover:bg-blue-50 transition-colors">
                                {module.icon}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base font-bold">{module.title}</CardTitle>
                                    <Badge variant="outline" className={`text-[10px] ${module.status === 'Completado' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500'
                                        }`}>
                                        {module.status}
                                    </Badge>
                                </div>
                                <CardDescription className="text-xs font-semibold text-blue-500 uppercase mt-0.5 tracking-wider">
                                    {module.phase}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <p className="text-sm text-gray-600 mb-6 min-h-[40px]">
                                {module.description}
                            </p>
                            <Button asChild className="w-full bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:text-blue-600 group/btn" disabled={module.status === 'Próximamente'}>
                                <Link href={module.link} className="flex items-center justify-center">
                                    <span>Explorar Módulo</span>
                                    <ArrowRight className="h-4 w-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="bg-blue-600 border-none shadow-xl overflow-hidden relative">
                <Zap className="absolute -bottom-6 -right-6 h-48 w-48 text-blue-500 opacity-20 rotate-12" />
                <CardContent className="p-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white flex items-center">
                            <ShieldCheck className="h-5 w-5 mr-2" />
                            ¿Por qué usar Mocks Interactivos?
                        </h3>
                        <p className="text-blue-100 text-sm max-w-xl">
                            Permite validar la experiencia de usuario y el flujo jurídico antes de la implementación final en producción, asegurando que el producto resuelva las necesidades reales de la Notaría.
                        </p>
                    </div>
                    <Button variant="secondary" className="bg-white text-blue-600 hover:bg-blue-50 font-bold px-8">
                        Ver Roadmap Completo
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
