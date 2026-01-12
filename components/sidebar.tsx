"use client"

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import {
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FolderOpen,
  Settings,
  Users,
  FileCode,
  HomeIcon,
} from 'lucide-react'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Error en logout:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleNavigation = (path: string) => {
    router.push(path)
  }

  return (
    <Card className={`h-full flex pt-2 bg-gray-800 rounded-l-none rounded-b-none flex-col transition-all duration-300 ${
      isCollapsed ? 'w-18' : 'w-64'
    }`}>
      {/* Header con Usuario y Notaría */}
      <div className="border-b border-b-gray-700 ">
        {/* Sección Notaría */}
        <div className="px-4">
          <div
            className={`
              flex items-center
              ${isCollapsed ? "flex-col gap-2" : "flex-row justify-between"}
            `}
          >
            {/* Logo */}
            <div
              className={`
                relative
                ${isCollapsed ? "w-12 h-12" : "w-full h-16 mr-2 flex-1"}
              `}
            >
              <Image
                src={isCollapsed ? "/logo.png" : "/notaria-logo-removebg-preview.png"}
                alt="Notaría #3"
                fill
                className="object-contain"
              />
            </div>

            {/* Botón */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="
                h-8 w-8 p-0 flex-shrink-0
                text-gray-400
                hover:bg-transparent hover:text-gray-200
                cursor-pointer
                focus-visible:ring-0
              "
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>


        {/* Sección Usuario */}
        {user && (
          <div className="p-4 pb-3 pt-6 ">
            <div
              className={`
                flex items-center
                ${isCollapsed ? "justify-center" : "space-x-3"}
              `}
            >
              {/* Avatar */}
              <div className="w-10 h-10 bg-blue-500/30 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-blue-200">
                  {user.name
                    .split(" ")
                    .map(n => n[0])
                    .join("")}
                </span>
              </div>

              {/* Info (solo cuando NO está colapsado) */}
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-300 truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">
                    {user.role}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex-1 p-4 space-y-2">
        <Button
          variant="ghost"
          className={`w-full justify-start overflow-hidden ${
            isCollapsed ? 'px-2' : 'px-3'
          } ${
            pathname === '/dashboard/deslinde?reset=1' || pathname === '/dashboard/deslinde'
              ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
          onClick={() => handleNavigation('/dashboard/deslinde?reset=1')}
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3 truncate text-sm">Lectura de Plantas Arquitectónicas</span>}
        </Button>

        <Button
          variant="ghost"
          className={`w-full justify-start overflow-hidden ${
            isCollapsed ? 'px-2' : 'px-3'
          } ${
            pathname === '/dashboard/preaviso'
              ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
          onClick={() => handleNavigation('/dashboard/preaviso')}
        >
          <MessageSquare className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3 truncate text-sm">Pre-Aviso</span>}
        </Button>

        <Button
          variant="ghost"
          className={`w-full justify-start overflow-hidden ${
            isCollapsed ? 'px-2' : 'px-3'
          } ${
            pathname === '/dashboard/expedientes'
              ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
          onClick={() => handleNavigation('/dashboard/expedientes')}
        >
          <FolderOpen className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3 truncate text-sm">Expedientes</span>}
        </Button>

        {/* Sección Administración (solo para superadmin) */}
        {user?.role === 'superadmin' && (
          <div className='border-t pt-2 mt-4 border-t-gray-700'>
            <div className={`px-4 py-2 ${isCollapsed ? 'px-2' : ''}`}>
              {!isCollapsed && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Administración
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              className={`w-full justify-start overflow-hidden ${
                isCollapsed ? 'px-2' : 'px-3'
              } ${
                pathname === '/dashboard/admin/usuarios'
                  ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              onClick={() => handleNavigation('/dashboard/admin/usuarios')}
            >
              <Users className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && <span className="ml-3 truncate text-sm">Usuarios</span>}
            </Button>
            <Button
              variant="ghost"
              className={`w-full justify-start overflow-hidden ${
                isCollapsed ? 'px-2' : 'px-3'
              } ${
                pathname === '/dashboard/admin/preaviso-config'
                  ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
              onClick={() => handleNavigation('/dashboard/admin/preaviso-config')}
            >
              <FileCode className="h-4 w-4 flex-shrink-0" />
              {!isCollapsed && <span className="ml-3 truncate text-sm">Config. Preaviso</span>}
            </Button>
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="p-4 border-t border-t-gray-700 ">
        <Button
          variant="ghost"
          className={`w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-700/30 ${
            isCollapsed ? 'px-2' : 'px-3'
          }`}
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && (
            <span className="ml-3">
              {isLoggingOut ? 'Cerrando...' : 'Cerrar Sesión'}
            </span>
          )}
        </Button>
      </div>
    </Card>
  )
}
