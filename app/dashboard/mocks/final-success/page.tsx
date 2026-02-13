"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    CheckCircle2,
    PartyPopper,
    Calendar,
    FileCheck,
    Share2,
    ArrowRight,
    Clock,
    ShieldCheck,
    Bot
} from 'lucide-react'
import Link from 'next/link'
import { useMock } from '../mock-context'

export default function ApprovalSuccessPage() {
    const { preavisoType } = useMock()

    return (
        <div className="min-h-full flex items-center justify-center p-8 bg-gray-50/50">
            <div className="max-w-xl w-full space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-2 relative">
                        <CheckCircle2 className="h-10 w-10 text-green-600 animate-in fade-in zoom-in spin-in-12 duration-700" />
                        <div className="absolute -top-2 -right-2">
                            <PartyPopper className="h-6 w-6 text-yellow-500 animate-bounce" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">¡Expediente Validado!</h1>
                    <p className="text-gray-500 max-w-sm mx-auto">
                        El proyecto de escritura para la <span className="font-bold text-blue-600 uppercase italic">{preavisoType}</span> ha sido aprobado y está listo para la firma.
                    </p>
                </div>

                <Card className="border-none shadow-xl shadow-gray-200/50 bg-white overflow-hidden ring-1 ring-gray-100">
                    <CardContent className="p-0">
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between border-b border-gray-50 pb-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Estatus Actual</p>
                                    <Badge className="bg-green-600 text-white border-none font-bold px-3 py-1">LISTO PARA FIRMA</Badge>
                                </div>
                                <div className="text-right space-y-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Folio Sistema</p>
                                    <p className="text-sm font-bold text-gray-900">\#EXP-2024-00452</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-gray-900 flex items-center">
                                    <Bot className="h-4 w-4 mr-2 text-blue-600" />
                                    Resumen de Eficiencia (IA)
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                        <div className="flex items-center space-x-2 text-blue-700 mb-1">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span className="text-[10px] font-bold uppercase">Tiempo Total</span>
                                        </div>
                                        <p className="text-xl font-bold text-blue-900">12 min</p>
                                        <p className="text-[9px] text-blue-600 mt-1">Ahorro estimado: 4.5 horas</p>
                                    </div>
                                    <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
                                        <div className="flex items-center space-x-2 text-purple-700 mb-1">
                                            <FileCheck className="h-3.5 w-3.5" />
                                            <span className="text-[10px] font-bold uppercase">Documentos</span>
                                        </div>
                                        <p className="text-xl font-bold text-purple-900">8</p>
                                        <p className="text-[9px] text-purple-600 mt-1">100% Indexados y Trazados</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                        <Calendar className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-900">Firma Programada</p>
                                        <p className="text-[10px] text-gray-500">Viernes, 14 de Feb - 11:00 AM</p>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-xs font-bold">Modificar</Button>
                            </div>
                        </div>

                        <div className="bg-gray-900 p-6 flex flex-col md:flex-row gap-3">
                            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-11">
                                <Share2 className="h-4 w-4 mr-2" />
                                Notificar a Partes
                            </Button>
                            <Link href="/dashboard/mocks/kanban" className="flex-1">
                                <Button variant="outline" className="w-full bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold h-11">
                                    Volver al Dashboard
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <p className="text-center text-[10px] text-gray-400 flex items-center justify-center">
                    <ShieldCheck className="h-3 w-3 mr-1.5" />
                    Cifrado de extremo a extremo • Validez Jurídica Digital
                </p>
            </div>
        </div>
    )
}
