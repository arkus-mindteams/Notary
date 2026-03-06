import test from 'node:test'
import assert from 'node:assert/strict'
import { requireCapability } from '@/lib/authz/requireCapability'
import type { AuthContext } from '@/lib/auth/authContext'
import type { Capability } from '@/lib/authz/capabilities'

const ctxActiveNotario: AuthContext = {
  userId: 'user-1',
  role: 'notario',
  status: 'ACTIVE',
  notaryOfficeId: 'notaria-1',
  capabilities: ['ADMIN_USERS_VIEW', 'ADMIN_USERS_INVITE', 'LAWYER_SUPPORTS_EDIT'] as Capability[],
}

const ctxSuspended: AuthContext = {
  ...ctxActiveNotario,
  status: 'SUSPENDED',
}

const ctxWithoutCapability: AuthContext = {
  ...ctxActiveNotario,
  role: 'abogado',
  capabilities: ['CASE_VIEW_OWN', 'DOCUMENT_UPLOAD'] as Capability[],
}

test('requireCapability devuelve 401 cuando ctx es null', async () => {
  const res = requireCapability(null, 'ADMIN_USERS_VIEW')
  assert.ok(res !== null)
  assert.equal(res?.status, 401)
  const json = await res!.json()
  assert.equal(json?.ok, false)
  assert.equal(json?.error?.code, 'UNAUTHORIZED')
  assert.ok(typeof json?.error?.message === 'string')
})

test('requireCapability devuelve 403 cuando status no es ACTIVE', async () => {
  const res = requireCapability(ctxSuspended, 'ADMIN_USERS_VIEW')
  assert.ok(res !== null)
  assert.equal(res?.status, 403)
  const json = await res!.json()
  assert.equal(json?.ok, false)
  assert.equal(json?.error?.code, 'FORBIDDEN')
  assert.equal(json?.error?.details?.required_status, 'ACTIVE')
})

test('requireCapability devuelve 403 cuando falta la capability', async () => {
  const res = requireCapability(ctxWithoutCapability, 'ADMIN_USERS_VIEW')
  assert.ok(res !== null)
  assert.equal(res?.status, 403)
  const json = await res!.json()
  assert.equal(json?.ok, false)
  assert.equal(json?.error?.code, 'FORBIDDEN')
  assert.equal(json?.error?.details?.required_capability, 'ADMIN_USERS_VIEW')
})

test('requireCapability devuelve null cuando ctx tiene status ACTIVE y la capability', () => {
  const res = requireCapability(ctxActiveNotario, 'ADMIN_USERS_VIEW')
  assert.equal(res, null)
})

test('requireCapability devuelve null para LAWYER_SUPPORTS_EDIT cuando el ctx la tiene', () => {
  const res = requireCapability(ctxActiveNotario, 'LAWYER_SUPPORTS_EDIT')
  assert.equal(res, null)
})

test('error shape incluye ok, error.code, error.message, error.details', async () => {
  const res = requireCapability(null, 'ADMIN_NOTARIAS')
  assert.ok(res !== null)
  const json = await res!.json()
  assert.equal(json?.ok, false)
  assert.ok('error' in json)
  assert.ok('code' in json.error)
  assert.ok('message' in json.error)
  assert.ok('details' in json.error)
})
