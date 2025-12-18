"use client"

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase'
import { useMemo } from 'react'

interface PreavisoConfig {
  id: string
  prompt: string
  json_schema: Record<string, any>
  created_at: string
  updated_at: string
}

export default function AdminPreavisoConfigPage() {
  const { user: currentUser, session } = useAuth()
  const supabase = useMemo(() => createBrowserClient(), [])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [config, setConfig] = useState<PreavisoConfig | null>(null)
  const [prompt, setPrompt] = useState('')
  const [jsonSchema, setJsonSchema] = useState('')

  // Verificar que sea superadmin
  useEffect(() => {
    if (currentUser && currentUser.role !== 'superadmin') {
      window.location.href = '/dashboard'
    }
  }, [currentUser])

  // Cargar datos
  useEffect(() => {
    if (currentUser?.role === 'superadmin' && session) {
      loadConfig()
    }
  }, [currentUser, session])

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

  if (currentUser?.role !== 'superadmin') {
    return null
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuración de Preaviso</h1>
          <p className="text-gray-600 mt-1">Edita el prompt maestro y el JSON schema canónico</p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">Cargando...</div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Prompt */}
            <Card>
              <CardHeader>
                <CardTitle>Prompt Maestro</CardTitle>
                <CardDescription>
                  Instrucciones que seguirá la IA durante el proceso de captura del preaviso
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt del Sistema</Label>
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="Ingresa el prompt maestro..."
                  />
                </div>
              </CardContent>
            </Card>

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
              <Button onClick={handleSave} disabled={isSaving} size="lg">
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
  )
}

