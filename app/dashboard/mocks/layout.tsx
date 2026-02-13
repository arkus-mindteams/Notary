"use client"

import React from 'react'
import { MockProvider, useMock } from './mock-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Users, Bot, Layers } from 'lucide-react'

function SimulationToolbar() {
    const { role, setRole, preavisoType, setPreavisoType } = useMock()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <div className="h-12 bg-white border-b border-blue-100" />
    }

    return (
        <div className="bg-white border-b border-blue-100 px-6 py-2 flex items-center justify-between sticky top-0 z-50 shadow-sm">
            <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1 px-2 py-0.5">
                        <Layers className="h-3.5 w-3.5" />
                        MODO DEMO
                    </Badge>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol de Usuario:</span>
                        <Select value={role} onValueChange={(v: any) => setRole(v)}>
                            <SelectTrigger className="w-[140px] h-8 text-sm">
                                <Users className="h-3.5 w-3.5 mr-2 text-gray-400" />
                                <SelectValue placeholder="Seleccionar Rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="notario">Notario</SelectItem>
                                <SelectItem value="abogado">Abogado</SelectItem>
                                <SelectItem value="asistente">Asistente</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-2 border-l border-gray-100 pl-4">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo de Acto (Simulación):</span>
                        <Select value={preavisoType} onValueChange={(v: any) => setPreavisoType(v)}>
                            <SelectTrigger className="w-[160px] h-8 text-sm">
                                <Bot className="h-3.5 w-3.5 mr-2 text-gray-400" />
                                <SelectValue placeholder="Tipo de Acto" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="compraventa">Compraventa</SelectItem>
                                <SelectItem value="adjudicacion">Adjudicación</SelectItem>
                                <SelectItem value="donacion">Donación</SelectItem>
                                <SelectItem value="mutuo">Mutuo</SelectItem>
                                <SelectItem value="permuta">Permuta</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="text-[11px] text-gray-400 font-medium italic">
                * No hay persistencia de datos en esta sección.
            </div>
        </div>
    )
}

function MockLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <DashboardLayout isMock={true}>
            <div className="flex flex-col h-full bg-gray-50/50">
                <SimulationToolbar />
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
            </div>
        </DashboardLayout>
    )
}

export default function MockLayout({ children }: { children: React.ReactNode }) {
    return (
        <MockProvider>
            <MockLayoutContent>
                {children}
            </MockLayoutContent>
        </MockProvider>
    )
}
