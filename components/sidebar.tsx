"use client"

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  FileText,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
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
    // Simular delay de logout
    await new Promise(resolve => setTimeout(resolve, 500))
    logout()
    router.push('/login')
    setIsLoggingOut(false)
  }

  const handleNavigation = (path: string) => {
    router.push(path)
  }

  return (
    <Card className={`h-full flex flex-col transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Header con Usuario y Notaría */}
      <div className="border-b">
        {/* Sección Usuario */}
        {!isCollapsed && user && (
          <div className="p-4 pb-3 border-b">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-medium text-blue-600">
                  {user.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.name}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sección Notaría */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-gray-900">Notaría #3</h2>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-8 w-8 p-0"
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <div className="flex-1 p-4 space-y-2">
        <Button
          variant={pathname === '/dashboard/deslinde?reset=1' || pathname === '/dashboard/deslinde' ? 'default' : 'ghost'}
          className={`w-full justify-start overflow-hidden ${
            isCollapsed ? 'px-2' : 'px-3'
          } ${
            pathname === '/dashboard/deslinde?reset=1' || pathname === '/dashboard/deslinde'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          }`}
          onClick={() => handleNavigation('/dashboard/deslinde?reset=1')}
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span className="ml-3 truncate text-sm">Lectura de Plantas Arquitectónicas</span>}
        </Button>
      </div>

      {/* Logout */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className={`w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 ${
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
