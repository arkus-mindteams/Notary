#!/usr/bin/env tsx

/**
 * Script para verificar la configuración de Supabase
 * 
 * Uso: npx tsx scripts/verify-supabase.ts
 */

// Cargar variables de entorno desde .env manualmente
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile() {
  const envPaths = ['.env.local', '.env']
  for (const envPath of envPaths) {
    try {
      const fullPath = resolve(process.cwd(), envPath)
      const content = readFileSync(fullPath, 'utf-8')
      const lines = content.split('\n')
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '')
            if (!process.env[key]) {
              process.env[key] = value
            }
          }
        }
      }
      break
    } catch (error) {
      // Archivo no existe, continuar
    }
  }
}

// Cargar .env antes de importar Supabase
loadEnvFile()

import { createClient } from '@supabase/supabase-js'

async function verifySupabaseConfig() {
  console.log('🔍 Verificando configuración de Supabase...\n')

  // Verificar variables de entorno
  const requiredVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  console.log('📋 Variables de entorno:')
  let allVarsPresent = true
  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      if (key.includes('KEY') || key.includes('SECRET')) {
        console.log(`  ✅ ${key}: ${'*'.repeat(20)} (configurado)`)
      } else {
        console.log(`  ✅ ${key}: ${value}`)
      }
    } else {
      console.log(`  ❌ ${key}: NO CONFIGURADO`)
      allVarsPresent = false
    }
  }

  if (!allVarsPresent) {
    console.log('\n❌ Faltan variables de entorno. Por favor, configura:')
    console.log('   - NEXT_PUBLIC_SUPABASE_URL')
    console.log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY')
    console.log('   - SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log('\n🔐 Intentando conectar con Supabase...')

  try {
    // Probar cliente server-side
    console.log('  → Verificando cliente server-side...')
    const serverClient = createClient(
      requiredVars.NEXT_PUBLIC_SUPABASE_URL!,
      requiredVars.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Intentar una consulta simple para verificar conexión
    const { data, error } = await serverClient
      .from('compradores')
      .select('count')
      .limit(1)

    if (error && error.code !== 'PGRST116') {
      // PGRST116 es "no rows returned", que es válido si la tabla está vacía
      throw error
    }

    console.log('  ✅ Cliente server-side: OK')

    // Probar cliente client-side
    console.log('  → Verificando cliente client-side...')
    const clientClient = createClient(
      requiredVars.NEXT_PUBLIC_SUPABASE_URL!,
      requiredVars.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error: clientError } = await clientClient
      .from('compradores')
      .select('count')
      .limit(1)

    if (clientError && clientError.code !== 'PGRST116') {
      throw clientError
    }

    console.log('  ✅ Cliente client-side: OK')

    console.log('\n✅ Configuración de Supabase verificada correctamente!')
    console.log('\n📚 Próximos pasos:')
    console.log('   1. Asegúrate de ejecutar las migraciones SQL en Supabase')
    console.log('   2. Verifica que las tablas existan en tu proyecto')
    console.log('   3. Prueba crear un expediente desde la aplicación')

  } catch (error: any) {
    console.error('\n❌ Error verificando Supabase:')
    
    if (error.message?.includes('Invalid API key')) {
      console.error('   → Las credenciales de Supabase son inválidas')
    } else if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      console.error('   → Las tablas no existen. Ejecuta las migraciones SQL primero.')
      console.error('   → Archivo de migración: supabase/migrations/001_create_expedientes_tables.sql')
    } else {
      console.error(`   → ${error.message || error}`)
    }

    console.error('\n💡 Solución:')
    console.error('   1. Verifica que las credenciales sean correctas')
    console.error('   2. Ejecuta las migraciones SQL en Supabase')
    console.error('   3. Verifica que el proyecto de Supabase esté activo')

    process.exit(1)
  }
}

// Ejecutar verificación
verifySupabaseConfig().catch((error) => {
  console.error('Error inesperado:', error)
  process.exit(1)
})

