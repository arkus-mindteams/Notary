
"use client"

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MessageSquare, Plus, Trash2, Archive, Pin, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from '@/lib/utils'

interface ChatSession {
    id: string
    title: string
    updated_at: string
    pinned: boolean
}

interface ChatHistoryProps {
    isCollapsed: boolean
    onSelectSession?: () => void
}

export function ChatHistory({ isCollapsed, onSelectSession }: ChatHistoryProps) {
    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    // Note: useParams might be empty if not in a dynamic route, 
    // but we can check query params or similar if needed.
    // For now we assume the chat ID might be in the query `?chatId=` or similar,
    // or we need a way to know the active one.
    // Let's rely on a global store or URL param if implemented.
    const [activeId, setActiveId] = useState<string | null>(null)

    useEffect(() => {
        fetchSessions()
    }, [])

    // Poll for updates occasionally or listen to an event (simplification: just fetch on mount)
    // In a real app we might use SWR or React Query

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/chat/sessions')
            if (res.ok) {
                const data = await res.json()
                setSessions(data.sessions || [])
            }
        } catch (e) {
            console.error('Failed to fetch sessions', e)
        } finally {
            setLoading(false)
        }
    }

    const handleNewChat = () => {
        // Navigate to preaviso without ID (new chat)
        // We might want to clear the current state in the Chat component
        // by forcing a hard navigation or using a query param.
        router.push('/dashboard/preaviso?new=true')
        if (onSelectSession) onSelectSession()
    }

    const handleSelectSession = (id: string) => {
        setActiveId(id)
        router.push(`/dashboard/preaviso?chatId=${id}`)
        if (onSelectSession) onSelectSession()
    }

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation() // Prevent selection
        // TODO: Implement delete/archive API
        console.log('Delete', id)
    }

    if (loading && !isCollapsed) {
        return <div className="px-4 py-2 text-xs text-gray-500">Cargando historial...</div>
    }

    // Grupos por fecha (simplificado)
    const renderSessionList = () => {
        if (isCollapsed) return null // Don't show list in collapsed mode? Or show icons?

        return (
            <div className="space-y-1">
                {sessions.map((session) => (
                    <div
                        key={session.id}
                        className="group relative flex items-center"
                    >
                        <Button
                            variant="ghost"
                            className={cn(
                                "w-full justify-start text-xs font-normal h-8 px-2 overflow-hidden text-gray-400 hover:text-gray-100 hover:bg-gray-700/50",
                                activeId === session.id && "bg-gray-700 text-gray-100"
                            )}
                            onClick={() => handleSelectSession(session.id)}
                        >
                            <MessageSquare className="h-3 w-3 mr-2 flex-shrink-0 opacity-70" />
                            <span className="truncate">{session.title || 'Nuevo Chat'}</span>
                        </Button>

                        {/* Context Menu (Delete/Pin) - visible on hover */}
                        <div className="absolute right-1 hidden group-hover:flex">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-white">
                                        <MoreHorizontal className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40 bg-gray-800 border-gray-700 text-gray-300">
                                    <DropdownMenuItem className="text-xs hover:bg-gray-700 focus:bg-gray-700 cursor-pointer">
                                        <Pin className="h-3 w-3 mr-2" /> {session.pinned ? 'Desfijar' : 'Fijar'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs hover:bg-gray-700 focus:bg-gray-700 cursor-pointer text-red-400 hover:text-red-300 focus:text-red-300" onClick={(e) => handleDelete(e, session.id)}>
                                        <Trash2 className="h-3 w-3 mr-2" /> Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-2 py-2", isCollapsed ? "px-2" : "px-3")}>
            {!isCollapsed && (
                <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Historial
                    </span>
                </div>
            )}

            <Button
                variant="outline"
                className={cn(
                    "justify-start bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white",
                    isCollapsed ? "px-0 justify-center h-9 w-9" : "w-full text-xs h-8"
                )}
                onClick={handleNewChat}
            >
                <Plus className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                {!isCollapsed && "Nuevo Chat"}
            </Button>

            {!isCollapsed && (
                <ScrollArea className="h-[calc(100vh-120px)] w-full pr-2">
                    {sessions.length === 0 && !loading ? (
                        <div className="text-xs text-gray-500 px-2 italic">No hay chats recientes</div>
                    ) : (
                        renderSessionList()
                    )}
                </ScrollArea>
            )}
        </div>
    )
}
