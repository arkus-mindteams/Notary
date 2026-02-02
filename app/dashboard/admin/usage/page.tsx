'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Toaster } from 'sonner'
import { Loader2, DollarSign, Activity, Users } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'

export default function UsageStatsPage() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any>(null)
    const [range, setRange] = useState('month')

    useEffect(() => {
        fetchStats()
    }, [range])

    const fetchStats = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/usage-stats?range=${range}`)
            if (res.ok) {
                const json = await res.json()
                setData(json)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <ProtectedRoute>
            <DashboardLayout>
                <div className="p-6 space-y-6 max-w-7xl mx-auto">

                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Analytics del Agente</h2>
                            <p className="text-muted-foreground">
                                Monitoreo de consumo de tokens y costos por usuario.
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setRange('month')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${range === 'month'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                            >
                                Este Mes
                            </button>
                            <button
                                onClick={() => setRange('all')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${range === 'all'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                    }`}
                            >
                                Histórico Total
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {/* KPI Cards */}
                            <div className="grid gap-4 md:grid-cols-3">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Costo Total Estimado</CardTitle>
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">${data?.totalCost?.toFixed(4)} USD</div>
                                        <p className="text-xs text-muted-foreground">
                                            Basado en precios de OpenAI (GPT-4o)
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Tokens Procesados</CardTitle>
                                        <Activity className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data?.totalTokens?.toLocaleString()}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Total Input + Output
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Usuarios Activos</CardTitle>
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data?.userStats?.length || 0}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Que han interactuado con el agente
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* User Breakdown Table */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Desglose por Usuario</CardTitle>
                                    <CardDescription>
                                        Detalle de consumo ordenado por costo.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>User ID</TableHead>
                                                <TableHead>Conversaciones</TableHead>
                                                <TableHead>Tokens Totales</TableHead>
                                                <TableHead className="text-right">Costo Estimado (USD)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data?.userStats?.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                                        No hay datos registrados en este periodo.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {data?.userStats?.map((user: any) => (
                                                <TableRow key={user.userId}>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                                        {user.userId}
                                                    </TableCell>
                                                    <TableCell>{user.conversationCount}</TableCell>
                                                    <TableCell>{user.tokens.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                                                        ${user.cost.toFixed(4)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            {/* Category Breakdown Table */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Desglose por Categoría</CardTitle>
                                    <CardDescription>
                                        Consumo agrupado por funcionalidad (ej. Preaviso, Deslinde).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Categoría</TableHead>
                                                <TableHead>Tokens Totales</TableHead>
                                                <TableHead className="text-right">Costo Estimado (USD)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data?.categoryStats?.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                                                        No hay datos registrados.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {data?.categoryStats?.map((cat: any) => (
                                                <TableRow key={cat.category}>
                                                    <TableCell className="font-medium capitalize">
                                                        {cat.category}
                                                    </TableCell>
                                                    <TableCell>{cat.tokens.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                                                        ${cat.cost.toFixed(4)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </DashboardLayout>
        </ProtectedRoute>
    )
}
