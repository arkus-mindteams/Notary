'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { toastApiError } from '@/lib/api-error-toast'

interface AsistenteRow {
  user_id: string
  email: string
  nombre: string
  added_at: string
}

interface AsistentesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lawyerId: string
  lawyerNotariaId: string | null
  asistentesOfNotaria: { id: string; email: string; nombre: string }[]
  accessToken: string
  onSuccess: () => void
}

export function AsistentesModal({
  open,
  onOpenChange,
  lawyerId,
  lawyerNotariaId,
  asistentesOfNotaria,
  accessToken,
  onSuccess,
}: AsistentesModalProps) {
  const [list, setList] = useState<AsistenteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [selectedToAdd, setSelectedToAdd] = useState<string>('')

  const alreadyIds = new Set(list.map((a) => a.user_id))
  const availableToAdd = asistentesOfNotaria.filter((a) => !alreadyIds.has(a.id) && a.id !== lawyerId)

  useEffect(() => {
    if (!open || !lawyerId || !accessToken) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/abogados/${lawyerId}/asistentes`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (!res.ok) throw res
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setList(Array.isArray(data?.data) ? data.data : [])
      })
      .catch((res) => {
        if (!cancelled && res?.json) toastApiError(res, 'Error al cargar asistentes')
        else if (!cancelled) setList([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, lawyerId, accessToken])

  const fetchList = () =>
    fetch(`/api/admin/abogados/${lawyerId}/asistentes`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setList(Array.isArray(d?.data) ? d.data : []))

  const handleAdd = async () => {
    if (!selectedToAdd || !accessToken) return
    setAddingId(selectedToAdd)
    try {
      const res = await fetch(`/api/admin/abogados/${lawyerId}/asistentes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ assistant_user_id: selectedToAdd }),
      })
      if (!res.ok) await toastApiError(res, 'Error al asignar')
      else {
        toast.success('Asistente asignado')
        onSuccess()
        await fetchList()
      }
    } finally {
      setAddingId(null)
      setSelectedToAdd('')
    }
  }

  const handleRemove = async (assistantId: string) => {
    if (!accessToken) return
    setRemovingId(assistantId)
    try {
      const res = await fetch(`/api/admin/abogados/${lawyerId}/asistentes/${assistantId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) await toastApiError(res, 'Error al quitar')
      else {
        toast.success('Asistente quitado')
        onSuccess()
        await fetchList()
      }
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asistentes del abogado</DialogTitle>
          <DialogDescription>
            Asistentes que pueden ver los expedientes de este abogado.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin text-gray-500" /></div>
        ) : (
          <div className="space-y-4">
            {availableToAdd.length > 0 && (
              <div className="flex gap-2">
                <Select value={selectedToAdd} onValueChange={setSelectedToAdd}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Agregar asistente" /></SelectTrigger>
                  <SelectContent>
                    {availableToAdd.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nombre || a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleAdd} disabled={!selectedToAdd || !!addingId}>
                  {addingId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {list.length === 0 ? <li className="text-sm text-gray-500">Ningún asistente asignado</li> : list.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between rounded border px-3 py-2">
                  <span className="text-sm">{a.nombre || a.email}</span>
                  <Button variant="ghost" size="sm" className="text-red-600" disabled={!!removingId} onClick={() => handleRemove(a.user_id)}>
                    {removingId === a.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
