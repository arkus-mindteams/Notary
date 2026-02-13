"use client"

import React, { useState, useEffect, useRef } from 'react'
import { useMock } from '../mock-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
    Send,
    Bot,
    User,
    Paperclip,
    MoreVertical,
    CheckCircle2,
    ArrowRight,
    X,
    Sparkles,
    FileText,
    MessageSquare
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { DocumentSidebarDemo } from './sidebar-demo'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    attachments?: string[]
}

const INITIAL_MESSAGES: Record<string, Message[]> = {
    compraventa: [
        { id: '1', role: 'assistant', content: '¡Hola! Soy tu asistente notarial. Veo que quieres iniciar una **Compraventa**. ¿Tienes a la mano los datos del inmueble o la escritura anterior?', timestamp: new Date(), attachments: [] },
        { id: '2', role: 'user', content: 'Sí, aquí adjunto la escritura anterior y las identificaciones.', timestamp: new Date(), attachments: ['Escritura-1234.pdf', 'INE-Vendedor.pdf', 'INE-Comprador.pdf'] },
        { id: '3', role: 'assistant', content: '¡Perfecto! He analizado los documentos. \n\n**Datos extraídos:**\n- **Inmueble:** Calle Luna 12, Col. Vista Hermosa\n- **Vendedor:** Juan Pérez Maldonado\n- **Comprador:** Roberto Sánchez García\n- **Precio:** $2,500,000.00 MXN\n\n¿Es correcto este precio de operación?', timestamp: new Date(), attachments: [] }
    ],
    adjudicacion: [
        { id: '1', role: 'assistant', content: 'Iniciando proceso de **Adjudicación Testamentaria**. Por favor comparte el certificado de defunción y el testamento.', timestamp: new Date(), attachments: [] }
    ],
    donacion: [
        { id: '1', role: 'assistant', content: 'Para la **Donación**, necesito saber si es en línea recta (padres a hijos) o entre cónyuges para determinar la exención de ISR.', timestamp: new Date(), attachments: [] }
    ],
    mutuo: [
        { id: '1', role: 'assistant', content: 'Para el **Mutuo con Interés**, ¿cuál es la tasa pactada y el plazo del crédito? También necesito los datos de la garantía hipotecaria.', timestamp: new Date(), attachments: [] }
    ],
    permuta: [
        { id: '1', role: 'assistant', content: 'En la **Permuta**, necesitamos avalúos de ambas propiedades para determinar los impuestos de cada transmisión.', timestamp: new Date(), attachments: [] }
    ]
}

export default function ChatAsistentePage() {
    const { preavisoType, setPreavisoType, completedStages, setCompletedStages } = useMock()
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Load initial messages based on type
    useEffect(() => {
        setMessages(INITIAL_MESSAGES[preavisoType] || [])
    }, [preavisoType])

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isTyping])

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return

        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
            timestamp: new Date()
        }

        setMessages(prev => [...prev, newMessage])
        setInputValue('')
        setIsTyping(true)

        // Simulate AI response
        setTimeout(() => {
            const aiResponse: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Entendido. He actualizado la información en el expediente. ¿Hay algo más que desees agregar antes de pasar al deslinde?',
                timestamp: new Date()
            }
            setMessages(prev => [...prev, aiResponse])
            setIsTyping(false)
        }, 1500)
    }

    const handleComplete = () => {
        if (!completedStages.includes('captura')) {
            setCompletedStages([...completedStages, 'captura'])
        }
        toast.success("Captura finalizada. Procediendo a Deslinde.")
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50/50">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full bg-white shadow-sm border-r border-gray-200">
                {/* Chat Header */}
                <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900">Asistente Notarial IA</h2>
                            <div className="flex items-center space-x-2 text-xs text-green-600">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <span className="font-medium">En línea • GPT-4o</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Link href="/dashboard/mocks/deslinde">
                            <Button
                                size="sm"
                                className="bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
                                onClick={handleComplete}
                            >
                                <span className="mr-2">Finalizar Captura</span>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="text-gray-400">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30" ref={scrollRef}>
                    <div className="flex justify-center my-4">
                        <Badge variant="outline" className="bg-white text-gray-400 border-gray-200 text-[10px] font-mono tracking-wider">
                            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </Badge>
                    </div>

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`flex max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'} space-x-3`}>
                                {/* Avatar */}
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm
                                    ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                </div>

                                {/* Message Bubble */}
                                <div className="space-y-1">
                                    <div
                                        className={`p-4 rounded-2xl text-sm shadow-sm leading-relaxed whitespace-pre-wrap
                                        ${msg.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm'}`}
                                    >
                                        {msg.content}
                                    </div>

                                    {/* Attachments */}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className={`flex flex-wrap gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {msg.attachments.map((file, idx) => (
                                                <div key={idx} className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded-lg shadow-sm">
                                                    <FileText className="h-3.5 w-3.5 text-red-500" />
                                                    <span className="text-xs font-medium text-gray-600">{file}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Timestamp */}
                                    <p className={`text-[10px] text-gray-400 mt-1 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {isTyping && (
                        <div className="flex justify-start w-full">
                            <div className="flex items-center space-x-3 max-w-[80%]">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mt-1">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-1.5">
                                    <span className="block w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="block w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="block w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <div className="relative flex items-center bg-gray-50 rounded-xl border border-gray-200 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
                        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 h-10 w-10 ml-1">
                            <Paperclip className="h-5 w-5" />
                        </Button>
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={`Escribe detalles sobre la ${preavisoType}...`}
                            className="border-none bg-transparent shadow-none focus-visible:ring-0 text-base h-12"
                        />
                        <Button
                            size="icon"
                            className={`h-9 w-9 mr-1.5 transition-all duration-200 ${inputValue.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-200 text-gray-400'}`}
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim()}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="text-center mt-2 text-[10px] text-gray-400">
                        La IA puede cometer errores. Verifica la información importante.
                    </div>
                </div>
            </div>

            {/* Right Sidebar */}
            <DocumentSidebarDemo />
        </div>
    )
}
