"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ArrowLeft, 
  User, 
  FileText, 
  Calendar,
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  Archive,
  Download,
  Eye
} from 'lucide-react'
import { TramitesList } from '@/components/tramites-list'
import { DocumentosList } from '@/components/documentos-list'
import type { ExpedienteCompleto, Tramite } from '@/lib/types/expediente-types'

interface ExpedienteDetailProps {
  expediente: ExpedienteCompleto
  onBack: () => void
}

export function ExpedienteDetail({ expediente, onBack }: ExpedienteDetailProps) {
  const [activeTab, setActiveTab] = useState('tramites')

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'completado':
        return (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completado
          </Badge>
        )
      case 'en_proceso':
        return (
          <Badge className="bg-blue-100 text-blue-700">
            <Clock className="h-3 w-3 mr-1" />
            En Proceso
          </Badge>
        )
      case 'archivado':
        return (
          <Badge className="bg-gray-100 text-gray-700">
            <Archive className="h-3 w-3 mr-1" />
            Archivado
          </Badge>
        )
      default:
        return <Badge variant="outline">{estado}</Badge>
    }
  }

  const getTipoTramiteBadge = (tipo: string) => {
    const tipos: Record<string, { label: string; color: string }> = {
      preaviso: { label: 'Pre-Aviso', color: 'bg-blue-100 text-blue-700' },
      plano_arquitectonico: { label: 'Plano Arquitectónico', color: 'bg-purple-100 text-purple-700' },
      otro: { label: 'Otro', color: 'bg-gray-100 text-gray-700' },
    }
    const tipoInfo = tipos[tipo] || tipos.otro
    return <Badge className={tipoInfo.color}>{tipoInfo.label}</Badge>
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4">
      {/* Header con botón de regreso */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Expediente</h2>
          <p className="text-sm text-gray-500">Información completa del comprador</p>
        </div>
      </div>

      {/* Información del comprador */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Información del Comprador</span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">{expediente.comprador.nombre}</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm">
                  <Badge variant="outline">RFC: {expediente.comprador.rfc}</Badge>
                  <Badge variant="outline">CURP: {expediente.comprador.curp}</Badge>
                </div>
                {expediente.comprador.direccion && (
                  <div className="flex items-start space-x-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{expediente.comprador.direccion}</span>
                  </div>
                )}
                {expediente.comprador.telefono && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{expediente.comprador.telefono}</span>
                  </div>
                )}
                {expediente.comprador.email && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span>{expediente.comprador.email}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>Creado: {new Date(expediente.comprador.created_at).toLocaleDateString('es-MX')}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs para Trámites y Documentos */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
        <TabsList>
          <TabsTrigger value="tramites">
            Trámites ({expediente.tramites.length})
          </TabsTrigger>
          <TabsTrigger value="documentos">
            Documentos ({expediente.documentos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tramites" className="flex-1 min-h-0">
          <TramitesList 
            tramites={expediente.tramites}
            compradorId={expediente.comprador.id}
          />
        </TabsContent>

        <TabsContent value="documentos" className="flex-1 min-h-0">
          <DocumentosList 
            documentos={expediente.documentos}
            tramites={expediente.tramites}
            compradorId={expediente.comprador.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

