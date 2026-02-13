"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Save,
    Download,
    Bot,
    ArrowLeft,
    ChevronRight,
    FileSearch,
    CheckCircle2,
    AlertCircle,
    FileText,
    HelpCircle,
    History,
    Lock,
    Printer
} from 'lucide-react'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { useMock } from '../mock-context'

interface Paragraph {
    id: string
    content: string
    source: {
        doc: string
        page: number
        confidence: number
        extractedAt: string
    }
}

const INITIAL_PARAGRAPHS: Record<string, Paragraph[]> = {
    compraventa: [
        {
            id: 'proemio',
            content: "EN LA CIUDAD DE MÉXICO, a los catorce días del mes de febrero del año dos mil veinticuatro, YO, EL LICENCIADO CARLOS ESTAVILLO, Notario Público número 245 de la Ciudad de México, hago constar: EL CONTRATO DE COMPRAVENTA, Que celebran por una parte, el señor JUAN PÉREZ MALDONADO, a quien en lo sucesivo se le denominará \"LA PARTE VENDEDORA\", y por la otra parte, el señor ROBERTO SÁNCHEZ GARCÍA, a quien en lo sucesivo se le denominará \"LA PARTE COMPRADORA\", al tenor de los siguientes Antecedentes y Cláusulas:",
            source: { doc: "Pre-Aviso / Chat Asistente", page: 1, confidence: 0.99, extractedAt: "Hoy, 10:45 AM" }
        },
        {
            id: 'ant_1',
            content: "ANTECEDENTE PRIMERO. Declara \"LA PARTE VENDEDORA\", bajo protesta de decir verdad, que es legítima propietaria del inmueble ubicado en CALLE PRINCIPAL NÚMERO 123, COLONIA CENTRO, CIUDAD DE MÉXICO, con la superficie, medidas y colindancias que constan en el Título de Propiedad correspondiente.",
            source: { doc: "Escritura_45201.pdf (Antecedente)", page: 2, confidence: 0.98, extractedAt: "Ayer, 04:30 PM" }
        },
        {
            id: 'ant_2',
            content: "ANTECEDENTE SEGUNDO. Manifiesta \"LA PARTE VENDEDORA\" que el inmueble descrito en el antecedente inmediato anterior se encuentra libre de todo gravamen y responsabilidad, y al corriente en el pago de sus contribuciones prediales y de derechos por servicio de agua.",
            source: { doc: "Certificado_Libertad_Gravamen.pdf", page: 1, confidence: 0.95, extractedAt: "Hace 2 horas" }
        },
        {
            id: 'cl_1',
            content: "CLÁUSULA PRIMERA. COMPRAVENTA. \"LA PARTE VENDEDORA\" vende, cede y traspasa, sin reserva ni limitación alguna, a favor de \"LA PARTE COMPRADORA\", quien adquiere para sí, el inmueble descrito en el Antecedente Primero de este instrumento, con todo lo que de hecho y por derecho le corresponde.",
            source: { doc: "Solicitud_Preaviso.pdf", page: 1, confidence: 0.99, extractedAt: "Hoy, 10:45 AM" }
        },
        {
            id: 'cl_2',
            content: "CLÁUSULA SEGUNDA. PRECIO. El precio fijado para esta operación es la cantidad de $4,500,000.00 (CUATRO MILLONES QUINIENTOS MIL PESOS 00/100 MONEDA NACIONAL), que \"LA PARTE COMPRADORA\" paga a \"LA PARTE VENDEDORA\" en este acto, mediante transferencia electrónica de fondos, dándose esta última por recibida a su entera satisfacción.",
            source: { doc: "Avaluo_Comercial.pdf", page: 5, confidence: 0.98, extractedAt: "Ayer, 05:00 PM" }
        },
        {
            id: 'cl_3',
            content: "CLÁUSULA TERCERA. ENTREGA. \"LA PARTE VENDEDORA\" se obliga a entregar la posesión material y jurídica del inmueble objeto de esta compraventa a \"LA PARTE COMPRADORA\", libre de todo ocupante y gravamen, al momento de la firma de la presente escritura.",
            source: { doc: "Pre-Aviso / Chat Asistente", page: 1, confidence: 0.96, extractedAt: "Hoy, 10:45 AM" }
        },
        {
            id: 'cl_4',
            content: "CLÁUSULA CUARTA. GASTOS E IMPUESTOS. Todos los gastos, derechos, impuestos y honorarios que se causen con motivo de esta escritura, serán por cuenta exclusiva de \"LA PARTE COMPRADORA\", con excepción del Impuesto Sobre la Renta por Enajenación, que será a cargo de \"LA PARTE VENDEDORA\".",
            source: { doc: "Reglamento Notarial / Ley", page: 12, confidence: 1.0, extractedAt: "N/A (Plantilla)" }
        },
        {
            id: 'cert',
            content: "YO, EL NOTARIO, CERTIFICO: I. Que me he cerciorado de la identidad, capacidad y legitimación de los comparecientes. II. Que les leí y expliqué el valor, las consecuencias y alcances legales del contenido de este instrumento. III. Que manifestaron su conformidad con el mismo, firmándolo en mi presencia y ante mi fe.",
            source: { doc: "Ley del Notariado", page: 45, confidence: 1.0, extractedAt: "N/A (Plantilla)" }
        }
    ],
    adjudicacion: [
        {
            id: 'proemio_adj',
            content: "EN LA CIUDAD DE MÉXICO, a los veinte días del mes de octubre de dos mil veinticuatro, YO, EL LICENCIADO CARLOS ESTAVILLO, Notario Público 245, hago constar: LA ADJUDICACIÓN POR HERENCIA, que otorga la señora ELENA GARCÍA, por su propio derecho, en su carácter de Única y Universal Heredera y Albacea de la Sucesión Testamentaria a bienes del señor ANTONIO GARCÍA.",
            source: { doc: "Escritura de Aceptación de Herencia", page: 1, confidence: 0.99, extractedAt: "Hoy, 09:00 AM" }
        },
        {
            id: 'ant_adj_1',
            content: "ANTECEDENTE PRIMERO. FALLECIMIENTO. Con fecha 01 de enero de 2024, falleció el señor ANTONIO GARCÍA, según consta en el Acta de Defunción exhibida.",
            source: { doc: "Acta_Defuncion.pdf", page: 1, confidence: 1.0, extractedAt: "Ayer, 10:00 AM" }
        },
        {
            id: 'ant_adj_2',
            content: "ANTECEDENTE SEGUNDO. TESTAMENTO. El De Cujus otorgó Disposición Testamentaria en Escritura Pública número 30,000, en la cual designó como Única y Universal Heredera a su hija, la compareciente ELENA GARCÍA.",
            source: { doc: "Testamento_Publico.pdf", page: 3, confidence: 0.98, extractedAt: "Ayer, 10:05 AM" }
        },
        {
            id: 'ant_adj_3',
            content: "ANTECEDENTE TERCERO. PROPIEDAD. El autor de la sucesión era propietario del inmueble ubicado en CALLE ROBLE 45, COLONIA JARDINES, CIUDAD DE MÉXICO.",
            source: { doc: "Escritura_Propiedad_Original.pdf", page: 2, confidence: 0.97, extractedAt: "Ayer, 11:00 AM" }
        },
        {
            id: 'cl_adj_1',
            content: "CLÁUSULA PRIMERA. ADJUDICACIÓN. La señora ELENA GARCÍA se ADJUDICA para sí, en propiedad plena, el inmueble descrito en el Antecedente Tercero, con todos sus usos, costumbres y servidumbres.",
            source: { doc: "Proyecto de Partición", page: 1, confidence: 0.95, extractedAt: "Hoy, 09:30 AM" }
        },
        {
            id: 'cert_adj',
            content: "YO, EL NOTARIO, CERTIFICO: Que la compareciente acreditó debidamente su entroncamiento y derechos hereditarios, y que el inmueble se encuentra libre de gravámenes que impidan esta adjudicación.",
            source: { doc: "Ley del Notariado", page: 40, confidence: 1.0, extractedAt: "N/A" }
        }
    ],
    donacion: [
        {
            id: 'proemio_don',
            content: "EN LA CIUDAD DE MÉXICO, a los doce días de octubre de dos mil veinticuatro, ante mí, LIC. CARLOS ESTAVILLO, comparecen: Por una parte el señor RICARDO SOTO (el \"DONANTE\") y por la otra su hija, la señora SOFÍA SOTO (la \"DONATARIA\"), para formalizar el CONTRATO DE DONACIÓN.",
            source: { doc: "Solicitud_Donacion.pdf", page: 1, confidence: 0.99, extractedAt: "Hoy, 10:00 AM" }
        },
        {
            id: 'ant_don_1',
            content: "ANTECEDENTE PRIMERO. Declara el \"DONANTE\" ser propietario del DEPARTAMENTO 402 del Condominio ubicado en la COLONIA CONDESA, CIUDAD DE MÉXICO.",
            source: { doc: "Escritura_Condominio.pdf", page: 5, confidence: 0.98, extractedAt: "Hace 2 días" }
        },
        {
            id: 'cl_don_1',
            content: "CLÁUSULA PRIMERA. DONACIÓN. El señor RICARDO SOTO dona, gratuita y puramente, a favor de su hija SOFÍA SOTO, quien acepta con gratitud, el inmueble descrito, transmitiéndole la propiedad y posesión del mismo.",
            source: { doc: "Instrucciones_Cliente_Email.msg", page: 1, confidence: 0.90, extractedAt: "Hace 3 días" }
        },
        {
            id: 'cl_don_2',
            content: "CLÁUSULA SEGUNDA. VALOR. Para efectos fiscales, las partes estiman el valor del inmueble en $3,800,000.00 M.N., valor que coincide con el avalúo catastral vigente.",
            source: { doc: "Boleta_Predial_2024.pdf", page: 1, confidence: 0.96, extractedAt: "Ayer, 12:00 PM" }
        }
    ],
    mutuo: [
        {
            id: 'proemio_mut',
            content: "EN LA CIUDAD DE MÉXICO, a los diez días de octubre de dos mil veinticuatro, ante mí, LIC. CARLOS ESTAVILLO, comparecen: Por una parte \"BANCO CAPITAL, S.A.\", representado por su apoderado legal (el \"ACREEDOR\"), y por la otra la señora LAURA MÉNDEZ (la \"DEUDORA\"), para celebrar CONTRATO DE APERTURA DE CRÉDITO CON GARANTÍA HIPOTECARIA.",
            source: { doc: "Carta_Instruccion_Banco.pdf", page: 1, confidence: 1.0, extractedAt: "Hoy, 12:00 PM" }
        },
        {
            id: 'ant_mut_1',
            content: "ANTECEDENTE ÚNICO. Declara la \"DEUDORA\" ser propietaria del inmueble que más adelante se hipoteca, y que ha solicitado al \"ACREEDOR\" el otorgamiento de un crédito.",
            source: { doc: "Solicitud_Credito.pdf", page: 2, confidence: 0.98, extractedAt: "Ayer" }
        },
        {
            id: 'cl_mut_1',
            content: "CLÁUSULA PRIMERA. CRÉDITO. \"BANCO CAPITAL\" otorga a la señora LAURA MÉNDEZ un crédito simple por la cantidad de $2,000,000.00 (DOS MILLONES DE PESOS 00/100 M.N.), importe que la Deudora reconoce adeudar y recibir en este acto.",
            source: { doc: "Carta_Instruccion_Banco.pdf", page: 1, confidence: 1.0, extractedAt: "Hoy, 12:15 PM" }
        },
        {
            id: 'cl_mut_2',
            content: "CLÁUSULA SEGUNDA. INTERESES. El crédito devengará intereses ordinarios a una tasa anual fija del 10.5%, pagaderos mensualmente sobre saldos insolutos.",
            source: { doc: "Tabla_Amortizacion.xlsx", page: 1, confidence: 0.99, extractedAt: "Hoy, 12:15 PM" }
        },
        {
            id: 'cl_mut_3',
            content: "CLÁUSULA TERCERA. GARANTÍA HIPOTECARIA. Para garantizar el pago del crédito, intereses y accesorios, la Deudora constituye HIPOTECA en primer lugar y grado a favor de \"BANCO CAPITAL\" sobre el inmueble de su propiedad descrito en los antecedentes.",
            source: { doc: "Avaluo_Garantia.pdf", page: 8, confidence: 0.95, extractedAt: "Ayer, 5:00 PM" }
        },
        {
            id: 'cert_mut',
            content: "YO, EL NOTARIO, CERTIFICO: La personalidad del apoderado del Banco, la capacidad de la Deudora y que el inmueble se encuentra libre de otros gravámenes preferentes.",
            source: { doc: "Certificado_Libertad_Gravamen.pdf", page: 1, confidence: 0.98, extractedAt: "Hace 1 hora" }
        }
    ],
    permuta: [
        {
            id: 'proemio_per',
            content: "EN LA CIUDAD DE MÉXICO, ante mí, LIC. CARLOS ESTAVILLO, comparecen: GRUPO INMOBILIARIO DEL SUR, S.A. DE C.V. y la señora MARÍA FÉLIX, para celebrar CONTRATO DE PERMUTA.",
            source: { doc: "Carta_Intencion_Permuta.pdf", page: 1, confidence: 0.95, extractedAt: "Semana pasada" }
        },
        {
            id: 'cl_per_1',
            content: "CLÁUSULA PRIMERA. OBJETO. Las partes se transmiten recíprocamente la propiedad de los inmuebles descritos en los antecedentes: La Inmobiliaria transmite el 'Terreno Forestal A' y la señora María transmite el 'Terreno Urbano B'.",
            source: { doc: "Acuerdo_Permuta.pdf", page: 2, confidence: 0.97, extractedAt: "Ayer" }
        }
    ]
}

export default function EscrituracionEditorPage() {
    const { preavisoType, extractedData } = useMock()
    const [paragraphs, setParagraphs] = useState<Paragraph[]>(INITIAL_PARAGRAPHS[preavisoType] || [])
    const [selectedParaId, setSelectedParaId] = useState<string | null>('p1')

    React.useEffect(() => {
        if (preavisoType === 'compraventa' && extractedData?.measurements) {
            const surface = extractedData.measurements.find((m: any) => m.label === 'Superficie Total')?.value || '900.00 m²'
            const deslindePara: Paragraph = {
                id: 'p_deslinde',
                content: `DECLARACIÓN DE SUPERFICIE. De conformidad con el Levantamiento Topográfico realizado, el inmueble cuenta con una superficie total de ${surface}, con las medidas y colindancias que se detallan en el anexo técnico del presente instrumento.`,
                source: {
                    doc: "Levantamiento Topográfico (Deslinde)",
                    page: 1,
                    confidence: 0.99,
                    extractedAt: "Hoy, 11:15 AM"
                }
            }

            setParagraphs(prev => {
                if (prev.find(p => p.id === 'p_deslinde')) return prev
                const newParas = [...prev]
                // Insert as second paragraph
                newParas.splice(1, 0, deslindePara)
                return newParas
            })
        }
    }, [preavisoType, extractedData])

    const selectedPara = paragraphs.find(p => p.id === selectedParaId)

    return (
        <div className="flex flex-col h-full bg-gray-50/30">
            {/* Editor Toolbar */}
            <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center space-x-4">
                    <Link href="/dashboard/mocks/escrituracion-nueva">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-500 uppercase leading-none">Editor de Proyecto</span>
                        <span className="text-sm font-bold text-gray-900 leading-tight">Borrador - Escritura #45,201-B</span>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                        <Printer className="h-3.5 w-3.5 mr-2" />
                        Imprimir
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Descargar DOCX
                    </Button>
                    <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700">
                        <Save className="h-3.5 w-3.5 mr-2" />
                        Guardar Cambios
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Editor Component */}
                <div className="flex-1 overflow-y-auto p-12 bg-gray-100 flex justify-center">
                    <div className="max-w-[800px] w-full bg-white shadow-2xl min-h-[1000px] p-16 space-y-8 relative border border-gray-100 rounded-sm">
                        {/* Deed Header Mock */}
                        <div className="text-center space-y-2 mb-12">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 italic">Instrumento Notarial</p>
                            <div className="h-[2px] w-24 bg-gray-200 mx-auto" />
                        </div>

                        {paragraphs.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => setSelectedParaId(p.id)}
                                className={`p-4 rounded-lg cursor-pointer transition-all relative ${selectedParaId === p.id
                                    ? 'bg-blue-50/50 ring-1 ring-blue-200 shadow-sm'
                                    : 'hover:bg-gray-50'
                                    }`}
                            >
                                {selectedParaId === p.id && (
                                    <div className="absolute -left-6 top-1/2 -translate-y-1/2 h-8 w-1 bg-blue-600 rounded-full" />
                                )}
                                <p className={`text-sm leading-[1.8] text-gray-900 font-serif ${selectedParaId === p.id ? 'opacity-100' : 'opacity-80'
                                    }`}>
                                    {p.content}
                                </p>
                                {selectedParaId === p.id && (
                                    <div className="absolute -top-3 right-4">
                                        <Badge className="bg-blue-600 text-white border-none text-[10px] uppercase tracking-widest px-2 py-0.5">
                                            <Sparkles className="h-2.5 w-2.5 mr-1" />
                                            Texto sugerido por IA
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        ))}

                        <div className="h-20 border-t border-dashed border-gray-200 flex items-center justify-center">
                            <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-blue-600 italic">
                                Siguiente cláusula (Continuar redacción con IA...)
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Traceability Panel */}
                <div className="w-[380px] border-l border-gray-200 bg-white flex flex-col shrink-0">
                    <div className="h-12 border-b border-gray-100 px-4 flex items-center justify-between bg-white sticky top-0 z-10">
                        <div className="flex items-center space-x-2">
                            <FileSearch className="h-4 w-4 text-orange-600" />
                            <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">Trazabilidad IA</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            <HelpCircle className="h-3.5 w-3.5 text-gray-300" />
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {selectedPara ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Documento Fuente</span>
                                        <Card className="border-orange-100 bg-orange-50/30 overflow-hidden group hover:ring-1 hover:ring-orange-200 transition-all">
                                            <CardContent className="p-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-2">
                                                        <FileText className="h-4 w-4 text-orange-500" />
                                                        <span className="text-xs font-bold text-orange-900 truncate max-w-[180px]">
                                                            {selectedPara.source.doc}
                                                        </span>
                                                    </div>
                                                    <Badge className="bg-white text-orange-600 border-orange-100 text-[9px] h-5">Pág {selectedPara.source.page}</Badge>
                                                </div>
                                                <div className="mt-3 bg-white p-2 rounded border border-orange-100 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <div className="h-1 w-full bg-gray-50 rounded mb-1" />
                                                    <div className="h-1 w-[80%] bg-gray-50 rounded mb-1" />
                                                    <div className="h-1 w-full bg-gray-100 rounded" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <div className="space-y-3">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Análisis de Confianza</span>
                                        <div className="p-4 rounded-xl border border-gray-100 bg-white space-y-4 shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-600 font-medium">Nivel de Extracción</span>
                                                <Badge className={`${selectedPara.source.confidence > 0.9 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                                                    } border-none text-[10px] h-5`}>
                                                    {Math.round(selectedPara.source.confidence * 100)}%
                                                </Badge>
                                            </div>
                                            <Progress value={selectedPara.source.confidence * 100} className="h-1.5" />
                                            <div className="flex items-center space-x-2 text-[10px] font-medium text-gray-500">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                <span>Extraído el {selectedPara.source.extractedAt}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Historial de Cambios</span>
                                        <div className="space-y-2">
                                            <div className="flex items-center space-x-3 text-[10px]">
                                                <div className="h-5 w-5 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                                                    <History className="h-3 w-3" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-gray-900 font-bold">Generado por IA (MN-GPT4o)</p>
                                                    <p className="text-gray-400">Hoy, 10:45 AM</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-gray-900 text-white space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <Lock className="h-3.5 w-3.5 text-blue-400" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Cumplimiento Legal</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-relaxed">
                                        Esta cláusula cumple con el Artop. 125 de la Ley del Notariado vigente. Se ha validado la capacidad jurídica de las partes mediante sus identificaciones.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                                <div className="h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center">
                                    <Bot className="h-6 w-6 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-gray-400 italic">Panel de Trazabilidad</p>
                                    <p className="text-xs text-gray-300">Selecciona un párrafo del editor para ver su origen y nivel de confianza.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-gray-100">
                        <Button variant="ghost" className="w-full text-xs text-blue-600 font-bold group">
                            Abrir Pantalla Completa de Auditoría
                            <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Sparkles({ className }: { className?: string }) {
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
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
        </svg>
    )
}
