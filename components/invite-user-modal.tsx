'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2 } from 'lucide-react'
import type { AuthUser, Notaria } from '@/lib/types/auth-types'

export interface InviteUserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notarias: Notaria[]
  abogados: { id: string; email: string; nombre: string; notaria_id?: string | null }[]
  currentUser: AuthUser | null
  accessToken: string
  onSuccess: () => void
  onError: (title: string, description?: string) => void
}

export function InviteUserModal({
  open,
  onOpenChange,
  notarias,
  abogados,
  currentUser,
  accessToken,
  onSuccess,
  onError,
}: InviteUserModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'notario' | 'abogado' | 'asistente'>('abogado')
  const [notariaId, setNotariaId] = useState<string>(currentUser?.notariaId ?? '')
  const [supportsLawyerIds, setSupportsLawyerIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const effectiveNotariaId = currentUser?.role === 'notario' ? currentUser.notariaId : notariaId
  const showNotariaSelect = currentUser?.role === 'superadmin'
  const showSupportsLawyer = role === 'asistente'
  const abogadosSameNotaria = effectiveNotariaId
    ? abogados.filter((a) => (a as { notaria_id?: string | null }).notaria_id === effectiveNotariaId)
    : abogados

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      onError('El correo es requerido')
      return
    }
    const nId = currentUser?.role === 'notario' ? currentUser.notariaId : notariaId
    if ((role === 'notario' || role === 'abogado' || role === 'asistente') && !nId) {
      onError('La notaría es requerida')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/usuarios/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role,
          notaria_id: nId,
          preconfig_json: role === 'asistente' ? { supports_lawyer_user_ids: supportsLawyerIds } : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(data?.error?.message ?? 'Error al enviar invitación', data?.error?.code)
        return
      }
      onSuccess()
      onOpenChange(false)
      setEmail('')
      setRole('abogado')
      setSupportsLawyerIds([])
    } catch (err: unknown) {
      onError('Error de red', err instanceof Error ? err.message : undefined)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleLawyer = (id: string) => {
    setSupportsLawyerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Se enviará un enlace de activación al correo. El usuario podrá elegir su contraseña al activar la cuenta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Correo electrónico *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Rol *</Label>
            <Select
              value={role}
              onValueChange={(v: 'notario' | 'abogado' | 'asistente') => {
                setRole(v)
                if (v !== 'asistente') setSupportsLawyerIds([])
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notario">Notario</SelectItem>
                <SelectItem value="abogado">Abogado</SelectItem>
                <SelectItem value="asistente">Asistente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showNotariaSelect && (
            <div className="space-y-2">
              <Label>Notaría *</Label>
              <Select value={notariaId} onValueChange={setNotariaId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona notaría" />
                </SelectTrigger>
                <SelectContent>
                  {notarias.filter((n) => n.activo).map((n) => (
                    <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {showSupportsLawyer && (
            <div className="space-y-2">
              <Label>Abogados que supervisa (opcional)</Label>
              <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                {abogadosSameNotaria.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay abogados en esta notaría</p>
                ) : (
                  abogadosSameNotaria.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={supportsLawyerIds.includes(a.id)}
                        onChange={() => toggleLawyer(a.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{a.nombre || a.email}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
