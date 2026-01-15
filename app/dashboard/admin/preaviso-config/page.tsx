"use client"

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ProtectedRoute } from '@/components/protected-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save, Loader2, Info } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface PreavisoConfig {
  id: string
  prompt: string
  json_schema: Record<string, any>
  created_at: string
  updated_at: string
}

export default function AdminPreavisoConfigPage() {
  const { user: currentUser, session, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = useMemo(() => createBrowserClient(), [])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [config, setConfig] = useState<PreavisoConfig | null>(null)
  const [prompt, setPrompt] = useState('')
  const [jsonSchema, setJsonSchema] = useState('')
  const hasLoadedDataRef = useRef(false)

  // Verificar que sea superadmin (solo después de que el usuario esté cargado)
  useEffect(() => {
    if (!authLoading && currentUser && currentUser.role !== 'superadmin') {
      router.push('/dashboard')
    }
  }, [currentUser, authLoading, router])

  // Cargar datos (montaje inicial, remount, o cambio de usuario/sesión)
  useEffect(() => {
    if (!authLoading && currentUser?.role === 'superadmin' && session) {
      // Si el config está vacío (remount), necesitamos cargar
      const configEmpty = !config
      
      // Cargar si es la primera vez o si el config está vacío (remount)
      if (!hasLoadedDataRef.current || configEmpty) {
        loadConfig()
        hasLoadedDataRef.current = true
      }
    } else {
      // Resetear el ref si no hay sesión o no es superadmin
      hasLoadedDataRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, session, authLoading])

  const loadConfig = async () => {
    try {
      setIsLoading(true)
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        throw new Error('No hay sesión')
      }

      const response = await fetch('/api/admin/preaviso-config', {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Error cargando configuración')
      }

      const data = await response.json()
      setConfig(data)
      setPrompt(data.prompt || '')
      setJsonSchema(JSON.stringify(data.json_schema || {}, null, 2))
    } catch (error: any) {
      toast.error('Error cargando configuración', { description: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        toast.error('No hay sesión activa')
        return
      }

      // Validar JSON schema
      let parsedJsonSchema
      try {
        parsedJsonSchema = JSON.parse(jsonSchema)
      } catch (error) {
        toast.error('JSON Schema inválido', { description: 'Por favor, verifica que el JSON esté bien formado' })
        return
      }

      const response = await fetch('/api/admin/preaviso-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({
          prompt,
          json_schema: parsedJsonSchema,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Error guardando configuración')
      }

      const updated = await response.json()
      setConfig(updated)
      toast.success('Configuración guardada correctamente')
    } catch (error: any) {
      toast.error('Error', { description: error.message })
    } finally {
      setIsSaving(false)
    }
  }

  // Mostrar loading mientras se verifica autenticación o rol
  if (authLoading || !currentUser) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6">
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Verificando permisos...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  // Verificar rol después de que el usuario esté cargado
  if (currentUser.role !== 'superadmin') {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 space-y-6">
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <p className="text-muted-foreground">No tienes permisos para acceder a esta sección.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuración del Preaviso</h1>
          <p className="text-gray-600 mt-1">Ajusta las instrucciones y la estructura que usará la IA para capturar la información.</p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
              <span className="text-gray-500">Cargando…</span>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Prompt */}
            <div>
              <div className="flex items-center gap-2 font-medium ">
                Prompt del sistema
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 cursor-pointer text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Instrucciones que seguirá la IA durante el proceso de captura del preaviso
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="Ingresa el prompt maestro..."
                  />
                </div>
              </div>
            </div>

            {/* JSON Schema */}
            <Card>
              <CardHeader>
                <CardTitle>JSON Schema Canónico</CardTitle>
                <CardDescription>
                  Estructura JSON que debe seguir la respuesta de la IA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="json_schema">Schema JSON</Label>
                  <Textarea
                    id="json_schema"
                    value={jsonSchema}
                    onChange={(e) => setJsonSchema(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder='{"schema_version": "1.1", ...}'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Botón Guardar */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={isSaving} className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}

