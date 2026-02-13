"use client"

import React, { useState, useMemo } from 'react'
import { useMock, PreavisoType } from '../mock-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
    CheckCircle2,
    AlertCircle,
    Edit3,
    ArrowLeft,
    User,
    MapPin,
    FileText,
    Hash,
    Activity,
    ChevronRight,
    ShieldCheck,
    Zap,
    History,
    Building
} from 'lucide-react'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

interface Field {
    id: string
    label: string
    value: string
    confidence: number
    source: 'IA' | 'Manual'
    category: 'Partes' | 'Inmueble' | 'Acto'
}

const MOCK_FIELDS: Record<PreavisoType, Field[]> = {
    compraventa: [
        { id: '1', label: 'Enajenante (Vendedor)', value: 'Juan Pérez Maldonado', confidence: 0.98, source: 'IA', category: 'Partes' },
        { id: '2', label: 'Adquirente (Comprador)', value: 'Roberto Sánchez García', confidence: 0.95, source: 'IA', category: 'Partes' },
        { id: '3', label: 'Folio Real', value: '123456', confidence: 0.82, source: 'IA', category: 'Inmueble' },
        { id: '4', label: 'Datos del Inmueble', value: 'Calle Luna 12, Vista Hermosa', confidence: 0.99, source: 'IA', category: 'Inmueble' },
        { id: '5', label: 'Monto Operación', value: '$2,500,000.00', confidence: 0.75, source: 'IA', category: 'Acto' },
    ],
    adjudicacion: [
        { id: '1', label: 'Heredero', value: 'Elena García', confidence: 0.96, source: 'IA', category: 'Partes' },
        { id: '2', label: 'De Cujus', value: 'Antonio García', confidence: 0.99, source: 'IA', category: 'Partes' },
        { id: '3', label: 'Tipo Sucesión', value: 'Testamentaria', confidence: 0.90, source: 'IA', category: 'Acto' },
        { id: '4', label: 'Escritura Antecedente', value: '45,201', confidence: 0.88, source: 'IA', category: 'Inmueble' },
    ],
    donacion: [
        { id: '1', label: 'Donante', value: 'Ricardo Soto', confidence: 0.97, source: 'IA', category: 'Partes' },
        { id: '2', label: 'Donatario', value: 'Sofía Soto', confidence: 0.98, source: 'IA', category: 'Partes' },
        { id: '3', label: 'Reserva Usufructo', value: 'VITALICIO', confidence: 0.95, source: 'IA', category: 'Acto' },
        { id: '4', label: 'Relación Parentesco', value: 'PADRE-HIJA', confidence: 0.65, source: 'IA', category: 'Partes' },
    ],
    mutuo: [
        { id: '1', label: 'Acreedor', value: 'Banco Capital', confidence: 0.99, source: 'IA', category: 'Partes' },
        { id: '2', label: 'Mutuatario', value: 'Laura Mendez', confidence: 0.94, source: 'IA', category: 'Partes' },
        { id: '3', label: 'Monto Crédito', value: '$2,000,000.00', confidence: 0.99, source: 'IA', category: 'Acto' },
    ],
    permuta: [
        { id: '1', label: 'Permutante A', value: 'Héctor Ruiz', confidence: 0.92, source: 'IA', category: 'Partes' },
        { id: '2', label: 'Permutante B', value: 'Luisa Fernanda X', confidence: 0.85, source: 'IA', category: 'Partes' },
        { id: '3', label: 'Inmueble A', value: 'Casa Bosques', confidence: 0.98, source: 'IA', category: 'Inmueble' },
        { id: '4', label: 'Inmueble B', value: 'Local Centro', confidence: 0.91, source: 'IA', category: 'Inmueble' },
    ]
}

export default function DirectReviewPage() {
    const { preavisoType, extractedData, completedStages, setCompletedStages } = useMock()
    const [fields, setFields] = useState<Field[]>(MOCK_FIELDS[preavisoType] || [])
    const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())

    const toggleConfirm = (id: string) => {
        const next = new Set(confirmedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setConfirmedIds(next)
    }

    const handleConfirmAll = () => {
        setConfirmedIds(new Set(fields.map(f => f.id)))
        toast.success("Todos los campos han sido validados")
    }

    const handleFinalize = () => {
        if (!completedStages.includes('validacion')) {
            setCompletedStages([...completedStages, 'validacion'])
        }
        toast.success("Validación finalizada. Expediente listo para instrumentación.")
    }

    const progressValue = (confirmedIds.size / fields.length) * 100

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/dashboard/mocks/proyecto-detalle">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-blue-600">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Revisión Jurídica Directa (Cotejo)</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Valida los datos extraídos contra el Registro Público y el Deslinde.
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <Button variant="outline" size="sm" onClick={handleConfirmAll} className="font-bold">
                        Validar Todo
                    </Button>
                    <Link href="/dashboard/mocks/proyecto-detalle">
                        <Button
                            size="sm"
                            onClick={handleFinalize}
                            className="bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 font-bold px-6"
                            disabled={confirmedIds.size < fields.length}
                        >
                            Finalizar Validación
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Progress Bar */}
            <Card className="border-none shadow-sm bg-white overflow-hidden ring-1 ring-gray-100">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                            <ShieldCheck className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-bold text-gray-700">Progreso de Validación Jurídica</span>
                        </div>
                        <span className="text-xs font-bold text-gray-400">{confirmedIds.size} de {fields.length} campos confirmados</span>
                    </div>
                    <Progress value={progressValue} className="h-2 bg-gray-100 shadow-inner" />
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Fields List */}
                <div className="lg:col-span-2 space-y-6">
                    {['Partes', 'Inmueble', 'Acto'].map((cat) => {
                        const catFields = fields.filter(f => f.category === cat)
                        if (catFields.length === 0) return null

                        return (
                            <div key={cat} className="space-y-3">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                                    {cat === 'Partes' ? <User className="h-3 w-3 mr-2" /> : cat === 'Inmueble' ? <MapPin className="h-3 w-3 mr-2" /> : <FileText className="h-3 w-3 mr-2" />}
                                    {cat}
                                </h3>
                                <div className="grid grid-cols-1 gap-3">
                                    {catFields.map((field) => (
                                        <div
                                            key={field.id}
                                            className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${confirmedIds.has(field.id)
                                                ? 'bg-white border-green-200 shadow-sm'
                                                : 'bg-white border-gray-100 hover:border-blue-200'
                                                }`}
                                        >
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                    {field.label}
                                                </Label>
                                                <div className="flex items-center space-x-3">
                                                    <span className={`text-sm font-bold ${confirmedIds.has(field.id) ? 'text-gray-900' : 'text-gray-700'}`}>
                                                        {field.value}
                                                    </span>
                                                    <Badge variant="outline" className={`h-4 text-[9px] px-1 border-none ${field.confidence > 0.9
                                                        ? 'bg-green-50 text-green-600'
                                                        : 'bg-yellow-50 text-yellow-600'
                                                        }`}>
                                                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                                                        {Math.round(field.confidence * 100)}%
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`h-8 w-8 rounded-full ${confirmedIds.has(field.id) ? 'text-green-600 bg-green-50' : 'text-gray-200 hover:text-blue-600 hover:bg-blue-50'}`}
                                                    onClick={() => toggleConfirm(field.id)}
                                                >
                                                    <CheckCircle2 className="h-5 w-5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-gray-300 hover:text-gray-600">
                                                    <Edit3 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Audit & Deslinde Sidebar */}
                <div className="space-y-6">
                    {extractedData?.measurements && (
                        <Card className="border-blue-100 bg-blue-50/30 overflow-hidden ring-1 ring-blue-100">
                            <CardHeader className="p-4 border-b border-blue-100 bg-blue-50 flex flex-row items-center space-y-0">
                                <Building className="h-4 w-4 text-blue-600 mr-2" />
                                <CardTitle className="text-[11px] font-black uppercase tracking-tighter text-blue-800">Cotejo con Deslinde (Plantas)</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="space-y-3">
                                    <p className="text-[10px] text-blue-700 italic leading-relaxed mb-4">
                                        Datos extraídos físicamente de las plantas arquitectónicas para descripción técnica:
                                    </p>
                                    {extractedData.measurements.slice(0, 4).map((m: any, idx: number) => (
                                        <div key={idx} className="flex justify-between border-b border-blue-100 pb-2">
                                            <span className="text-[10px] font-bold text-blue-400">{m.label}</span>
                                            <span className="text-[10px] font-medium text-blue-900">{m.value}</span>
                                        </div>
                                    ))}
                                    <div className="pt-2 flex justify-between">
                                        <span className="text-[10px] font-black text-blue-800">Total</span>
                                        <span className="text-[10px] font-black text-blue-800">{extractedData.measurements.find((m: any) => m.label === 'Superficie Total')?.value || '900 m²'}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="border-gray-200 shadow-sm ring-1 ring-gray-100">
                        <CardHeader className="p-4 border-b border-gray-50 flex flex-row items-center space-y-0">
                            <History className="h-4 w-4 text-blue-600 mr-2" />
                            <CardTitle className="text-sm font-bold">Registro de Auditoría</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="space-y-6">
                                <div className="relative pl-6 border-l border-gray-100 space-y-4">
                                    <div className="relative">
                                        <div className="absolute -left-[27px] top-0 h-3 w-3 rounded-full bg-blue-500 border-2 border-white" />
                                        <p className="text-[11px] font-bold text-gray-900">IA - Captura Pre-Aviso</p>
                                        <p className="text-[10px] text-gray-500">Origen: Chat Asistente</p>
                                        <p className="text-[9px] text-gray-400 mt-1">Hoy, 10:45 AM</p>
                                    </div>
                                    <div className="relative">
                                        <div className="absolute -left-[27px] top-0 h-3 w-3 rounded-full bg-blue-400 border-2 border-white shadow-sm" />
                                        <p className="text-[11px] font-bold text-gray-900">IA - Lectura de Plantas</p>
                                        <p className="text-[10px] text-gray-500">Origen: Deslinde Arq.</p>
                                        <p className="text-[9px] text-gray-400 mt-1">Hoy, 11:15 AM</p>
                                    </div>
                                </div>

                                <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                                        <span className="text-[11px] font-bold text-orange-800">Alerta de Discrepancia</span>
                                    </div>
                                    <p className="text-[10px] text-orange-700 leading-relaxed italic">
                                        El folio real indica 85.5m², mientras que el deslinde marca 900.00m². Favor de verificar si se trata de una fracción o un error de folio.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
