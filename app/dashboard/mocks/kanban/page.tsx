"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    MoreHorizontal,
    Plus,
    Calendar,
    MessageSquare,
    Paperclip,
    AlertCircle,
    CheckCircle2,
    Clock,
    Search,
    Filter
} from 'lucide-react'
import Link from 'next/link'

interface Project {
    id: string
    title: string
    client: string
    type: 'Compraventa' | 'Adjudicación' | 'Donación' | 'Mutuo' | 'Permuta'
    status: 'pending' | 'in_progress' | 'review' | 'signing' | 'completed'
    priority: 'high' | 'medium' | 'low'
    dueDate: string
    messages: number
    files: number
}

const MOCK_PROJECTS: Project[] = [
    { id: 'EXP-2024-001', title: 'Compraventa Casa Vista Hermosa', client: 'Juan Pérez', type: 'Compraventa', status: 'in_progress', priority: 'high', dueDate: '15 Oct', messages: 5, files: 12 },
    { id: 'EXP-2024-002', title: 'Adjudicación Testamentaria García', client: 'Elena García', type: 'Adjudicación', status: 'pending', priority: 'medium', dueDate: '20 Oct', messages: 2, files: 4 },
    { id: 'EXP-2024-003', title: 'Donación Depto Condesa', client: 'Ricardo Soto', type: 'Donación', status: 'review', priority: 'high', dueDate: '12 Oct', messages: 8, files: 15 },
    { id: 'EXP-2024-004', title: 'Mutuo con Garantía Hipotecaria', client: 'Banco Capital', type: 'Mutuo', status: 'signing', priority: 'medium', dueDate: '10 Oct', messages: 3, files: 8 },
    { id: 'EXP-2024-005', title: 'Permuta Terrenos Forestales', client: 'Grupo Inmobiliario', type: 'Permuta', status: 'completed', priority: 'low', dueDate: '01 Oct', messages: 0, files: 20 },
]

const COLUMNS = [
    { id: 'pending', label: 'Por Iniciar', color: 'bg-gray-100 border-gray-200' },
    { id: 'in_progress', label: 'En Proceso (Captura)', color: 'bg-blue-50 border-blue-100' },
    { id: 'review', label: 'En Revisión / Dictamen', color: 'bg-yellow-50 border-yellow-100' },
    { id: 'signing', label: 'Firma y Cierre', color: 'bg-purple-50 border-purple-100' },
]

import { useRouter } from 'next/navigation'
import { useMock } from '../mock-context'

export default function KanbanPage() {
    const router = useRouter()
    const { setPreavisoType, setCompletedStages } = useMock()

    const handleProjectClick = (project: Project) => {
        setPreavisoType(project.type.toLowerCase() as any)

        // Map status to completed stages
        let stages: string[] = []
        switch (project.status) {
            case 'pending':
                stages = []
                break
            case 'in_progress':
                // Assuming just started or in middle of capture
                stages = []
                break
            case 'review':
                // Capture and Deslinde done
                stages = ['captura', 'deslinde']
                break
            case 'signing':
                // All up to Drafting done
                stages = ['captura', 'deslinde', 'validacion', 'redaccion']
                break
            case 'completed':
                stages = ['captura', 'deslinde', 'validacion', 'redaccion', 'firma']
                break
        }
        setCompletedStages(stages)
        router.push('/dashboard/mocks/proyecto-detalle')
    }
    return (
        <div className="p-8 h-[calc(100vh-4rem)] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tablero de Proyectos</h1>
                    <p className="text-sm text-gray-500">Gestión visual del flujo notarial</p>
                </div>
                <div className="flex items-center space-x-3">
                    <Button variant="outline" size="sm">
                        <Filter className="h-4 w-4 mr-2" />
                        Filtrar
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo Proyecto
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-x-auto space-x-4 pb-4">
                {COLUMNS.map((col) => (
                    <div key={col.id} className={`flex-shrink-0 w-80 rounded-xl border ${col.color} flex flex-col`}>
                        <div className="p-3 border-b border-gray-200/50 flex justify-between items-center font-semibold text-sm text-gray-700">
                            {col.label}
                            <Badge variant="secondary" className="bg-white text-xs">
                                {MOCK_PROJECTS.filter(p => p.status === col.id).length}
                            </Badge>
                        </div>
                        <div className="p-3 space-y-3 overflow-y-auto flex-1">
                            {MOCK_PROJECTS.filter(p => p.status === col.id).map((project) => (
                                <div
                                    key={project.id}
                                    onClick={() => handleProjectClick(project)}
                                    className="block"
                                >
                                    <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500">
                                        <CardContent className="p-3 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 border-none 
                                                    ${project.priority === 'high' ? 'bg-red-50 text-red-600' :
                                                            project.priority === 'medium' ? 'bg-orange-50 text-orange-600' :
                                                                'bg-green-50 text-green-600'}`}
                                                >
                                                    {project.priority === 'high' ? 'Prioridad Alta' : project.priority === 'medium' ? 'Normal' : 'Baja'}
                                                </Badge>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-1 text-gray-400">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            <div>
                                                <h4 className="text-sm font-bold text-gray-900 leading-tight mb-1 line-clamp-2">
                                                    {project.title}
                                                </h4>
                                                <span className="text-xs text-gray-500 flex items-center">
                                                    <Avatar className="h-4 w-4 mr-1.5">
                                                        <AvatarFallback className="text-[8px]">CL</AvatarFallback>
                                                    </Avatar>
                                                    {project.client}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs text-gray-400">
                                                <div className="flex items-center space-x-3">
                                                    <span className="flex items-center hover:text-blue-600">
                                                        <MessageSquare className="h-3 w-3 mr-1" /> {project.messages}
                                                    </span>
                                                    <span className="flex items-center hover:text-blue-600">
                                                        <Paperclip className="h-3 w-3 mr-1" /> {project.files}
                                                    </span>
                                                </div>
                                                <span className={`flex items-center ${project.status === 'review' ? 'text-red-500 font-bold' : ''}`}>
                                                    <Calendar className="h-3 w-3 mr-1" /> {project.dueDate}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            ))}
                            {/* Empty state placeholder */}
                            {MOCK_PROJECTS.filter(p => p.status === col.id).length === 0 && (
                                <div className="h-24 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs">
                                    <div className="bg-gray-100 p-2 rounded-full mb-1">
                                        <Plus className="h-4 w-4" />
                                    </div>
                                    Arrastrar aquí
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
