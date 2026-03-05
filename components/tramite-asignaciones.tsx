'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, UserPlus, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { useFetchWithAuth } from '@/lib/hooks/use-fetch-with-auth'
import { toastApiError } from '@/lib/api-error-toast'

export interface AsignacionRow {
  id: string
  tramite_id: string
  assistant_id: string
  lawyer_id: string
  notaria_id: string
  created_at: string
  asistente_email?: string
  asistente_nombre?: string
}

interface AsistenteParaAsignar {
  id: string
  email: string
  nombre: string
}

interface TramiteAsignacionesProps {
  tramiteId: string
  ownerId: string | null
  currentUserId: string
  /** Solo el dueño puede asignar/quitar; notario solo ve la lista */
  canEdit: boolean
}

export function TramiteAsignaciones({
  tramiteId,
  ownerId,
  currentUserId,
  canEdit,
}: TramiteAsignacionesProps) {
  const fetchWithAuth = useFetchWithAuth()
  const [asignaciones, setAsignaciones] = useState<AsignacionRow[]>([])
  const [available, setAvailable] = useState<AsistenteParaAsignar[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [selectedToAdd, setSelectedToAdd] = useState<string>('')

  const loadAsignaciones = async () => {
    try {
      const res = await fetchWithAuth(`/api/expedientes/tramites/${tramiteId}/asignaciones`)
      if (!res.ok) {
        if (res.status === 404) setAsignaciones([])
        else await toastApiError(res, 'Error al cargar asignaciones')
        return
      }
      const data = await res.json()
      setAsignaciones(Array.isArray(data?.data) ? data.data : [])
    } catch {
      setAsignaciones([])
    }
  }

  const loadAvailable = async () => {
    if (!canEdit) return
    try {
      const res = await fetchWithAuth(`/api/expedientes/tramites/${tramiteId}/asistentes-para-asignar`)
      if (!res.ok) return
      const data = await res.json()
      setAvailable(Array.isArray(data?.data) ? data.data : [])
    } catch {
      setAvailable([])
    }
  }

  useEffect(() => {
    if (!tramiteId) return
    setLoading(true)
    Promise.all([loadAsignaciones(), canEdit ? loadAvailable() : Promise.resolve()]).finally(() =>
      setLoading(false)
    )
  }, [tramiteId, canEdit])

  const handleAdd = async () => {
    if (!selectedToAdd || !canEdit) return
    setAddingId(selectedToAdd)
    try {
      const res = await fetchWithAuth(`/api/expedientes/tramites/${tramiteId}/asignaciones`, {
        method: 'POST',
        body: JSON.stringify({ assistant_id: selectedToAdd }),
      })
      if (!res.ok) await toastApiError(res, 'Error al asignar asistente')
      else {
        toast.success('Asistente asignado al trámite')
        setSelectedToAdd('')
        await loadAsignaciones()
        await loadAvailable()
      }
    } finally {
      setAddingId(null)
    }
  }

  const handleRemove = async (assistantId: string) => {
    if (!canEdit) return
    setRemovingId(assistantId)
    try {
      const res = await fetchWithAuth(
        `/api/expedientes/tramites/${tramiteId}/asignaciones/${assistantId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) await toastApiError(res, 'Error al quitar asignación')
      else {
        toast.success('Asistente quitado del trámite')
        await loadAsignaciones()
        await loadAvailable()
      }
    } finally {
      setRemovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando asignaciones…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-700">Asignado a</h4>
      {canEdit && available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedToAdd} onValueChange={setSelectedToAdd}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue placeholder="Agregar asistente" />
            </SelectTrigger>
            <SelectContent>
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nombre || a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={handleAdd}
            disabled={!selectedToAdd || !!addingId}
          >
            {addingId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Asignar
              </>
            )}
          </Button>
        </div>
      )}
      {asignaciones.length === 0 ? (
        <p className="text-sm text-gray-500">Ningún asistente asignado a este trámite.</p>
      ) : (
        <ul className="space-y-1">
          {asignaciones.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-gray-50"
            >
              <span>{a.asistente_nombre || a.asistente_email || a.assistant_id}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={!!removingId}
                  onClick={() => handleRemove(a.assistant_id)}
                >
                  {removingId === a.assistant_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
