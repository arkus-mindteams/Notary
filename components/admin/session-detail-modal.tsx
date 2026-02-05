'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { Loader2, Bot, User, Download, FileText, DollarSign, Hash, Calendar, Clock, Sparkles, MessageSquare, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionDetailModalProps {
    userId: string
    session: any
    onClose: () => void
}

export function SessionDetailModal({ userId, session, onClose }: SessionDetailModalProps) {
    const [details, setDetails] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (session?.id) {
            fetchSessionDetails()
        }
    }, [session])

    const fetchSessionDetails = async () => {
        try {
            setLoading(true)

            // Get auth token like other admin endpoints
            const { createBrowserClient } = await import('@/lib/supabase')
            const supabase = createBrowserClient()
            const { data: { session: authSession } } = await supabase.auth.getSession()

            if (!authSession) {
                console.error('No active session')
                return
            }

            const res = await fetch(`/api/admin/conversations/${userId}/${session.id}`, {
                headers: {
                    'Authorization': `Bearer ${authSession.access_token}`,
                },
            })

            if (res.ok) {
                const data = await res.json()
                setDetails(data)
            } else {
                console.error('Error fetching session details:', res.status, await res.text())
            }
        } catch (err) {
            console.error('Error fetching session details:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDownload = (docId: string) => {
        window.open(`/api/admin/documents/${docId}/download`, '_blank')
    }

    return (
        <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[95vw] h-[95vh] p-0 gap-0 overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
                <div className="p-6 border-b border-border/40 bg-muted/20">
                    <DialogHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <DialogTitle className="text-2xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent flex items-center gap-3">
                                    {session?.title || 'Detalle de Sesión'}
                                    <Badge variant="outline" className="font-normal text-xs bg-background/50 text-muted-foreground">
                                        ID: {session?.id?.slice(0, 8)}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="text-base mt-2 flex items-center gap-4">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Calendar className="h-4 w-4 opacity-70" />
                                        {new Date(session?.created_at).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Clock className="h-4 w-4 opacity-70" />
                                        {new Date(session?.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </DialogDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                {details?.session?.totalCost !== undefined && (
                                    <div className="flex flex-col items-end px-4 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                            Cost <DollarSign className="h-3 w-3" />
                                        </span>
                                        <span className="text-xl font-bold text-foreground tabular-nums">${details?.session?.totalCost?.toFixed(4)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 bg-muted/5">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="mt-4 text-sm text-muted-foreground font-medium animate-pulse">Cargando conversación...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-12 flex-1 min-h-0 overflow-hidden bg-muted/5">
                        {/* Main Content Area */}
                        <div className="col-span-8 lg:col-span-9 flex flex-col border-r border-border/40 min-h-0 bg-background/50">
                            <div className="p-4 border-b border-border/40 bg-background/30 backdrop-blur-sm flex items-center justify-between shrink-0">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    {details?.isPlan ? (
                                        <>
                                            <Zap className="h-4 w-4 text-primary" />
                                            Unidades Procesadas
                                        </>
                                    ) : (
                                        <>
                                            <MessageSquare className="h-4 w-4 text-primary" />
                                            Conversación
                                        </>
                                    )}
                                </h3>
                                <Badge variant="secondary" className="text-xs font-normal">
                                    {details?.isPlan ? `${details?.units?.length || 0} unidades` : `${details?.messages?.length || 0} mensajes`}
                                </Badge>
                            </div>
                            <div className="relative flex-1 min-h-0">
                                <ScrollArea className="h-full w-full">
                                    <div className="p-6 space-y-6 max-w-5xl mx-auto pb-10">
                                        {details?.isPlan ? (
                                            <>
                                                {/* Plan Summary Card */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                                                    <Card className="bg-primary/5 border-primary/20">
                                                        <CardHeader className="p-4 pb-2">
                                                            <CardTitle className="text-xs font-semibold text-primary uppercase">Costo Total</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="p-4 pt-0">
                                                            <div className="text-2xl font-bold text-primary">${details.session.totalCost?.toFixed(4)}</div>
                                                            <p className="text-[10px] text-muted-foreground">Tokens: {details.session.totalTokens?.toLocaleString()}</p>
                                                        </CardContent>
                                                    </Card>
                                                    <Card className="bg-emerald-500/5 border-emerald-500/20">
                                                        <CardHeader className="p-4 pb-2">
                                                            <CardTitle className="text-xs font-semibold text-emerald-600 uppercase">Imágenes</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="p-4 pt-0">
                                                            <div className="text-2xl font-bold text-emerald-600">{details.session.metadata?.images_count || 1}</div>
                                                            <p className="text-[10px] text-muted-foreground">Archivos cargados</p>
                                                        </CardContent>
                                                    </Card>
                                                    <Card className="bg-amber-500/5 border-amber-500/20">
                                                        <CardHeader className="p-4 pb-2">
                                                            <CardTitle className="text-xs font-semibold text-amber-600 uppercase">Certeza Agregada</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="p-4 pt-0">
                                                            <div className="text-2xl font-bold text-amber-600">
                                                                {(details.units?.reduce((sum: number, u: any) => sum + (u.similarity_score || 0), 0) / (details.units?.length || 1) * 100).toFixed(1)}%
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground">Avg. Similitud</p>
                                                        </CardContent>
                                                    </Card>
                                                </div>

                                                <div className="rounded-xl border border-border/40 overflow-hidden bg-background shadow-sm">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                                                            <tr>
                                                                <th className="px-4 py-3 border-b border-border/40">Unidad</th>
                                                                <th className="px-4 py-3 border-b border-border/40">Certeza</th>
                                                                <th className="px-4 py-3 border-b border-border/40">Información Extraída (Texto Final)</th>
                                                                <th className="px-4 py-3 border-b border-border/40 text-right">Tokens</th>
                                                                <th className="px-4 py-3 border-b border-border/40 text-right">Costo</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border/30">
                                                            {details.units?.map((unit: any) => (
                                                                <tr key={unit.id} className="hover:bg-muted/30 transition-colors align-top">
                                                                    <td className="px-4 py-4 font-medium text-foreground whitespace-nowrap">
                                                                        <Badge variant="outline" className="font-mono bg-primary/5 border-primary/20 text-primary">
                                                                            {unit.unit_id}
                                                                        </Badge>
                                                                    </td>
                                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                                        <div className="flex flex-col gap-1.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                                                                                    <div
                                                                                        className={cn(
                                                                                            "h-full rounded-full transition-all",
                                                                                            (unit.similarity_score * 100) > 90 ? "bg-emerald-500" : "bg-amber-500"
                                                                                        )}
                                                                                        style={{ width: `${(unit.similarity_score * 100)}%` }}
                                                                                    />
                                                                                </div>
                                                                                <span className={cn(
                                                                                    "text-xs font-mono font-bold",
                                                                                    (unit.similarity_score * 100) > 90 ? "text-emerald-600" : "text-amber-600"
                                                                                )}>
                                                                                    {(unit.similarity_score * 100).toFixed(1)}%
                                                                                </span>
                                                                            </div>
                                                                            <span className="text-[10px] text-muted-foreground opacity-70">
                                                                                {new Date(unit.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-4 max-w-md">
                                                                        <div className="text-xs text-muted-foreground line-clamp-3 hover:line-clamp-none transition-all cursor-pointer bg-muted/20 p-2 rounded border border-border/40 hover:bg-muted/40" title="Haz clic para expandir">
                                                                            {unit.final_text || unit.original_text || 'Sin texto extraído'}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right font-mono text-muted-foreground text-xs whitespace-nowrap">
                                                                        {unit.tokens?.toLocaleString()}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right font-mono font-medium text-foreground whitespace-nowrap">
                                                                        <span className="text-emerald-600 dark:text-emerald-400">
                                                                            ${unit.cost?.toFixed(4)}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        ) : (
                                            details?.messages?.map((msg: any) => (
                                                <div
                                                    key={msg.id}
                                                    className={cn(
                                                        "flex gap-4 group",
                                                        msg.role === 'assistant' ? 'justify-start' : 'justify-end'
                                                    )}
                                                >
                                                    {msg.role === 'assistant' && (
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 mt-1">
                                                            <Bot className="h-4 w-4 text-primary" />
                                                        </div>
                                                    )}

                                                    <div
                                                        className={cn(
                                                            "max-w-[85%] rounded-2xl p-5 shadow-sm transition-all duration-200",
                                                            msg.role === 'assistant'
                                                                ? "bg-background border border-border/60 rounded-tl-sm hover:shadow-md"
                                                                : "bg-primary text-primary-foreground rounded-tr-sm shadow-primary/20 hover:shadow-primary/30"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "flex items-center gap-2 mb-3 text-xs opacity-70",
                                                            msg.role === 'assistant' ? "text-muted-foreground" : "text-primary-foreground/90"
                                                        )}>
                                                            <span className="font-semibold">{msg.role === 'assistant' ? 'Notary AI' : 'Usuario'}</span>
                                                            <span>•</span>
                                                            <span>
                                                                {new Date(msg.created_at).toLocaleTimeString('es-MX', {
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </span>
                                                        </div>
                                                        <div className={cn(
                                                            "text-sm leading-relaxed whitespace-pre-wrap",
                                                            msg.role === 'assistant' ? "text-foreground/90" : "text-primary-foreground"
                                                        )}>
                                                            {msg.content}
                                                        </div>
                                                    </div>

                                                    {msg.role !== 'assistant' && (
                                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border mt-1">
                                                            <User className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Sidebar - 3/12 width */}
                        <div className="col-span-4 lg:col-span-3 h-full overflow-y-auto bg-muted/10 p-4 space-y-4 border-l border-border/40">
                            {/* Metrics Card */}
                            <Card className="shadow-sm border-border/60 bg-background/50 backdrop-blur-sm">
                                <CardHeader className="pb-3 pt-4 px-4">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-amber-500" />
                                        Métricas de Consumo
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 px-4 pb-4">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                            <Hash className="h-4 w-4" />
                                            <span>Tokens Totales</span>
                                        </div>
                                        <span className="font-mono font-medium">{details?.session?.totalTokens?.toLocaleString()}</span>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pl-1">Modelos Utilizados</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {details?.session?.models?.map((model: string, idx: number) => (
                                                <Badge key={idx} variant="secondary" className="text-xs bg-background border-border/60 hover:bg-muted font-mono font-normal">
                                                    {model}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Documents Card */}
                            {details?.documents && details.documents.length > 0 ? (
                                <Card className="shadow-sm border-border/60 bg-background/50 backdrop-blur-sm">
                                    <CardHeader className="pb-3 pt-4 px-4">
                                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-blue-500" />
                                            Documentos Contexto
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 px-4 pb-4">
                                        {details.documents.map((doc: any) => (
                                            <div
                                                key={doc.id}
                                                className="group flex items-center justify-between p-2.5 border border-border/50 rounded-lg hover:bg-background hover:border-border hover:shadow-sm transition-all bg-muted/20"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className="h-8 w-8 rounded bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400">
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium truncate text-foreground/90">{doc.nombre}</p>
                                                        <p className="text-xs text-muted-foreground">{doc.tipo}</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDownload(doc.id)}
                                                    title="Descargar documento"
                                                >
                                                    <Download className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                                </Button>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="shadow-sm border-border/60 bg-muted/10 border-dashed">
                                    <CardContent className="py-8 flex flex-col items-center justify-center text-center">
                                        <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                        <p className="text-xs text-muted-foreground">Sin documentos adjuntos</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
