"use client"

import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Eye, ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { StatsService } from "@/lib/services/stats-service"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

interface StatsHistoryTableProps {
    data: any[]
    pagination: {
        page: number
        totalPages: number
        onPageChange: (page: number) => void
    }
}

export function StatsHistoryTable({ data, pagination }: StatsHistoryTableProps) {
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
    const [logDetails, setLogDetails] = useState<any[]>([])
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const handleViewDetails = async (logId: string) => {
        setSelectedLogId(logId)
        setIsDialogOpen(true)
        setIsLoadingDetails(true)
        try {
            const details = await StatsService.getLogDetails(logId)
            setLogDetails(details || [])
        } catch (error) {
            console.error("Error fetching details", error)
            // Fallback for missing table or permissions
            setLogDetails([])
        } finally {
            setIsLoadingDetails(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Usuario</TableHead>
                            <TableHead className="text-center">Imágenes</TableHead>
                            <TableHead className="text-center">Unidades</TableHead>
                            <TableHead className="text-right">Costo (USD)</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-center">Calidad</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row) => {
                            const meta = row.metadata || {}
                            const costs = meta.costs_summary || {}
                            const request = meta.meta_request || {}
                            const quality = meta.quality_metrics || {}

                            // Cost logic (support legacy and new structure)
                            const totalCost = (costs.units_cost_usd || 0) + (costs.initial_analysis_cost_usd || 0) + (meta.estimated_cost_usd || 0)
                            const totalTokens = (costs.units_tokens_total || 0) + (costs.initial_tokens_total || 0) + (meta.tokens_total || 0)
                            const similarity = quality.global_similarity !== undefined
                                ? quality.global_similarity
                                : (meta.quality_metrics?.global_similarity || 0)

                            return (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        {format(new Date(row.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{row.users?.nombre} {row.users?.apellido_paterno}</span>
                                            <span className="text-xs text-muted-foreground">{row.users?.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{request.images_count || meta.images_count || 0}</TableCell>
                                    <TableCell className="text-center">{request.authorized_units_count || meta.authorized_units_count || 0}</TableCell>
                                    <TableCell className="text-right font-medium text-green-600">
                                        ${totalCost.toFixed(4)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground">
                                        {(totalTokens / 1000).toFixed(1)}k
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {similarity > 0 ? (
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${similarity > 0.9 ? 'bg-green-100 text-green-800' :
                                                similarity > 0.7 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {(similarity * 100).toFixed(0)}%
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(row.id)}>
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pagination.onPageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                >
                    Anterior
                </Button>
                <div className="text-sm font-medium">
                    Página {pagination.page} de {pagination.totalPages || 1}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pagination.onPageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                >
                    Siguiente
                </Button>
            </div>

            {/* Details Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detalle de Procesamiento</DialogTitle>
                        <DialogDescription>
                            Desglose por unidad, costos y ediciones realizadas.
                        </DialogDescription>
                    </DialogHeader>

                    {isLoadingDetails ? (
                        <div className="py-8 text-center text-muted-foreground">Cargando detalles...</div>
                    ) : logDetails.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            No hay detalles registrados para esta sesión (Formatos antiguos o sin unidades autorizadas).
                        </div>
                    ) : (

                        <ScrollArea className="h-[60vh] pr-4">
                            <div className="space-y-4">
                                {logDetails.map((detail) => {
                                    const metrics = detail.metrics || {}
                                    const usage = detail.usage || {}
                                    const similarity = detail.similarity_score || 0

                                    return (
                                        <Card key={detail.id} className="overflow-hidden">
                                            <CardHeader className="bg-muted/30 p-4 pb-2">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-base font-medium flex items-center gap-2">
                                                        <span>{detail.unit_id}</span>
                                                    </CardTitle>
                                                    <Badge variant={similarity > 0.9 ? 'default' : similarity > 0.7 ? 'secondary' : 'destructive'}>
                                                        {(similarity * 100).toFixed(0)}% Similitud
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-4 pt-4">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {/* Costos */}
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Costo</span>
                                                        <div className="font-semibold text-green-600">
                                                            ${(detail.cost_usd || 0).toFixed(4)}
                                                        </div>
                                                    </div>

                                                    {/* Tokens */}
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tokens</span>
                                                        <div className="font-medium">
                                                            {(usage.total_tokens || 0).toLocaleString()}
                                                        </div>
                                                    </div>

                                                    {/* Ediciones */}
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ediciones</span>
                                                        <div className="flex flex-col text-sm">
                                                            <span className={metrics.edit_distance > 10 ? "text-amber-600" : "text-gray-700"}>
                                                                Distancia: {metrics.edit_distance || 0}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Caracteres */}
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cambio Neto</span>
                                                        <div className="text-sm">
                                                            <span className="text-red-500 font-medium">-{metrics.chars_removed || 0}</span>
                                                            <span className="mx-1">/</span>
                                                            <span className="text-green-500 font-medium">+{metrics.chars_added || 0}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog >
        </div >
    )
}
