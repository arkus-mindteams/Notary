"use client"

import { useState, useEffect, useRef } from 'react'
import { Sidebar } from './sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useIsTablet } from '@/hooks/use-tablet'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarCollapsed, setMobileSidebarCollapsed] = useState(true)
  const hasInitialized = useRef(false)

  // Inicializar sidebar cerrado en mobile y tablet (solo una vez al montar)
  useEffect(() => {
    if (!hasInitialized.current && (isMobile || isTablet)) {
      setSidebarCollapsed(true)
      hasInitialized.current = true
    }
  }, [isMobile, isTablet])

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const toggleMobileSidebar = () => {
    setMobileSidebarCollapsed(!mobileSidebarCollapsed)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <div className={`hidden md:block transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}>
          <Sidebar 
            isCollapsed={sidebarCollapsed} 
            onToggle={toggleSidebar}
            onNavigate={undefined}
            isMobile={false}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full md:w-auto">
        {/* Mobile Sidebar (Fixed Header) */}
        {isMobile && (
          <>
            {/* Overlay cuando está expandido */}
            {!mobileSidebarCollapsed && (
              <div 
                className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
                onClick={toggleMobileSidebar}
              />
            )}
            <div className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 shadow-lg">
              <Sidebar 
                isCollapsed={mobileSidebarCollapsed} 
                onToggle={toggleMobileSidebar}
                onNavigate={undefined}
                isMobile={true}
              />
            </div>
          </>
        )}

        {/* Spacer for mobile header */}
        {isMobile && (
          <div className={`transition-all duration-300 flex-shrink-0 ${
            mobileSidebarCollapsed ? 'h-16' : 'h-screen'
          }`} />
        )}

        <main className={`flex-1 overflow-auto ${isMobile && !mobileSidebarCollapsed ? 'pointer-events-none' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  )
}

