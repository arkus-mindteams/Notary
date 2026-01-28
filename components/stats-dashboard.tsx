"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatsService, STATS_EVENTS } from "@/lib/services/stats-service"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Loader2, Users, FileText, Calendar } from "lucide-react"

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

    useEffect(() => {
        loadStats()
    }, [])

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

            // Get detailed stats to breakdown by user
            const allEvents = await StatsService.getUsageStats(STATS_EVENTS.ARCHITECTURAL_PLAN_PROCESSED, 'total')
            if (allEvents) {
                // Group by user
                const byUser = allEvents.reduce((acc: Record<string, UserUsage>, curr: any) => {
                    const userId = curr.user_id
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
            }

        } catch (error) {
            console.error("Error loading stats:", error)
        } finally {
            setLoading(false)
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
        </div>
    )
}
