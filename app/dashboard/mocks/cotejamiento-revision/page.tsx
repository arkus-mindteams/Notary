"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    ArrowLeft,
    Search,
    CheckCircle2,
    AlertTriangle,
    FileText,
    FileCheck2,
    Maximize2,
    Minimize2,
    ChevronLeft,
    ChevronRight,
    ShieldAlert,
    Info,
    Check
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMock } from '../mock-context'

interface Discrepancy {
    id: string
    field: string
    draftValue: string
    sourceValue: string
    status: 'error' | 'warning' | 'resolved'
    description: string
}

const MOCK_DISCREPANCIES: Record<string, Discrepancy[]> = {
    compraventa: [
        { id: 'd2', field: 'Folio Real', draftValue: '123456', sourceValue: '123456-A', status: 'error', description: 'CRÍTICO: El sufijo "-A" no fue incluido en el proyecto de escritura. Esto impedirá la inscripción.' },
        { id: 'd3', field: 'RFC Comprador', draftValue: 'SAGR800101XXX', sourceValue: 'SAGR800101HXX', status: 'warning', description: 'Advertencia: Diferencia en la homoclave del RFC capturado vs Cédula Fiscal.' },
        { id: 'd4', field: 'Superficie', draftValue: '340.00 m²', sourceValue: '340.50 m²', status: 'warning', description: 'Discrepancia menor en superficie (0.50 m²). Verificar levantamiento topográfico reciente.' },
        { id: 'd5', field: 'Estado Civil', draftValue: 'Soltero', sourceValue: 'Casado (Soc. Conyugal)', status: 'error', description: 'Error en Estado Civil. El vendedor aparece como casado en Título de Propiedad. Requiere comparecencia de cónyuge.' },
    ],
    // ... other types can remain simple or be expanded similarly if needed for other tests
    adjudicacion: []
}

export default function CotejamientoRevisionPage() {
    const { preavisoType, completedStages, setCompletedStages } = useMock()
    const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>(MOCK_DISCREPANCIES['compraventa'] || [])
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'resolved'>('all')
    const router = useRouter()

    const resolveDiscrepancy = (id: string) => {
        setDiscrepancies(prev => prev.map(d => d.id === id ? { ...d, status: 'resolved' } : d))
    }

    const handleApprove = () => {
        if (!completedStages.includes('firma')) {
            setCompletedStages([...completedStages, 'firma'])
        }
        router.push('/dashboard/mocks/final-success')
    }

    const filtered = discrepancies.filter(d => {
        if (activeTab === 'all') return true
        if (activeTab === 'pending') return d.status !== 'resolved'
        if (activeTab === 'resolved') return d.status === 'resolved'
        return true
    })

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 shrink-0 bg-white z-10">
                <div className="flex items-center space-x-4">
                    <Link href="/dashboard/mocks">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-500 uppercase leading-none">Módulo 5: Cotejamiento</span>
                        <span className="text-sm font-bold text-gray-900 leading-tight">Revisión de Discrepancias — {preavisoType.toUpperCase()}</span>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <div className="flex items-center bg-gray-50 rounded-lg p-1 mr-4">
                        <Button
                            variant={activeTab === 'all' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-xs h-8 px-3 font-bold"
                            onClick={() => setActiveTab('all')}
                        >
                            TODOS ({discrepancies.length})
                        </Button>
                        <Button
                            variant={activeTab === 'pending' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-xs h-8 px-3 font-bold"
                            onClick={() => setActiveTab('pending')}
                        >
                            PENDIENTES ({discrepancies.filter(d => d.status !== 'resolved').length})
                        </Button>
                    </div>
                    <Button
                        size="sm"
                        className="h-9 bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-100"
                        disabled={discrepancies.some(d => d.status === 'error')}
                        onClick={handleApprove}
                    >
                        <FileCheck2 className="h-4 w-4 mr-2" />
                        Aprobar Instrumento
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Draft Content */}
                <div className="flex-1 border-r border-gray-100 overflow-y-auto bg-gray-50/50 p-6 flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center">
                            <FileText className="h-3 w-3 mr-2" />
                            Proyecto de Escritura (Borrador)
                        </h3>
                        <Badge variant="outline" className="text-[9px] bg-white">REVISIÓN FINAL</Badge>
                    </div>
                    <Card className="flex-1 border-none shadow-sm ring-1 ring-gray-200/50 bg-white p-8 font-serif leading-relaxed text-xs text-gray-800 space-y-4">
                        <div className="text-center font-bold uppercase tracking-widest mb-6">Escritura Número Cuarenta y Cinco Mil Doscientos Uno</div>

                        <p className="text-justify indent-8">
                            EN LA CIUDAD DE MÉXICO, a los catorce días del mes de febrero del año dos mil veinticuatro, YO, EL LICENCIADO CARLOS ESTAVILLO, Notario Público número 245 de la Ciudad de México, hago constar: EL CONTRATO DE COMPRAVENTA, Que celebran por una parte, el señor <strong>JUAN PÉREZ MALDONADO</strong>, a quien en lo sucesivo se le denominará "LA PARTE VENDEDORA", y por la otra parte, el señor <strong>ROBERTO SÁNCHEZ GARCÍA</strong>, a quien en lo sucesivo se le denominará "LA PARTE COMPRADORA", al tenor de los siguientes Antecedentes y Cláusulas:
                        </p>

                        <div className="py-2"><hr className="border-gray-100" /></div>

                        <h4 className="font-bold text-center underline">A N T E C E D E N T E S</h4>

                        <p className="text-justify indent-8">
                            I.- Declara "LA PARTE VENDEDORA", bajo protesta de decir verdad, ser legítimo propietario del inmueble que más adelante se deslinda, identificado registralmente con el <strong>FOLIO REAL ELECTRÓNICO <span className="bg-red-50 ring-1 ring-red-200 px-1 rounded cursor-help relative group">123456<span className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg w-48 z-50">Discrepancia: Falta sufijo '-A' presente en antecedente</span></span></strong>.
                        </p>

                        <p className="text-justify indent-8">
                            II.- Que dicho inmueble cuenta con una superficie de terreno de <strong><span className="bg-yellow-50 ring-1 ring-yellow-200 px-1 rounded cursor-help">340.00 metros cuadrados</span></strong> y las medidas y colindancias que constan en el título de propiedad.
                        </p>

                        <p className="text-justify indent-8">
                            III.- Manifiesta "LA PARTE VENDEDORA" que es de nacionalidad mexicana, originario de esta ciudad, que nació el día 15 de marzo de 1960, de estado civil <strong className="bg-red-50 ring-1 ring-red-200 px-1 rounded cursor-help">SOLTERO</strong>, ocupación empresario...
                        </p>

                        <div className="py-2"><hr className="border-gray-100" /></div>

                        <h4 className="font-bold text-center underline">C L Á U S U L A S</h4>

                        <p className="text-justify indent-8">
                            PRIMERA. "COMPRAVENTA".- El señor JUAN PÉREZ MALDONADO vende, enajena y transmite la propiedad, a favor del señor ROBERTO SÁNCHEZ GARCÍA, quien compra y adquiere para sí, con todos sus usos, costumbres, servidumbres y todo cuanto de hecho y por derecho le corresponda, el inmueble descrito en el antecedente I de este instrumento.
                        </p>

                        <p className="text-justify indent-8">
                            SEGUNDA. Las partes convienen como precio la suma de $2,500,000.00 (DOS MILLONES QUINIENTOS MIL PESOS 00/100 M.N.).
                        </p>

                        <p className="text-justify indent-8">
                            TERCERA. GASTOS E IMPUESTOS.- Todos los gastos, derechos y honorarios que se causen con motivo de esta escritura serán por cuenta de "LA PARTE COMPRADORA", a excepción del Impuesto Sobre la Renta por Enajenación, que será a cargo de "LA PARTE VENDEDORA".
                        </p>

                        <p className="text-justify indent-8">
                            GENERALES. El Comprador declara ser mexicano, mayor de edad, con RFC <span className="bg-yellow-50 ring-1 ring-yellow-200 px-1 rounded cursor-help">SAGR800101XXX</span>...
                        </p>
                    </Card>
                </div>

                {/* Middle: Source Document (Comparison) */}
                <div className="flex-1 border-r border-gray-100 overflow-y-auto bg-gray-50/50 p-6 flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center">
                            <FileCheck2 className="h-3 w-3 mr-2" />
                            Documentos Fuente (Cotejo)
                        </h3>
                        <Badge variant="outline" className="text-[10px] bg-white text-gray-500">MÚLTIPLES ORÍGENES</Badge>
                    </div>
                    <Card className="flex-1 border-none shadow-sm ring-1 ring-gray-200/50 bg-white p-8 font-serif leading-relaxed text-xs text-gray-600 space-y-4 opacity-90">
                        {/* Header Mock */}
                        <div className="flex justify-between items-end border-b border-gray-100 pb-4 mb-4">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400">Escritura Antecedente (Título)</p>
                                <p className="text-xs font-bold text-gray-700">Vol. 80, Inst. 22,000</p>
                            </div>
                            <div className="text-right">
                                <Badge className="bg-blue-50 text-blue-600 border-none">Confianza: 98%</Badge>
                            </div>
                        </div>

                        <p className="text-justify indent-8 bg-blue-50/30 p-2 rounded">
                            ...ANTECEDENTE PRIMERO. El señor JUAN PÉREZ MALDONADO adquirió por compraventa... el inmueble identificado con el Folio Real <strong><span className="text-blue-700 font-bold">123456-A</span></strong> (con letra A al final)...
                        </p>

                        <div className="my-4 border-l-2 border-gray-200 pl-4">
                            <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Levantamiento Topográfico (2023)</p>
                            <p className="text-justify text-xs">
                                ...la superficie total calculada del polígono es de <strong><span className="text-blue-700 font-bold">340.50 m²</span></strong> (trescientos cuarenta punto cincuenta metros cuadrados)...
                            </p>
                        </div>

                        <div className="my-4 border-l-2 border-gray-200 pl-4">
                            <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Acta de Matrimonio / Título</p>
                            <p className="text-justify text-xs">
                                ...estado civil: <strong><span className="text-red-600 font-bold">CASADO</span></strong> bajo el régimen de Sociedad Conyugal con la señora MARÍA LÓPEZ...
                            </p>
                        </div>

                        <div className="my-4 border-l-2 border-gray-200 pl-4">
                            <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Cédula de Identificación Fiscal (SAT)</p>
                            <p className="text-justify text-xs">
                                ...Clave de RFC: <strong><span className="text-blue-700 font-bold">SAGR800101HXX</span></strong>...
                            </p>
                        </div>
                    </Card>
                </div>

                {/* Right: Discrepancy Panel */}
                <div className="w-96 overflow-y-auto p-4 bg-white flex flex-col space-y-4">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center p-2">
                        <ShieldAlert className="h-4 w-4 mr-2 text-red-600" />
                        Analizador de Discrepancias
                    </h3>

                    <div className="space-y-4">
                        {filtered.map((disc) => (
                            <Card key={disc.id} className={`border-none shadow-sm ring-1 transition-all ${disc.status === 'error' ? 'ring-red-100 bg-red-50/30' :
                                disc.status === 'warning' ? 'ring-yellow-100 bg-yellow-50/30' :
                                    'ring-gray-100 bg-gray-50/30 opacity-60'
                                }`}>
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-tighter text-gray-500">{disc.field}</span>
                                        {disc.status === 'resolved' ? (
                                            <Badge className="bg-green-100 text-green-700 border-none text-[8px] h-4">RESUELTO</Badge>
                                        ) : (
                                            <Badge className={`${disc.status === 'error' ? 'bg-red-600' : 'bg-yellow-500'} text-white border-none text-[8px] h-4 uppercase`}>
                                                {disc.status}
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="p-2 bg-white rounded border border-gray-100">
                                            <span className="text-[8px] font-bold text-gray-300 block mb-0.5 uppercase">Proyecto</span>
                                            <span className="text-xs font-bold text-gray-800">{disc.draftValue}</span>
                                        </div>
                                        <div className="p-2 bg-white rounded border border-gray-100">
                                            <span className="text-[8px] font-bold text-gray-300 block mb-0.5 uppercase">Fuente</span>
                                            <span className="text-xs font-bold text-blue-600">{disc.sourceValue}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-start space-x-2">
                                        <Info className="h-3 w-3 text-gray-400 mt-0.5 grow-0 shrink-0" />
                                        <p className="text-[10px] text-gray-600 leading-tight">{disc.description}</p>
                                    </div>

                                    {disc.status !== 'resolved' && (
                                        <div className="flex items-center space-x-2 pt-2">
                                            <Button size="sm" className="h-7 text-[10px] flex-1 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200" onClick={() => resolveDiscrepancy(disc.id)}>
                                                Ignorar
                                            </Button>
                                            <Button size="sm" className="h-7 text-[10px] flex-1 bg-blue-600 text-white" onClick={() => resolveDiscrepancy(disc.id)}>
                                                <Check className="h-3 w-3 mr-1" /> Resolver
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="mt-8 p-4 bg-gray-900 rounded-xl space-y-3">
                        <div className="flex items-center space-x-2 text-blue-400">
                            <Zap className="h-4 w-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Resumen IA</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                            Se han analizado 12 documentos fuente contra el proyecto \#45,201-B.
                            Se detectó 1 discrepancia crítica de Folio Real que requiere acción.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Zap({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    )
}
