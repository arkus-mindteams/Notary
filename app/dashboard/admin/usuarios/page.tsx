"use client"

import { useState, useEffect } from 'react'
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
import { Plus, Edit, Trash2, X, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase'
import type { Usuario, Notaria, CreateUsuarioRequest, UpdateUsuarioRequest } from '@/lib/types/auth-types'
import { useMemo } from 'react'

export default function AdminUsuariosPage() {
  const { user: currentUser, session } = useAuth()
  const supabase = useMemo(() => createBrowserClient(), [])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [notarias, setNotarias] = useState<Notaria[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null)
  const [formData, setFormData] = useState<Partial<CreateUsuarioRequest>>({
    nombre: '',
    apellido_paterno: '',
    telefono: '',
    rol: 'abogado',
    notaria_id: null,
    email: '',
    password: '',
  })

  // Verificar que sea superadmin
  useEffect(() => {
    if (currentUser && currentUser.role !== 'superadmin') {
      window.location.href = '/dashboard'
    }
  }, [currentUser])

  // Cargar datos
  useEffect(() => {
    if (currentUser?.role === 'superadmin' && session) {
      loadData()
    }
  }, [currentUser, session])

  const loadData = async () => {
    try {
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
      if (!usuariosRes.ok) throw new Error('Error cargando usuarios')
      const usuariosData = await usuariosRes.json()
      setUsuarios(usuariosData)

      // Cargar notarías
      const notariasRes = await fetch('/api/admin/notarias', {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      })
      if (!notariasRes.ok) throw new Error('Error cargando notarías')
      const notariasData = await notariasRes.json()
      setNotarias(notariasData)
    } catch (error: any) {
      toast.error('Error cargando datos', { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingUsuario(null)
    setFormData({
      nombre: '',
      apellido_paterno: '',
      telefono: '',
      rol: 'abogado',
      notaria_id: null,
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
      if (!session) {
        toast.error('No hay sesión activa')
        return
      }

      // Validaciones
      if (!formData.email || !formData.nombre || !formData.rol) {
        toast.error('Campos requeridos faltantes')
        return
      }

      if (!editingUsuario && !formData.password) {
        toast.error('La contraseña es requerida para nuevos usuarios')
        return
      }

      if (formData.rol === 'abogado' && !formData.notaria_id) {
        toast.error('Los abogados deben tener una notaría asignada')
        return
      }

      if (formData.rol === 'superadmin' && formData.notaria_id) {
        toast.error('El superadmin no debe tener notaría asignada')
        return
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        toast.error('No hay sesión activa')
        return
      }

      if (editingUsuario) {
        // Actualizar
        const updateData: UpdateUsuarioRequest = {
          nombre: formData.nombre,
          apellido_paterno: formData.apellido_paterno,
          apellido_materno: null, // Solo usamos un apellido
          telefono: formData.telefono,
          rol: formData.rol,
          notaria_id: formData.notaria_id || null,
        }

        const res = await fetch(`/api/admin/usuarios/${editingUsuario.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify(updateData),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.message || 'Error actualizando usuario')
        }

        toast.success('Usuario actualizado correctamente')
      } else {
        // Crear
        const createData: CreateUsuarioRequest = {
          email: formData.email!,
          password: formData.password!,
          nombre: formData.nombre!,
          apellido_paterno: formData.apellido_paterno,
          apellido_materno: null, // Solo usamos un apellido
          telefono: formData.telefono,
          rol: formData.rol!,
          notaria_id: formData.notaria_id || null,
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
          const error = await res.json()
          throw new Error(error.message || 'Error creando usuario')
        }

        toast.success('Usuario creado correctamente')
      }

      setIsDialogOpen(false)
      loadData()
    } catch (error: any) {
      toast.error('Error', { description: error.message })
    }
  }

  const handleDelete = async (usuario: Usuario) => {
    if (!confirm(`¿Estás seguro de desactivar a ${usuario.nombre}?`)) {
      return
    }

    try {
      if (!session) {
        toast.error('No hay sesión activa')
        return
      }

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        toast.error('No hay sesión activa')
        return
      }

      const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Error desactivando usuario')
      }

      toast.success('Usuario desactivado correctamente')
      loadData()
    } catch (error: any) {
      toast.error('Error', { description: error.message })
    }
  }

  const getNotariaNombre = (notariaId: string | null) => {
    if (!notariaId) return 'N/A'
    const notaria = notarias.find(n => n.id === notariaId)
    return notaria?.nombre || 'N/A'
  }

  if (currentUser?.role !== 'superadmin') {
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
          <Button onClick={handleCreate} className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo usuario
          </Button>
        </div>

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
                    <TableHead>Notaría</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
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
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {usuario.rol === 'superadmin' ? 'Administrador' : usuario.rol}
                          </span>
                        </TableCell>
                        <TableCell>{getNotariaNombre(usuario.notaria_id)}</TableCell>
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
                            ) : (
                              // Placeholder para mantener el espacio
                              <div className="w-8 h-8" />
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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                  onValueChange={(value: 'superadmin' | 'abogado') => {
                    setFormData({
                      ...formData,
                      rol: value,
                      notaria_id: value === 'superadmin' ? null : formData.notaria_id,
                    })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">Administrador</SelectItem>
                    <SelectItem value="abogado">Abogado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.rol === 'abogado' && (
                <div className="flex flex-col gap-2 w-full">
                  <Label htmlFor="notaria_id">Notaría <span className="text-red-500">*</span></Label>
                  <Select
                    required
                    value={formData.notaria_id || ''}
                    onValueChange={(value) =>
                      setFormData({ ...formData, notaria_id: value })
                    }
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
              <Button onClick={() => setIsDialogOpen(false)} className="cursor-pointer bg-white border hover:bg-gray-100 text-black py-2.5">
                Cancelar
              </Button>
              <Button onClick={handleSubmit}  className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white py-2.5">
                {editingUsuario ? 'Guardar Cambios' : 'Registrar Usuario'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

