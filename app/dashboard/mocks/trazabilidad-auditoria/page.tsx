"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Activity,
    User,
    FileText,
    Clock,
    Shield,
    Bot,
    Search,
    Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AuditEvent {
    id: string
    timestamp: string
    actor: string
    role: 'Notario' | 'Abogado' | 'IA' | 'Sistema'
    action: string
    details: string
    severity: 'info' | 'warning' | 'critical'
}

const MOCK_EVENTS: AuditEvent[] = [
    { id: '1', timestamp: '10:45 AM', actor: 'IA Assistant', role: 'IA', action: 'Extracción de Datos', details: 'Extracción automática de datos de INE y Escritura para Pre-Aviso #404', severity: 'info' },
    { id: '2', timestamp: '10:46 AM', actor: 'Carlos López', role: 'Abogado', action: 'Validación Manual', details: 'Confirmación de datos del comprador Roberto Sánchez', severity: 'info' },
    { id: '3', timestamp: '10:50 AM', actor: 'Sistema', role: 'Sistema', action: 'Alerta RPP', details: 'Discrepancia menor en superficie: 85.5m² (RPP) vs 900m² (Deslinde)', severity: 'warning' },
    { id: '4', timestamp: '11:15 AM', actor: 'IA Deslinde', role: 'IA', action: 'Lectura de Plano', details: 'Análisis de "Plano_Arquitectonico_Final.pdf" completado con 98% confianza', severity: 'info' },
    { id: '5', timestamp: '11:30 AM', actor: 'Lic. Treviño', role: 'Notario', action: 'Aprobación Inmueble', details: 'Visto bueno a la descripción del inmueble para redacción', severity: 'info' },
    { id: '6', timestamp: '12:00 PM', actor: 'Sistema', role: 'Sistema', action: 'Generación Documento', details: 'Borrador inicial de Escritura generado (v1.0)', severity: 'info' },
]

export default function TrazabilidadPage() {
    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Activity className="h-6 w-6 text-blue-600" />
                        Trazabilidad y Auditoría
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Registro inmutable de todas las acciones en el expediente.
                    </p>
                </div>
                <div className="flex space-x-3">
                    <div className="relative w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                        <Input placeholder="Buscar evento..." className="pl-8 h-9" />
                    </div>
                    <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Exportar Log
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Timeline */}
                <Card className="lg:col-span-2 border-none shadow-sm ring-1 ring-gray-200">
                    <CardHeader className="border-b border-gray-100 bg-gray-50/50">
                        <CardTitle className="text-sm font-semibold text-gray-700">Línea de Tiempo de Eventos</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[600px] p-6">
                            <div className="relative border-l-2 border-gray-100 ml-3 space-y-8 pl-8">
                                {MOCK_EVENTS.map((event) => (
                                    <div key={event.id} className="relative">
                                        <div className={`absolute -left-[41px] top-1 h-6 w-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center
                                            ${event.role === 'IA' ? 'bg-purple-100' :
                                                event.role === 'Sistema' ? 'bg-gray-100' :
                                                    event.severity === 'warning' ? 'bg-orange-100' : 'bg-blue-100'}`}>
                                            {event.role === 'IA' ? <Bot className="h-3 w-3 text-purple-600" /> :
                                                event.role === 'Sistema' ? <Shield className="h-3 w-3 text-gray-600" /> :
                                                    <User className="h-3 w-3 text-blue-600" />}
                                        </div>

                                        <div className="group bg-white rounded-lg border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2 inline-block
                                                        ${event.role === 'IA' ? 'bg-purple-50 text-purple-700' :
                                                            event.role === 'Notario' ? 'bg-blue-50 text-blue-700' :
                                                                'bg-gray-100 text-gray-600'}`}>
                                                        {event.actor}
                                                    </span>
                                                    <h3 className="text-sm font-bold text-gray-900">{event.action}</h3>
                                                </div>
                                                <span className="text-xs font-mono text-gray-400 flex items-center">
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    {event.timestamp}
                                                </span>
                                            </div>

                                            <p className="text-sm text-gray-600 leading-relaxed">
                                                {event.details}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Stats Sidebar */}
                <div className="space-y-6">
                    <Card className="bg-blue-600 text-white border-none shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-blue-100">Integridad del Expediente</h3>
                                <Shield className="h-5 w-5 text-blue-200" />
                            </div>
                            <div className="text-3xl font-bold mb-1">100%</div>
                            <p className="text-xs text-blue-200">Sin manipulaciones detectadas.</p>
                            <div className="mt-4 pt-4 border-t border-blue-500/30 flex justify-between text-xs text-blue-100">
                                <span>Blockchain Hash:</span>
                                <span className="font-mono">0x7f...3a9c</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-gray-700">Resumen de Actividad</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 flex items-center"><User className="h-4 w-4 mr-2" />Acciones Humanas</span>
                                <span className="font-bold">12</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 flex items-center"><Bot className="h-4 w-4 mr-2" />Acciones IA</span>
                                <span className="font-bold">8</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 flex items-center"><FileText className="h-4 w-4 mr-2" />Documentos Generados</span>
                                <span className="font-bold">3</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
