"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { toast } from 'sonner'
import { Plus, Edit, Trash2, X, Loader2, RefreshCw, UserCheck, Users } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase'
import type { Usuario, Notaria, CreateUsuarioRequest, UpdateUsuarioRequest } from '@/lib/types/auth-types'
import { useMemo } from 'react'
import { AsistentesModal } from '@/components/asistentes-modal'
import { toastApiError } from '@/lib/api-error-toast'

interface PendingInvitation {
  id: string
  email: string
  role: string
  status: string
  created_at: string
  expires_at: string | null
}

export default function AdminUsuariosPage() {
  const { user: currentUser, session } = useAuth()
  const supabase = useMemo(() => createBrowserClient(), [])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [notarias, setNotarias] = useState<Notaria[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [usuarioToDelete, setUsuarioToDelete] = useState<Usuario | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activatingUserId, setActivatingUserId] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [asistentesModalLawyerId, setAsistentesModalLawyerId] = useState<string | null>(null)
  const [asistentesModalNotariaId, setAsistentesModalNotariaId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<CreateUsuarioRequest>>({
    nombre: '',
    apellido_paterno: '',
    telefono: '',
    rol: 'abogado',
    notaria_id: null,
    email: '',
    password: '',
  })
  const hasLoadedDataRef = useRef(false)
  const lastUserIdRef = useRef<string | undefined>(undefined)
  const isLoadingRef = useRef(false)

  // Bloquear render si no tiene capability ADMIN_USERS_VIEW (o rol equivalente: superadmin/notario)
  useEffect(() => {
    if (!currentUser) return
    const hasAccess = currentUser.capabilities?.includes('ADMIN_USERS_VIEW') ?? (currentUser.role === 'superadmin' || currentUser.role === 'notario')
    if (!hasAccess) {
      window.location.href = '/dashboard'
    }
  }, [currentUser])

  const loadData = useCallback(async () => {
    // Evitar múltiples requests simultáneos
    if (isLoadingRef.current) {
      return
    }

    try {
      isLoadingRef.current = true
      setIsLoading(true)
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        throw new Error('No hay sesión')
      }

      // Cargar usuarios
      const usuariosRes = await fetch('/api/admin/usuarios', {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      })
      if (!usuariosRes.ok) {
        await toastApiError(usuariosRes, 'Error cargando datos')
        throw new Error('Error cargando usuarios')
      }
      const usuariosData = await usuariosRes.json()
      setUsuarios(usuariosData)

      // Cargar notarías solo para superadmin (notario no tiene capability ADMIN_NOTARIAS y no muestra el selector)
      if (currentUser?.role === 'superadmin') {
        const notariasRes = await fetch('/api/admin/notarias', {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
        })
        if (!notariasRes.ok) throw new Error('Error cargando notarías')
        const notariasData = await notariasRes.json()
        setNotarias(notariasData)
      } else {
        setNotarias([])
      }

      if (currentUser?.role === 'superadmin' || currentUser?.role === 'notario') {
        const invRes = await fetch('/api/admin/usuarios/invitations', {
          headers: { 'Authorization': `Bearer ${currentSession.access_token}` },
        })
        if (invRes.ok) {
          const invData = await invRes.json()
          setInvitations(Array.isArray(invData?.data) ? invData.data : invData || [])
        } else {
          setInvitations([])
        }
      }
    } catch (error: any) {
      toast.error('Error cargando datos', { description: error.message })
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [supabase, currentUser?.role, currentUser?.id])

  // Detectar cuando la página vuelve a estar visible y resetear isLoading si está atascado
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Si la página vuelve a estar visible y isLoading está en true,
        // dar 3 segundos y luego resetear si sigue en true (probablemente está atascado)
        timeoutId = setTimeout(() => {
          if (isLoadingRef.current) {
            isLoadingRef.current = false
            setIsLoading(false)
          }
        }, 3000)
      } else {
        // Limpiar timeout si la página se oculta
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  // Cargar datos solo cuando es necesario (montaje inicial, remount, o cambio de usuario/sesión)
  useEffect(() => {
    if ((currentUser?.role === 'superadmin' || currentUser?.role === 'notario') && session) {
      // Si cambió el usuario, recargar datos
      const userChanged = currentUser.id !== lastUserIdRef.current
      
      // Si los datos están vacíos (remount), necesitamos cargar
      const dataEmpty = usuarios.length === 0 && notarias.length === 0
      
      // Si cambió el usuario, es la primera carga, o los datos están vacíos (remount), cargar
      if (userChanged || !hasLoadedDataRef.current || dataEmpty) {
        loadData()
        hasLoadedDataRef.current = true
        lastUserIdRef.current = currentUser.id
      }
    } else {
      // Si no hay sesión o no es admin (superadmin/notario), resetear el ref
      hasLoadedDataRef.current = false
      lastUserIdRef.current = undefined
    }
  }, [currentUser, session, loadData, usuarios.length, notarias.length])

  const handleCreate = () => {
    setEditingUsuario(null)
    setFormData({
      nombre: '',
      apellido_paterno: '',
      telefono: '',
      rol: 'abogado',
      notaria_id: currentUser?.role === 'notario' ? (currentUser.notariaId ?? null) : null,
      email: '',
      password: '',
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (usuario: Usuario) => {
    setEditingUsuario(usuario)
    setFormData({
      nombre: usuario.nombre,
      apellido_paterno: usuario.apellido_paterno || '',
      telefono: usuario.telefono || '',
      rol: usuario.rol,
      notaria_id: usuario.notaria_id,
      email: usuario.email,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      
      if (!session) {
        toast.error('No hay sesión activa')
        setIsSubmitting(false)
        return
      }

      // Validaciones
      if(!formData.nombre && !formData.apellido_paterno && !formData.telefono && !formData.email && (!editingUsuario && !formData.password)) {
        toast.error('Todos los campos son requeridos')
        setIsSubmitting(false)
        return
      }
      
      if (!formData.nombre || !formData.apellido_paterno) {
        toast.error('El nombre y apellido son requeridos')
        setIsSubmitting(false)
        return
      }

      if (!formData.telefono) {
        toast.error('El teléfono es requerido')
        setIsSubmitting(false)
        return
      }

      if (!formData.rol) {
        toast.error('El rol es requerido')
        setIsSubmitting(false)
        return
      }

      if (!formData.email) {
        toast.error('El correo electrónico es requerido')
        setIsSubmitting(false)
        return
      }

      if (!editingUsuario && !formData.password) {
        toast.error('La contraseña es requerida para nuevos usuarios')
        setIsSubmitting(false)
        return
      }

      const effectiveNotariaId = formData.notaria_id || (currentUser?.role === 'notario' ? currentUser.notariaId ?? null : null)
      const rolesConNotaria = ['notario', 'abogado', 'asistente']
      if (rolesConNotaria.includes(formData.rol!) && !effectiveNotariaId) {
        toast.error('Notario, abogado y asistente deben tener una notaría asignada')
        setIsSubmitting(false)
        return
      }

      if (formData.rol === 'superadmin' && formData.notaria_id) {
        toast.error('El superadmin no debe tener notaría asignada')
        setIsSubmitting(false)
        return
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        toast.error('No hay sesión activa')
        setIsSubmitting(false)
        return
      }

      if (editingUsuario) {
        // Guardar el ID en una variable local para evitar que se pierda
        const usuarioId = editingUsuario.id
        
        // Validar que el ID esté presente
        if (!usuarioId || usuarioId === 'undefined' || usuarioId === 'null') {
          toast.error('Error al actualizar usuario', { description: 'ID de usuario no válido' })
          setIsSubmitting(false)
          return
        }

        // Actualizar (notario: notaría fija)
        const updateData: UpdateUsuarioRequest = {
          nombre: formData.nombre,
          apellido_paterno: formData.apellido_paterno,
          apellido_materno: undefined, // Solo usamos un apellido
          telefono: formData.telefono,
          rol: formData.rol,
          notaria_id: formData.notaria_id || (currentUser?.role === 'notario' ? currentUser.notariaId ?? null : null),
        }

        const res = await fetch(`/api/admin/usuarios/${usuarioId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify(updateData),
        })

      if (!res.ok) {
        await toastApiError(res, 'Error al actualizar usuario')
        setIsSubmitting(false)
        return
      }

        toast.success('Usuario actualizado correctamente')
      } else {
        // Crear (notario: notaría fija)
        const createData: CreateUsuarioRequest = {
          email: formData.email!,
          password: formData.password!,
          nombre: formData.nombre!,
          apellido_paterno: formData.apellido_paterno,
          apellido_materno: undefined, // Solo usamos un apellido
          telefono: formData.telefono,
          rol: formData.rol!,
          notaria_id: formData.notaria_id || (currentUser?.role === 'notario' ? currentUser.notariaId ?? null : null),
        }

        const res = await fetch('/api/admin/usuarios', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify(createData),
        })

        if (!res.ok) {
          await toastApiError(res, 'Error al crear usuario')
          setIsSubmitting(false)
          return
        }

        toast.success('Usuario creado correctamente')
      }

      setIsDialogOpen(false)
      setIsSubmitting(false)
      await loadData()
    } catch (error: any) {
      // Este catch maneja errores que no sean de actualización/creación
      // (por ejemplo, errores en loadData o validaciones)
      toast.error('Error', { description: error.message || 'Ocurrió un error inesperado' })
      setIsSubmitting(false)
    }
  }

  const handleDelete = (usuario: Usuario) => {
    setUsuarioToDelete(usuario)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!usuarioToDelete) {
      return
    }

    try {
      setIsDeleting(true)
      
      if (!session) {
        toast.error('No hay sesión activa')
        setIsDeleting(false)
        return
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        toast.error('No hay sesión activa')
        setIsDeleting(false)
        return
      }

      const res = await fetch(`/api/admin/usuarios/${usuarioToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      })

      if (!res.ok) {
        await toastApiError(res, 'Error desactivando usuario')
        return
      }
      toast.success('Usuario desactivado correctamente')
      setIsDeleteDialogOpen(false)
      setUsuarioToDelete(null)
      await loadData()
    } catch (error: any) {
      toast.error('Error', { description: error.message })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleActivate = async (usuario: Usuario) => {
    if (!session) {
      toast.error('No hay sesión activa')
      return
    }
    try {
      setActivatingUserId(usuario.id)
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) {
        toast.error('No hay sesión activa')
        return
      }
      const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ activo: true }),
      })
      if (!res.ok) {
        await toastApiError(res, 'Error al activar usuario')
        return
      }
      toast.success('Usuario activado correctamente')
      await loadData()
    } catch (error: any) {
      toast.error('Error', { description: error.message })
    } finally {
      setActivatingUserId(null)
    }
  }

  const getNotariaNombre = (notariaId: string | null) => {
    if (!notariaId) return 'N/A'
    const notaria = notarias.find(n => n.id === notariaId)
    return notaria?.nombre || 'N/A'
  }

  if (currentUser?.role !== 'superadmin' && currentUser?.role !== 'notario') {
    return null
  }

  const formatPhone = (value: any) => {
    if (!value) return "";

    if (value.length <= 3) return value;
    if (value.length <= 6) return `${value.slice(0, 3)} ${value.slice(3)}`;

    return `(${value.slice(0, 3)}) - ${value.slice(3, 6)} - ${value.slice(6)}`;
  };


  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="text-gray-600 mt-1">Administra los usuarios del sistema</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                // Forzar ejecución incluso si isLoading está en true
                isLoadingRef.current = false
                loadData()
              }} 
              disabled={isLoading}
              variant="outline"
              className="cursor-pointer border-gray-300 hover:bg-gray-200 text-gray-700 font-bold py-2.5 hover:text-gray-800"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar tabla
            </Button>
            <Button onClick={handleCreate} className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo usuario
            </Button>
          </div>
        </div>

        {invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Invitaciones pendientes</CardTitle>
              <CardDescription>Enlaces de activación enviados. Reenviar o revocar.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Envío</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell className="capitalize">{inv.role}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={resendingId === inv.id}
                          onClick={async () => {
                            setResendingId(inv.id)
                            try {
                              const { data: { session: s } } = await supabase.auth.getSession()
                              if (!s) { toast.error('Sin sesión'); return }
                              const res = await fetch('/api/admin/usuarios/invite/resend', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.access_token}` },
                                body: JSON.stringify({ invitation_id: inv.id }),
                              })
                              if (!res.ok) await toastApiError(res, 'Error al reenviar'); else { toast.success('Invitación reenviada'); await loadData() }
                            } finally { setResendingId(null) }
                          }}
                        >
                          {resendingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reenviar'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={revokingId === inv.id}
                          onClick={async () => {
                            setRevokingId(inv.id)
                            try {
                              const { data: { session: s } } = await supabase.auth.getSession()
                              if (!s) { toast.error('Sin sesión'); return }
                              const res = await fetch('/api/admin/usuarios/invite/revoke', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.access_token}` },
                                body: JSON.stringify({ invitation_id: inv.id }),
                              })
                              if (!res.ok) await toastApiError(res, 'Error al revocar'); else { toast.success('Invitación revocada'); await loadData() }
                            } finally { setRevokingId(null) }
                          }}
                        >
                          {revokingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revocar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Listado de Usuarios</CardTitle>
            <CardDescription>Usuarios registrados en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-10">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                <p>Cargando usuarios...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Correo electronico</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Rol</TableHead>
                    {currentUser?.role !== 'notario' && <TableHead>Notaría</TableHead>}
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={currentUser?.role === 'notario' ? 6 : 7} className="text-center py-8 text-gray-500">
                        No hay usuarios registrados
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuarios.map((usuario) => (
                      <TableRow key={usuario.id}>
                        <TableCell>
                          {`${usuario.nombre} ${usuario.apellido_paterno || ''}`.trim()}
                        </TableCell>
                        <TableCell>{usuario.email}</TableCell>
                        <TableCell>{usuario.telefono || 'N/A'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${
                            usuario.rol === 'superadmin'
                              ? 'bg-indigo-100 text-sky-700 border border-sky-200'
                              : usuario.rol === 'notario'
                              ? 'bg-violet-100 text-violet-700 border border-violet-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {usuario.rol === 'superadmin' ? 'Administrador' : usuario.rol === 'notario' ? 'Notario' : usuario.rol === 'abogado' ? 'Abogado' : usuario.rol === 'asistente' ? 'Asistente' : usuario.rol}
                          </span>
                        </TableCell>
                        {currentUser?.role !== 'notario' && (
                          <TableCell>{getNotariaNombre(usuario.notaria_id)}</TableCell>
                        )}
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-medium uppercase${
                            usuario.activo
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            {usuario.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {!usuario.activo && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleActivate(usuario)}
                                disabled={activatingUserId === usuario.id}
                                className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                title="Activar usuario"
                              >
                                {activatingUserId === usuario.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {currentUser?.capabilities?.includes('LAWYER_SUPPORTS_EDIT') && currentUser?.role !== 'superadmin' && usuario.rol === 'abogado' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAsistentesModalLawyerId(usuario.id)
                                  setAsistentesModalNotariaId(usuario.notaria_id)
                                }}
                                className="hover:bg-gray-200"
                                title="Gestionar asistentes"
                              >
                                <Users className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(usuario)}
                              className=" hover:bg-gray-200 hover:text-black"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            {usuario.id !== currentUser.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(usuario)}
                                className="text-red-600 hover:bg-gray-200 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) :  (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="invisible pointer-events-none"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog para crear/editar */}
        <Dialog 
          open={isDialogOpen} 
          onOpenChange={(open) => {
            if (!open && !isSubmitting) {
              setIsDialogOpen(false)
              setEditingUsuario(null)
              setIsSubmitting(false)
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUsuario ? 'Editar Perfil de Usuario' : 'Crear Nuevo Usuario'}
              </DialogTitle>
              <DialogDescription>
                {editingUsuario
                  ? 'Actualiza los datos del usuario seleccionado. Algunos campos no son editables.'
                  : 'Completa el formulario para dar de alta a un nuevo colaborador en la plataforma.'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre(s) <span className="text-red-500">*</span></Label>
                  <Input
                    id="nombre"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido_paterno">Apellido(s) <span className="text-red-500">*</span></Label>
                  <Input
                    id="apellido_paterno"
                    required
                    value={formData.apellido_paterno}
                    onChange={(e) => setFormData({ ...formData, apellido_paterno: e.target.value })}
                  />
                </div>
              </div>

              {/* Teléfono */}
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono de contacto <span className="text-red-500">*</span></Label>
                <Input
                id="telefono"
                required
                inputMode="numeric"
                placeholder="(123) - 456 - 7890"
                value={formatPhone(formData.telefono)}
                onChange={(e) => {
                  const onlyNumbers = e.target.value.replace(/\D/g, "");

                  if (onlyNumbers.length > 10) return;

                  setFormData({
                    ...formData,
                    telefono: onlyNumbers,
                  });
                }}
              />
              </div>

              {/* Rol y Notaría */}
              <div className="space-y-2 w-full">
                <Label htmlFor="rol">Rol del sistema <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.rol}
                  required
                  onValueChange={(value: 'superadmin' | 'notario' | 'abogado' | 'asistente') => {
                    setFormData({
                      ...formData,
                      rol: value,
                      notaria_id: value === 'superadmin' ? null : (currentUser?.role === 'notario' ? (currentUser.notariaId ?? formData.notaria_id) : formData.notaria_id),
                    })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUser?.role === 'superadmin' && (
                      <SelectItem value="superadmin">Administrador</SelectItem>
                    )}
                    {(() => {
                      const effectiveNotariaId = formData.notaria_id ?? (currentUser?.role === 'notario' ? (currentUser.notariaId ?? null) : null)
                      const existingNotarioInNotaria = effectiveNotariaId ? usuarios.find((u) => u.rol === 'notario' && u.notaria_id === effectiveNotariaId) : null
                      const canSelectNotario = !effectiveNotariaId || !existingNotarioInNotaria || (editingUsuario?.id === existingNotarioInNotaria?.id)
                      return canSelectNotario ? <SelectItem value="notario">Notario</SelectItem> : null
                    })()}
                    <SelectItem value="abogado">Abogado</SelectItem>
                    <SelectItem value="asistente">Asistente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.rol === 'notario' || formData.rol === 'abogado' || formData.rol === 'asistente') && currentUser?.role !== 'notario' && (
                <div className="flex flex-col gap-2 w-full">
                  <Label htmlFor="notaria_id">Notaría <span className="text-red-500">*</span></Label>
                  <Select
                    required
                    value={formData.notaria_id || ''}
                    onValueChange={(value) => {
                      const newNotariaId = value || null
                      const alreadyHasNotario = newNotariaId ? usuarios.some((u) => u.rol === 'notario' && u.notaria_id === newNotariaId && u.id !== editingUsuario?.id) : false
                      const mustClearNotario = formData.rol === 'notario' && alreadyHasNotario
                      setFormData({
                        ...formData,
                        notaria_id: newNotariaId,
                        ...(mustClearNotario ? { rol: 'abogado' as const } : {}),
                      })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona una notaría" />
                    </SelectTrigger>
                    <SelectContent>
                      {notarias
                        .filter((n) => n.activo)
                        .map((notaria) => (
                          <SelectItem key={notaria.id} value={notaria.id}>
                            {notaria.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Correo electronico <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder='abogado@example.com'
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingUsuario}
                />
                {editingUsuario && (
                  <p className="text-[12px] text-muted-foreground italic">El email no puede modificarse tras el registro.</p>
                )}
              </div>

              {/* Contraseña (solo para nuevos usuarios) */}
              {!editingUsuario && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña <span className="text-red-500">*</span></Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              )}
            </div>

            <hr className="my-2" />

            <DialogFooter>
              <Button 
                onClick={() => {
                  setIsDialogOpen(false)
                  setEditingUsuario(null)
                  setIsSubmitting(false)
                }} 
                disabled={isSubmitting}
                className="cursor-pointer bg-white border hover:bg-gray-100 text-black py-2.5"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white py-2.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingUsuario ? 'Guardando...' : 'Registrando...'}
                  </>
                ) : (
                  editingUsuario ? 'Guardar Cambios' : 'Registrar Usuario'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmación para eliminar */}
        <Dialog 
          open={isDeleteDialogOpen} 
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setIsDeleteDialogOpen(false)
              setUsuarioToDelete(null)
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar desactivación</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas desactivar a {usuarioToDelete?.nombre} {usuarioToDelete?.apellido_paterno || ''}?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                onClick={() => {
                  setIsDeleteDialogOpen(false)
                  setUsuarioToDelete(null)
                }} 
                disabled={isDeleting}
                className="cursor-pointer bg-white border hover:bg-gray-100 text-black py-2.5"
              >
                Cancelar
              </Button>
              <Button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className="cursor-pointer bg-red-600 hover:bg-red-700 text-white py-2.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Desactivando...
                  </>
                ) : (
                  'Desactivar Usuario'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {asistentesModalLawyerId && (
          <AsistentesModal
            open={!!asistentesModalLawyerId}
            onOpenChange={(open) => !open && setAsistentesModalLawyerId(null)}
            lawyerId={asistentesModalLawyerId}
            lawyerNotariaId={asistentesModalNotariaId}
            asistentesOfNotaria={usuarios
              .filter((u) => u.rol === 'asistente' && u.notaria_id === asistentesModalNotariaId)
              .map((u) => ({
                id: u.id,
                email: u.email,
                nombre: `${u.nombre} ${u.apellido_paterno || ''}`.trim(),
              }))}
            accessToken={session?.access_token ?? ''}
            onSuccess={loadData}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

