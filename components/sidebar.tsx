"use client"

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import Image from 'next/image'
import {
  FileText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FolderOpen,
  Settings,
  Users,
  FileCode,
  HomeIcon,
  Menu,
  Activity,
} from 'lucide-react'

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
  onNavigate?: () => void
  isMobile?: boolean
}

export function Sidebar({ isCollapsed, onToggle, onNavigate, isMobile = false }: SidebarProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogoutClick = () => {
    setShowLogoutDialog(true)
  }

  const handleConfirmLogout = async () => {
    setShowLogoutDialog(false)
    setIsLoggingOut(true)
    try {
      await logout()
      // Usar window.location para forzar una navegación completa
      // Esto asegura que todo el estado se limpie correctamente
      window.location.href = '/login'
    } catch (error) {
      console.error('Error en logout:', error)
      // Redirigir incluso si hay error usando window.location
      window.location.href = '/login'
    }
    // No necesitamos finally porque window.location causa una navegación completa
  }

  const handleNavigation = (path: string) => {
    router.push(path)
    // Close mobile sidebar after navigation
    if (onNavigate) {
      onNavigate()
    }
  }

  return (
    <div className={`${isMobile ? (isCollapsed ? 'h-16' : 'h-screen') : 'h-full'} flex ${isMobile && isCollapsed ? 'pt-0' : 'pt-2'} bg-gray-800 border-none ${isMobile ? 'rounded-none' : 'rounded-l-none rounded-b-none'} flex-col transition-all duration-300 w-full ${isMobile && !isCollapsed ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      {/* Header con Usuario y Notaría */}
      <div className={`bg-gray-800 ${isMobile && isCollapsed ? 'border-b-0' : 'border-b border-b-gray-700'}`}>
        {/* Sección Notaría */}
        <div className={`${isMobile && isCollapsed ? 'px-4 py-3' : isMobile ? 'px-4 py-3' : 'px-4'}`}>
          <div
            className={`
              flex items-center justify-between
              ${isCollapsed && !isMobile ? "flex-col gap-2" : "flex-row"}
            `}
          >
            {/* Logo */}
            <div
              className={`
                relative
                ${isCollapsed && !isMobile ? "w-12 h-12" : isMobile ? "h-10 flex-1 max-w-[200px]" : "w-full h-16 mr-2 flex-1"}
              `}
            >
              <Image
                src={isCollapsed && !isMobile ? "/logo.png" : "/notaria-logo-removebg-preview.png"}
                alt="Notaría #3"
                fill
                className={isMobile ? "object-contain object-left" : "object-contain"}
              />
            </div>

            {/* Botón de toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="
                h-8 w-8 p-0 flex-shrink-0
                text-gray-400
                hover:bg-gray-700 hover:text-gray-200
                cursor-pointer
                focus-visible:ring-0
              "
            >
              {isMobile ? (
                <Menu className="h-5 w-5" />
              ) : (
                isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )
              )}
            </Button>
          </div>
        </div>


        {/* Sección Usuario */}
        {user && !isCollapsed && (
          <div className={`${isMobile ? 'p-3' : 'p-4 pb-3 pt-6'}`}>
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
                    {user.role === 'superadmin' ? 'Administrador' : user.role}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className={`${isMobile ? '' : 'flex-1'} ${isMobile && isCollapsed ? 'hidden' : 'p-4 space-y-2'}`}>
        <Button
          variant="ghost"
          className={`w-full justify-start overflow-hidden ${isCollapsed ? 'px-2' : 'px-3'
            } ${pathname === '/dashboard/deslinde?reset=1' || pathname === '/dashboard/deslinde'
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
          className={`w-full justify-start overflow-hidden ${isCollapsed ? 'px-2' : 'px-3'
            } ${pathname === '/dashboard/preaviso'
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
          className={`w-full justify-start overflow-hidden ${isCollapsed ? 'px-2' : 'px-3'
            } ${pathname === '/dashboard/expedientes'
              ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          onClick={() => handleNavigation('/dashboard/expedientes')}
        >
          <FolderOpen className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3 truncate text-sm">Expedientes</span>}
        </Button>


        {/* Separator and Configuración (Hover Menu) - Superadmin Only */}
        {user?.role === 'superadmin' && (
          <>
            <div className="my-2 border-t border-gray-700 mx-4" />
            <HoverCard openDelay={0} closeDelay={200}>
              <HoverCardTrigger asChild>
                <div className="w-full">
                  <Button
                    variant="ghost"
                    className={`w-full justify-start overflow-hidden ${isCollapsed ? 'px-2' : 'px-3'
                      } ${pathname.startsWith('/dashboard/settings') || pathname.startsWith('/dashboard/admin')
                        ? 'bg-gray-600 text-gray-200 hover:bg-gray-700'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    onClick={() => handleNavigation('/dashboard/settings')}
                  >
                    <Settings className="h-4 w-4 flex-shrink-0" />
                    {!isCollapsed && (
                      <div className="flex flex-1 items-center justify-between ml-3">
                        <span className="truncate text-sm">Configuración</span>
                        <ChevronRight className="h-3 w-3 opacity-50" />
                      </div>
                    )}
                  </Button>
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-56 bg-gray-800 border-gray-700 p-2 shadow-xl z-50">
                <div className="space-y-1">
                  {/* Header */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Opciones
                  </div>

                  {/* General Settings */}
                  <Button
                    variant="ghost"
                    className={`w-full justify-start h-9 px-2 text-sm ${pathname === '/dashboard/settings' && !window.location.search.includes('tab=stats')
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    onClick={() => handleNavigation('/dashboard/settings')}
                  >
                    <div className="flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span>
                      Reglas de Texto Notarial
                    </div>
                  </Button>

                  <Button
                    variant="ghost"
                    className={`w-full justify-start h-9 px-2 text-sm ${pathname === '/dashboard/settings/stats'
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    onClick={() => handleNavigation('/dashboard/settings/stats')}
                  >
                    <div className="flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2"></span>
                      Estadísticas de uso
                    </div>
                  </Button>

                  <div className="my-1 border-t border-gray-700" />

                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Administración
                  </div>

                  <Button
                    variant="ghost"
                    className={`w-full justify-start h-9 px-2 text-sm ${pathname === '/dashboard/admin/usuarios'
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    onClick={() => handleNavigation('/dashboard/admin/usuarios')}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Usuarios
                  </Button>

                  <Button
                    variant="ghost"
                    className={`w-full justify-start h-9 px-2 text-sm ${pathname === '/dashboard/admin/preaviso-config'
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    onClick={() => handleNavigation('/dashboard/admin/preaviso-config')}
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    Config. Preaviso
                  </Button>

                  <Button
                    variant="ghost"
                    className={`w-full justify-start h-9 px-2 text-sm ${pathname === '/dashboard/admin/usage'
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      }`}
                    onClick={() => handleNavigation('/dashboard/admin/usage')}
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    Consumo AI
                  </Button>
                </div>
              </HoverCardContent>
            </HoverCard>
          </>
        )}
      </div>

      {/* Logout */}
      <div className={`${isMobile && isCollapsed ? 'hidden' : 'p-4'} border-t border-t-gray-700`}>
        <Button
          variant="ghost"
          className={`w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-700/30 ${isCollapsed ? 'px-2' : 'px-3'
            }`}
          onClick={handleLogoutClick}
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

      {/* Dialog de confirmación de logout */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas cerrar sesión? Tendrás que iniciar sesión nuevamente para acceder al sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLogoutDialog(false)}
              disabled={isLoggingOut}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? 'Cerrando...' : 'Cerrar Sesión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
