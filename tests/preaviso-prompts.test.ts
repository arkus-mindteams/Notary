import test from 'node:test'
import assert from 'node:assert/strict'
import { PreavisoPrompts } from '@/lib/tramites/plugins/preaviso/preaviso-prompts'

test('generateUserPrompt incluye faltante prioritario y resumen detectado', () => {
  const prompt = PreavisoPrompts.generateUserPrompt(
    {
      inmueble: { folio_real: '1782486' },
      compradores: [{ persona_fisica: { nombre: 'Juan Perez', estado_civil: 'casado', conyuge: { nombre: 'Ana Lopez' } } }],
      vendedores: [{ persona_fisica: { nombre: 'Maria Ruiz' } }],
      creditos: [{ institucion: 'BBVA' }]
    },
    [{ role: 'user', content: 'hola' }],
    ['gravamenes[0].institucion'],
    true,
    false,
    []
  )

  assert.ok(prompt.includes('Dato prioritario a resolver: gravamenes[0].institucion'))
  assert.ok(prompt.includes('Folio real: 1782486'))
  assert.ok(prompt.includes('Comprador: Juan Perez'))
  assert.ok(prompt.includes('Institución de crédito: BBVA'))
})
