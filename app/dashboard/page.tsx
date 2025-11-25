"use client"

import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Upload, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <ProtectedRoute>
      <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">
            Bienvenido, {user?.name}
          </h1>
          <p className="text-gray-600">
            Sistema de Interpretación Notarial de Plantas Arquitectónicas
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Documentos Procesados
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">
                +2 desde el mes pasado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pendientes de Revisión
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">
                Requieren autorización
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Autorizados Hoy
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">5</div>
              <p className="text-xs text-muted-foreground">
                +1 desde ayer
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Action */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">Lectura de Plantas Arquitectónicas</span>
            </CardTitle>
            <CardDescription>
              Procesa plantas arquitectónicas y genera texto notarial automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Características principales:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Extracción automática de medidas y colindancias</li>
                  <li>• Conversión a lenguaje notarial formal</li>
                  <li>• Validación visual con resaltado sincronizado</li>
                  <li>• Exportación a documentos Word</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Formatos soportados:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Documentos PDF</li>
                  <li>• Imágenes PNG, JPG</li>
                  <li>• Documentos Word (.docx)</li>
                </ul>
              </div>
            </div>
            
            <div className="pt-4">
              <Button asChild size="lg" className="w-full md:w-auto">
                <Link href="/dashboard/deslinde?reset=1" className="flex items-center">
                  <Upload className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Iniciar Lectura de Plantas Arquitectónicas</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>
              Últimos documentos procesados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Planta Arquitectónica - Propiedad B-2</p>
                  <p className="text-xs text-gray-500">Autorizado hace 2 horas</p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              
              <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Planta Arquitectónica - Propiedad C-1</p>
                  <p className="text-xs text-gray-500">Pendiente de revisión</p>
                </div>
                <Clock className="h-4 w-4 text-yellow-500" />
              </div>
              
              <div className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Planta Arquitectónica - Propiedad A-3</p>
                  <p className="text-xs text-gray-500">Autorizado ayer</p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}
