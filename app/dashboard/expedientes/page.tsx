"use client"

import { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { ExpedienteSearch } from '@/components/expediente-search'
import { ExpedienteDetail } from '@/components/expediente-detail'
import type { Comprador, ExpedienteCompleto } from '@/lib/types/expediente-types'

export default function ExpedientesPage() {
  const [selectedExpediente, setSelectedExpediente] = useState<ExpedienteCompleto | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const handleExpedienteSelect = (expediente: ExpedienteCompleto) => {
    setSelectedExpediente(expediente)
  }

  const handleBack = () => {
    setSelectedExpediente(null)
    setSearchQuery('')
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-6 space-y-6 h-full flex flex-col">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Expedientes de Compradores</h1>
            <p className="text-gray-600">
              Busca y gestiona expedientes de compradores con sus trámites y documentos asociados
            </p>
          </div>

          {!selectedExpediente ? (
            <ExpedienteSearch
              onExpedienteSelect={handleExpedienteSelect}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          ) : (
            <ExpedienteDetail
              expediente={selectedExpediente}
              onBack={handleBack}
            />
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}

