#!/usr/bin/env tsx

/**
 * Script para verificar la configuración de AWS S3
 * 
 * Uso: npx tsx scripts/verify-s3.ts
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

// Cargar .env antes de importar S3Client
loadEnvFile()

import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3'

async function verifyS3Config() {
  console.log('🔍 Verificando configuración de AWS S3...\n')

  // Verificar variables de entorno
  const requiredVars = {
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || process.env.OCR_S3_BUCKET,
  }

  console.log('📋 Variables de entorno:')
  let allVarsPresent = true
  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      if (key.includes('SECRET') || key.includes('KEY')) {
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
    console.log('   - AWS_REGION')
    console.log('   - AWS_ACCESS_KEY_ID')
    console.log('   - AWS_SECRET_ACCESS_KEY')
    console.log('   - AWS_S3_BUCKET (o OCR_S3_BUCKET)')
    process.exit(1)
  }

  console.log('\n🔐 Intentando conectar con AWS S3...')

  try {
    // Crear cliente S3
    const s3Client = new S3Client({
      region: requiredVars.AWS_REGION!,
      credentials: {
        accessKeyId: requiredVars.AWS_ACCESS_KEY_ID!,
        secretAccessKey: requiredVars.AWS_SECRET_ACCESS_KEY!,
      },
    })

    // Verificar que podemos listar buckets (prueba de credenciales)
    console.log('  → Verificando credenciales...')
    const listCommand = new ListBucketsCommand({})
    const listResponse = await s3Client.send(listCommand)
    console.log(`  ✅ Credenciales válidas. Cuenta: ${listResponse.Owner?.DisplayName || 'N/A'}`)

    // Verificar que el bucket existe y es accesible
    const bucketName = requiredVars.AWS_S3_BUCKET!
    console.log(`  → Verificando bucket: ${bucketName}...`)
    const headCommand = new HeadBucketCommand({ Bucket: bucketName })
    await s3Client.send(headCommand)
    console.log(`  ✅ Bucket "${bucketName}" existe y es accesible`)

    // Verificar permisos básicos
    console.log('\n📝 Verificando permisos...')
    console.log('  → Permisos básicos: ✅ (bucket accesible)')
    console.log('  ℹ️  Para verificar permisos completos (PUT, GET, DELETE), prueba subir un archivo desde la aplicación')

    console.log('\n✅ Configuración de S3 verificada correctamente!')
    console.log('\n📚 Próximos pasos:')
    console.log('   1. Asegúrate de que las variables estén en .env.local')
    console.log('   2. Reinicia el servidor de desarrollo si es necesario')
    console.log('   3. Prueba subir un documento desde la aplicación')

  } catch (error: any) {
    console.error('\n❌ Error verificando S3:')
    
    if (error.name === 'InvalidAccessKeyId') {
      console.error('   → AWS_ACCESS_KEY_ID inválido')
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.error('   → AWS_SECRET_ACCESS_KEY incorrecto')
    } else if (error.name === 'NoSuchBucket') {
      console.error(`   → El bucket "${requiredVars.AWS_S3_BUCKET}" no existe`)
      console.error('   → Verifica el nombre del bucket y la región')
    } else if (error.name === 'AccessDenied') {
      console.error('   → Acceso denegado al bucket')
      console.error('   → Verifica los permisos IAM del usuario')
    } else {
      console.error(`   → ${error.message || error}`)
    }

    console.error('\n💡 Solución:')
    console.error('   1. Verifica que las credenciales sean correctas')
    console.error('   2. Verifica que el bucket exista en la región correcta')
    console.error('   3. Verifica que el usuario IAM tenga permisos sobre el bucket')
    console.error('   4. Revisa la documentación en docs/S3_SETUP.md')

    process.exit(1)
  }
}

// Ejecutar verificación
verifyS3Config().catch((error) => {
  console.error('Error inesperado:', error)
  process.exit(1)
})

