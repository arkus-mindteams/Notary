import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtectedRoute } from "@/components/protected-route"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Save, Settings, FileText, AlertCircle, CheckCircle2, Loader2, BarChart3 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatsDashboard } from "@/components/stats-dashboard"
import { useAuth } from "@/lib/auth-context"

interface RulesData {
  notarial: {
    version: string
    lastUpdated: string
    rules: string
  }
}

export default function SettingsPage() {
  const [rules, setRules] = useState<RulesData | null>(null)
  const [notarialRules, setNotarialRules] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"success" | "error" | null>(null)
  const [saveMessage, setSaveMessage] = useState("")
  const { user } = useAuth()

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/rules")
      if (!response.ok) throw new Error("Failed to load rules")
      const data: RulesData = await response.json()
      setRules(data)
      setNotarialRules(data.notarial?.rules || "")
    } catch (error) {
      console.error("Error loading rules:", error)
      setSaveStatus("error")
      setSaveMessage("Error al cargar las reglas. Por favor, recarga la página.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveStatus(null)

      const response = await fetch("/api/rules", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notarial: {
            version: rules?.notarial.version || "1.0.0",
            rules: notarialRules,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to save rules")
      }

      const result = await response.json()
      setRules(result.rules)
      setSaveStatus("success")
      setSaveMessage("Reglas guardadas correctamente.")

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveStatus(null)
        setSaveMessage("")
      }, 3000)
    } catch (error) {
      console.error("Error saving rules:", error)
      setSaveStatus("error")
      setSaveMessage(error instanceof Error ? error.message : "Error al guardar las reglas.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="p-6 flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    )
  }

  const isSuperAdmin = user?.role === 'superadmin'

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Settings className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
            </div>
            <p className="text-gray-600">
              Gestiona las reglas y configuraciones del sistema.
            </p>
          </div>

          <Tabs defaultValue="reglas" className="space-y-6">
            <TabsList>
              <TabsTrigger value="reglas" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Reglas de Notariales
              </TabsTrigger>
              {isSuperAdmin && (
                <TabsTrigger value="stats" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Estadísticas de Uso
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="reglas" className="space-y-6">
              {/* Save Status Alert */}
              {saveStatus && (
                <Alert
                  className={
                    saveStatus === "success"
                      ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                      : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                  }
                >
                  {saveStatus === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                  <AlertDescription
                    className={
                      saveStatus === "success"
                        ? "text-green-800 dark:text-green-300"
                        : "text-red-800 dark:text-red-300"
                    }
                  >
                    {saveMessage}
                  </AlertDescription>
                </Alert>
              )}

              {/* Rules Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Reglas de Generación
                  </CardTitle>
                  <CardDescription>
                    Edita las reglas que utiliza la IA para procesar documentos. Los cambios se aplicarán en las próximas generaciones.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Nota informativa sobre reglas de colindancias */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Reglas de Colindancias
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Las reglas para la extracción de colindancias son internas del sistema y no son modificables. Estas reglas están optimizadas para garantizar la precisión en la extracción de datos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Notarial Rules */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notarial-rules" className="text-base font-semibold">
                        Reglas para Generación de Texto Notarial
                      </Label>
                      {rules?.notarial.lastUpdated && (
                        <span className="text-xs text-muted-foreground">
                          Última actualización: {new Date(rules.notarial.lastUpdated).toLocaleString("es-MX")}
                        </span>
                      )}
                    </div>
                    <Textarea
                      id="notarial-rules"
                      value={notarialRules}
                      onChange={(e) => setNotarialRules(e.target.value)}
                      placeholder="Ingresa las reglas para la generación del texto notarial..."
                      className="min-h-[400px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Estas reglas definen cómo la IA transforma las colindancias en texto notarial formal.
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Guardar Cambios
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {isSuperAdmin && (
              <TabsContent value="stats">
                <StatsDashboard />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}

