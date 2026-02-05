"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createBrowserClient } from '@/lib/supabase'
import { StatsService, STATS_EVENTS } from "@/lib/services/stats-service"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Loader2, Users, FileText, Calendar, DollarSign, Zap, Activity, History, Sparkles, Brain } from "lucide-react"
import { StatsHistoryTable } from "@/components/stats-history-table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface DailyStat {
    date: string
    count: number
}

interface UserUsage {
    user_id: string
    email: string
    nombre: string
    count: number
    last_used: string
}

export function StatsDashboard() {
    const [loading, setLoading] = useState(true)
    const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
    const [totalUsage, setTotalUsage] = useState(0)
    const [uniqueUsers, setUniqueUsers] = useState(0)
    const [chatUserBreakdown, setChatUserBreakdown] = useState<any[]>([])
    const [deslindeUserBreakdown, setDeslindeUserBreakdown] = useState<any[]>([])
    // History Table State
    const [historyData, setHistoryData] = useState<any[]>([])
    const [historyCount, setHistoryCount] = useState(0)
    const [historyPage, setHistoryPage] = useState(1)

    const [isHistoryLoading, setIsHistoryLoading] = useState(false)

    // Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<any | null>(null)
    const [showAnalysis, setShowAnalysis] = useState(false)

    // AI Usage Metrics (Global)
    const [totalCost, setTotalCost] = useState(0)
    const [totalTokens, setTotalTokens] = useState(0)
    const [avgSimilarity, setAvgSimilarity] = useState(0)
    const [categoryStats, setCategoryStats] = useState<any[]>([])

    // Per-module metrics
    const [deslindeStats, setDeslindeStats] = useState({ count: 0, tokens: 0, cost: 0, similarity: 0 })
    const [chatStats, setChatStats] = useState({ count: 0, tokens: 0, cost: 0 })

    useEffect(() => {
        loadStats()
    }, [])

    useEffect(() => {
        loadHistory()
    }, [historyPage])

    const loadHistory = async () => {
        setIsHistoryLoading(true)
        try {
            const { data, count } = await StatsService.getUsageLogs(historyPage, 10)
            setHistoryData(data)
            setHistoryCount(count)
        } catch (error) {
            console.error("Error loading history:", error)
        } finally {
            setIsHistoryLoading(false)
        }
    }

    const loadStats = async () => {
        try {
            setLoading(true)

            // 1. Get daily usage for charts
            const dailyData = await StatsService.getDailyUsage(STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED, 30)
            setDailyStats(dailyData)

            // 2. Fetch all activity logs (or at least recent ones) for global & module stats
            const supabase = createBrowserClient()
            const { data: { session } } = await supabase.auth.getSession()

            if (session) {
                // Use our new usage-stats API which handles categorization
                const res = await fetch('/api/admin/usage-stats?range=all', {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                })

                if (res.ok) {
                    const json = await res.json()
                    setTotalCost(json.totalCost || 0)
                    setTotalTokens(json.totalTokens || 0)
                    setCategoryStats(json.categoryStats || [])

                    // Set module specific user breakdowns from API
                    setDeslindeUserBreakdown(json.deslindeUserStats || [])
                    setChatUserBreakdown(json.chatUserStats || [])

                    // Extract module specific summary stats from category breakdown
                    const deslinde = json.categoryStats.find((c: any) => c.category === 'Planos Arquitectónicos')
                    const chat = json.categoryStats.find((c: any) => c.category === 'Chat Notarial')

                    if (deslinde) {
                        setDeslindeStats(prev => ({ ...prev, tokens: deslinde.tokens, cost: deslinde.cost }))
                    }
                    if (chat) {
                        setChatStats(prev => ({ ...prev, tokens: chat.tokens, cost: chat.cost }))
                    }
                }
            }

            // 3. Get unique users
            const { data: userData } = await supabase
                .from('activity_logs')
                .select('user_id', { count: 'exact', head: false })
                .not('user_id', 'is', null)

            const uniqueUserIds = new Set(userData?.map(u => u.user_id) || [])
            setUniqueUsers(uniqueUserIds.size)

            // 4. Calculate similarity specifically for deslinde
            const deslindeEvents = await StatsService.getUsageStats(STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED, 'total')
            if (deslindeEvents) {
                setTotalUsage(deslindeEvents.length)
                setDeslindeStats(prev => ({ ...prev, count: deslindeEvents.length }))

                let similaritySum = 0
                let similarityCount = 0

                deslindeEvents.forEach((curr: any) => {
                    const meta = curr.metadata || {}
                    const quality = meta.quality_metrics || {}

                    if (quality.global_similarity !== undefined) {
                        similaritySum += quality.global_similarity
                        similarityCount++
                    } else if (meta.quality_metrics?.global_similarity !== undefined) {
                        similaritySum += meta.quality_metrics.global_similarity
                        similarityCount++
                    }
                })

                const avgSim = similarityCount > 0 ? (similaritySum / similarityCount) * 100 : 0
                setAvgSimilarity(avgSim)
                setDeslindeStats(prev => ({ ...prev, similarity: avgSim }))
            }

        } catch (error) {
            console.error("Error loading stats:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleAnalyzeStats = async () => {
        setIsAnalyzing(true)
        setShowAnalysis(true)
        try {
            const combinedUserBreakdown = [
                ...chatUserBreakdown,
                ...deslindeUserBreakdown
            ].reduce((acc: any[], curr) => {
                const existing = acc.find(u => u.userId === curr.userId)
                if (existing) {
                    existing.cost += curr.cost
                    existing.count += curr.count
                } else {
                    acc.push({ ...curr })
                }
                return acc
            }, [])

            const resp = await fetch('/api/ai/stats-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    totalUsage,
                    totalCost,
                    totalTokens,
                    avgSimilarity,
                    dailyStats,
                    userBreakdown: combinedUserBreakdown
                })
            })

            if (!resp.ok) throw new Error('Analysis failed')

            const data = await resp.json()
            try {
                // Try parsing JSON response
                const parsed = JSON.parse(data.analysis)
                setAnalysisResult(parsed)
            } catch (e) {
                // Fallback for plain text
                setAnalysisResult(data.analysis)
            }
        } catch (error) {
            console.error(error)
            setAnalysisResult({ error: "No se pudo generar el análisis estructurado." })
        } finally {
            setIsAnalyzing(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button
                    onClick={handleAnalyzeStats}
                    className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0"
                >
                    <Sparkles className="h-4 w-4" />
                    Resumen con IA
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Procesamientos</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalUsage}</div>
                        <p className="text-xs text-muted-foreground">Plantas arquitectónicas procesadas</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Usuarios Únicos</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{uniqueUsers}</div>
                        <p className="text-xs text-muted-foreground">Han utilizado la herramienta</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Promedio Diario</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {(totalUsage / 30).toFixed(1)}
                        </div>
                        <p className="text-xs text-muted-foreground">Últimos 30 días</p>
                    </CardContent>
                </Card>
            </div>

            {/* Cost & Quality Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Costo Total Estimado</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
                        <p className="text-xs text-muted-foreground">USD (OpenAI API)</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tokens Consumidos</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(totalTokens / 1000).toFixed(1)}k</div>
                        <p className="text-xs text-muted-foreground">Total Input + Output</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Precisión Promedio</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgSimilarity.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">Similitud IA vs Final</p>
                    </CardContent>
                </Card>
            </div>

            {/* Module Breakdown */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Architectural Plans Section */}
                <Card className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="h-5 w-5 text-blue-500" />
                                Planos Arquitectónicos
                            </CardTitle>
                            <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                {deslindeStats.count} Procesados
                            </span>
                        </div>
                        <CardDescription>Extracción de medidas y colindancias</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <div className="text-center p-2 bg-muted/30 rounded">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Costo</p>
                                <p className="text-sm font-bold">${deslindeStats.cost.toFixed(3)}</p>
                            </div>
                            <div className="text-center p-2 bg-muted/30 rounded">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</p>
                                <p className="text-sm font-bold">{(deslindeStats.tokens / 1000).toFixed(1)}k</p>
                            </div>
                            <div className="text-center p-2 bg-muted/30 rounded">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calidad</p>
                                <p className="text-sm font-bold text-green-600">{deslindeStats.similarity.toFixed(1)}%</p>
                            </div>
                        </div>

                        {/* Deslinde User Table */}
                        <div className="mt-4 space-y-2 max-h-[150px] overflow-y-auto">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase px-1">Uso por Usuario</p>
                            {deslindeUserBreakdown.map((user) => (
                                <div key={user.userId} className="flex items-center justify-between text-xs p-1 hover:bg-muted/50 rounded">
                                    <div className="truncate pr-2">
                                        <p className="font-medium truncate">{user.nombre}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <p className="font-bold">{user.count}</p>
                                            <p className="text-[9px] text-muted-foreground">docs</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-muted-foreground">{(user.tokens / 1000).toFixed(1)}k</p>
                                            <p className="text-[9px] text-muted-foreground">tokens</p>
                                        </div>
                                        <div className="text-right min-w-[45px]">
                                            <p className="font-bold text-blue-600">${user.cost.toFixed(2)}</p>
                                            <p className="text-[9px] text-muted-foreground">usd</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {deslindeUserBreakdown.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">Sin actividad</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Chat Interactions Section */}
                <Card className="border-l-4 border-l-purple-500">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Zap className="h-5 w-5 text-purple-500" />
                                Chat Notarial
                            </CardTitle>
                            <span className="text-xs font-medium px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                                Activo
                            </span>
                        </div>
                        <CardDescription>Revisiones, consultas y trámites</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div className="text-center p-2 bg-muted/30 rounded">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Costo Estimado</p>
                                <p className="text-sm font-bold">${chatStats.cost.toFixed(3)}</p>
                            </div>
                            <div className="text-center p-2 bg-muted/30 rounded">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</p>
                                <p className="text-sm font-bold">{(chatStats.tokens / 1000).toFixed(1)}k</p>
                            </div>
                        </div>

                        {/* Chat User Table */}
                        <div className="mt-4 space-y-2 max-h-[150px] overflow-y-auto">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase px-1">Uso por Usuario</p>
                            {chatUserBreakdown.map((user) => (
                                <div key={user.userId} className="flex items-center justify-between text-xs p-1 hover:bg-muted/50 rounded">
                                    <div className="truncate pr-2">
                                        <p className="font-medium truncate">{user.nombre}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <p className="font-bold">{user.count}</p>
                                            <p className="text-[9px] text-muted-foreground">chats</p>
                                        </div>
                                        <div className="text-right min-w-[45px]">
                                            <p className="font-bold text-purple-600">${user.cost.toFixed(2)}</p>
                                            <p className="text-[9px] text-muted-foreground">usd</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {chatUserBreakdown.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">Sin actividad</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Histórico de Uso</CardTitle>
                        <CardDescription>
                            Volumen de actividad diaria
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyStats}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => {
                                            const date = new Date(value)
                                            return `${date.getDate()}/${date.getMonth() + 1}`
                                        }}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                                    />
                                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Category Breakdown Chart */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Distribución de Costos</CardTitle>
                        <CardDescription>
                            Consumo por módulo principal
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categoryStats} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="category"
                                        type="category"
                                        stroke="#888888"
                                        fontSize={10}
                                        width={110}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                                    />
                                    <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                {/* Global User table */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Uso por Usuario (Chat)</CardTitle>
                        <CardDescription>
                            Actividad de consultas y trámites por usuario
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto">
                            {chatUserBreakdown.length > 0 ? (
                                chatUserBreakdown.map((user) => (
                                    <div key={user.userId} className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium leading-none">{user.nombre}</p>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                        <div className="flex items-center gap-4 text-right">
                                            <div>
                                                <div className="font-bold">{user.count}</div>
                                                <p className="text-[10px] text-muted-foreground">Chats</p>
                                            </div>
                                            <div>
                                                <div className="font-bold text-purple-600">${user.cost.toFixed(2)}</div>
                                                <p className="text-[10px] text-muted-foreground">Chat USD</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">No hay actividad de chat registrada</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed History Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Historial Detallado
                    </CardTitle>
                    <CardDescription>
                        Registro completo de todos los procesamientos, costos y calidad.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <StatsHistoryTable
                        data={historyData}
                        pagination={{
                            page: historyPage,
                            totalPages: Math.ceil(historyCount / 10),
                            onPageChange: setHistoryPage
                        }}
                    />
                </CardContent>
            </Card>

            {/* Analysis Dialog */}
            <Dialog open={showAnalysis} onOpenChange={setShowAnalysis}>
                <DialogContent className="sm:max-w-[80vw] max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Brain className="h-6 w-6 text-purple-600" />
                            Análisis Inteligente
                        </DialogTitle>
                        <DialogDescription>
                            Evaluación de eficiencia y recomendaciones generadas por IA.
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="h-[60vh] pr-4 mt-4">
                        {isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center h-48 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                                <p className="text-sm text-muted-foreground animate-pulse">Analizando métricas...</p>
                            </div>
                        ) : analysisResult ? (
                            typeof analysisResult === 'string' ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                                    {analysisResult}
                                </div>
                            ) : analysisResult.error ? (
                                <div className="text-red-500 p-4 font-medium text-center">
                                    {analysisResult.error}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Executive Summary */}
                                    <div className={`p-4 rounded-lg border flex flex-col gap-2 ${analysisResult.system_health === 'Excelente' || analysisResult.system_health === 'Bueno'
                                        ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900'
                                        : 'bg-amber-50/50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900'
                                        }`}>
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-lg">Resumen Ejecutivo</h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${analysisResult.system_health === 'Excelente' || analysisResult.system_health === 'Bueno'
                                                ? 'bg-green-100 text-green-700 border-green-200'
                                                : 'bg-amber-100 text-amber-700 border-amber-200'
                                                }`}>
                                                Salud: {analysisResult.system_health}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {analysisResult.executive_summary}
                                        </p>
                                    </div>

                                    {/* Key Insights Grid */}
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {analysisResult.key_insights?.map((insight: any, i: number) => (
                                            <Card key={i} className="shadow-sm">
                                                <CardHeader className="p-3 pb-1">
                                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                        {insight.status === 'positive' ? <div className="h-2 w-2 rounded-full bg-green-500" /> :
                                                            insight.status === 'negative' ? <div className="h-2 w-2 rounded-full bg-red-500" /> :
                                                                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                                                        }
                                                        {insight.title}
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-3 pt-1">
                                                    <p className="text-xs text-muted-foreground">{insight.description}</p>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>

                                    {/* Recommendations */}
                                    <div>
                                        <h4 className="font-medium mb-3 flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-indigo-500" />
                                            Recomendaciones
                                        </h4>
                                        <div className="space-y-3">
                                            {analysisResult.recommendations?.map((rec: any, i: number) => (
                                                <div key={i} className="flex gap-3 bg-muted/30 p-3 rounded-md border text-sm">
                                                    <div className={`mt-0.5 h-1.5 w-1.5 flex-none rounded-full ${rec.priority === 'Alta' ? 'bg-red-500' :
                                                        rec.priority === 'Media' ? 'bg-orange-500' : 'bg-blue-500'
                                                        }`} />
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">{rec.action}</span>
                                                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border px-1 rounded">
                                                                {rec.priority}
                                                            </span>
                                                        </div>
                                                        <p className="text-muted-foreground text-xs leading-relaxed">
                                                            {rec.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : null}
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </div>
    )
}
