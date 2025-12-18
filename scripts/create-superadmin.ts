#!/usr/bin/env tsx
/**
 * Script para crear el primer usuario superadmin
 * 
 * Uso:
 *   npx tsx scripts/create-superadmin.ts <email> <password> <nombre>
 * 
 * Ejemplo:
 *   npx tsx scripts/create-superadmin.ts admin@notaria.com Admin123! "Admin Principal"
 */

import { createServerClient } from '../lib/supabase'
import { UsuarioService } from '../lib/services/usuario-service'

async function createSuperadmin() {
  const args = process.argv.slice(2)

  if (args.length < 3) {
    console.error('❌ Error: Faltan argumentos')
    console.log('\nUso:')
    console.log('  npx tsx scripts/create-superadmin.ts <email> <password> <nombre> [apellido_paterno] [apellido_materno] [telefono]')
    console.log('\nEjemplo:')
    console.log('  npx tsx scripts/create-superadmin.ts admin@notaria.com Admin123! "Admin Principal"')
    process.exit(1)
  }

  const [email, password, nombre, apellidoPaterno, apellidoMaterno, telefono] = args

  try {
    console.log('🔐 Creando usuario superadmin...')
    console.log(`   Email: ${email}`)
    console.log(`   Nombre: ${nombre}`)

    // Verificar que no exista ya un superadmin
    const supabase = createServerClient()
    const { data: existingUsers } = await supabase
      .from('usuarios')
      .select('id, email')
      .eq('rol', 'superadmin')
      .eq('activo', true)

    if (existingUsers && existingUsers.length > 0) {
      console.log('\n⚠️  Advertencia: Ya existe al menos un superadmin activo:')
      existingUsers.forEach(u => console.log(`   - ${u.email}`))
      console.log('\n¿Deseas continuar de todas formas? (s/n)')
      
      // En modo no interactivo, continuar
      // En modo interactivo, se podría usar readline
    }

    // Crear el usuario
    const usuario = await UsuarioService.createUsuario({
      email,
      password,
      nombre,
      apellido_paterno: apellidoPaterno,
      apellido_materno: apellidoMaterno,
      telefono,
      rol: 'superadmin',
      notaria_id: null, // Superadmin no tiene notaría
    })

    console.log('\n✅ Usuario superadmin creado exitosamente!')
    console.log(`   ID: ${usuario.id}`)
    console.log(`   Email: ${usuario.email}`)
    console.log(`   Nombre: ${usuario.nombre} ${usuario.apellido_paterno || ''} ${usuario.apellido_materno || ''}`.trim())
    console.log(`   Rol: ${usuario.rol}`)
    console.log('\n🎉 Ya puedes iniciar sesión con estas credenciales!')
  } catch (error: any) {
    console.error('\n❌ Error creando superadmin:', error.message)
    
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      console.error('\n💡 El email ya está registrado. Usa otro email o elimina el usuario existente.')
    }
    
    if (error.message.includes('password')) {
      console.error('\n💡 La contraseña debe tener al menos 6 caracteres.')
    }
    
    process.exit(1)
  }
}

createSuperadmin()

