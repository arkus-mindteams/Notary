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
import { Loader2, Zap, Clock, Search, FileText } from 'lucide-react'
import { SessionDetailModal } from './session-detail-modal'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface UserPlansModalProps {
    user: any
    onClose: () => void
}

export function UserPlansModal({ user, onClose }: UserPlansModalProps) {
    const [sessions, setSessions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedSession, setSelectedSession] = useState<any>(null)
    const [searchTerm, setSearchTerm] = useState('')

    const fetchSessions = async () => {
        try {
            setLoading(true)

            // Get auth token
            const { createBrowserClient } = await import('@/lib/supabase')
            const supabase = createBrowserClient()
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                console.error('No active session')
                return
            }

            const res = await fetch(`/api/admin/conversations/${user.userId}?includePlans=true`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })

            if (res.ok) {
                const data = await res.json()
                // Filter ONLY architectural plans
                const planSessions = (data.sessions || []).filter((s: any) => s.isPlan)
                setSessions(planSessions)
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
    const totalUnits = sessions.reduce((acc, s) => acc + (s.messageCount || 0), 0)

    return (
        <>
            <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="sm:max-w-7xl h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
                    <div className="p-6 border-b border-border/40 bg-blue-500/5">
                        <DialogHeader className="mb-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1 px-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 text-[10px] font-bold uppercase tracking-widest">Auditoría</div>
                                        <div className="p-1 px-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Planos</div>
                                    </div>
                                    <DialogTitle className="text-2xl font-bold tracking-tight">
                                        Historial de Planos - {user?.nombre}
                                    </DialogTitle>
                                    <DialogDescription className="text-base mt-2 flex items-center gap-2">
                                        <span className="font-medium text-foreground">{user?.email}</span>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                        <span className="text-muted-foreground">Desglose de procesamiento técnico</span>
                                    </DialogDescription>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-end px-4 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Costo Auditoría</span>
                                        <span className="text-xl font-bold text-foreground tabular-nums">${totalCost.toFixed(4)}</span>
                                    </div>
                                    <div className="flex flex-col items-end px-4 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Unidades Totales</span>
                                        <span className="text-xl font-bold text-foreground tabular-nums">{totalUnits}</span>
                                    </div>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="flex items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-sm group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                                <Input
                                    placeholder="Buscar por ID o fecha..."
                                    className="pl-9 bg-background/50 border-muted-foreground/20 focus-visible:ring-blue-500/20 transition-all hover:bg-background/80"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline" className="bg-background/50 font-normal border-blue-500/20">
                                    {sessions.length} Procesamientos en total
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 bg-muted/5">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                            <p className="mt-4 text-sm text-muted-foreground font-medium">Analizando archivos...</p>
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-60">
                            <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                            <p className="text-muted-foreground">No se encontraron registros de planos para este usuario.</p>
                        </div>
                    ) : (
                        <ScrollArea className="flex-1 bg-muted/5">
                            <div className="p-6">
                                <div className="rounded-xl border border-border/40 overflow-hidden bg-background shadow-sm">
                                    <Table>
                                        <TableHeader className="bg-blue-500/5">
                                            <TableRow className="hover:bg-transparent border-border/40">
                                                <TableHead className="w-[45%] pl-6 h-12 uppercase text-[10px] font-bold tracking-wider">Identificador del Procesamiento</TableHead>
                                                <TableHead className="h-12 text-center uppercase text-[10px] font-bold tracking-wider">Unidades</TableHead>
                                                <TableHead className="h-12 text-right uppercase text-[10px] font-bold tracking-wider">Consumo AI</TableHead>
                                                <TableHead className="h-12 text-right uppercase text-[10px] font-bold tracking-wider">Costo</TableHead>
                                                <TableHead className="h-12 text-right pr-6 uppercase text-[10px] font-bold tracking-wider">Finalizado el</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredSessions.map((session) => (
                                                <TableRow
                                                    key={session.id}
                                                    className="group transition-all duration-200 border-border/40 cursor-pointer hover:bg-blue-500/5"
                                                    onClick={() => setSelectedSession(session)}
                                                >
                                                    <TableCell className="pl-6 py-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="p-2.5 rounded-lg border bg-blue-500/10 border-blue-500/20 text-blue-600 shrink-0 group-hover:bg-blue-500/20">
                                                                <Zap className="h-5 w-5" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="font-semibold block text-base text-foreground group-hover:text-blue-600 transition-colors">
                                                                    {session.summary || 'Procesamiento de Plano'}
                                                                </span>
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground/80 font-mono">
                                                                    <span>STATS_ID: {session.id.slice(0, 12)}...</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                                                            {session.messageCount} Unidades
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="text-xs font-mono text-muted-foreground">
                                                                {session.totalTokens.toLocaleString()} tokens
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className="font-mono font-bold tabular-nums text-emerald-600 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10">
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
