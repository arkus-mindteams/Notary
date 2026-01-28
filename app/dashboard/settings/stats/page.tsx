"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { StatsDashboard } from "@/components/stats-dashboard"
import { useAuth } from "@/lib/auth-context"
import { Loader2, BarChart3 } from "lucide-react"

export default function StatsPage() {
    const { user, isLoading } = useAuth()
    const router = useRouter()
    const [isAuthorized, setIsAuthorized] = useState(false)

    useEffect(() => {
        if (!isLoading) {
            if (user?.role !== 'superadmin') {
                router.push('/dashboard')
            } else {
                setIsAuthorized(true)
            }
        }
    }, [user, isLoading, router])

    if (isLoading || !isAuthorized) {
        return (
            <ProtectedRoute>
                <DashboardLayout>
                    <div className="p-6 flex items-center justify-center min-h-[400px]">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                </DashboardLayout>
            </ProtectedRoute>
        )
    }

    return (
        <ProtectedRoute>
            <DashboardLayout>
                <div className="p-6 space-y-6 max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <BarChart3 className="h-8 w-8 text-primary" />
                            <h1 className="text-3xl font-bold text-gray-900">Estadísticas de Uso</h1>
                        </div>
                        <p className="text-gray-600">
                            Visualiza el uso de la herramienta de lectura de planos arquitectónicos.
                        </p>
                    </div>

                    <StatsDashboard />
                </div>
            </DashboardLayout>
        </ProtectedRoute>
    )
}
