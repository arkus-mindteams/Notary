'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, MessageSquare, Clock, Zap, AlertTriangle, Search } from 'lucide-react'
import { SessionDetailModal } from './session-detail-modal'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface UserSessionsModalProps {
    user: any
    onClose: () => void
}

export function UserSessionsModal({ user, onClose }: UserSessionsModalProps) {
    const [sessions, setSessions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedSession, setSelectedSession] = useState<any>(null)
    const [searchTerm, setSearchTerm] = useState('')

    const fetchSessions = async () => {
        try {
            setLoading(true)

            // Get auth token like other admin endpoints
            const { createBrowserClient } = await import('@/lib/supabase')
            const supabase = createBrowserClient()
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                console.error('No active session')
                return
            }

            const res = await fetch(`/api/admin/conversations/${user.userId}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })

            if (res.ok) {
                const data = await res.json()
                setSessions(data.sessions || [])
            } else {
                console.error('Error fetching sessions:', res.status, await res.text())
            }
        } catch (err) {
            console.error('Error fetching sessions:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (user?.userId) {
            fetchSessions()
            setSearchTerm('')
        }
    }, [user])

    const filteredSessions = sessions.filter(s =>
        (s.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.includes(searchTerm)
    )

    const totalTokens = sessions.reduce((acc, s) => acc + (s.totalTokens || 0), 0)
    const totalCost = sessions.reduce((acc, s) => acc + (s.totalCost || 0), 0)
    const activeChats = sessions.filter(s => s.totalTokens > 0).length

    return (
        <>
            <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="sm:max-w-7xl h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
                    <div className="p-6 border-b border-border/40 bg-muted/20">
                        <DialogHeader className="mb-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <DialogTitle className="text-2xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
                                        Historial de {user?.nombre}
                                    </DialogTitle>
                                    <DialogDescription className="text-base mt-2 flex items-center gap-2">
                                        <span className="font-medium text-foreground">{user?.email}</span>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                        <span className="font-mono text-xs text-muted-foreground opacity-70">{user?.userId}</span>
                                    </DialogDescription>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-end px-4 py-2 rounded-lg bg-primary/5 border border-primary/10">
                                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Inversión Total</span>
                                        <span className="text-xl font-bold text-foreground tabular-nums">${totalCost.toFixed(4)}</span>
                                    </div>
                                    <div className="flex flex-col items-end px-4 py-2 rounded-lg bg-muted/50 border border-border/50">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Tokens</span>
                                        <span className="text-xl font-bold text-foreground tabular-nums">{totalTokens.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="flex items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-sm group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Buscar por título o ID..."
                                    className="pl-9 bg-background/50 border-muted-foreground/20 focus-visible:ring-primary/20 transition-all hover:bg-background/80"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline" className="bg-background/50 font-normal">
                                    {activeChats} Activos
                                </Badge>
                                <Badge variant="outline" className="bg-background/50 font-normal">
                                    {sessions.length} Totales
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 bg-muted/5">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="mt-4 text-sm text-muted-foreground font-medium animate-pulse">Cargando historial...</p>
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-60">
                            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                            <p className="text-muted-foreground">No se encontraron sesiones.</p>
                        </div>
                    ) : (
                        <ScrollArea className="flex-1 bg-muted/5">
                            <div className="p-6">
                                <div className="rounded-xl border border-border/40 overflow-hidden bg-background shadow-sm">
                                    <Table>
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="hover:bg-transparent border-border/40">
                                                <TableHead className="w-[40%] pl-6 h-12">Sesión</TableHead>
                                                <TableHead className="h-12 text-center">Interacciones</TableHead>
                                                <TableHead className="h-12 text-right">Consumo AI</TableHead>
                                                <TableHead className="h-12 text-right">Costo</TableHead>
                                                <TableHead className="h-12 text-right pr-6">Fecha</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredSessions.map((session) => (
                                                <TableRow
                                                    key={session.id}
                                                    className={cn(
                                                        "group transition-all duration-200 border-border/40",
                                                        session.isOrphan
                                                            ? "bg-amber-500/5 hover:bg-amber-500/10 cursor-default"
                                                            : "cursor-pointer hover:bg-muted/40 hover:shadow-inner"
                                                    )}
                                                    onClick={() => !session.isOrphan && setSelectedSession(session)}
                                                >
                                                    <TableCell className="pl-6 py-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className={cn(
                                                                "p-2.5 rounded-lg border transition-colors shrink-0",
                                                                session.isOrphan
                                                                    ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-500"
                                                                    : "bg-primary/5 border-primary/10 text-primary group-hover:bg-primary/10 group-hover:border-primary/20"
                                                            )}>
                                                                {session.isOrphan ? <AlertTriangle className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className={cn(
                                                                    "font-semibold block text-base transition-colors",
                                                                    session.isOrphan ? "text-amber-700 dark:text-amber-400 decoration-amber-500/30" : "text-foreground group-hover:text-primary"
                                                                )}>
                                                                    {session.title || 'Sesión sin título'}
                                                                </span>
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground/80 font-mono">
                                                                    <span>ID: {session.id.slice(0, 8)}...</span>
                                                                    {session.isOrphan && (
                                                                        <Badge variant="outline" className="h-4 px-1.5 text-[0.65rem] border-amber-500/30 text-amber-600 dark:text-amber-500 bg-amber-500/5 uppercase tracking-wider">
                                                                            Sin usuario
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="inline-flex items-center justify-center min-w-[2.5rem] px-2.5 py-1 rounded-md bg-muted/50 border border-border/50 text-sm font-medium">
                                                            {session.messageCount}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <Badge variant="secondary" className="font-mono font-normal opacity-90">
                                                                <Zap className="h-3 w-3 mr-1 opacity-70" />
                                                                {session.totalTokens.toLocaleString()}
                                                            </Badge>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className={cn(
                                                            "font-mono font-medium tabular-nums px-2 py-1 rounded",
                                                            session.totalCost > 0.1
                                                                ? "text-red-600 bg-red-500/5 dark:text-red-400"
                                                                : "text-emerald-600 bg-emerald-500/5 dark:text-emerald-400"
                                                        )}>
                                                            ${session.totalCost.toFixed(4)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6 text-muted-foreground">
                                                        <div className="flex items-center justify-end gap-2 text-sm">
                                                            <Clock className="h-3 w-3 opacity-50" />
                                                            {new Date(session.created_at).toLocaleDateString('es-MX', {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog>

            {selectedSession && (
                <SessionDetailModal
                    userId={user.userId}
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                />
            )}
        </>
    )
}
