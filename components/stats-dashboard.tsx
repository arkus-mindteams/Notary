"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    const [userBreakdown, setUserBreakdown] = useState<UserUsage[]>([])
    // History Table State
    const [historyData, setHistoryData] = useState<any[]>([])
    const [historyCount, setHistoryCount] = useState(0)
    const [historyPage, setHistoryPage] = useState(1)

    const [isHistoryLoading, setIsHistoryLoading] = useState(false)

    // Analysis State
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<any | null>(null)
    const [showAnalysis, setShowAnalysis] = useState(false)

    // New metrics
    const [totalCost, setTotalCost] = useState(0)
    const [totalTokens, setTotalTokens] = useState(0)
    const [avgSimilarity, setAvgSimilarity] = useState(0)

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

            // Load daily usage
            const dailyData = await StatsService.getDailyUsage(STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED, 30)
            setDailyStats(dailyData)

            // Calculate total from daily (approximate for the window) or fetch all
            const total = dailyData.reduce((acc, curr) => acc + curr.count, 0)
            setTotalUsage(total)

            // Get unique users count
            const usersCount = await StatsService.getUniqueUsersCount(STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED)
            setUniqueUsers(usersCount)

            // Get detailed stats to breakdown by user and calculate costs
            // Note: For large datasets, we should move aggregation to the DB side
            const allEvents = await StatsService.getUsageStats(STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED, 'total')
            if (allEvents) {
                // setAllHistory(allEvents) // Removed: Using paginated fetch for table now
                let costSum = 0
                let tokenSum = 0
                let similaritySum = 0
                let similarityCount = 0

                // Group by user
                const byUser = allEvents.reduce((acc: Record<string, UserUsage>, curr: any) => {
                    const userId = curr.user_id
                    const meta = curr.metadata || {}

                    // Aggregate totals
                    const costs = meta.costs_summary || {}
                    const quality = meta.quality_metrics || {}

                    // Cost (units + initial if any)
                    const c = (costs.units_cost_usd || 0) + (costs.initial_analysis_cost_usd || 0) + (meta.estimated_cost_usd || 0)
                    costSum += c

                    // Tokens
                    const t = (costs.units_tokens_total || 0) + (costs.initial_tokens_total || 0) + (meta.tokens_total || 0)
                    tokenSum += t

                    // Similarity (0-1)
                    if (quality.global_similarity !== undefined) {
                        similaritySum += quality.global_similarity
                        similarityCount++
                    } else if (meta.quality_metrics?.global_similarity !== undefined) {
                        similaritySum += meta.quality_metrics.global_similarity
                        similarityCount++
                    }

                    if (!acc[userId]) {
                        acc[userId] = {
                            user_id: userId,
                            email: curr.users?.email || 'Unknown',
                            nombre: `${curr.users?.nombre || ''} ${curr.users?.apellido_paterno || ''}`.trim(),
                            count: 0,
                            last_used: curr.created_at
                        }
                    }
                    acc[userId].count += 1
                    if (new Date(curr.created_at) > new Date(acc[userId].last_used)) {
                        acc[userId].last_used = curr.created_at
                    }
                    return acc
                }, {})

                setUserBreakdown(Object.values(byUser).sort((a, b) => b.count - a.count))
                setTotalUsage(allEvents.length) // Correct total based on all events
                setTotalCost(costSum)
                setTotalTokens(tokenSum)
                setAvgSimilarity(similarityCount > 0 ? (similaritySum / similarityCount) * 100 : 0)
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
            const resp = await fetch('/api/ai/stats-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    totalUsage,
                    totalCost,
                    totalTokens,
                    avgSimilarity,
                    dailyStats,
                    userBreakdown
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

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Uso Diario</CardTitle>
                        <CardDescription>
                            Procesamientos en los últimos 30 días
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

                {/* User table */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Uso por Usuario</CardTitle>
                        <CardDescription>
                            Desglose de actividad por usuario
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto">
                            {userBreakdown.map((user) => (
                                <div key={user.user_id} className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">{user.nombre}</p>
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="font-bold">{user.count}</div>
                                        <span className="text-xs text-muted-foreground">docs</span>
                                    </div>
                                </div>
                            ))}
                            {userBreakdown.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">No hay datos disponibles</p>
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
        </div >
    )
}
