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
import { Plus, Edit, Trash2, X } from 'lucide-react'
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

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="text-gray-600 mt-1">Administra los usuarios del sistema</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Usuario
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuarios</CardTitle>
            <CardDescription>Todos los usuarios registrados en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Cargando...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
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
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            usuario.rol === 'superadmin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {usuario.rol}
                          </span>
                        </TableCell>
                        <TableCell>{getNotariaNombre(usuario.notaria_id)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            usuario.activo
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
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
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {usuario.id !== currentUser.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(usuario)}
                                className="text-red-600 hover:text-red-700"
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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUsuario ? 'Editar Usuario' : 'Nuevo Usuario'}
              </DialogTitle>
              <DialogDescription>
                {editingUsuario
                  ? 'Modifica la información del usuario'
                  : 'Completa los datos para crear un nuevo usuario'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido_paterno">Apellido *</Label>
                  <Input
                    id="apellido_paterno"
                    value={formData.apellido_paterno}
                    onChange={(e) => setFormData({ ...formData, apellido_paterno: e.target.value })}
                  />
                </div>
              </div>

              {/* Teléfono */}
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                />
              </div>

              {/* Rol y Notaría */}
              <div className="grid grid-cols-[1.2fr_1fr] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rol">Rol *</Label>
                  <Select
                    value={formData.rol}
                    onValueChange={(value: 'superadmin' | 'abogado') => {
                      setFormData({
                        ...formData,
                        rol: value,
                        notaria_id: value === 'superadmin' ? null : formData.notaria_id,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="superadmin">Superadmin</SelectItem>
                      <SelectItem value="abogado">Abogado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.rol === 'abogado' && (
                  <div className="flex flex-col flex-wrap gap-2">
                    <Label htmlFor="notaria_id">Notaría *</Label>
                    <Select
                      value={formData.notaria_id || ''}
                      onValueChange={(value) => setFormData({ ...formData, notaria_id: value })}
                    >
                      <SelectTrigger>
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
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingUsuario}
                />
              </div>

              {/* Contraseña (solo para nuevos usuarios) */}
              {!editingUsuario && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                {editingUsuario ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

