"use client"

import React from 'react'
import {
    CheckCircle2,
    AlertCircle,
    CreditCard,
    Building2,
    UserCircle,
    Users,
    FileCheck2,
    FolderOpen,
    History as HistoryIcon,
    ShieldAlert,
    Info,
    Check,
    Bot
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useMock, PreavisoType } from '../mock-context'

interface Step {
    id: string
    label: string
    icon: React.ReactNode
    status: 'pending' | 'completed' | 'current'
    details: { label: string; value: string }[]
}

const STEPS_BY_TYPE: Record<PreavisoType, Step[]> = {
    compraventa: [
        { id: '1', label: 'Inmueble', icon: <Building2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Objeto', value: 'Casa Habitación - Vista Hermosa' }, { label: 'Folio', value: '123456' }, { label: 'Ubicación', value: 'Calle Luna 12' }] },
        { id: '2', label: 'Vendedores', icon: <UserCircle className="h-4 w-4" />, status: 'completed', details: [{ label: 'Nombre', value: 'Juan Pérez Maldonado' }, { label: 'Estado Civil', value: 'Soltero' }] },
        { id: '3', label: 'Compradores', icon: <Users className="h-4 w-4" />, status: 'completed', details: [{ label: 'Nombre', value: 'Roberto Sánchez García' }, { label: 'Participación', value: '100% Adquirente' }] },
        { id: '4', label: 'Créditos', icon: <CreditCard className="h-4 w-4" />, status: 'completed', details: [{ label: 'Banco', value: 'Banco Capital' }, { label: 'Tipo', value: 'Cancelación Hipoteca' }] },
        { id: '5', label: 'Impuestos', icon: <FileCheck2 className="h-4 w-4" />, status: 'current', details: [{ label: 'ISAI Preliminar', value: '$85,400.00' }] },
    ],
    adjudicacion: [
        { id: '1', label: 'Origen (Sucesión)', icon: <HistoryIcon className="h-4 w-4" />, status: 'completed', details: [{ label: 'Tipo', value: 'Testamentaria' }, { label: 'De cujus', value: 'Antonio García' }] },
        { id: '2', label: 'Documentación', icon: <FileCheck2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Certificado', value: 'No Testamento Posterior' }, { label: 'Acta', value: 'Defunción CDMX' }] },
        { id: '3', label: 'Inmueble', icon: <Building2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Ubicación', value: 'Lomas de Chapultepec' }, { label: 'Folio', value: '987654' }] },
        { id: '4', label: 'Adjudicatarios', icon: <Users className="h-4 w-4" />, status: 'completed', details: [{ label: 'Heredero', value: 'Elena García' }, { label: 'Tipo', value: 'Directa' }] },
        { id: '5', label: 'Antecedente', icon: <FolderOpen className="h-4 w-4" />, status: 'current', details: [{ label: 'Tracto', value: 'Vinculado' }] },
    ],
    donacion: [
        { id: '1', label: 'Inmueble', icon: <Building2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Objeto', value: 'Depto 402, Condesa' }, { label: 'Valor', value: '$1,800,000.00' }] },
        { id: '2', label: 'Donantes', icon: <UserCircle className="h-4 w-4" />, status: 'completed', details: [{ label: 'Donante', value: 'Ricardo Soto' }, { label: 'Cónyuge', value: 'Consiente firma' }] },
        { id: '3', label: 'Donatario', icon: <Users className="h-4 w-4" />, status: 'completed', details: [{ label: 'Nombre', value: 'Sofía Soto' }, { label: 'Parentesco', value: 'Hija (Exento)' }] },
        { id: '4', label: 'Usufructo', icon: <Info className="h-4 w-4" />, status: 'current', details: [{ label: 'Beneficiario', value: 'Ricardo Soto' }, { label: 'Tipo', value: 'Vitalicio' }] },
        { id: '5', label: 'Formalización', icon: <FileCheck2 className="h-4 w-4" />, status: 'pending', details: [] },
    ],
    mutuo: [
        { id: '1', label: 'Mutuante', icon: <Building2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Institución', value: 'Banco Capital' }, { label: 'Monto', value: '$2,000,000.00' }] },
        { id: '2', label: 'Condiciones', icon: <CreditCard className="h-4 w-4" />, status: 'completed', details: [{ label: 'Tasa', value: '9.9% Anual' }, { label: 'Plazo', value: '20 Años' }] },
        { id: '3', label: 'Mutuatario', icon: <UserCircle className="h-4 w-4" />, status: 'completed', details: [{ label: 'Nombre', value: 'Laura Mendez' }, { label: 'SAT', value: '32D Positiva' }] },
        { id: '4', label: 'Garantía Hip.', icon: <FileCheck2 className="h-4 w-4" />, status: 'current', details: [{ label: 'Folio', value: '112233' }, { label: 'Estatus', value: 'Libre de Gravamen' }] },
    ],
    permuta: [
        { id: '1', label: 'Inmueble A', icon: <Building2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Objeto', value: 'Casa Bosques' }, { label: 'Valor', value: '$4.5M' }] },
        { id: '2', label: 'Inmueble B', icon: <Building2 className="h-4 w-4" />, status: 'completed', details: [{ label: 'Objeto', value: 'Local Centro' }, { label: 'Valor', value: '$4.2M' }] },
        { id: '3', label: 'Intercambio', icon: <Users className="h-4 w-4" />, status: 'completed', details: [{ label: 'A', value: 'Héctor Ruiz' }, { label: 'B', value: 'Luisa Fernanda' }] },
        { id: '4', label: 'Compensación', icon: <CreditCard className="h-4 w-4" />, status: 'completed', details: [{ label: 'Monto', value: '$300,000.00' }, { label: 'Forma', value: 'Transferencia' }] },
        { id: '5', label: 'Impuestos', icon: <FileCheck2 className="h-4 w-4" />, status: 'current', details: [{ label: 'ISR', value: 'Cálculo Proporcional' }] },
    ]
}

export function DocumentSidebarDemo() {
    const { preavisoType } = useMock()
    const steps = STEPS_BY_TYPE[preavisoType] || []

    const completedCount = steps.filter(s => s.status === 'completed').length
    const progress = (completedCount / steps.length) * 100

    return (
        <Card className="w-80 border-l border-gray-200 rounded-none shadow-none bg-white flex flex-col h-full overflow-hidden">
            <CardContent className="p-0 flex flex-col h-full">
                <div className="p-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                            <FolderOpen className="h-4 w-4 text-blue-600" />
                            <span>Información Capturada</span>
                        </h3>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-500 font-medium">
                            <span>Progreso del Acto</span>
                            <span>{completedCount}/{steps.length} pasos</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {steps.map((step) => (
                        <div key={step.id} className="space-y-2">
                            <div className="flex items-center space-x-2">
                                {step.status === 'completed' ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : step.status === 'current' ? (
                                    <div className="relative h-4 w-4 flex items-center justify-center">
                                        <div className="absolute h-4 w-4 rounded-full bg-blue-100 animate-pulse" />
                                        <AlertCircle className="h-3.5 w-3.5 text-blue-600 relative z-10" />
                                    </div>
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-gray-200" />
                                )}
                                <h4 className={`font-medium text-sm flex items-center space-x-2 ${step.status === 'pending' ? 'text-gray-400' : 'text-gray-900'
                                    }`}>
                                    <span className="text-gray-400">{step.icon}</span>
                                    <span>PASO {step.id}: {step.label}</span>
                                </h4>
                            </div>

                            <div className="ml-6 space-y-1 mt-1.5 text-xs text-gray-600">
                                {step.details.length > 0 ? (
                                    step.details.map((detail, idx) => (
                                        <div key={idx}><span className="font-medium text-gray-400">{detail.label}:</span> {detail.value}</div>
                                    ))
                                ) : step.status === 'pending' ? (
                                    <div className="text-gray-300 italic">Pendiente</div>
                                ) : step.status === 'current' ? (
                                    <div className="text-blue-500 italic flex items-center animate-pulse">
                                        <Bot className="h-3 w-3 mr-1" /> Analizando...
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-gray-50/50 border-t border-gray-100">
                    <div className="flex items-center space-x-2 text-[10px] text-gray-400 italic">
                        <HistoryIcon className="h-3 w-3" />
                        <span>Última actualización: Justo ahora</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
