'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase'
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
import { UserSessionsModal } from '@/components/admin/user-sessions-modal'
import { UserPlansModal } from '@/components/admin/user-plans-modal'

export default function UsageStatsPage() {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<any>(null)
    const [range, setRange] = useState('month')
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [selectedUserForPlans, setSelectedUserForPlans] = useState<any>(null)

    useEffect(() => {
        fetchStats()
    }, [range])

    const fetchStats = async () => {
        setLoading(true)
        try {
            // Get current session for authorization header (like other admin endpoints)
            const supabase = createBrowserClient()
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                console.error('No active session')
                return
            }

            const res = await fetch(`/api/admin/usage-stats?range=${range}`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })
            if (res.ok) {
                const json = await res.json()
                setData(json)
            } else {
                console.error('Error fetching stats:', res.status, await res.text())
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
                            {/* Category Breakdown */}
                            <div className="grid gap-4 md:grid-cols-1">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-sm font-medium">Consumo por Categoría</CardTitle>
                                        <CardDescription>Distribución de tokens y costos por módulo del sistema.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                            {data?.categoryStats?.map((cat: any) => (
                                                <div key={cat.category} className="p-4 rounded-lg bg-muted/30 border border-muted flex flex-col gap-1">
                                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat.category}</div>
                                                    <div className="text-lg font-bold">${cat.cost.toFixed(4)}</div>
                                                    <div className="text-xs text-muted-foreground">{cat.tokens.toLocaleString()} tokens</div>
                                                </div>
                                            ))}
                                            {data?.categoryStats?.length === 0 && (
                                                <div className="col-span-full text-center py-4 text-muted-foreground text-sm italic">
                                                    No hay datos por categoría.
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* KPI Cards */}
                            <div className="grid gap-4 md:grid-cols-4">
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
                                        <CardTitle className="text-sm font-medium">Certeza Promedio</CardTitle>
                                        <Activity className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{data?.avgSimilarity?.toFixed(1) || 0}%</div>
                                        <p className="text-xs text-muted-foreground">
                                            Similitud IA vs Texto Final
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
                                            Con actividad de IA
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Planos Arquitectónicos Table */}
                            <Card className="border-l-4 border-l-blue-500">
                                <CardHeader>
                                    <CardTitle>Procesamiento de Planos Arquitectónicos</CardTitle>
                                    <CardDescription>
                                        Extracción de medidas y colindancias por usuario.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Usuario</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead className="text-center">Documentos</TableHead>
                                                <TableHead>Tokens</TableHead>
                                                <TableHead>Certeza</TableHead>
                                                <TableHead>Costo (USD)</TableHead>
                                                <TableHead>Última Actividad</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(data?.deslindeUserStats || []).length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                                        No hay actividad de planos registrada.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {(data?.deslindeUserStats || []).map((user: any) => (
                                                <TableRow
                                                    key={user.userId}
                                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                    onClick={() => setSelectedUserForPlans(user)}
                                                >
                                                    <TableCell className="font-medium">{user.nombre}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                                                    <TableCell className="text-center">{user.count}</TableCell>
                                                    <TableCell>{user.tokens.toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        <span className={`font-medium ${user.avgSimilarity > 90 ? 'text-green-600' : 'text-amber-600'}`}>
                                                            {user.avgSimilarity ? `${user.avgSimilarity.toFixed(1)}%` : 'N/A'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="font-medium text-blue-600">
                                                        ${user.cost.toFixed(4)}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {new Date(user.lastActivity).toLocaleDateString('es-MX', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            {/* Chat Notarial Table */}
                            <Card className="border-l-4 border-l-purple-500">
                                <CardHeader>
                                    <CardTitle>Uso de Chat Notarial</CardTitle>
                                    <CardDescription>
                                        Actividad de revisiones y consultas por usuario.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Usuario</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead className="text-center">Chats</TableHead>
                                                <TableHead>Tokens</TableHead>
                                                <TableHead>Costo (USD)</TableHead>
                                                <TableHead>Última Actividad</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(data?.chatUserStats || []).length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                        No hay actividad de chat registrada.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {(data?.chatUserStats || []).map((user: any) => (
                                                <TableRow
                                                    key={user.userId}
                                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                    onClick={() => setSelectedUser(user)}
                                                >
                                                    <TableCell className="font-medium">{user.nombre}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                                                    <TableCell className="text-center">{user.count}</TableCell>
                                                    <TableCell>{user.tokens.toLocaleString()}</TableCell>
                                                    <TableCell className="font-medium text-purple-600">
                                                        ${user.cost.toFixed(4)}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {new Date(user.lastActivity).toLocaleDateString('es-MX', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
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

                {/* User Sessions Modal (Chat) */}
                {selectedUser && (
                    <UserSessionsModal
                        user={selectedUser}
                        onClose={() => setSelectedUser(null)}
                    />
                )}

                {/* User Plans Modal (Auditory) */}
                {selectedUserForPlans && (
                    <UserPlansModal
                        user={selectedUserForPlans}
                        onClose={() => setSelectedUserForPlans(null)}
                    />
                )}
            </DashboardLayout>
        </ProtectedRoute>
    )
}
