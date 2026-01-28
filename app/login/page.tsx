"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  
  const { login, user, session, isLoading: authLoading } = useAuth()
  const router = useRouter()

  // Redirigir si el usuario ya está autenticado
  useEffect(() => {
    if (!authLoading && session && user) {
      router.replace('/dashboard/deslinde')
    }
  }, [session, user, authLoading, router])

  // Si el login fue exitoso pero después de 3 segundos no se cargó el usuario,
  // redirigir de todas formas (el ProtectedRoute manejará la carga)
  useEffect(() => {
    if (loginSuccess && !user && session) {
      const timeout = setTimeout(() => {
        router.replace('/dashboard/deslinde')
        setIsLoading(false)
      }, 3000)
      return () => clearTimeout(timeout)
    }
    // Si el usuario se carga, limpiar el estado de loginSuccess
    if (loginSuccess && user) {
      setLoginSuccess(false)
      setIsLoading(false)
    }
  }, [loginSuccess, user, session, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    setLoginSuccess(false)

    try {
      const success = await login(email, password)
      if (!success) {
        setError('Credenciales incorrectas. Por favor, verifique su email y contraseña.')
        setIsLoading(false)
      } else {
        setLoginSuccess(true)
        // Si el login es exitoso, el useEffect se encargará de la redirección
        // cuando user y session estén disponibles
      }
    } catch (error) {
      setError('Error al iniciar sesión. Por favor, intente nuevamente.')
      setIsLoading(false)
      setLoginSuccess(false)
    }
  }

  // Mostrar loading mientras se verifica la sesión
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Verificando sesión...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Si ya hay sesión, no mostrar el formulario (el useEffect redirigirá)
  if (session) {
    return null
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mitad gris */}
      <div className="hidden lg:flex lg:w-1/3 relative min-h-screen bg-gradient-to-br from-gray-800 via-gray-900 to-black">
        {/* Logo esquina superior izquierda */}
        <div className="absolute top-6 left-6">
          <Image
            src="/logo.png"
            alt="Logo Notaría"
            width={50}
            height={50}
            className="object-contain"
            priority
          />
        </div>
        <div className="flex items-center justify-center h-full px-6 text-end">
          <Label className="text-2xl lg:text-4xl font-bold text-white mb-[400px]">
            Sistema de Gestión Notarial
          </Label>
        </div>
      </div>

      {/* Logo móvil - solo visible en pantallas pequeñas */}
      <div className="lg:hidden absolute top-4 left-4 z-10">
        <Image
          src="/logo.png"
          alt="Logo Notaría"
          width={40}
          height={40}
          className="object-contain"
          priority
        />
      </div>

      <div className="w-full lg:w-2/3 flex bg-gray-900">
        <Card className="w-full min-h-screen rounded-none lg:rounded-l-[30px] lg:rounded-r-none">
          <CardHeader className="text-center p-0">
            {/* Logo */}
            <div className="w-full h-32 sm:h-40 md:h-48 relative items-center justify-center flex mt-6 sm:mt-8 md:mt-10">
             <Image
                src="/notaria-logo-black.png"
                alt="Logo Notaría"
                width={400}
                height={150}
                className="object-contain object-center w-[280px] sm:w-[320px] md:w-[400px]"
                priority
              />
            </div>
            <div className="px-4 sm:px-6">
              <CardTitle className="text-xl sm:text-2xl font-bold text-gray-800">
                Bienvenido
              </CardTitle>
              <CardDescription className="text-sm sm:text-base text-gray-600">
                Ingresa tus credenciales para acceder a tu cuenta
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 px-4 sm:px-8 md:px-14 pt-6 sm:pt-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Campo Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 sm:h-12"
                    placeholder="abogado@notaria.com"
                    required
                  />
                </div>
              </div>

              {/* Campo Contraseña */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 sm:h-12"
                    placeholder="********"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              {/* Botón de Login */}
              <Button
                type="submit"
                className="w-full h-11 sm:h-12 bg-gray-800 hover:bg-gray-900 text-white font-bold py-2.5 text-sm sm:text-base"
                disabled={isLoading}
              >
                {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>

            {/* Enlace de recuperación */}
             {/* <div className="text-center">
              <a
                href="#"
                className="text-sm text-gray-800 hover:text-gray-900 hover:underline"
              >
                ¿Olvidó su contraseña?
              </a>
            </div>*/}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
